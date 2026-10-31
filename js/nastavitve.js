// Nastavitve igre: elementi, liki, stopnje, življenja.
// To datoteko lahko spreminjaš brez poznavanja ostale kode.
//
// Slike: ko pride prava slika, jo daj v mapo slike/ (male črke, brez šumnikov)
// in v polje "slika" vpiši pot, npr. slika: 'slike/burek.png'.
// Dokler je slika null, se pokaže emoji (začasno).

// Uradni logotip: https://www.kras.hr/source/images/svg/kras_logo-footer-red.svg
const KRAS_LOGOTIP = 'slike/kras-logo.svg';
// Za vidne napise; besedilo najprej ubežimo, da imena/napisi ne postanejo HTML.
// Metapodatki in sistemsko deljenje ostanejo navadno besedilo (ne podpirajo slik).
function napisKras(besedilo) {
  const varno = String(besedilo).replace(/[&<>"']/g, znak => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[znak]);
  return varno.replace(/(^|[^\p{L}\p{N}_])(kraš(?:u|a|em)?)(?=$|[^\p{L}\p{N}_])/giu,
    (_, pred, ime) => `${pred}<img class="kras-logo" src="${KRAS_LOGOTIP}" width="92" height="75" alt="${ime}" draggable="false">`);
}

const ELEMENTI = [
  { id: 'burek',    ime: 'Burek',    emoji: '🥧', barva: '#ff2d87', slika: 'slike/burek.svg?v=2' },
  { id: 'rakija',   ime: 'Rakija',   emoji: '🥃', barva: '#00b4ff', slika: 'slike/rakija.svg' },
  { id: 'pivo',     ime: 'Pivo',     emoji: '🍺', barva: '#8f4dff', slika: 'slike/pivo.svg' },
  { id: 'aperol',   ime: 'Aperol',   emoji: '🍹', barva: '#ff6a00', slika: 'slike/aperol.svg' },
  { id: 'utezi',    ime: 'Uteži',    emoji: '🏋️', barva: '#19d46a', slika: 'slike/utezi.svg' },  // Dora dviguje uteži
  { id: 'domacica', ime: 'Domačica', emoji: '🍪', barva: '#ffc400', slika: 'slike/domacica.svg' }, // piškoti Domačica
];

// Posebna bomba: nastane, ko poravnaš 4 ali več enakih (v vrsto ali v obliki L/T).
// Ko jo premakneš, Dora s strelami iz oči razbije svojo vrsto in vse okoli sebe.
const DORA = { ime: 'Dora', emoji: '👧', barva: '#ff8fab', slika: 'slike/dora.svg' };
// Redkejša laserska Dora: 5+ v skupini ali četrti val verige. Premor šteje le veljavne poteze.
// Na plošči je lahko samo ena; ob premiku z očmi zadene različna naključna polja.
const DORA_LASER = { ime: 'Laserska Dora', emoji: '🌀', barva: '#4df6df', slika: 'slike/dora-laser.svg',
  ujemanje: 5, veriga: 4, premor: 6, zadetki: 24, trajanje: 1800 };
// Dora na čolnu: cela postava z veslom (portret zgoraj je za ploščico)
const DORA_COLN = { ime: 'Dora', emoji: '🚣‍♀️', slika: 'slike/dora-coln.svg' };

// Proslave ob zmagi stopnje (izmenično).
const PROSLAVE = [
  { besedilo: 'Mičko dela stojo!', emoji: '🧍', animacija: 'skok', slika: 'slike/micko-stoja.svg' },
  { besedilo: 'Urbi Bog!',         emoji: '😇', animacija: 'sij',   slika: 'slike/urban-bog.svg?v=2' },
  { ime: 'Vlado Kreslin', besedilo: 'Vlado Kreslin zaigra!', emoji: '🎸', animacija: 'koncert', slika: 'slike/vlado-kreslin.svg?v=2', zvok: 'kitara' },
];

// Zemljevid: Mirt pri domu na začetku, ob hišicah se izmenjujeta Mirt in Tupko v različnih pozah.
const MIRT_POZE = [
  { ime: 'Mirt', emoji: '🧑', slika: 'slike/mirt-maha.svg' },
  { ime: 'Mirt', emoji: '🧑', slika: 'slike/mirt-medalja.svg' },
  { ime: 'Mirt', emoji: '🧑', slika: 'slike/mirt-pivo.svg' },
  { ime: 'Mirt', emoji: '🚴', slika: 'slike/mirt-kolo.svg' },
  { ime: 'Mirt', emoji: '🏋️', slika: 'slike/mirt-fitnes.svg' },
  { ime: 'Mirt', emoji: '🧑', slika: 'slike/mirt-tupko.svg' },  // se igra s Tupkom
];
const MIRT = MIRT_POZE[0];
// Ponoči se Mirt ob hišicah umiri (zamenja dnevne poze po vrsti).
const MIRT_NOC = [
  { ime: 'Mirt', emoji: '😴', slika: 'slike/mirt-spi.svg' },
  { ime: 'Mirt', emoji: '🍿', slika: 'slike/mirt-film.svg' },
  { ime: 'Mirt', emoji: '📱', slika: 'slike/mirt-telefon.svg' },
];
const TUPKO_POZE = [
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-sedi.svg' },
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-lezi.svg' },
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-hodi.svg' },
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-spi.svg' },
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-lacen.svg' }, // prazna skledica
  { ime: 'Tupko', emoji: '🐈‍⬛', slika: 'slike/tupko-skatla.svg' },
];
// Vrstni red likov ob poti (za domom): Mirt in Tupko pomešana, vsak v drugi situaciji.
const LIKI_OB_POTI = [
  MIRT_POZE[1], TUPKO_POZE[4], MIRT_POZE[3], TUPKO_POZE[1], MIRT_POZE[5], TUPKO_POZE[5],
  MIRT_POZE[4], TUPKO_POZE[2], MIRT_POZE[2], TUPKO_POZE[3], TUPKO_POZE[0],
];

// Piknik ob Grosupeljščici (med 6. in 7. stopnjo): 8 od teh 10 prijateljev, žar in balinčki.
// Vrstni red: 1 žar, 2 pivo, 3 maha, 4 meče balinček, 5 pivo, 6 aperol, 7 sedi, 8 kitara, 9 maha, 10 meče balinček
const PRIJATELJI = Array.from({ length: 10 }, (_, i) => ({ ime: 'Prijatelj', emoji: '🧑', slika: `slike/prijatelj-${String(i + 1).padStart(2, '0')}.svg` }));

// Stopnje: poteze = število potez, cilj = točke za 1 zvezdico,
// elementi = koliko različnih elementov je na plošči (manj = lažje).
// Cilji so nastavljeni s simulacijo naključnih potez (300 iger na stopnjo):
// prve stopnje reši ~90 % iger, zadnja ~30 %. Na pravih igralcih še ni preizkušeno.
const STOPNJE = [
  { poteze: 25, cilj: 2400, elementi: 4 },
  { poteze: 20, cilj: 3800, elementi: 5 },
  { poteze: 18, cilj: 4000, elementi: 5 },
  { poteze: 22, cilj: 2800, elementi: 6 },
  { poteze: 20, cilj: 2600, elementi: 6 },
  { poteze: 20, cilj: 2900, elementi: 6 },
  { poteze: 18, cilj: 2700, elementi: 6 },
  { poteze: 20, cilj: 3100, elementi: 6 },
  { poteze: 18, cilj: 2900, elementi: 6 },
  { poteze: 20, cilj: 3300, elementi: 6 },
  { poteze: 18, cilj: 3100, elementi: 6 },
  { poteze: 20, cilj: 3600, elementi: 6 },
  // 13–24: nadaljevanje (za mostom in mimo piknika)
  { poteze: 20, cilj: 3300, elementi: 6 },
  { poteze: 18, cilj: 3100, elementi: 6 },
  { poteze: 22, cilj: 3700, elementi: 6 },
  { poteze: 20, cilj: 3400, elementi: 6 },
  { poteze: 18, cilj: 3200, elementi: 6 },
  { poteze: 20, cilj: 3600, elementi: 6 },
  { poteze: 18, cilj: 3300, elementi: 6 },
  { poteze: 20, cilj: 3700, elementi: 6 },
  { poteze: 18, cilj: 3400, elementi: 6 },
  { poteze: 20, cilj: 3800, elementi: 6 },
  { poteze: 18, cilj: 3500, elementi: 6 },
  { poteze: 22, cilj: 4100, elementi: 6 },
  // 25–30: do Dorine tridesetke; cilji iz simulacije (naključne poteze zmagajo v 35–55 %, premišljene v okoli 85 %)
  { poteze: 20, cilj: 4000, elementi: 6 },
  { poteze: 18, cilj: 3800, elementi: 6 },
  { poteze: 20, cilj: 4300, elementi: 6 },
  { poteze: 18, cilj: 4000, elementi: 6 },
  { poteze: 20, cilj: 4500, elementi: 6 },
  { poteze: 30, cilj: 7000, elementi: 6 },
];

// Zvezdice: 1 ob cilju, 2 in 3 ob večkratniku cilja.
const ZVEZDICE = [1, 1.2, 1.5];

// Točke za vsako neporabljeno potezo ob zmagi.
const BONUS_ZA_POTEZO = 100;

const ZIVLJENJA = { najvec: 5, obnovaMinut: 20 };
