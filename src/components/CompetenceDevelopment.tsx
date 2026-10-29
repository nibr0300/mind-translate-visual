import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { newCompetenceAssessment, assessCompetenceDevelopment, type Journal, type CompetenceAssessment } from '../../supabase/functions/_shared/agentJournal';

export default function CompetenceDevelopment({ journal, disabled, onChange }: { journal: Journal; disabled: boolean; onChange: (value: CompetenceAssessment) => void }) {
  const c = journal.competence ?? newCompetenceAssessment();
  const result = assessCompetenceDevelopment(journal);
  const update = (patch: Partial<CompetenceAssessment>) => onChange({ ...c, ...patch });
  const levels = ['Handledd tillämpning', 'Självständigt med stickprov', 'Självständigt med loggning', 'Självständigt inom hela angiven scope'];
  return <section className="space-y-5">
    <div className="grid sm:grid-cols-3 gap-4 border-b border-border pb-4">
      <div><p className="text-xs text-muted-foreground">Bedömd färdighetsförändring</p><p className="text-lg text-field-fy">{result.skill_change > 0 ? '+' : ''}{(result.skill_change * 100).toFixed(0)} procentenheter</p></div>
      <div><p className="text-xs text-muted-foreground">Utvecklingsinsats</p><p className="text-lg">{c.effort_minutes} min</p></div>
      <div><p className="text-xs text-muted-foreground">Bedömd frigjord handledningstid</p><p className="text-lg">{result.supervision_minutes_change} min / jämförbart uppdrag</p></div>
    </div>
    <fieldset disabled={disabled} className="space-y-4">
      <label className="block text-xs space-y-2">Yrkesfärdighet<Input value={c.skill} onChange={e => update({ skill: e.target.value })} /></label>
      <div className="grid sm:grid-cols-3 gap-4">{([['before', 'Färdighet före · 0–1'], ['after', 'Färdighet efter · samma mått'], ['effort_minutes', 'Studier och tillämpning · minuter'], ['supervision_before_minutes', 'Handledningsminuter före'], ['supervision_after_minutes', 'Handledningsminuter efter']] as const).map(([k, label]) => <label key={k} className="block text-xs space-y-2">{label}<Input type="number" min="0" max={k === 'before' || k === 'after' ? 1 : 1000000} step={k === 'before' || k === 'after' ? .05 : 1} value={c[k]} onChange={e => update({ [k]: Math.max(0, Math.min(k === 'before' || k === 'after' ? 1 : 1000000, Number(e.target.value))) })} /></label>)}</div>
      <div className="space-y-2"><h3 className="text-sm text-primary">Material som bidrog till färdigheten</h3>{Object.entries(journal.studies).filter(([, s]) => s.completed).map(([id]) => <label key={id} className="flex gap-2 text-xs items-center"><input type="checkbox" checked={c.material_ids.includes(id)} onChange={e => update({ material_ids: e.target.checked ? [...c.material_ids, id] : c.material_ids.filter(x => x !== id) })} />{id}</label>)}{!Object.values(journal.studies).some(s => s.completed) && <p className="text-xs text-muted-foreground">Inga slutförda studier registrerade.</p>}</div>
      {([['application_evidence', 'Tillämpning och resultat · bevisreferenser'], ['assessment_basis', 'Bedömningsgrund · jämförbara uppgifter och alternativa förklaringar'], ['assessed_by', 'Bedömare eller utvärderingsverktyg'], ['autonomy_scope', 'Vilka beslut kan nu utföras självständigt inom befintligt mandat?'], ['responsibility_reflection', 'Egenkontroll, ansvar och uppföljning av beslut']] as const).map(([k, label]) => <label key={k} className="block text-xs space-y-2">{label}<Textarea maxLength={12000} value={c[k]} onChange={e => update({ [k]: e.target.value })} /></label>)}
      <div className="grid sm:grid-cols-2 gap-4">{([['current_autonomy', 'Nuvarande självständighet'], ['proposed_autonomy', 'Föreslagen självständighet']] as const).map(([k, label]) => <label key={k} className="block text-xs space-y-2">{label}<select className="w-full h-10 rounded-md border border-input bg-background text-foreground px-2" value={c[k]} onChange={e => update({ [k]: Number(e.target.value) })}>{levels.map((level, i) => <option key={level} value={i + 1}>{i + 1}. {level}</option>)}</select></label>)}</div>
    </fieldset>
    <p className="text-sm text-field-fy" role="status">{result.progression_status === 'supported_proposal_pending_external_decision' ? 'Dokumenterat underlag för större självständighet · beslut i agentens befintliga system återstår' : result.progression_status === 'proposal_needs_application_evidence' ? 'Förslaget behöver dokumenterad färdighetsökning, material, tillämpning och ansvar' : 'Bibehållen självständighet eller omprövning'}</p>
    <p className="text-xs text-muted-foreground">Bedömningen är rapporterad, inte oberoende verifierad. Mandat och juridiskt ansvar ändras inte av exporten.</p>
  </section>;
}