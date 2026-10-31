# Dorin Kraš — načrt igre

**Dorin Kraš** je Dorin Candy Crush. Mehanika ostane ista: menjaš sosednja elementa, trije ali več enakih v vrsto izginejo. Namesto bonbonov so Dorini elementi, namesto poti med stopnjami je potoček **Grosupeljščica**, po katerem Dora vesla s kanujem.

Vir: zapiski sestanka (2 strani v zvezku) in odločitve z dne 28. 10. 2026.

## Vsebina igre — potrjeno

Zemljevid, življenja, mehanika, stopnje s proslavami, dizajn in logo.

Dizajn: sijoč, risankast 3D videz, kot je značilen za ta žanr, z rečno in travniško temo (turkizna, koralna, rumena). Logo in grafika sta lastna (ne posnemata logotipa ali grafike Candy Crusha).

- 3D zemljevid: svet je vrteč se valj, potok Grosupeljščica z animirano vodo, peno in lokvanji, hišice, drevesa, Dora vesla v čolnu od stopnje do stopnje.
- Okno pred stopnjo (cilj, poteze, zvezdice, »Igraj!«), zaslon zmage z zvezdicami, konfeti in proslavo.

## Ogrodje (scaffold)

- [x] Spletna aplikacija (Vercel: https://dorin-krash.vercel.app)
- [x] Skupni repo → `AGENTS.md`
- [x] Osnovna igra (base game)
- [x] Zemljevid stopenj (level roadmap): 3D Grosupeljščica, Dora na kanuju, 30 stopenj
- [x] Življenja → zavzetost + ura (5 življenj, +1 vsakih 20 minut)
- [x] Prijava (sign-up): samo vpis imena, brez gesla
- [x] Lestvica najboljših (leaderboard): Upstash Redis prek Vercela, samo točke, eno ime = en vpis
- [x] Možnost namestitve na telefon (PWA: ikona na domačem zaslonu)

**Dodatno:** prijava z Google računom

## Elementi (kuglce) — potrjeno

1. burek
2. rakija
3. pivo
4. aperol
5. uteži
6. domačica (piškoti)

## Posebna bomba — potrjeno

- **Slika Dore**, ki strelja strele iz oči. Sproži se kot bomba in razbije elemente okoli sebe.

## Proslave (celebrations) — potrjeno

- **Mičko dela stojo**
- **Urbi bog**

## Zemljevid ob Grosupeljščici — potrjeno

- Potoček se vije navzgor, ob njem hišice (stopnje), na vrhu zastavica. Dora vesla s kanujem od hišice do hišice.
- **Na začetku:** Mirt pri domu.
- **Pri naslednjih hišicah (stopnjah):** Tupko (maček) v različnih pozah.
- »Ilustrativno« (ročno narisan videz)
- Animacija za vrtenje (?)
- Podnaslov / šala: **Dora Explora**

## Življenja (lajfi)

- Ko jih zmanjka, prosiš prijatelje (gumb deli povezavo; življenja od prijateljev še ne dobiš, za to rabimo strežnik)

## Glasba

- Magnifico
- Vlado Kreslin
- Predlog: gumb za glasbo z vdelanim YouTube predvajalnikom uradnih posnetkov (pesmi niso shranjene v repoju)

## Iz zapiskov, zaenkrat ne gre v igro

faca, tupko kot element (je zdaj na zemljevidu), VLADO!, Liši, Pom (bombo je prevzela Dora)

## Odprta vprašanja

- Kdo pripravi slike: 6 elementov, Dora (bomba), Mičko, Urbi, Mirt, Tupko v pozah, Dora na kanuju?
- Kaj mora biti narejeno do sobote, 31. 10., ob 18:00?
- ~~Prijava in lestvica potrebujeta strežnik in bazo.~~ Rešeno 29. 10.: vpis z imenom in lestvica v Upstash Redis.
