/** Preserve gateway status and its safe message, not the raw diagnostic body. */
export class EmbeddingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function embeddingError(status: number, raw: string): EmbeddingError {
  let message = "AI embedding service could not complete this request.";
  try {
    const detail = JSON.parse(raw);
    const safe = detail.message ?? detail.error?.message;
    if (typeof safe === "string" && safe.trim()) message = safe.slice(0, 1200);
  } catch { /* Do not expose raw upstream diagnostics. */ }
  return new EmbeddingError(status, message);
}