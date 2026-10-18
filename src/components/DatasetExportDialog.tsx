import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, FileJson, RotateCcw } from "lucide-react";
import type { GeometricField } from "@/lib/fieldData";
import { getDomainProfile } from "@/lib/domainProfiles";
import { buildCrossCorpusDpoCandidates, crossCorpusFunnel, buildDatasetCandidates, CROSS_CORPUS_DEFAULTS, MEANING_SIMILARITY_DEFAULT, DATASET_PRESETS, serializeDataset, type CrossCorpusSettings, type CrossMatch, type DatasetCandidate, type DatasetSettings } from "@/lib/datasetExporter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { parseFieldImport } from "@/lib/fieldImport";
import { useMeaningScores } from "@/hooks/useMeaningScores";

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Threshold({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="space-y-3">
    <div className="flex justify-between gap-2 text-xs"><span>{label}</span><output className="font-mono text-primary">{value.toFixed(2)}</output></div>
    <Slider aria-label={label} min={0} max={1} step={0.01} value={[value]} onValueChange={([v]) => onChange(v)} />
  </div>;
}

function ExportWorkspace({ field, fileName }: { field: GeometricField; fileName?: string | null }) {
  const [settings, setSettings] = useState<DatasetSettings>({ ...DATASET_PRESETS["Strict SFT"] });
  const [edits, setEdits] = useState<Record<string, DatasetCandidate>>({});
  const [index, setIndex] = useState(0);
  const profile = getDomainProfile(field.domain);
  const [system, setSystem] = useState(profile.id === "poker"
    ? "Du är en rådgivare inom pokerstrategi, spelteori och turneringsmatematik. Ange villkor och osäkerheter; utlova inte vinster."
    : `Du besvarar frågor inom ${profile.label}. Ange villkor och osäkerheter.`);
  const [rights, setRights] = useState(false);
  const [cross, setCross] = useState(false);
  const [fieldB, setFieldB] = useState<{ field: GeometricField; name: string } | null>(null);
  const [crossSettings, setCrossSettings] = useState<CrossCorpusSettings>({ ...CROSS_CORPUS_DEFAULTS, similarity: MEANING_SIMILARITY_DEFAULT });
  const meaning = useMeaningScores(field, fieldB?.field ?? null, crossSettings, cross);
  const candidates: Array<DatasetCandidate & { match?: CrossMatch }> = useMemo(() => cross
    ? (fieldB ? buildCrossCorpusDpoCandidates(field, fieldB.field, crossSettings, meaning.scores) : [])
    : buildDatasetCandidates(field, settings, fileName ?? ""), [field, settings, fileName, cross, fieldB, crossSettings, meaning.scores]);
  const funnel = useMemo(() => cross && fieldB && candidates.length === 0 ? crossCorpusFunnel(field, fieldB.field, crossSettings, meaning.scores) : null,
    [cross, fieldB, candidates.length, field, crossSettings, meaning.scores]);
  const changeCross = (next: CrossCorpusSettings) => { setCrossSettings(next); setEdits({}); setIndex(0); };
  const loadFieldB = (file?: File) => {
    if (!file) return;
    file.text().then(t => {
      const parsed = parseFieldImport(t);
      setFieldB({ field: parsed, name: file.name }); setEdits({}); setIndex(0);
      toast.success(`Fält B inläst: ${parsed.units.length} noder`);
    }).catch(() => toast.error("Filen är inte ett sparat fält (.json)"));
  };
  const rows = candidates.map(c => ({ ...c, ...(edits[c.id] ?? {}) }) as DatasetCandidate & { match?: CrossMatch });
  const currentIndex = Math.min(index, Math.max(0, rows.length - 1));
  const current = rows[currentIndex];
  const approved = rows.filter(c => c.approved && c.prompt.trim() && c.answer.trim() && (c.mode === "sft" || (c.rejected?.trim() && c.rejected.trim() !== c.answer.trim())));
  const analyzed = field.units.filter(u => u.intention && typeof u.cti === "number").length;

  const changeSettings = (next: DatasetSettings) => { setSettings(next); setEdits({}); setIndex(0); };
  const edit = (patch: Partial<DatasetCandidate>) => {
    if (!current) return;
    setEdits(previous => ({ ...previous, [current.id]: { ...current, ...patch, approved: patch.approved ?? false } }));
  };
  const exportRows = () => {
    if (!approved.length || !rights || !system.trim()) return;
    const base = `dataset_${settings.mode}_${profile.id}_v1`;
    download(serializeDataset(approved, system), `${base}.jsonl`, "application/x-ndjson");
    toast.success(`${approved.length} granskade exempel exporterade`);
  };
  const exportProvenance = () => {
    if (!approved.length) return;
    download(JSON.stringify({ version: 1, format: settings.mode === "sft" ? "chat-messages" : "generic-dpo", source: fileName ?? null,
      domain: field.domain ?? "general", settings, system_prompt: system,
      warnings: ["CTI och säkerhet är analysmått, inte sanningsgarantier.", "Frågemallens axelvärde garanterar inte att svaret besvarar frågan.", "Formatet behöver kontrolleras mot den valda träningstjänsten."],
      records: approved.map((c, i) => ({ line: i + 1, human_approved: true, ...c.metadata })),
    }, null, 2), `dataset_${settings.mode}_${profile.id}_provenance.json`, "application/json");
  };

  return <>
    <DialogHeader className="pr-8 text-left">
      <DialogTitle className="font-mono tracking-normal">Träningsdata</DialogTitle>
      <DialogDescription>{profile.label} · {field.units.length} noder · {analyzed} med djupanalys</DialogDescription>
    </DialogHeader>
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <Select value={cross ? "cross" : settings.mode} onValueChange={value => { setCross(value === "cross"); changeSettings({ ...settings, mode: value === "sft" ? "sft" : "dpo" }); }}>
        <SelectTrigger aria-label="Exporttyp" className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="sft">SFT · Fråga och svar</SelectItem><SelectItem value="dpo">DPO · Preferenspar</SelectItem><SelectItem value="cross">DPO · Mellan två fält</SelectItem></SelectContent>
      </Select>
      {!cross && (Object.keys(DATASET_PRESETS) as Array<keyof typeof DATASET_PRESETS>).map(name =>
        <Button key={name} variant="outline" size="sm" onClick={() => changeSettings({ ...DATASET_PRESETS[name] })}>{name}</Button>)}
    </div>
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-5">
        {cross ? <>
          <label className="block text-xs space-y-2"><span>Fält B (sparad .json)</span>
            <input type="file" accept=".json,application/json" aria-label="Fält B" className="sr-only" onChange={e => { loadFieldB(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="flex h-9 w-full items-center justify-center rounded-md border border-border text-xs font-mono cursor-pointer hover:border-primary/40">{fieldB ? "Byt fält B…" : "Välj fält B…"}</span></label>
          <p className="text-[11px] font-mono text-muted-foreground break-words">A: {fileName ?? "aktuellt fält"} · {field.units.length} noder<br />
            B: {fieldB ? <span className="text-primary">✓ {fieldB.name} · {fieldB.field.units.length} noder</span> : "ej vald"}</p>
          <Threshold label="Meningslikhet minst (AI)" value={crossSettings.similarity} onChange={v => changeCross({ ...crossSettings, similarity: v })} />
          {fieldB && <p className="text-[11px] font-mono text-muted-foreground" aria-live="polite">
            {meaning.status === "loading" ? "Jämför betydelse med AI…" : meaning.status === "error" ? <span className="text-destructive">{meaning.error} <button type="button" className="underline" onClick={meaning.retry}>Försök igen</button></span> : meaning.status === "ready" ? `Betydelse jämförd för ${meaning.scores.size} par.` : ""}
            {meaning.skipped > 0 && ` ${meaning.skipped} par över gränsen jämfördes inte – skärp reglagen nedan.`}</p>}
          <Threshold label="Föredraget: CTI högst" value={crossSettings.chosenMaxCti} onChange={v => changeCross({ ...crossSettings, chosenMaxCti: v })} />
          <Threshold label="Föredraget: säkerhet minst" value={crossSettings.chosenCertainty} onChange={v => changeCross({ ...crossSettings, chosenCertainty: v })} />
          <Threshold label="Avvisat: CTI minst" value={crossSettings.rejectedMinCti} onChange={v => changeCross({ ...crossSettings, rejectedMinCti: v })} />
          <Threshold label="CTI-skillnad minst" value={crossSettings.deltaCti} onChange={v => changeCross({ ...crossSettings, deltaCti: v })} />
        </> : <>
        <Threshold label="Säkerhet över" value={settings.certainty} onChange={v => changeSettings({ ...settings, certainty: v })} />
        <Threshold label="CTI under (svar)" value={settings.maxCti} onChange={v => changeSettings({ ...settings, maxCti: v })} />
        {settings.mode === "dpo" && <>
          <Threshold label="CTI över (motförslag)" value={settings.rejectedCti} onChange={v => changeSettings({ ...settings, rejectedCti: v })} />
          <Threshold label="CTI-skillnad över" value={settings.deltaCti} onChange={v => changeSettings({ ...settings, deltaCti: v })} />
        </>}
        <Threshold label="Kantlikhet minst" value={settings.similarity} onChange={v => changeSettings({ ...settings, similarity: v })} />
        <Select value={String(settings.neighbors)} onValueChange={v => changeSettings({ ...settings, neighbors: Number(v) })}>
          <SelectTrigger aria-label="Kontextgrannar"><SelectValue /></SelectTrigger>
          <SelectContent>{[0, 1, 2].map(n => <SelectItem key={n} value={String(n)}>{n} kontextgrannar</SelectItem>)}</SelectContent>
        </Select>
        </>}
        <div className="border-t border-border pt-4 space-y-1 font-mono text-xs" aria-live="polite">
          <p><span className="text-primary">{rows.length}</span> kandidater</p>
          <p><span className="text-primary">{approved.length}</span> godkända för export</p>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="text-xs text-field-fz border-l-2 border-field-fz pl-3 leading-relaxed">
          {cross && !fieldB ? "Ladda ett andra sparat fält för att para noder mellan korpusarna. " : ""}{settings.mode === "dpo" ? "Preferenser är ännu inte märkta. Hög CTI är inte ett felaktigt svar." : "Urvalet är inte faktagranskat. Kontrollera att svaret verkligen besvarar frågan."}
        </div>
        {!profile.questionTemplates && <p className="text-sm text-muted-foreground">Frågemallar saknas för {profile.label}. Poker är den första profilen med mallar.</p>}
        {!current && cross && funnel ? <div role="status" className="py-4 space-y-2 text-xs font-mono text-muted-foreground">
          <p className="text-sm font-sans text-foreground">Inga par klarade alla fyra kontrollerna. Så här många gick vidare i varje steg:</p>
          <p>Föredragna svar (påstående, låg CTI, hög säkerhet): <span className="text-primary">{funnel.chosen}</span></p>
          <p>Avvisade svar (uppmaning/känsla, hög CTI): <span className="text-primary">{funnel.rejected}</span></p>
          <p>Föredragna med en frågemall (axel): <span className="text-primary">{funnel.chosenWithQuestion}</span></p>
          <p>Par på samma axel och nivå: <span className="text-primary">{funnel.sameAxisLevel}</span></p>
          <p>…med tillräcklig CTI-skillnad: <span className="text-primary">{funnel.enoughCtiGap}</span></p>
          <p>Högsta meningslikhet bland dem: <span className="text-primary">{funnel.bestSimilarity.toFixed(2)}</span> (krav {crossSettings.similarity.toFixed(2)})</p>
        </div> : !current ? <p role="status" className="py-10 text-sm text-muted-foreground">Inga kandidater matchar urvalet i detta fält.</p> : <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono">{currentIndex + 1} / {rows.length} · {current.metadata.node_id}</span>
            <div className="flex gap-1">
              <Button aria-label="Föregående exempel" title="Föregående exempel" size="icon" variant="ghost" disabled={currentIndex === 0} onClick={() => setIndex(currentIndex - 1)}><ArrowLeft /></Button>
              <Button aria-label="Nästa exempel" title="Nästa exempel" size="icon" variant="ghost" disabled={currentIndex >= rows.length - 1} onClick={() => setIndex(currentIndex + 1)}><ArrowRight /></Button>
            </div>
          </div>
          {current.match && <p className="flex flex-wrap gap-1 font-mono text-[11px]" aria-label="Matchningspoäng">
            <span className="border border-border px-1.5 py-0.5">Axel: {current.match.axis} · {current.match.level} ✓</span>
            <span className="border border-border px-1.5 py-0.5">Semantik: {current.match.semantic.toFixed(2)} ✓</span>
            <span className="border border-border px-1.5 py-0.5">Intention: {current.match.chosenAct} → {current.match.rejectedAct} ✓</span>
            <span className="border border-border px-1.5 py-0.5">Prompt: samma mall ✓</span>
            <span className="border border-border px-1.5 py-0.5">Föredraget från fält {current.match.chosenField}</span>
          </p>}
          <p className="font-mono text-[11px] text-muted-foreground break-words">{current.metadata.dominant_axis} · CTI {current.metadata.cti.toFixed(2)} · säkerhet {current.metadata.epistemic_certainty.toFixed(2)} · kontext {current.metadata.context_nodes.join(", ")}</p>
          <label className="block text-xs space-y-2"><span>Fråga</span><Textarea aria-label="Fråga" value={current.prompt} onChange={e => edit({ prompt: e.target.value })} className="min-h-20" /></label>
          <label className="block text-xs space-y-2"><span>{settings.mode === "sft" ? "Svar" : "Föredraget svar (förslag)"}</span><Textarea aria-label="Svar" value={current.answer} onChange={e => edit({ answer: e.target.value })} className="min-h-40" /></label>
          {settings.mode === "dpo" && <label className="block text-xs space-y-2"><span>Avvisat svar (förslag) · {current.metadata.rejected_node} · CTI {current.metadata.rejected_cti?.toFixed(2)}</span><Textarea aria-label="Avvisat svar" value={current.rejected ?? ""} onChange={e => edit({ rejected: e.target.value })} className="min-h-32" /></label>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={current.approved ? "secondary" : "default"} disabled={!current.prompt.trim() || !current.answer.trim() || (settings.mode === "dpo" && (!current.rejected?.trim() || current.rejected.trim() === current.answer.trim()))} onClick={() => edit({ approved: !current.approved })}>
              <Check />{current.approved ? "Godkänt – ångra" : settings.mode === "dpo" ? "Godkänn preferensparet" : "Godkänn frågan och svaret"}
            </Button>
            <Button size="icon" variant="ghost" title="Återställ exemplet" aria-label="Återställ exemplet" onClick={() => setEdits(previous => { const next = { ...previous }; delete next[current.id]; return next; })}><RotateCcw /></Button>
          </div>
        </>}
      </div>
    </div>
    <div className="border-t border-border pt-4 space-y-4">
      <label className="block text-xs space-y-2"><span>Modellens instruktion</span><Textarea aria-label="Modellens instruktion" value={system} onChange={e => { setSystem(e.target.value); setEdits({}); }} /></label>
      <label className="flex items-start gap-3 text-xs leading-relaxed"><Checkbox checked={rights} onCheckedChange={v => setRights(v === true)} aria-label="Rätt att använda materialet för träning" /><span>Jag har rätt att använda materialet för modellträning och har kontrollerat personuppgifter och hemligheter.</span></label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={exportRows} disabled={!approved.length || !rights || !system.trim()}><Download />Exportera .jsonl ({approved.length})</Button>
        <Button variant="outline" onClick={exportProvenance} disabled={!approved.length}><FileJson />Källspårning .json</Button>
      </div>
      <p className="text-xs text-muted-foreground">SFT: chat-messages · DPO: generiskt prompt/chosen/rejected. Granskning gäller detta öppna fönster. Ingen modell tränas här.</p>
    </div>
  </>;
}

export default function DatasetExportDialog(props: { field: GeometricField; fileName?: string | null; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="basis-full font-mono text-xs" disabled={!props.enabled}><FileJson />Träningsdata · SFT / DPO</Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[90dvh] overflow-y-auto p-5">
      {open && <ExportWorkspace field={props.field} fileName={props.fileName} />}
    </DialogContent>
  </Dialog>;
}