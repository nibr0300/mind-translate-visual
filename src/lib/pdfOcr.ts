import * as pdfjsLib from "pdfjs-dist";
import type { SpatialGroup } from "./spatialAnalyzer";

export interface OcrExtractionResult {
  textUnits: string[];
  spatialGroups: SpatialGroup[];
}

function normalizeTextUnit(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isUsefulTextUnit(text: string): boolean {
  const normalized = normalizeTextUnit(text);
  const meaningfulChars = normalized.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return normalized.length >= 3 && meaningfulChars >= 2;
}

function dedupeTextUnits(units: string[]): string[] {
  const seen = new Set<string>();

  return units.filter((unit) => {
    const normalized = normalizeTextUnit(unit);
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function renderPageToCanvas(page: any): Promise<HTMLCanvasElement> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDimension = 2200;
  const preferredScale = 2;
  const scale = Math.max(
    1,
    Math.min(preferredScale, maxDimension / Math.max(baseViewport.width, baseViewport.height))
  );
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not create canvas context for OCR.");
  }

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function extractOcrUnitsFromPDF(
  file: File,
  onProgress?: (progress: number) => void
): Promise<OcrExtractionResult> {
  const { createWorker, PSM } = await import("tesseract.js");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const worker = await createWorker(["eng", "swe"], 1);

  const textUnits: string[] = [];
  const spatialGroups: SpatialGroup[] = [];

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const canvas = await renderPageToCanvas(page);
      const result = await worker.recognize(canvas, {}, { blocks: true });
      const blocks = Array.isArray(result.data.blocks) ? result.data.blocks : [];

      for (const block of blocks as any[]) {
        const segments = block.paragraphs?.flatMap((paragraph: any) => paragraph.lines ?? []) ?? [block];

        for (const segment of segments) {
          const text = normalizeTextUnit(segment.text ?? block.text ?? "");
          const bbox = segment.bbox ?? block.bbox;

          if (!bbox || !isUsefulTextUnit(text)) {
            continue;
          }

          const cx = (bbox.x0 + bbox.x1) / 2;
          const cy = (bbox.y0 + bbox.y1) / 2;

          textUnits.push(text);
          spatialGroups.push({
            items: [],
            text,
            centroid: { x: cx, y: cy },
            normPos: {
              x: canvas.width ? cx / canvas.width : 0.5,
              y: canvas.height ? cy / canvas.height : 0.5,
            },
            bounds: {
              minX: bbox.x0,
              minY: bbox.y0,
              maxX: bbox.x1,
              maxY: bbox.y1,
            },
            pageIndex: i - 1,
          });
        }
      }

      onProgress?.(i / pdf.numPages);
    }
  } finally {
    await worker.terminate();
  }

  return {
    textUnits: dedupeTextUnits(textUnits),
    spatialGroups,
  };
}
