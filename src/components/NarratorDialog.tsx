import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Upload, Play, Square, Download, Check, X, Target, HelpCircle, Blocks, Trash2, ArrowRight, Shield, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { parseFieldImport, fieldImportSummary } from '@/lib/fieldImport';
import { NARRATOR_VERSION, DEFAULT_NARRATOR_THRESHOLDS, narratorAutoLimit, prepareNarrator, narratorJsonl, narratorProvenance, narratorBatch, downloadNarrator, type NarratorItem, type NarratorSource } from '@/lib/narrator';
import { loadNarrator, saveNarrator, type NarratorSession } from '@/lib/narratorStore';
import { generateNarration } from '@/lib/narratorClient';
import type { NarratorCorrection } from '../../supabase/functions/_shared/narratorVoice';

const voiceCorrections: { key: NarratorCorrection; label: string; Icon: typeof Target }[] = [
  { key: 'specific', label: 'Gör mer specifik', Icon: Target },
  { key: 'hesitation', label: 'Öka tvekan', Icon: HelpCircle },
  { key: 'concrete', label: 'Minska abstraktion', Icon: Blocks },
  { key: 'proactive_action', label: 'Proaktiv åtgärd', Icon: ArrowRight },
  { key: 'proactive_defense', label: 'Proaktivt försvar', Icon: Shield },
  { key: 'curiosity', label: 'Nyfikenhet', Icon: Search },
];

export default function NarratorDialog() {
  const { user } = useAuth();
  const owner = user?.id ?? 'local';
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<NarratorSource[]>([]);
  const [items, setItems] = useState<NarratorItem[]>([]);
  const [thresholds, setThresholds] = useState(DEFAULT_NARRATOR_THRESHOLDS);
  const [limit, setLimit] = useState(10);
  const [automaticLimit, setAutomaticLimit] = useState(true);
  const [baseline, setBaseline] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef(items); itemsRef.current = items;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const saveQueue = useRef(Promise.resolve());
  const pendingSave = useRef<{ owner: string; session: NarratorSession } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStarted = useRef(0);
  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = pendingSave.current;
    pendingSave.current = null; saveStarted.current = 0;
    if (!pending) return;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveNarrator(pending.owner, pending.session)).catch(() => {
      if (ownerRef.current === pending.owner) setError('Granskningen kunde inte sparas på denna enhet. Exportera innan du stänger.');
    });
  }, []);

  useEffect(() => {
    let active = true;
    abortRef.current?.abort(); setReady(false); setSources([]); setItems([]); setIndex(0); setError(''); setImportNotes([]); setAutomaticLimit(true); setLimit(10);
    loadNarrator(owner).then(s => {
      if (!active || !s) return;
      setItems(s.items); setThresholds(s.thresholds); setLimit(s.limit); setBaseline(s.baseline);
      setAutomaticLimit(s.automaticLimit ?? s.limit === 10);
    }).catch(() => { if (active) setError('Sparad granskning kunde inte återställas.'); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; abortRef.current?.abort(); };
  }, [owner]);

  useEffect(() => {
    if (!ready) return;
    pendingSave.current = { owner, session: { items, thresholds, limit, baseline, automaticLimit } };
    if (!saveStarted.current) saveStarted.current = Date.now();
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    // Coalesce typing/deltas, but checkpoint continuous streams at least every two seconds.
    saveTimer.current = setTimeout(flushSave, Math.max(0, Math.min(400, 2000 - (Date.now() - saveStarted.current))));
  }, [items, thresholds, limit, baseline, automaticLimit, ready, owner, flushSave]);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') flushSave(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flushSave);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flushSave);
      flushSave();
    };
  }, [owner, flushSave]);

  const prepared = useMemo(() => sources.length ? prepareNarrator(sources, thresholds) : null, [sources, thresholds]);
  const effectiveLimit = automaticLimit ? narratorAutoLimit(prepared?.candidates.length ?? 0) : limit;
  const current = items[index];
  const approved = items.filter(i => !i.baseline && i.review === 'approved' && i.answer.trim());
  const approvedBaseline = items.filter(i => i.baseline && i.review === 'approved' && i.answer.trim());
  const pending = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.baseline && !item.answer && item.review !== 'rejected');

  const updateItem = (i: number, patch: Partial<NarratorItem>) => {
    const next = itemsRef.current.map((item, n) => n === i ? { ...item, ...patch } : item);
    itemsRef.current = next; setItems(next);
  };
  async function readFiles(files: FileList | File[]) {
    if (busy || reading) return;
    const readOwner = owner;
    setReading(true); setError('');
    const added: NarratorSource[] = [], failures: string[] = [], notes: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          if (file.size > 64 * 1024 * 1024) throw new Error('högst 64 MB per fil');
          const field = parseFieldImport(await file.text(), report => notes.push(`${file.name}: ${fieldImportSummary(report)}\n${report.details.join('\n')}`));
          added.push({ name: file.name, field });
        } catch (e) { failures.push(`${file.name}: ${e instanceof Error ? e.message : 'kunde inte läsas'}`); }
      }
      if (ownerRef.current === readOwner) {
        setSources(previous => [...previous.filter(s => !added.some(a => a.name === s.name)), ...added]);
        setError(failures.join('\n'));
        setImportNotes(notes);
      }
    } finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  function buildQueue() {
    if (!prepared) return;
    const next = [...prepared.candidates.slice(0, effectiveLimit), ...(baseline ? prepared.baseline.map(i => ({ ...i, answer: i.score.target.text })) : [])];
    const existing = new Map(itemsRef.current.map(i => [`${i.score.source}:${i.score.id}:${i.score.target.text}`, i]));
    const merged = next.map(i => existing.get(`${i.score.source}:${i.score.id}:${i.score.target.text}`) ?? i);
    itemsRef.current = merged; setItems(merged); setIndex(0); setError(''); setProgress('');
  }
  async function run(correction?: NarratorCorrection, regenerate = false) {
    if (busy) return;
    const targets = correction || regenerate ? current && !current.baseline ? [{ item: current, i: index }] : [] : pending;
    if (!targets.length) return;
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(true); setError('');
    try {
      for (let n = 0; n < targets.length; n++) {
        const { item, i } = targets[n];
        setIndex(i); setProgress(`${n + 1} / ${targets.length}`);
        updateItem(i, { review: 'pending' });
        try {
          const answer = await generateNarration(item.score, controller.signal, text => updateItem(i, { answer: text, review: 'pending' }), correction, item.answer);
          updateItem(i, { answer, review: 'pending', voiceVersion: NARRATOR_VERSION });
        } catch (e) {
          // Incomplete output must never become an approvable training record.
          updateItem(i, { answer: item.answer, review: 'pending' });
          throw e;
        }
      }
      setProgress('Färdig för granskning');
    } catch (e) {
      setError(controller.signal.aborted ? 'Körningen stoppades. Färdiga svar behålls.' : e instanceof Error ? e.message : 'Narratören kunde inte slutföra körningen.');
      setProgress('Stoppad');
    } finally { abortRef.current = null; setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={value => { if (!value) { abortRef.current?.abort(); flushSave(); } setOpen(value); }}>
    <Button variant="outline" className="w-full mt-2 font-mono text-xs" onClick={() => setOpen(true)}><BookOpenText /> Re-ingest & Narratör</Button>
    <DialogContent aria-describedby={undefined} className="max-w-6xl w-[calc(100%-1rem)] h-[92dvh] flex flex-col gap-0 p-0 overflow-hidden font-mono">
      <header className="border-b border-border px-5 py-4 pr-12 shrink-0">
        <DialogTitle className="flex items-center gap-2 text-primary"><BookOpenText className="h-5 w-5" /> Partitur-Narratören · v2</DialogTitle>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        <section className="p-4 md:p-5 border-b border-border space-y-4">
          <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void readFiles(e.dataTransfer.files); }} className="border border-dashed border-primary/40 rounded-md bg-secondary/30 p-5 flex flex-wrap gap-3 items-center justify-between">
            <div><h2 className="text-sm text-foreground">Sparade field.json</h2><p className="text-xs text-muted-foreground mt-1">{sources.length ? `${sources.length} filer · ${prepared?.total ?? 0} noder` : items.length ? `${items.length} återställda granskningsposter` : 'Inga filer valda'}</p></div>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || reading || !ready}><Upload />{reading ? 'Läser…' : 'Välj fält'}</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={e => { if (e.target.files) void readFiles(e.target.files); }} />
          </div>
          {!!sources.length && <div className="flex flex-wrap gap-2">{sources.map(s => <span key={s.name} className="text-xs flex items-center gap-1 max-w-full text-muted-foreground"><span className="break-all">{s.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={`Ta bort ${s.name}`} disabled={busy} onClick={() => setSources(sources.filter(x => x.name !== s.name))}><X /></Button></span>)}</div>}
          {!!importNotes.length && <details className="text-xs text-muted-foreground whitespace-pre-wrap break-words"><summary className="cursor-pointer text-primary">Import återställd · visa ändringar</summary>{importNotes.map((note, i) => <p key={i} className="mt-2">{note}</p>)}</details>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {(['fz', 'truth', 'cti'] as const).map(key => <label key={key} className="text-xs space-y-3 block"><span className="flex justify-between text-muted-foreground"><span>{key === 'truth' ? 'Truth Tension' : key.toUpperCase()} ≥</span><span className="text-primary">{thresholds[key].toFixed(2)}</span></span><Slider aria-label={`Tröskel ${key}`} value={[thresholds[key]]} min={0} max={1} step={0.05} disabled={busy} onValueChange={([value]) => setThresholds(t => ({ ...t, [key]: value }))} /></label>)}
          </div>
          {prepared && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">{[[prepared.candidates.length, 'Friktion'], [prepared.junk, 'Skräp'], [prepared.duplicates, 'Dubbletter'], [prepared.baseline.length, 'Tysta'], [prepared.quiet, 'Övriga bortvalda']].map(([n, label]) => <div key={label} className="border-l-2 border-border pl-3 py-1"><strong className="block text-lg text-primary">{n}</strong><span className="text-muted-foreground">{label}</span></div>)}</div>}
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs flex items-center gap-2"><Checkbox checked={automaticLimit} disabled={busy} onCheckedChange={v => { setAutomaticLimit(v === true); if (v !== true && prepared) setLimit(Math.max(1, effectiveLimit)); }} />Automatiskt antal</label>
            <label className="text-xs flex items-center gap-2">AI-tak<Input aria-label="AI-tak" type="number" min={automaticLimit ? 0 : 1} max={500} value={effectiveLimit} disabled={busy || automaticLimit} className="w-20" onChange={e => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} /></label>
            {prepared && <span className="text-xs text-muted-foreground">{Math.min(effectiveLimit, prepared.candidates.length)} / {prepared.candidates.length} friktionskandidater</span>}
            <label className="text-xs flex items-center gap-2"><Checkbox checked={baseline} disabled={busy} onCheckedChange={v => setBaseline(v === true)} />Separat baslinje · utan AI</label>
            <Button variant="secondary" onClick={buildQueue} disabled={!prepared || busy}>Förbered urval</Button>
            <span className="text-xs text-muted-foreground">Lovable AI · debiteras per svar och snabbkorrigering</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={() => void run()} disabled={busy || !pending.length || !user}>{busy ? <BookOpenText className="animate-pulse motion-reduce:animate-none" /> : <Play />}Generera {pending.length || ''}</Button>
            {busy && <Button variant="destructive" onClick={() => abortRef.current?.abort()}><Square />Stoppa</Button>}
            <Button variant="outline" disabled={!items.some(i => !i.baseline) || busy} onClick={() => downloadNarrator('narrator_requests.jsonl', narratorBatch(items.filter(i => !i.baseline)))}><Download />Lokal batch</Button>
            <span role="status" className="text-xs text-muted-foreground">{progress || (!user ? 'Inloggning krävs för Lovable AI' : `${items.filter(i => !i.baseline).length} i AI-urvalet`)}</span>
          </div>
          {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>}
        </section>
        {current && <section className="p-4 md:p-5 space-y-4">
          <div className="flex justify-between items-center gap-2"><h2 className="text-sm">Granskning · {index + 1} / {items.length}</h2><div className="flex gap-1"><Button variant="outline" size="sm" disabled={!index || busy} onClick={() => setIndex(index - 1)}>Föregående</Button><Button variant="outline" size="sm" disabled={index >= items.length - 1 || busy} onClick={() => setIndex(index + 1)}>Nästa</Button></div></div>
          <p className="text-xs text-muted-foreground break-all">{current.score.source} · {current.score.id} · {current.score.cluster}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3 min-w-0">
              <h3 className="text-xs text-primary">Källtext</h3><p className="text-sm whitespace-pre-wrap break-words max-h-52 overflow-y-auto">{current.score.target.text}</p>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-3"><span>FZ {current.score.target.fz.toFixed(2)}</span><span>FY {current.score.target.fy.toFixed(2)}</span><span>CTI {current.score.target.cti?.toFixed(2) ?? 'saknas'}</span><span>TT {current.score.target.truthTension?.toFixed(2) ?? 'saknas'}</span><span>{current.score.target.speechAct ?? 'avsikt saknas'}</span></div>
              <h3 className="text-xs text-primary">Kontextankare</h3>
              {current.score.neighbors.length ? current.score.neighbors.map(n => <div key={n.id} className="border-l-2 border-border pl-3"><p className="text-[11px] text-muted-foreground">{n.id} · {n.method === 'graph' ? `graf ${n.similarity?.toFixed(2)}` : 'projektion · ej meningslikhet'}</p><p className="text-xs break-words max-h-28 overflow-y-auto">{n.text}</p></div>) : <p className="text-xs text-muted-foreground">Inga tillgängliga ankare</p>}
            </div>
            <div className="space-y-3 min-w-0">
              <h3 className="text-xs text-primary">{current.baseline ? 'Baslinje · källtext som svar' : 'Dispositionellt svar'}</h3>
              {!current.baseline && current.answer && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{current.voiceVersion === NARRATOR_VERSION ? 'Narratör v2' : 'Äldre svar · v1'}</span><Button variant="outline" size="sm" disabled={busy || !user} onClick={() => void run(undefined, true)}><Play />Generera om · v2</Button></div>}
              <Textarea aria-label="Dispositionellt svar" className="min-h-56 text-sm" value={current.answer} disabled={busy} onChange={e => updateItem(index, { answer: e.target.value, review: 'pending' })} />
              {!current.baseline && <div className="flex flex-wrap gap-2">{voiceCorrections.map(({ key, label, Icon }) => <Button key={key} variant="outline" size="sm" title={`${label} · nytt AI-anrop`} disabled={busy || !current.answer || !user} onClick={() => void run(key)}><Icon />{label}</Button>)}</div>}
              <div className="flex flex-wrap gap-2 items-center"><Button disabled={busy || !current.answer.trim()} variant={current.review === 'approved' ? 'secondary' : 'default'} onClick={() => updateItem(index, { review: 'approved' })}><Check />{current.review === 'approved' ? 'Godkänd' : 'Godkänn'}</Button><Button variant="outline" disabled={busy} onClick={() => updateItem(index, { review: 'rejected' })}><X />Avvisa</Button><span className="text-xs text-muted-foreground">{current.review === 'rejected' ? 'Avvisad' : current.review === 'pending' ? 'Ej godkänd' : ''}</span></div>
            </div>
          </div>
        </section>}
      </div>
      <footer className="shrink-0 border-t border-border p-3 flex flex-wrap gap-2 items-center bg-background">
        <Button size="sm" disabled={!approved.length || busy} onClick={() => downloadNarrator('narrator_approved.jsonl', narratorJsonl(approved))}><Download />ChatML · {approved.length}</Button>
        <Button size="sm" variant="outline" disabled={!approved.length && !approvedBaseline.length || busy} onClick={() => downloadNarrator('narrator_provenance.json', narratorProvenance([...approved, ...approvedBaseline]))}><Download />Proveniens</Button>
        {baseline && <Button size="sm" variant="outline" disabled={!approvedBaseline.length || busy} onClick={() => downloadNarrator('baseline_calm.jsonl', narratorJsonl(approvedBaseline))}><Download />Baslinje · {approvedBaseline.length}</Button>}
        <Button size="icon" variant="ghost" className="ml-auto" title="Rensa urval" disabled={busy} onClick={() => { setSources([]); setItems([]); itemsRef.current = []; setIndex(0); setError(''); setImportNotes([]); }}><Trash2 /></Button>
      </footer>
    </DialogContent>
  </Dialog>;
}