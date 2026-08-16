import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { GeometricField, FieldUnit } from "@/lib/fieldData";
import {
  HelpCircle,
  Compass,
  Search,
  Anchor,
  MousePointer2,
  ZoomIn,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Map,
} from "lucide-react";

interface FieldGuideProps {
  field: GeometricField;
  onSelectCluster: (id: number | null) => void;
  onFocusSearch?: () => void;
  onResetView?: () => void;
}

const GUIDE_SECTIONS = [
  {
    title: "Vad kartan visar",
    icon: Map,
    body: "Varje punkt är en textenhet — en mening, ett stycke eller ett fragment — placerad så att liknande enheter hamnar nära varandra. Färgerna visar vilken eigenstate (kluster) enheten tillhör.",
  },
  {
    title: "Läs av fälten",
    icon: Lightbulb,
    body: "FZ (amber) är epistemisk spänning — hur mycket enheten stretar mot sin omgivning. FY (cyan) är resonans — hur väl den samverkar med andra enheter. CTI (magenta) är sammansatt spänning; höga värden markerar kritiska noder.",
  },
  {
    title: "Interagera",
    icon: MousePointer2,
    body: "Klicka en nod för att läsa texten och se dess intentioner. Klicka på ett klusternamn i kartan för att fokusera. Dra för att panorera, scrolla eller nyp för att zooma.",
  },
  {
    title: "Ankare & rotation",
    icon: Anchor,
    body: "Välj en nod och klicka 'Set as anchor' för att vrida fältet runt den. Kartan visar då avstånd i intentionsrummet — vilka enheter ligger längst bort i betydelse, inte bara i position.",
  },
  {
    title: "Sök & fokus",
    icon: Search,
    body: "Använd sökrutan för att hitta ord eller fraser. Matchande noder markeras med en gul ring och kartan zoomar automatiskt till första träffen.",
  },
];

function makePrompts(field: GeometricField): { text: string; action?: () => void }[] {
  const base: { text: string; action?: () => void }[] = [
    { text: "Hovra över en stor nod — vad är den mest spända enheten?" },
    { text: "Klicka på ett klusternamn i kartan för att fokusera bara det klustret." },
    { text: "Använd sökningen för att hitta ett ord du känner igen i texten." },
    { text: "Leta efter en magenta ring — det är en kritisk nod med hög CTI." },
    { text: "Välj en central mening och sätt den som ankare. Vilken nod hamnar längst bort?" },
    { text: "Jämför två kluster — vilken har högst genomsnittlig FZ?" },
    { text: "Exportera corpus-kartan som JSON och låt en AI analysera topologin." },
  ];

  const ctiUnit = field.units.reduce<FieldUnit | null>((best, u) => {
    if (!best || (u.cti ?? 0) > (best.cti ?? 0)) return u;
    return best;
  }, null);

  if (ctiUnit && (ctiUnit.cti ?? 0) > 0.25) {
    base.unshift({
      text: `Högsta CTI just nu: "${ctiUnit.text.slice(0, 40)}…" — klicka för att undersöka.`,
      action: () => {},
    });
  }

  return base;
}

export default function FieldGuide({
  field,
  onSelectCluster,
  onFocusSearch,
  onResetView,
}: FieldGuideProps) {
  const [expanded, setExpanded] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);

  const prompts = useMemo(() => makePrompts(field), [field]);

  // Rotate prompt every 18s, but pause while expanded
  useEffect(() => {
    if (expanded) return;
    const id = window.setInterval(() => {
      setPromptIndex((i) => (i + 1) % prompts.length);
    }, 18000);
    return () => window.clearInterval(id);
  }, [expanded, prompts.length]);

  const activePrompt = prompts[promptIndex % prompts.length];

  return (
    <div className="p-4 border-b border-border bg-secondary/20">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-[11px] tracking-widest uppercase text-foreground">
            Field Guide
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground hidden group-hover:inline">
            {expanded ? "Stäng" : "Öppna"}
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Compact summary visible even when collapsed */}
      {!expanded && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-field-fz" />
            <span>FZ = spänning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-field-fy" />
            <span>FY = resonans</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-field-cti" />
            <span>CTI = kritisk</span>
          </div>
        </div>
      )}

      {/* Expanded guide */}
      <>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {GUIDE_SECTIONS.map((section) => (
                <div key={section.title} className="flex gap-2.5">
                  <section.icon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-[10px] tracking-wider uppercase text-foreground mb-0.5">
                      {section.title}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {section.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Keyboard shortcuts */}
            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-[10px] font-mono text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground">/</kbd>
                <span>sök</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground">R</kbd>
                <span>återställ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground">Esc</kbd>
                <span>stäng</span>
              </div>
            </div>
          </motion.div>
        )}
      </>

      {/* Exploration prompt — the gentle "gamification" layer */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Compass className="w-3 h-3 text-primary" />
          <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
            Utforska vidare
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.button
            key={promptIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            onClick={() => {
              if (activePrompt.text.includes("sök") && onFocusSearch) onFocusSearch();
              else if (activePrompt.text.includes("återställ") && onResetView) onResetView();
              else if (activePrompt.text.includes("klusternamn")) onSelectCluster(0);
              setPromptIndex((i) => (i + 1) % prompts.length);
            }}
            className="w-full text-left p-2.5 rounded-md border border-border/60 bg-card/30 hover:border-primary/30 hover:bg-primary/5 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <Sparkles className="w-3 h-3 text-primary shrink-0 mt-0.5 group-hover:animate-pulse" />
              <p className="text-[11px] leading-relaxed text-foreground">
                {activePrompt.text}
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-muted-foreground group-hover:text-primary">
              <span>Klicka för nästa uppdrag</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </motion.button>
        </AnimatePresence>
      </div>
    </div>
  );
}
