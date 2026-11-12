import { describe, expect, it } from "vitest";
import { embeddingError } from "../../supabase/functions/_shared/embeddingError";

describe("embedding gateway errors", () => {
  it("preserves the workspace credit-limit 403 and safe reason", () => {
    const error = embeddingError(403, JSON.stringify({ type: "credit_limit_reached", message: "Workspace credit limit reached", details: "internal diagnostics" }));
    expect(error.status).toBe(403);
    expect(error.message).toBe("Workspace credit limit reached");
  });
  it("preserves an insufficient-credit 402", () => {
    expect(embeddingError(402, '{"message":"Add credits to continue"}').status).toBe(402);
  });
  it("does not expose non-JSON upstream diagnostic text", () => {
    expect(embeddingError(503, "private upstream trace").message).not.toContain("private upstream trace");
  });
});