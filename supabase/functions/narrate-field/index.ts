import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createOpenAI } from 'npm:@ai-sdk/openai@3';
import { streamText } from 'npm:ai@6';
import { requireUser } from '../_shared/auth.ts';
import { NARRATOR_GENERATION_SYSTEM, NARRATOR_CORRECTIONS, isNarratorCorrection } from '../_shared/narratorVoice.ts';
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayResponseHeaders } from '../_shared/run-id.ts';

const MODEL = 'openai/gpt-6-astra';
const json = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json('POST required', 405);
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  try {
    const body = await req.json();
    const score = body.score;
    if (!score || typeof score.target?.text !== 'string' || score.target.text.length < 25 || score.target.text.length > 20000 ||
      !['fz', 'fy'].every(k => typeof score.target[k] === 'number' && score.target[k] >= 0 && score.target[k] <= 1) ||
      !['cti', 'truthTension'].every(k => score.target[k] == null || (typeof score.target[k] === 'number' && score.target[k] >= 0 && score.target[k] <= 1)) ||
      !Array.isArray(score.neighbors) || score.neighbors.length > 3 || score.neighbors.some((n: { text?: unknown }) => typeof n.text !== 'string' || n.text.length > 20000) ||
      typeof score.cluster !== 'string' || score.cluster.length > 1000 || typeof score.domain !== 'string' || score.domain.length > 100 ||
      (body.correction != null && !isNarratorCorrection(body.correction)) || (body.previous != null && (typeof body.previous !== 'string' || body.previous.length > 20000))) return json('Ogiltigt partitur eller för stor text. Granska noden eller exportera den för lokal bearbetning.', 400);
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !url || !serviceKey) return json('Narratörens AI-tjänst är inte konfigurerad.', 401);
    const db = createClient(url, serviceKey);
    const { data: block, error: blockError } = await db.from('narrator_provider_blocks').select('status,message').eq('model', MODEL).maybeSingle();
    if (blockError) return json('AI-åtkomst kunde inte kontrolleras.', 503);
    if (block) return json(block.message, block.status);

    let failure: { status: number; message: string } | null = null;
    const run = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({
      baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey,
      headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
      fetch: async (input, init) => {
        const response = await run.fetch(input, init);
        if (!response.ok) {
          const raw = await response.clone().text();
          let detail;
          try { detail = JSON.parse(raw); } catch { detail = { message: 'AI-tjänsten kunde inte slutföra begäran.' }; }
          const message = String(detail.error?.message ?? detail.message ?? 'AI-tjänsten kunde inte slutföra begäran.').slice(0, 1200);
          failure = { status: response.status, message };
          const type = detail.error?.type ?? detail.type;
          const workspaceTypes = ['credit_limit_reached', 'model_requires_retention_consent', 'model_vendor_not_enabled', 'provider_not_available_in_region'];
          if (response.status === 403 && !workspaceTypes.includes(type) && detail.props?.requires !== 'admin_action') {
            const { error } = await db.from('narrator_provider_blocks').upsert({ model: MODEL, status: 403, message });
            if (error) throw new Error('Åtkomst nekades och spärren kunde inte sparas. Inga fler AI-anrop görs i denna körning.');
          }
        }
        return response;
      },
    });
    const system = `${NARRATOR_GENERATION_SYSTEM}
${isNarratorCorrection(body.correction) ? `Aktiv röstjustering (har företräde framför den allmänna hållningen där de krockar; skriv om tidigare utkast från grunden i stället för att bevara dess struktur):\n${NARRATOR_CORRECTIONS[body.correction]}` : ''}`;
    const result = streamText({ model: provider.responses(MODEL), system,
      messages: [{ role: 'user', content: JSON.stringify({ cluster: score.cluster, domain: score.domain, target: score.target, semanticNeighbors: score.neighbors, previousDraft: body.previous ?? null }) }],
      maxRetries: 0, abortSignal: req.signal,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } },
    });
    const iterator = result.fullStream[Symbol.asyncIterator]();
    let first = await iterator.next();
    // SDK start events precede the upstream HTTP response. Wait for real
    // upstream content/error before committing browser response headers.
    while (!first.done && ['start', 'start-step'].includes(first.value.type)) first = await iterator.next();
    if (failure) { const f = failure as { status: number; message: string }; return json(f.message, f.status); }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let answer = '', failed = false;
        const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        const accept = (part: { type: string; text?: string; error?: unknown }) => {
          if (part.type === 'text-delta' && part.text) { answer += part.text; send({ type: 'delta', text: part.text }); }
          if (part.type === 'reasoning-delta') send({ type: 'progress' });
          if (part.type === 'error') { failed = true; send({ type: 'error', error: failure?.message ?? (part.error instanceof Error ? part.error.message : 'AI-tjänsten kunde inte slutföra svaret.') }); }
        };
        try {
          if (!first.done) accept(first.value);
          while (true) { const next = await iterator.next(); if (next.done) break; accept(next.value); }
          if (!failed) send(answer.trim() ? { type: 'done' } : { type: 'error', error: 'AI-tjänsten gav inget svar eller avböjde begäran. Körningen har stoppats.' });
        } catch (e) { send({ type: 'error', error: req.signal.aborted ? 'Stoppad' : e instanceof Error ? e.message : 'AI-tjänsten avbröts.' }); }
        finally { controller.close(); }
      },
      async cancel() { await iterator.return?.(); },
    });
    const headers = getLovableAiGatewayResponseHeaders(run.getRunId() ? { 'X-Lovable-AIG-Run-ID': run.getRunId() ?? '' } : undefined, { ...corsHeaders, 'Content-Type': 'application/x-ndjson' });
    return new Response(stream, { headers });
  } catch (e) { return json(e instanceof Error ? e.message : 'Narratören kunde inte starta.', req.signal.aborted ? 499 : 500); }
});