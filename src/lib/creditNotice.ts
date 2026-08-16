import { toast } from "sonner";

let lastShown = 0;

/** True if an error looks like an AI-gateway "out of credits" (402) response. */
export function isCreditError(err: unknown): boolean {
  const msg =
    typeof err === "string"
      ? err
      : ((err as any)?.message ?? "") + " " + ((err as any)?.context?.status ?? "");
  return /402|credits|payment_required|top_up/i.test(msg);
}

/** Show a single, human-readable notice (throttled to once per 30s). */
export function notifyCreditsExhausted(): void {
  const now = Date.now();
  if (now - lastShown < 30_000) return;
  lastShown = now;
  toast.warning("AI-krediter slut", {
    description:
      "Fältet byggs vidare utan LLM-lagret (moral/narrativ-axlar och sökindex uteblir). Fyll på i Settings → Workspace → Usage.",
  });
}
