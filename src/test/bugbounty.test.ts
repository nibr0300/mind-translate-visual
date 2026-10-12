import { describe, it, expect } from "vitest";
import { extractSecurityUnits, corpusHash, dedupeNearDuplicates } from "@/lib/inputAdapters/securityExtractor";
import { getDomainProfile, lexicalAxisHits } from "@/lib/domainProfiles";
import { applySourceWeight, calibratedFz, isDirective } from "@/lib/domainLayer";

const ENDPOINTS = Array.from({ length: 30 }, (_, i) => `POST /api/v2/resource${i}/{id}/transfer`);
const HOSTS = Array.from({ length: 20 }, (_, i) => `svc${i}.target-example.com`);
const FIXTURE = [
  "Skip to content",
  "Powered by Acme",
  "Learn more",
  "The following assets are in scope for this program and bounty eligible.",
  ...ENDPOINTS.map((e) => `The service exposes ${e} for authenticated members.`),
  ...HOSTS.map((h) => `Host ${h} is part of the wildcard.`),
].join("\n\n");

describe("bug bounty ingestion", () => {
  it("is deterministic: same fixture gives the same corpus hash", () => {
    const a = extractSecurityUnits(FIXTURE).units;
    const b = extractSecurityUnits(FIXTURE).units;
    expect(corpusHash(a)).toBe(corpusHash(b));
  });

  it("gives every unit an offset into its source", () => {
    const { units } = extractSecurityUnits(FIXTURE);
    expect(units.every((u) => Number.isInteger(u.start) && u.end > u.start)).toBe(true);
  });

  it("drops noise lines with a reason and loses no endpoint", () => {
    const { units, dropped } = extractSecurityUnits(FIXTURE);
    expect(dropped.map((d) => d.text)).toEqual(expect.arrayContaining(["Skip to content", "Powered by Acme", "Learn more"]));
    expect(dropped.every((d) => d.reason.length > 0)).toBe(true);
    expect(units.filter((u) => u.unitType === "endpoint")).toHaveLength(30);
  });

  it("recalls at least 95% of 50 known endpoints and hostnames", () => {
    const texts = new Set(extractSecurityUnits(FIXTURE).units.map((u) => u.text));
    const found = [...ENDPOINTS, ...HOSTS].filter((t) => texts.has(t)).length;
    expect(found / 50).toBeGreaterThanOrEqual(0.95);
  });

  it("near-dedup keeps the copy from the highest-weighted source", () => {
    const kept = dedupeNearDuplicates([
      { text: "POST /api/v2/accounts/{id}/transfer", weight: 0.5 },
      { text: "POST /api/v2/accounts/{id}/transfer", weight: 1.0 },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].weight).toBe(1.0);
  });

  it("scores 'out of scope / third party' towards the adjacent pole", () => {
    const hits = lexicalAxisHits("This affiliate domain is out of scope and owned by a third party.", getDomainProfile("bugbounty"));
    expect(hits.scope_adjacent).toBe(1);
  });

  it("source weight scales by 0.5+0.5w: blog (0.5) keeps 75%, scope (1.0) keeps all", () => {
    const units = [{ fz: 0.8, cti: 0.4 }, { fz: 0.8, cti: 0.4 }] as any[];
    applySourceWeight([units[0]], 0.5);
    applySourceWeight([units[1]], 1.0);
    expect(units[0].fz).toBe(0.6);
    expect(units[0].cti).toBe(0.3);
    expect(units[1].fz).toBe(0.8);
  });

  const p = getDomainProfile("bugbounty");
  it("trust_boundary catches 'gateway trusts the header' on the client_trust pole", () => {
    expect(lexicalAxisHits("The gateway trusts the X-Vela-User header passed upstream.", p).trust_boundary).toBe(0);
  });
  it("signature_semantics catches same secret across environments", () => {
    const h = lexicalAxisHits("Webhooks are HMAC signed with the same secret across environments.", p);
    expect(h.signature_semantics).toBe(0);
    expect(h.scope_adjacent).toBeGreaterThan(0.5);
  });
  it("single_chain fires on 'two P3s may be combined into a P2'", () => {
    expect(lexicalAxisHits("Two P3s may be combined into a P2.", p).single_chain).toBe(1);
  });
  it("passive_active no longer fires on observed/prefer/carries", () => {
    expect(lexicalAxisHits("We observed it seemed to prefer the one that carries truly.", p).passive_active).toBeUndefined();
  });
  it("word boundaries: 'trace' is not 'race', 'controller' is not 'role'", () => {
    const h = lexicalAxisHits("The trace from the controller.", p);
    expect(h.stateless_race).toBeUndefined();
    expect(h.authn_authz).toBeUndefined();
  });
  it("a scope table becomes one unit per row, keeping api-eu its own node", () => {
    const { units } = extractSecurityUnits("| Asset | Type |\n|---|---|\n| api.vela.io | API |\n| api-eu.vela.io | served from different root |");
    expect(units.filter((u) => u.unitType === "prose" && u.text.includes("api-eu.vela.io"))).toHaveLength(1);
    expect(units.some((u) => u.unitType === "hostname" && u.text === "api-eu.vela.io")).toBe(true);
  });
  it("never drops headings or short lines with an amount or status", () => {
    const { units } = extractSecurityUnits("## Outcome\n\nP2, $1800.\n\nDebate in comments.");
    const texts = units.map((u) => u.text);
    expect(texts).toEqual(expect.arrayContaining(["Outcome", "P2, $1800.", "Debate in comments."]));
  });
  it("FZ: a plain rule lands at or below 0.42, a planted tension at or above 0.50", () => {
    expect(isDirective("No destructive testing.")).toBe(true);
    const w = p.fzCalibration!;
    const rule = calibratedFz({ llmTension: 0.5, triangulated: 0.3, cti: 0.2, distinctAxes: 1, opposition: false, directive: true }, w);
    const tension = calibratedFz({ llmTension: 0.55, triangulated: 0.4, cti: 0.3, distinctAxes: 2, opposition: false, directive: false }, w);
    expect(rule).toBeLessThanOrEqual(0.42);
    expect(tension).toBeGreaterThanOrEqual(0.5);
  });

  it("bug bounty profile has 14 axes in three families", () => {
    const p = getDomainProfile("bugbounty");
    expect(p.axes).toHaveLength(14);
    expect(new Set(p.axes.map((a) => a.family))).toEqual(new Set(["Search", "Surface", "Value"]));
  });
});
