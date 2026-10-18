import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GeometricField } from "@/lib/fieldData";
import { crossCorpusPairsToScore, type CrossCorpusSettings } from "@/lib/datasetExporter";

export type MeaningStatus = "idle" | "loading" | "ready" | "error";

/**
 * Fetches AI meaning-similarity scores for the cross-corpus pairs the current
 * settings could produce. Scores are cached per text pair, so moving sliders
 * only asks for pairs not yet scored. Stops on errors until `retry` is called.
 */
export function useMeaningScores(a: GeometricField, b: GeometricField | null, settings: CrossCorpusSettings, enabled: boolean) {
  const cache = useRef(new Map<string, number>());
  const [scores, setScores] = useState<Map<string, number>>(() => new Map());
  const [status, setStatus] = useState<MeaningStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const blocked = useRef(false);

  // New field B → fresh cache.
  useEffect(() => { cache.current = new Map(); setScores(new Map()); blocked.current = false; setError(null); setStatus("idle"); }, [a, b]);

  useEffect(() => {
    if (!enabled || !b || blocked.current) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus("loading"); setError(null);
      for (let round = 0; round < 40; round++) {
        const { texts, pairs, keys, skipped: over } = crossCorpusPairsToScore(a, b, settings, new Set(cache.current.keys()));
        setSkipped(over);
        if (!pairs.length) break;
        const { data, error: fnError } = await supabase.functions.invoke("pair-similarity", { body: { texts, pairs } });
        if (cancelled) return;
        if (fnError || !Array.isArray(data?.scores)) {
          let message = "Meningsjämförelsen misslyckades.";
          try {
            const body = await (fnError as { context?: Response })?.context?.json?.();
            if (body?.error) message = body.code === "credits" ? `AI-krediterna är slut: ${body.error}` : body.error;
          } catch { /* keep generic message */ }
          blocked.current = true;
          setError(message); setStatus("error");
          return;
        }
        data.scores.forEach((score: number, i: number) => cache.current.set(keys[i], score));
        setScores(new Map(cache.current));
        if (!over) break;
      }
      setStatus("ready");
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [a, b, settings, enabled, attempt]);

  const retry = () => { blocked.current = false; setAttempt(n => n + 1); };
  return { scores, status, error, skipped, retry };
}
