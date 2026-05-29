# Etapp 2 — Corpus-navigering och friction similarity

Bygger på din specifikation. Tar in dina tre principer (similarity med kontext, geometriska positionen som information, kluster-first navigering) som styrande för UX.

## 1. Databasmigration

- `clusters_summary`: lägg till `custom_label TEXT` och `custom_label_updated_at TIMESTAMPTZ`.
- Materialized view `document_cti_ranking` (filename, avg_cti, max_cti, chunk_count, cluster_count) sorterad fallande på avg_cti. Refreshas av `persist-field` efter varje upload.
- SQL-funktion `match_clusters_hybrid(query_embedding, query_fz, query_fy, match_count, exclude_doc_id, min_similarity, fz_fy_weight)` enligt din spec. Returnerar similarity, fz_delta, fy_delta, hybrid_score, plus metadata.
- SQL-funktion `match_chunks_hybrid(query_embedding, min_cti, min_similarity, match_count)` returnerar utökat result med matchProfile-fält (sharedSpeechAct härleds från intention.speechAct i `chunks`).
- GRANT SELECT/UPDATE på custom_label-kolumnerna till authenticated; service_role som vanligt.

## 2. Edge functions

- `update-cluster-label` (PATCH): zod-validering `{cluster_id, document_id, custom_label}`, max 60 tecken, strip HTML. Använder service_role.
- `search-clusters` (POST): tar `{clusterId, documentId, fzFyWeight, minSimilarity, matchCount}`, hämtar valt klusters centroid+fz+fy, anropar `match_clusters_hybrid`, returnerar resultat med matchProfile.
- Uppdatera `search-chunks`: lägg till hybrid-params och `matchProfile` i svar.
- Uppdatera `persist-field`: kör `REFRESH MATERIALIZED VIEW CONCURRENTLY document_cti_ranking` async efter insert.

## 3. SearchPanel.tsx — tre sektioner

### A. Corpus CTI-rankning (alltid synlig, ingångspunkt)
Hämtas vid mount från `document_cti_ranking`, cachas i sessionStorage (5 min TTL). Lista med bar-chart för avg_cti, klick → "Ladda dokument" (prompt om byte).

### B. Friction Cluster Similarity (aktiveras vid valt kluster)
- Visar valt kluster med FZ/FY-badges.
- Custom-label input (optimistic update via `update-cluster-label`).
- Två slidrar: FZ/FY-vikt (0–1, default 0.3), Min similarity (default 0.65). Debounce 300ms.
- Resultatlista med hybrid_score, Δfz/Δfy-badges, "Likhetsprofil"-mini-display, [Öppna dokument]-knapp.

### C. Semantisk fritextsökning (kollapsad default)
Debounce 400ms, sessionStorage-cache på query. CTI-slider. Resultat med matchProfile och [Hoppa till nod].

## 4. Notebook-adapter
Redan implementerad i föregående etapp — verifierar och utökar med `output`-celler som separata units om de innehåller > 20 tecken text.

## 5. Export-utökning
Tre knappar i sidopanelen:
- Exportera fält-JSON (befintlig)
- Exportera embeddings (chunks + vektorer för aktivt dokument)
- Exportera corpus-karta (alla clusters_summary från alla dokument)

## 6. Interaktion: kluster-first
- Klick på nod i `FieldCanvas` → `selectedClusterId` propageras till SearchPanel sektion B.
- Klick på "Liknande kluster"-resultat → om samma doc: pan/zoom till centroid; annars prompt + ladda dokumentets fält från DB (chunks → FieldUnits rekonstruktion).
- Sektion A oberoende av valt kluster.

## Teknisk struktur

```text
src/components/
  SearchPanel.tsx           (ny, 3 sektioner)
  search/
    CorpusCtiRanking.tsx
    FrictionSimilarity.tsx
    SemanticSearch.tsx
src/lib/
  searchClient.ts           (wrapper för edge functions + cache)
supabase/functions/
  update-cluster-label/
  search-clusters/
  search-chunks/            (uppdaterad)
  persist-field/            (refresh view)
supabase/migrations/
  <ny>_etapp2_search.sql
```

## Implementationsordning
1. Migration (ALTER + view + två funktioner + GRANTs)
2. `update-cluster-label` + `search-clusters` edge functions
3. Uppdatera `search-chunks` och `persist-field`
4. `searchClient.ts` + sektion A (CTI-rankning)
5. Sektion B (friction similarity + custom label + slidrar)
6. Sektion C (semantisk sökning)
7. Export-knappar
8. Pan/zoom + cross-document load

## Frågor innan jag kör
1. **Cross-document load**: när användaren öppnar ett annat dokument via "Öppna dokument" — ska vi rekonstruera fältet från DB-chunks (full topologi inkl. spatial layout), eller bara visa en enkel preview av träffande kluster? Det första är dyrare men matchar utforsknings-paradigmen.
2. **Materialized view refresh**: ska refresh vara synkron i `persist-field` (säkrare data, långsammare upload) eller bakgrund via `pg_notify` + trigger? Jag lutar mot bakgrund.
3. Vill du att jag implementerar alla 8 steg i ett pass, eller stannar efter steg 4 (sektion A live) för en första visuell verifiering innan vi går vidare med similarity?
