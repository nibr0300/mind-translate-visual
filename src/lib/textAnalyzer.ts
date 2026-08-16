/**
 * Text Analysis Utilities
 * 
 * TF-IDF vectorization, cosine similarity, K-means clustering,
 * PCA projection, and cluster labeling — extracted from the
 * original pdfFieldGenerator for modularity.
 */

/**
 * Tokenizer.
 *
 * Keeps 2-character tokens, digits and notation glyphs (λ, ∅, →, [0]=[7]) because
 * axiomatic system instructions are often short and symbol-dense — dropping them
 * made fundamental units look "empty" and pushed them into fallback placement.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}λ∅→↔≠≡∈∀∃\s'_-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}


/** Stopwords to ignore (multilingual: EN + SV; harmless cross-language overlap is OK) */
export const STOPWORDS = new Set([
  // English
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "from",
  "this", "that", "with", "they", "will", "each", "make", "like",
  "into", "over", "such", "than", "them", "then", "these", "some",
  "would", "other", "about", "which", "their", "there", "could",
  "more", "very", "when", "what", "your", "also", "most", "only",
  "after", "being", "those", "does", "were", "where", "just",
  "should", "through", "between", "before", "because", "while",
  "during", "without", "within", "upon", "both", "its", "own",
  // Swedish
  "och", "att", "det", "som", "för", "till", "med", "den", "ett", "har",
  "inte", "men", "var", "han", "hon", "den", "denna", "detta", "dessa",
  "vid", "från", "under", "över", "efter", "innan", "mellan", "utan",
  "vara", "blir", "blev", "blivit", "kan", "ska", "skall", "skulle",
  "måste", "borde", "vill", "ville", "samt", "eller", "också", "redan",
  "när", "där", "här", "hur", "varför", "vilken", "vilket", "vilka",
  "någon", "något", "några", "alla", "andra", "annan", "annat",
  "min", "mitt", "mina", "din", "ditt", "dina", "sin", "sitt", "sina",
  "jag", "mig", "du", "dig", "vi", "oss", "ni", "er", "de", "dem",
  "är", "var", "varit", "själv", "själva", "samma", "sådan", "sådant",
]);


/**
 * Compute TF-IDF vectors.
 *
 * Vocabulary selection is coverage-guaranteed: the global ranking is kept, but
 * every document is also allowed to contribute its own most distinctive terms.
 * Without this, short axiomatic units ("Ready for relation.", "[0]=[7] …") ended
 * up with an all-zero vector and were reported as having "no distinctive terms".
 * Hapax terms (df = 1) are now eligible — a term that appears once is the most
 * informative term in the corpus, not noise.
 */
export function computeTFIDF(sentences: string[]): { vectors: number[][]; vocab: string[] } {
  const docs = sentences.map(tokenize);
  const N = docs.length;

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

  const isEligible = (w: string) => !STOPWORDS.has(w) && (df[w] || 0) < Math.max(2, N * 0.8);

  // Vocabulary budget scales with the corpus instead of a flat 100 terms.
  const budget = Math.min(2000, Math.max(300, N * 6));

  const globalRanked = Object.keys(df)
    .filter(isEligible)
    // Rank by informativeness (tf-idf mass), not raw frequency.
    .sort((a, b) => df[b] * Math.log(N / df[b]) - df[a] * Math.log(N / df[a]));

  const vocabSet = new Set<string>(globalRanked.slice(0, budget));

  // Coverage pass: guarantee every document has at least a few dimensions.
  const MIN_DIMS_PER_DOC = 3;
  docs.forEach((doc) => {
    const own = Array.from(new Set(doc.filter(isEligible)));
    if (own.filter((w) => vocabSet.has(w)).length >= MIN_DIMS_PER_DOC) return;
    own
      .sort((a, b) => df[a] - df[b]) // rarest (most distinctive) first
      .slice(0, MIN_DIMS_PER_DOC)
      .forEach((w) => vocabSet.add(w));
  });

  const vocab = Array.from(vocabSet);
  const vocabIndex = new Map(vocab.map((w, i) => [w, i]));

  const vectors = docs.map((doc) => {
    const tf: Record<string, number> = {};
    doc.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
    const maxTf = Math.max(...Object.values(tf), 1);

    const vec = new Array(vocab.length).fill(0);
    doc.forEach((w) => {
      const idx = vocabIndex.get(w);
      if (idx !== undefined) {
        vec[idx] = (tf[w] / maxTf) * (1 + Math.log(N / (df[w] || 1)));
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

/* ============================================================ *
 *  Projection hygiene: collision spreading + degeneracy flags
 * ============================================================ */

/** Deterministic 0..1 hash from a string, so the same field always renders the same. */
function seedHash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * PCA on sparse TF-IDF puts unrelated short sentences on the exact same point
 * (near-zero vectors project to the same coordinate). That looks like semantic
 * density in the map but is a projection artifact. We spread colliding points
 * deterministically in a small spiral so the map stays honest and every node
 * stays clickable.
 *
 * @param coords projected 2D coordinates
 * @param keys   stable per-node keys (used as spiral seeds)
 * @param eps    distance under which two points count as colliding
 */
export function spreadCollisions(
  coords: [number, number][],
  keys: string[],
  eps = 0.02,
): { coords: [number, number][]; uniqueBefore: number; movedCount: number } {
  const quant = (v: number) => Math.round(v / eps);
  const buckets = new Map<string, number[]>();
  coords.forEach(([x, y], i) => {
    const k = `${quant(x)}:${quant(y)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(i);
  });

  const out = coords.map((c) => [c[0], c[1]] as [number, number]);
  let movedCount = 0;

  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    // Golden-angle spiral around the shared centre; radius grows with count.
    const cx = idxs.reduce((s, i) => s + coords[i][0], 0) / idxs.length;
    const cy = idxs.reduce((s, i) => s + coords[i][1], 0) / idxs.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    idxs.forEach((idx, rank) => {
      if (rank === 0) return; // keep one node on the true coordinate
      const jitter = seedHash(keys[idx] ?? String(idx));
      const angle = rank * golden + jitter * 0.6;
      const radius = 0.06 * Math.sqrt(rank + 1) * (0.85 + jitter * 0.3);
      out[idx] = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
      movedCount++;
    });
  }

  return { coords: out, uniqueBefore: buckets.size, movedCount };
}

/**
 * A unit is "degenerate" when its TF-IDF vector carries almost no signal
 * (no distinctive terms). Its 2D position is then fallback placement, not
 * semantics — the reader should not interpret its neighbours as meaningful.
 */
export function degenerateFlags(vectors: number[][], threshold = 1e-6): boolean[] {
  return vectors.map((v) => {
    let norm = 0;
    for (const x of v) norm += x * x;
    return Math.sqrt(norm) < threshold;
  });
}

/* ============================================================ *
 *  kNN edges in the original high-dimensional space
 * ============================================================ */

export interface FieldEdgeRaw {
  source: number;
  target: number;
  similarity: number;
}




/**
 * Symmetric k-nearest-neighbour graph computed in the ORIGINAL vector space
 * (not the 2D projection). This is what makes real network analysis possible:
 * node degree and weighted centrality reflect semantic neighbourhood, not
 * visual line density on the map.
 */
export function computeKnnEdges(vectors: number[][], k = 8, minSimilarity = 0.05): FieldEdgeRaw[] {
  const n = vectors.length;
  if (n < 2) return [];

  const seen = new Set<string>();
  const edges: FieldEdgeRaw[] = [];

  for (let i = 0; i < n; i++) {
    const sims: { j: number; s: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const s = cosine(vectors[i], vectors[j]);
      if (s > minSimilarity) sims.push({ j, s });
    }
    sims.sort((a, b) => b.s - a.s);
    for (const { j, s } of sims.slice(0, k)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: Math.min(i, j), target: Math.max(i, j), similarity: Math.round(s * 10000) / 10000 });
    }
  }

  return edges.sort((a, b) => b.similarity - a.similarity);
}

/** Degree + similarity-weighted centrality per node index. */
export function edgeCentrality(
  edges: FieldEdgeRaw[],
  n: number,
): { degree: number[]; weighted: number[] } {
  const degree = new Array(n).fill(0);
  const weighted = new Array(n).fill(0);
  for (const e of edges) {
    degree[e.source]++;
    degree[e.target]++;
    weighted[e.source] += e.similarity;
    weighted[e.target] += e.similarity;
  }
  const max = Math.max(1e-9, ...weighted);
  return { degree, weighted: weighted.map((w) => Math.round((w / max) * 1000) / 1000) };
}
