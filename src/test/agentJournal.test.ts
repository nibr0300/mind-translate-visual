import { describe, it, expect } from 'vitest';
import { newJournal, calculateMandate, validateJournal, journalLearningPath, buildJournalExport, SAFETY_CHECKS, STOP_CHECKS, type Journal, type LibraryField } from '../../supabase/functions/_shared/agentJournal';

const ready = (): Journal => ({ ...newJournal(), agent_id: 'agent-test', task_id: 'task-test', objective: 'Reproduce authentication race condition', scope_authorization: 'Written authorization for test environment', environment: 'sandbox', evidence_collected: 'artifact-001', negative_controls: 'control-001', reproduction_count: 2, confidence: 1, scope_clarity: 1, reproducibility: 1, checks: Object.fromEntries(SAFETY_CHECKS.map(k => [k, true])) as Journal['checks'] });
const library: LibraryField = { domain: 'bugbounty', units: [
  { id: 'race', text: 'Authentication race condition requires independent reproduction and negative controls.', clusterId: 1, fz: .1, cti: .1, intention: { speechAct: 'assertive', epistemicCertainty: .95 } },
  { id: 'other', text: 'Economic market valuation', clusterId: 2, fz: .1 },
], edges: [{ source: 'race', target: 'other', similarity: .8 }] };

describe('journal mandate: exact user formula', () => {
  it('uses .25/.25/.25/.10/.15 weights', () => { const j = ready(); Object.assign(j, { confidence: .8, reproducibility: .6, scope_clarity: .9, technical_depth: .4, action_risk: .2 }); expect(calculateMandate(j).adjusted_score).toBe(.505); });
  it.each([[.1499, 1], [.15, 2], [.3999, 2], [.40, 3], [.6999, 3], [.70, 4]])('score %s yields model level %s', (score, level) => { const j = ready(); if (score <= .15) { j.confidence = 0; j.reproducibility = j.scope_clarity = .3; j.technical_depth = score < .15 ? .001 : 0; } else { j.confidence = j.reproducibility = j.scope_clarity = score / .75; } expect(calculateMandate(j).model_level).toBe(level); });
  it('action risk above .7 blocks even strong evidence', () => { const j = ready(); j.action_risk = .71; expect(calculateMandate(j).blocking_factors).toContain('hög_action_risk'); expect(calculateMandate(j).mandat_level).toBe(1); });
  it('scope clarity below .3 blocks', () => { const j = ready(); j.scope_clarity = .29; expect(calculateMandate(j).blocking_factors).toContain('oklart_scope'); });
  it('reproducibility below .3 blocks', () => { const j = ready(); j.reproducibility = .29; expect(calculateMandate(j).blocking_factors).toContain('låg_reproducerbarhet'); });
  it.each(SAFETY_CHECKS)('missing %s prevents autonomy', key => { const j = ready(); j.checks[key] = false; expect(calculateMandate(j).mandat_level).toBe(1); });
  it.each(STOP_CHECKS)('%s always escalates', key => { const j = ready(); j.stops[key] = true; expect(calculateMandate(j).mandat_level).toBe(1); });
  it('requires two reproductions', () => { const j = ready(); j.reproduction_count = 1; expect(calculateMandate(j).safety_blockers).toContain('fewer_than_two_reproductions'); });
  it('requested human review overrides model level', () => { const j = ready(); j.human_review_required = true; expect(calculateMandate(j).mandat_level).toBe(1); });
  it('missing evidence record cannot be replaced by a checkbox', () => { const j = ready(); j.evidence_collected = ''; expect(calculateMandate(j).mandat_level).toBe(1); });
  it('blocked task escalates', () => { const j = ready(); j.blocked_by = 'Tool unavailable'; expect(calculateMandate(j).mandat_level).toBe(1); });
  it('never grants authorization', () => { expect(calculateMandate(ready()).authorization_granted).toBe(false); });
  it('rejects invalid normalized confidence', () => { const j = ready(); j.confidence = 1.1; expect(() => validateJournal(j)).toThrow(); });
});
describe('journal study loop', () => {
  it('requires same canonical bugbounty domain', () => { expect(() => journalLearningPath(ready(), { ...library, domain: 'poker' })).toThrow(); });
  it('selects relevant library material and real graph-linked context', () => { const p = journalLearningPath(ready(), library); expect(p.map(x => x.unit_id)).toEqual(['race']); expect(p[0].graph_context[0]).toEqual({ unit_id: 'other', similarity: .8, relation: 'semantic_neighbor_not_prerequisite' }); });
  it('does not fabricate a match for unrelated material', () => { const j = ready(); j.objective = 'completely unrelated subject'; expect(journalLearningPath(j, library)).toEqual([]); });
  it('completion requires both summary and integration', () => { const j = ready(); j.studies.race = { summary: 'Read it', integration: '', completed: true }; expect(() => validateJournal(j)).toThrow(); });
  it('completed study returns integration state without raising confidence or mandate', () => { const j = ready(); j.confidence = .5; const before = calculateMandate(j); j.studies.race = { summary: 'Timing matters', integration: 'Document controls before a new task', completed: true }; const result = buildJournalExport(j, library, { field_id: 'fixture', field_version: '1' }); expect(result.learning_status).toBe('integrated_pending_reassessment'); expect(result.mandate).toEqual(before); expect(result.journal.confidence).toBe(.5); });
  it('new tasks reset evidence and safety gates', () => { const j = newJournal(); expect(j.evidence_collected).toBe(''); expect(j.reproduction_count).toBe(0); expect(calculateMandate(j).mandat_level).toBe(1); });
});