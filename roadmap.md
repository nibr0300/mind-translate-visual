# Roadmap

## Självläkande import
- [ ] Reparera säkra strukturfel, hoppa över oanvändbara noder utan att hitta på analysvärden, och visa ändringarna vid import; verifiera Narratörens inläsning och export.

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
