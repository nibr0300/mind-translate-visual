# Roadmap

## Narratörens röstjusteringar
- [x] Proaktiv åtgärd, proaktivt försvar och nyfikenhet tillagda som separata snabbkorrigeringar; befintlig röst och granskning behålls.
- [x] 23 tester godkända; inloggad import av sparat pokerfält, tre simulerade korrigeringsanrop, granskning och ChatML-export verifierade utan sidfel på dator/mobil. narrate-field driftsatt; den verkliga AI-röstens kvalitet återstår att bedöma när AI-budgeten tillåter.

## Missing corpus metric crash
- [x] Unavailable corpus and search metrics remain null and display as “—”, never invented zero. Four regression tests passed; signed-in null-CTI ranking reproduced the original crash before the fix, then ranking, null-score semantic results and domain filtering worked without page errors at desktop and 737×1383. Preview build OK; existing saved analyses and database untouched.

## skills3 F-värden
- [x] Rättat ordtabeller som krockade med kodordet constructor, hashindex i TF-IDF och FZ-sammanfattningen efter domänkalibrering.
- [x] 31 regressionstester godkända; inloggad skills3-uppladdning med AI-anrop avstängda gav 386 noder, FY 0.634, FZ 0.030 och inga ogiltiga koordinater/värden. Karta och sammanfattning visuellt verifierade; äldre sparad analys har inte ändrats och djup AI-omanalys ingick inte.

## Narratör v2
- [x] Gemensam relationell v2-hållning för generering och export, tydlig versionering av nya/äldre svar och möjlighet att generera om; narrate-field deployad.
- [x] 20 riktade tester godkända; inloggad import av verkligt 600-nodersfält, granskning, ChatML och v2-batch-export verifierade utan sidfel. Ingen radering: den nya rösten kräver inte nya fältmått. Identisk innehållshash återanvänder däremot databasfält vid faktisk omanalys, så riktad hantering kräver valda dokument. Live-generering med v2 väntar på redan noterad AI-budgetåterhämtning.

## Självläkande import
- [x] Gemensam självläkande import i karta, fält B och Narratör: säkra strukturreparationer, inga uppskattade analysvärden, överhoppade noder och rensade förbindelser redovisas i gränssnitt och exportanteckningar. 33 riktade tester godkända; inloggad import av ett 437-nodersfält med avsiktliga fel, granskning och ChatML-export verifierade utan sidfel, även vid mobilbredd. Tre äldre kausalparningstester fallerar separat; det kompletta Trading-fältet verifieras oförändrat av importen.

## Field saving credit-limit error
- [x] Deployed safe gateway errors with original status, stopped blocked batches, and moved embeddings before saved-content changes; 3 error tests passed, preview build OK.
- [x] Signed-in upload with simulated credit-limit 403 verified: safe warning appears, 42-node map remains visible, and field restores after reload with no page errors; no live AI credits spent.
- [ ] Verify live AI saving after recovery — blocked by the reached workspace AI spending cap (60 credits/month); no further AI probes until an owner adjusts it.

## Partitur-Narratören
- [x] Åtgärdat upprepat urval och täta sparningar: 16 tester godkända, inklusive 12 fält med simulerad strömning; inloggad granskning/export/återställning med 9 verkliga sparade fält (3155 noder) verifierad. Fysisk telefon ej testad.
- [x] Återinläsning av flera sparade fält, skräp-/friktionsfilter och tre kontextankare utan ny fältanalys
- [x] Sekventiell strömmande AI-generering med nodtak, stopp, snabbkorrigering och lokal batch-export; persistent server-spärr vid provideråtkomstnekande
- [x] Redigerbar mänsklig granskning, godkänd ChatML-export och separat proveniens/baslinje; granskning återställs per användare på enheten
- [x] 58 riktade tester godkända; inloggat 600-noders poker/trav-fält, AI-svar, snabbkorrigering, godkännande, nedladdning och omladdning verifierade; mobilstorlek 390×844 utan horisontell överströmning. Modellträning och fysisk telefon ingår inte i verifieringen.

## Journal-loop för Bug Bounty
- [x] Skiftat till kompetensutveckling: insats, före/efter-bedömning, tillämpningsbevis, självständighetsförslag och v2-export; befintliga mandat separat referens. 41 regeltester godkända; inloggat flöde med deklarerade syntetiska data, export och återställning verifierade; field-api deployad, okänt fält ger 404. Verklig kompetens-/API-bedömning väntar på tillgängligt Bug Bounty-fält och kamratens agentjournal.
- [x] Journalmall, privat enhetssparad agenthistorik och läs/sammanfatta/integrera/ompröva-flöde
- [x] Lexikalt prioriterat kompetensspår från fältet och agent_mandate_export.json med stoppvillkor; inga fabricerade förkunskapskrav
- [x] Versionerad journal-ingång via field-api deployad; 49 regeltester, inloggat flöde med deklarerade testdata, återställning och nedladdning verifierade; okänt fält ger 404
- [ ] Verifiering med kamratens verkliga agent och Bug Bounty-bibliotek — väntar på hans journal och ett tillgängligt Bug Bounty-fält; ingen automatisk verktygskörning eller schemaläggning sker i denna app

## Grunden (först)
- [x] JSON-import av pokerboken: begränsad kartgrafik, 35 tester godkända; riktig 600-nodersbok importerad, zoom och Cross-Corpus DPO med akademiskt fält verifierade i mobilstorlek (0 par vid starttrösklar). Fysisk mobil återstår att bekräfta.
- [x] Djup AI-spänning (llmTension/CTI) blev alltid 0 — analysen avbröts innan den hann klart. Åtgärdat + synlig varning vid låg täckning.
- [x] Uppladdning/import hoppar tillbaka till startläge på mobil — orsak: förhandsvisningen laddade om sidan när filväljaren tog appen i bakgrunden. Åtgärdat (återansluter utan omladdning, senaste fält sparas).

## Expansion (efter grunden)
- [x] Mekanismgraf, kausal DPO-sökning, tyst chosen och blandad trading-testkorpus (10 hög-CTI + 5 rationella); 48 riktade tester och inloggad DPO/SFT-export verifierade. Kausallänkar valideras manuellt, tillämpat svar skrivs i granskningen. Modellträning/transfer-prestanda är inte verifierad.
- [x] Träningsdata: pokerfrågemallar, topologisk kontext, mänsklig granskning och JSONL-export för SFT/generisk DPO; 25 tester, SFT-nedladdning verifierad med riktig pokerbok (12 kandidater, 0 DPO-par med strikt urval)
- [x] Domänprofiler (General, Poker, Research, Law & policy, Dialogue & therapy) med två egna axlar var
- [x] A1 domänaxlar med corpus-vikt + A4 fält-API (ingest, field, tensions, project)
- [x] Kalibrering: domän per dokument, riktiga kvalitetsmått, axelvy, kalibreringstester
- [ ] Kalibreringstest 1 och 3 — väntar på ≥2 pokerdokument markerade som Poker
- [x] Bug bounty-profil steg 1: 14 axlar i tre familjer, källklasser med vikt, strukturella enheter, brusfilter med logg, ordlista först, 8 tester
- [x] Bug bounty: fyra kalibreringstest (positiva och negativa) mot riktiga scope/rapporter — alla godkända
- [x] Cross-corpus DPO: fält B-bekräftelse, stegräkning vid 0 par, AI-meningslikhet (tröskel 0.80) i stället för ordlikhet
- [ ] Transfer-utvärdering på tränad modell — väntar på separat modellträning och osedda utvärderingsexempel; kausalläget kräver inte gemensamma pokeraxlar
- [ ] A3 deformation + A5 versionshistorik
- [ ] App B navigatör (separat projekt)
- [ ] Agentloop: situation → projicera → mäta → resonera → handla → observera → deformera fältet

## Teori- och kodadaptern
- [x] Strukturerad extraktion för formell teori och program: egna noder för definition, axiom, härledning, påstående, formel, deklaration, tillståndsändring och extern anrop; bruslogg och fingeravtryck. 12 riktade tester godkända; inloggad uppladdning av RFA-formelsamlingen gav 501 noder med synlig strukturernas läsning och axelfamiljerna Proof/Ground/Relation utan sidfel.
- [x] Profilerna Formal theory & code med axlarna derivation_step, axiomatic_burden, claim_evidence_ratio, notation_load, reification_gap, sim_vs_ground, side_effect_visibility, control_asymmetry; lexikala/tröskelvärden styr före modellen.
- [x] Äldre kausalparningstester rättade: meningspoäng tillhandahålls i båda riktningarna och ordlikhet gäller som frånval när ingen poäng finns (10/10 godkända).
- [ ] Granskning av de tre kompendierna som fält: formelsamlingen (bevisbörda), skill_merged och skills3_merged (Aethels kontrollflöden) — kräver AI-budget för djupanalys utöver den struktur som redan visas.
