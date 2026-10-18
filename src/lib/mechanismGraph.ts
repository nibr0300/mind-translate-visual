import type { FieldUnit } from "./fieldData";

export const MECHANISM_IDS = ["resulting", "reward-prediction-error", "gamblers-fallacy", "loss-aversion", "sunk-cost"] as const;
export type MechanismId = typeof MECHANISM_IDS[number];
export interface MechanismEdge { source: MechanismId; relation: "explains" | "amplifies" | "triggers" | "rationalizes"; target: MechanismId }
/** Curated hypotheses for review, NOT established causal effects in a specific situation. */
export const MECHANISM_EDGES: readonly MechanismEdge[] = [
  ...MECHANISM_IDS.map(id => ({ source: id, relation: "explains" as const, target: id })),
  { source: "resulting", relation: "rationalizes", target: "gamblers-fallacy" },
  { source: "reward-prediction-error", relation: "triggers", target: "loss-aversion" },
  { source: "loss-aversion", relation: "amplifies", target: "sunk-cost" },
  { source: "gamblers-fallacy", relation: "rationalizes", target: "sunk-cost" },
];
const definitions: Record<MechanismId, { aliases: RegExp; signals: RegExp; question: string }> = {
  resulting: { aliases: /\b(resulting|outcome bias|utfallsbias)\b/iu, signals: /bedöm.{0,45}(beslut|strategi).{0,55}(utfall|resultat)|decision.{0,40}(outcome|result)|vann.{0,45}(rätt|bra)|förlorade.{0,45}(fel|dålig)/iu, question: "Hur bedömer du beslutets kvalitet utan att förväxla den med ett enskilt utfall?" },
  "reward-prediction-error": { aliases: /reward[- ]prediction[- ]error|belöningsprediktionsfel|dopamin/iu, signals: /revenge trading|revansch|ta tillbaka.{0,30}(förlust|marker|pengar)|vinna tillbaka|oväntad.{0,20}(förlust|belöning)|bad beat/iu, question: "Hur hanterar du en oväntad förlust utan att låta den styra nästa risktagande?" },
  "gamblers-fallacy": { aliases: /gambler.?s? fallacy|spelarens felslut/iu, signals: /måste.{0,20}(vända|vinna)|due for a win|oberoende.{0,30}(utfall|händelser)|independent.{0,20}(events|outcomes)|förlustsvit/iu, question: "Hur prövar du om en serie tidigare utfall verkligen säger något om nästa beslut?" },
  "loss-aversion": { aliases: /loss[- ]aversion|förlustaversion/iu, signals: /stop.loss|förlust.{0,25}(känns|smärta)|losses loom larger|inte.{0,20}(acceptera|realisera).{0,20}förlust/iu, question: "Hur följer du en riskregel när det känns svårt att acceptera en förlust?" },
  "sunk-cost": { aliases: /sunk[- ]cost|sänkta kostnader/iu, signals: /redan.{0,30}(investerat|satsat|betalat)|fallande kniv|pengarna.{0,30}(borta|förra)|past.{0,20}(costs|investment)|snitta.{0,15}ned/iu, question: "Hur skiljer du redan förlorade resurser från kostnader och möjligheter i nästa beslut?" },
};
export function isMechanismId(value: unknown): value is MechanismId { return MECHANISM_IDS.some(id => id === value); }
/** Late binding: never changes CTI, speech act, domain axes, or the saved unit. */
export function mechanismsForUnit(unit: FieldUnit): { mechanisms: MechanismId[]; primaryMechanism?: MechanismId } {
  const explicit = (unit.mechanisms ?? []).filter(isMechanismId);
  const detected = MECHANISM_IDS.filter(id => definitions[id].aliases.test(unit.text) || definitions[id].signals.test(unit.text));
  const primary = isMechanismId(unit.primaryMechanism) ? unit.primaryMechanism : explicit[0] ?? detected[0];
  return { mechanisms: [...new Set([...(primary ? [primary] : []), ...explicit, ...detected])], primaryMechanism: primary };
}
export function causalLinks(anchor: FieldUnit, friction: FieldUnit): MechanismEdge[] {
  const a = mechanismsForUnit(anchor), f = mechanismsForUnit(friction);
  return MECHANISM_EDGES.filter(edge => a.mechanisms.includes(edge.source) && f.mechanisms.includes(edge.target));
}
export const mechanismQuestion = (id: MechanismId) => definitions[id].question;
export const containsMechanismJargon = (text: string) => MECHANISM_IDS.some(id => definitions[id].aliases.test(text));