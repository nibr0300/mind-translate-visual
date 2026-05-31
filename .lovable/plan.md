# Implementeringsplan

Tre stora ändringar i en ordning som minimerar omarbete. Varje steg är committable för sig.

## Steg 1 — Embedding-uppgradering (gemini-embedding-001, 3072 dim)

**Varför först:** byte av vektor-dimension kräver migration av alla `vector(1536)` → `vector(3072)`. Allt som byggs efteråt (MCP, global field) lagras direkt i nya formatet och slipper en andra migration.

- Migration: ändra `chunks.embedding`, `clusters_summary.centroid_embedding` till `vector(3072)`. Sätt `embedding_dim` default = 3072. Behåll gamla rader men markera `embedding_model = 'openai/text-embedding-3-small'` så blandning är spårbar (eller töm dem — du väljer).
- Uppdatera HNSW-index (drop + recreate på nya dim).
- `embed-chunks/index.ts`: byt model-konstant till `google/gemini-embedding-001`.
- `search-chunks/index.ts` + `search-clusters`: samma byte.
- `fieldGenerator.ts`: skicka `embedding_model: "google/gemini-embedding-001"`, `embedding_dim: 3072` till `persist-field`.
- En engångs-reembed-knapp (eller edge-funktion `reembed-all`) som kör om alla gamla dokument. Valfri; nya uppladdningar funkar direkt.

## Steg 2 — Auth + RLS (förutsättning för MCP och global field)

**Varför nu:** MCP-anrop måste kunna sägas "denna användares data". Global field behöver "denna användare har gett samtycke". Båda kräver `user_id` på `documents`.

- Aktivera email + Google sign-in.
- `documents`: lägg till `user_id uuid` (FK auth.users), `share_to_global boolean default false`.
- RLS skrivs om: ersätt "readable by everyone (demo)" med `auth.uid() = user_id`. `chunks`/`clusters_summary` ärver via join på `documents.user_id` (security definer-funktion).
- `persist-field`: läs `user_id` från JWT, skriv på documents.
- En `api_keys`-tabell: `id, user_id, key_hash, name, scopes[], created_at, last_used_at, revoked_at`. Används av MCP för icke-browser-klienter.
- Login/signup-sida + sidopanel visar inloggad användare.

## Steg 3 — MCP-server (Edge Function via mcp-lite)

**Varför sist av kärnan:** kräver embedding-modell + auth färdiga.

- Ny edge function `mcp/index.ts` med Hono + `mcp-lite@^0.10.0`, StreamableHttpTransport.
- Auth: Bearer = api_key (slå upp i `api_keys`, sätt RLS-context via service role + manuellt user_id-filter).
- Tools som exponeras:
  - `search_chunks(query, min_cti?, min_similarity?, k?)` → omsluter `match_chunks`
  - `search_clusters(query, k?)` → omsluter `match_clusters_hybrid`
  - `get_corpus_map(include_chunks?)` → omsluter `corpus-map`
  - `find_friction(min_cti)` → top-CTI chunks
  - `compare_clusters(cluster_a_id, cluster_b_id)` → cosine + fz/fy-delta
  - `ingest_text(text, filename?)` → kör samma pipeline som upload
  - `list_documents()` → användarens dokument
- En "Generate MCP key"-knapp i sidopanelen som returnerar nyckel + URL en gång.

## Steg 4 — Global Field Friction Clusters (opt-in delat namnrum)

- Ny tabell `global_clusters`: speglar `clusters_summary` men anonymiserad. `id, source_document_id, source_user_id (för audit, ej exponerat), label, description, unit_count, avg_fz, avg_fy, avg_cti, centroid_embedding vector(3072), cohesion, separation, noise_ratio, contributed_at`.
- RLS: SELECT öppen för authenticated. INSERT endast via security-definer-funktion som verifierar `documents.share_to_global = true`.
- Trigger eller hook i `persist-field`: om `share_to_global` → kopiera kluster (inte chunks, inte text) till `global_clusters`.
- Ny RPC `match_global_clusters(query_embedding, k)` för cross-user friction-sökning.
- MCP-tool `search_global_friction(query, min_cti)`.
- UI: checkbox "Bidra till Global Field Friction Clusters" per dokument + global toggle i user settings. Tydlig copy: "Endast kluster-centroider och metrik delas. Aldrig din text."

## Tekniska anteckningar

- Steg 1 kräver `DROP INDEX` + `CREATE INDEX` på nya dimensionen — ta backup eller acceptera att gamla embeddings nollas.
- Steg 2 bryter den nuvarande "demo readable by everyone"-modellen. All existerande data utan `user_id` blir oåtkomlig om vi inte assignar dem till en seed-user eller raderar.
- `mcp-lite` körs som vanlig edge function — ingen extra infrastruktur.
- Global field kräver inte att användaren själv har auth om vi exponerar den read-only via MCP, men för INSERT krävs auth.

## Förslag på första körning

Säg "kör steg 1" så börjar jag med embedding-migrationen. Steg 2 är det mest disruptiva (förändrar dataåtkomst för befintlig data) — vill du att jag wipear nuvarande dokument vid det steget eller migrerar dem till en "legacy public"-user?
