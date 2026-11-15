// @vitest-environment node
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
  it("samples overflowing theory structures across the beginning, middle and end", () => {
    const chunks = mk("formula", 1200);
    const { kept, sourceCount } = balanceChunks(chunks, 600);
    expect(kept).toHaveLength(600);
    expect(sourceCount).toBe(1);
    expect(kept[0]).toBe(chunks[0]);
    expect(kept[kept.length - 1]).toBe(chunks[1199]);
    expect(kept.some((c) => c === chunks[600] || c === chunks[601])).toBe(true);
    expect(new Set(kept).size).toBe(600);
    expect(kept).toEqual(chunks.filter((c) => kept.includes(c)));
  });
  it("shares an overflowing recon budget across later files and redistributes spare slots", () => {
    const early = mk("endpoint", 1000, "early.txt");
    const small = mk("host", 10, "small.txt");
    const late = mk("endpoint", 1000, "late.txt");
    const prose = mk("prose", 200, "notes.txt");
    const { kept, sourceCount } = balanceChunks([...early, ...small, ...late, ...prose], 600);
    expect(kept).toHaveLength(600);
    expect(sourceCount).toBe(4);
    expect(kept.filter((c) => early.includes(c))).toHaveLength(295);
    expect(kept.filter((c) => late.includes(c))).toHaveLength(295);
    expect(small.every((c) => kept.includes(c))).toBe(true);
    expect(kept).toContain(early[999]);
    expect(kept).toContain(late[999]);
    expect(kept.some((c) => prose.includes(c))).toBe(false);
  });
});
