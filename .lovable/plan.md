# Nästa utvecklingssteg: från karta till mätinstrument

Analysen från ChatGPT pekar ut fyra tekniska brister som riskerar att förväxlas med kognition. Alla fyra är bekräftade i koden. Planen åtgärdar dem i den ordning som ger störst tolkningsvinst per steg.

## Vad som faktiskt är fel i koden idag

| Observation i analysen | Bekräftad orsak |
| --- | --- |
| "Fältet slutar vid 80 enheter, arkivslutet saknas" | `pdfFieldGenerator.ts` kapar hårt vid 80 meningar. Textvägen (`fieldGenerator.ts`) har taket 600. PDF är alltså 7,5x snålare än text — utan att användaren informeras. |
| "Den hade vikt", "Döda", "Ingen svarade" saknas | PDF-extraktionen filtrerar bort alla meningar kortare än 15 tecken. Korta litterära fragment kastas innan analys. |
| "64 unika koordinatpar för 80 noder, 13 meningar på samma punkt" | `projectTo2D` är PCA på gles TF-IDF. Meningar utan gemensamma termer får nästan nollvektor och landar på samma punkt. Ingen kollisionsdetektering finns. |
| "Exporten saknar unit-level-kanter, går ej att göra nätverksanalys" | Fältexporten innehåller enbart noder + kluster. Kanterna finns bara i `corpus-map` på klusternivå. |
| "Corpus-topplistan förorenad av Quot · 11pt · Span" | `textAdapter.ts` läser råtext utan HTML-sanering. Sparad Google Docs-HTML blir till noder med hög CTI. |

## Steg 1 — Sanera indata (störst effekt, minst risk)

- HTML-sanering i textadaptern: strip `<style>`/`<script>`, taggar, CSS-deklarationer och `&nbsp;`-entiteter innan chunkning. Om >30 % av innehållet var markup, logga det och visa en not i sidopanelen.
- Ta bort 15-teckenfiltret i PDF-extraktionen; sänk till 3 tecken (samma tröskel som textvägen) så korta fragment behålls.
- Höj PDF-taket från 80 till samma 600 som textvägen, med samma rättvisa sampling. Om kapning ändå sker: visa "X av Y enheter analyserade" i UI:t istället för att tyst släppa svansen.

## Steg 2 — Fixa projektionens kollapspunkter

- Efter `projectTo2D`: detektera koordinatkollisioner (avstånd < epsilon) och sprid ut dem deterministiskt i en liten spiral kring gemensamt centrum, seedad på nod-id så kartan blir reproducerbar.
- Lägg till `degenerate: true` på noder vars TF-IDF-vektor är nära noll, så tolkaren ser vilka positioner som är fallback och inte semantik.
- Rapportera i fältstatistik: antal unika koordinater / antal noder. Det talet är i sig ett mått på hur mycket projektionen kan lita på.

## Steg 3 — Exportera kanterna, inte bara punkterna

- Utöka fältexporten (JSON) med `edges`: kNN i den ursprungliga högdimensionella rymden (embeddings när de finns, annars TF-IDF-cosinus), k≈8, med `source`, `target`, `similarity`.
- Lägg till per-nod `degree` och `weightedCentrality` så en läsande AI kan skilja verklig nodgrad från visuell linjetäthet.
- Samma kanter exponeras via MCP-verktyget så en AI kan hämta topologin utan att gå via filexport.

## Steg 4 — Introspektionsslingan (det egentligen nya)

Analysens skarpaste poäng: kartan blir intressant först när samma modell först *förutsäger* och sedan *ser*.

- Nytt läge "Predict & Compare": innan fältet visas får modellen texten och ombeds peka ut de N meningar den tror får högst CTI.
- Efter analys visas en jämförelsevy: förutsagda vs faktiska kritiska noder, med träffprocent och en lista över missarna.
- Missarna sparas per dokument så avvikelserna kan följas över tid — det är det som gör det till ett självmodellskapande kretslopp snarare än post mortem.

## Teknisk not

Steg 1–2 är rena klientändringar i `textAdapter.ts`, `pdfFieldGenerator.ts` och `textAnalyzer.ts`. Steg 3 rör fältexporten i `FieldSidebar.tsx` plus MCP-funktionen. Steg 4 kräver ett nytt anrop till analysfunktionen och en ny tabell för prediktioner.

## Fråga innan start

Steg 1–3 gör om appen till ett trovärdigt mätinstrument. Steg 4 är den nya idén. Vill du att jag kör 1–3 i en följd först, eller ska jag börja med introspektionsslingan?
