/**
 * Sentence-aware sliding-window chunker.
 *
 * Overlap is measured in SENTENCES (default 2), not characters, so chunks
 * never split mid-sentence. Targets ~500 chars per chunk, hard max 1200.
 */

export interface RawTextUnit {
  text: string;
  /** Origin within the source: file path inside a zip, page number, timestamp, etc. */
  source?: string;
  /** Optional ordering hint preserved through chunking. */
  position?: number;
}

export interface Chunk {
  index: number;
  text: string;
  source?: string;
  /** First sentence's position from the input stream, useful for ordering. */
  startPosition?: number;
}

export interface ChunkOptions {
  targetChars?: number;
  maxChars?: number;
  overlapSentences?: number;
  minChunkChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 500,
  maxChars: 1200,
  overlapSentences: 2,
  minChunkChars: 40,
};

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ"'(\[])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chunk a stream of raw text units. Units are kept grouped by `source` —
 * we never merge sentences across different source paths inside a zip.
 */
export function chunkUnits(units: RawTextUnit[], opts: ChunkOptions = {}): Chunk[] {
  const o = { ...DEFAULTS, ...opts };
  const chunks: Chunk[] = [];

  // Group consecutive units that share the same source
  const groups: { source?: string; sentences: { text: string; position?: number }[] }[] = [];
  let current: (typeof groups)[number] | null = null;

  for (const unit of units) {
    const sents = splitSentences(unit.text);
    if (sents.length === 0) continue;
    const sentObjs = sents.map((text) => ({ text, position: unit.position }));

    if (!current || current.source !== unit.source) {
      current = { source: unit.source, sentences: [] };
      groups.push(current);
    }
    current.sentences.push(...sentObjs);
  }

  let globalIndex = 0;

  for (const group of groups) {
    const sents = group.sentences;
    let i = 0;

    while (i < sents.length) {
      const buffer: typeof sents = [];
      let charCount = 0;

      while (i < sents.length && charCount + sents[i].text.length <= o.maxChars) {
        buffer.push(sents[i]);
        charCount += sents[i].text.length + 1;
        i++;
        if (charCount >= o.targetChars) break;
      }

      // Force progress even for absurdly long single sentences
      if (buffer.length === 0 && i < sents.length) {
        buffer.push(sents[i]);
        i++;
      }

      const text = buffer.map((s) => s.text).join(" ").trim();
      if (text.length >= o.minChunkChars) {
        chunks.push({
          index: globalIndex++,
          text,
          source: group.source,
          startPosition: buffer[0].position,
        });
      }

      // Step back by overlapSentences for the next window
      if (i < sents.length && o.overlapSentences > 0) {
        i = Math.max(i - o.overlapSentences, i - buffer.length + 1);
      }
    }
  }

  return chunks;
}
