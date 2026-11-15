export const MCP_CONTACT_EMAIL = "geometric_friction_field@proton.me";

// This is a request catalogue, not an authorization or executable-tool registry.
export const MCP_ACCESS_LEVELS = [
  { level: 1, role: "Observatör", scope: "Läsning av befintliga personliga fält", tools: ["list_documents", "search_chunks", "find_friction", "get_corpus_map"], planned: false },
  { level: 2, role: "Fältnavigatör", scope: "Nivå 1 + situationsprojektion och fältspänningar", tools: ["project_situation", "get_field_tensions"], planned: true },
  { level: 3, role: "Lärande agent", scope: "Nivå 2 + journal, reflektion och narratör", tools: ["submit_journal", "narrate_node"], planned: true },
  { level: 4, role: "Fältbyggare", scope: "Nivå 3 + skapa och analysera nya fält", tools: ["ingest_field"], planned: true },
] as const;

export interface McpAccessRequest {
  level: number;
  agent: string;
  resource: string;
  purpose: string;
  globalFederation: boolean;
}

export function buildMcpAccessRequest(request: McpAccessRequest) {
  const tier = MCP_ACCESS_LEVELS.find((item) => item.level === request.level);
  if (!tier || !request.agent.trim() || !request.resource.trim() || !request.purpose.trim()) {
    throw new Error("Ange agent/app, resurs och syfte samt en giltig åtkomstnivå.");
  }
  const subject = `MCP-åtkomst: nivå ${tier.level} — ${tier.role}`;
  const body = [
    "Ansökan om MCP-åtkomst",
    `Agent/app: ${request.agent.trim()}`,
    `Önskad nivå: ${tier.level} — ${tier.role}`,
    `Specifik resurs/fält: ${request.resource.trim()}`,
    `Syfte och önskade åtgärder: ${request.purpose.trim()}`,
    `Global Federation: ${request.globalFederation ? "Begärs separat (sökning/delning av delade kluster)" : "Begärs inte"}`,
    "",
    "Ansökan ger ingen åtkomst. Resurs, verktyg och rättigheter behöver bekräftas separat.",
  ].join("\n");
  return { subject, body, mailto: `mailto:${MCP_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}