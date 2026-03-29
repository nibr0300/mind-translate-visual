/**
 * Text Analysis Utilities
 * 
 * TF-IDF vectorization, cosine similarity, K-means clustering,
 * PCA projection, and cluster labeling — extracted from the
 * original pdfFieldGenerator for modularity.
 */

/** Simple tokenizer */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zæøåäöü0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Stopwords to ignore */
export const STOPWORDS = new Set([
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
export function computeTFIDF(sentences: string[]): { vectors: number[][]; vocab: string[] } {
  const docs = sentences.map(tokenize);

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

  const vocab = Object.entries(df)
    .filter(([, count]) => count >= 2 && count < docs.length * 0.8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word]) => word);

  const vocabIndex = new Map(vocab.map((w, i) => [w, i]));
  const N = docs.length;

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
export function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

/** Simple K-means clustering */
export function kMeans(vectors: number[][], k: number, maxIter = 20): number[] {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0 || dim === 0) return [];

  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const centroids = indices.slice(0, k).map((i) => [...vectors[i]]);

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
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

/** Project high-dim vectors to 2D using PCA (power iteration) */
export function projectTo2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0) return [];

  const mean = new Array(dim).fill(0);
  vectors.forEach((v) => v.forEach((val, i) => (mean[i] += val)));
  mean.forEach((_, i) => (mean[i] /= n));
  const centered = vectors.map((v) => v.map((val, i) => val - mean[i]));

  const findPC = (data: number[][]): number[] => {
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
  const deflated = centered.map((v) => {
    const proj = v.reduce((s, val, i) => s + val * pc1[i], 0);
    return v.map((val, i) => val - proj * pc1[i]);
  });
  const pc2 = findPC(deflated);

  const coords: [number, number][] = centered.map((v) => [
    v.reduce((s, val, i) => s + val * pc1[i], 0),
    v.reduce((s, val, i) => s + val * pc2[i], 0),
  ]);

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
export function generateClusterLabels(
  sentences: string[],
  assignments: number[],
  k: number
): { label: string; description: string }[] {
  const labels: { label: string; description: string }[] = [];

  for (let c = 0; c < k; c++) {
    const clusterSentences = sentences.filter((_, i) => assignments[i] === c);
    const allTokens = clusterSentences.flatMap(tokenize).filter((w) => !STOPWORDS.has(w));

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
