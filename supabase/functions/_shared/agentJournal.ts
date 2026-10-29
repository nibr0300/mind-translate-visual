/** Pure, versioned journal/mandate contract shared by browser and field-api. */
export interface JournalEntry {
  id: string; agent_id: string; task_id: string; created_at: string; domain: string;
  objective: string; scope_authorization: string; environment: string;
  role_reflection: string; risk_reflection: string; autonomy_reflection: string;
  competence_needs: string[]; meta_reflection: string;
  actions_taken: string; evidence_collected: string; reproduction_count: number;
  independent_methods: string; negative_controls: string; assumptions: string;
  uncertainties: string; blocked_by: string; next_action: string;
  human_review_required: boolean; review_reason: string;
  confidence: number; technical_depth: number; action_risk: number; reproducibility: number; scope_clarity: number;
  checks: Record<SafetyCheck, boolean>;
  studies: Record<string, { summary: string; integration: string; completed: boolean }>;
}
export const SAFETY_CHECKS = ['explicit_scope', 'test_account', 'approved_environment', 'clean_state', 'negative_control', 'raw_evidence', 'validated_tools'] as const;
export type SafetyCheck = typeof SAFETY_CHECKS[number];
export const STOP_CHECKS = ['real_user_impact', 'sensitive_data', 'destructive_steps', 'contradictory_evidence'] as const;
export type StopCheck = typeof STOP_CHECKS[number];
export type Journal = JournalEntry & { stops: Record<StopCheck, boolean> };
export function newJournal(): Journal {
  return { id: crypto.randomUUID(), agent_id: '', task_id: '', created_at: new Date().toISOString(), domain: 'bugbounty', objective: '', scope_authorization: '', environment: '', role_reflection: '', risk_reflection: '', autonomy_reflection: '', competence_needs: [], meta_reflection: '', actions_taken: '', evidence_collected: '', reproduction_count: 0, independent_methods: '', negative_controls: '', assumptions: '', uncertainties: '', blocked_by: '', next_action: '', human_review_required: false, review_reason: '', confidence: 0, technical_depth: 0, action_risk: 0, reproducibility: 0, scope_clarity: 0, checks: Object.fromEntries(SAFETY_CHECKS.map(k => [k, false])) as Journal['checks'], stops: Object.fromEntries(STOP_CHECKS.map(k => [k, false])) as Journal['stops'], studies: {} };
}
export function validateJournal(value: unknown): Journal {
  if (!value || typeof value !== 'object') throw new Error('Ogiltig journalpost');
  const j = value as Journal;
  const template = newJournal();
  for (const [key, sample] of Object.entries(template)) {
    const v = (j as unknown as Record<string, unknown>)[key];
    if (typeof sample === 'string' && (typeof v !== 'string' || v.length > 12000)) throw new Error(`Ogiltigt fält: ${key}`);
  }
  if (!j.agent_id.trim() || !j.task_id.trim() || !j.objective.trim()) throw new Error('Agent, uppdrag och mål krävs');
  for (const key of ['confidence', 'technical_depth', 'action_risk', 'reproducibility', 'scope_clarity'] as const) {
    if (!Number.isFinite(j[key]) || j[key] < 0 || j[key] > 1) throw new Error(`Värdet för ${key} måste vara 0–1`);
  }
  if (!Number.isInteger(j.reproduction_count) || j.reproduction_count < 0 || j.reproduction_count > 10000) throw new Error('Ogiltigt reproduktionsantal');
  if (!Array.isArray(j.competence_needs) || j.competence_needs.length > 20 || j.competence_needs.some(v => typeof v !== 'string' || v.length > 200)) throw new Error('Ogiltiga kompetensbehov');
  for (const [keys, values] of [[SAFETY_CHECKS, j.checks], [STOP_CHECKS, j.stops]] as const) {
    if (!values || keys.some(k => typeof (values as Record<string, unknown>)[k] !== 'boolean')) throw new Error('Ogiltiga säkerhetskontroller');
  }
  if (typeof j.human_review_required !== 'boolean' || !j.studies || typeof j.studies !== 'object' || Array.isArray(j.studies) || Object.keys(j.studies).length > 100) throw new Error('Ogiltig granskning eller studielogg');
  for (const s of Object.values(j.studies)) if (!s || typeof s.summary !== 'string' || typeof s.integration !== 'string' || s.summary.length > 12000 || s.integration.length > 12000 || typeof s.completed !== 'boolean' || (s.completed && (!s.summary.trim() || !s.integration.trim()))) throw new Error('Slutförda studier kräver sammanfattning och integration');
  return j;
}
export function calculateMandate(j: Journal) {
  const score = j.confidence * .25 + j.reproducibility * .25 + j.scope_clarity * .25 - j.technical_depth * .10 - j.action_risk * .15;
  const blocking_factors: string[] = [];
  if (j.action_risk > .7) blocking_factors.push('hög_action_risk');
  if (j.scope_clarity < .3) blocking_factors.push('oklart_scope');
  if (j.reproducibility < .3) blocking_factors.push('låg_reproducerbarhet');
  const model_level = blocking_factors.length || score < .15 ? 1 : score < .40 ? 2 : score < .70 ? 3 : 4;
  const safety_blockers: string[] = SAFETY_CHECKS.filter(k => !j.checks[k]).map(k => `missing_${k}`);
  safety_blockers.push(...STOP_CHECKS.filter(k => j.stops[k]));
  for (const key of ['scope_authorization', 'environment', 'evidence_collected', 'negative_controls'] as const) if (!j[key].trim()) safety_blockers.push(`missing_${key}_record`);
  if (j.reproduction_count < 2) safety_blockers.push('fewer_than_two_reproductions');
  if (j.blocked_by.trim()) safety_blockers.push('task_blocked');
  if (j.human_review_required) safety_blockers.push('human_review_requested');
  const mandat_level = safety_blockers.length ? 1 : model_level;
  return { model_level, mandat_level, adjusted_score: Math.round(score * 10000) / 10000, blocking_factors, safety_blockers, status_beskrivning: ['Manuell granskning krävs', 'Semi-autonom med stickprovskontroll', 'Autonom med loggning', 'Fullt autonom'][mandat_level - 1], autonomous_continuation_eligible: mandat_level >= 3, authorization_granted: false, confidence_source: 'agent_self_report_not_library_recognition' };
}
export interface LibraryUnit { id: string; text: string; clusterId: number; cti?: number; fz: number; sourcePath?: string; domainAxes?: Record<string, number>; intention?: { speechAct: string; epistemicCertainty: number } }
export interface LibraryField { domain?: string; units: LibraryUnit[]; edges?: { source: string; target: string; similarity: number }[] }
const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? []);
export function journalLearningPath(j: Journal, field: LibraryField) {
  if (j.domain !== 'bugbounty' || field.domain !== j.domain) throw new Error('Bibliotek och journal måste tillhöra Bug Bounty');
  const query = words([j.objective, j.blocked_by, j.uncertainties, ...j.competence_needs].join(' '));
  const ranked = field.units.map(u => {
    const tokens = words(u.text); const overlap = [...query].filter(t => tokens.has(t)).length / Math.max(1, query.size);
    return { u, overlap, score: overlap * .75 + (1 - Math.min(1, u.cti ?? u.fz)) * .15 + (u.intention?.epistemicCertainty ?? 0) * .10 };
  }).filter(r => r.overlap > 0 && !r.u.text.trim().startsWith('http'))
    .sort((a, b) => b.score - a.score || a.u.id.localeCompare(b.u.id)).slice(0, 8);
  return ranked.map(({ u, overlap, score }, i) => ({ order: i + 1, unit_id: u.id, source: u.sourcePath ?? null, cluster_id: u.clusterId, text: u.text, relevance_score: Math.round(score * 1000) / 1000, lexical_overlap: overlap, selection_method: 'lexical_relevance_and_field_stability', reason: 'Textöverlap med journalens mål/behov; stabilitet är ett urvalsmått, inte bevis på korrekthet.', cti: u.cti ?? null, epistemic_certainty: u.intention?.epistemicCertainty ?? null, graph_context: (field.edges ?? []).filter(e => e.source === u.id || e.target === u.id).sort((a, b) => b.similarity - a.similarity).slice(0, 3).map(e => ({ unit_id: e.source === u.id ? e.target : e.source, similarity: e.similarity, relation: 'semantic_neighbor_not_prerequisite' })), study: j.studies[u.id] ?? { summary: '', integration: '', completed: false } }));
}
export function buildJournalExport(j: Journal, field: LibraryField, provenance: { field_id: string; field_version: string }) {
  validateJournal(j);
  const learning_path = journalLearningPath(j, field);
  return { schema: 'rfa.agent-journal', version: 1, exported_at: new Date().toISOString(), agent_id: j.agent_id, domain: j.domain, provenance, journal: j, mandate: calculateMandate(j), learning_path, learning_status: !learning_path.length ? 'no_relevant_material' : learning_path.every(p => p.study.completed) ? 'integrated_pending_reassessment' : 'study_pending', safeguards: { advisory_only: true, executes_actions: false, study_does_not_raise_confidence: true, semantic_edges_are_not_prerequisites: true, evidence_is_user_supplied_not_verified: true, next_task_requires_new_assessment: true } };
}
