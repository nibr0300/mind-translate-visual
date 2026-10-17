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
import { pokerNumericAxes } from "./pokerMath";
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

/** A dictionary term: plain string (weight 0.7) or [term, weight]. */
export type AxisTerm = string | [string, number];

/** Per axis: words/phrases that pull a unit towards the low or the high pole. */
export type AxisDictionary = Record<string, { low: AxisTerm[]; high: AxisTerm[]; lowRegex?: RegExp[]; highRegex?: RegExp[] }>;

/** Contrast-based tension weights (see recalibrateFz in domainLayer). */
export interface FzCalibration {
  llmTension: number;
  triangulated: number;
  cti: number;
  axisBonus: number;
  oppositionBonus: number;
  directivePenalty: number;
}

export interface DomainProfile {
  id: string;
  label: string;
  description: string;
  guidance: string;
  axes: DomainAxis[];
  questionTemplates?: Record<string, { high: { threshold: number; templates: string[] }; medium?: { threshold: number; templates: string[] } }>;
  sourceClasses?: SourceClass[];
  axisDictionaries?: AxisDictionary;
  /** Numeric parser: numbers in the text set axis scores and override dictionary hits. */
  numericAxes?: (text: string) => Record<string, { score: number; low: number; high: number }>;
  /** Replace the generic FZ blend with a contrast-based formula. */
  fzCalibration?: FzCalibration;
  /**
   * Send axes to the LLM for scoring. Profiles with a calibrated lexical layer
   * keep this off so the field rests on a deterministic ground.
   */
  llmAxesByDefault?: boolean;
}

export const pokerAxisTemplates: NonNullable<DomainProfile["questionTemplates"]> = {
  stack_urgency: {
    high: { threshold: 0.7, templates: ["Hur ska jag justera min öppnings- och push/fold-strategi när stackdjupet krymper under 15 BB?", "Vilka händer har tillräcklig blocker-effekt för att gå all-in med när jag är shortstacked?", "Hur undviker jag att bli utbluffad när min stack inte tillåter komplexa postflop-linjer?"] },
    medium: { threshold: 0.4, templates: ["Hur påverkar mitt nuvarande stackdjup vilka händer jag kan syna med i position?", "När är det lönsamt att offra en del av stacken för att se en flop med spekulativa händer?"] },
  },
  icm_pressure: {
    high: { threshold: 0.7, templates: ["Hur påverkar ICM-trycket vid bubblan mitt syn-intervall mot en aggressiv spelare?", "När ska jag vägra syna en all-in även med en stark hand nära utbetalningsstrukturen?", "Hur balanserar jag mellan att säkra en plats i pengarna och att maximera förväntat värde?"] },
    medium: { threshold: 0.4, templates: ["Hur ska jag justera min strategi när vi närmar oss de betalda platserna?", "Vilka händer är för starka att lägga vid bubblan även mot tighta spelare?"] },
  },
  bluff_math: { high: { threshold: 0.6, templates: ["Hur beräknar jag den optimala bluff-frekvensen för att göra motståndarens syn indifferent?", "När är en semi-bluff mer lönsam än en ren bluff på turn?", "Hur använder jag blocker-effekter för att avgöra om en bluff har tillräcklig fold-equity?"] } },
  range_polarity: {
    high: { threshold: 0.7, templates: ["Hur polariserar jag mitt betting-intervall på river för att maximera värdet från både value-bets och bluffar?", "När ska jag använda en liten bet-storlek med ett polariserat range jämfört med en stor bet?", "Hur undviker jag att bli förutsägbar när jag använder samma betting-storlek för både starka och svaga händer?"] },
    medium: { threshold: 0.4, templates: ["Hur breddar jag mitt öppnings-intervall i sen position utan att bli för löst?", "När är det lämpligt att använda en linjär betting-strategi istället för en polariserad?"] },
  },
  exploit: {
    high: { threshold: 0.7, templates: ["Hur exploaterar jag en spelare som överviker mot c-bets på turn?", "Vilka justeringar gör jag mot en spelare som synar för mycket med svaga händer?", "Hur straffar jag en motståndare som lägger för ofta mot continuation-bets?"] },
    medium: { threshold: 0.4, templates: ["Hur identifierar jag en spelares tendenser under de första 20 händerna vid bordet?", "När ska jag avvika från GTO-strategin för att exploatera en specifik motståndare?"] },
  },
  multiway_viability: { high: { threshold: 0.7, templates: ["Vilka händer har tillräckligt multiway-värde för att syna i en stor pott med flera spelare?", "Hur justerar jag min strategi när potten blir multiway och positionen försämras?", "När är det lönsamt att lägga en stark men sårbar hand i en multiway-pott?"] } },
  speculative_threshold: { high: { threshold: 0.7, templates: ["Hur bedömer jag om implicita odds rättfärdigar en syn med en spekulativ hand?", "När är tröskeln för att syna med suited connectors tillräckligt låg för att vara lönsam?", "Hur beräknar jag break-even-punkten för att syna med små par för att träffa set?"] } },
  defensive_honesty: { high: { threshold: 0.6, templates: ["Hur skyddar jag min hand mot draws utan att överinvestera i potten?", "När är det bättre att checka och kontrollera pot-storleken istället för att betta för protection?", "Hur undviker jag att bli utbluffad när jag har en medelstark hand i en stor pott?"] } },
  aggression_decay: { high: { threshold: 0.6, templates: ["Hur justerar jag min aggressionsnivå när motståndaren visar styrka över flera betting-rundor?", "När ska jag ge upp på en bluff när motståndaren inte viker sig på turn?", "Hur identifierar jag punkten där min aggression inte längre genererar tillräcklig fold-equity?"] } },
  combinatorial_density: { high: { threshold: 0.7, templates: ["Hur hanterar jag komplexiteten i att balansera mitt betting-intervall på en brickad board?", "När är det värt att använda en mixed strategy med samma handtyp i samma situation?", "Hur förenklar jag beslutsträdet när antalet möjliga kombinationer blir för stort?"] } },
};

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
    questionTemplates: pokerAxisTemplates,
    description: "Poker math first: sizing, stats, stack depth and ICM.",
    guidance:
      "The text concerns poker (hand histories, strategy, HUD stats, tournament structure). Read units as decision signals anchored in math: bet sizing vs required bluff success, VPIP/PFR, c-bet by street, fold to 3-bet, combinatorics and blockers, stack depth (CSI/M), bubble factor, multiway. High tension marks where two measures contradict each other.",
    axes: [
      { key: "bluff_math", label: "Bluff math", low: "profitable air", high: "negative-EV bluff", family: "Math" },
      { key: "combinatorial_density", label: "Combinatorial density", low: "combo-heavy range", high: "combo-starved range", family: "Math" },
      { key: "multiway_viability", label: "Heads-up ↔ Multiway", low: "heads-up dominant", high: "multiway viable", family: "Math" },
      { key: "range_polarity", label: "VPIP/PFR", low: "tight-aggressive", high: "loose-passive", family: "Stats" },
      { key: "aggression_decay", label: "Aggression decay", low: "one and done", high: "relentless barrel", family: "Stats" },
      { key: "defensive_honesty", label: "Defence vs aggression", low: "sticky caller", high: "overly folding", family: "Stats" },
      { key: "exploit", label: "GTO ↔ Exploit", low: "balanced / GTO", high: "exploitative", family: "Stats" },
      { key: "stack_urgency", label: "Stack urgency (CSI)", low: "deep, manoeuvrable", high: "push/fold", family: "Tournament" },
      { key: "icm_pressure", label: "ICM pressure", low: "chip-EV", high: "survival", family: "Tournament" },
      { key: "speculative_threshold", label: "Rule of 5 and 10", low: "implied odds viable", high: "stack bleeding", family: "Tournament" },
    ],
    axisDictionaries: {
      bluff_math: {
        low: [["fold equity", 0.8], ["folds too much", 0.8], ["overfold", 0.9], ["overfolds", 0.9], ["profitable bluff", 0.9], ["auto-profit", 0.9], ["air", 0.5]],
        high: [["overbluff", 0.8], ["calling station", 0.8], ["never folds", 0.9], ["spew", 0.7], ["burning money", 0.8], ["negative ev", 0.9], ["-ev", 0.8]],
      },
      combinatorial_density: {
        low: [["combos", 0.5], ["combinations", 0.5], ["value-heavy", 0.8], ["full range", 0.6]],
        high: [["blocker", 0.9], ["blockers", 0.9], ["block", 0.6], ["card removal", 0.9], ["removal", 0.6], ["capped", 0.7]],
      },
      multiway_viability: {
        low: [["heads-up", 0.8], ["heads up", 0.8], ["hu", 0.5], ["isolate", 0.7], ["isolation", 0.7], ["reverse implied odds", 0.9], ["dominated", 0.7]],
        high: [["multiway", 0.9], ["multi-way", 0.9], ["set mining", 0.9], ["set mine", 0.9], ["suited connector", 0.8], ["suited connectors", 0.8], ["implied odds", 0.6], ["small pair", 0.6]],
      },
      range_polarity: {
        low: [["tag", 0.8], ["tight aggressive", 0.9], ["tight-aggressive", 0.9], ["nit", 0.6], ["reg", 0.5]],
        high: [["loose passive", 0.9], ["loose-passive", 0.9], ["fish", 0.7], ["limps", 0.7], ["limper", 0.7], ["calling station", 0.8], ["passive", 0.5]],
      },
      aggression_decay: {
        low: [["gives up", 0.9], ["give up", 0.8], ["one and done", 0.9], ["checks turn", 0.7], ["honest turn", 0.8], ["stab", 0.5]],
        high: [["double barrel", 0.9], ["triple barrel", 0.9], ["barrel", 0.7], ["barrels", 0.7], ["relentless", 0.8], ["fires again", 0.8]],
      },
      defensive_honesty: {
        low: [["sticky", 0.9], ["calls down", 0.8], ["hero call", 0.6], ["never folds", 0.8], ["station", 0.6]],
        high: [["folds to 3-bet", 0.9], ["too honest", 0.9], ["paper tiger", 0.9], ["folds to aggression", 0.9], ["weak-tight", 0.8], ["overfolds", 0.7]],
      },
      exploit: {
        low: [["gto", 0.9], ["balanced", 0.8], ["solver", 0.7], ["equilibrium", 0.8], ["nash", 0.7], ["unexploitable", 0.9], ["mixed strategy", 0.8]],
        high: [["exploit", 0.9], ["exploitative", 0.9], ["exploitable", 0.8], ["read", 0.5], ["tendency", 0.6], ["leak", 0.8], ["deviate", 0.7]],
      },
      stack_urgency: {
        low: [["deep stack", 0.9], ["deep-stacked", 0.9], ["deep", 0.5], ["100bb", 0.8], ["post-flop play", 0.7], ["postflop", 0.5]],
        high: [["push/fold", 0.9], ["push or fold", 0.9], ["shove", 0.7], ["jam", 0.7], ["short stack", 0.8], ["short-stacked", 0.8], ["move-in", 0.9], ["re-steal", 0.7], ["resteal", 0.7]],
      },
      icm_pressure: {
        low: [["chip ev", 0.9], ["chip-ev", 0.9], ["cev", 0.8], ["cash game", 0.7], ["accumulate", 0.6]],
        high: [["icm", 0.9], ["bubble", 0.8], ["bubble factor", 0.9], ["pay jump", 0.9], ["final table", 0.6], ["survival", 0.7], ["ladder", 0.6], ["$ev", 0.8]],
      },
      speculative_threshold: {
        low: [["implied odds", 0.7], ["cheap call", 0.7], ["set value", 0.7]],
        high: [["rule of 5 and 10", 0.6], ["too expensive", 0.8], ["bleed", 0.7], ["bleeding", 0.7], ["priced out", 0.8]],
      },
    },
    numericAxes: pokerNumericAxes,
    fzCalibration: { llmTension: 0.5, triangulated: 0.3, cti: 0.2, axisBonus: 0.12, oppositionBonus: 0.1, directivePenalty: 0.1 },
    llmAxesByDefault: false,
  },
  {
    id: "poker_tells",
    label: "Poker – live tells",
    description: "Body language at the live table (Navarro): congruence, posture, baseline.",
    guidance:
      "The text describes live poker behaviour: physical tells, pacifying gestures, posture, timing. A tell is only valid against the player's own baseline. High tension marks where words, actions and body send contradicting signals. Never treat a single gesture as proof.",
    axes: [
      { key: "verbal_physical_congruence", label: "Words ↔ Body", low: "authentic confidence", high: "perception management", family: "Tells" },
      { key: "action_posture_alignment", label: "Action ↔ Posture", low: "engaged", high: "disengaged (flight)", family: "Tells" },
      { key: "baseline_deviation", label: "Baseline deviation", low: "homeostatic calm", high: "limbic arousal", family: "Tells" },
      { key: "micro_macro_sync", label: "Micro ↔ Macro", low: "honest micro", high: "manufactured macro", family: "Tells" },
    ],
    axisDictionaries: {
      verbal_physical_congruence: {
        low: [["relaxed", 0.6], ["genuine", 0.7], ["congruent", 0.9]],
        high: [["going hollywood", 0.9], ["neck touch", 0.9], ["touches neck", 0.9], ["pacify", 0.8], ["pacifying", 0.8], ["ventilating", 0.8], ["leg cleanse", 0.8], ["talks big", 0.7]],
      },
      action_posture_alignment: {
        low: [["leans in", 0.8], ["leans forward", 0.8], ["engaged", 0.6]],
        high: [["leans back", 0.8], ["feet toward the exit", 0.9], ["feet pointing", 0.7], ["turtle", 0.8], ["pulls back", 0.7], ["distancing", 0.7]],
      },
      baseline_deviation: {
        low: [["baseline", 0.5], ["calm", 0.6], ["still", 0.5], ["neutral", 0.5]],
        high: [["happy feet", 0.9], ["bouncing", 0.7], ["gravity-defying", 0.9], ["eyebrows", 0.6], ["chest puffs", 0.7], ["sudden", 0.6]],
      },
      micro_macro_sync: {
        low: [["pupil", 0.7], ["eye block", 0.9], ["eye blocking", 0.9], ["instant", 0.6], ["micro", 0.7]],
        high: [["forced smile", 0.9], ["stare down", 0.8], ["stares down", 0.8], ["delayed", 0.6], ["exaggerated", 0.7], ["staged", 0.7]],
      },
    },
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
        low: [["breadth", 0.9], ["broad", 0.8], ["wildcard", 0.8], ["all subdomains", 0.9], ["attack surface", 0.8], ["enumerate", 0.8], ["discovery", 0.7], ["sweep", 0.6], ["coverage", 0.6], ["reconnaissance", 0.7], ["recon", 0.6], ["subdomain", 0.6], ["map the", 0.5]],
        high: [["depth", 0.9], ["deep dive", 0.9], ["dig deep", 0.8], ["single endpoint", 0.8], ["one endpoint", 0.8], ["in-depth", 0.8], ["focused", 0.6], ["vertical", 0.5], ["drill", 0.5]],
      },
      passive_active: {
        low: [["passive", 0.9], ["passively", 0.8], ["recon", 0.7], ["crawl", 0.6], ["observe", 0.5], ["fingerprint", 0.6]],
        high: [["active", 0.9], ["aktiv", 0.9], ["fuzz", 0.9], ["fuzzing", 0.9], ["scan", 0.8], ["scanner", 0.8], ["brute", 0.7], ["hammer", 0.7], ["rate limit", 0.6], ["throttle", 0.6]],
      },
      manual_automated: {
        low: [["manual", 0.9], ["manually", 0.9], ["by hand", 0.8], ["intuition", 0.7], ["hand-crafted", 0.7], ["bespoke", 0.6], ["intercept", 0.5], ["burp", 0.6]],
        high: [["automated", 0.9], ["automation", 0.9], ["nuclei", 0.9], ["ffuf", 0.9], ["scripted", 0.7], ["bulk", 0.6], ["crawl", 0.5]],
      },
      deterministic_intermittent: {
        low: [["always", 0.7], ["every time", 0.8], ["reproducible", 0.9], ["reliably", 0.7], ["consistent", 0.6], ["100%", 0.6], ["deterministic", 0.9], ["stable", 0.5]],
        high: [["intermittent", 0.9], ["flaky", 0.9], ["sporadic", 0.8], ["sometimes", 0.6], ["occasionally", 0.6], ["not always", 0.8], ["could not always reproduce", 0.9], ["timing-dependent", 0.8], ["transient", 0.7], ["heisenbug", 0.9], ["known intermittent", 0.9]],
      },
      pre_post_auth: {
        low: [["pre-auth", 0.9], ["preauth", 0.9], ["unauthenticated", 0.9], ["before login", 0.8], ["before authentication", 0.9], ["no login required", 0.8], ["/public/", 0.9], ["anonymous", 0.7], ["public endpoint", 0.8]],
        high: [["post-auth", 0.9], ["authenticated", 0.7], ["after login", 0.7], ["logged in", 0.7], ["requires login", 0.8], ["bearer token", 0.7], ["/internal/", 0.9], ["internal endpoint", 0.8]],
      },
      authn_authz: {
        low: [["authentication", 0.8], ["authenticate", 0.8], ["sso", 0.9], ["saml", 0.9], ["mfa", 0.9], ["2fa", 0.9], ["password", 0.6], ["credentials", 0.7], ["otp", 0.7], ["identity", 0.6], ["jwt", 0.5]],
        high: [["authorization", 0.9], ["authorize", 0.8], ["access control", 0.9], ["idor", 0.9], ["object-level", 0.9], ["privilege", 0.8], ["role", 0.7], ["permission", 0.7], ["membership", 0.8], ["re-check membership", 0.9], ["admin only", 0.7], ["who can", 0.6]],
      },
      stateless_race: {
        low: [["stateless", 0.9], ["idempotent", 0.9], ["idempotency", 0.9], ["atomic", 0.8], ["single request", 0.6], ["sequential", 0.7], ["one at a time", 0.7]],
        high: [["race", 0.9], ["race condition", 0.9], ["concurrent", 0.9], ["concurrency", 0.9], ["simultaneous", 0.8], ["parallel", 0.7], ["toctou", 0.9], ["time-of-check", 0.9], ["between read and commit", 0.9], ["double spend", 0.9], ["double-spend", 0.9]],
      },
      inband_oob: {
        low: [["in-band", 0.9], ["inband", 0.9], ["in the response", 0.7], ["response body", 0.6], ["visible in response", 0.8], ["synchronous", 0.6], ["status code", 0.5], ["always 200", 0.9]],
        high: [["out-of-band", 0.9], ["out of band", 0.9], ["oob", 0.9], ["callback", 0.8], ["webhook", 0.8], ["blind", 0.7], ["exfil", 0.8], ["exfiltration", 0.8], ["dns callback", 0.9], ["collaborator", 0.9], ["interactsh", 0.9], ["beacon", 0.7]],
      },
      signature_semantics: {
        low: [["signed with", 0.9], ["signature", 0.7], ["jwt", 0.8], ["rs256", 0.9], ["hmac", 0.9], ["shared secret", 0.9], ["same secret", 0.9], ["across environments", 0.9], ["reused", 0.8], ["signing key", 0.7]],
        high: [["business logic", 0.8], ["business layer", 0.8], ["signature is not authorization", 0.9], ["token is valid", 0.8], ["logic flaw", 0.7], ["semantic", 0.6], ["client-controlled", 0.6]],
      },
      trust_boundary: {
        low: [["gateway trusts", 0.9], ["trusts the", 0.9], ["trusted header", 0.9], ["x-vela-user", 0.9], ["passed upstream", 0.8], ["reads it directly", 0.8], ["prefer it over", 0.8], ["carries the user id", 0.7], ["client-side", 0.8], ["client side", 0.8], ["client-controlled", 0.8], ["controlled by the client", 0.8], ["client-supplied", 0.8], ["caches entitlements", 0.8], ["offline mode", 0.7], ["local cache", 0.6], ["feature flag", 0.6], ["feature gate", 0.6], ["mobile sdk", 0.5], ["assumes", 0.5], ["presumes", 0.5]],
        high: [["server-side", 0.8], ["server side", 0.8], ["validates inputs", 0.9], ["server validation", 0.9], ["re-validates", 0.8], ["re-check", 0.8], ["authoritative", 0.7], ["source of truth", 0.7], ["enforced in the backend", 0.7], ["cannot be spoofed", 0.7]],
      },
      impact_demonstrable: {
        low: [["theoretical", 0.9], ["in theory", 0.8], ["could potentially", 0.7], ["may allow", 0.6], ["cvss", 0.7], ["potentially", 0.5]],
        high: [["demonstrable", 0.9], ["proof of concept", 0.8], ["poc", 0.8], ["reproduced", 0.7], ["confirmed", 0.6], ["actual impact", 0.8], ["financial impact", 0.9], ["released funds", 0.9], ["funds", 0.6], ["data leaked", 0.8]],
      },
      duplicate_uniqueness: {
        low: [["duplicate", 0.9], ["dupe", 0.9], ["already reported", 0.8], ["first valid report", 0.9], ["crowded", 0.8], ["common", 0.5], ["well-known", 0.6], ["frequently reported", 0.8]],
        high: [["unique", 0.8], ["novel", 0.8], ["fresh", 0.7], ["new surface", 0.8], ["unreported", 0.8], ["overlooked", 0.7], ["unexplored", 0.7], ["edge case", 0.6]],
      },
      scope_adjacent: {
        low: [["in scope", 0.9], ["in-scope", 0.9], ["eligible", 0.8], ["covered", 0.7], ["listed asset", 0.8], ["within scope", 0.9], ["wildcard", 0.5]],
        high: [["out of scope", 0.9], ["out-of-scope", 0.9], ["adjacent", 0.9], ["third-party", 0.8], ["third party", 0.8], ["acquired", 0.8], ["not listed", 0.8], ["unlisted", 0.8], ["partially migrated", 0.9], ["served from", 0.7], ["different root", 0.8], ["shares a read replica", 0.9], ["across environments", 0.7], ["subsidiary", 0.7], ["affiliate", 0.7], ["scope question", 0.8]],
      },
      single_chain: {
        low: [["one report per root cause", 0.9], ["on its own", 0.6], ["isolated", 0.5], ["standalone", 0.5]],
        high: [["combined into", 0.9], ["may be combined", 0.9], ["chained", 0.9], ["chain", 0.6], ["escalate", 0.7], ["escalation", 0.7], ["aggregate", 0.6], ["stack", 0.6], ["thereby", 0.5], ["which allows", 0.5]],
        highRegex: [/two\s+p\d\w*\s+(may|can)\s+be\s+combined/i, /(combined|chained)\s+(into|with)\s+p\d/i],
      },
    },
    fzCalibration: { llmTension: 0.5, triangulated: 0.3, cti: 0.2, axisBonus: 0.12, oppositionBonus: 0.1, directivePenalty: 0.1 },
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

const termRegexCache = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let re = termRegexCache.get(term);
  if (!re) {
    const esc = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i");
    termRegexCache.set(term, re);
  }
  return re;
}

function poleWeight(hay: string, terms: AxisTerm[], regexes: RegExp[] = []): number {
  let w = 0;
  for (const t of terms) {
    const [term, weight] = typeof t === "string" ? [t, 0.7] : t;
    if (termRegex(term).test(hay)) w += weight;
  }
  for (const re of regexes) if (re.test(hay)) w += 0.9;
  return w;
}

export interface AxisHitDetail {
  score: number;
  low: number;
  high: number;
}

/** Per-axis pole weights; axes without any hit are omitted. Word-bounded, case-insensitive. */
export function lexicalAxisDetail(text: string, profile: DomainProfile): Record<string, AxisHitDetail> {
  const dict = profile.axisDictionaries;
  if (!dict) return profile.numericAxes ? profile.numericAxes(text) : {};
  const hay = text.toLowerCase().replace(/\s+/g, " ");
  const out: Record<string, AxisHitDetail> = {};
  for (const axis of profile.axes) {
    const entry = dict[axis.key];
    if (!entry) continue;
    const lo = poleWeight(hay, entry.low, entry.lowRegex);
    const hi = poleWeight(hay, entry.high, entry.highRegex);
    if (lo === 0 && hi === 0) continue;
    const total = lo + hi;
    const confidence = Math.min(1, total / 0.9);
    const score = Math.round((0.5 + (hi / total - 0.5) * confidence) * 100) / 100;
    out[axis.key] = { score, low: lo, high: hi };
  }
  if (profile.numericAxes) Object.assign(out, profile.numericAxes(text));
  return out;
}

/**
 * Deterministic axis annotation. Returns a 0..1 score per axis that has at
 * least one dictionary hit; axes without hits are omitted (never guessed).
 */
export function lexicalAxisHits(text: string, profile: DomainProfile): Record<string, number> {
  return Object.fromEntries(Object.entries(lexicalAxisDetail(text, profile)).map(([k, d]) => [k, d.score]));
}
