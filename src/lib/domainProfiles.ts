/**
 * Domain profiles: adapt the AI analysis and the map's interpretation to a
 * field of knowledge. Each profile adds domain guidance to the analysis prompt
 * and defines domain axes (2–4) that every unit is scored on (0..1).
 */
export interface DomainAxis {
  key: string;
  label: string;
  low: string;
  high: string;
}

export interface DomainProfile {
  id: string;
  label: string;
  description: string;
  guidance: string;
  axes: DomainAxis[];
}

export const DOMAIN_PROFILES: DomainProfile[] = [
  {
    id: "general",
    label: "General",
    description: "Neutral relational reading of any text.",
    guidance: "Read the text as a general relational field without domain assumptions.",
    axes: [
      { key: "abstraction", label: "Abstraction", low: "concrete", high: "abstract" },
      { key: "openness", label: "Openness", low: "closed", high: "open question" },
    ],
  },
  {
    id: "poker",
    label: "Poker",
    description: "Hand histories and strategy: GTO vs exploit, ICM pressure.",
    guidance:
      "The text concerns poker (hand histories, strategy, reads). Interpret units as decision signals: position, ranges, sizing, stacks, board texture, opponent reads, tournament (ICM) pressure. High tension marks where the decision is most uncertain.",
    axes: [
      { key: "exploit", label: "GTO ↔ Exploit", low: "balanced / GTO", high: "exploitative" },
      { key: "aggression", label: "Aggression", low: "passive", high: "aggressive" },
      { key: "icm", label: "ICM ↔ chip-EV", low: "chip-EV", high: "ICM pressure" },
      { key: "bluff", label: "Value ↔ Bluff", low: "value", high: "bluff" },
    ],
  },
  {
    id: "research",
    label: "Research",
    description: "Scientific texts: evidence strength and novelty.",
    guidance:
      "The text is scientific or scholarly. Distinguish established findings from hypotheses, speculation and methodological caveats.",
    axes: [
      { key: "evidence", label: "Evidence", low: "speculative", high: "well-supported" },
      { key: "novelty", label: "Novelty", low: "established", high: "novel claim" },
    ],
  },
  {
    id: "law",
    label: "Law & policy",
    description: "Legal and normative texts: obligation and ambiguity.",
    guidance:
      "The text is legal, regulatory or policy-related. Identify obligations, rights, exceptions and interpretive ambiguity.",
    axes: [
      { key: "obligation", label: "Obligation", low: "permissive", high: "binding" },
      { key: "ambiguity", label: "Ambiguity", low: "precise", high: "open to interpretation" },
    ],
  },
  {
    id: "dialogue",
    label: "Dialogue & therapy",
    description: "Conversations: emotional charge and agency.",
    guidance:
      "The text is a conversation or personal narrative. Attend to emotional charge, who holds agency, and what is avoided.",
    axes: [
      { key: "emotion", label: "Emotional charge", low: "calm", high: "charged" },
      { key: "agency", label: "Agency", low: "passive / done-to", high: "owning / acting" },
    ],
  },
];

const KEY = "gvtd:domain-profile";

export function getDomainProfile(id?: string | null): DomainProfile {
  return DOMAIN_PROFILES.find((p) => p.id === id) ?? DOMAIN_PROFILES[0];
}

export function getActiveDomainId(): string {
  try {
    return getDomainProfile(localStorage.getItem(KEY)).id;
  } catch {
    return "general";
  }
}

export function setActiveDomainId(id: string) {
  try {
    localStorage.setItem(KEY, getDomainProfile(id).id);
  } catch {
    /* ignore */
  }
}
