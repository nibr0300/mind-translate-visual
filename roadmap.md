# Roadmap

## Grunden (först)
- [x] JSON-import av pokerboken: begränsad kartgrafik, 35 tester godkända; riktig 600-nodersbok importerad, zoom och Cross-Corpus DPO med akademiskt fält verifierade i mobilstorlek (0 par vid starttrösklar). Fysisk mobil återstår att bekräfta.
- [x] Djup AI-spänning (llmTension/CTI) blev alltid 0 — analysen avbröts innan den hann klart. Åtgärdat + synlig varning vid låg täckning.
- [ ] Uppladdning hoppar tillbaka till startläge — blockerad: behöver den exakta filen som fallerar för att återskapa felet.

## Expansion (efter grunden)
- [x] Träningsdata: pokerfrågemallar, topologisk kontext, mänsklig granskning och JSONL-export för SFT/generisk DPO; 25 tester, SFT-nedladdning verifierad med riktig pokerbok (12 kandidater, 0 DPO-par med strikt urval)
- [x] Domänprofiler (General, Poker, Research, Law & policy, Dialogue & therapy) med två egna axlar var
- [x] A1 domänaxlar med corpus-vikt + A4 fält-API (ingest, field, tensions, project)
- [x] Kalibrering: domän per dokument, riktiga kvalitetsmått, axelvy, kalibreringstester
- [ ] Kalibreringstest 1 och 3 — väntar på ≥2 pokerdokument markerade som Poker
- [x] Bug bounty-profil steg 1: 14 axlar i tre familjer, källklasser med vikt, strukturella enheter, brusfilter med logg, ordlista först, 8 tester
- [x] Bug bounty: fyra kalibreringstest (positiva och negativa) mot riktiga scope/rapporter — alla godkända
- [ ] A3 deformation + A5 versionshistorik
- [ ] App B navigatör (separat projekt)
- [ ] Agentloop: situation → projicera → mäta → resonera → handla → observera → deformera fältet
