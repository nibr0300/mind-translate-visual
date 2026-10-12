
- Domain profiles live in src/lib/domainProfiles.ts and are sent to analyze-intentions per request; why: one place to add a field of knowledge without schema changes.
- External apps reach fields only through the `field-api` edge function authenticated by personal API keys; why: one versioned contract for navigators, never direct table access.
- Axis weight/friction math lives in `supabase/functions/_shared/axisMath.ts` and is imported by both browser and server; why: identical numbers in the sidebar and the API.
- Intention analysis core lives in `supabase/functions/_shared/intentions.ts`; why: shared by analyze-intentions and field-api ingest.

- Each document carries a `domain` column; corpus-map and field-api /project filter on it. Why: a navigator must only see fields of its own domain.
- Cluster cohesion/noise_ratio are computed at persist time and stored on clusters_summary (noise = members closer to another centroid). Why: corpus-wide vector joins time out.
- Calibration tests live in field-api POST /calibrate (accepts API key or user JWT). Why: one place for navigator readiness checks.
- Domain profiles may carry source classes and lexical axis dictionaries; the lexical layer (src/lib/domainLayer.ts) overrides LLM axis scores. Why: deterministic ground first, LLM only fills gaps.
- Bug bounty structural extraction lives in src/lib/inputAdapters/securityExtractor.ts and bypasses the prose chunker. Why: endpoints/hosts must stay intact as their own units.
