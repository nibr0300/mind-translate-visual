// MCP server for the Geometric Field Translator.
// Streamable HTTP via mcp-lite 0.10. Bearer = api_key (table public.api_keys).
import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, accept",
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

// Convert Zod schema -> JSON Schema (minimal — mcp-lite needs schemaAdapter).
// We use a tiny converter rather than pulling zod-to-json-schema, since our
// schemas are simple.
function zodToJsonSchema(schema: z.ZodTypeAny): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToJsonSchema(v as z.ZodTypeAny);
      if (!(v instanceof z.ZodOptional) && !(v instanceof z.ZodDefault)) required.push(k);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema(schema._def.type) };
  return {};
}

function buildServer(userId: string) {
  const server = new McpServer({
    name: "geometric-field",
    version: "1.0.0",
    schemaAdapter: (s) => zodToJsonSchema(s as z.ZodTypeAny),
  });
  const sb = supabaseAdmin();

  server.tool("list_documents", {
    description: "List all documents owned by the calling user.",
    inputSchema: z.object({}),
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

  server.tool("search_chunks", {
    description: "Semantic search across the user's chunks. Returns top matches.",
    inputSchema: z.object({
      query: z.string(),
      match_count: z.number().optional(),
      min_cti: z.number().optional(),
      min_similarity: z.number().optional(),
    }),
    handler: async (args) => {
      const emb = await embedQuery(args.query);
      const { data, error } = await sb.rpc("match_chunks", {
        query_embedding: emb,
        match_count: args.match_count ?? 10,
        min_similarity: args.min_similarity ?? 0.3,
        min_cti: args.min_cti ?? 0,
      });
      if (error) throw error;
      const docIds = Array.from(new Set((data ?? []).map((m: any) => m.document_id)));
      const { data: docs } = await sb.from("documents").select("id, user_id").in("id", docIds);
      const mine = new Set((docs ?? []).filter((d: any) => d.user_id === userId).map((d: any) => d.id));
      const filtered = (data ?? []).filter((m: any) => mine.has(m.document_id));
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    },
  });

  server.tool("find_friction", {
    description: "Return chunks above a CTI threshold (epistemic friction hotspots).",
    inputSchema: z.object({
      min_cti: z.number().optional(),
      limit: z.number().optional(),
    }),
    handler: async (args) => {
      const { data: docs } = await sb.from("documents").select("id").eq("user_id", userId);
      const docIds = (docs ?? []).map((d: any) => d.id);
      if (!docIds.length) return { content: [{ type: "text", text: "[]" }] };
      const { data, error } = await sb
        .from("chunks")
        .select("id, document_id, text, cluster_label, fz, fy, cti, triangulation")
        .in("document_id", docIds)
        .gte("cti", args.min_cti ?? 0.5)
        .order("cti", { ascending: false })
        .limit(args.limit ?? 20);
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  server.tool("get_corpus_map", {
    description:
      "Return the full corpus map for the user: cluster nodes, cluster edges, quality metrics, and — when include_chunks is true — every unit plus unit-level kNN edges (chunk_edges) and per-unit degree/weighted centrality for real network analysis.",
    inputSchema: z.object({ include_chunks: z.boolean().optional() }),

    handler: async (args) => {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/corpus-map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ include_chunks: args.include_chunks ?? false, user_id: userId }),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  server.tool("search_global_friction", {
    description: "Search the shared Global Field Friction Clusters across all opted-in users.",
    inputSchema: z.object({
      query: z.string(),
      match_count: z.number().optional(),
      min_cti: z.number().optional(),
      min_similarity: z.number().optional(),
    }),
    handler: async (args) => {
      const emb = await embedQuery(args.query);
      const { data, error } = await sb.rpc("match_global_clusters", {
        query_embedding: emb,
        match_count: args.match_count ?? 10,
        min_similarity: args.min_similarity ?? 0.3,
        min_cti: args.min_cti ?? 0,
      });
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  return server;
}

const app = new Hono();

app.options("/*", () => new Response(null, { headers: corsHeaders }));

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
  const httpHandler = transport.bind(server);
  const res = await httpHandler(c.req.raw);
  const merged = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) merged.set(k, v);
  return new Response(res.body, { status: res.status, headers: merged });
});

Deno.serve(app.fetch);
