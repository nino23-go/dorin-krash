# Dorin Kraš 🛶

Dorin Candy Crush, za njen rojstni dan (sobota, 31. 10. 2026, ob 18:00). Načrt igre je v `NACRT.md`, navodila za AI agente v `AGENTS.md`.

**V živo:** https://dorin-krash.vercel.app (Vercel projekt `dorin-krash`, objavlja se z veje `main`)

## Trenutno stanje (29. 10. 2026 zvečer)

Igra je v živo in deluje od začetka do konca. Različica v repozitoriju: `?v=68` v `index.html`.

**Narejeno**

- **Znamka:** uradni [rdeči logotip Kraš](https://www.kras.hr/source/images/svg/kras_logo-footer-red.svg), shranjen v `slike/kras-logo.svg`, se uporablja v naslovu, napisih kombinacij/finala in navodilih za namestitev. V besedilnih metapodatkih in sistemskem deljenju ostane berljivo ime igre.
- **Vstop:** odštevalnik do sobote, vpis z imenom, gumb za namestitev na domači zaslon (PWA).
- **Igra:**
  - 24 stopenj, 6 elementov (burek, rakija, pivo, aperol, uteži, domačica) in življenja (5, +1 vsakih 20 minut);
  - Dorina bomba: začetna bomba na vsaki stopnji in nova iz verige 3+; ob eksploziji laserji v križ, udarni val in napis BUM;
  - **Laserska Dora:** skupina 5+ ali četrti val verige ustvari turkizen žeton namesto ene navadne bombe. Med pojavoma mora miniti 6 veljavnih potez, na plošči je lahko samo ena; premor se začne znova ob novi stopnji. Val, ki sproža posebne žetone, ne ustvari laserske Dore. Ob premiku se zavrti za 360° in s pari prožnih očesnih žarkov zadene 24 različnih naključnih polj; zadete bombe se sprožijo verižno. Pravila in trajanje so v `DORA_LASER` v `js/nastavitve.js`.
  - tri proslave v krogu: Mičko (stoja), Urbi Bog (sončna očala, verižica, palec gor) in Vlado Kreslin (lastna SVG-ilustracija s klobukom in črno kitaro, brenkanje, lebdeče note in lasten sintetiziran kitarski motiv).
- **Zaslon zmage:** zvezdice, točke ter gumbi Naprej, Ponovi in Izzovi (deljenje rezultata).
- **3D zemljevid:** vrteč se svet ob Grosupeljščici, Dora v čolnu, Mirt in Tupko v pozah.
  - Podnevi: piknik in gora s ferato, po kateri hodijo Dora, Mirt in prijatelja.
  - Ponoči: rave, ogenj s kolegi in osvetljen joga studio z gongom.
  - Na cilju balonski lok s tablo CILJ, šahovnica čez potok in navijači s transparentoma »IDE DORAA!« in »SAM GASSS!«; ponoči lok žari, lučke tečejo, reflektorja in ognjemet.
  - Če WebGL ne dela, se pokaže 2D zemljevid.
- **Glasba in zvok:** generativna, mehka in igriva glasba ter sintetizirani zvoki brez datotek. Na iPhonu se sliši tudi, ko je vklopljen tihi način.
- **Skupna lestvica:**
  - deluje v živo, prikazuje samo točke (zvezdice so samo v igri);
  - vsako ime je na lestvici samo enkrat: isto ime z drugega telefona piše v obstoječi vpis in ostane boljši rezultat;
  - če vpisano ime že igra drugje, igra vpraša »Si to ti?« (dve Maji naj dodata začetnico priimka);
  - napredek na telefonu je ločen po imenih: »Nisi ti?« novemu igralcu ne prenese tujih stopenj in točk.
- **Predogled povezave:** Messenger/WhatsApp pokažeta sličico `slike/deli.png` z naslovom in vabilom (oznake `og:` v `index.html`, slika iz `Fotke/_skripte/deli.py`).

**Ni preverjeno na pravem telefonu:** zvok na iPhonu, gladkost eksplozij, gong v joga studiu, prvi vpis na lestvico z združevanjem imen.

**Odprto (ni dogovorjeno, da gre v igro):** prijava z Google računom, življenja od prijateljev, glasba Magnifico/Kreslin.

## Pomembno: tega ne spreminjaj

- **Podatki lestvice** so v Upstash Redis (Vercel → Storage, povezano s projektom `dorin-krash`). Ključev `dorin-kras:lestvica`, `dorin-kras:igralci` in `dorin-kras:imena` v `api/lestvica.js` ne preimenuj in jih ne briši: v njih so pravi rezultati, ki morajo preživeti vsako posodobitev.
- **Ključi baze** so samo v okolju Vercela, nikoli v repoju ali pogovoru.
- **Mapa `Fotke/`** ima prave fotografije in pomožne skripte. Je v `.gitignore` in **ne sme v repo** (repo je javen).

## Kako zaženeš pri sebi

Nič ni treba nameščati. Dvakrat klikni `index.html` ali zaženi `python3 -m http.server 8765` in odpri http://localhost:8765. Lestvica lokalno ne deluje (rabi Vercel), igra pa pokaže tvoj rezultat.

Preizkusi pravil posebnih žetonov (Node.js, brez paketov): `node --test tests/plosca.test.cjs`. Preverijo pojav ob ujemanju/verigi, premor, 24 različnih zadetkov, verižne eksplozije, točkovanje in prekinitev animacije.

## Kako sodelujemo

**Vsak push na `main` gre takoj v živo.** To stran vidi Dora.

1. Preden začneš: `git pull`. Dogovorimo se, kdo ureja katero datoteko: dva hkrati v isti datoteki pomenita konflikt.
2. Preden pushaš: stran preizkusi pri sebi v telefonskem pogledu brskalnika, brez napak v konzoli.
3. **Pushaj samo na `main` in redko.** Vercel na brezplačnem paketu dovoli 100 objav na dan; ko je limit dosežen, se nič ne objavi do naslednjega dne. Več popravkov združi v en commit in en push. Veje `igra` ne uporabljamo več (je zastarela).
4. Ko spremeniš JS ali CSS, v `index.html` povečaj `?v=N` (pri vseh 7 pojavitvah), da telefoni ne kažejo stare različice iz predpomnilnika.

## Pravila za kodo

- Brez gradnje (build): navaden HTML, CSS in JavaScript
- Stran mora delovati na telefonu
- Besedila v igri so v slovenščini
