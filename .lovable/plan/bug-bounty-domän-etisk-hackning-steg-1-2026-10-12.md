# Bug bounty-domän (etisk hackning) — steg 1

Målet är att lägga in den andra AI:ns specifikation i appen utan att bygga om grunden. Vi tar bara det som ger säkerhetsfältet skärpa, och sparar resten till senare.

## Vad du får
- En ny domänprofil, **Bug bounty**, i domänvalet. Den har egen vägledning: läs texten som angreppsyta, scope och regler, inte som prosa.
- **Strukturella enheter.** Endpoints, sökvägar, värdnamn, parametrar, headers och felsträngar blir egna noder på kartan. De späds inte ut i meningar. Kod, URL:er och sökvägar klipps aldrig sönder.
- **Källklass per fil med vikt** (scope 1.0, policy 0.9, writeups 0.9, api_doc 0.8, recon 0.8, changelog 0.7, frontend 0.7, docs 0.6, issues 0.5, blog 0.5). Du väljer klass vid uppladdning, och vikten påverkar spänning och rankning.
- **Axlar i tre familjer:** sökning, yta och värde. Det blir 14 axlar enligt specifikationen. Sidopanelen grupperar dem per familj.
- **Brusfilter med logg.** Rader som "Skip to content", "Powered by" och "Learn more" sorteras bort, men sidopanelen visar vad som togs bort och varför. Inget försvinner tyst.
- **Ordlista först, AI sedan.** Ordlistor per axel och pol ger samma resultat varje gång. AI-tolkningen fyller bara luckor där ingen ordlista träffar, och kan stängas av.
- **Kalibrering** med fyra tester: samma fil ger samma fingeravtryck, varje nod kan spåras till sin källa, brusfiltret slänger inga endpoints, och minst 95 % av 50 kända endpoints och värdnamn hittas.

## Medvetet utanför (nu)
- **Ingen automatisk hämtning från målsajter.** Appen skannar inte och hämtar inte heller något från webbplatser. Du laddar själv upp scope, policy, rapporter och API-dokument. Det håller appen passiv och undviker juridiska gråzoner.
- Gambling-tvillingprofilen och ommätning av ändrade versioner (A5) kommer senare.

## Ordning
1. Profil, källklasser och axlar med ordlistor
2. Strukturell utvinning med skyddade zoner, plus brusfilter
3. Viktning och visning per axelfamilj i sidopanelen
4. Kalibreringstester med testfiler

## Tekniska detaljer
- `domainProfiles.ts`: profilen får `family` per axel, `sourceClasses` och `axisDictionaries` per pol. Gränsen på 4 axlar i analyze-intentions höjs per profil (bugbounty: 14), och axlar som saknar träff utelämnas för att spara AI-budget.
- Ny `inputAdapters/securityExtractor.ts`: utvinning med regex för metod+sökväg, värdnamn, `?param=`, `X-`-headers och felsträngar. Skyddade zoner tas ut före chunkern och läggs tillbaka efteråt. Varje enhet får `unit_type`, `source_class`, `source_weight` och offsets.
- Dedup: exakt dedup med content_hash finns redan. När-dubbletter jämförs med SimHash (tröskel 0.92), och kopian från källan med högst vikt behålls.
- `corpus_hash` beräknas över en kanonisk serialisering och sparas i `documents.stats`.
- Kalibreringstesterna läggs till i field-api `/calibrate` och som vitest-fixturer.
- Databasen behöver ingen ändring, eftersom fälten ryms i chunks `intention` och documents `stats`.
