import { supabase } from "@/integrations/supabase/client";
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

/**
 * Call the analyze-intentions edge function to get speech-act
 * and epistemic analysis for each text unit.
 *
 * Returns null (graceful degradation) if the call fails.
 */
export async function analyzeIntentions(
  textUnits: string[]
): Promise<IntentionAnalysis[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke("analyze-intentions", {
      body: { textUnits },
    });

    if (error) {
      console.warn("Intention analysis unavailable:", error.message);
      return null;
    }

    return (data as { analyses: IntentionAnalysis[] }).analyses;
  } catch (err) {
    console.warn("Intention analysis failed:", err);
    return null;
  }
}

/**
 * Triangulate truthTension from four independent sources:
 *
 * 1. LLM judgment (0.35 weight) — holistic semantic analysis
 * 2. Lexical hedging (0.20 weight) — client-side marker detection
 * 3. SpeechAct–content discrepancy (0.25 weight) — asserting while hedging etc.
 * 4. Intra-cluster intention deviation (0.20 weight) — structural tension
 *
 * If LLM analysis is unavailable, sources 2-4 are reweighted.
 */
export function triangulateTruthTension(
  llmTension: number | null,
  hedging: HedgingScore,
  speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative" | null,
  clusterDeviation: number
): TriangulatedTension {
  const lexicalTension = hedging.lexicalTruthTension;
  const discrepancy = speechAct ? speechActDiscrepancy(speechAct, hedging) : 0;

  if (llmTension !== null && speechAct !== null) {
    // Full triangulation — all 4 sources
    const triangulated =
      llmTension * 0.35 +
      lexicalTension * 0.20 +
      discrepancy * 0.25 +
      clusterDeviation * 0.20;

    return {
      llmTension,
      lexicalTension,
      discrepancy,
      clusterDeviation,
      triangulated: clamp(triangulated),
    };
  }

  // Graceful degradation: no LLM data, use lexical + cluster only
  const triangulated =
    lexicalTension * 0.45 +
    clusterDeviation * 0.35 +
    discrepancy * 0.20;

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
 *
 * Measures how much a unit's intentional profile deviates from
 * its cluster's average intentional profile.
 */
export function computeClusterDeviation(
  unitIntention: IntentionAnalysis,
  clusterIntentions: IntentionAnalysis[]
): number {
  if (clusterIntentions.length <= 1) return 0;

  const avgCertainty = clusterIntentions.reduce((s, i) => s + i.epistemicCertainty, 0) / clusterIntentions.length;
  const avgForce = clusterIntentions.reduce((s, i) => s + i.intentionalForce, 0) / clusterIntentions.length;
  const avgTension = clusterIntentions.reduce((s, i) => s + i.truthTension, 0) / clusterIntentions.length;

  // Euclidean distance in 3D intention space
  const dist = Math.sqrt(
    (unitIntention.epistemicCertainty - avgCertainty) ** 2 +
    (unitIntention.intentionalForce - avgForce) ** 2 +
    (unitIntention.truthTension - avgTension) ** 2
  );

  // Normalize: max possible dist in [0,1]³ is √3 ≈ 1.73
  return Math.min(1, dist / 1.73);
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

function clamp(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}
