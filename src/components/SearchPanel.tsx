import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCorpusRanking,
  searchSimilarClusters,
  searchChunks,
  updateClusterLabel,
  type CorpusDocument,
  type ClusterMatch,
  type ChunkMatch,
} from "@/lib/searchClient";
import type { GeometricField } from "@/lib/fieldData";
import { ChevronDown, RefreshCw, Search } from "lucide-react";

interface Props {
  field: GeometricField;
  fileName: string | null;
  activeClusterId: number | null;
  onSelectCluster: (id: number | null) => void;
}

export default function SearchPanel({ field, fileName, activeClusterId, onSelectCluster }: Props) {
  // -- Section A: corpus CTI ranking ----------------------------------------
  const [corpus, setCorpus] = useState<CorpusDocument[] | null>(null);
  const [loadingCorpus, setLoadingCorpus] = useState(false);

  const loadCorpus = async (force = false) => {
    setLoadingCorpus(true);
    try { setCorpus(await fetchCorpusRanking(force)); }
    finally { setLoadingCorpus(false); }
  };
  useEffect(() => { void loadCorpus(); }, []);

  // Resolve current document_id by filename (latest upload wins)
  const currentDocId = useMemo(() => {
    if (!fileName || !corpus) return null;
    const matches = corpus
      .filter((d) => d.filename === fileName)
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
    return matches[0]?.id ?? null;
  }, [fileName, corpus]);

  // -- Section B: friction cluster similarity --------------------------------
  const [openB, setOpenB] = useState(true);
  const [fzFyWeight, setFzFyWeight] = useState(0.3);
  const [minSim, setMinSim] = useState(0.65);
  const [matches, setMatches] = useState<ClusterMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const debounceRef = useRef<number | null>(null);

  const activeCluster = activeClusterId !== null ? field.clusters[activeClusterId] : null;

  useEffect(() => {
    setLabelDraft(activeCluster?.label ?? "");
  }, [activeCluster?.label, activeClusterId]);

  useEffect(() => {
    if (!currentDocId || activeClusterId === null) { setMatches([]); return; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchSimilarClusters({
          documentId: currentDocId,
          clusterId: activeClusterId,
          fzFyWeight,
          minSimilarity: minSim,
          matchCount: 8,
        });
        setMatches(res.matches);
      } catch (e) {
        console.warn("[search] failed:", e);
        setMatches([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [currentDocId, activeClusterId, fzFyWeight, minSim]);

  const saveLabel = async () => {
    if (!currentDocId || activeClusterId === null) return;
    try {
      await updateClusterLabel(currentDocId, activeClusterId, labelDraft.trim() || null);
      await loadCorpus(true);
    } catch (e) {
      console.warn("[label] save failed:", e);
    }
  };

  // -- Section C: semantic free-text search ---------------------------------
  const [openC, setOpenC] = useState(false);
  const [query, setQuery] = useState("");
  const [chunkResults, setChunkResults] = useState<ChunkMatch[]>([]);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [minCti, setMinCti] = useState(0);
  const qDebRef = useRef<number | null>(null);

  useEffect(() => {
    if (!openC) return;
    if (qDebRef.current) window.clearTimeout(qDebRef.current);
    if (!query.trim()) { setChunkResults([]); return; }
    qDebRef.current = window.setTimeout(async () => {
      setChunkLoading(true);
      try { setChunkResults(await searchChunks(query.trim(), { minCti, matchCount: 12 })); }
      catch (e) { console.warn("[chunks] failed:", e); setChunkResults([]); }
      finally { setChunkLoading(false); }
    }, 400);
  }, [query, minCti, openC]);

  return (
    <div className="border-t border-border flex flex-col">
      {/* ─── A. Corpus CTI ranking ─── */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            Corpus (CTI ranking)
          </label>
          <button
            onClick={() => loadCorpus(true)}
            className="text-muted-foreground hover:text-primary"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCorpus ? "animate-spin" : ""}`} />
          </button>
        </div>
        {!corpus || corpus.length === 0 ? (
          <p className="text-[11px] text-muted-foreground font-mono">
            {loadingCorpus ? "Loading…" : "No persisted documents yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {corpus.slice(0, 8).map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-muted-foreground/60 w-4 text-right">{i + 1}</span>
                <span className="flex-1 truncate text-foreground" title={d.filename}>{d.filename}</span>
                <div className="w-14 h-1.5 rounded bg-secondary overflow-hidden">
                  <div className="h-full bg-[hsl(320,80%,55%)]" style={{ width: `${Math.min(100, d.avg_cti * 200)}%` }} />
                </div>
                <span className="w-9 text-right text-muted-foreground">{d.avg_cti.toFixed(2)}</span>
                <span className="w-10 text-right text-muted-foreground/60">k={d.cluster_count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── B. Friction cluster similarity ─── */}
      <div className="border-b border-border">
        <button
          onClick={() => setOpenB((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/30"
        >
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            Friction similarity
          </span>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${openB ? "" : "-rotate-90"}`} />
        </button>
        {openB && (
          <div className="p-4 pt-0 flex flex-col gap-3">
            {!activeCluster ? (
              <p className="text-[11px] text-muted-foreground font-mono">
                Select a cluster (sidebar above or canvas) to find similar friction patterns across the corpus.
              </p>
            ) : !currentDocId ? (
              <p className="text-[11px] text-muted-foreground font-mono">
                This field is not yet persisted to the corpus. Upload a file to enable cross-document search.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-border p-2 bg-secondary/20">
                  <div className="text-[10px] font-mono text-muted-foreground mb-1">Selected cluster</div>
                  <div className="text-xs font-mono font-medium text-foreground mb-1">{activeCluster.label}</div>
                  <div className="flex gap-3 text-[10px] font-mono mb-2">
                    <span><span className="text-field-fz">FZ</span> {activeCluster.avgFZ.toFixed(2)}</span>
                    <span><span className="text-field-fy">FY</span> {activeCluster.avgFY.toFixed(2)}</span>
                    <span className="text-muted-foreground">n={activeCluster.unitCount}</span>
                  </div>
                  <div className="flex gap-1">
                    <input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      placeholder="Custom label…"
                      maxLength={60}
                      className="flex-1 px-2 py-1 rounded border border-border bg-background text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={saveLabel}
                      className="px-2 py-1 rounded border border-primary/30 text-primary text-[10px] font-mono uppercase hover:bg-primary/10"
                    >Save</button>
                  </div>
                </div>

                <SliderRow label="FZ/FY weight" value={fzFyWeight} onChange={setFzFyWeight} />
                <SliderRow label="Min similarity" value={minSim} onChange={setMinSim} />

                <div className="text-[10px] font-mono text-muted-foreground">
                  {searching ? "Searching…" : `${matches.length} similar cluster${matches.length === 1 ? "" : "s"}`}
                </div>

                <ul className="flex flex-col gap-2">
                  {matches.map((m, i) => (
                    <li key={m.id} className="rounded-md border border-border p-2 hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground/60 text-[10px] w-4">{i + 1}</span>
                        <span className="font-mono text-xs font-medium text-foreground flex-1 truncate">
                          {m.custom_label ?? m.label}
                        </span>
                        <span className="font-mono text-[10px] text-primary">{m.hybrid_score.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate pl-6 mb-1">
                        {m.filename}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono pl-6">
                        <span><span className="text-muted-foreground">sim</span> {m.similarity.toFixed(2)}</span>
                        <span><span className="text-field-fz">Δfz</span> {m.fz_delta.toFixed(2)}</span>
                        <span><span className="text-field-fy">Δfy</span> {m.fy_delta.toFixed(2)}</span>
                        <span><span className="text-muted-foreground">FZ</span> {m.avg_fz.toFixed(2)}</span>
                        <span><span className="text-muted-foreground">FY</span> {m.avg_fy.toFixed(2)}</span>
                      </div>
                      {m.description && (
                        <p className="text-[11px] text-muted-foreground leading-snug pl-6 mt-1 line-clamp-2">
                          {m.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── C. Semantic free-text search ─── */}
      <div className="border-b border-border">
        <button
          onClick={() => setOpenC((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/30"
        >
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            Semantic search
          </span>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${openC ? "" : "-rotate-90"}`} />
        </button>
        {openC && (
          <div className="p-4 pt-0 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across corpus…"
                className="w-full pl-7 pr-2 py-1.5 rounded border border-border bg-background text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              />
            </div>
            <SliderRow label="Min CTI" value={minCti} onChange={setMinCti} max={1} />
            <div className="text-[10px] font-mono text-muted-foreground">
              {chunkLoading ? "Searching…" : `${chunkResults.length} result${chunkResults.length === 1 ? "" : "s"}`}
            </div>
            <ul className="flex flex-col gap-2">
              {chunkResults.map((c, i) => (
                <li key={c.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted-foreground/60 text-[10px] w-4">{i + 1}</span>
                    <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                      {c.filename ?? "(unknown)"} · {c.cluster_label ?? "—"}
                    </span>
                    <span className="font-mono text-[10px] text-primary">{c.similarity.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-foreground leading-snug pl-6 line-clamp-3">{c.text}</p>
                  <div className="flex gap-3 text-[10px] font-mono pl-6 mt-1 text-muted-foreground">
                    {c.fz !== null && <span><span className="text-field-fz">FZ</span> {c.fz.toFixed(2)}</span>}
                    {c.cti !== null && <span>CTI {c.cti.toFixed(2)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SliderRow({
  label, value, onChange, max = 1,
}: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0} max={max} step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-primary"
      />
    </div>
  );
}
