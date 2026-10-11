# Kalibrera pokerfältet innan navigatören byggs

Mål: kunna visa, med mätbara tester, att den domänspecifika friktionskartan beter sig som förväntat. Navigatören (App B) väntar tills testerna går igenom.

## 1. Rena domänfält (corpus per domän)
- Varje dokument får en domän (finns redan i stats.domain för nya uppladdningar; äldre sätts till "general").
- Korpuskartan och sökningen får ett domänfilter: "Visa bara Poker".
- Fält-API:t (/project, /tensions) filtrerar på domän som standard, så en handfråga aldrig får tillbaka gnosticism- eller medvetandekluster.
- Möjlighet att ändra domän på ett befintligt dokument i sidopanelen (utan omuppladdning).

## 2. Laga trasiga kvalitetsmått
- Cohesion och noise ratio visar 0 i korpussammanfattningen. Spåra och rätta beräkningen så att alla tre (cohesion, separation, noise) ger riktiga värden.
- Dokument med låg koordinatupplösning (t.ex. under 0.3) flaggas som "osäker struktur" och viktas ned i /project.

## 3. Domänaxlar styr placeringen
- Ny vy "Domänaxlar" i kartan: välj två axlar (t.ex. GTO↔Exploit horisontellt, Aggression vertikalt) och noderna placeras efter sina axelvärden.
- Den vanliga semantiska vyn finns kvar; man växlar mellan dem.
- Skärpt instruktion till AI-analysen så axelvärden blir mer graderade och sätts till "ej relevant" i stället för en gissning (t.ex. abstraktens exploit 0.5).

## 4. Utvärderingsprotokoll (inbyggt)
En panel "Kalibrering" som kör tre tester mot pokerfältet och visar godkänt/underkänt:
1. Domänseparation: pokerdokument ligger närmare varandra än icke-poker.
2. Kontrast: två motsägande AA-texter hamnar nära varandra men med hög spänning.
3. Situationsprojektion: olika faser i en handhistorik aktiverar olika kluster.

## Utanför denna plan
- Navigatören (App B), /deform och versionshistorik — kommer efter att kalibreringen går igenom.

## Tekniska detaljer
- Kolumn `domain` på documents (default 'general', backfill från stats->>'domain'), index; RPC:er match_clusters_hybrid / corpus-map / match_chunks får valfri domänparameter.
- field-api: `domain`-parameter, default = fältets domän; nedviktning via stats.coordinateResolution.
- Rätta corpus_cluster_quality / corpus-map-aggregering (cohesion/noise).
- FieldCanvas: layoutläge "axes" som mappar domainAxes[a], domainAxes[b] till x/y; enheter utan värde samlas i en "ej poängsatt"-zon.
- Kalibreringstester körs via field-api med inbyggda testtexter; enhetstester för domänfilter och axellayout.
