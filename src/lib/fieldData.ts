// Simulated geometric field data for demo mode

export interface FieldUnit {
  id: string;
  text: string;
  pos: { x: number; y: number };
  vector2d: [number, number];
  clusterId: number;
  type: "heading" | "paragraph" | "fragment";
  fz: number; // epistemic tension 0-1
  fy: number; // resonance 0-1
}

export interface FieldCluster {
  id: number;
  label: string;
  center: [number, number];
  unitCount: number;
  avgFZ: number;
  avgFY: number;
  description: string;
}

export interface GeometricField {
  units: FieldUnit[];
  clusters: FieldCluster[];
  stats: {
    totalUnits: number;
    boundaryUnits: number;
    avgFZ: number;
    avgFY: number;
  };
  useCase: string;
}

const CLUSTER_DEFS: Record<string, { label: string; description: string; center: [number, number] }[]> = {
  therapy: [
    { label: "Emotional Reflection", description: "Self-awareness passages exploring internal states and emotional patterns", center: [-2.5, 1.8] },
    { label: "Trigger Events", description: "Descriptions of activating events that initiated stress or anxiety responses", center: [2.2, 2.5] },
    { label: "Insight Moments", description: "Breakthroughs in understanding — connections between past and present behavior", center: [0.3, -2.0] },
    { label: "Coping Strategies", description: "Documented approaches to self-regulation, grounding techniques, and resilience", center: [-1.8, -1.5] },
    { label: "Renewal Patterns", description: "Recurring motifs of recovery, hope, and forward movement after difficulty", center: [2.8, -0.8] },
  ],
  didactics: [
    { label: "Core Concepts", description: "Foundational definitions and axioms that anchor the knowledge domain", center: [-2.0, 0.5] },
    { label: "Examples & Analogies", description: "Concrete illustrations that bridge abstract theory to lived experience", center: [2.5, 1.5] },
    { label: "Misconceptions", description: "Common errors in understanding — high FZ zones where confusion clusters", center: [0.0, 2.8] },
    { label: "Assessment Points", description: "Key checkpoints for verifying comprehension and skill transfer", center: [-1.5, -2.2] },
    { label: "Cross-References", description: "Boundary units linking this topic to adjacent knowledge domains", center: [2.0, -1.8] },
  ],
  research: [
    { label: "Hypothesis Space", description: "Primary claims and theoretical propositions under investigation", center: [-2.2, 1.2] },
    { label: "Evidence Clusters", description: "Data points and experimental observations supporting or challenging hypotheses", center: [2.0, 2.0] },
    { label: "Methodology", description: "Procedural descriptions — the how of inquiry and measurement", center: [0.5, -2.5] },
    { label: "Boundary Questions", description: "Unresolved tensions at the edges of current understanding — highest FZ", center: [-1.0, -1.0] },
    { label: "Prior Work", description: "Referenced literature and established findings from the field", center: [3.0, -0.5] },
  ],
};

const THERAPY_TEXTS = [
  "I noticed the tightness in my chest again today",
  "When she said that, I froze — same pattern as childhood",
  "The breathing exercise actually worked this time",
  "I keep returning to this image of the closed door",
  "Something shifted when I said it out loud",
  "The anger isn't really about the meeting",
  "I felt safe enough to cry",
  "This reminds me of what Dr. K said about attachment",
  "Three weeks without the nightmare now",
  "I can hold two feelings at once — that's new",
  "The body remembers what the mind forgets",
  "Writing this down changes how it feels",
  "I chose to stay present instead of dissociating",
  "The pattern: stress → withdrawal → guilt → more stress",
  "Today I asked for help without apologizing",
  "My inner critic sounds exactly like my father",
  "I drew the feeling instead of describing it",
  "Small progress is still progress",
  "The boundary I set was respected",
  "I noticed gratitude without forcing it",
  "Tension between what I want and what feels safe",
  "The grief isn't linear — it circles back",
  "I recognized the trigger before reacting",
  "Sleep improved after the journaling practice",
  "There's a version of me that already knows how to do this",
  "The weight of unspoken words",
  "I surprised myself today",
  "Sitting with discomfort instead of fixing it",
  "The connection between that memory and this fear",
  "I am not my anxiety",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateDemoField(useCase: "therapy" | "didactics" | "research"): GeometricField {
  const rand = seededRandom(42 + useCase.length);
  const defs = CLUSTER_DEFS[useCase];
  const units: FieldUnit[] = [];
  const texts = THERAPY_TEXTS; // reuse for all modes in demo

  for (let i = 0; i < 30; i++) {
    const clusterId = Math.floor(rand() * 5);
    const def = defs[clusterId];
    const spread = 0.8 + rand() * 0.6;
    const angle = rand() * Math.PI * 2;
    const dist = rand() * spread;
    const x = def.center[0] + Math.cos(angle) * dist;
    const y = def.center[1] + Math.sin(angle) * dist;

    // FZ higher for boundary points (far from cluster center)
    const distFromCenter = Math.sqrt((x - def.center[0]) ** 2 + (y - def.center[1]) ** 2);
    const fz = Math.min(1, 0.2 + distFromCenter * 0.6 + rand() * 0.2);
    const fy = Math.max(0, 1 - distFromCenter * 0.5 + rand() * 0.15);

    units.push({
      id: `u${i}`,
      text: texts[i % texts.length],
      pos: { x: (x + 4) / 8, y: (y + 4) / 8 },
      vector2d: [x, y],
      clusterId,
      type: rand() > 0.7 ? "heading" : rand() > 0.4 ? "paragraph" : "fragment",
      fz: Math.round(fz * 100) / 100,
      fy: Math.round(fy * 100) / 100,
    });
  }

  const clusters: FieldCluster[] = defs.map((def, i) => {
    const clusterUnits = units.filter((u) => u.clusterId === i);
    return {
      id: i,
      label: def.label,
      center: def.center,
      unitCount: clusterUnits.length,
      avgFZ: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fz, 0) / clusterUnits.length : 0,
      avgFY: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fy, 0) / clusterUnits.length : 0,
      description: def.description,
    };
  });

  const boundaryUnits = units.filter((u) => u.fz > 0.65).length;

  return {
    units,
    clusters,
    stats: {
      totalUnits: units.length,
      boundaryUnits,
      avgFZ: units.reduce((s, u) => s + u.fz, 0) / units.length,
      avgFY: units.reduce((s, u) => s + u.fy, 0) / units.length,
    },
    useCase,
  };
}
