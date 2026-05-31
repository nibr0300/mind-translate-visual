// MCP server for the Geometric Field Translator.
// Exposes the user's field data as MCP tools so an external AI can search,
// inspect, and contribute via Bearer API key (table public.api_keys).
//
// Streamable HTTP transport via mcp-lite. verify_jwt=false in config — we
// validate the Bearer token ourselves against the api_keys table.
import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const supabaseAdmin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authUserFromKey(token: string): Promise<string | null> {
  if (!token) return null;
  const sb = supabaseAdmin();
  const keyHash = await sha256Hex(token);
  const { data } = await sb
    .from("api_keys")
    .select("user_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", keyHash);
  return data.user_id;
}

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "google/gemini-embedding-001", input: text }),
  });
  if (!res.ok) throw new Error(`embed failed: ${await res.text()}`);
  const j = await res.json();
  return j.data[0].embedding;
}

// --- MCP server + tools (user is bound per request via captured closure) ---
function buildServer(userId: string) {
  const server = new McpServer({ name: "geometric-field", version: "1.0.0" });
  const sb = supabaseAdmin();

  server.tool({
    name: "list_documents",
    description: "List all documents owned by the calling user.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { data, error } = await sb
        .from("documents")
        .select("id, filename, source_type, uploaded_at, share_to_global, stats")
        .eq("user_id", userId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  server.tool({
    name: "search_chunks",
    description: "Semantic search across the user's chunks. Returns top matches.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        match_count: { type: "number", default: 10 },
        min_cti: { type: "number", default: 0 },
        min_similarity: { type: "number", default: 0.3 },
      },
      required: ["query"],
    },
    handler: async ({ query, match_count, min_cti, min_similarity }: any) => {
      const emb = await embedQuery(query);
      const { data, error } = await sb.rpc("match_chunks", {
        query_embedding: emb,
        match_count: match_count ?? 10,
        min_similarity: min_similarity ?? 0.3,
        min_cti: min_cti ?? 0,
      });
      if (error) throw error;
      // Filter to user's own documents
      const docIds = Array.from(new Set((data ?? []).map((m: any) => m.document_id)));
      const { data: docs } = await sb.from("documents").select("id, filename, user_id").in("id", docIds);
      const mine = new Set((docs ?? []).filter((d: any) => d.user_id === userId).map((d: any) => d.id));
      const filtered = (data ?? []).filter((m: any) => mine.has(m.document_id));
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    },
  });

  server.tool({
    name: "find_friction",
    description: "Return chunks above a CTI threshold (epistemic friction hotspots).",
    inputSchema: {
      type: "object",
      properties: { min_cti: { type: "number", default: 0.5 }, limit: { type: "number", default: 20 } },
    },
    handler: async ({ min_cti, limit }: any) => {
      const { data: docs } = await sb.from("documents").select("id").eq("user_id", userId);
      const docIds = (docs ?? []).map((d: any) => d.id);
      if (!docIds.length) return { content: [{ type: "text", text: "[]" }] };
      const { data, error } = await sb
        .from("chunks")
        .select("id, document_id, text, cluster_label, fz, fy, cti, triangulation")
        .in("document_id", docIds)
        .gte("cti", min_cti ?? 0.5)
        .order("cti", { ascending: false })
        .limit(limit ?? 20);
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  server.tool({
    name: "get_corpus_map",
    description: "Return the full corpus map (nodes, edges, quality, optional chunk embeddings) for the user.",
    inputSchema: {
      type: "object",
      properties: { include_chunks: { type: "boolean", default: false } },
    },
    handler: async ({ include_chunks }: any) => {
      // Reuse the corpus-map function via internal invoke
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/corpus-map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ include_chunks: include_chunks ?? false, user_id: userId }),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  server.tool({
    name: "search_global_friction",
    description: "Search the shared Global Field Friction Clusters across all opted-in users.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        match_count: { type: "number", default: 10 },
        min_cti: { type: "number", default: 0 },
        min_similarity: { type: "number", default: 0.3 },
      },
      required: ["query"],
    },
    handler: async ({ query, match_count, min_cti, min_similarity }: any) => {
      const emb = await embedQuery(query);
      const { data, error } = await sb.rpc("match_global_clusters", {
        query_embedding: emb,
        match_count: match_count ?? 10,
        min_similarity: min_similarity ?? 0.3,
        min_cti: min_cti ?? 0,
      });
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  return server;
}

const app = new Hono();

app.options("/*", (c) => new Response(null, { headers: corsHeaders }));

app.all("/*", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const userId = await authUserFromKey(token);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid or missing API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const server = buildServer(userId);
  const transport = new StreamableHttpTransport();
  const res = await transport.handleRequest(c.req.raw, server);
  // Merge CORS headers
  const merged = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) merged.set(k, v);
  return new Response(res.body, { status: res.status, headers: merged });
});

Deno.serve(app.fetch);
