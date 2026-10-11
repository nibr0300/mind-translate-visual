# Fältbyggaren: domänaxlar (A1) och fält-API (A4)

Följer rekommendationen i byggplanen: börja med A1 + A4 i denna app, så att en minimal navigatörsapp (App B, eget projekt) kan kopplas på och ge en sluten loop tidigt.

## Vad som redan finns
- Domänprofiler med två fasta axlar var (Poker: GTO↔Exploit, Aggression), poängsatta per enhet av AI-analysen.
- Djup AI-spänning (llmTension/CTI) fungerar nu, med varning vid låg täckning.
- Sparade dokument, kluster och embeddings i databasen, plus semantisk sökning och en MCP-server.

## A1: Domänaxlar som anpassar sig efter corpus
- Poker får fler fördefinierade axlar: GTO↔Exploit, Aggression↔Passivitet, ICM↔chip-EV, Value↔Bluff.
- Varje axel får en vikt (0–1) som räknas fram ur hela corpus: hur mycket axeln faktiskt skiljer kluster åt. Axlar som inte säger något om materialet viktas ned.
- Friktionspunkter per axel: de klusterpar som ligger längst isär på en axel och samtidigt har hög spänning.
- Sidopanelen visar axlarna med vikt och de starkaste friktionerna.

## A4: Fält-API för en extern navigatör
Nås med en personlig API-nyckel som skapas i kontopanelen (så att en annan app kan anropa utan inloggning).

| Anrop | Gör |
|---|---|
| POST /ingest | Tar emot text, bygger och sparar fältet, returnerar fält-ID |
| GET /field/{id} | Hela fältet enligt datakontraktet (axlar, kluster, kanter, spänningar) |
| POST /project | Situationstext → närmaste kluster, avstånd till friktionspunkter (grundversion av A2) |
| GET /tensions/{id} | Top-N friktionspunkter |

/deform och versionshantering (A3, A5) byggs i nästa steg; datakontraktet får redan nu ett versionsfält så att det inte behöver ändras senare.

## Utanför denna plan
- App B (navigatören) byggs som ett separat projekt och använder API:t ovan.
- Solver, equity- och ICM-verktyg körs av navigatören, inte här.

## Tekniska detaljer
- Ny tabell `api_keys` (hashad nyckel, ägare), RLS ägar-begränsad.
- Ny edge function `field-api` med enkel sökvägsroutning; nyckeln valideras mot hash och ger ägarens user_id.
- Ingest återanvänder befintlig klientpipeline? Nej — servern saknar TF-IDF-pipelinen, så /ingest kör en serverversion: chunkning, embeddings, k-means på embeddings, analyze-intentions. Enklare men konsekvent.
- /project: embedding av "situation: "+text, cosinus mot klustercentroider och friktionsenheter.
- Axelvikt = varians av klustermedelvärden på axeln / total varians (η²), sparas i `clusters_summary`/dokumentstats.
- Tester för axelvikt och friktionsval.
