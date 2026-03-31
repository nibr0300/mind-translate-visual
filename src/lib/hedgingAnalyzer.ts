/**
 * Client-side lexical hedging analyzer.
 *
 * Detects epistemic markers (modal verbs, adverbs of uncertainty,
 * hedging phrases) to estimate epistemic tension without LLM cost.
 *
 * This provides one of the triangulation sources for truthTension.
 */

/** Swedish and English epistemic uncertainty markers */
const HEDGE_MARKERS = [
  // Swedish
  "kanske", "möjligen", "troligen", "eventuellt", "förmodligen",
  "antagligen", "sannolikt", "osäkert", "oklart", "torde",
  "borde", "kunde", "verkar", "tycks", "tyckas",
  "i viss mån", "till viss del", "det är möjligt",
  "det kan vara", "inte nödvändigtvis", "å andra sidan",
  // English
  "perhaps", "maybe", "possibly", "probably", "likely",
  "might", "could", "would", "seemingly", "apparently",
  "arguably", "presumably", "supposedly", "uncertain",
  "it seems", "it appears", "to some extent", "in a sense",
  "not necessarily", "on the other hand", "however",
  "although", "nevertheless", "nonetheless",
];

/** Markers of strong assertion / certainty */
const CERTAINTY_MARKERS = [
  // Swedish
  "definitivt", "absolut", "utan tvekan", "givetvis", "självklart",
  "faktiskt", "verkligen", "alltid", "aldrig", "måste",
  // English
  "definitely", "absolutely", "certainly", "undoubtedly", "clearly",
  "obviously", "always", "never", "must", "proven", "established",
  "without doubt", "in fact", "indeed",
];

/** Question / challenge markers */
const CHALLENGE_MARKERS = [
  // Swedish
  "varför", "hur kan", "stämmer det", "är det verkligen",
  "ifrågasätta", "kritisera", "motsäga", "problematisera",
  // English
  "why", "how can", "is it really", "question", "challenge",
  "contradict", "dispute", "problematic", "debatable",
  "controversial", "paradox", "tension", "conflict",
];

export interface HedgingScore {
  /** 0-1: density of hedging/uncertainty markers */
  hedgingDensity: number;
  /** 0-1: density of strong certainty markers */
  certaintyDensity: number;
  /** 0-1: density of challenge/questioning markers */
  challengeDensity: number;
  /** 0-1: computed epistemic tension from lexical markers alone */
  lexicalTruthTension: number;
}

function countMarkers(text: string, markers: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const marker of markers) {
    // Use word-boundary-aware matching for single words,
    // substring matching for multi-word phrases
    if (marker.includes(" ")) {
      if (lower.includes(marker)) count++;
    } else {
      // Match as whole word (rough approximation)
      const regex = new RegExp(`\\b${marker}\\b`, "gi");
      const matches = lower.match(regex);
      if (matches) count += matches.length;
    }
  }
  return count;
}

/**
 * Analyze a single text unit for hedging markers.
 */
export function analyzeHedging(text: string): HedgingScore {
  const wordCount = text.split(/\s+/).length || 1;

  const hedgeCount = countMarkers(text, HEDGE_MARKERS);
  const certaintyCount = countMarkers(text, CERTAINTY_MARKERS);
  const challengeCount = countMarkers(text, CHALLENGE_MARKERS);

  // Normalize to density (markers per word, capped at 1)
  const hedgingDensity = Math.min(1, hedgeCount / Math.max(3, wordCount) * 3);
  const certaintyDensity = Math.min(1, certaintyCount / Math.max(3, wordCount) * 3);
  const challengeDensity = Math.min(1, challengeCount / Math.max(3, wordCount) * 3);

  // Lexical truth tension: high hedging + high challenge + low certainty = high tension
  const lexicalTruthTension = Math.min(1, Math.max(0,
    hedgingDensity * 0.4 +
    challengeDensity * 0.45 +
    (1 - certaintyDensity) * 0.15
  ));

  return {
    hedgingDensity: Math.round(hedgingDensity * 100) / 100,
    certaintyDensity: Math.round(certaintyDensity * 100) / 100,
    challengeDensity: Math.round(challengeDensity * 100) / 100,
    lexicalTruthTension: Math.round(lexicalTruthTension * 100) / 100,
  };
}

/**
 * Batch-analyze an array of text units.
 */
export function analyzeHedgingBatch(textUnits: string[]): HedgingScore[] {
  return textUnits.map(analyzeHedging);
}

/**
 * Detect speechAct–content discrepancy.
 *
 * An "assertive" speech act containing hedging markers suggests
 * the speaker is uncertain despite framing as fact → high tension.
 *
 * A "directive" or "commissive" with challenge markers suggests
 * internal conflict about the directive → tension.
 */
export function speechActDiscrepancy(
  speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative",
  hedging: HedgingScore
): number {
  switch (speechAct) {
    case "assertive":
      // Asserting something while hedging → discrepancy
      return hedging.hedgingDensity * 0.7 + hedging.challengeDensity * 0.3;
    case "directive":
      // Directing while uncertain → weak directive
      return hedging.hedgingDensity * 0.5 + hedging.challengeDensity * 0.5;
    case "commissive":
      // Committing while hedging → uncertain commitment
      return hedging.hedgingDensity * 0.6 + hedging.challengeDensity * 0.4;
    case "expressive":
      // Expressing with challenge markers → conflicted expression
      return hedging.challengeDensity * 0.6 + hedging.hedgingDensity * 0.2;
    case "declarative":
      // Declaring with hedging → undermined declaration
      return hedging.hedgingDensity * 0.8 + hedging.challengeDensity * 0.2;
    default:
      return 0;
  }
}
