import { supabase } from "@/integrations/supabase/client";
import { isCreditError, notifyCreditsExhausted } from "./creditNotice";

import {
  analyzeHedgingBatch,
  speechActDiscrepancy,
  type HedgingScore,
} from "./hedgingAnalyzer";

export interface IntentionAnalysis {
  index: number;
  speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative";
  epistemicCertainty: number;
  intentionalForce: number;
  truthTension: number;
  /** 0-1: cowardice, denial, blame-shifting, religious/ideological self-exoneration */
  moralTension?: number;
  /** 0-1: inter-subject friction — betrayal, accusation, silenced witness */
  narrativeTension?: number;
  /** 0-1: actively refusing or rewriting plain reality */
  denialMarker?: number;
}

export interface TriangulatedTension {
  /** LLM-derived truth tension (source 1) */
  llmTension: number;
  /** Lexical hedging tension (source 2 — client-side) */
  lexicalTension: number;
  /** SpeechAct–content discrepancy (source 3) */
  discrepancy: number;
  /** Intra-cluster deviation (source 4) */
  clusterDeviation: number;
  /** Final triangulated truthTension */
  triangulated: number;
}

const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function analyzeBatch(textUnits: string[]): Promise<IntentionAnalysis[] | null> {
  try {
    const res = await withTimeout(
      supabase.functions.invoke("analyze-intentions", { body: { textUnits } }),
      BATCH_TIMEOUT_MS
    );
    if (!res) {
      console.warn("Intention analysis timed out — falling back to lexical signals for this batch.");
      return null;
    }
    const { data, error } = res;
    if (error) {
      if (isCreditError(error)) notifyCreditsExhausted();
      else console.warn("Intention analysis unavailable:", error.message);
      return null;
    }
    return (data as { analyses: IntentionAnalysis[] }).analyses ?? null;
  } catch (err) {
    if (isCreditError(err)) notifyCreditsExhausted();
    else console.warn("Intention analysis failed:", err);
    return null;
  }
}

/**
 * Call the analyze-intentions edge function to get speech-act
 * and epistemic analysis for each text unit.
 *
 * Batched with a hard per-batch timeout so a slow/unavailable model can never
 * freeze ingestion indefinitely. Missing batches degrade to null entries.
 */
export async function analyzeIntentions(
  textUnits: string[]
): Promise<IntentionAnalysis[] | null> {
  if (!textUnits.length) return null;

  const batches: string[][] = [];
  for (let i = 0; i < textUnits.length; i += BATCH_SIZE) {
    batches.push(textUnits.slice(i, i + BATCH_SIZE));
  }

  const results: (IntentionAnalysis[] | null)[] = new Array(batches.length).fill(null);
  let next = 0;
  const batchWork = Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
      while (next < batches.length) {
        const i = next++;
        results[i] = await analyzeBatch(batches[i]);
      }
    })
  );
  const completed = await withTimeout(batchWork, TOTAL_TIMEOUT_MS);
  if (!completed) {
    console.warn("Intention analysis exceeded its total budget — rendering lexical field now.");
  }

  // Edge function returns batch-local indices — remap them to global unit indices.
  const merged: IntentionAnalysis[] = [];
  let offset = 0;
  results.forEach((r, i) => {
    if (r) {
      for (const a of r) {
        const idx = offset + (a.index ?? 0);
        if (idx < textUnits.length) merged.push({ ...a, index: idx });
      }
    }
    offset += batches[i].length;
  });

  return merged.length ? merged : null;
}



/**
 * Content-tension: moral + narrative friction surfaced by the LLM.
 * This is the "lyric/prose can be calm on the surface but morally on fire"
 * signal — cowardice, denial, blame-shifting, inter-character harm.
 */
export function contentTension(intention: IntentionAnalysis | null | undefined): number {
  if (!intention) return 0;
  const moral = intention.moralTension ?? 0;
  const narrative = intention.narrativeTension ?? 0;
  const denial = intention.denialMarker ?? 0;
  return clamp(moral * 0.5 + narrative * 0.35 + denial * 0.15);
}

/**
 * Triangulate truthTension from independent sources:
 *
 * 1. LLM judgment (holistic semantic analysis)
 * 2. Lexical hedging (client-side marker detection)
 * 3. SpeechAct–content discrepancy (asserting while hedging etc.)
 * 4. Moral/narrative content tension (cowardice, denial, inter-character harm)
 * 5. Intra-cluster intention deviation (structural tension)
 *
 * Discrepancy is now the MAX of speech-act discrepancy and content tension —
 * lyrics/prose can be morally hot without lexical hedging.
 */
export function triangulateTruthTension(
  llmTension: number | null,
  hedging: HedgingScore,
  speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative" | null,
  clusterDeviation: number,
  intention?: IntentionAnalysis | null
): TriangulatedTension {
  const lexicalTension = hedging.lexicalTruthTension;
  const speechActDisc = speechAct ? speechActDiscrepancy(speechAct, hedging) : 0;
  const content = contentTension(intention);
  // Internal discrepancy = whichever axis is hottest (speech-act vs. moral/narrative)
  const discrepancy = clamp(Math.max(speechActDisc, content));

  if (llmTension !== null && speechAct !== null) {
    const triangulated =
      llmTension * 0.30 +
      lexicalTension * 0.15 +
      discrepancy * 0.25 +
      content * 0.15 +
      clusterDeviation * 0.15;

    return {
      llmTension,
      lexicalTension,
      discrepancy,
      clusterDeviation,
      triangulated: clamp(triangulated),
    };
  }

  // Graceful degradation
  const triangulated =
    lexicalTension * 0.40 +
    clusterDeviation * 0.30 +
    discrepancy * 0.30;

  return {
    llmTension: llmTension ?? 0,
    lexicalTension,
    discrepancy,
    clusterDeviation,
    triangulated: clamp(triangulated),
  };
}

/**
 * Compute intra-cluster intention deviation for a unit.
 * Now spans a 5D intention space including moral and narrative axes,
 * so morally distinctive lines stand out from a thematically homogenous cluster.
 */
export function computeClusterDeviation(
  unitIntention: IntentionAnalysis,
  clusterIntentions: IntentionAnalysis[]
): number {
  if (clusterIntentions.length <= 1) return 0;

  const avg = (pick: (i: IntentionAnalysis) => number) =>
    clusterIntentions.reduce((s, i) => s + pick(i), 0) / clusterIntentions.length;

  const aC = avg((i) => i.epistemicCertainty);
  const aF = avg((i) => i.intentionalForce);
  const aT = avg((i) => i.truthTension);
  const aM = avg((i) => i.moralTension ?? 0);
  const aN = avg((i) => i.narrativeTension ?? 0);

  const dist = Math.sqrt(
    (unitIntention.epistemicCertainty - aC) ** 2 +
    (unitIntention.intentionalForce - aF) ** 2 +
    (unitIntention.truthTension - aT) ** 2 +
    ((unitIntention.moralTension ?? 0) - aM) ** 2 +
    ((unitIntention.narrativeTension ?? 0) - aN) ** 2
  );

  // Max possible dist in [0,1]⁵ is √5 ≈ 2.236
  return Math.min(1, dist / 2.236);
}

/**
 * Blend lexical FZ with triangulated intention data.
 *
 * Formula:
 *   blendedFZ = lexicalFZ * 0.45
 *             + triangulatedTruthTension * 0.25
 *             + (1 - epistemicCertainty) * 0.15
 *             + intentionalForce * 0.15
 */
export function blendFZWithIntention(
  lexicalFZ: number,
  triangulatedTension: number,
  epistemicCertainty: number,
  intentionalForce: number
): number {
  const blended =
    lexicalFZ * 0.45 +
    triangulatedTension * 0.25 +
    (1 - epistemicCertainty) * 0.15 +
    intentionalForce * 0.15;

  return clamp(blended);
}

/**
 * Compute Composite Tension Index (CTI).
 *
 * Combines two orthogonal tension measures:
 * - Internal discrepancy: speechAct vs hedging content (intra-utterance inconsistency)
 * - External deviation: how much the unit's intention deviates from its cluster
 *
 * Uses geometric mean so both must be elevated for high CTI,
 * filtering out statistical noise where only one axis is high.
 *
 * CTI > 0.4 → genuinely problematic node (not just a statistical outlier)
 */
export function computeCTI(discrepancy: number, clusterDeviation: number): number {
  // Geometric mean with a small floor on cluster deviation so a morally hot
  // line in a thematically homogeneous source (e.g. a whole album about one
  // event) still surfaces — internal tension alone is enough to register.
  const externalFloor = Math.max(clusterDeviation, 0.15);
  const raw = Math.sqrt(discrepancy * externalFloor);
  return Math.round(Math.min(1, raw) * 100) / 100;
}

function clamp(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}
