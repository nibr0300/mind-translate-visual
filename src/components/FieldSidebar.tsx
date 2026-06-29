import { useRef, useState } from "react";
import { motion } from "framer-motion";
import type { GeometricField } from "@/lib/fieldData";
import PdfUploader from "./PdfUploader";
import SearchPanel from "./SearchPanel";
import AccountPanel from "./AccountPanel";
import { useAuth } from "@/hooks/useAuth";
import { Download, Upload, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";

const CLUSTER_COLORS = [
  "hsl(180, 70%, 50%)",
  "hsl(280, 60%, 60%)",
  "hsl(25, 90%, 55%)",
  "hsl(140, 60%, 45%)",
  "hsl(340, 65%, 55%)",
];

interface FieldSidebarProps {
  field: GeometricField;
  activeCluster: number | null;
  onSelectCluster: (id: number | null) => void;
  useCase: "therapy" | "didactics" | "research" | "uploaded";
  onChangeUseCase: (uc: "therapy" | "didactics" | "research" | "uploaded") => void;
  uploadedFileName?: string | null;
  onUploadField: (field: GeometricField, fileName: string) => void;
}

const USE_CASE_LABELS = {
  therapy: "Therapy Journal",
  didactics: "Didactic Material",
  research: "Research Paper",
};

export default function FieldSidebar({
  field,
  activeCluster,
  onSelectCluster,
  useCase,
  onChangeUseCase,
  uploadedFileName,
  onUploadField,
}: FieldSidebarProps) {
  const { session } = useAuth();
  const importRef = useRef<HTMLInputElement>(null);
  const corpusMapAbortRef = useRef<AbortController | null>(null);
  const [corpusMapDownload, setCorpusMapDownload] = useState<{ url: string; name: string } | null>(null);
  const [isExportingCorpusMap, setIsExportingCorpusMap] = useState(false);

  const slugify = (s: string, max = 60) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\-_ ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, max) || "untitled";

  const today = () => new Date().toISOString().slice(0, 10);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(field, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = uploadedFileName
      ? uploadedFileName.replace(/\.[^.]+$/, "")
      : field.useCase || "field";
    const topCluster = [...field.clusters].sort((a, b) => b.unitCount - a.unitCount)[0]?.label;
    const label = topCluster ? `${base}__${topCluster}` : base;
    a.href = url;
    a.download = `field_${slugify(label)}_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as GeometricField;
        if (parsed.units && parsed.clusters && parsed.stats) {
          onUploadField(parsed, file.name.replace(/\.json$/, ""));
        }
      } catch { /* ignore invalid JSON */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportCorpusMap = async () => {
    if (isExportingCorpusMap) {
      corpusMapAbortRef.current?.abort();
      corpusMapAbortRef.current = null;
      setIsExportingCorpusMap(false);
      toast.info("Stopping corpus map export…");
      return;
    }

    // Use the topology edge function so the export contains nodes + edges +
    // cross-document cluster groups — not chunk-level embeddings by default.
    setIsExportingCorpusMap(true);
    if (corpusMapDownload) URL.revokeObjectURL(corpusMapDownload.url);
    setCorpusMapDownload(null);
    toast.info("Building corpus map…");
    const controller = new AbortController();
    corpusMapAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session. Please sign in again.");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/corpus-map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ min_similarity: 0.55, max_edges: 500, include_chunks: false, include_embeddings: false }),
        signal: controller.signal,
      });

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!response.ok || data?.error) throw new Error(data?.error ?? `Function failed: ${response.status}`);

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const docCount = Array.isArray(data?.documents) ? data.documents.length : 0;
      const topTheme = data?.cross_doc_clusters?.[0]?.label
        ?? data?.nodes?.slice().sort((a: any, b: any) => (b.unit_count ?? 0) - (a.unit_count ?? 0))[0]?.custom_label
        ?? data?.nodes?.slice().sort((a: any, b: any) => (b.unit_count ?? 0) - (a.unit_count ?? 0))[0]?.label
        ?? "corpus";
      const name = `corpus-map_${slugify(topTheme)}_${docCount}docs_${today()}.json`;
      setCorpusMapDownload({ url, name });

      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      toast.success("Corpus map ready");
    } catch (err: any) {
      console.warn("[corpus-map] export failed:", err);
      const message = err?.name === "AbortError" ? "Corpus map stopped or timed out" : (err?.message ?? "Unknown error");
      toast.error(`Corpus map failed: ${message}`);
    } finally {
      window.clearTimeout(timeoutId);
      if (corpusMapAbortRef.current === controller) corpusMapAbortRef.current = null;
      setIsExportingCorpusMap(false);
    }
  };
  return (
    <aside className="w-full md:w-80 md:flex-shrink-0 md:h-full max-h-[50vh] md:max-h-none bg-card border-b md:border-b-0 md:border-r border-border flex flex-col overflow-y-auto md:overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-primary animate-field-pulse" />
          <h1 className="font-mono text-sm font-semibold tracking-wider uppercase text-primary">
            Geometric Field
          </h1>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          Permutation-invariant semantic topology
        </p>
      </div>

      {/* PDF Upload */}
      <PdfUploader onFieldGenerated={onUploadField} />

      {/* Use Case Selector */}
      <div className="p-4 border-b border-border">
        <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-2">
          {uploadedFileName ? "Demo Modes" : "Field Mode"}
        </label>
        {uploadedFileName && (
          <button
            className={`w-full text-left px-3 py-2 rounded-md font-mono text-xs transition-colors mb-1 ${
              useCase === "uploaded"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            onClick={() => onChangeUseCase("uploaded")}
            disabled={useCase === "uploaded"}
          >
            📄 {uploadedFileName}
          </button>
        )}
        <div className="flex flex-col gap-1">
          {(["therapy", "didactics", "research"] as const).map((uc) => (
            <button
              key={uc}
              onClick={() => onChangeUseCase(uc)}
              className={`text-left px-3 py-2 rounded-md font-mono text-xs transition-colors ${
                useCase === uc
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {USE_CASE_LABELS[uc]}
            </button>
          ))}
        </div>
      </div>

      {/* Field Stats */}
      <div className="p-4 border-b border-border">
        <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-3">
          Field Statistics
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-lg font-bold text-foreground">{field.stats.totalUnits}</div>
            <div className="text-[10px] text-muted-foreground font-mono">Units</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-field-fz">{field.stats.boundaryUnits}</div>
            <div className="text-[10px] text-muted-foreground font-mono">Boundary</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-field-fz">{field.stats.avgFZ.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground font-mono">Avg FZ</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-field-fy">{field.stats.avgFY.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground font-mono">Avg FY</div>
          </div>
        </div>
      </div>

      {/* Per-file friction ranking (only when units carry sourcePath, e.g. zip) */}
      {(() => {
        const byFile = new Map<string, { sum: number; count: number; maxCti: number }>();
        for (const u of field.units) {
          if (!u.sourcePath) continue;
          const e = byFile.get(u.sourcePath) ?? { sum: 0, count: 0, maxCti: 0 };
          const c = u.cti ?? 0;
          e.sum += c;
          e.count += 1;
          if (c > e.maxCti) e.maxCti = c;
          byFile.set(u.sourcePath, e);
        }
        if (byFile.size < 2) return null;
        const ranked = Array.from(byFile.entries())
          .map(([path, e]) => ({ path, avgCti: e.sum / e.count, n: e.count, maxCti: e.maxCti }))
          .sort((a, b) => b.avgCti - a.avgCti)
          .slice(0, 10);
        return (
          <div className="p-4 border-b border-border">
            <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-2">
              Friction by file (avg CTI)
            </label>
            <ul className="flex flex-col gap-1">
              {ranked.map((r) => (
                <li key={r.path} className="flex items-center gap-2 text-[11px] font-mono">
                  <div className="flex-1 truncate text-foreground" title={r.path}>{r.path}</div>
                  <div className="w-16 h-1.5 rounded bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-[hsl(320,80%,55%)]"
                      style={{ width: `${Math.min(100, r.avgCti * 200)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-muted-foreground">{r.avgCti.toFixed(2)}</span>
                  <span className="w-8 text-right text-muted-foreground/60">n={r.n}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Clusters */}
      <div className="flex-1 overflow-y-auto p-4">
        <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-3">
          Eigenstates (Clusters)
        </label>
        <div className="flex flex-col gap-2">
          {field.clusters.map((cluster, i) => {
            const isActive = activeCluster === null || activeCluster === i;
            return (
              <motion.button
                key={cluster.id}
                onClick={() => onSelectCluster(activeCluster === i ? null : i)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  activeCluster === i
                    ? "border-primary/30 bg-primary/5"
                    : "border-border hover:border-border hover:bg-secondary/50"
                }`}
                animate={{ opacity: isActive ? 1 : 0.4 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: CLUSTER_COLORS[i] }}
                  />
                  <span className="font-mono text-xs font-medium text-foreground">
                    {cluster.label}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    n={cluster.unitCount}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pl-4">
                  {cluster.description}
                </p>
                <div className="flex gap-4 mt-2 pl-4">
                  <span className="font-mono text-[10px]">
                    <span className="text-field-fz">FZ</span>{" "}
                    <span className="text-muted-foreground">{cluster.avgFZ.toFixed(2)}</span>
                  </span>
                  <span className="font-mono text-[10px]">
                    <span className="text-field-fy">FY</span>{" "}
                    <span className="text-muted-foreground">{cluster.avgFY.toFixed(2)}</span>
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Etapp 2 — corpus navigation */}
        <SearchPanel
          field={field}
          fileName={uploadedFileName ?? null}
          activeClusterId={activeCluster}
          onSelectCluster={onSelectCluster}
        />
      </div>

      {/* Export / Import */}
      <div className="p-4 border-t border-border flex gap-2 flex-wrap">
        <button
          onClick={handleExport}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
        >
          <Download className="w-3 h-3" /> Export
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
        >
          <Upload className="w-3 h-3" /> Import
        </button>
        <button
          onClick={handleExportCorpusMap}
          className="basis-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
          title="Export all cluster summaries across the corpus"
        >
          <MapIcon className="w-3 h-3" /> {isExportingCorpusMap ? "Stop map build" : "Corpus map (JSON)"}
        </button>
        {corpusMapDownload && (
          <a
            href={corpusMapDownload.url}
            download={corpusMapDownload.name}
            className="basis-full text-center font-mono text-[10px] text-primary underline underline-offset-2"
          >
            Download ready corpus-map
          </a>
        )}
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-field-fz" />
            <span>FZ = tension</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-field-fy" />
            <span>FY = resonance</span>
          </div>
        </div>
        <AccountPanel />
      </div>
    </aside>
  );
}
