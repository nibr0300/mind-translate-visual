/**
 * Elementary poker math used as the deterministic ground of the poker profile.
 * Numbers found in a unit's text set axis scores directly; where two measures
 * in the same unit contradict each other both poles are marked (friction).
 */
export interface NumericHit {
  score: number;
  low: number;
  high: number;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + (clamp((x - x0) / (x1 - x0))) * (y1 - y0);

/** Share of the time a pure bluff must work: bet / (pot + bet). */
export function requiredBluffSuccess(bet: number, pot: number): number {
  return bet / (pot + bet);
}

export function vpipPfrRatio(vpip: number, pfr: number): number {
  return pfr > 0 ? vpip / pfr : Infinity;
}

/** Chip Status Index: stack / cost per round (SB + BB + ante · players). */
export function csi(stack: number, sb: number, bb: number, ante = 0, players = 0): number {
  return stack / (sb + bb + ante * players);
}

export type CsiZone = "normal" | "re-steal" | "push-fold";
export function csiZone(value: number): CsiZone {
  if (value < 7) return "push-fold";
  if (value <= 12) return "re-steal";
  return "normal";
}

/** Rule of 5 and 10: share of the effective stack a speculative call costs. */
export function speculativeRule(raise: number, effectiveStack: number, weak = false): "call" | "fold" | "marginal" {
  const pct = (raise / effectiveStack) * 100;
  const [lo, hi] = weak ? [3, 6] : [5, 10];
  if (pct < lo) return "call";
  if (pct > hi) return "fold";
  return "marginal";
}

/** Bubble factor: what losing costs relative to what winning gains (in $EV). */
export function bubbleFactor(eqNow: number, eqLose: number, eqWin: number): number {
  return (eqNow - eqLose) / (eqWin - eqNow);
}

const RANKS = "23456789TJQKA";
const SUITS = "shdc";

/** Remaining combos of a hand class ("AA", "AKs", "AJo", "AK") given blocked cards ("As", "2s"). */
export function combos(hand: string, blockers: string[] = []): number {
  const h = hand.trim();
  const a = h[0]?.toUpperCase(), b = h[1]?.toUpperCase();
  const kind = h[2]?.toLowerCase();
  if (!RANKS.includes(a) || !RANKS.includes(b)) return 0;
  const blocked = new Set(blockers.map((c) => c[0].toUpperCase() + c[1].toLowerCase()));
  let n = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (a === b && j <= i) continue;
      if (a !== b && kind === "s" && i !== j) continue;
      if (a !== b && kind === "o" && i === j) continue;
      const c1 = a + SUITS[i], c2 = b + SUITS[j];
      if (blocked.has(c1) || blocked.has(c2)) continue;
      n++;
    }
  }
  return n;
}

const num = "(\\d+(?:[.,]\\d+)?)";
const pick = (t: string, re: RegExp): number | null => {
  const m = t.match(re);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
};
const pct = (v: number | null) => (v === null ? null : v > 1 ? v / 100 : v);

const FRACTIONS: Record<string, number> = { "1/4": 0.25, "1/3": 1 / 3, "1/2": 0.5, half: 0.5, "2/3": 2 / 3, "3/4": 0.75, full: 1, "1x": 1, "2x": 2, overbet: 1.5 };

/** Parses stats and sizings from text and returns axis hits (numbers beat dictionaries). */
export function pokerNumericAxes(text: string): Record<string, NumericHit> {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const out: Record<string, NumericHit> = {};
  const set = (k: string, score: number, friction = false) => {
    const s = r2(clamp(score));
    out[k] = friction ? { score: s, low: 0.9, high: 0.9 } : { score: s, low: s < 0.5 ? 0.9 : 0, high: s >= 0.5 ? 0.9 : 0 };
  };

  // bluff_math: bet sizing as share of pot, optionally against an observed fold rate.
  const size = t.match(/(?:bet|bets|betting|c-?bet)s?\s+(1\/4|1\/3|1\/2|half|2\/3|3\/4|full|1x|2x|overbet)\s*(?:pot|of pot|of the pot)?/);
  if (size) {
    const req = requiredBluffSuccess(FRACTIONS[size[1]], 1);
    const fold = pct(pick(t, new RegExp(`fold(?:s|ing)?(?: to (?:a )?(?:c-?bet|continuation bet))?\\D{0,12}${num}\\s*%`)));
    if (fold !== null) set("bluff_math", 0.5 + (req - fold), Math.abs(fold - req) >= 0.1);
    else set("bluff_math", req);
  }

  // range_polarity: VPIP / PFR.
  const vpip = pick(t, new RegExp(`vpip\\D{0,8}${num}`));
  const pfr = pick(t, new RegExp(`pfr\\D{0,8}${num}`));
  if (vpip !== null && pfr !== null) set("range_polarity", lerp(vpipPfrRatio(vpip, pfr), 1.2, 2.5, 0.1, 0.9));

  // aggression_decay: flop vs turn c-bet.
  const flop = pct(pick(t, new RegExp(`flop c-?bet\\D{0,8}${num}`)));
  const turn = pct(pick(t, new RegExp(`turn c-?bet\\D{0,8}${num}`)));
  if (flop !== null && turn !== null) set("aggression_decay", flop > 0 ? turn / flop : 0, flop > 0.75 && turn < 0.4);

  // defensive_honesty: fold to 3-bet, with 3-bet frequency for "paper tiger" friction.
  const f3 = pct(pick(t, new RegExp(`fold to (?:a )?3-?bet\\D{0,8}${num}`)));
  const threeBet = pct(pick(t, new RegExp(`(?<!fold to (?:a )?)(?<![a-z] )3-?bet(?: of| at| freq\\w*)?\\s*${num}\\s*%`)));
  const xr = pct(pick(t, new RegExp(`check-?raise\\D{0,8}${num}`)));
  if (f3 !== null) set("defensive_honesty", lerp(f3, 0.5, 0.65, 0.1, 0.9), f3 > 0.65 && threeBet !== null && threeBet >= 0.1);
  else if (xr !== null && xr > 0.2) set("defensive_honesty", 0.3);

  // stack_urgency: explicit CSI / M, or a stack in big blinds.
  const csiV = pick(t, new RegExp(`(?:csi|\\bm)\\s*(?:=|of|is)?\\s*${num}`)) ?? pick(t, new RegExp(`${num}\\s*(?:bb|big blinds)\\b`));
  if (csiV !== null) set("stack_urgency", csiV >= 20 ? 0.1 : csiV < 7 ? 0.95 : lerp(20 - csiV, 0, 13, 0.1, 0.85));

  // icm_pressure: bubble factor.
  const bf = pick(t, new RegExp(`bubble factor\\D{0,6}${num}`));
  if (bf !== null) set("icm_pressure", lerp(bf, 1, 1.75, 0.1, 0.9));

  // speculative_threshold: raise as % of (effective) stack.
  const rs = pick(t, new RegExp(`${num}\\s*%\\s*of (?:the |my |our |your |his |her |their )?(?:effective )?stack`));
  if (rs !== null) set("speculative_threshold", lerp(rs, 5, 10, 0.1, 0.9));

  return out;
}
