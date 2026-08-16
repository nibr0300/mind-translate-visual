import { useState, useMemo, useCallback, useEffect } from "react";
import { generateDemoField, type FieldUnit, type GeometricField } from "@/lib/fieldData";
import FieldCanvas from "@/components/FieldCanvas";
import FieldSidebar from "@/components/FieldSidebar";
import FieldInfoPanel from "@/components/FieldInfoPanel";

type UseCase = "didactics" | "truth-seeking" | "negotiation" | "uploaded";

/** Survive preview/tab reloads: a generated field is expensive, never lose it silently. */
const FIELD_CACHE_KEY = "gvtd:last-field";
/**
 * Bump whenever the analysis engine changes (tokenizer, vocabulary, projection).
 * Otherwise a cached field from an older engine keeps being shown and the user
 * sees stale results after a fix.
 */
const ENGINE_VERSION = 3;

function readCachedField(): { field: GeometricField; fileName: string } | null {
  try {
    const raw = sessionStorage.getItem(FIELD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.engineVersion !== ENGINE_VERSION) {
      sessionStorage.removeItem(FIELD_CACHE_KEY);
      return null;
    }
    if (!parsed?.field?.units?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}


export default function Index() {
  const cached = useMemo(readCachedField, []);
  const [useCase, setUseCase] = useState<UseCase>(cached ? "uploaded" : "didactics");
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<FieldUnit | null>(null);
  const [anchorUnitId, setAnchorUnitId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [uploadedField, setUploadedField] = useState<GeometricField | null>(cached?.field ?? null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(cached?.fileName ?? null);

  const demoField = useMemo(
    () => (useCase !== "uploaded" ? generateDemoField(useCase as "didactics" | "truth-seeking" | "negotiation") : null),
    [useCase]
  );

  // Persist the uploaded field so an unexpected reload restores it instead of resetting to demo state.
  useEffect(() => {
    if (!uploadedField) return;
    try {
      sessionStorage.setItem(
        FIELD_CACHE_KEY,
        JSON.stringify({ field: uploadedField, fileName: uploadedFileName })
      );
    } catch {
      /* quota exceeded — field stays in memory only */
    }
  }, [uploadedField, uploadedFileName]);


  const field = useCase === "uploaded" && uploadedField ? uploadedField : demoField!;
  const anchorUnit = useMemo(
    () => (anchorUnitId ? field.units.find((u) => u.id === anchorUnitId) ?? null : null),
    [anchorUnitId, field.units]
  );

  const handleChangeUseCase = (uc: UseCase) => {
    if (uc === "uploaded" && !uploadedField) return;
    setUseCase(uc);
    setActiveCluster(null);
    setSelectedUnit(null);
    setAnchorUnitId(null);
  };

  const handleUploadField = useCallback((newField: GeometricField, fileName: string) => {
    setUploadedField(newField);
    setUploadedFileName(fileName);
    setUseCase("uploaded");
    setActiveCluster(null);
    setSelectedUnit(null);
    setAnchorUnitId(null);
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen w-screen md:overflow-hidden bg-background">
      <FieldSidebar
        field={field}
        activeCluster={activeCluster}
        onSelectCluster={setActiveCluster}
        useCase={useCase}
        onChangeUseCase={handleChangeUseCase}
        uploadedFileName={uploadedFileName}
        onUploadField={handleUploadField}
        anchorUnit={anchorUnit}
        onClearAnchor={() => setAnchorUnitId(null)}
      />


      <main className="flex-1 relative flex flex-col min-h-screen md:min-h-0">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              Geometric Vector — Tension Data
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/40">v2.0</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-muted-foreground">
              {field.stats.totalUnits} units · {field.clusters.length} eigenstates
            </span>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="font-mono text-[11px] px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
            >
              {showInfo ? "Hide" : "How it works"}
            </button>
          </div>
        </header>

        <div className="relative p-4 h-[85vh] md:h-auto md:flex-1 md:min-h-0">
          <FieldCanvas
            field={field}
            activeCluster={activeCluster}
            onSelectCluster={setActiveCluster}
            onSelectUnit={setSelectedUnit}
            selectedUnit={selectedUnit}
            anchorUnit={anchorUnit}
            onSetAnchor={(u) => setAnchorUnitId(u ? u.id : null)}
          />

          <FieldInfoPanel isOpen={showInfo} onClose={() => setShowInfo(false)} />
        </div>
      </main>
    </div>
  );
}
