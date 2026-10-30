# Zákaznícke rozhovory: čo overiť skôr, než postavíme ďalšie moduly

30. 10. 2026. Praktický sprievodca pre validáciu pred ďalšou investíciou. Nenahrádza produktové rozhodnutia;
pomáha ich postaviť na dôkazoch namiesto domnienok. Cieľom nie je zistiť „páči sa Vám to?“, ale či zákazník
funkciu reálne použije, či mu šetrí čas a či za ňu zaplatí.

## Čo máme a čo chceme overiť

Firmony dnes má dve veci, ktoré konkurencia v segmente nemá, a tie sú predmetom validácie:

1. **Peniaze vopred** (domov klienta): voľné peniaze na 30 dní, čo príde, čo odíde, a scenár
   „Koľko si môžete vyplatiť?“.
2. **Mony READ** (pomocníčka v rohu): odpovede o stave firmy priamo z údajov aplikácie, bez posielania
   firemných dát modelu.

Otázka na validáciu: **rozhodujú sa zákazníci kvôli týmto dvom veciam prejsť k nám?** A čo ešte im chýba?

## Koho sa pýtať

- **3–5 existujúcich klientov** (ak sú) — či výhodu používajú, čo im chýba, čo by ich prinútilo odísť.
- **5–8 podnikateľov, ktorí Firmony nepoužívajú** — malé s.r.o. (1–10 zamestnancov), ideálne tí, ktorí
  práve menili účtovníčku alebo zakladali firmu za posledných 12 mesiacov.
- **2–3 podnikatelia, ktorí od konkurencie odišli** — dôvod odchodu je rovnako cenný ako dôvod príchodu.

Zdroje kontaktov: dopytovník na webe, Mony logy (kto sa čo pýta), zakladateľova sieť, komunity podnikateľov.

## Osem testov (upravené z master plánu)

1. **Prvý dojem:** ukážte domovskú obrazovku 30 sekúnd. Vie povedať, čo je hotové, čo treba urobiť
   a koľko si môže vyplatiť? (Meriame: čas do správnej odpovede, bez nápovedy.)
2. **Odovzdanie dokladu:** nech odfotí bloček a prepošle faktúru bez školenia. (Meriame: čas, počet krokov,
   či vôbec potreboval pomoc.)
3. **Scenár výplaty:** nech si skúsi sumu v „Koľko si môžete vyplatiť?“. Pýtame sa: verí tomu číslu? Čo mu
   chýba? (Toto je kľúčový test ochoty platiť za prémiový balík.)
4. **Mony READ:** nech sa Mony opýta „Ako je na tom moje účtovníctvo?“ a „Koľko si môžem vyplatiť?“.
   Pýtame sa: je odpoveď užitočná, alebo by rovno volal účtovníčke?
5. **Ochota platiť:** „Táto funkcia (Peniaze vopred) je v balíku X za Y €. Zaplatili by ste?“ + van
   Westendorp (príliš lacné / lacné / drahé / príliš drahé). Nikdy sa nepýtajte len „páči sa?“
6. **Porovnanie s dneškom:** čo dnes robí ručne (tabuľka v Exceli? pýta sa účtovníčky? netuší?) a koľko
   hodín mesačne mu to berie.
7. **Dôvod prechodu:** „Čo by muselo platiť, aby ste zmenili účtovníčku?“ (overuje celú ponuku, nie len funkciu.)
8. **Dôvod odchodu:** „Čo by Vás prinútilo Firmony prestať používať?“ (cenová citlivosť, dôvera, podpora.)

## Čo si z každého rozhovoru zapísať

- kontext (firma, počet dokladov, ľudia, súčasný účtovník a cena),
- či úlohu zvládol sám (bez nápovedy),
- čas a počet krokov,
- citácie (doslova),
- akú cenu sám navrhol,
- jedno prekvapenie alebo výhrada.

## Vyhodnotenie (hranice, pred začatím)

- Aspoň **6 z 8** rozhovorov potvrdí, že „Peniaze vopred“ sú dôvod, pre ktorý by zmenili dodávateľa.
- Aspoň **polovica** bez nápovedy zvládne test 2 a 3 pod 2 minúty.
- Cenový pás z testu 5 pokryje náklady balíka s maržou (nepýtame sa na cenu skôr, než videli hodnotu).
- Ak Mony READ v teste 4 nikomu neušetrí krok, Mony necháme odpovedať len z návodov a investujeme inde.

## Čo s výsledkom

- **Potvrdené:** obe funkcie idú do marketingovej komunikácie (hero, cenník, onboarding).
- **Zamietnuté:** funkciu stiahneme alebo upravíme podľa výhrad — nikdy ju nepredávame nasilu.
- **Nové požiadavky:** zaradíme do zoznamu a otestujeme rovnakým spôsobom, kým nič nepostavíme.

Rozhovory robí zakladateľ (alebo ním poverený človek), nie agent; tón je zvedavý, nie predajný.

## E-maily na oslovenie (pripravené šablóny, 30. 10. 2026)

Posiela ich zakladateľ zo svojej adresy. Predmet je konkrétny, sľubuje 20 minút a poďakovanie — nie predaj.
Kalendárový odkaz vložte samostatne, nikdy nie cez skracovač.

### 1. Existujúci klient (pozvaný na rozhovor o novej funkcii)

Predmet: 20 minút o Peniazoch vopred — Vaše oči rozhodnú

Dobrý deň,

v aplikácii Vám pribudla karta „Peniaze vopred“ — čo Vám má prísť, čo odísť a či po výplate ostane
na záväzky. Postavili sme ju podľa toho, čo sme si mysleli, že podnikateľ potrebuje. Ale pravdu vieme
len od Vás.

Hľadám 20 minút tento alebo budúci týždeň. Ukážem Vám kartu, Vy mi poviete, či Vám sedí a čo jej
chýba. Žiadny predaj, žiadna prezentácia — poďakovanie za čas Vám príde v podobe jedného mesiaca
služby zadarmo.

Termín si vyberiete tu: [odkaz na kalendár]

Ďakujem a teším sa.

[meno zakladateľa], Firmony

### 2. Podnikateľ, ktorý Firmony nepoužíva (cez odporúčanie alebo komunitu)

Predmet: 20 minút, ktoré zmenia, čo čakáte od účtovníctva

Dobrý deň,

som [meno] z Firmony — online účtovnej firmy pre malé s. r. o. Staviame prehľad, ktorý podnikateľovi
povie na jednej obrazovke, koľko si môže tento mesiac vyplatiť, bez tabuliek a bez čakania na
účtovníčku.

Kým do toho investujeme ďalej, potrebujem si to overiť s ľuďmi, ktorí to riešia v skutočnej firme —
preto píšem Vám. Stačí 20 minút rozhovoru: ukážem Vám obrazovku, Vy mi poviete, či by ste ju
použili. Nič nepredávam; za Váš čas Vám pošlem poukážku [XY € / odmenu].

Termín: [odkaz na kalendár]

Ďakujem.

[meno zakladateľa], Firmony

### 3. Klient, ktorý od konkurencie odišiel

Predmet: Prečo ste menili účtovníka? 20 minút, ktoré Firmony zlepšia

Dobrý deň,

nedávno ste menili účtovnú firmu. Pre nás je to najcennejšia informácia, akú môžeme dostať: čo Vás
k zmene prinútilo a čo Vám chýbalo predtým, aj teraz.

Prosím o 20 minút rozhovoru. Žiadne presviedčanie — len počúvam, aby sme nestavali to isté, čo
Vás už raz odohnalo. Za čas Vám pošlem [XY € / odmenu].

Termín: [odkaz na kalendár]

Ďakujem.

[meno zakladateľa], Firmony

### 4. Deň pred rozhovorom (pripomienka)

Predmet: Zajtra o [čas] — 20 minút o Firmony

Dobrý deň,

len pripomínam zajtrajšie stretnutie o [čas] na [odkaz]. Nič si nepripravujte — pýtam sa ja a žiadna
odpoveď nie je zlá. Ak Vám to nevychádza, pokojne presuňte na iný čas.

Ďakujem.

[meno zakladateľa]

### 5. Po rozhovore (poďakovanie)

Predmet: Ďakujem za Vašich 20 minút

Dobrý deň,

ďakujem za rozhovor a za úprimnosť. Posielam sľúbené [odmenu]. Vaše postrehy idú priamo do toho,
čo ďalej staviame — keď bude hotové, dám Vám vedieť ako prvému/prvej.

Ďakujem.

[meno zakladateľa], Firmony

### Praktické poznámky k oslovovaniu

- Maximálne 1 pripomienka; bez odpovede na ňu kontakt nechajte tak, neotravujte tretíkrát.
- Odmena musí byť úmerná času (poukážka, mesiac zadarmo), nikdy nie podmienená pochvalou.
- Zápis robte hneď po rozhovore do šablóny z časti „Čo si zapísať“; citácie doslova.
- Z rozhovorov s cudzími ľuďmi neukladajte nič identifikujúce do aplikácie — len čísla testov.
