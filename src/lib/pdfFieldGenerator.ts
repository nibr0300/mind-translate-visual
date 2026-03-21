import * as pdfjsLib from "pdfjs-dist";
import type { GeometricField, FieldUnit, FieldCluster } from "./fieldData";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

/** Extract all text from a PDF file */
export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const sentences: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item: any) => "str" in item)
      .map((item: any) => item.str)
      .join(" ");

    // Split into sentences
    const pageSentences = pageText
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    sentences.push(...pageSentences);
  }

  return sentences;
}

/** Simple tokenizer */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zæøåäöü0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Stopwords to ignore */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "from",
  "this", "that", "with", "they", "will", "each", "make", "like",
  "into", "over", "such", "than", "them", "then", "these", "some",
  "would", "other", "about", "which", "their", "there", "could",
  "more", "very", "when", "what", "your", "also", "most", "only",
  "after", "being", "those", "does", "were", "where", "been", "just",
  "should", "through", "between", "before", "because", "while",
  "during", "without", "within", "upon", "both", "its", "own",
]);

/** Compute TF-IDF vectors for sentences */
function computeTFIDF(sentences: string[]): { vectors: number[][]; vocab: string[] } {
  const docs = sentences.map(tokenize);

  // Build vocabulary from top terms by document frequency
  const df: Record<string, number> = {};
  docs.forEach((doc) => {
    const seen = new Set<string>();
    doc.forEach((w) => {
      if (!STOPWORDS.has(w) && !seen.has(w)) {
        df[w] = (df[w] || 0) + 1;
        seen.add(w);
      }
    });
  });

  // Take top 100 terms by DF, excluding too-common ones
  const vocab = Object.entries(df)
    .filter(([, count]) => count >= 2 && count < docs.length * 0.8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word]) => word);

  const vocabIndex = new Map(vocab.map((w, i) => [w, i]));
  const N = docs.length;

  // Compute TF-IDF vectors
  const vectors = docs.map((doc) => {
    const tf: Record<string, number> = {};
    doc.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
    const maxTf = Math.max(...Object.values(tf), 1);

    const vec = new Array(vocab.length).fill(0);
    doc.forEach((w) => {
      const idx = vocabIndex.get(w);
      if (idx !== undefined) {
        vec[idx] = (tf[w] / maxTf) * Math.log(N / (df[w] || 1));
      }
    });
    return vec;
  });

  return { vectors, vocab };
}

/** Cosine similarity */
function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

/** Simple K-means clustering */
function kMeans(vectors: number[][], k: number, maxIter = 20): number[] {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0 || dim === 0) return [];

  // Initialize centroids randomly (pick k distinct indices)
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const centroids = indices.slice(0, k).map((i) => [...vectors[i]]);

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each vector to nearest centroid
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestDist = -1;
      let bestK = 0;
      for (let c = 0; c < k; c++) {
        const sim = cosine(vectors[i], centroids[c]);
        if (sim > bestDist) {
          bestDist = sim;
          bestK = c;
        }
      }
      if (assignments[i] !== bestK) {
        assignments[i] = bestK;
        changed = true;
      }
    }
    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      for (let d = 0; d < dim; d++) {
        centroids[c][d] = members.reduce((s, v) => s + v[d], 0) / members.length;
      }
    }
  }

  return assignments;
}

/** Project high-dim vectors to 2D using simple PCA (power iteration for top 2 components) */
function projectTo2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0) return [];

  // Center the data
  const mean = new Array(dim).fill(0);
  vectors.forEach((v) => v.forEach((val, i) => (mean[i] += val)));
  mean.forEach((_, i) => (mean[i] /= n));
  const centered = vectors.map((v) => v.map((val, i) => val - mean[i]));

  // Power iteration for first principal component
  const findPC = (data: number[][], deflated = false): number[] => {
    let pc = Array.from({ length: dim }, () => Math.random() - 0.5);
    for (let iter = 0; iter < 50; iter++) {
      const newPc = new Array(dim).fill(0);
      data.forEach((v) => {
        const dot = v.reduce((s, val, i) => s + val * pc[i], 0);
        v.forEach((val, i) => (newPc[i] += dot * val));
      });
      const mag = Math.sqrt(newPc.reduce((s, v) => s + v * v, 0)) || 1;
      pc = newPc.map((v) => v / mag);
    }
    return pc;
  };

  const pc1 = findPC(centered);
  // Deflate
  const deflated = centered.map((v) => {
    const proj = v.reduce((s, val, i) => s + val * pc1[i], 0);
    return v.map((val, i) => val - proj * pc1[i]);
  });
  const pc2 = findPC(deflated, true);

  // Project
  const coords: [number, number][] = centered.map((v) => [
    v.reduce((s, val, i) => s + val * pc1[i], 0),
    v.reduce((s, val, i) => s + val * pc2[i], 0),
  ]);

  // Normalize to [-3.5, 3.5] range
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  coords.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return coords.map(([x, y]) => [
    ((x - minX) / rangeX) * 7 - 3.5,
    ((y - minY) / rangeY) * 7 - 3.5,
  ]);
}

/** Generate cluster labels from top terms */
function generateClusterLabels(
  sentences: string[],
  assignments: number[],
  k: number
): { label: string; description: string }[] {
  const labels: { label: string; description: string }[] = [];

  for (let c = 0; c < k; c++) {
    const clusterSentences = sentences.filter((_, i) => assignments[i] === c);
    const allTokens = clusterSentences.flatMap(tokenize).filter((w) => !STOPWORDS.has(w));

    // Count term frequency
    const tf: Record<string, number> = {};
    allTokens.forEach((w) => (tf[w] = (tf[w] || 0) + 1));

    const topTerms = Object.entries(tf)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);

    const label = topTerms.length > 0
      ? topTerms.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" · ")
      : `Cluster ${c + 1}`;

    const description = clusterSentences.length > 0
      ? clusterSentences[0].slice(0, 120) + (clusterSentences[0].length > 120 ? "…" : "")
      : "Empty cluster";

    labels.push({ label, description });
  }

  return labels;
}

/** Main: process PDF into GeometricField */
export async function generateFieldFromPDF(
  file: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<GeometricField> {
  onProgress?.("Extracting text from PDF…", 0.1);
  const sentences = await extractTextFromPDF(file);

  if (sentences.length < 5) {
    throw new Error("PDF contains too little text to generate a meaningful field. Need at least 5 sentences.");
  }

  // Cap at 80 sentences for performance
  const capped = sentences.length > 80 ? sentences.slice(0, 80) : sentences;

  onProgress?.("Computing TF-IDF vectors…", 0.3);
  const { vectors } = computeTFIDF(capped);

  const k = Math.min(5, Math.max(3, Math.floor(capped.length / 6)));

  onProgress?.("Clustering semantic units…", 0.5);
  const assignments = kMeans(vectors, k);

  onProgress?.("Projecting to 2D field…", 0.7);
  const coords2D = projectTo2D(vectors);

  onProgress?.("Generating field topology…", 0.85);
  const clusterLabels = generateClusterLabels(capped, assignments, k);

  // Build FieldUnits
  const units: FieldUnit[] = capped.map((text, i) => {
    const clusterId = assignments[i];
    // Compute FZ: distance from cluster centroid (normalized)
    const clusterMembers = coords2D.filter((_, j) => assignments[j] === clusterId);
    const centroid: [number, number] = [
      clusterMembers.reduce((s, c) => s + c[0], 0) / (clusterMembers.length || 1),
      clusterMembers.reduce((s, c) => s + c[1], 0) / (clusterMembers.length || 1),
    ];
    const dist = Math.sqrt((coords2D[i][0] - centroid[0]) ** 2 + (coords2D[i][1] - centroid[1]) ** 2);
    const fz = Math.min(1, dist / 4 + 0.1);
    const fy = Math.max(0, 1 - dist / 3);

    const wordCount = text.split(/\s+/).length;
    const type: FieldUnit["type"] = wordCount < 8 ? "fragment" : wordCount > 25 ? "paragraph" : "heading";

    return {
      id: `u${i}`,
      text,
      pos: { x: (coords2D[i][0] + 4) / 8, y: (coords2D[i][1] + 4) / 8 },
      vector2d: coords2D[i],
      clusterId,
      type,
      fz: Math.round(fz * 100) / 100,
      fy: Math.round(fy * 100) / 100,
    };
  });

  // Build clusters
  const clusters: FieldCluster[] = Array.from({ length: k }, (_, i) => {
    const clusterUnits = units.filter((u) => u.clusterId === i);
    const center: [number, number] = clusterUnits.length
      ? [
          clusterUnits.reduce((s, u) => s + u.vector2d[0], 0) / clusterUnits.length,
          clusterUnits.reduce((s, u) => s + u.vector2d[1], 0) / clusterUnits.length,
        ]
      : [0, 0];

    return {
      id: i,
      label: clusterLabels[i].label,
      center,
      unitCount: clusterUnits.length,
      avgFZ: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fz, 0) / clusterUnits.length : 0,
      avgFY: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fy, 0) / clusterUnits.length : 0,
      description: clusterLabels[i].description,
    };
  });

  const boundaryUnits = units.filter((u) => u.fz > 0.65).length;

  onProgress?.("Field ready", 1);

  return {
    units,
    clusters,
    stats: {
      totalUnits: units.length,
      boundaryUnits,
      avgFZ: units.reduce((s, u) => s + u.fz, 0) / units.length,
      avgFY: units.reduce((s, u) => s + u.fy, 0) / units.length,
    },
    useCase: "uploaded",
  };
}
