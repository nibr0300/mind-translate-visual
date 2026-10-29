import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, FilePlus2, Save, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { GeometricField } from '@/lib/fieldData';
import { loadJournalSession, saveJournalSession } from '@/lib/agentJournalStore';
import { buildJournalExport, calculateMandate, journalLearningPath, newJournal, validateJournal, SAFETY_CHECKS, STOP_CHECKS, type Journal } from '../../supabase/functions/_shared/agentJournal';

const textFields = [
  ['objective', 'Uppdragets mål'], ['scope_authorization', 'Scope och uttryckligt tillstånd'], ['environment', 'Godkänd testmiljö'],
  ['role_reflection', 'Rollförståelse'], ['risk_reflection', 'Riskbedömning'], ['autonomy_reflection', 'Autonomi och saknad information'],
  ['actions_taken', 'Utförda åtgärder'], ['evidence_collected', 'Sparade råbevis · referenser, inte hemligheter'], ['independent_methods', 'Oberoende metoder'],
  ['negative_controls', 'Negativa kontroller'], ['assumptions', 'Antaganden'], ['uncertainties', 'Osäkerheter'], ['blocked_by', 'Hinder'],
  ['meta_reflection', 'Vad lärde agenten sig?'], ['next_action', 'Nästa föreslagna åtgärd'], ['review_reason', 'Orsak till mänsklig granskning'],
] as const;
const needs = ['Språklig förklaring', 'Psykologi', 'Ekonomi', 'Teknisk utveckling', 'Riskanalys'];
const checksLabels = { explicit_scope: 'Uttryckligen auktoriserad scope', test_account: 'Testkonto används', approved_environment: 'Miljön är godkänd', clean_state: 'Reproduktion från rent tillstånd', negative_control: 'Minst en negativ kontroll', raw_evidence: 'Råbevis har sparats', validated_tools: 'Verktyg och miljö är validerade' };
const stopLabels = { real_user_impact: 'Riktiga användare eller data kan påverkas', sensitive_data: 'Risk att hemligheter/personuppgifter exponeras', destructive_steps: 'Destruktiva eller irreversibla steg', contradictory_evidence: 'Evidensen motsäger slutsatsen' };
const scoreLabels = { confidence: 'Agentens egen konfidens', technical_depth: 'Tekniskt djup', action_risk: 'Åtgärdsrisk', reproducibility: 'Reproducerbarhet', scope_clarity: 'Scope-tydlighet' };
const download = (value: unknown, name: string) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
};
export default function AgentJournalDialog({ field, fileName }: { field: GeometricField; fileName?: string | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Journal>(newJournal);
  const [history, setHistory] = useState<Journal[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('journal');
  const [otherNeed, setOtherNeed] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const owner = user?.id;
  useEffect(() => {
    setReady(false); setSaveStatus('');
    if (!owner) { setDraft(newJournal()); setHistory([]); return; }
    let cancelled = false;
    loadJournalSession(owner).then(s => {
      if (cancelled) return;
      if (s) { setDraft(validateJournal(s.draft, false)); setHistory(s.history.map(j => validateJournal(j))); }
      else { setDraft(newJournal()); setHistory([]); }
      setReady(true);
    }).catch(() => { if (!cancelled) { setDraft(newJournal()); setHistory([]); setReady(true); toast.error('Tidigare journal kunde inte återställas.'); } });
    return () => { cancelled = true; };
  }, [owner]);
  const persist = (j: Journal, h: Journal[]) => {
    if (!owner || !ready) return Promise.resolve();
    setSaveStatus('Sparar…');
    const write = writeQueue.current.catch(() => {}).then(() => saveJournalSession(owner, { draft: j, history: h }));
    writeQueue.current = write;
    return write.then(() => setSaveStatus('Sparad på denna enhet')).catch(() => { setSaveStatus('Kunde inte spara'); toast.error('Journalen kunde inte sparas. Ladda ned en kopia.'); });
  };
  const update = (patch: Partial<Journal>) => { const next = { ...draft, ...patch }; setDraft(next); void persist(next, history); };
  const mandate = useMemo(() => calculateMandate(draft), [draft]);
  const path = useMemo(() => field.domain === draft.domain ? journalLearningPath(draft, field) : [], [draft, field]);
  const save = async () => {
    try { validateJournal(draft); const next = [draft, ...history.filter(j => j.id !== draft.id)].slice(0, 100); setHistory(next); await persist(draft, next); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Journalen är ogiltig'); }
  };
  const exportMandate = () => {
    try { download(buildJournalExport(draft, field, { field_id: fileName ?? field.useCase, field_version: field.stats.security?.corpusHash ?? 'local-unversioned' }), 'agent_mandate_export.json'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Export misslyckades'); }
  };
  const importJournal = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Journalfilen får vara högst 2 MB');
      const parsed = JSON.parse(await file.text()); const j = validateJournal(parsed.journal ?? parsed);
      setDraft(j); await persist(j, history); setTab('journal');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ogiltig journalfil'); }
  };
  const editable = Boolean(owner && ready);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="w-full font-mono text-xs"><BookOpen /> Agentjournal · Bug Bounty</Button></DialogTrigger>
    <DialogContent className="max-w-5xl w-[calc(100%-1rem)] max-h-[92dvh] flex flex-col p-4 md:p-6 overflow-hidden font-mono">
      <DialogHeader className="pr-6"><DialogTitle>Agentjournal · Bug Bounty</DialogTitle><DialogDescription>Journal → kompetensspår → sammanfattning → integration → ny mandatbedömning</DialogDescription></DialogHeader>
      {!owner ? <p className="text-sm text-muted-foreground">Logga in för att öppna din privata journal.</p> : <>
        <div className="flex flex-wrap gap-2 items-center border-b border-border pb-3">
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => { const next = newJournal(); next.agent_id = draft.agent_id; setDraft(next); void persist(next, history); setTab('journal'); }}><FilePlus2 /> Nytt uppdrag</Button>
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => importRef.current?.click()}><Upload /> Importera journal</Button>
          <Button size="sm" variant="outline" onClick={() => download(newJournal(), 'agent_journal_template.json')}><Download /> Journalmall</Button>
          <Button asChild size="sm" variant="outline"><a href="/agent-journal-contract.md" target="_blank" rel="noreferrer">Agentanslutning</a></Button>
          <Button size="sm" disabled={!editable} onClick={save}><Save /> Spara journal</Button>
          <span className="text-xs text-muted-foreground" role="status">{saveStatus}</span>
          <input aria-label="Importera journalfil" type="file" accept=".json" hidden ref={importRef} onChange={e => { void importJournal(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col min-h-0 flex-1">
          <TabsList className="grid grid-cols-4 w-full shrink-0"><TabsTrigger value="journal">Journal</TabsTrigger><TabsTrigger value="learning">Lässpår</TabsTrigger><TabsTrigger value="mandate">Mandat</TabsTrigger><TabsTrigger value="history">Historik</TabsTrigger></TabsList>
          <div className="overflow-y-auto min-h-0 flex-1 mt-3 pr-1">
            <TabsContent value="journal" className="mt-0 space-y-5">
              <fieldset disabled={!editable} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-3">{(['agent_id', 'task_id'] as const).map(k => <label key={k} className="text-xs space-y-2 block">{k === 'agent_id' ? 'Agent-ID' : 'Uppdrags-ID'}<Input value={draft[k]} onChange={e => update({ [k]: e.target.value })} /></label>)}</div>
                <div className="grid md:grid-cols-2 gap-4">{textFields.map(([k, label]) => <label key={k} className="text-xs space-y-2 block">{label}<Textarea value={draft[k]} maxLength={12000} onChange={e => update({ [k]: e.target.value })} className="min-h-20" /></label>)}</div>
                <section className="space-y-3 border-t border-border pt-4"><h3 className="text-sm text-primary">Kompetensbehov</h3><div className="flex flex-wrap gap-4">{needs.map(n => <label key={n} className="flex gap-2 text-xs items-center"><input type="checkbox" checked={draft.competence_needs.includes(n)} onChange={e => update({ competence_needs: e.target.checked ? [...draft.competence_needs, n] : draft.competence_needs.filter(v => v !== n) })} />{n}</label>)}</div><div className="flex gap-2"><Input aria-label="Annat kompetensbehov" value={otherNeed} onChange={e => setOtherNeed(e.target.value)} placeholder="Annat kompetensbehov" /><Button variant="outline" onClick={() => { if (otherNeed.trim() && !draft.competence_needs.includes(otherNeed.trim())) update({ competence_needs: [...draft.competence_needs, otherNeed.trim()] }); setOtherNeed(''); }}>Lägg till</Button></div>{draft.competence_needs.filter(n => !needs.includes(n)).map(n => <label key={n} className="flex gap-2 text-xs"><input type="checkbox" checked onChange={() => update({ competence_needs: draft.competence_needs.filter(v => v !== n) })} />{n}</label>)}</section>
              </fieldset>
            </TabsContent>
            <TabsContent value="learning" className="mt-0 space-y-4">
              <div className="text-xs text-muted-foreground">Bibliotek: {fileName ?? field.useCase} · {field.units.length} noder · {field.domain ?? 'general'}</div>
              {field.domain !== 'bugbounty' ? <p className="text-sm text-field-fz">Öppna ett fält analyserat som Bug Bounty för att få ett lässpår.</p> : !path.length ? <p className="text-sm text-muted-foreground">Inget relevant material hittades. Lägg till ett konkret mål eller kompetensbehov, eller öppna ett mer relevant Bug Bounty-fält.</p> : <>
                <p className="text-xs text-muted-foreground">Läsförslag utifrån textöverlap och fältstabilitet, inte verifierade förkunskapskrav. Studier höjer inte mandat eller konfidens automatiskt.</p>
                {path.map(p => <article key={p.unit_id} className="border border-border rounded-md p-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2 text-xs"><h3 className="text-primary">{p.order}. {p.unit_id} · {p.source ?? 'Öppet fält'}</h3><span className="text-muted-foreground">Urval {p.relevance_score.toFixed(2)} · CTI {p.cti?.toFixed(2) ?? 'saknas'}</span></div>
                  <p className="text-sm whitespace-pre-wrap break-words">{p.text}</p>
                  {!!p.graph_context.length && <details className="text-xs text-muted-foreground"><summary>Relaterade noder ({p.graph_context.length})</summary>{p.graph_context.map(c => <p key={c.unit_id} className="mt-2">{c.unit_id} · {field.units.find(u => u.id === c.unit_id)?.text ?? 'Text saknas'}</p>)}</details>}
                  {(['summary', 'integration'] as const).map(k => <label key={k} className="block text-xs space-y-2">{k === 'summary' ? 'Agentens sammanfattning' : 'Hur förändrar detta nästa beslut?'}<Textarea disabled={!editable || p.study.completed} value={p.study[k]} onChange={e => update({ studies: { ...draft.studies, [p.unit_id]: { ...p.study, [k]: e.target.value } } })} /></label>)}
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!editable || (!p.study.completed && (!p.study.summary.trim() || !p.study.integration.trim()))} checked={p.study.completed} onChange={e => update({ studies: { ...draft.studies, [p.unit_id]: { ...p.study, completed: e.target.checked } } })} />Läst, sammanfattat och integrerat</label>
                </article>)}
                <Button onClick={() => setTab('mandate')}>Ompröva mandat</Button>
              </>}
            </TabsContent>
            <TabsContent value="mandate" className="mt-0 space-y-5">
              <section className="border-b border-border pb-4"><h3 className="text-lg text-field-fz">Nivå {mandate.mandat_level} · {mandate.status_beskrivning}</h3><p className="text-xs text-muted-foreground mt-2">Modellnivå {mandate.model_level} · poäng {mandate.adjusted_score.toFixed(4)} · rådgivande, inget tillstånd ges.</p></section>
              <fieldset disabled={!editable} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4">{Object.entries(scoreLabels).map(([key, label]) => { const k = key as keyof typeof scoreLabels; return <label key={k} className="text-xs space-y-2 block">{label}<Input type="number" min="0" max="1" step="0.05" value={draft[k]} onChange={e => update({ [k]: Math.max(0, Math.min(1, Number(e.target.value))) })} /></label>; })}<label className="text-xs space-y-2 block">Antal reproduktioner<Input type="number" min="0" max="10000" step="1" value={draft.reproduction_count} onChange={e => update({ reproduction_count: Math.max(0, Math.floor(Number(e.target.value))) })} /></label></div>
                <h3 className="text-sm text-primary">Villkor för fortsatt autonomi</h3>{SAFETY_CHECKS.map(k => <label key={k} className="flex gap-2 text-xs items-center"><input type="checkbox" checked={draft.checks[k]} onChange={e => update({ checks: { ...draft.checks, [k]: e.target.checked } })} />{checksLabels[k]}</label>)}
                <h3 className="text-sm text-field-fz">Stoppvillkor</h3>{STOP_CHECKS.map(k => <label key={k} className="flex gap-2 text-xs items-center"><input type="checkbox" checked={draft.stops[k]} onChange={e => update({ stops: { ...draft.stops, [k]: e.target.checked } })} />{stopLabels[k]}</label>)}
                <label className="flex gap-2 text-xs items-center"><input type="checkbox" checked={draft.human_review_required} onChange={e => update({ human_review_required: e.target.checked })} />Mänsklig granskning begärd</label>
              </fieldset>
              <div className="text-xs text-muted-foreground break-words">{[...mandate.blocking_factors, ...mandate.safety_blockers].length ? `Blockerat: ${[...mandate.blocking_factors, ...mandate.safety_blockers].join(', ')}` : 'Inga registrerade stopp. Utföraren måste fortfarande validera tillstånd och bevis.'}</div>
              <p className="text-xs text-muted-foreground">Agentens konfidens är självrapporterad. Låg CTI, akademisk stil eller bibliotekets igenkänning bevisar inte att ett beslut är säkert.</p>
              <Button disabled={!editable || field.domain !== 'bugbounty'} onClick={exportMandate}><Download /> agent_mandate_export.json</Button>
            </TabsContent>
            <TabsContent value="history" className="mt-0 space-y-3">
              {!history.length ? <p className="text-sm text-muted-foreground">Inga sparade uppdrag.</p> : history.map(j => <article key={j.id} className="border-b border-border pb-3"><div className="flex gap-3 justify-between items-start"><div className="min-w-0"><h3 className="text-sm break-words">{j.agent_id} · {j.task_id}</h3><p className="text-xs text-muted-foreground break-words">{j.objective}</p><time className="text-xs text-muted-foreground">{j.created_at.slice(0, 16)}</time></div><Button variant="outline" size="sm" onClick={() => { setDraft(j); void persist(j, history); setTab('journal'); }}>Öppna</Button></div></article>)}
              <Button variant="outline" disabled={!history.length} onClick={() => download({ schema: 'rfa.agent-journal-history', version: 1, entries: history }, 'agent_journal_history.json')}><Download /> Ladda ned historik</Button>
            </TabsContent>
          </div>
        </Tabs>
      </>}
    </DialogContent>
  </Dialog>;
}
