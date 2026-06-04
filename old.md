**RFA Geometric Field Translator**

v1.0

Produktbeskrivning & Användarhandledning

*Permutation-invariant semantic topology for documents*

Therapy · Didactics · Research · AI Translation

**Innehållsförteckning**

**1.** Produktbeskrivning

> 1.1 Vad är RFA Geometric Field Translator?
>
> 1.2 Centrala koncept
>
> 1.3 Användningsområden
>
> 1.4 Teknisk arkitektur
>
> 1.5 Systemkrav

**2.** Användarhandledning

> 2.1 Gäränssnittsöversikt
>
> 2.2 Snabbstart
>
> 2.3 Demo-lägen
>
> 2.4 Ladda upp ett PDF-dokument
>
> 2.5 Tolka fältvisualiseringen
>
> 2.6 Exportera och importera fält
>
> 2.7 Vanliga frågor (FAQ)

**1. Produktbeskrivning**

**1.1 Vad är RFA Geometric Field Translator?**

RFA Geometric Field Translator är ett webbaserat verktyg som omvandlar
textdokument till interaktiva geometriska fält. Istället för att tvinga
linjär läsordning konverteras dokument till en permutation-invariant
topologi där semantisk mening och rumslig struktur bevaras som avstånd
och resonans.

Verktyget är utformat för professionella inom psykiatri, didaktik och
forskning --- men även som en bro mellan mänskliga dokument och
AI-system som behöver förstå textstruktur utan att förlita sig på
sekventiell ordning.

All databehandling sker helt på klientsidan. Inga dokument laddas upp
till någon server.

**1.2 Centrala koncept**

**FZ --- Epistemisk tension**

FZ mäter densitetsgradienten mellan kluster. Enheter med högt FZ-värde
befinner sig vid gränserna för förståelse, där koncept kolliderar och ny
mening uppstår. Inom terapi: där genombrott sker. Inom didaktik: där
missuppfattningar samlas.

**FY --- Resonans**

FY mäter hur starkt en enhet tillhör sitt klusters centrum --- dess
egentillstånd. Högt FY innebär ett kärnkoncept. Lågt FY indikerar
liminalt utrymme mellan kategorier.

**Kluster (Eigenstates)**

Dokumentets innehåll grupperas automatiskt i semantiska kluster med
hjälp av TF-IDF-vektorer och K-means-klustring. Varje kluster
representerar ett tematiskt område och visualiseras med en unik färg i
fältet.

**1.3 Användningsområden**

  --------------------- -------------------------------------------------
  **Område**            **Beskrivning**

  **Psykiatri &         Kartlägg emotionella mönster i journaler och
  terapi**              dagböcker. FZ-toppar avslöjar undermedvetna
                        triggers. Kluster blir terapeutiska aktörer.

  **Didaktik**          Visualisera kunskapsstruktur. Identifiera zoner
                        för missuppfattningar. Följ förståelsens topologi
                        över tid.

  **Forskning**         Mappa hypoteser, evidens och metodologi som
                        rumsliga relationer. Identifiera gränsfrågor via
                        FZ-analys.

  **AI-översättning**   Konvertera dokument till geometriska promptar för
                        tillståndslösa AI-system. Kluster fungerar som
                        persistenta korttidsminnesankare.
  --------------------- -------------------------------------------------

**1.4 Teknisk arkitektur**

Dokumentbehandlingen sker i sju steg, helt på klientsidan:

1.  PDF → textextraktion med pdf.js (inklusive bounding boxes)

2.  Meningsuppdelning och tokenisering

3.  TF-IDF-vektorberäkning i högdimensionellt rum

4.  K-means-klustring för att identifiera semantiska egentillstånd

5.  PCA-baserad projektion till 2D-fält

6.  FZ/FY-beräkning baserat på avstånd från klustercentrum

7.  Generering av interaktiv fältvisualisering

**1.5 Systemkrav**

- Modern webbläsare (Chrome, Firefox, Safari eller Edge)

- Ingen installation krävs --- körs direkt i webbläsaren

- PDF-filer upp till 20 MB

- Minst 5 meningar i dokumentet för meningsfull analys

**2. Användarhandledning**

**2.1 Gränssnittsöversikt**

Applikationen består av två huvudområden:

- **Vänster sidopanel:** Innehåller PDF-uppladdning, lägesväljare,
  fältstatistik, klusterlista samt export/import-knappar.

- **Centralt fältområde:** Visualiserar det geometriska fältet med noder
  (enheter), kopplingslinjer och klusterområden. En informationspanel
  kan öppnas via "How it works"-knappen.

**2.2 Snabbstart**

Följ dessa steg för att komma igång:

8.  **Öppna applikationen** i din webbläsare. Du möts av ett demo-fält i
    terapiläge.

9.  **Växla demo-läge** genom att klicka på Therapy Journal, Didactic
    Material eller Research Paper i sidopanelen.

10. **Ladda upp din egen PDF** genom att dra-och-släppa en fil på
    uppladdningsfältet, eller klicka för att bläddra.

11. **Utforska fältet** genom att hovra över noder för att se text,
    FZ/FY-värden och kluster-tillhörighet.

12. **Exportera resultatet** som en JSON-fil för senare återanvändning.

**2.3 Demo-lägen**

Applikationen erbjuder tre förkonfigurerade demo-lägen med simulerad
data för att illustrera olika användningsområden:

  ------------------- ---------------------------------------------------
  **Läge**            **Kluster som visas**

  **Therapy Journal** Emotional Reflection, Trigger Events, Insight
                      Moments, Coping Strategies, Renewal Patterns

  **Didactic          Core Concepts, Examples & Analogies,
  Material**          Misconceptions, Assessment Points, Cross-References

  **Research Paper**  Hypothesis Space, Evidence Clusters, Methodology,
                      Boundary Questions, Prior Work
  ------------------- ---------------------------------------------------

**2.4 Ladda upp ett PDF-dokument**

För att analysera ditt eget dokument:

13. Lokalisera uppladdningsfältet markerat "Upload PDF" i sidopanelens
    överkant.

14. Dra och släpp en PDF-fil, eller klicka på "browse" för att välja
    fil.

15. Vänta medan dokumentet bearbetas. En förloppsindikator visar
    aktuellt steg.

16. När bearbetningen är klar visas det geometriska fältet automatiskt.

**Begränsningar:** Maximal filstorlek är 20 MB. Dokumentet måste
innehålla minst 5 meningar. Maximalt 80 meningar behandlas för
prestanda.

**Integritet:** All bearbetning sker lokalt i din webbläsare. Ingen data
skickas till någon extern server.

**2.5 Tolka fältvisualiseringen**

**Noder**

Varje nod (cirkel) representerar en semantisk enhet (mening eller
fragment) från dokumentet. Nodens egenskaper:

- **Storlek:** Större noder har högre FZ (epistemisk tension).

- **Färg:** Indikerar klustertillhörighet (fem distinkta färger).

- **Glans/glow:** Starkare glans = högre FZ-värde (gränsenhet).

- **Position:** Närliggande noder är semantiskt relaterade.

**Interaktion**

- **Hovra** över en nod för att se dess text, FZ/FY-värden och typ.

- **Klicka** på en nod för att välja den och filtrera till dess kluster.

- **Klicka på ett kluster** i sidopanelen för att filtrera fältet till
  enbart det klustret.

- **Klicka igen** för att återställa filtret.

**Kopplingslinjer**

Linjer mellan noder indikerar semantisk närhet. Starkare (mer synliga)
linjer innebär högre likhet. Linjer inom samma kluster färgas med
klustrets färg; linjer mellan kluster visas i dämpad gråton.

**2.6 Exportera och importera fält**

**Exportera**

17. Klicka på "Export"-knappen längst ned i sidopanelen.

18. En JSON-fil laddas ner med det fullständiga geometriska fältet.

19. Filnamnet innehåller läge och tidstämpel för enkel identifiering.

**Importera**

20. Klicka på "Import"-knappen bredvid Export.

21. Välj en tidigare exporterad JSON-fil.

22. Fältet återställs med alla enheter, kluster och statistik intakta.

**2.7 Vanliga frågor (FAQ)**

***Kan jag använda verktyget offline?***

Nej, applikationen kräver en internetanslutning för att ladda
pdf.js-biblioteket. Däremot laddas inga dokument upp --- all bearbetning
sker lokalt.

***Vilka språk stöds?***

Tokeniseringen hanterar latinska alfabet inklusive svenska tecken (å, ä,
ö). För bästa resultat använd dokument på engelska eller skandinaviska
språk.

***Varför visas bara 80 meningar?***

För att säkerställa responsiv prestanda i webbläsaren begränsas analysen
till de första 80 meningarna. Detta är tillräckligt för att fånga
dokumentets övergripande semantiska struktur.

***Kan jag dela ett exporterat fält med kollegor?***

Ja. Exporterade JSON-filer kan delas fritt och importeras av alla som
har tillgång till applikationen. Fältet återskapas exakt.

***Vad betyder "eigenstates" i klustrens rubrik?***

Eigenstates är en metafor från kvantfysiken. Här representerar de
stabila semantiska tillstånd --- kluster av innehåll som naturligt hör
samman.
