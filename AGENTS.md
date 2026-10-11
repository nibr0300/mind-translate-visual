
- Domain profiles live in src/lib/domainProfiles.ts and are sent to analyze-intentions per request; why: one place to add a field of knowledge without schema changes.
- External apps reach fields only through the `field-api` edge function authenticated by personal API keys; why: one versioned contract for navigators, never direct table access.
- Axis weight/friction math lives in `supabase/functions/_shared/axisMath.ts` and is imported by both browser and server; why: identical numbers in the sidebar and the API.
- Intention analysis core lives in `supabase/functions/_shared/intentions.ts`; why: shared by analyze-intentions and field-api ingest.
