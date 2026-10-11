# Roadmap

## Grunden (först)
- [x] Djup AI-spänning (llmTension/CTI) blev alltid 0 — analysen avbröts innan den hann klart. Åtgärdat + synlig varning vid låg täckning.
- [ ] Uppladdning hoppar tillbaka till startläge — blockerad: behöver den exakta filen som fallerar för att återskapa felet.

## Expansion (efter grunden)
- [x] Domänprofiler (General, Poker, Research, Law & policy, Dialogue & therapy) med två egna axlar var
- [x] A1 domänaxlar med corpus-vikt + A4 fält-API (ingest, field, tensions, project)
- [x] Kalibrering: domän per dokument, riktiga kvalitetsmått, axelvy, kalibreringstester
- [ ] Kalibreringstest 1 och 3 — väntar på ≥2 pokerdokument markerade som Poker
- [ ] A3 deformation + A5 versionshistorik
- [ ] App B navigatör (separat projekt)
- [ ] Agentloop: situation → projicera → mäta → resonera → handla → observera → deformera fältet
