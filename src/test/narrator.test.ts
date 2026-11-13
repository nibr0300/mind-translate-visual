import { describe, it, expect } from 'vitest';
import { cleanNarratorText, isFrictionNode, isSilentNode, narratorScore, prepareNarrator, narratorAutoLimit, narratorJsonl, narratorBatch, narratorProvenance, NARRATOR_SYSTEM, NARRATOR_VERSION, LEGACY_NARRATOR_SYSTEM, type NarratorItem } from '@/lib/narrator';
import { type FieldUnit, type GeometricField } from '@/lib/fieldData';

const node = (id: string, patch: Partial<FieldUnit> = {}): FieldUnit => ({ id, text: `Konkreta beslut om varians och motståndarens dolda möjligheter ${id}.`, pos: { x: 0, y: 0 }, vector2d: [0, 0], clusterId: 0, type: 'paragraph', fz: 0.1, fy: 0.1, cti: 0.1, ...patch });
const field = (units: FieldUnit[], edges?: GeometricField['edges']): GeometricField => ({ units, edges, clusters: [], stats: { totalUnits: units.length, boundaryUnits: 0, avgFZ: 0, avgFY: 0 }, useCase: 'uploaded' });

describe('Narrator selection and export rules', () => {
  it('scales example count beyond ten for larger eligible material', () => {
    expect(narratorAutoLimit(50)).toBe(10);
    expect(narratorAutoLimit(600)).toBe(120);
    expect(narratorAutoLimit(1200)).toBe(240);
  });
  it('never exceeds eligible material or the 500-answer cost ceiling', () => {
    expect(narratorAutoLimit(0)).toBe(0);
    expect(narratorAutoLimit(7)).toBe(7);
    expect(narratorAutoLimit(3000)).toBe(500);
  });
  it('rejects null/binary remnants', () => expect(cleanNarratorText('En lång text med tydlig betydelse\u0000 bland rester')).toBeNull());
  it('rejects fragments below 25 characters', () => expect(cleanNarratorText('a'.repeat(24))).toBeNull());
  it('retains readable multilingual text and code', () => {
    expect(cleanNarratorText('概率与风险之间的关系需要根据实际情况进行谨慎判断和独立核验。')).not.toBeNull();
    expect(cleanNarratorText('def calculate_equity(range): return sum(range) / len(range)')).not.toBeNull();
  });
  it('selects FZ at 0.35', () => { expect(isFrictionNode(node('a', { fz: 0.35 }))).toBe(true); expect(isFrictionNode(node('a', { fz: 0.349 }))).toBe(false); });
  it('selects truth tension at 0.5', () => {
    const intention = { speechAct: 'assertive' as const, epistemicCertainty: 0.9, intentionalForce: 0.5, truthTension: 0.5 };
    expect(isFrictionNode(node('a', { intention }))).toBe(true);
    expect(isFrictionNode(node('a', { intention: { ...intention, truthTension: 0.499 } }))).toBe(false);
  });
  it('selects CTI at 0.25', () => { expect(isFrictionNode(node('a', { cti: 0.25 }))).toBe(true); expect(isFrictionNode(node('a', { cti: 0.249 }))).toBe(false); });
  it('silent FZ must be below 0.2', () => { expect(isSilentNode(node('a', { fz: 0.199 }))).toBe(true); expect(isSilentNode(node('a', { fz: 0.2 }))).toBe(false); });
  it('silent FY must be below 0.3', () => { expect(isSilentNode(node('a', { fy: 0.299 }))).toBe(true); expect(isSilentNode(node('a', { fy: 0.3 }))).toBe(false); });
  it('silent CTI must be below 0.15 and present', () => { expect(isSilentNode(node('a', { cti: 0.149 }))).toBe(true); expect(isSilentNode(node('a', { cti: 0.15 }))).toBe(false); expect(isSilentNode(node('a', { cti: undefined }))).toBe(false); });
  it('takes three strongest distinct graph neighbors in either direction', () => {
    const f = field(['a', 'b', 'c', 'd', 'e'].map(id => node(id)), [{ source: 'b', target: 'a', similarity: 0.9 }, { source: 'a', target: 'b', similarity: 0.8 }, { source: 'a', target: 'c', similarity: 0.7 }, { source: 'a', target: 'd', similarity: 0.6 }, { source: 'a', target: 'e', similarity: 0.4 }]);
    expect(narratorScore(f, f.units[0], 'test').neighbors.map(n => n.id)).toEqual(['b', 'c', 'd']);
  });
  it('legacy spatial fallback is same-cluster and never a semantic score', () => {
    const f = field([node('a'), node('b', { vector2d: [1, 0] }), node('c', { clusterId: 1 })]);
    expect(narratorScore(f, f.units[0], 'test').neighbors).toEqual([expect.objectContaining({ id: 'b', method: 'spatial', similarity: null })]);
  });
  it('filters duplicate texts before paid generation', () => {
    const u = node('a', { fz: 0.5 }); const result = prepareNarrator([{ name: 'a', field: field([u]) }, { name: 'b', field: field([{ ...u, id: 'b' }]) }]);
    expect(result.candidates).toHaveLength(1); expect(result.duplicates).toBe(1);
  });
  it('never puts silent nodes in the paid candidate queue', () => {
    const result = prepareNarrator([{ name: 'a', field: field([node('a')]) }], { fz: 0, truth: 0, cti: 0 });
    expect(result.candidates).toHaveLength(0); expect(result.baseline).toHaveLength(1);
  });
  it('exports only nonempty human-approved answers with exactly three messages and no provenance', () => {
    const f = field([node('a')]); const score = narratorScore(f, f.units[0], 'private-source');
    const items: NarratorItem[] = [{ score, answer: ' Godkänt svar ', review: 'approved', voiceVersion: NARRATOR_VERSION }, { score, answer: 'utkast', review: 'pending' }, { score, answer: 'nej', review: 'rejected' }, { score, answer: '', review: 'approved' }];
    expect(narratorJsonl(items)).toBe(JSON.stringify({ messages: [{ role: 'system', content: NARRATOR_SYSTEM }, { role: 'user', content: f.units[0].text }, { role: 'assistant', content: 'Godkänt svar' }] }));
    expect(JSON.parse(narratorBatch(items).split('\n')[0]).score.source).toBe('private-source');
  });
  it('preserves the original voice of unversioned saved answers instead of relabeling them v2', () => {
    const f = field([node('legacy')]);
    const item: NarratorItem = { score: narratorScore(f, f.units[0], 'saved'), answer: 'Tidigare godkänt svar', review: 'approved' };
    expect(JSON.parse(narratorJsonl([item])).messages[0].content).toBe(LEGACY_NARRATOR_SYSTEM);
    expect(JSON.parse(narratorProvenance([item])).records[0].voiceVersion).toBe('rfa-narrator-v1');
  });
  it('marks new offline requests v2 while leaving source scores unchanged', () => {
    const f = field([node('new', { fz: 0.739, fy: 0.97, cti: 0.4 })]);
    const item: NarratorItem = { score: narratorScore(f, f.units[0], 'saved'), answer: '', review: 'pending' };
    const request = JSON.parse(narratorBatch([item]));
    expect(request.version).toBe('rfa-narrator-v2');
    expect(request.score.target).toEqual(item.score.target);
    expect(item.voiceVersion).toBeUndefined();
  });
});