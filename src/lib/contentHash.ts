/**
 * SHA-256 of normalized text. Used as `content_hash` for chunk dedup,
 * enforced by a UNIQUE constraint on (document_id, content_hash).
 */
export async function sha256Hex(input: string): Promise<string> {
  const normalized = input.trim().replace(/\s+/g, " ").toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
