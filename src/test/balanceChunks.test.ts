import { describe, it, expect } from "vitest";
import { balanceChunks } from "@/lib/fieldGenerator";
const mk = (type: string, n: number, file = "doc.pdf") =>
  Array.from({ length: n }, (_, i) => ({ source: `${file}#${type}@${i}` }));
describe("balanceChunks", () => {
  it("keeps all structural units and fills the cap with prose in one document", () => {
    const chunks = [...mk("formula", 29), ...mk("axiom", 4), ...mk("definition", 16), ...mk("prose", 1100)];
    const { kept, sourceCount } = balanceChunks(chunks, 600);
    expect(kept.length).toBe(600);
    expect(sourceCount).toBe(1);
    expect(kept.filter((c) => !c.source.includes("#prose")).length).toBe(49);
  });
  it("redistributes unused budget across files", () => {
    const chunks = [...mk("prose", 10, "a"), ...mk("prose", 1000, "b")];
    expect(balanceChunks(chunks, 600).kept.length).toBe(600);
  });
});
