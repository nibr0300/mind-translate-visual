import { useState, useMemo } from "react";
import { generateDemoField, type FieldUnit } from "@/lib/fieldData";
import FieldCanvas from "@/components/FieldCanvas";
import FieldSidebar from "@/components/FieldSidebar";
import FieldInfoPanel from "@/components/FieldInfoPanel";

type UseCase = "therapy" | "didactics" | "research";

export default function Index() {
  const [useCase, setUseCase] = useState<UseCase>("therapy");
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<FieldUnit | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const field = useMemo(() => generateDemoField(useCase), [useCase]);

  const handleChangeUseCase = (uc: UseCase) => {
    setUseCase(uc);
    setActiveCluster(null);
    setSelectedUnit(null);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <FieldSidebar
        field={field}
        activeCluster={activeCluster}
        onSelectCluster={setActiveCluster}
        useCase={useCase}
        onChangeUseCase={handleChangeUseCase}
      />

      <main className="flex-1 relative flex flex-col">
        {/* Top bar */}
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

        {/* Canvas */}
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
