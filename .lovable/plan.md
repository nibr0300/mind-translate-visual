# Pokerprofilen: matematisk grund först, tells som eget lager

Pokerprofilen har idag 4 axlar (Exploit, Aggression, ICM, Bluff), inga ordlistor och poängsätts bara av AI. Responsen ger tre material: matematik/statistik (6 axlar), turneringsmatematik ur *Kill Everyone* (5 axlar) och kroppsspråk ur Navarro (4 axlar). Flera överlappar, så vi slår ihop dem i stället för att lägga till 15.

## 1. Pokerprofilens axlar, i tre familjer (samma mönster som Bug bounty)

| Familj | Axel | Låg ↔ Hög |
|---|---|---|
| Math | bluff_math (krävd lyckandegrad: 1/3→25 %, 1/2→33 %, 2/3→40 %, 1x→50 %, 2x→67 %) | lönsam luft ↔ negativt EV |
| Math | combinatorial_density (blockers; 12/4/6 kombos) | tung ↔ uttunnad range |
| Math | multiway_viability | heads-up ↔ multiway |
| Stats | range_polarity (VPIP/PFR: <1.2 TAG, >2.5 passiv) | tight-aggressiv ↔ loose-passiv |
| Stats | aggression_decay (flop- mot turn-cbet) | ger upp ↔ fortsätter |
| Stats | defensive_honesty (fold to 3-bet >65 % / <50 %, check-raise >20 %) | klibbig ↔ foldar för mycket |
| Tournament | stack_urgency (CSI: >20, 7–12, <7) | djup stack ↔ push/fold |
| Tournament | icm_pressure (bubble factor ≈1 / >1.5) | chip-EV ↔ överlevnad |
| Tournament | speculative_threshold (5- och 10-regeln) | implicita odds ↔ blöder stack |

De gamla axlarna går upp i dessa: Bluff → bluff_math, ICM → icm_pressure, Aggression → aggression_decay. Exploit behålls som en sammanfattande axel. "re_steal_viability" och "equity_realization" är dubbletter av defensive_honesty och bluff_math och läggs inte till.

## 2. Ordlistor och siffror (deterministiskt först)
- Ordlistor per pol, som i Bug bounty: "c-bet", "fold to 3-bet", "VPIP", "bubble", "blocker", "set mining", "push/fold" osv.
- En ny siffertolk läser tal ur texten och sätter axelvärdet direkt från tröskelvärdena ovan: "VPIP 35 / PFR 8" ger kvot 4,4 och alltså range_polarity hög, "bet 1/2 pot" ger 33 %, "12 BB, ante" ger en CSI-zon, och "raise 12 % av stacken" faller över 10-regeln. Siffror vinner över ordlistan, och ordlistan vinner över AI:n.
- Kombinatorik: en liten räknare för antal kombinationer kvar i en range givet egna kort (blockers). Den används för att poängsätta combinatorial_density när texten innehåller hålkort och en range.

## 3. Friktion i poker
- Friktion = en motsägelse mellan två mått i samma enhet, till exempel 3-bet 14 % och samtidigt fold to 3-bet 70 % ("paper tiger"), flop-cbet 80 % mot turn-cbet 30 %, eller krävd lyckandegrad 33 % mot faktisk fold 60 %. Sådana par ger bonusen för motsatta poler i den befintliga FZ-formeln.
- Den föreslagna formeln med fasta vikter (0.3/0.2/0.2/0.3) används inte rakt av, eftersom den blandar axelns läge med spänning. Vi behåller den kalibrerade FZ-formeln och låter friktionsparen driva bonusen. Varje gata (preflop/flop/turn/river) kan få egna vikter i ett senare steg.

## 4. Tells (Navarro) som en separat profil, "Poker – live tells"
Fyra axlar: verbal_physical_congruence, action_posture_alignment, baseline_deviation, micro_macro_sync. Den hålls skild från matematikprofilen så att den inte blandas in i en precisionskarta. Den här profilen bygger på AI-poängsättning och korta ordlistor, eftersom tells är beskrivningar och inte siffror.

## 5. Tester
- En tröskel per regel: 1/2 pot ger 33 %, VPIP 35/PFR 8 ger kvoten >2.5, CSI 6 ger push/fold, raise 12 % av stacken ger fold enligt 10-regeln, bubble factor 1.8 ger hög icm_pressure, AJo = 12 kombos och AA med ett ess blockerat = 3 kombos.
- Ett friktionsfall: "paper tiger" ska ge bonus för motsatta poler.

## Utanför planen
- Import av HUD-data (Hold'em Manager/PokerTracker) och live-scraping. Det hör till navigatören (App B) och kräver en riktig export att testa mot.
- Solver- och equity-beräkning, som körs av navigatören.

## Tekniska detaljer
- `domainProfiles.ts`: poker får `family`, `axisDictionaries`, `fzCalibration` och `llmAxesByDefault: false`. Ny profil `poker_tells`.
- Ny `src/lib/pokerMath.ts`: requiredBluffSuccess(bet, pot), vpipPfrRatio, csi(stack, sb, bb, ante, players), speculativeRule(raise, effStack), bubbleFactor, combos(hand, blockers), samt en numerisk parser → axelvärden. Den hakas på i `applyLexicalAxes` före ordlistan.
- Gamla pokerdokument har kvar sina gamla axelnycklar. Fältet för Exploit finns kvar, och de övriga visas som "äldre axlar" tills dokumentet laddas om.
- Tester i `src/test/pokerMath.test.ts`.
