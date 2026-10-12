import { describe, it, expect } from "vitest";
import { extractSecurityUnits, corpusHash, dedupeNearDuplicates } from "@/lib/inputAdapters/securityExtractor";
import { getDomainProfile, lexicalAxisHits } from "@/lib/domainProfiles";
import { applySourceWeight } from "@/lib/domainLayer";

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

  it("source weight halves tension for a blog (0.5) and keeps scope (1.0)", () => {
    const units = [{ fz: 0.8, cti: 0.4 }, { fz: 0.8, cti: 0.4 }] as any[];
    applySourceWeight([units[0]], 0.5);
    applySourceWeight([units[1]], 1.0);
    expect(units[0].fz).toBe(0.4);
    expect(units[0].cti).toBe(0.2);
    expect(units[1].fz).toBe(0.8);
  });

  it("bug bounty profile has 14 axes in three families", () => {
    const p = getDomainProfile("bugbounty");
    expect(p.axes).toHaveLength(14);
    expect(new Set(p.axes.map((a) => a.family))).toEqual(new Set(["Search", "Surface", "Value"]));
  });
});
