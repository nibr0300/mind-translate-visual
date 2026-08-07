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
  intention?: {
    speechAct: "assertive" | "directive" | "commissive" | "expressive" | "declarative";
    epistemicCertainty: number;
    intentionalForce: number;
    truthTension: number;
    moralTension?: number;
    narrativeTension?: number;
    denialMarker?: number;
  };
  triangulation?: {
    llmTension: number;
    lexicalTension: number;
    discrepancy: number;
    clusterDeviation: number;
    triangulated: number;
  };
  /** Composite Tension Index: geometric mean of internal discrepancy × external cluster deviation */
  cti?: number;
  /** Origin path inside the source (e.g. a file inside a zip). Enables per-file friction ranking. */
  sourcePath?: string;
  /** True when the TF-IDF vector carried no signal: the 2D position is fallback, not semantics. */
  degenerate?: boolean;
  /** Number of kNN neighbours in the original high-dimensional space. */
  degree?: number;
  /** Similarity-weighted centrality (0..1), normalized across the field. */
  weightedCentrality?: number;
}

/** Edge in the kNN graph computed in the original vector space (not the 2D projection). */
export interface FieldEdge {
  source: string;
  target: string;
  similarity: number;
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
  /** kNN graph in the original vector space — enables real network analysis on export. */
  edges?: FieldEdge[];
  stats: {
    totalUnits: number;
    boundaryUnits: number;
    avgFZ: number;
    avgFY: number;
    /** Units analyzed vs units found in the source (set when the source was capped). */
    analyzedOf?: { analyzed: number; total: number };
    /** unique coordinates / units — how much the 2D projection can be trusted. */
    coordinateResolution?: number;
    /** Units whose vector carried no signal (fallback placement). */
    degenerateUnits?: number;
    /** Human-readable warnings about the ingestion (markup stripped, truncation, …). */
    notes?: string[];
  };
  useCase: string;
}

const CLUSTER_DEFS: Record<string, { label: string; description: string; center: [number, number] }[]> = {
  didactics: [
    { label: "Core Concepts", description: "Foundational definitions and axioms that anchor the knowledge domain", center: [-2.0, 0.5] },
    { label: "Examples & Analogies", description: "Concrete illustrations that bridge abstract theory to lived experience", center: [2.5, 1.5] },
    { label: "Misconceptions", description: "Common errors in understanding — high FZ zones where confusion clusters", center: [0.0, 2.8] },
    { label: "Assessment Points", description: "Key checkpoints for verifying comprehension and skill transfer", center: [-1.5, -2.2] },
    { label: "Cross-References", description: "Boundary units linking this topic to adjacent knowledge domains", center: [2.0, -1.8] },
  ],
  "truth-seeking": [
    { label: "Claims Under Review", description: "Statements, hypotheses, and propositions whose status is being tested", center: [-2.2, 1.2] },
    { label: "Evidence & Counter-evidence", description: "Observations, data, and arguments that support or challenge claims", center: [2.0, 2.0] },
    { label: "Methods of Verification", description: "Procedures, controls, and criteria used to validate or falsify claims", center: [0.5, -2.5] },
    { label: "Unresolved Tensions", description: "Open questions and discrepancies at the edge of current understanding", center: [-1.0, -1.0] },
    { label: "Established Facts", description: "Accepted findings and prior results that frame the current inquiry", center: [3.0, -0.5] },
  ],
  negotiation: [
    { label: "Stakeholder Positions", description: "Declared interests and opening stands held by each party", center: [-2.5, 1.8] },
    { label: "Conflict Points", description: "Issues where positions clash and tension is highest", center: [2.2, 2.5] },
    { label: "Common Ground", description: "Shared interests and agreement zones that can anchor a deal", center: [0.3, -2.0] },
    { label: "Trade-offs", description: "Concessions, costs, and compromises under consideration", center: [-1.8, -1.5] },
    { label: "Proposed Agreements", description: "Emerging solutions, packages, and possible resolutions", center: [2.8, -0.8] },
  ],
};

const DEMO_TEXTS: Record<string, string[]> = {
  didactics: [
    "A definition must be precise enough to exclude counterexamples",
    "Think of a vector as an arrow with both length and direction",
    "Students often confuse correlation with causation",
    "Can you apply this rule to a case we have not seen before?",
    "This concept connects to what we learned about entropy",
    "The axiom is assumed without proof in this system",
    "A counterexample shows why the converse does not hold",
    "The analogy breaks down at very small scales",
    "Check your understanding by solving the boundary case",
    "The formula is valid only under these assumptions",
    "Prior knowledge from linear algebra is required here",
    "This theorem generalizes the result from two dimensions",
    "The proof relies on induction over the set cardinality",
    "A common misconception is that infinity is a number",
    "The model predicts behavior under ideal conditions",
    "We assess transfer by applying the method to a new domain",
    "The abstraction hides details that matter in practice",
    "Examples anchor the definition before we formalize it",
    "The reading assignment links to the lecture on recursion",
    "Mastery is measured by performance on unfamiliar problems",
    "The core distinction is between syntax and semantics",
    "A worked example reduces the cognitive load",
    "The misconception resurfaces when notation changes",
    "We verify comprehension through explanation, not recall",
    "The concept map shows how ideas depend on each other",
    "The special case is trivial but the general case is not",
    "This skill transfers to debugging and system design",
    "The boundary between definitions is where errors cluster",
    "A good explanation anticipates the likely confusion",
    "The practice set is designed to reveal hidden gaps",
  ],
  "truth-seeking": [
    "The hypothesis predicts a measurable effect within two weeks",
    "Preliminary data contradicts the expected correlation",
    "The control group showed no significant change",
    "We need to replicate this before drawing conclusions",
    "This finding challenges the established model",
    "The methodology section lacks sufficient detail",
    "Peer review flagged the statistical method",
    "The sample size is too small for generalization",
    "Alternative explanations have not been ruled out",
    "The confidence interval is wider than expected",
    "This observation is consistent with prior experiments",
    "The measurement error could account for the anomaly",
    "We should distinguish between correlation and causation",
    "The null hypothesis remains plausible",
    "Independent verification strengthened the claim",
    "The theory makes testable predictions",
    "Conflicting evidence emerged from the second cohort",
    "The boundary conditions are not well defined",
    "Further investigation is required at the edge cases",
    "The model fits the data but lacks explanatory power",
    "Reproducibility concerns were raised by reviewers",
    "The experiment controls for known confounders",
    "Anomalies clustered around the transition point",
    "The literature review revealed contradictory findings",
    "We need a more precise operational definition",
    "The effect size is smaller than originally claimed",
    "Data quality issues limit the strength of inference",
    "The claim rests on a single unreplicated result",
    "Measurement bias could explain the discrepancy",
    "The next step is to test the falsifiable prediction",
  ],
  negotiation: [
    "Our position requires a guaranteed minimum delivery",
    "The other side raised concerns about liability",
    "We agree on the timeline but not the pricing",
    "This concession would protect the core interest",
    "The conflict centers on resource allocation",
    "A phased approach could satisfy both parties",
    "We are willing to compromise on scope",
    "The red line is non-negotiable for us",
    "Both parties benefit from a long-term agreement",
    "The previous offer was rejected unanimously",
    "We need a fallback if the primary deal fails",
    "Trust improved after the information exchange",
    "The trade-off between speed and quality is central",
    "Their opening position was more aggressive than expected",
    "We can split the difference on payment terms",
    "A third option emerged during the discussion",
    "The sticking point is the exclusivity clause",
    "Common ground exists on the environmental standards",
    "The deadline pressure forces creative solutions",
    "We propose a binding mediation clause",
    "Both sides acknowledge the risk of deadlock",
    "The package deal includes several linked issues",
    "Emotional language escalated during the last round",
    "A cooling-off period may prevent impasse",
    "We value the relationship more than this single win",
    "Their priorities appear different from ours",
    "The negotiation scope should be clarified first",
    "A contingent agreement handles uncertainty",
    "We need to verify their authority to decide",
    "The final terms must be documented in writing",
  ],
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateDemoField(useCase: "didactics" | "truth-seeking" | "negotiation"): GeometricField {
  const rand = seededRandom(42 + useCase.length);
  const defs = CLUSTER_DEFS[useCase];
  const units: FieldUnit[] = [];
  const texts = DEMO_TEXTS[useCase] ?? DEMO_TEXTS["didactics"];

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
