# RFA Agent journal · contract v2

The journal is a reflection and training-material consultation loop. It does not execute security tests, schedule agents, verify raw evidence, grant scope, or change corpus analysis.

## In the app

1. Open a saved field analyzed under Bug Bounty.
2. Open **Agentjournal · Bug Bounty** and fill in the agent, task, reflection, needs and evidence references. Do not paste credentials, tokens, personal data or sensitive raw evidence.
3. Use **Lässpår** to read suggested units, write a summary and describe how the material changes the next decision. Both written fields are required before marking a study complete.
4. Use **Utveckling** to link completed material, record learning effort, before/after skill measurements using the same rubric, application evidence, assessment basis and assessor. Record supervision time per comparable task, responsibility and the decisions proposed for greater independence within existing authorization. The old mandate model remains a collapsed, separate reference.
5. Save the journal and download **agent_mandate_export.json**. Start the next task with fresh evidence and safety checks.

Drafts and the latest 100 saved entries are stored locally on this device, separated by signed-in user. They are not cloud-synced. Export a backup before changing devices. The journal history is a working record, not a tamper-proof audit log.

## External agent loop

Use the existing field-api URL from the Account panel, appending `/journal`, and the personal API key created there.

```http
POST <field-api URL>/journal
Authorization: Bearer <personal API key>
Content-Type: application/json
```

```json
{
  "field_id": "<UUID of an owned Bug Bounty field>",
  "journal": "<replace with the complete object from agent_journal_template.json>"
}
```

`journal` must be an object, not a string. The downloadable journal template contains the complete required structure. Set `agent_id`, `task_id` and `objective` and supply actual observations. All five numeric assessment values must be between 0 and 1. Missing/unknown safety conditions remain false. Requests are limited to 2 MB and fields to 2000 units; irrelevant or inaccessible fields are not silently substituted.

The endpoint accepts only an owned field whose canonical domain is `bugbounty`. An unknown, wrong-domain or another user's field returns 404. Invalid journals return 400. No journal is persisted by the endpoint: the calling agent stores its private journal and study history itself. The browser accepts the same object through **Importera journal**, or a returned export containing `journal`.

## Response

- `schema: "rfa.agent-journal"`, `version: 2` (v1 journal inputs still accepted)
- `journal`: submitted reflection, evidence references, assessments and studies
- `provenance`: field ID and field version
- `competence_development`: submitted skill change, effort, linked completed material, application/assessment references, supervision-time change and proposed autonomy. These are reported observations, not proof of causal training impact or independently verified competence.
- `mandate`: exact weighted model level, safety-constrained level, blockers, score and `authorization_granted: false`
- `learning_path`: up to eight relevant text units, source/node references, selection scores and submitted study progress
- `learning_status`: `no_relevant_material`, `study_pending`, or `integrated_pending_reassessment`
- `safeguards`: explicit limitations

Retrieval currently uses lexical overlap plus CTI/field stability and reported epistemic certainty. It is not embedding-based, a verified prerequisite graph, a measure of agent competence, or proof of causality. Browser exports include existing graph neighbors when available; server responses do not fabricate missing chunk-level graph edges. Cross-language or indirect conceptual matches may yield no material. A missing match requires better library material or a more specific journal, not weaker safety conditions.

The caller should: submit journal → read returned material → record summary and decision integration in `studies[unit_id]` → apply learning → assess professional skill on comparable tasks → propose a wider independent role within existing authorization → record the external system's decision and subsequent outcomes. Routine supervision should decrease when demonstrated capability supports it, not remain a permanent substitute for self-regulation. The external executor retains its existing permissions, safeguards and scheduling. No action is performed by a returned level or by `autonomous_continuation_eligible`; legal accountability is not transferred to an agent.

The optional `journal.competence` object has `skill`, `before`/`after` (0–1), `effort_minutes`, `application_evidence`, `assessment_basis`, `assessed_by`, `responsibility_reflection`, `autonomy_scope`, `current_autonomy`/`proposed_autonomy` (1–4), `supervision_before_minutes`/`supervision_after_minutes` and `material_ids`. Time values are nonnegative minutes. Downloading the journal template initializes this object. A supported progression proposal requires positive skill change, at least one linked completed study, a named skill, evidence, assessment basis, assessor, responsibility reflection and autonomy scope. It still requires an external decision; the app neither verifies the evidence nor changes actual authorization. No arbitrary impact weights or automatic mandate increments are used.

Weighted score: `.25*confidence + .25*reproducibility + .25*scope_clarity - .10*technical_depth - .15*action_risk`.
Model hard stops: risk > .7, scope clarity < .3, reproducibility < .3. Model thresholds: < .15 level 1, < .40 level 2, < .70 level 3, otherwise level 4. Separate evidence and safety gates can force effective level 1 regardless of model score.