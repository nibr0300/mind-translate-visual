import { useState, useMemo, useCallback } from "react";
import { generateDemoField, type FieldUnit, type GeometricField } from "@/lib/fieldData";
import FieldCanvas from "@/components/FieldCanvas";
import FieldSidebar from "@/components/FieldSidebar";
import FieldInfoPanel from "@/components/FieldInfoPanel";

type UseCase = "therapy" | "didactics" | "research" | "uploaded";

export default function Index() {
  const [useCase, setUseCase] = useState<UseCase>("therapy");
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<FieldUnit | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [uploadedField, setUploadedField] = useState<GeometricField | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const demoField = useMemo(
    () => (useCase !== "uploaded" ? generateDemoField(useCase as "therapy" | "didactics" | "research") : null),
    [useCase]
  );

  const field = useCase === "uploaded" && uploadedField ? uploadedField : demoField!;

  const handleChangeUseCase = (uc: "therapy" | "didactics" | "research") => {
    setUseCase(uc);
    setActiveCluster(null);
    setSelectedUnit(null);
  };

  const handleUploadField = useCallback((newField: GeometricField, fileName: string) => {
    setUploadedField(newField);
    setUploadedFileName(fileName);
    setUseCase("uploaded");
    setActiveCluster(null);
    setSelectedUnit(null);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <FieldSidebar
        field={field}
        activeCluster={activeCluster}
        onSelectCluster={setActiveCluster}
        useCase={useCase}
        onChangeUseCase={handleChangeUseCase}
        uploadedFileName={uploadedFileName}
        onUploadField={handleUploadField}
      />

      <main className="flex-1 relative flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              RFA Geometric Field Translator
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/40">v1.0</span>
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

        <div className="flex-1 relative p-4">
          <FieldCanvas
            field={field}
            activeCluster={activeCluster}
            onSelectCluster={setActiveCluster}
            onSelectUnit={setSelectedUnit}
            selectedUnit={selectedUnit}
          />
          <FieldInfoPanel isOpen={showInfo} onClose={() => setShowInfo(false)} />
        </div>
      </main>
    </div>
  );
}
