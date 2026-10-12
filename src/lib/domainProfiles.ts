/**
 * Domain profiles: adapt the AI analysis and the map's interpretation to a
 * field of knowledge. Each profile adds domain guidance to the analysis prompt
 * and defines domain axes that every unit is scored on (0..1).
 *
 * A profile may additionally declare:
 *  - `sourceClasses`: weighted source taxonomy (scope beats blog)
 *  - `axisDictionaries`: deterministic lexical annotation per axis pole
 *  - `families`: grouping of axes for display
 */
export interface DomainAxis {
  key: string;
  label: string;
  low: string;
  high: string;
  /** Optional grouping label used by the sidebar. */
  family?: string;
}

export interface SourceClass {
  id: string;
  label: string;
  weight: number;
  description: string;
}

/** Per axis: words/phrases that pull a unit towards the low or the high pole. */
export type AxisDictionary = Record<string, { low: string[]; high: string[] }>;

export interface DomainProfile {
  id: string;
  label: string;
  description: string;
  guidance: string;
  axes: DomainAxis[];
  sourceClasses?: SourceClass[];
  axisDictionaries?: AxisDictionary;
  /**
   * Send axes to the LLM for scoring. Profiles with a calibrated lexical layer
   * keep this off so the field rests on a deterministic ground.
   */
  llmAxesByDefault?: boolean;
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
    llmAxesByDefault: true,
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
    llmAxesByDefault: true,
  },
  {
    id: "bugbounty",
    label: "Bug bounty",
    description: "Ethical hacking: scope, attack surface and report value.",
    guidance:
      "The text belongs to a bug bounty engagement: scope definitions, program policy, API references, recon output, changelogs, write-ups. Read every unit as attack surface, rule or evidence — never as prose for its own sake. High tension marks where scope, trust boundary or authorisation is ambiguous. Never propose exploitation steps; describe the surface only.",
    axes: [
      { key: "breadth_depth", label: "Breadth ↔ Depth", low: "breadth", high: "depth", family: "Search" },
      { key: "passive_active", label: "Passive ↔ Active", low: "passive", high: "active", family: "Search" },
      { key: "manual_automated", label: "Manual ↔ Automated", low: "manual", high: "automated", family: "Search" },
      { key: "deterministic_intermittent", label: "Deterministic ↔ Intermittent", low: "deterministic", high: "intermittent", family: "Search" },
      { key: "pre_post_auth", label: "Pre- ↔ Post-auth", low: "pre-auth", high: "post-auth", family: "Surface" },
      { key: "authn_authz", label: "AuthN ↔ AuthZ", low: "authentication", high: "authorisation", family: "Surface" },
      { key: "stateless_race", label: "Stateless ↔ Race", low: "stateless", high: "race condition", family: "Surface" },
      { key: "inband_oob", label: "In-band ↔ Out-of-band", low: "in-band", high: "out-of-band", family: "Surface" },
      { key: "signature_semantics", label: "Signature ↔ Semantics", low: "signature", high: "semantics", family: "Surface" },
      { key: "trust_boundary", label: "Client trust ↔ Server validate", low: "client trust", high: "server validation", family: "Surface" },
      { key: "impact_demonstrable", label: "Theoretical ↔ Demonstrable", low: "theoretical", high: "demonstrable impact", family: "Value" },
      { key: "duplicate_uniqueness", label: "Duplicate ↔ Unique", low: "duplicate", high: "unique", family: "Value" },
      { key: "scope_adjacent", label: "In scope ↔ Adjacent", low: "in scope", high: "adjacent / out of scope", family: "Value" },
      { key: "single_chain", label: "Single ↔ Chain", low: "single issue", high: "chained", family: "Value" },
    ],
    sourceClasses: [
      { id: "scope", label: "Scope", weight: 1.0, description: "in/out-of-scope assets, wildcards" },
      { id: "policy", label: "Policy", weight: 0.9, description: "rules, bounty table, disclosure" },
      { id: "writeups", label: "Write-ups", weight: 0.9, description: "your own previous reports" },
      { id: "api_doc", label: "API docs", weight: 0.8, description: "OpenAPI, GraphQL schema, reference" },
      { id: "recon", label: "Recon", weight: 0.8, description: "subdomains, headers, fingerprints, robots" },
      { id: "changelog", label: "Changelog", weight: 0.7, description: "release notes — new or changed surface" },
      { id: "frontend", label: "Frontend", weight: 0.7, description: "JS strings, endpoint names, source maps" },
      { id: "docs", label: "Docs", weight: 0.6, description: "public product/help documents" },
      { id: "issues", label: "Issues", weight: 0.5, description: "public repo issues and PRs" },
      { id: "blog", label: "Blog", weight: 0.5, description: "engineering blog" },
    ],
    axisDictionaries: {
      breadth_depth: {
        low: ["subdomain", "asset list", "wildcard", "inventory", "enumerate", "all hosts", "surface map"],
        high: ["deep dive", "root cause", "internals", "code path", "step through", "specific endpoint"],
      },
      passive_active: {
        low: ["passive", "osint", "observe", "archive", "certificate transparency", "public record", "read-only"],
        high: ["fuzz", "probe", "scan", "request", "payload", "inject", "brute", "active test"],
      },
      manual_automated: {
        low: ["manual", "by hand", "inspect", "review", "read the code"],
        high: ["automated", "scanner", "nuclei", "burp suite", "script", "crawler", "pipeline", "wordlist"],
      },
      deterministic_intermittent: {
        low: ["deterministic", "always", "reproducible", "every request", "consistent"],
        high: ["intermittent", "sometimes", "flaky", "timing", "under load", "race", "non-deterministic"],
      },
      pre_post_auth: {
        low: ["unauthenticated", "pre-auth", "anonymous", "public endpoint", "no token", "guest"],
        high: ["authenticated", "post-auth", "logged in", "session", "bearer", "api key required", "member only"],
      },
      authn_authz: {
        low: ["login", "authentication", "password", "mfa", "otp", "sso", "sign in", "credential"],
        high: ["authorization", "permission", "role", "idor", "access control", "tenant", "privilege", "acl", "ownership"],
      },
      stateless_race: {
        low: ["stateless", "idempotent", "single request", "pure function"],
        high: ["race", "concurrent", "parallel requests", "toctou", "double spend", "lock", "transaction"],
      },
      inband_oob: {
        low: ["response body", "in-band", "reflected", "returned in the response"],
        high: ["out-of-band", "oob", "webhook", "callback", "dns", "collaborator", "interactsh", "ssrf", "email delivery"],
      },
      signature_semantics: {
        low: ["signature", "regex", "pattern", "waf", "blocklist", "known payload", "cve"],
        high: ["business logic", "semantics", "workflow", "intended behaviour", "state machine", "logic flaw"],
      },
      trust_boundary: {
        low: ["client-side", "hidden field", "frontend check", "javascript validation", "disabled button", "local storage"],
        high: ["server-side validation", "backend check", "enforced on the server", "signed", "verified server side"],
      },
      impact_demonstrable: {
        low: ["theoretical", "potential", "could be", "might allow", "informational", "best practice"],
        high: ["proof of concept", "demonstrated", "exfiltrated", "account takeover", "data exposure", "rce", "confirmed impact"],
      },
      duplicate_uniqueness: {
        low: ["duplicate", "already reported", "known issue", "previously disclosed"],
        high: ["novel", "not previously reported", "new finding", "first report", "undocumented"],
      },
      scope_adjacent: {
        low: ["in scope", "eligible", "wildcard", "covered by the program", "bounty eligible"],
        high: ["out of scope", "third party", "affiliate", "not eligible", "excluded", "vendor-owned", "adjacent"],
      },
      single_chain: {
        low: ["single issue", "standalone", "isolated"],
        high: ["chain", "chained", "pivot", "combined with", "escalate to", "multi-step", "leads to"],
      },
    },
    llmAxesByDefault: false,
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
    llmAxesByDefault: true,
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
    llmAxesByDefault: true,
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
    llmAxesByDefault: true,
  },
];

const KEY = "gvtd:domain-profile";
const SOURCE_CLASS_KEY = "gvtd:source-class";
const LLM_AXES_KEY = "gvtd:llm-axes";

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

/** Source class chosen for the next upload, within the active profile. */
export function getActiveSourceClass(domainId?: string | null): SourceClass | null {
  const profile = getDomainProfile(domainId ?? getActiveDomainId());
  if (!profile.sourceClasses?.length) return null;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(`${SOURCE_CLASS_KEY}:${profile.id}`);
  } catch {
    /* ignore */
  }
  return profile.sourceClasses.find((c) => c.id === stored) ?? profile.sourceClasses[0];
}

export function setActiveSourceClass(domainId: string, classId: string) {
  try {
    localStorage.setItem(`${SOURCE_CLASS_KEY}:${domainId}`, classId);
  } catch {
    /* ignore */
  }
}

/** Whether the LLM should also score the domain axes (lexical layer always runs). */
export function getLlmAxesEnabled(domainId?: string | null): boolean {
  const profile = getDomainProfile(domainId ?? getActiveDomainId());
  try {
    const stored = localStorage.getItem(`${LLM_AXES_KEY}:${profile.id}`);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /* ignore */
  }
  return profile.llmAxesByDefault !== false;
}

export function setLlmAxesEnabled(domainId: string, enabled: boolean) {
  try {
    localStorage.setItem(`${LLM_AXES_KEY}:${domainId}`, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Deterministic axis annotation. Returns a 0..1 score per axis that has at
 * least one dictionary hit; axes without hits are omitted (never guessed).
 */
export function lexicalAxisHits(text: string, profile: DomainProfile): Record<string, number> {
  const dict = profile.axisDictionaries;
  if (!dict) return {};
  const hay = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const out: Record<string, number> = {};
  for (const axis of profile.axes) {
    const entry = dict[axis.key];
    if (!entry) continue;
    const count = (terms: string[]) => terms.reduce((n, t) => (hay.includes(` ${t}`) || hay.includes(`${t} `) ? n + 1 : n), 0);
    const lo = count(entry.low);
    const hi = count(entry.high);
    if (lo === 0 && hi === 0) continue;
    // Pull towards the pole with more hits; strength grows with dominance.
    const total = lo + hi;
    const raw = hi / total;
    const confidence = Math.min(1, total / 2);
    out[axis.key] = Math.round((0.5 + (raw - 0.5) * confidence) * 100) / 100;
  }
  return out;
}
