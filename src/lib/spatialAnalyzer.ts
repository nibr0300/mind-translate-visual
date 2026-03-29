/**
 * Spatial Layout Analyzer
 * 
 * Extracts text positions from PDF pages and detects spatial clusters
 * (e.g., boxes/nodes in flowcharts and diagrams). Spatial proximity
 * is used to group text items that belong together visually.
 */

import * as pdfjsLib from "pdfjs-dist";

export interface SpatialTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

export interface SpatialGroup {
  items: SpatialTextItem[];
  text: string;
  centroid: { x: number; y: number };
  /** Normalized position [0..1] within the page */
  normPos: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  pageIndex: number;
}

/** Extract text items with their positions from all pages */
export async function extractSpatialText(
  file: File
): Promise<SpatialTextItem[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const items: SpatialTextItem[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      const typedItem = item as any;
      const tx = typedItem.transform;
      // transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
      if (!tx || tx.length < 6) continue;

      items.push({
        text: typedItem.str.trim(),
        x: tx[4],
        y: viewport.height - tx[5], // flip Y so top=0
        width: typedItem.width || 0,
        height: Math.abs(tx[3]) || 12,
        pageIndex: i - 1,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });
    }
  }

  return items;
}

/**
 * Group spatially proximate text items using distance-based clustering.
 * Items within `threshold` (fraction of page diagonal) are merged.
 */
export function detectSpatialGroups(
  items: SpatialTextItem[],
  threshold = 0.04
): SpatialGroup[] {
  if (items.length === 0) return [];

  // Group by page first
  const byPage = new Map<number, SpatialTextItem[]>();
  items.forEach((item) => {
    const arr = byPage.get(item.pageIndex) || [];
    arr.push(item);
    byPage.set(item.pageIndex, arr);
  });

  const allGroups: SpatialGroup[] = [];

  for (const [pageIndex, pageItems] of byPage) {
    const pw = pageItems[0].pageWidth;
    const ph = pageItems[0].pageHeight;
    const diag = Math.sqrt(pw * pw + ph * ph);
    const distThreshold = threshold * diag;

    // Union-Find clustering
    const parent = pageItems.map((_, i) => i);
    const find = (i: number): number =>
      parent[i] === i ? i : (parent[i] = find(parent[i]));
    const union = (a: number, b: number) => {
      parent[find(a)] = find(b);
    };

    // Compute pairwise distances and merge close items
    for (let i = 0; i < pageItems.length; i++) {
      for (let j = i + 1; j < pageItems.length; j++) {
        const a = pageItems[i];
        const b = pageItems[j];
        // Use edge-to-edge distance considering item width/height
        const ax = a.x + a.width / 2;
        const ay = a.y + a.height / 2;
        const bx = b.x + b.width / 2;
        const by = b.y + b.height / 2;
        const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
        if (dist < distThreshold) {
          union(i, j);
        }
      }
    }

    // Collect groups
    const groupMap = new Map<number, SpatialTextItem[]>();
    for (let i = 0; i < pageItems.length; i++) {
      const root = find(i);
      const arr = groupMap.get(root) || [];
      arr.push(pageItems[i]);
      groupMap.set(root, arr);
    }

    for (const groupItems of groupMap.values()) {
      // Sort items top-to-bottom, left-to-right for natural reading order
      groupItems.sort((a, b) => a.y - b.y || a.x - b.x);

      const text = groupItems.map((it) => it.text).join(" ");
      if (text.length < 3) continue; // skip tiny fragments

      const cx = groupItems.reduce((s, it) => s + it.x + it.width / 2, 0) / groupItems.length;
      const cy = groupItems.reduce((s, it) => s + it.y + it.height / 2, 0) / groupItems.length;

      const minX = Math.min(...groupItems.map((it) => it.x));
      const minY = Math.min(...groupItems.map((it) => it.y));
      const maxX = Math.max(...groupItems.map((it) => it.x + it.width));
      const maxY = Math.max(...groupItems.map((it) => it.y + it.height));

      allGroups.push({
        items: groupItems,
        text,
        centroid: { x: cx, y: cy },
        normPos: { x: cx / pw, y: cy / ph },
        bounds: { minX, minY, maxX, maxY },
        pageIndex,
      });
    }
  }

  return allGroups;
}

/**
 * Determine if the document likely contains diagrams/flowcharts
 * based on spatial distribution patterns.
 */
export function detectDiagramLayout(groups: SpatialGroup[]): {
  isDiagram: boolean;
  confidence: number;
} {
  if (groups.length < 3) return { isDiagram: false, confidence: 0 };

  // Diagram heuristics:
  // 1. Many small, evenly-distributed text groups (vs few large paragraphs)
  const avgTextLen = groups.reduce((s, g) => s + g.text.length, 0) / groups.length;
  const shortGroupRatio = groups.filter((g) => g.text.length < 80).length / groups.length;

  // 2. Groups spread across the page (not just a single column)
  const xPositions = groups.map((g) => g.normPos.x);
  const xSpread = Math.max(...xPositions) - Math.min(...xPositions);

  // 3. Multiple vertical levels (not just top-to-bottom paragraphs)
  const yPositions = groups.map((g) => g.normPos.y);
  const uniqueYLevels = new Set(yPositions.map((y) => Math.round(y * 10))).size;
  const yLevelRatio = uniqueYLevels / Math.max(groups.length, 1);

  let confidence = 0;
  if (shortGroupRatio > 0.6) confidence += 0.3;
  if (avgTextLen < 60) confidence += 0.2;
  if (xSpread > 0.4) confidence += 0.25;
  if (yLevelRatio > 0.3) confidence += 0.25;

  return {
    isDiagram: confidence >= 0.5,
    confidence: Math.min(1, confidence),
  };
}
