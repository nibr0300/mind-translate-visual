import { describe, expect, it } from 'vitest';
import { generateDemoField } from '@/lib/fieldData';
import { parseFieldImport, type FieldImportReport } from '@/lib/fieldImport';

const rawField = () => JSON.parse(JSON.stringify(generateDemoField('didactics')));

describe('self-healing field import', () => {
  it('preserves complete intention scores when optional analysis values are null', () => {
    const raw = rawField();
    raw.units[0].intention = { speechAct: 'expressive', epistemicCertainty: 0.8, intentionalForce: 0.3, truthTension: 0.9, moralTension: null };
    raw.units[0].cti = null;
    let report: FieldImportReport | undefined;
    const field = parseFieldImport(JSON.stringify(raw), r => { report = r; });
    expect(field.units[0].intention).toEqual({ speechAct: 'expressive', epistemicCertainty: 0.8, intentionalForce: 0.3, truthTension: 0.9 });
    expect(field.units[0].cti).toBeUndefined();
    expect(report?.repairedNodes).toBe(1);
    expect(report?.skippedNodes).toBe(0);
    expect(field.stats.notes?.some(n => n.includes('moralTension'))).toBe(true);
  });

  it('drops incomplete intention rather than inventing certainty or speech acts', () => {
    const raw = rawField();
    raw.units[0].intention = { speechAct: 'unknown', truthTension: 0.7 };
    expect(parseFieldImport(JSON.stringify(raw)).units[0].intention).toBeUndefined();
  });

  it('recovers a position from the saved cluster when no node position remains', () => {
    const raw = rawField();
    const cluster = raw.clusters.find((c: { id: number }) => c.id === raw.units[0].clusterId);
    delete raw.units[0].pos; delete raw.units[0].vector2d;
    const restored = parseFieldImport(JSON.stringify(raw));
    expect(restored.units[0].vector2d).toEqual(cluster.center);
    expect(restored.units[0].degenerate).toBe(true);
  });

  it('removes dangling and duplicate-ID links, keeping unrelated valid graph edges', () => {
    const raw = rawField();
    const [a, b, c, d] = raw.units;
    raw.units.push({ ...a });
    raw.units[1].fz = null;
    raw.edges = [{ source: a.id, target: c.id, similarity: 0.8 }, { source: b.id, target: d.id, similarity: 0.7 }, { source: c.id, target: d.id, similarity: 0.9 }];
    const restored = parseFieldImport(JSON.stringify(raw));
    expect(restored.units).toHaveLength(raw.units.length - 2);
    expect(restored.edges).toEqual([{ source: c.id, target: d.id, similarity: 0.9 }]);
  });

  it('rebuilds missing cluster summaries from saved membership, without changing node scores', () => {
    const raw = rawField();
    raw.clusters = []; raw.stats.avgFZ = null;
    const restored = parseFieldImport(JSON.stringify(raw));
    expect(restored.clusters.reduce((sum, c) => sum + c.unitCount, 0)).toBe(raw.units.length);
    expect(restored.units).toEqual(raw.units);
    expect(Number.isFinite(restored.stats.avgFZ)).toBe(true);
    expect(parseFieldImport(JSON.stringify(restored))).toEqual(restored);
  });

  it('fails clearly when every node lacks trustworthy required scores', () => {
    const raw = rawField();
    raw.units = [{ ...raw.units[0], fy: null }];
    expect(() => parseFieldImport(JSON.stringify(raw))).toThrow('Inga användbara noder kvar. 1 noder överhoppade');
  });
});