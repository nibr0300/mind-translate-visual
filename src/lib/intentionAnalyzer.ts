import { supabase } from "@/integrations/supabase/client";

export interface IntentionAnalysis {
  index: number;
  speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative";
  epistemicCertainty: number;
  intentionalForce: number;
  truthTension: number;
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
 * Blend lexical FZ with intention-derived tension.
 *
 * Formula:
 *   blendedFZ = lexicalFZ * 0.5
 *             + truthTension * 0.25
 *             + (1 - epistemicCertainty) * 0.15
 *             + intentionalForce * 0.10
 *
 * This makes FZ sensitive to whether a statement is
 * questioning truth, uncertain, or strongly directive —
 * not just lexically distant from its cluster centroid.
 */
export function blendFZWithIntention(
  lexicalFZ: number,
  intention: IntentionAnalysis
): number {
  const blended =
    lexicalFZ * 0.5 +
    intention.truthTension * 0.25 +
    (1 - intention.epistemicCertainty) * 0.15 +
    intention.intentionalForce * 0.10;

  return Math.round(Math.min(1, Math.max(0, blended)) * 100) / 100;
}
