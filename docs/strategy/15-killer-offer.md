# Prelomová ponuka (killer offer) a Claude API — 22. 10. 2026

Pokyn Christiana: psychológia nie je len dizajn, ale najmä **ponuka**. Chce, aby Firmony mala taký
„hook" ako Trading 212 (1,5 % cashback na každý nákup, automatické investovanie z karty), Revolut
(výhodná výmena mien) alebo Robinhood (nulové poplatky + free akcia). Zákazník má mať dôvod ostať
a používať Firmony na všetko, pretože „krásne to zafungovalo" a inde to nemá. Toto je realizačný podklad.
Nejde o nový slogan, ceny ani sľub záruky.

## Prečo cashback T212 funguje (a čo je jeho účtovný ekvivalent)

| Hook | Ako funguje | Účtovný ekvivalent vo Firmony |
| --- | --- | --- |
| Trading 212: 1,5 % späť z každého nákupu | Priebežne, hmatateľne, „dostávate peniaze za to, že to používate" | **Automatizácia sa vracia:** kredit za každý doklad, ktorý systém prečíta a zaúčtuje sám |
| Revolut: výhodná výmena mien | Na každej transakcii ušetríte | **Úspora na každom úkone:** menej ručnej práce, menej času, menej papierov |
| Robinhood: nulové poplatky + free akcia na štart | Lacnejší vstup + darček | **Zadarmo nástroje + prechod zadarmo + vstupný kredit** |

Princíp: výhoda musí byť **priebežná a hmatateľná**, nie jednorazová zľava.

## Tri piliere ponuky

### P1 — „Automatizácia sa vracia" (cashback za automatizáciu)

Východisko z kódu (`src/config.ts`, `ACCOUNTANT_RATES`): účtovníčka je platená za vykonanú prácu,
napríklad 0,50 € za doklad, s ktorým pracovala. Doklad, ktorý systém zaúčtuje sám, jej prácu nestojí —
marža rastie s tým, ako sa čítanie zlepšuje.

Návrh: **časť tejto ušetrenej práce vrátiť klientovi ako kredit** — „za každý automaticky spracovaný
doklad dostanete späť". Je to presný analóg cashbacku T212: klient je motivovaný používať automatizáciu
a vidí, že sa mu to vracia.

Podmienky (bez nich nespúšťať):
- Zmerať skutočný podiel automaticky zaúčtovaných dokladov, nie predpokladať.
- Stanoviť výšku kreditu a mesačný strop tak, aby ostala plánovaná marža (pozri `docs/strategy/07-unit-economics-framework.md`).
- Kredit viazať na vykonaný automatický úkon, nie sľubovať peniaze za nič.
- Žiadny falošný „cashback" z peňazí, ktoré klientovi nepatria.

### P2 — „Prechod, ktorý sa oplatí" (bundle)

- Prevzatie od inej účtovníčky zadarmo a „stačí odkliknúť, my vybavíme" — **implementované** (G1, `/app/prechod`).
- Vstupný kredit (100 €) — **čaká na rozhodnutie majiteľa** (suma, komu, na čo; docs 13: spustiť až s meraním CAC/príspevku).
- Založenie SRO zadarmo viazané na účtovníctvo — **čaká na právne posúdenie** (docs 13, L2–L4).

### P3 — „Peniaze späť" a zadarmo nástroje

- Preplatky a vratky daní počíta engine už dnes (závierka, DPH). Urobiť z toho **trvalý, viditeľný výstup**
  „máte nárok na X" je dôvera aj výhoda.
- Zadarmo nástroje, ktoré inde platíte: faktúra v PDF, mzdová kalkulačka, porovnanie nákladov — **implementované**.

## Claude API pre všetky témy (pripraviť, nezapnúť hneď)

Asistent dnes volá Claude API (Anthropic Haiku 5.5) **iba na zatriedenie témy**; odpoveď skladá Firmony
z oprávnených údajov (`src/assistant/provider.ts`, `context.ts`). Cieľ majiteľa: Claude má neskôr
odpovedať na **všetky témy**.

Príprava (bez zmeny bezpečnosti, kým sa nerozhodne):
1. Provider rozšíriť o funkciu, ktorá vráti vygenerovanú odpoveď, **nie iba tému**.
2. Model dostane iba oprávnené údaje k danej téme (prehľad/termíny/doklad/cena), **nie celú firmu**.
3. Pevné hranice odpovede: žiadne generované daňové/právne rady, platby, podpisy, podania, zmeny knihy;
   zdroje len z odovzdaných údajov; žiadne vymyslené čísla.
4. Ostať pri existujúcich limitoch 12/40/200, UUID, vypínači a metadátach bez ukladania chatu.
5. `expert` téma ostáva odovzdaná účtovníčke (ľudská cesta), kým sa rozsah nepotvrdí.

## Čo je postavené vs. čo treba

| Položka | Stav |
| --- | --- |
| Zadarmo faktúra, mzda, porovnanie | ✅ live |
| Spravovaný prechod G1 | ✅ live |
| AI asistent (triedenie tém cez Claude) | ✅ live |
| Claude odpovede na všetky témy | pripraviť (hore), potom rozhodnutie |
| Cashback za automatizáciu (P1) | návrh + meranie + strop |
| Vstupný kredit, založenie SRO | rozhodnutie majiteľa / právo |

## Rozhodnutia pre majiteľa

1. Cashback P1: áno/nie, a ak áno, koľko späť a aký strop.
2. Kredit: suma a pravidlá.
3. Claude na všetky témy: hneď pripraviť kód, alebo zatiaľ iba plán.

Žiadna z týchto ponúk nepotvrdzuje miliardovú hodnotu ani zaručený rast; každá sa spúšťa s meraním
(náklad na získanie, príspevok, retencia) podľa `docs/strategy/07-unit-economics-framework.md`.
