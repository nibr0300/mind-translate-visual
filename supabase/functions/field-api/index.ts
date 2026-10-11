// Field API (A4): lets an external navigator consult the field builder.
// Auth: Authorization: Bearer <personal API key from the Account panel>.
//   POST /ingest          { filename, text, domain? }      -> { field_id, units }
//   GET  /field/{id}                                       -> field contract JSON
//   GET  /tensions/{id}?n=10                               -> top-N frictions
//   POST /project         { situation, field_id?, n? }     -> nearest clusters + frictions
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { axisFrictions, axisWeights, type AxisUnit } from "../_shared/axisMath.ts";
import { analyzeUnits, IntentionError } from "../_shared/intentions.ts";

const CONTRACT_VERSION = 1;
const EMBEDDING_MODEL = "google/gemini-embedding-001";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sha256Hex(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function userFromKey(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  const sb = admin();
  const { data } = await sb.from("api_keys").select("user_id, revoked_at").eq("key_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return null;
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash);
  return data.user_id;
}

async function embed(inputs: string[]): Promise<number[][]> {
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const out: number[][] = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += 40) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs.slice(i, i + 40) }),
      });
      if (res.ok || !(res.status === 429 || res.status >= 500)) break;
      await res.text();
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    if (!res!.ok) throw new IntentionError(res!.status === 402 ? 402 : 502, `Embedding failed (${res!.status})`);
    const body = await res!.json();
    for (const v of body.data as { embedding: number[]; index: number }[]) out[i + v.index] = v.embedding;
  }
  return out;
}

const cosine = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return d / (Math.sqrt(na * nb) || 1);
};
const parseVec = (v: unknown): number[] | null =>
  Array.isArray(v) ? (v as number[]) : typeof v === "string" ? JSON.parse(v) : null;

function kMeans(vecs: number[][], k: number): number[] {
  const centers = Array.from({ length: k }, (_, i) => [...vecs[Math.floor((i * vecs.length) / k)]]);
  let assign = new Array(vecs.length).fill(0);
  for (let iter = 0; iter < 15; iter++) {
    assign = vecs.map((v) => {
      let best = 0, bs = -Infinity;
      centers.forEach((c, j) => { const s = cosine(v, c); if (s > bs) { bs = s; best = j; } });
      return best;
    });
    for (let j = 0; j < k; j++) {
      const m = vecs.filter((_, i) => assign[i] === j);
      if (!m.length) continue;
      centers[j] = m[0].map((_, d) => m.reduce((s, v) => s + v[d], 0) / m.length);
    }
  }
  return assign;
}

// deno-lint-ignore no-explicit-any
type ChunkRow = { cluster_id: number | null; fz: number | null; fy: number | null; cti: number | null; triangulation: any; intention: any };

async function loadField(userId: string, id: string) {
  const sb = admin();
  const { data: doc } = await sb.from("documents").select("id, filename, stats, uploaded_at, user_id").eq("id", id).maybeSingle();
  if (!doc || doc.user_id !== userId) return null;
  const [{ data: clusters }, { data: chunks }] = await Promise.all([
    sb.from("clusters_summary").select("cluster_id, label, custom_label, description, unit_count, avg_fz, avg_fy, avg_cti").eq("document_id", id).order("cluster_id"),
    sb.from("chunks").select("cluster_id, fz, fy, cti, triangulation, intention").eq("document_id", id).limit(2000),
  ]);
  const rows = (chunks ?? []) as ChunkRow[];
  const units: AxisUnit[] = rows
    .filter((c) => c.intention?.domainAxes && c.cluster_id != null)
    .map((c) => ({ clusterId: c.cluster_id!, axes: c.intention.domainAxes, tension: c.triangulation?.triangulated ?? c.fz ?? 0 }));
  const keys = [...new Set(units.flatMap((u) => Object.keys(u.axes)))];
  const total = Math.max(1, rows.length);
  return {
    doc,
    clusters: clusters ?? [],
    weights: axisWeights(units, keys),
    tensions: (n: number) => axisFrictions(units, keys, n),
    density: (cid: number) => rows.filter((r) => r.cluster_id === cid).length / total,
  };
}

async function fieldContract(userId: string, id: string) {
  const f = await loadField(userId, id);
  if (!f) return null;
  const { data: edges } = await admin().rpc("corpus_cluster_edges", { min_similarity: 0.6, max_edges: 200 });
  // deno-lint-ignore no-explicit-any
  const own = ((edges ?? []) as any[]).filter((e) => e.src_doc === id && e.dst_doc === id);
  return {
    version: CONTRACT_VERSION,
    field_id: id,
    field_version: f.doc.uploaded_at,
    filename: f.doc.filename,
    domain: (f.doc.stats as Record<string, unknown>)?.domain ?? "general",
    axes: f.weights.map((w) => ({ name: w.key, weight: w.weight, coverage: w.coverage })),
    clusters: f.clusters.map((c) => ({
      cluster_id: c.cluster_id,
      label: c.custom_label ?? c.label,
      description: c.description,
      centroid: { fz: c.avg_fz, fy: c.avg_fy },
      cti: c.avg_cti,
      density: Math.round(f.density(c.cluster_id) * 1000) / 1000,
      unit_count: c.unit_count,
    })),
    edges: own.map((e) => ({
      from: e.src_cluster,
      to: e.dst_cluster,
      strength: e.similarity,
      type: Math.abs(e.fz_delta ?? 0) > 0.25 ? "friction" : "resonance",
    })),
    tensions: f.tensions(10).map((t) => ({ axis: t.axis, magnitude: t.magnitude, gap: t.gap, clusters: t.clusters })),
  };
}

function splitText(text: string): string[] {
  return text
    .replace(/\u0000/g, "")
    .split(/(?<=[.!?])\s+|\n{2,}/u)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12)
    .flatMap((s) => (s.length > 600 ? s.match(/.{1,600}(\s|$)/gu) ?? [s] : [s]))
    .slice(0, 200);
}

const IngestSchema = z.object({
  filename: z.string().min(1).max(200),
  text: z.string().min(40).max(400_000),
  domain: z.object({
    id: z.string().max(40).optional(),
    guidance: z.string().max(1000).optional(),
    axes: z.array(z.object({ key: z.string(), label: z.string().optional(), low: z.string().optional(), high: z.string().optional() })).max(4).optional(),
  }).optional(),
});

async function ingest(userId: string, body: unknown) {
  const p = IngestSchema.safeParse(body);
  if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
  const { filename, text, domain } = p.data;
  const units = splitText(text);
  if (units.length < 3) return json({ error: "Text too short (min 3 units)" }, 400);

  const [analyses, vecs] = await Promise.all([analyzeUnits(units, domain), embed(units)]);
  const byIdx = new Map<number, any>(analyses.map((a) => [a.index, a]));
  const k = Math.min(5, Math.max(2, Math.floor(units.length / 6)));
  const assign = kMeans(vecs, k);

  const sb = admin();
  const { data: doc, error: dErr } = await sb.from("documents").insert({
    filename, source_type: "text", user_id: userId, file_size: text.length,
    embedding_model: EMBEDDING_MODEL, embedding_dim: 3072,
    stats: { totalUnits: units.length, domain: domain?.id ?? "general", via: "field-api" },
  }).select("id").single();
  if (dErr) throw dErr;

  const rows = await Promise.all(units.map(async (t, i) => {
    const a = byIdx.get(i);
    const tension = a ? Math.max(a.truthTension ?? 0, a.moralTension ?? 0, a.narrativeTension ?? 0) : 0;
    return {
      document_id: doc.id, chunk_index: i, text: t, content_hash: await sha256Hex(t),
      cluster_id: assign[i], fz: tension, fy: a ? 1 - Math.abs((a.epistemicCertainty ?? 0.5) - 0.5) * 2 : 0.5,
      cti: 0, triangulation: { llmTension: tension, triangulated: tension },
      intention: a ?? null, embedding: vecs[i], embedding_dim: 3072,
    };
  }));
  const { error: cErr } = await sb.from("chunks").upsert(rows, { onConflict: "document_id,content_hash", ignoreDuplicates: true });
  if (cErr) throw cErr;

  const clusterRows = Array.from({ length: k }, (_, j) => {
    const m = rows.filter((r) => r.cluster_id === j);
    if (!m.length) return null;
    const centroid = m[0].embedding.map((_, d) => m.reduce((s, r) => s + r.embedding[d], 0) / m.length);
    const avg = (f: (r: typeof m[0]) => number) => m.reduce((s, r) => s + f(r), 0) / m.length;
    return {
      document_id: doc.id, cluster_id: j, label: m[0].text.slice(0, 48), description: null,
      unit_count: m.length, avg_fz: avg((r) => r.fz), avg_fy: avg((r) => r.fy), avg_cti: 0,
      centroid_embedding: centroid, embedding_dim: 3072,
    };
  }).filter(Boolean);
  const { error: clErr } = await sb.from("clusters_summary").upsert(clusterRows, { onConflict: "document_id,cluster_id" });
  if (clErr) throw clErr;
  sb.functions.invoke("label-clusters", { body: { document_id: doc.id } }).catch(() => {});
  return json({ field_id: doc.id, units: units.length, clusters: clusterRows.length, analyzed: analyses.length });
}

const ProjectSchema = z.object({
  situation: z.string().min(3).max(4000),
  field_id: z.string().uuid().optional(),
  n: z.number().int().min(1).max(20).optional(),
});

async function project(userId: string, body: unknown) {
  const p = ProjectSchema.safeParse(body);
  if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
  const { situation, field_id, n = 5 } = p.data;
  const [q] = await embed([`[situation] ${situation}`]);
  const sb = admin();
  let docIds: string[];
  if (field_id) {
    const { data } = await sb.from("documents").select("id").eq("id", field_id).eq("user_id", userId);
    docIds = (data ?? []).map((d) => d.id);
    if (!docIds.length) return json({ error: "Field not found" }, 404);
  } else {
    const { data } = await sb.from("documents").select("id").eq("user_id", userId).order("uploaded_at", { ascending: false }).limit(50);
    docIds = (data ?? []).map((d) => d.id);
  }
  const { data: clusters } = await sb.from("clusters_summary")
    .select("document_id, cluster_id, label, custom_label, avg_fz, avg_fy, avg_cti, unit_count, centroid_embedding")
    .in("document_id", docIds);
  const ranked = (clusters ?? [])
    .map((c) => {
      const v = parseVec(c.centroid_embedding);
      return { field_id: c.document_id, cluster_id: c.cluster_id, label: c.custom_label ?? c.label,
        centroid: { fz: c.avg_fz, fy: c.avg_fy }, cti: c.avg_cti, unit_count: c.unit_count,
        similarity: v ? Math.round(cosine(q, v) * 1000) / 1000 : 0 };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, n);
  // Frictions in the field of the closest cluster that involve near clusters.
  let frictions: unknown[] = [];
  if (ranked[0]) {
    const f = await loadField(userId, ranked[0].field_id);
    const near = new Set(ranked.filter((r) => r.field_id === ranked[0].field_id).map((r) => r.cluster_id));
    frictions = f ? f.tensions(20).filter((t) => near.has(t.clusters[0]) || near.has(t.clusters[1])).slice(0, 5) : [];
  }
  return json({ version: CONTRACT_VERSION, situation, coordinates: ranked[0]?.centroid ?? null, nearest_clusters: ranked, frictions });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await userFromKey(req);
    if (!userId) return json({ error: "Invalid or missing API key" }, 401);
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("field-api");
    const [route, id] = parts.slice(i + 1);
    const uuid = z.string().uuid();

    if (req.method === "POST" && route === "ingest") return await ingest(userId, await req.json());
    if (req.method === "POST" && route === "project") return await project(userId, await req.json());
    if (req.method === "GET" && route === "field" && uuid.safeParse(id).success) {
      const c = await fieldContract(userId, id);
      return c ? json(c) : json({ error: "Field not found" }, 404);
    }
    if (req.method === "GET" && route === "tensions" && uuid.safeParse(id).success) {
      const f = await loadField(userId, id);
      if (!f) return json({ error: "Field not found" }, 404);
      const n = Math.min(50, Math.max(1, Number(url.searchParams.get("n")) || 10));
      return json({ version: CONTRACT_VERSION, field_id: id, axes: f.weights, tensions: f.tensions(n) });
    }
    if (req.method === "GET" && !route) {
      return json({ version: CONTRACT_VERSION, routes: ["POST /ingest", "GET /field/{id}", "GET /tensions/{id}", "POST /project"] });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof IntentionError) return json({ error: e.message }, e.status);
    console.error("field-api error:", e);
    return json({ error: (e as { message?: string })?.message ?? "Unknown error" }, 500);
  }
});
