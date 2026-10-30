// Zasloni, zemljevid ob Grosupeljščici, življenja, shranjevanje, proslave, odštevalnik.

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');

// ---------- Igralec ----------

// Vpis je samo ime: z njim se rezultat tega telefona pokaže na skupni lestvici.
const KLJUC_IGRALCA = 'dorin-kras-igralec';
let igralec = null;
try { igralec = JSON.parse(localStorage.getItem(KLJUC_IGRALCA)); } catch (_) {}
const novId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => (b % 36).toString(36)).join('');
if (!igralec || !/^[a-z0-9]{8,32}$/.test(igralec.id || '')) igralec = { id: novId(), ime: '' };
function shraniIgralca() {
  try { localStorage.setItem(KLJUC_IGRALCA, JSON.stringify(igralec)); } catch (_) {}
}

// ---------- Shranjevanje (samo v tem brskalniku) ----------

// Vsako ime ima svoj napredek, da »Nisi ti?« novemu igralcu ne prenese tujih stopenj in točk.
// Isto poenotenje kot na strežniku: Žan = zan.
const kljucImena = ime => ime.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const KLJUC = 'dorin-kras'; // skupni napredek iz časa pred napredkom po imenih
const kljucNapredka = ime => 'dorin-kras-napredek:' + kljucImena(ime);
let napredek;

function naloziNapredek() {
  let shranjeno = null;
  try {
    if (igralec.ime) {
      shranjeno = JSON.parse(localStorage.getItem(kljucNapredka(igralec.ime)));
      // stari skupni napredek prevzame ime, ki je bilo vpisano, ko smo uvedli napredek po imenih
      if (!shranjeno && (shranjeno = JSON.parse(localStorage.getItem(KLJUC)))) {
        localStorage.setItem(kljucNapredka(igralec.ime), JSON.stringify(shranjeno));
        localStorage.removeItem(KLJUC);
      }
    }
  } catch (_) {}
  napredek = { odklenjeno: 1, zvezdice: {}, zivljenja: ZIVLJENJA.najvec, obnova: Date.now(), ...shranjeno };
  // Ko dodamo nove stopnje: kdor je rešil zadnjo staro, dobi odklenjeno naslednjo
  if (napredek.zvezdice[napredek.odklenjeno] && napredek.odklenjeno < STOPNJE.length) napredek.odklenjeno++;
}
naloziNapredek();

function shrani() {
  if (!igralec.ime) return;
  try { localStorage.setItem(kljucNapredka(igralec.ime), JSON.stringify(napredek)); } catch (_) {}
}

// ---------- Lestvica ----------

function mojRezultat() {
  const vsota = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  return { zvezdice: vsota(napredek.zvezdice), tocke: vsota(napredek.tocke), stopnja: Object.keys(napredek.zvezdice).length };
}

// Pošlje rezultat (če je ime vpisano) in vrne skupno lestvico; null, če ni povezave ali baza ni vklopljena.
// Pošlje tudi najboljše po stopnjah; strežnik vrne združen napredek z vseh telefonov in brskalnikov tega imena.
async function lestvicaStreznik() {
  try {
    const ime = igralec.ime;
    const stopnje = {};
    for (const st of Object.keys(napredek.zvezdice)) stopnje[st] = [napredek.zvezdice[st] || 0, (napredek.tocke || {})[st] || 0];
    const odgovor = ime
      ? await fetch('api/lestvica', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: igralec.id, ime, ...mojRezultat(), stopnje }) })
      : await fetch('api/lestvica');
    if (!odgovor.ok) return null;
    const podatki = await odgovor.json();
    // medtem zamenjano ime (»Nisi ti?«): odgovor ni več za tega igralca
    if (ime && igralec.ime === ime) {
      // Ime že obstaja na lestvici: od zdaj ta telefon piše v tisti vpis.
      if (podatki.jaz && podatki.jaz !== igralec.id) { igralec.id = podatki.jaz; shraniIgralca(); }
      prevzemiStopnje(podatki.stopnje);
    }
    return podatki.igralci || null;
  } catch (_) { return null; }
}

// Napredek s strežnika: po stopnjah ostane boljše, odklene se naslednja za najvišjo rešeno.
function prevzemiStopnje(stopnje) {
  if (!stopnje) return;
  napredek.tocke = napredek.tocke || {};
  let novo = false;
  for (const [st, [zv, t]] of Object.entries(stopnje)) {
    if (!(st >= 1 && st <= STOPNJE.length)) continue;
    if (zv > (napredek.zvezdice[st] || 0)) { napredek.zvezdice[st] = zv; novo = true; }
    if (t > (napredek.tocke[st] || 0)) { napredek.tocke[st] = t; novo = true; }
  }
  const najvisja = Math.max(0, ...Object.keys(napredek.zvezdice).map(Number));
  const odklenjeno = Math.min(STOPNJE.length, najvisja + 1);
  if (odklenjeno > napredek.odklenjeno) { napredek.odklenjeno = odklenjeno; novo = true; }
  if (!novo) return;
  shrani();
  osveziRezultat();
  if (document.body.dataset.zaslon === 'zemljevid') odpriZemljevid();
}

// Počaka na strežnik največ ms (slaba povezava ne sme ustaviti igre).
const najvec = (obljuba, ms) => Promise.race([obljuba, sleep(ms)]);

const varno = t => String(t).replace(/[&<>"']/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]);
const doStopnje = n => (n >= STOPNJE.length ? 'na cilju' : n ? `do ${n}. stopnje` : 'še na začetku');

let lestvicaOdkod = 'vstop';
async function odpriLestvico(odkod) {
  lestvicaOdkod = odkod;
  pokazi('lestvica');
  const seznam = $('lestvica-seznam');
  seznam.innerHTML = '<li class="nalagam"><span class="mesto">⏳</span><span class="kdo">Nalagam …</span></li>';
  $('lestvica-opomba').textContent = '';
  let igralci = await lestvicaStreznik();
  if (!igralci) {
    igralci = [{ id: igralec.id, ime: igralec.ime || 'Ti', ...mojRezultat() }];
    $('lestvica-opomba').textContent = 'Skupna lestvica se ni naložila, zato vidiš samo svoj rezultat.';
  } else if (!igralec.ime) {
    $('lestvica-opomba').textContent = 'Vpiši ime na prvem zaslonu, da se pokažeš tudi ti.';
  }
  seznam.innerHTML = igralci.map((p, i) => `
    <li class="${p.id === igralec.id ? 'jaz' : ''} ${i === 0 ? 'prvi' : ''}" style="animation-delay:${i * 70}ms">
      <span class="mesto">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
      <span class="kdo">${varno(p.ime)}${p.stopnja >= STOPNJE.length ? ' 🏁' : ''}<small>${doStopnje(p.stopnja || 0)}</small></span>
      <span class="rezultat"><b>${stevilo(p.tocke || 0)}</b><small>točk</small></span>
    </li>`).join('') || '<li><span class="mesto">🏝️</span><span class="kdo">Še nihče. Bodi prvi!</span></li>';
}

// Vstopni zaslon: vpis imena ali pozdrav
function osveziVpis() {
  $('vpis').hidden = !!igralec.ime;
  $('pozdrav').hidden = !igralec.ime;
  $('pozdrav-ime').textContent = igralec.ime;
  osveziRezultat();
}

// Seštevek (najboljši rezultat na stopnjo) na gumbu lestvice in v pozdravu na vstopu
const stevilo = n => n.toLocaleString('sl-SI');
function osveziRezultat() {
  const r = mojRezultat();
  $('pokal-rezultat').innerHTML = r.tocke ? `${stevilo(r.tocke)} <small>točk</small>` : 'Lestvica';
  $('moj-rezultat').hidden = !igralec.ime || !r.tocke;
  $('moj-rezultat').textContent = `${stevilo(r.tocke)} točk`;
}

let preverjamIme = false;
async function igraj(e) {
  if (e) e.preventDefault();
  if (igralec.ime) {
    await najvec(zacetnaSinhronizacija, 3000);
    return odpriZemljevid();
  }
  const ime = $('vpis-ime').value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!ime) {
    $('vpis').classList.remove('napaka');
    void $('vpis').offsetWidth;
    $('vpis').classList.add('napaka');
    $('vpis-ime').focus();
    return;
  }
  if (preverjamIme) return;
  // Isto ime = isti igralec. Če to ime že igra drugje, na tem telefonu pa še ne, vprašaj,
  // da se dve različni Maji ne zlijeta v eno vrstico.
  let tu = false;
  try { tu = !!localStorage.getItem(kljucNapredka(ime)); } catch (_) {}
  if (!tu) {
    preverjamIme = true;
    const igralci = await lestvicaStreznik(); // brez imena samo prebere lestvico
    preverjamIme = false;
    const obstojec = igralci && igralci.find(p => kljucImena(p.ime || '') === kljucImena(ime));
    if (obstojec) {
      okno({
        naslov: 'To ime že igra 🤔',
        besedilo: `<b>${varno(obstojec.ime)}</b> ima na lestvici že <b>${stevilo(obstojec.tocke || 0)}</b> točk.<br>Si to ti z drugega telefona?<br><small>Če nisi, dodaj začetnico priimka, npr. ${varno(obstojec.ime)} K.</small>`,
        gumbi: [
          { tekst: 'Ja, to sem jaz', akcija: () => vpisi(ime) },
          { tekst: 'Ne, drugo ime', drugotni: true, akcija: () => { $('vpis-ime').focus(); $('vpis-ime').select(); } },
        ],
      });
      return;
    }
  }
  vpisi(ime);
}

async function vpisi(ime) {
  igralec.ime = ime;
  shraniIgralca();
  naloziNapredek();
  osveziVpis();
  osveziZivljenja();
  // na novem telefonu ali brskalniku: nadaljuj tam, kjer je to ime ostalo
  await najvec(lestvicaStreznik(), 3000);
  odpriZemljevid();
}

// ---------- Življenja ----------

const OBNOVA_MS = ZIVLJENJA.obnovaMinut * 60 * 1000;

function obnoviZivljenja() {
  const zdaj = Date.now();
  if (napredek.zivljenja >= ZIVLJENJA.najvec) {
    napredek.obnova = zdaj;
    return;
  }
  while (napredek.zivljenja < ZIVLJENJA.najvec && zdaj - napredek.obnova >= OBNOVA_MS) {
    napredek.zivljenja++;
    napredek.obnova += OBNOVA_MS;
  }
  if (napredek.zivljenja >= ZIVLJENJA.najvec) napredek.obnova = zdaj;
  shrani();
}

function doNaslednjega() {
  const ms = Math.max(0, OBNOVA_MS - (Date.now() - napredek.obnova));
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function izgubiZivljenje() {
  obnoviZivljenja();
  if (napredek.zivljenja >= ZIVLJENJA.najvec) napredek.obnova = Date.now();
  napredek.zivljenja = Math.max(0, napredek.zivljenja - 1);
  shrani();
}

// V glavi je en srček s številom življenj; ko jih ni vseh, srček utripa.
const SRCE = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.6h2c.7-1.4 2.2-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z';
let prikazanaZivljenja = -1;
function osveziZivljenja() {
  obnoviZivljenja();
  if (prikazanaZivljenja === napredek.zivljenja) return;
  prikazanaZivljenja = napredek.zivljenja;
  const n = napredek.zivljenja;
  $('zivljenja').innerHTML =
    `<svg viewBox="0 0 24 24" class="${n < ZIVLJENJA.najvec ? 'prihaja' : ''}">` +
    `<path d="${SRCE}" class="${n ? 'poln' : 'prazen'}" stroke-width="1.6"/>` +
    (n ? '<ellipse cx="7.6" cy="8.6" rx="2.2" ry="1.5" fill="#fff" opacity=".75" transform="rotate(-30 7.6 8.6)"/>' : '') +
    `</svg><b>${n}</b>`;
}
function oknoZivljenj() {
  osveziZivljenja();
  const polno = napredek.zivljenja >= ZIVLJENJA.najvec;
  okno({
    naslov: 'Življenja',
    besedilo: polno ? 'Vsa življenja so polna. ❤️' : `Imaš ${napredek.zivljenja} od ${ZIVLJENJA.najvec}.<br>Naslednje čez <b>${doNaslednjega()}</b>.`,
    zapri: true,
    gumbi: [{ tekst: 'V redu' }],
  });
}
setInterval(osveziZivljenja, 1000);

// ---------- Zasloni ----------

function pokazi(ime) {
  document.querySelectorAll('.zaslon').forEach(z => z.classList.toggle('aktiven', z.id === 'zaslon-' + ime));
  document.body.dataset.zaslon = ime;
  if (ime !== 'zemljevid' && Svet3D.podprt) Svet3D.ustavi();
  Glasba.nacin(ime === 'igra' ? 'igra' : 'zemljevid');
  Glasba.napetost(0);
}

function vsebina(e) {
  if (e.slika) return `<img src="${e.slika}" alt="${e.ime || ''}" draggable="false">`;
  return e.emoji || e.ime;
}

// ---------- Okno (sporočila) ----------

function okno({ naslov, besedilo = '', zvezdice = null, gumbi, zapri = false }) {
  $('okno-zapri').hidden = !zapri;
  $('okno-naslov').textContent = naslov;
  $('okno-besedilo').innerHTML = besedilo;
  $('okno-zvezdice').innerHTML = zvezdice === null ? '' :
    [0, 1, 2].map(i => `<span class="${i < zvezdice ? 'polna' : ''}">★</span>`).join('');
  const g = $('okno-gumbi');
  g.innerHTML = '';
  gumbi.forEach(({ tekst, akcija, drugotni }) => {
    const b = document.createElement('button');
    b.textContent = tekst;
    if (drugotni) b.className = 'drugotni';
    b.addEventListener('click', () => { zapriOkno(); akcija && akcija(); });
    g.appendChild(b);
  });
  $('okno').classList.add('odprto');
}

function zapriOkno() { $('okno').classList.remove('odprto'); }

// Število, ki se prešteje navzgor
function stej(od, doN, ms, pisi) {
  const zac = performance.now();
  const korak = t => {
    const k = Math.min(1, (t - zac) / ms);
    pisi(Math.round(od + (doN - od) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(korak);
  };
  requestAnimationFrame(korak);
  setTimeout(() => pisi(doN), ms + 60); // če brskalnik animacij ne riše, vsaj končna vrednost
}

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---------- Zaslon zmage (s proslavo) ----------

let stProslave = 0;
function zaslonZmage({ st, tocke, bonus, zvezdice, zadnja }) {
  const p = PROSLAVE[stProslave++ % PROSLAVE.length];
  $('zmaga-naslov').textContent = 'Stopnja opravljena!';
  $('zmaga-zvezdice').style.display = '';
  $('zmaga-ponovi').textContent = '↻ Ponovi';
  $('zmaga-pod').textContent = p.besedilo;
  const podnapis = bonus ? `<small>bonus za poteze: ${bonus}</small>` : '';
  stej(0, tocke, 1400, n => { $('zmaga-tocke').innerHTML = `${n} točk` + podnapis; });
  if (p.zvok && typeof Zvok[p.zvok] === 'function') Zvok[p.zvok]();
  else Zvok.zmaga();
  const lik = $('zmaga-lik');
  lik.className = 'zmaga-lik ' + p.animacija;
  lik.innerHTML = `<span>${vsebina(p)}</span>`;
  [...$('zmaga-zvezdice').children].forEach((z, i) => {
    z.className = '';
    if (i < zvezdice) setTimeout(() => { z.className = 'polna'; Zvok.zvezda(i); }, 700 + i * 380);
  });
  natresiKonfete();
  $('zmaga-naprej').textContent = zadnja ? 'Na zemljevid' : 'Naprej';
  $('zmaga-naprej').onclick = () => { $('zmaga').classList.remove('odprto'); odpriZemljevid(); };
  $('zmaga-ponovi').onclick = () => { $('zmaga').classList.remove('odprto'); zacniStopnjo(st); };
  $('zmaga-deli').onclick = deliRezultat;
  $('zmaga').classList.add('odprto');
}

function natresiKonfete() {
  const barve = ['#ffd23f', '#ff4f8b', '#19b5c9', '#ffffff', '#b388ff', '#57cc99'];
  $('konfeti').innerHTML = Array.from({ length: 60 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${barve[i % barve.length]};--t:${2.5 + Math.random() * 2.5}s;--z:${-Math.random() * 4}s;--x:${(Math.random() - 0.5) * 120}px"></i>`).join('');
}

// Konec igre: prikaže se enkrat, ko čoln prepluje ciljno črto
async function zaslonCilja() {
  const igralci = await najvec(lestvicaStreznik(), 2500);
  const mesto = igralci ? igralci.findIndex(p => p.id === igralec.id) + 1 : 0;
  const r = mojRezultat();
  $('zmaga-naslov').textContent = 'Na cilju si! 🏁';
  $('zmaga-pod').textContent = 'Dora je priveslala do konca Grosupeljščice.';
  $('zmaga-lik').className = 'zmaga-lik';
  $('zmaga-lik').innerHTML = `<span>${vsebina({ slika: 'slike/dora-explora.svg', ime: 'Dora' })}</span>`;
  $('zmaga-zvezdice').style.display = 'none';
  $('zmaga-tocke').innerHTML = `${stevilo(r.tocke)} točk` + (mesto ? `<small>${mesto}. mesto na lestvici</small>` : '');
  natresiKonfete();
  Zvok.zmaga();
  const zapri = () => $('zmaga').classList.remove('odprto');
  $('zmaga-naprej').textContent = '🏆 Lestvica';
  $('zmaga-naprej').onclick = () => { zapri(); odpriLestvico('zemljevid'); };
  $('zmaga-ponovi').textContent = '🗺️ Zemljevid';
  $('zmaga-ponovi').onclick = zapri;
  $('zmaga-deli').onclick = deliRezultat;
  $('zmaga').classList.add('odprto');
}

// Izziv prijateljem: sistemsko deljenje (telefon), sicer kopiraj v odložišče
async function deliRezultat() {
  const r = mojRezultat();
  const url = location.origin + location.pathname;
  const besedilo = `Na Dorinem Krašu imam ${stevilo(r.tocke)} točk (${doStopnje(r.stopnja)}). Me premagaš? 🏆`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Dorin Kraš', text: besedilo, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(`${besedilo} ${url}`);
    okno({ naslov: 'Kopirano!', besedilo: 'Izziv je v odložišču. Prilepi ga prijateljem v klepet.', gumbi: [{ tekst: 'Super' }] });
  } catch (_) {
    okno({ naslov: 'Izzovi prijatelje', besedilo: `${besedilo}<br>${url}`, gumbi: [{ tekst: 'Zapri' }] });
  }
}

// ---------- Zemljevid ----------

const KORAK = 120, SPODAJ = 170, ZGORAJ = 70;
let prejsnjiKanu = null;

function tockaZemljevida(i, visina) {
  return { x: 50 + 28 * Math.sin(i * 1.1), y: visina - SPODAJ - i * KORAK };
}

function narisiZemljevid() {
  const n = STOPNJE.length;
  const visina = SPODAJ + n * KORAK + ZGORAJ;
  const z = $('zemljevid');
  z.style.height = visina + 'px';

  // Točke: -1 = dom, 0..n-1 = stopnje, n = zastavica
  const tocke = [];
  for (let i = -1; i <= n; i++) tocke.push(tockaZemljevida(i, visina));
  let d = `M ${tocke[0].x} ${visina} L ${tocke[0].x} ${tocke[0].y}`;
  for (let i = 1; i < tocke.length; i++) {
    const a = tocke[i - 1], b = tocke[i], sy = (a.y + b.y) / 2;
    d += ` C ${a.x} ${sy}, ${b.x} ${sy}, ${b.x} ${b.y}`;
  }
  let html = `<svg class="reka" viewBox="0 0 100 ${visina}" preserveAspectRatio="none">
    <path d="${d}" class="reka-breg"/><path d="${d}" class="reka-voda"/><path d="${d}" class="reka-tok"/></svg>`;

  const dom = tocke[0];
  html += `<div class="dom" style="left:${dom.x}%;top:${dom.y}px"><span class="hisa">🏡</span>
    <span class="lik">${vsebina(MIRT)}<small>${MIRT.ime}</small></span></div>`;
  html += `<div class="napis-reka" style="top:${dom.y + 45}px">Grosupeljščica</div>`;

  STOPNJE.forEach((_, i) => {
    const t = tocke[i + 1], st = i + 1;
    const odklenjena = st <= napredek.odklenjeno;
    const zv = napredek.zvezdice[st] || 0;
    const stran = t.x < 50 ? 1 : -1;
    html += `<button class="hisica ${odklenjena ? '' : 'zaklenjena'} ${st === napredek.odklenjeno ? 'trenutna' : ''}"
      data-st="${st}" style="left:${t.x}%;top:${t.y}px">
      <span class="hisa">🏠</span><span class="st">${odklenjena ? st : '🔒'}</span>
      <span class="zv">${[0, 1, 2].map(k => (k < zv ? '★' : '☆')).join('')}</span></button>`;
    const poza = TUPKO_POZE[i % TUPKO_POZE.length];
    html += `<div class="tupko" style="left:${t.x + stran * 22}%;top:${t.y}px">${vsebina(poza)}</div>`;
  });

  const cilj = tocke[tocke.length - 1];
  html += `<div class="zastavica" style="left:${cilj.x}%;top:${cilj.y}px">🚩</div>`;
  html += `<div class="kanu" id="kanu"><span class="dora-kanu">${vsebina(DORA)}</span>🛶</div>`;
  z.innerHTML = html;

  z.querySelectorAll('.hisica').forEach(b => b.addEventListener('click', () => {
    const st = +b.dataset.st;
    if (st <= napredek.odklenjeno) odpriPredstopnjo(st);
  }));

  // Kanu pri trenutni stopnji; po zmagi odpluje od prejšnje
  const kanu = $('kanu');
  const tr = Math.min(napredek.odklenjeno, n);
  const postaviKanu = st => {
    const t = tocke[st];
    kanu.style.left = t.x + '%';
    kanu.style.top = (t.y + 64) + 'px';
  };
  if (prejsnjiKanu && prejsnjiKanu !== tr) {
    kanu.style.transition = 'none';
    postaviKanu(prejsnjiKanu);
    void kanu.offsetWidth;
    kanu.style.transition = '';
    setTimeout(() => postaviKanu(tr), 400);
  } else {
    postaviKanu(tr);
  }
  prejsnjiKanu = tr;

  const ovoj = $('zemljevid-ovoj');
  requestAnimationFrame(() => {
    ovoj.scrollTop = tocke[tr].y - ovoj.clientHeight / 2;
  });
}

let prejsnjeOdklenjeno = null;

// Dan ali noč na zemljevidu: privzeto dan, izbira se zapomni
const KLJUC_NOCI = 'dorin-kras-noc';
let noc = false;
try { noc = localStorage.getItem(KLJUC_NOCI) === '1'; } catch (_) {}
function nastaviNoc(b) {
  noc = b;
  document.body.classList.toggle('noc', noc);
  if (Svet3D.podprt) Svet3D.nastaviNoc(noc);
}

function odpriZemljevid() {
  pokazi('zemljevid');
  osveziZivljenja();
  osveziRezultat();
  // 24. stopnja rešena: čoln enkrat prepluje cilj, potem stoji tam
  const naCilju = !!napredek.zvezdice[STOPNJE.length];
  const naCilj = naCilju && !napredek.finale;
  if (Svet3D.podprt) {
    $('zemljevid-ovoj').hidden = true;
    $('svet3d').hidden = false;
    Svet3D.prikazi($('svet3d'), {
      stStopenj: STOPNJE.length,
      odklenjeno: napredek.odklenjeno,
      zvezdice: napredek.zvezdice,
      prejsnje: prejsnjeOdklenjeno,
      naCilju,
      naCilj,
      onStopnja: odpriPredstopnjo,
      onCilj: () => {
        setTimeout(() => {
          if (document.body.dataset.zaslon !== 'zemljevid') return; // odšel med slavjem: pot se ponovi
          napredek.finale = true;
          shrani();
          zaslonCilja();
        }, 1800);
      },
      onOdklep: st => {
        Zvok.odklep();
        const b = document.createElement('div');
        b.className = 'odklenjena';
        b.textContent = `Stopnja ${st} odklenjena!`;
        $('svet3d').appendChild(b);
        setTimeout(() => b.remove(), 2100);
        setTimeout(() => { if (document.body.dataset.zaslon === 'zemljevid' && !$('okno').classList.contains('odprto')) odpriPredstopnjo(st); }, 1900);
      },
    });
  } else {
    narisiZemljevid();
    if (naCilj) {
      napredek.finale = true;
      shrani();
      zaslonCilja();
    }
  }
  prejsnjeOdklenjeno = napredek.odklenjeno;
}

// ---------- Stopnja ----------

let trenutna = null, hudTocke = 0;

// Zvezdice na traku napredka so razporejene enakomerneje kot točke (sicer bi bile stisnjene na desni);
// polnilo se med njimi raztegne tako, da zvezdica zasveti ravno, ko jo dosežeš.
const TRAK_ZVEZDE = [0.45, 0.7, 0.93];
function delezTraku(tocke, cilj) {
  const meje = [[0, 0], ...ZVEZDICE.map((m, i) => [cilj * m, TRAK_ZVEZDE[i]]), [cilj * ZVEZDICE[2] * 1.2, 1]];
  for (let i = 1; i < meje.length; i++) {
    const [t0, d0] = meje[i - 1], [t1, d1] = meje[i];
    if (tocke <= t1) return d0 + (d1 - d0) * (tocke - t0) / (t1 - t0);
  }
  return 1;
}

function odpriPredstopnjo(st) {
  const s = STOPNJE[st - 1];
  okno({
    naslov: `Stopnja ${st}`,
    besedilo: `Zberi <b>${s.cilj}</b> točk<br>v <b>${s.poteze}</b> potezah`,
    zvezdice: napredek.zvezdice[st] || 0,
    zapri: true,
    gumbi: [{ tekst: 'Igraj!', akcija: () => zacniStopnjo(st) }],
  });
}

function zacniStopnjo(st) {
  osveziZivljenja();
  if (napredek.zivljenja <= 0) {
    okno({
      naslov: 'Ni več življenj 💔',
      besedilo: `Naslednje življenje dobiš čez <b>${doNaslednjega()}</b>.<br>Lahko pa prosiš prijatelje.`,
      gumbi: [
        { tekst: 'Prosi prijatelje', akcija: prosiPrijatelje },
        { tekst: 'Zapri', drugotni: true },
      ],
    });
    return;
  }
  trenutna = st;
  const s = STOPNJE[st - 1];
  $('hud-stopnja').textContent = st;
  $('hud-cilj').textContent = s.cilj;
  pokazi('igra');
  const zvezdeHud = [...document.querySelectorAll('.napredek-zvezda')];
  zvezdeHud.forEach((z, i) => {
    z.style.left = (TRAK_ZVEZDE[i] * 100) + '%';
    z.classList.remove('dosezena');
  });
  hudTocke = 0;
  $('intro-st').textContent = `Stopnja ${st}`;
  $('intro-cilj').textContent = `Zberi ${s.cilj} točk v ${s.poteze} potezah`;
  $('intro').classList.remove('tece');
  void $('intro').offsetWidth;
  $('intro').classList.add('tece');
  Plosca.zacni(s, {
    tocke: n => {
      if (n > hudTocke) { stej(hudTocke, n, 450, v => { $('hud-tocke').textContent = v; }); bump($('hud-tocke')); }
      else $('hud-tocke').textContent = n;
      hudTocke = n;
      $('napredek-polnilo').style.width = delezTraku(n, s.cilj) * 100 + '%';
      zvezdeHud.forEach((z, i) => {
        if (n >= s.cilj * ZVEZDICE[i] && !z.classList.contains('dosezena')) {
          z.classList.add('dosezena');
          Zvok.zvezda(i);
        }
      });
    },
    poteze: n => {
      $('hud-poteze').textContent = n;
      $('hud-poteze').parentElement.classList.toggle('malo', n <= 5);
      if (n === 5 && n < s.poteze) Plosca.napis('Še 5 potez!', 'vroce');
      Glasba.napetost(n <= 5 ? 1 : 0);
      bump($('hud-poteze'));
    },
    konec: zmaga => (zmaga ? zmagal(st) : izgubil(st)),
  });
}

async function zmagal(st) {
  const s = STOPNJE[st - 1];
  const stanje = Plosca.stanje();
  const bonus = stanje.poteze * BONUS_ZA_POTEZO;
  const tocke = stanje.tocke + bonus;
  $('hud-tocke').textContent = tocke;
  const zv = ZVEZDICE.filter(m => tocke >= s.cilj * m).length;
  napredek.zvezdice[st] = Math.max(napredek.zvezdice[st] || 0, zv);
  napredek.tocke = napredek.tocke || {};
  napredek.tocke[st] = Math.max(napredek.tocke[st] || 0, tocke);
  if (st >= napredek.odklenjeno && st < STOPNJE.length) napredek.odklenjeno = st + 1;
  shrani();
  lestvicaStreznik();
  // »Dorin kraš!«: preostale poteze se razstrelijo za bonus
  const poteze = stanje.poteze, osnova = stanje.tocke;
  await sleep(400);
  await Plosca.finale(i => {
    $('hud-poteze').textContent = poteze - i;
    const n = osnova + i * BONUS_ZA_POTEZO;
    $('hud-tocke').textContent = n;
    bump($('hud-tocke'));
    $('napredek-polnilo').style.width = delezTraku(n, s.cilj) * 100 + '%';
    document.querySelectorAll('.napredek-zvezda').forEach((z, k) => {
      if (n >= s.cilj * ZVEZDICE[k] && !z.classList.contains('dosezena')) { z.classList.add('dosezena'); Zvok.zvezda(k); }
    });
  });
  $('hud-tocke').textContent = tocke;
  await sleep(300);
  zaslonZmage({ st, tocke, bonus, zvezdice: zv, zadnja: st === STOPNJE.length });
}

function izgubil(st) {
  const s = STOPNJE[st - 1];
  izgubiZivljenje();
  Zvok.poraz();
  const manjka = s.cilj - Plosca.stanje().tocke;
  okno({
    naslov: 'Zmanjkalo je potez',
    besedilo: `Manjkalo je še ${manjka} točk.<br>Življenja: ${napredek.zivljenja} ❤️`,
    gumbi: [
      { tekst: 'Poskusi znova', akcija: () => zacniStopnjo(st) },
      { tekst: 'Zemljevid', drugotni: true, akcija: odpriZemljevid },
    ],
  });
}

function zapustiStopnjo() {
  const stanje = Plosca.stanje();
  const s = STOPNJE[trenutna - 1];
  if (!stanje || stanje.konec || stanje.poteze === s.poteze) {
    Plosca.ustavi();
    odpriZemljevid();
    return;
  }
  okno({
    naslov: 'Zapustiš stopnjo?',
    besedilo: 'Izgubiš eno življenje.',
    gumbi: [
      { tekst: 'Igraj naprej' },
      { tekst: 'Zapusti', drugotni: true, akcija: () => { Plosca.ustavi(); izgubiZivljenje(); odpriZemljevid(); } },
    ],
  });
}

async function prosiPrijatelje() {
  const podatki = { title: 'Dorin Kraš', text: 'Pošlji mi življenje v Dorinem Krašu! ❤️', url: location.href };
  try {
    if (navigator.share) await navigator.share(podatki);
    else await navigator.clipboard.writeText(`${podatki.text} ${podatki.url}`);
  } catch (_) {}
}

// ---------- Odštevalnik na vstopnem zaslonu ----------

// Sobota, 31. oktober 2026, ob 18:00 (lokalni čas)
const BIRTHDAY = new Date(2026, 9, 31, 18, 0, 0);
// Začetek odštevanja: torek, 27. oktober 2026, ob 20:49
const START = new Date(2026, 9, 27, 20, 49, 0);

function tick() {
  const left = BIRTHDAY - Date.now();
  if (left <= 0) {
    document.body.classList.add('done');
    return;
  }
  const sec = Math.floor(left / 1000);
  $('d').textContent = Math.floor(sec / 86400);
  $('h').textContent = pad(Math.floor(sec / 3600) % 24);
  $('m').textContent = pad(Math.floor(sec / 60) % 60);
  $('s').textContent = pad(sec % 60);
  const done = Math.min(1, Math.max(0, (Date.now() - START) / (BIRTHDAY - START)));
  $('bar').style.width = (done * 100).toFixed(2) + '%';
  setTimeout(tick, 1000 - (Date.now() % 1000));
}

// ---------- Zagon ----------

tick();

// Na vstopnem zaslonu padajo stvari iz igre
// na vstopnem zaslonu padajo samo hrana in pijača
const PADAJOCE = ['slike/burek.svg?v=2', 'slike/rakija.svg', 'slike/pivo.svg', 'slike/aperol.svg', 'slike/domacica.svg'];
const sky = $('sky');
for (let i = 0; i < 18; i++) {
  const d = document.createElement('div');
  d.className = 'drop';
  d.style.left = Math.random() * 100 + 'vw';
  d.style.setProperty('--s', 40 + Math.random() * 26 + 'px');
  d.style.setProperty('--d', 6 + Math.random() * 8 + 's');
  d.style.setProperty('--delay', -Math.random() * 14 + 's');
  d.innerHTML = `<img src="${PADAJOCE[i % PADAJOCE.length]}" alt="">`;
  sky.appendChild(d);
}

Plosca.init($('plosca'), $('plosca-ovoj'));
$('play').addEventListener('click', igraj);
$('vpis').addEventListener('submit', igraj);
$('nisem-jaz').addEventListener('click', () => { igralec = { id: novId(), ime: '' }; shraniIgralca(); naloziNapredek(); osveziZivljenja(); osveziVpis(); $('vpis-ime').value = ''; $('vpis-ime').focus(); });
$('odpri-lestvico').addEventListener('click', () => odpriLestvico('vstop'));

// Domači zaslon: Android/Chrome ponudi namestitev z enim klikom, iPhone pokaže navodila (Apple gumba ne dovoli)
let namestitev = null;
const zeNamescena = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
$('na-domaci').hidden = zeNamescena() || !matchMedia('(pointer: coarse)').matches;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); namestitev = e; $('na-domaci').hidden = zeNamescena(); });
window.addEventListener('appinstalled', () => { $('na-domaci').hidden = true; namestitev = null; });
$('na-domaci').addEventListener('click', async () => {
  if (namestitev) {
    namestitev.prompt();
    const { outcome } = await namestitev.userChoice;
    if (outcome === 'accepted') $('na-domaci').hidden = true;
    namestitev = null;
    return;
  }
  okno({
    naslov: 'Na domači zaslon',
    zapri: true,
    besedilo: iPhone
      ? '1. Spodaj v Safariju tapni gumb Deli (kvadratek s puščico ⬆️).<br>2. Izberi »Dodaj na začetni zaslon«.<br>3. Tapni »Dodaj«. ' + napisKras('Dorin Kraš') + ' bo med aplikacijami.'
      : '1. Zgoraj desno v brskalniku tapni ⋮ (meni).<br>2. Izberi »Dodaj na začetni zaslon« ali »Namesti aplikacijo«.<br>3. Potrdi. ' + napisKras('Dorin Kraš') + ' bo med aplikacijami.',
    gumbi: [{ tekst: 'Razumem' }],
  });
});
$('pokal').addEventListener('click', () => odpriLestvico('zemljevid'));
$('dan-noc').addEventListener('click', () => {
  nastaviNoc(!noc);
  try { localStorage.setItem(KLJUC_NOCI, noc ? '1' : '0'); } catch (_) {}
});
nastaviNoc(noc);
$('nazaj-lestvica').addEventListener('click', () => (lestvicaOdkod === 'zemljevid' ? odpriZemljevid() : pokazi('vstop')));
osveziVpis();
$('nazaj-zemljevid').addEventListener('click', zapustiStopnjo);
$('okno-zapri').addEventListener('click', zapriOkno);
$('zivljenja').addEventListener('click', oknoZivljenj);
// Zvok: okno z dvema stikaloma (glasba, zvočni učinki)
function ikonaZvoka() { $('zvok').textContent = Zvok.vklopljen || Glasba.vklopljena ? '🔊' : '🔇'; }
function oknoZvoka() {
  const kaj = Glasba.vklopljena || Zvok.vklopljen;
  okno({
    naslov: 'Zvok',
    zapri: true,
    besedilo: `Glasba je ${Glasba.vklopljena ? 'vklopljena' : 'izklopljena'}, zvoki so ${Zvok.vklopljen ? 'vklopljeni' : 'izklopljeni'}.`,
    gumbi: [
      { tekst: kaj ? '🔇 Utišaj vse' : '🔊 Vklopi vse', akcija: () => { Glasba.nastavi(!kaj); Zvok.nastavi(!kaj); ikonaZvoka(); } },
      { tekst: Glasba.vklopljena ? '🎵 Izklopi glasbo' : '🎵 Vklopi glasbo', drugotni: true, akcija: () => { Glasba.nastavi(!Glasba.vklopljena); ikonaZvoka(); oknoZvoka(); } },
      { tekst: Zvok.vklopljen ? '🔔 Izklopi zvoke' : '🔔 Vklopi zvoke', drugotni: true, akcija: () => { Zvok.nastavi(!Zvok.vklopljen); ikonaZvoka(); oknoZvoka(); } },
    ],
  });
}
ikonaZvoka();
$('zvok').addEventListener('click', oknoZvoka);
document.addEventListener('click', e => { if (e.target.closest('button') && e.target.id !== 'zvok') Zvok.klik(); });
osveziZivljenja();
// ob odprtju: prevzemi napredek, ki ga je to ime naredilo drugje
const zacetnaSinhronizacija = igralec.ime ? lestvicaStreznik() : Promise.resolve();
