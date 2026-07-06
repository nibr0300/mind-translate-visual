# RFA Geometric Field Translator

RFA Geometric Field Translator är ett webbaserat verktyg som omvandlar textdokument till interaktiva geometriska fält. Istället för att tvinga användaren genom en linjär läsordning konverteras dokument till en permutation-invariant semantisk topologi där mening och rumslig struktur bevaras som avstånd, resonans och spänning.

## Vad som gör verktyget unikt

- **Permutation-invariant analys**: Dokumentets innebörd behandlas som ett fält, inte som en sekvens. Att byta ordning på meningarna förändrar inte fältets grundläggande struktur.
- **Fältdynamiska mått**: Varje textenhet får värden för **FZ** (epistemisk spänning), **FY** (resonans) och **CTI** (Composite Tension Index). Dessa mått avslöjar var innehållet bär på motstånd, ambivalens eller djupare mening.
- **Triangulerad sanningsspänning**: CTI beräknas från fyra oberoende källor — LLM-bedomning, lexikal hedging, talakt-diskrepans och intra-kluster-avvikelse — för att identifiera kritiska friktionspunkter utan att lita på en enda källa.
- **Klientsidig integritet**: All PDF-bearbetning, klustring, fältgenerering och analys sker i din webbläsare. Inget dokument lämnas någonsin en server.
- **Interaktiv utforskning**: Zooma, panorera och rotera runt valda noder. Sök efter specifika enheter, filtrera kluster, och exportera det fullständiga fältet som JSON för att återställa topologin senare.

## Användningsområden

| Område | Användning |
| --- | --- |
| **Terapi & psykiatri** | Kartlägg emotionella mönster, triggers och insiktsögonblick i journaler och dagböcker. FZ-toppar avslöjar undermedvetna friktionspunkter. |
| **Didaktik** | Visualisera kunskapsstruktur, identifiera missuppfattningszoner och följ förståelsens topologi över tid. |
| **Forskning** | Mappa hypoteser, evidens och metodologi som rumsliga relationer. Hitta gränsfrågor och spänningar via FZ-analys. |
| **AI-översättning** | Konvertera dokument till geometriska promptar för tillståndslösa AI-system, där kluster fungerar som persistenta korttidsminnesankare. |

## Funktionalitet i korthet

1. **Ladda upp PDF** — dra och släpp eller bläddra. Max 20 MB, cirka 80 meningar.
2. **Demo-lägen** — förhandsbyggda fält för terapi, didaktik och forskning.
3. **Fältvisualisering** — noder (meningar/fragment), kopplingslinjer, klusterområden och CTI-markeringar med dubbelringar.
4. **Sök & navigera** — sök efter text, hitta noder med gul markering, och centrera vyn.
5. **Ankare** — välj en nod och rotera fältet runt dess intentionella axel för att se djupa lager av relationer.
6. **Export / Import** — spara och dela geometriska fält som JSON.

## Teknisk arkitektur

1. PDF → text + bounding box-extraktion med pdf.js (med OCR-reserv)
2. Meningsuppdelning och vektorisering
3. Spatial modulering via vågpropagation
4. Lokal k-NN-fältdynamik
5. HDBSCAN-klustring → eigenstates
6. FZ/FY-beräkning + UMAP-projektion
7. Intentionsanalys och triangulering av sanningsspänning
8. CTI-beräkning för kritiska noder
9. Export → GeometricField.json

## Kom igång

Öppna applikationen i din webbläsare. Ingen installation krävs. Prova demo-lägena eller ladda upp din egen PDF för att se dokumentet som ett fält.

---

*Byggd på filosofin om Language-Based Relational Field-Architecture (RFA).*