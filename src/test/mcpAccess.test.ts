// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MCP_ACCESS_LEVELS, buildMcpAccessRequest } from "@/lib/mcpAccess";

const input = { level: 1, agent: "Aethel", resource: "Bug bounty / fält 42", purpose: "Söka relevanta friktionsområden", globalFederation: false };

describe("resource-specific MCP requests", () => {
  it("uses the supplied real contact address and preserves the requested resource", () => {
    const result = buildMcpAccessRequest(input);
    expect(result.mailto.startsWith("mailto:geometric_friction_field@proton.me?")).toBe(true);
    expect(result.body).toContain("Specifik resurs/fält: Bug bounty / fält 42");
  });
  it("lists the four cumulative requested levels without presenting planned tools as implemented", () => {
    expect(MCP_ACCESS_LEVELS.map((tier) => tier.level)).toEqual([1, 2, 3, 4]);
    expect(MCP_ACCESS_LEVELS[0].tools).toEqual(["list_documents", "search_chunks", "find_friction", "get_corpus_map"]);
    expect(MCP_ACCESS_LEVELS[1].tools).toEqual(["project_situation", "get_field_tensions"]);
    expect(MCP_ACCESS_LEVELS[2].tools).toEqual(["submit_journal", "narrate_node"]);
    expect(MCP_ACCESS_LEVELS[3].tools).toEqual(["ingest_field"]);
    expect(MCP_ACCESS_LEVELS.map((tier) => tier.planned)).toEqual([false, true, true, true]);
  });
  it("keeps global access separate from the requested level", () => {
    expect(buildMcpAccessRequest({ ...input, level: 4 }).body).toContain("Global Federation: Begärs inte");
    expect(buildMcpAccessRequest({ ...input, level: 1, globalFederation: true }).body).toContain("Global Federation: Begärs separat");
  });
  it("rejects requests missing a resource or purpose and invalid levels", () => {
    for (const patch of [{ resource: " " }, { purpose: " " }, { agent: "" }, { level: 5 }]) {
      expect(() => buildMcpAccessRequest({ ...input, ...patch })).toThrow();
    }
  });
});