// 3D zemljevid: vrteči se svet s potokom Grosupeljščica, hišicami (stopnjami) in Doro na čolnu.
// Uporablja three.js r128 s CDN. Če WebGL ali three.js ni na voljo, aplikacija pokaže 2D zemljevid.
//
// Svet je valj, ki leži vodoravno (os X). Stopnje so razporejene po kotu okoli osi;
// ko svet zavrtiš, naslednje stopnje pridejo izza obzorja.

const Svet3D = (() => {
  const R = 60;           // polmer sveta
  const KORAK = 0.125;    // kot med stopnjama (dovolj prostora, da je trenutna stopnja jasna)
  const SIRINA = 4.2;     // širina potoka
  const ODMIK_HISE = SIRINA / 2 + 2.6;

  const podprt = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(window.THREE && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (_) { return false; }
  })();

  let ovoj, renderer, scene, camera, svet, tla, vodaMat, kanu, doraNaColnu, sonce;
  let oznake = [], cilj = null;
  let n = 0, odklenjeno = 1, zvezdice = {}, onStopnja = () => {};
  let kot = 0, ciljKot = 0, hitrost = 0, tece = false, zankaTece = false, zadnji = 0, cas = 0;
  let kanuKot = 0, kanuOd = 0, kanuDo = 0;
  const ZA_CRTO = 0.04; // čoln na cilju stoji za lokom, da ga tabla ne zakrije
  // Potovanje čolna po zmagi: t < 0 čaka, 0..TRAJANJE pluje, nato odklep (ali slavje, če pluje čez cilj)
  const TRAJANJE = 3.4;
  let potovanje = null, prikazano = 1, onOdklep = () => {}, onCilj = () => {}, odklep = null, razdalja = 40;
  let liki = [], delci = [], teksturaKroga, teksturaZvezde, napisPlatno, napisTekstura, brazdaCas = 0;
  let zar = null, dimCas = 0, balin = null, valovi = [];
  // Ovire: [th, x, pol dolžine vzdolž potoka, pol širine] v enotah; hiše, liki in prigode se jim izognejo
  let ovire = [], kotSence = -1;
  const vOviri = (th, x, r = 0) => ovire.some(([t, xx, a, b]) => Math.abs((th - t) * R) < a + r && Math.abs(x - xx) < b + r);
  // Prigode ob poti (naključno razporejene) in Tupkovi »mjav«
  let race = [], sprehod = null, joga = null, baloni = [], ogenj = null, gugalnica = null, lucMat = null, tupki = [], oblacek = null, mjavCas = 3;
  // Dan in noč
  let noc = false, mirtovi = [], hemi, oknoMat, luc, dnevni, nocni, metulji = [], oci = [], kresnice = [], temni = [];
  let vlece = false, zacY = 0, zacKot = 0, zadnjiY = 0, premaknil = 0;

  // 0 = dom, 1..n = stopnje, n+1 = cilj; za mostom je malo več prostora
  const MOST = 8.42, PIKNIK = 6.5;
  const kotStopnje = st => (st + (st > MOST ? 1.2 : 0)) * KORAK;
  const xNa = th => 2.6 * Math.sin(th * 9.5);
  // Most čez potok (med stopnjama 8 in 9) in jasa s piknikom (okoli stopnje 5).
  const stranPiknika = () => (xNa(kotStopnje(PIKNIK)) > 0 ? -1 : 1); // stran z več prostora
  const vPikniku = st => Math.abs(st - PIKNIK) <= 1.4;
  // ob pikniku so hišice na drugem bregu
  const stranHise = st => (vPikniku(st) ? -stranPiknika() : (st % 2 ? 1 : -1));

  // ---------- Geometrija na površju valja ----------

  function tocka(th, x, r = R) { return new THREE.Vector3(x, r * Math.cos(th), -r * Math.sin(th)); }
  function normala(th) { return new THREE.Vector3(0, Math.cos(th), -Math.sin(th)); }

  function postavi(obj, th, x, r = R) {
    obj.position.copy(tocka(th, x, r));
    const Y = normala(th);
    const Z = new THREE.Vector3(0, Math.sin(th), Math.cos(th));
    const X = new THREE.Vector3().crossVectors(Y, Z);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }

  // Postavi predmet na potok, obrnjen v smeri toka
  function postaviNaPotok(obj, th, r, x = xNa(th)) {
    const e = 0.001;
    const c = tocka(th, x, r);
    const Y = normala(th);
    const T = tocka(th + e, xNa(th + e), r).sub(tocka(th - e, xNa(th - e), r)).normalize();
    const Z = T.negate();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y).normalize();
    obj.position.copy(c);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }

  // Trak vzdolž potoka (voda, breg)
  function trak(sirina, r, od, doKota, korakov) {
    const poz = [], uv = [], ind = [];
    let dolzina = 0, prej = null;
    for (let i = 0; i <= korakov; i++) {
      const th = od + (doKota - od) * i / korakov;
      const c = tocka(th, xNa(th), r);
      if (prej) dolzina += c.distanceTo(prej);
      prej = c.clone();
      const t = tocka(th + 0.0005, xNa(th + 0.0005), r).sub(tocka(th - 0.0005, xNa(th - 0.0005), r)).normalize();
      const s = new THREE.Vector3().crossVectors(t, normala(th)).normalize().multiplyScalar(sirina / 2);
      const L = c.clone().sub(s), D = c.clone().add(s);
      poz.push(L.x, L.y, L.z, D.x, D.y, D.z);
      uv.push(0, dolzina / sirina, 1, dolzina / sirina);
      if (i < korakov) { const a = i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ind);
    g.computeVertexNormals();
    return g;
  }

  // ---------- Teksture iz emojijev in napisov ----------

  const teksture_ = {};
  function teksturaLika(e, velikost = 128) {
    if (e.slika) return teksture_[e.slika] || (teksture_[e.slika] = new THREE.TextureLoader().load(e.slika));
    const c = document.createElement('canvas');
    c.width = c.height = velikost;
    const g = c.getContext('2d');
    g.font = `${velikost * 0.78}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e.emoji || e.ime, velikost / 2, velikost * 0.56);
    return new THREE.CanvasTexture(c);
  }

  function lik(e, velikost) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaLika(e), transparent: true }));
    s.scale.set(velikost, velikost, 1);
    return s;
  }

  function narisiOznako(c, st) {
    const g = c.getContext('2d');
    const zaklenjena = st > prikazano;
    const zv = zvezdice[st] || 0;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (zaklenjena) {
      g.font = '70px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      g.fillText('🔒', 128, 110);
    } else {
      g.font = '800 110px "Baloo 2", system-ui, sans-serif';
      g.lineWidth = 16;
      g.strokeStyle = '#7a1f45';
      g.strokeText(st, 128, 105);
      g.fillStyle = '#fff';
      g.fillText(st, 128, 105);
      g.font = '58px system-ui, sans-serif';
      for (let k = 0; k < 3; k++) {
        const x = 68 + k * 60;
        g.lineWidth = 8;
        g.strokeStyle = '#7a4a00';
        g.strokeText('★', x, 200);
        g.fillStyle = k < zv ? '#ffd23f' : 'rgba(255,255,255,.55)';
        g.fillText('★', x, 200);
      }
    }
  }

  // ---------- Napis reke: diskretno na vodi, v smeri toka ----------

  function narisiNapisReke() {
    const g = napisPlatno.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, napisPlatno.width, napisPlatno.height);
    g.translate(napisPlatno.width / 2, napisPlatno.height / 2);
    g.rotate(-Math.PI / 2);
    g.font = '800 84px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const sirina = g.measureText('Grosupeljščica').width;
    const meja = napisPlatno.height * 0.94;
    if (sirina > meja) g.scale(meja / sirina, 1);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillText('Grosupeljščica', 0, 4);
    napisTekstura.needsUpdate = true;
  }

  function napisReke(od, doKota) {
    napisPlatno = document.createElement('canvas');
    napisPlatno.width = 128;
    napisPlatno.height = 1024;
    napisTekstura = new THREE.CanvasTexture(napisPlatno);
    const geo = trak(SIRINA * 0.6, R + 0.1, od, doKota, 60);
    const uv = geo.attributes.uv, dolzina = uv.getY(uv.count - 1);
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / dolzina);
    svet.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: napisTekstura, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    narisiNapisReke();
  }

  // ---------- Delci: konfeti, iskre, brazda za čolnom ----------

  function teksture() {
    const krog = document.createElement('canvas');
    krog.width = krog.height = 64;
    let g = krog.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    teksturaKroga = new THREE.CanvasTexture(krog);
    const zv = document.createElement('canvas');
    zv.width = zv.height = 64;
    g = zv.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 13 : 30, k = -Math.PI / 2 + i * Math.PI / 5;
      g.lineTo(32 + r * Math.cos(k), 32 + r * Math.sin(k));
    }
    g.fill();
    teksturaZvezde = new THREE.CanvasTexture(zv);
  }

  // th, x, r: kje; barve; koliko; moc: hitrost razleta
  function razpok(th, x, r, barve, koliko, moc = 1, zvezde = false) {
    const n0 = normala(th);
    for (let i = 0; i < koliko; i++) {
      const m = new THREE.SpriteMaterial({ map: zvezde && i % 2 ? teksturaZvezde : teksturaKroga, color: barve[i % barve.length], transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      const v = (0.35 + Math.random() * 0.5) * (zvezde ? 1.3 : 1);
      s.scale.set(v, v, 1);
      s.position.copy(tocka(th, x, r));
      const smer = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).multiplyScalar(4 * moc);
      const hitrostD = n0.clone().multiplyScalar((5 + Math.random() * 6) * moc).add(smer);
      svet.add(s);
      delci.push({ s, v: hitrostD, g: n0, zivi: 1.4 + Math.random() * 0.4, cas: 0, teza: 11, rast: 0 });
    }
  }

  function brazda(th) {
    const za = th - 0.022;
    for (const stran of [-1, 1]) {
      const m = new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.scale.set(0.5, 0.5, 1);
      s.position.copy(tocka(za, xNa(za) + stran * 0.45, R + 0.2));
      const v = new THREE.Vector3(stran * (0.8 + Math.random() * 0.6), 0, 0);
      svet.add(s);
      delci.push({ s, v, g: normala(za), zivi: 1.1, cas: 0, teza: 0, rast: 1.2 });
    }
  }

  function posodobiDelce(dt) {
    delci = delci.filter(d => {
      d.cas += dt;
      if (d.cas >= d.zivi) {
        svet.remove(d.s);
        d.s.material.dispose();
        return false;
      }
      if (d.teza) d.v.addScaledVector(d.g, -d.teza * dt);
      d.v.multiplyScalar(1 - dt * 0.8);
      d.s.position.addScaledVector(d.v, dt);
      if (d.rast) { const k = d.s.scale.x + d.rast * dt; d.s.scale.set(k, k, 1); }
      d.s.material.opacity = (d.alfa || 1) * Math.min(1, 2.2 * (1 - d.cas / d.zivi));
      d.s.material.rotation += dt * 3;
      return true;
    });
  }

  // ---------- Most ----------

  // Kamnita tekstura: nepravilni bloki, malta, mah
  function teksturaKamna(mah = true) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#7d7466';
    g.fillRect(0, 0, 256, 256);
    const barve = ['#cdbfa6', '#bfb095', '#d8ccb4', '#b4a588', '#c7b694', '#a99a80'];
    for (let y = 0; y < 256; y += 32) {
      let x = -Math.random() * 40;
      while (x < 256) {
        const w = 38 + Math.random() * 40;
        g.fillStyle = barve[Math.floor(Math.random() * barve.length)];
        g.beginPath();
        g.roundRect ? g.roundRect(x + 2, y + 2, w - 4, 28, 6) : g.rect(x + 2, y + 2, w - 4, 28);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(x + 5, y + 4, w - 12, 4);
        g.fillStyle = 'rgba(0,0,0,.12)';
        g.fillRect(x + 4, y + 24, w - 8, 4);
        x += w;
      }
    }
    if (mah) for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${70 + Math.random() * 30},${120 + Math.random() * 40},50,${0.25 + Math.random() * 0.3})`;
      g.beginPath();
      g.arc(Math.random() * 256, 140 + Math.random() * 116, 4 + Math.random() * 12, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function teksturaTlakovcev() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#857a69';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? -8 : 0; x < 128; x += 16) {
      g.fillStyle = ['#cfc3ad', '#bdb099', '#d9cfba', '#b3a690'][Math.floor(Math.random() * 4)];
      g.beginPath();
      g.ellipse(x + 8, y + 8, 6.5, 6, Math.random(), 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function zgradiMost(th, proste) {
    const g = new THREE.Group();
    const tKamen = teksturaKamna();
    tKamen.repeat.set(0.28, 0.28);
    const kamen = mat(0xffffff, { map: tKamen });
    const P = 4.6, V = 4.5, L = SIRINA / 2 + 1.2, H = 4.0, K = 3.6; // pol dolžine, višina, lok, klančina
    const o = new THREE.Shape();
    o.moveTo(-P - K, -0.4);
    o.lineTo(-P - K, 0.1);
    o.quadraticCurveTo(-P - K * 0.35, V * 0.95, -P, V);
    o.lineTo(P, V);
    o.quadraticCurveTo(P + K * 0.35, V * 0.95, P + K, 0.1);
    o.lineTo(P + K, -0.4);
    o.lineTo(L, -0.4);
    o.absellipse(0, -0.4, L, H, 0, Math.PI, false);
    o.lineTo(-P - K, -0.4);
    const geo = new THREE.ExtrudeGeometry(o, { depth: 1.9, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 20 });
    geo.translate(0, 0, -0.95);
    const lok = new THREE.Mesh(geo, kamen);
    lok.castShadow = lok.receiveShadow = true;
    g.add(lok);

    // Klinasti kamni loka (voussoirs) in sklepnik na vrhu
    const barveKlin = [0xd9ccb2, 0xc4b597, 0xe2d6bd, 0xb9a98b];
    const N = 17;
    for (const zz of [-1.0, 1.0]) {
      for (let i = 0; i <= N; i++) {
        const a = Math.PI * i / N;
        const sklepnik = i === Math.floor(N / 2) || i === Math.ceil(N / 2) - 0;
        const klin = new THREE.Mesh(new THREE.BoxGeometry(0.5, sklepnik && i === Math.round(N / 2) ? 1.05 : 0.8, 0.22), mat(barveKlin[i % barveKlin.length]));
        const nx = Math.cos(a) / L, ny = Math.sin(a) / H, dol = Math.hypot(nx, ny);
        klin.position.set((L + 0.34 * nx / dol) * Math.cos(a), -0.4 + (H + 0.34 * ny / dol) * Math.sin(a), zz);
        klin.rotation.z = Math.atan2(ny, nx) - Math.PI / 2;
        klin.castShadow = true;
        g.add(klin);
      }
    }

    // Kamnita ograja s pokrovnimi ploščami, stebrički na koncih
    const tOgraja = teksturaKamna(false);
    tOgraja.repeat.set(0.5, 0.5);
    const ograjaMat = mat(0xffffff, { map: tOgraja });
    const pokrovMat = mat(0xe6dcc6);
    for (const zz of [-0.82, 0.82]) {
      const ograja = new THREE.Mesh(new THREE.BoxGeometry(2 * P, 0.7, 0.26), ograjaMat);
      ograja.position.set(0, V + 0.35, zz);
      ograja.castShadow = true;
      const pokrov = new THREE.Mesh(new THREE.BoxGeometry(2 * P + 0.1, 0.12, 0.38), pokrovMat);
      pokrov.position.set(0, V + 0.76, zz);
      g.add(ograja, pokrov);
      for (const xx of [-P, P]) {
        const steber = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), ograjaMat);
        steber.position.set(xx, V + 0.55, zz);
        const kapa = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 4), pokrovMat);
        kapa.rotation.y = Math.PI / 4;
        kapa.position.set(xx, V + 1.25, zz);
        g.add(steber, kapa);
      }
    }
    // Stare svetilke na stebričkih (ponoči svetijo)
    lucMat = new THREE.MeshLambertMaterial({ color: 0xfff1c4, emissive: 0x332a10 });
    const zelezo = mat(0x2b2b30);
    for (const zz of [-0.82, 0.82]) for (const xx of [-P, P]) {
      const drog = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6), zelezo);
      drog.position.set(xx, V + 1.9, zz);
      const lucka = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), lucMat);
      lucka.position.set(xx, V + 2.6, zz);
      const streha = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), zelezo);
      streha.rotation.y = Math.PI / 4;
      streha.position.set(xx, V + 2.9, zz);
      g.add(drog, lucka, streha);
    }
    // Tlakovana pot po vrhu
    const tTlak = teksturaTlakovcev();
    tTlak.repeat.set(4, 0.8);
    const pot = new THREE.Mesh(new THREE.BoxGeometry(2 * P, 0.06, 1.38), mat(0xffffff, { map: tTlak }));
    pot.position.set(0, V + 0.03, 0);
    g.add(pot);
    // Bršljan, ki visi z ograje, in korita z rožami
    const listMat = mat(0x3f8f3a), list2 = mat(0x5aad45);
    for (const zz of [-1.12, 1.12]) {
      for (let i = 0; i < 9; i++) {
        const x0 = -P + 0.4 + Math.random() * (2 * P - 0.8);
        const dolzina = 2 + Math.floor(Math.random() * 5);
        for (let k = 0; k < dolzina; k++) {
          const list = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 + Math.random() * 0.06, 0), k % 2 ? listMat : list2);
          list.position.set(x0 + Math.sin(k * 1.7) * 0.12, V + 0.6 - k * 0.3, zz);
          g.add(list);
        }
      }
      for (const xx of [-2.4, 0, 2.4]) {
        const korito = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.28), mat(0x9a5b2e));
        korito.position.set(xx, V + 0.93, zz * 0.73);
        g.add(korito);
        for (let k = 0; k < 5; k++) {
          const cvet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), mat([0xff4f8b, 0xffffff, 0xff8fb8, 0xd62839][(k + (xx > 0 ? 1 : 0)) % 4]));
          cvet.position.set(xx - 0.34 + k * 0.17, V + 1.1 + (k % 2) * 0.05, zz * 0.73);
          g.add(cvet);
        }
      }
    }
    postaviNaPotok(g, th, R);
    svet.add(g);
    for (let x = -P - K; x <= P + K; x += 2.5) proste.push([th, xNa(th) + x]);
  }

  // ---------- Piknik: žar, odeja, hladilna torba, balinčki, 8 prijateljev ----------

  function teksturaOdeje() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffffff' : '#e63946';
      g.fillRect(i * 16, j * 16, 16, 16);
    }
    return new THREE.CanvasTexture(c);
  }

  function zgradiPiknik(proste) {
    const thC = kotStopnje(PIKNIK), sp = stranPiknika();
    // u: razdalja vzdolž potoka od središča, d: oddaljenost od brega
    const mesto = (u, d) => {
      const th = thC + u / R;
      return [th, xNa(th) + sp * (SIRINA / 2 + 1.2 + d * 0.78)];
    };
    for (let u = -8; u <= 8; u += 2.5) for (let d = 0.5; d <= 7; d += 2.2) proste.push(mesto(u, d));
    // piknik je samo podnevi; ponoči je na istem mestu rave (zgradiRave)
    const dan = new THREE.Group();
    dnevni.add(dan);

    // Žar: kotliček na treh nogah z žerjavico
    const grill = new THREE.Group();
    const crna = new THREE.MeshPhongMaterial({ color: 0x1f1f24, shininess: 70 });
    const kotel = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), crna);
    kotel.position.y = 1.15;
    const zerjavica = new THREE.Mesh(new THREE.CircleGeometry(0.56, 18), new THREE.MeshBasicMaterial({ color: 0xff7b1c }));
    zerjavica.rotation.x = -Math.PI / 2;
    zerjavica.position.y = 1.14;
    const resetka = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 4, 24), mat(0xbfc5cc));
    resetka.rotation.x = Math.PI / 2;
    resetka.position.y = 1.18;
    const pokrov = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), crna);
    pokrov.position.set(0, 1.2, -0.62);
    pokrov.rotation.x = -1.3;
    grill.add(kotel, zerjavica, resetka, pokrov);
    for (let i = 0; i < 3; i++) {
      const noga = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), crna);
      const k = i * Math.PI * 2 / 3;
      noga.position.set(Math.cos(k) * 0.35, 0.55, Math.sin(k) * 0.35);
      noga.rotation.set(Math.sin(k) * 0.25, 0, -Math.cos(k) * 0.25);
      grill.add(noga);
    }
    // čevapčiči na rešetki
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6), mat(0x7a3e1d));
      c.rotation.z = Math.PI / 2;
      c.position.set(0, 1.24, -0.24 + i * 0.16);
      grill.add(c);
    }
    let [th, x] = mesto(-5, 1.2);
    postaviNaPotok(grill, th, R, x);
    dan.add(grill);
    zar = { th, x };

    // Odeja s košaro
    const odeja = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshLambertMaterial({ map: teksturaOdeje(), side: THREE.DoubleSide }));
    odeja.rotation.x = -Math.PI / 2;
    odeja.position.y = 0.06;
    odeja.receiveShadow = true;
    const kosara = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), mat(0xb5803f));
    kosara.position.set(0.6, 0.28, 0.9);
    const rocaj = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 5, 16, Math.PI), mat(0x8b5a2b));
    rocaj.position.set(0.6, 0.5, 0.9);
    const skupina = new THREE.Group();
    skupina.add(odeja, kosara, rocaj);
    [th, x] = mesto(-1.5, 2.6);
    postaviNaPotok(skupina, th, R + 0.02, x);
    skupina.rotateY(0.25);
    dan.add(skupina);

    // Hladilna torba
    const torba = new THREE.Group();
    const telo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), mat(0x3a86ff));
    telo.position.y = 0.3;
    const pokrovT = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.65), mat(0xffffff));
    pokrovT.position.y = 0.66;
    torba.add(telo, pokrovT);
    [th, x] = mesto(0.6, 3.4);
    postaviNaPotok(torba, th, R, x);
    dan.add(torba);

    // Balinišče: pesek, lesen rob, krogle in lučka
    const igrisce = new THREE.Group();
    const pesek = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 4.8), mat(0xeedcae));
    pesek.position.y = 0.05;
    pesek.receiveShadow = true;
    igrisce.add(pesek);
    const les = mat(0x8b5a2b);
    for (const [w, d, px, pz] of [[2.1, 0.12, 0, 2.45], [2.1, 0.12, 0, -2.45], [0.12, 5, 1.0, 0], [0.12, 5, -1.0, 0]]) {
      const rob = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), les);
      rob.position.set(px, 0.11, pz);
      igrisce.add(rob);
    }
    // tanke plastične ploščice (balinčki) in majhen cilj
    const plosca = barva => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 20), new THREE.MeshPhongMaterial({ color: barva, shininess: 90 }));
      m.castShadow = true;
      return m;
    };
    const cilj = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14), mat(0xffd23f));
    cilj.position.set(0.05, 0.12, -1.7);
    igrisce.add(cilj);
    [[0xff3b5c, 0.32, -1.35], [0xff3b5c, -0.42, -1.1], [0x2ec4b6, 0.12, -1.95], [0x2ec4b6, -0.25, 0.4]].forEach(([b, px, pz]) => {
      const k = plosca(b);
      k.position.set(px, 0.12, pz);
      k.rotation.z = (Math.random() - 0.5) * 0.08;
      igrisce.add(k);
    });
    const letalka = plosca(0x2ec4b6);
    letalka.position.set(0, 0.12, 2.1);
    igrisce.add(letalka);
    letalka.userData.dinamicno = true;
    balin = { k: letalka, t: 0 };
    [th, x] = mesto(5.4, 1.3);
    postaviNaPotok(igrisce, th, R, x);
    dan.add(igrisce);

    // Prijatelji (velikost, u, d)
    // 8 prijateljev: [indeks slike, velikost, u, d]
    [[0, 2.5, -5, 2.8], [1, 2.5, -3.4, 4.8], [2, 2.5, -7, 4.2], [3, 2.5, 2.4, 1.8], [4, 2.5, 0.8, 5.0],
     [5, 2.5, 0.4, 1.3], [7, 2.5, -1.4, 4.7], [9, 2.5, 8.4, 2.2]]
      .forEach(([i, v, u, d]) => {
        const [t, xx] = mesto(u, d);
        const s = lik(PRIJATELJI[i], v);
        s.position.copy(tocka(t, xx, R + v / 2 - 0.05));
        dan.add(s);
        liki.push({ s, baza: s.position.clone(), n: normala(t), faza: Math.random() * 20, v });
      });
  }

  // ---------- Ponoči: rave na mestu piknika (vsi v črnem, DJ spredaj, laserji) ----------

  function zgradiRave() {
    const thC = kotStopnje(PIKNIK), sp = stranPiknika();
    const mesto = (u, d) => {
      const th = thC + u / R;
      return [th, xNa(th) + sp * (SIRINA / 2 + 1.2 + d * 0.78)];
    };
    const g = new THREE.Group();
    nocni.add(g);
    // oder z neonskim robom in zvočnikoma, obrnjen proti potoku
    const oder = new THREE.Group();
    const crna = new THREE.MeshPhongMaterial({ color: 0x1a1a22, shininess: 40 });
    const ploscad = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 2.6), crna);
    ploscad.position.y = 0.25;
    const rob = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2bd6 }));
    rob.position.set(0, 0.5, 1.32);
    oder.add(ploscad, rob);
    const membrana = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    [-2.3, 2.3].forEach(px => {
      const zv = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.9), crna);
      zv.position.set(px, 1.6, 0);
      const m1 = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), membrana);
      m1.position.set(px, 1.2, 0.46);
      const m2 = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), membrana);
      m2.position.set(px, 2.15, 0.46);
      oder.add(zv, m1, m2);
    });
    // oder na zgornjem koncu plesišča, obrnjen proti gledalcu; množica pred njim
    const [th, x] = mesto(6.2, 2.6);
    postaviNaPotok(oder, th, R, x);
    g.add(oder);
    const dj = lik({ slika: 'slike/rave-08.svg' }, 3.8);
    dj.position.copy(tocka(th - 0.4 / R, x, R + 2.3));
    dj.userData.svetel = true;
    g.add(dj);

    // laserji z vrha zvočnikov: tanki svetli žarki, ki pometajo nad plesiščem
    const laserji = [];
    const barve = [0x39ff14, 0xff2bd6, 0x00e5ff, 0xffe600];
    const zarekGeo = new THREE.CylinderGeometry(0.04, 0.04, 11, 4, 1, true).translate(0, 5.5, 0);
    [-2.2, -0.8, 0.8, 2.2].forEach((dx, i) => {
      const pivot = new THREE.Group();
      pivot.position.copy(tocka(th, x + dx, R + 3.1));
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normala(thC));
      const zarek = new THREE.Mesh(zarekGeo, new THREE.MeshBasicMaterial({ color: barve[i], transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      pivot.add(zarek);
      g.add(pivot);
      laserji.push({ zarek, faza: i * 1.3, sp });
    });
    // barvne luči na tleh in utripalka
    const luci = [];
    for (let i = 0; i < 6; i++) {
      const [t, xx] = mesto(-4 + (i >> 1) * 3.2, 1.2 + (i % 2) * 2.8);
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: barve[i % 4], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      l.position.copy(tocka(t, xx, R + 0.3));
      l.scale.set(4, 4, 1);
      g.add(l);
      luci.push({ l, faza: i });
    }
    const strobo = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    strobo.position.copy(tocka(th - 1 / R, x, R + 3));
    strobo.scale.set(14, 14, 1);
    g.add(strobo);

    // plesalci: isti prijatelji kot na pikniku, v črnem
    const plesalci = [];
    [[3.4, 0.8], [3.2, 3.2], [1.2, 1.8], [0.8, 4.4], [-1.2, 0.9], [-1.6, 3.4], [-3.8, 2.2]]
      .forEach(([u, d], i) => {
        const [t, xx] = mesto(u, d);
        const st = [1, 2, 3, 4, 5, 6, 10][i];
        const v = 2.4;
        const sl = lik({ slika: `slike/rave-${String(st).padStart(2, '0')}.svg` }, v);
        sl.userData.svetel = true;
        sl.position.copy(tocka(t, xx, R + v / 2 - 0.05));
        g.add(sl);
        plesalci.push({ s: sl, baza: sl.position.clone(), n: normala(t), faza: Math.random() * 6, v });
      });
    zgradiRave.stanje = { laserji, luci, strobo, plesalci, dj };
  }

  function animirajRave() {
    const r = zgradiRave.stanje;
    if (!r || !noc) return;
    const utrip = 128 / 60; // udarci na sekundo
    const faza = cas * utrip;
    const c = new THREE.Color();
    r.laserji.forEach(l => {
      l.zarek.rotation.z = Math.sin(cas * 0.9 + l.faza) * 0.9;
      l.zarek.rotation.x = -0.35 + Math.sin(cas * 1.3 + l.faza * 2) * 0.3;
      l.zarek.material.opacity = 0.45 + 0.35 * Math.max(0, Math.sin(faza * Math.PI));
    });
    r.luci.forEach(l => {
      c.setHSL(((cas * 0.15 + l.faza / 6) % 1), 1, 0.55);
      l.l.material.color.copy(c);
      l.l.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(faza * Math.PI + l.faza));
    });
    // utripalka: kratki bliski na vsake 4 takte
    const t4 = faza % 16;
    r.strobo.material.opacity = t4 > 14 && (Math.floor(faza * 4) % 2 === 0) ? 0.5 : 0;
    r.plesalci.forEach(p => {
      const skok = Math.abs(Math.sin((faza + p.faza) * Math.PI)) * 0.45;
      p.s.position.copy(p.baza).addScaledVector(p.n, skok);
      c.setHSL(((cas * 0.15 + p.faza / 6) % 1), 0.6, 0.82);
      p.s.material.color.copy(c);
    });
    r.dj.material.color.setHSL((cas * 0.15) % 1, 0.4, 0.85);
  }

  // ---------- Cilj: balonski lok čez potok, šahovnica na vodi in navijači; ponoči lučke, reflektorja in ognjemet ----------

  function zgradiCilj(th, proste) {
    const xc = xNa(th), pol = SIRINA / 2 + 0.9, VIS = 4.6;
    const naLoku = a => new THREE.Vector3(-Math.cos(a) * pol, Math.sin(a) * VIS, 0);
    const lok = new THREE.Group();
    // balonski lok: pari balonov v petih barvah, od tal do tal
    const barve = [0xff2d87, 0xffd23f, 0x2ec4b6, 0xffffff, 0x8f4dff];
    const balonGeo = new THREE.SphereGeometry(0.34, 12, 9);
    // vsaka barva svoj material s sijem, da lok ponoči žari (glej nastaviNoc)
    const baloni = barve.map(b => mat(b, { emissive: new THREE.Color(b).multiplyScalar(0.004), side: THREE.DoubleSide }));
    for (let i = 0; i <= 30; i++) {
      const v = naLoku(Math.PI * i / 30);
      [-0.2, 0.2].forEach((z, j) => {
        const b = new THREE.Mesh(balonGeo, baloni[(i + j * 2) % barve.length]);
        b.position.set(v.x, v.y + 0.3, z);
        b.scale.set(1, 1.12, 1);
        lok.add(b);
      });
    }
    // zastavice pod lokom
    const zastGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.38, 0)]);
    zastGeo.computeVertexNormals();
    const sirZast = pol * 0.8;
    for (let i = 0; i <= 12; i++) {
      const x = -sirZast + 2 * sirZast * i / 12;
      const z = new THREE.Mesh(zastGeo, baloni[i % barve.length]);
      z.position.set(x, 2.7 - 0.45 * (1 - (x / sirZast) ** 2), 0);
      lok.add(z);
    }
    // šahovnica čez vodo
    const sah = document.createElement('canvas');
    sah.width = 256; sah.height = 32;
    const gs = sah.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { gs.fillStyle = (i + j) % 2 ? '#1d1d1d' : '#ffffff'; gs.fillRect(i * 16, j * 16, 16, 16); }
    const crta = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA + 0.8, (SIRINA + 0.8) / 8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sah), color: 0xe8e8e8 }));
    crta.rotation.x = -Math.PI / 2;
    crta.position.y = 0.11;
    lok.add(crta);
    postaviNaPotok(lok, th, R, xc);
    svet.add(lok);

    // tabla CILJ visi z vrha loka in se rahlo ziba
    const pl = document.createElement('canvas');
    pl.width = 512; pl.height = 160;
    const g = pl.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#1d1d1d' : '#ffffff';
      g.fillRect(i * 16, j * 16, 16, 16);
      g.fillRect(i * 16, 128 + j * 16, 16, 16);
    }
    g.fillStyle = '#ff2d87';
    g.fillRect(0, 32, 512, 96);
    g.font = '900 84px "Lilita One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#7a1f45';
    g.strokeText('🏁 CILJ 🏁', 256, 84);
    g.fillStyle = '#fff';
    g.fillText('🏁 CILJ 🏁', 256, 84);
    const tabla = new THREE.Group();
    const platno = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pl), side: THREE.DoubleSide }));
    platno.position.y = -0.75;
    const vrvica = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), mat(0x333333));
    vrvica.position.y = -0.1;
    tabla.add(vrvica, platno);
    const nihalo = new THREE.Group();
    nihalo.add(tabla);
    tabla.position.y = VIS + 0.05;
    tabla.position.z = 0.45;
    postaviNaPotok(nihalo, th, R, xc);
    nihalo.userData.dinamicno = true;
    svet.add(nihalo);

    // navijači s transparenti tik pred ciljem, na bregu proti sredini zaslona (drugi breg je ob ovinku izven slike)
    const stran = xNa(th) > 0 ? -1 : 1;
    const navijaci = [['slike/navijaci-sam-gas.svg', -0.05, SIRINA / 2 + 2.5], ['slike/navijaci-ide-dora.svg', -0.01, pol + 3.6]].map(([slika, d, odmik], i) => {
      const thN = th + d, x = xNa(thN) + stran * odmik;
      const sp = lik({ slika }, 1);
      sp.scale.set(4.5, 3, 1);
      sp.userData.svetel = true;
      svet.add(sp);
      proste.push([thN, x]);
      return { s: sp, baza: tocka(thN, x, R + 1.5), n: normala(thN), faza: i * 1.3 };
    });
    ovire.push([th, xc, 2.4, pol + 5.2], [th - 0.05, xNa(th - 0.05), 2, SIRINA / 2 + 5]);
    proste.push([th, xc - pol], [th, xc + pol]);

    // ponoči: veriga lučk po loku, sij za tablo, reflektorja in ognjemet
    const lucke = [];
    for (let i = 0; i <= 18; i++) {
      const v = naLoku(Math.PI * i / 18).add(new THREE.Vector3(0, 0.3, 0.42));
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      l.scale.setScalar(1.15);
      l.position.copy(v);
      l.userData.svetel = true;
      lucke.push(l);
    }
    const nocLok = new THREE.Group();
    nocLok.add(...lucke);
    const sij = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xff7ab0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sij.scale.setScalar(9);
    sij.position.set(0, VIS * 0.6, -0.4);
    const voda = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xffc070, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    voda.scale.setScalar(7);
    voda.position.set(0, 0.3, 0.6);
    sij.userData.svetel = voda.userData.svetel = true;
    nocLok.add(sij, voda);
    const zarekGeo = new THREE.ConeGeometry(1.1, 9, 16, 1, true).translate(0, -4.5, 0).rotateX(Math.PI);
    const reflektorja = [-1, 1].map(s => {
      const r = new THREE.Mesh(zarekGeo, new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff7ab0 : 0x7ad8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      r.position.set(s * (pol + 0.9), 0.2, -0.3);
      nocLok.add(r);
      return { r, s };
    });
    const ognjemet = [0, 1, 2].map(() => {
      const iskre = Array.from({ length: 16 }, () => {
        const k = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        k.scale.setScalar(0.55);
        k.userData.svetel = true;
        nocLok.add(k);
        return k;
      });
      return { iskre, t: 99, center: new THREE.Vector3(), barva: new THREE.Color() };
    });
    postaviNaPotok(nocLok, th, R, xc);
    nocLok.userData.dinamicno = true;
    nocni.add(nocLok);

    cilj = { th, baloni, nihalo: tabla, navijaci, lucke, sij, reflektorja, ognjemet, naslednji: 0, slavje: 0, naslednjiPok: 0 };
  }

  function animirajCilj() {
    if (!cilj) return;
    // le, ko je cilj blizu kamere
    if (Math.abs(kot - cilj.th) * R > 40) return;
    cilj.nihalo.rotation.z = Math.sin(cas * 1.4) * 0.05;
    const slavi = cas < cilj.slavje;
    const hitrostSkoka = slavi ? 8 : 4.2;
    cilj.navijaci.forEach(v => {
      const skok = Math.abs(Math.sin(cas * hitrostSkoka + v.faza)) * (slavi ? 0.6 : 0.32);
      v.s.position.copy(v.baza).addScaledVector(v.n, skok);
      v.s.material.rotation = Math.sin(cas * hitrostSkoka + v.faza) * 0.04;
      v.s.material.color.setHex(noc ? 0xffe6c8 : 0xffffff);
    });
    // slavje ob prihodu na cilj: pok za pokom podnevi in ponoči
    if (slavi && cas > cilj.naslednjiPok) {
      cilj.naslednjiPok = cas + 0.3 + Math.random() * 0.3;
      const th = cilj.th + (Math.random() - 0.3) * 0.08;
      razpok(th, xNa(th) + (Math.random() - 0.5) * 7, R + 3 + Math.random() * 3, [0xff4f8b, 0xffd23f, 0x19b5c9, 0xb388ff, 0x57cc99, 0xffffff], 45, 1.2, true);
    }
    if (!noc) return;
    // lučke tečejo v valu po loku
    cilj.lucke.forEach((l, i) => {
      const val = 0.5 + 0.5 * Math.sin(cas * 5 - i * 0.7);
      l.material.opacity = 0.35 + 0.65 * val;
      l.material.color.setHSL((0.12 + (i % 3) * 0.33 + cas * 0.05) % 1, 0.9, 0.65);
    });
    cilj.sij.material.opacity = 0.45 + Math.sin(cas * 2) * 0.08;
    cilj.reflektorja.forEach(({ r, s }, i) => { r.rotation.z = s * (0.35 + Math.sin(cas * 0.9 + i * 2) * 0.3); });
    // ognjemet: vsakih nekaj sekund pok nad lokom
    if (cas > cilj.naslednji) {
      const o = cilj.ognjemet.find(o => o.t > 1.8);
      if (o) {
        o.t = 0;
        o.center.set((Math.random() - 0.5) * 7, 6.5 + Math.random() * 2.5, -1 - Math.random() * 2);
        o.barva.setHSL(Math.random(), 1, 0.62);
      }
      cilj.naslednji = cas + 0.8 + Math.random() * 1.6;
    }
    cilj.ognjemet.forEach(o => {
      if (o.t > 1.8) return;
      o.t += 1 / 60;
      const t = o.t, sir = 2.6 * (1 - Math.pow(1 - Math.min(t / 1.2, 1), 3));
      o.iskre.forEach((k, i) => {
        const a = i / o.iskre.length * Math.PI * 2;
        k.position.set(o.center.x + Math.cos(a) * sir, o.center.y + Math.sin(a) * sir - t * t * 0.9, o.center.z);
        k.material.color.copy(o.barva);
        k.material.opacity = Math.max(0, 1 - t / 1.8);
      });
    });
  }

  // ---------- Prigode ob poti: race, baloni, šotor z ognjem, Tupko na gugalnici ----------

  function zgradiPrigode(proste) {
    // naključne stopnje, ki niso pri mostu ali pikniku
    const stopnje = [];
    for (let st = 2; st < n; st++) if (Math.abs(st - MOST) > 1.6 && !vPikniku(st)) stopnje.push(st + 0.5);
    stopnje.sort(() => Math.random() - 0.5);
    const mestoNaBregu = (st, odmik, prostor = 1.6) => {
      for (const sp of [-stranHise(Math.floor(st)), stranHise(Math.floor(st))]) {
        for (const d of [0, 0.03, -0.03]) {
          const th = kotStopnje(st) + d, x = xNa(th) + sp * odmik;
          if (!vOviri(th, x, prostor)) return [th, x];
        }
      }
      return null;
    };
    const zasedi = (th, x, a, b) => { ovire.push([th, x, a, b]); proste.push([th, x]); };

    // Račja družina (dve): mama in mladički plavajo gor in dol
    const raca = mama => {
      const g = new THREE.Group();
      const telo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), mat(mama ? 0x9c7a55 : 0xffd93b));
      telo.scale.set(1, 0.7, 1.35);
      telo.position.y = 0.14;
      const glava = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat(mama ? 0x1f7a3a : 0xffe25a));
      glava.position.set(0, 0.44, 0.32);
      const kljun = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), mat(0xff8c1a));
      kljun.rotation.x = Math.PI / 2;
      kljun.position.set(0, 0.42, 0.55);
      const rep = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 5), mat(mama ? 0x7a5c3d : 0xffd93b));
      rep.rotation.x = -2.2;
      rep.position.set(0, 0.28, -0.44);
      g.add(telo, glava, kljun, rep);
      for (const sx of [-0.1, 0.1]) {
        const oko = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0x111111));
        oko.position.set(sx, 0.5, 0.48);
        g.add(oko);
      }
      g.scale.setScalar(mama ? 1.25 : 0.62);
      return g;
    };
    stopnje.slice(0, 2).forEach((st, i) => {
      const druzina = [raca(true), raca(false), raca(false), raca(false)];
      druzina.forEach(d => { d.userData.dinamicno = true; svet.add(d); });
      race.push({ druzina, th: kotStopnje(st) + 0.035, pas: (i % 2 ? 1 : -1) * 1.0, faza: Math.random() * 10 });
    });

    // Balona na vroč zrak visoko nad potjo
    const teksBalona = barve => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      barve.forEach((b, i) => { g.fillStyle = b; g.fillRect(i * 256 / barve.length, 0, 256 / barve.length + 1, 64); });
      return new THREE.CanvasTexture(c);
    };
    [['#ff4f8b', '#ffd23f', '#19b5c9', '#ffffff', '#ff4f8b', '#ffd23f', '#19b5c9', '#ffffff'],
     ['#8338ec', '#ffb300', '#8338ec', '#ffb300', '#8338ec', '#ffb300', '#8338ec', '#ffb300']].forEach((barve, i) => {
      const st = stopnje[2 + i];
      if (!st) return;
      const g = new THREE.Group();
      const kupola = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshLambertMaterial({ map: teksBalona(barve) }));
      kupola.scale.y = 1.18;
      kupola.position.y = 3;
      const vrat = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.9, 12, 1, true), new THREE.MeshLambertMaterial({ map: teksBalona(barve), side: THREE.DoubleSide }));
      vrat.position.y = 1.15;
      const kosara = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), mat(0xa0662b));
      kosara.position.y = 0.1;
      g.add(kupola, vrat, kosara);
      for (const [sx, sz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const vrv = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 3), mat(0x5b3a1e));
        vrv.position.set(sx * 1.2, 0.75, sz * 1.2);
        g.add(vrv);
      }
      g.userData.dinamicno = true;
      svet.add(g);
      baloni.push({ g, th: kotStopnje(st) + 0.08, x: xNa(kotStopnje(st)) + (i ? 12 : -12), faza: Math.random() * 10 });
    });

    // Šotor s tabornim ognjem; Tupko spi ob ognju
    const mOgnja = stopnje[4] && mestoNaBregu(stopnje[4], SIRINA / 2 + 5.2);
    if (mOgnja) {
      const [th, x] = mOgnja;
      const g = new THREE.Group();
      const sotor = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.9, 4), mat(0xff8c1a));
      sotor.rotation.y = Math.PI / 4;
      sotor.position.set(-1.2, 0.95, 0);
      const vhod = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), mat(0x5b2e0a));
      vhod.position.set(-1.2, 0.55, 0.62);
      g.add(sotor, vhod);
      for (let i = 0; i < 4; i++) {
        const poleno = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), mat(0x6b3f1d));
        poleno.rotation.set(Math.PI / 2, 0, i * Math.PI / 4);
        poleno.position.set(1, 0.08, 0.6);
        g.add(poleno);
      }
      const plamen = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 7), new THREE.MeshBasicMaterial({ color: 0xffa31a }));
      plamen.position.set(1, 0.5, 0.6);
      const jedro = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      jedro.position.set(1, 0.4, 0.6);
      plamen.userData.dinamicno = jedro.userData.dinamicno = true;
      g.add(plamen, jedro);
      postavi(g, th, x);
      svet.add(g);
      const sij = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sij.scale.setScalar(4);
      sij.position.copy(tocka(th + 0.6 / R, x + 1, R + 0.9));
      sij.userData.svetel = true;
      nocni.add(sij);
      const spi = lik(TUPKO_POZE[3], 2.2);
      spi.position.copy(tocka(th + 1.6 / R, x + 2.2, R + 1.0));
      svet.add(spi);
      // ponoči kolegi s pivom okoli ognja, osvetljeni od plamena
      [[PRIJATELJI[1], -1.4, 0], [PRIJATELJI[4], 1.3, -0.4], [PRIJATELJI[6], -0.8, 1.6]].forEach(([e, du, dx]) => {
        const k = lik(e, 2.3);
        k.position.copy(tocka(th + (0.6 + du) / R, x + 1 + dx, R + 1.1));
        k.userData.svetel = true;
        k.material.color.setHex(0xffd2a0);
        nocni.add(k);
      });
      zasedi(th, x, 2.5, 2.8);
      ogenj = { plamen, jedro, sij };
    }

    // Gugalnica na veliki lipi, na njej se guga Tupko
    const mGug = stopnje[5] && mestoNaBregu(stopnje[5], SIRINA / 2 + 4.6);
    if (mGug) {
      const [th, x] = mGug;
      const g = new THREE.Group();
      const deblo = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), mat(0x7a4a24));
      deblo.position.set(-1.6, 2, 0);
      const veja = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.2, 6), mat(0x7a4a24));
      veja.rotation.z = Math.PI / 2;
      veja.position.set(-0.2, 3.6, 0);
      g.add(deblo, veja);
      [[-1.6, 5, 0, 2.1], [-0.4, 4.6, 0.6, 1.5], [-2.6, 4.4, -0.4, 1.5], [0.6, 4.3, -0.3, 1.3]].forEach(([px, py, pz, r]) => {
        const k = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x4f9d3a));
        k.position.set(px, py, pz);
        k.castShadow = true;
        g.add(k);
      });
      const nihalo = new THREE.Group();
      nihalo.userData.dinamicno = true;
      nihalo.position.set(0.3, 3.55, 0);
      for (const sz of [-0.32, 0.32]) {
        const vrv = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 4), mat(0xd9c39a));
        vrv.position.set(0, -1.2, sz);
        nihalo.add(vrv);
      }
      const sedez = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.8), mat(0xa0662b));
      sedez.position.y = -2.4;
      const gugalec = lik(TUPKO_POZE[0], 1.4);
      gugalec.position.y = -1.75;
      nihalo.add(sedez, gugalec);
      g.add(nihalo);
      postavi(g, th, x);
      g.rotateY(Math.PI / 2);
      svet.add(g);
      zasedi(th, x, 2.4, 2.4);
      gugalnica = nihalo;
    }

    // Gora s potjo v serpentinah in jeklenico: podnevi Dora, Mirt in dva prijatelja s čeladami, pripeti, hodijo gor in dol
    const mestoGore = st => mestoNaBregu(st, SIRINA / 2 + 2.7, 3.2);
    const stGore = stopnje.slice(6).find(mestoGore);
    const mGora = stGore && mestoGore(stGore);
    if (mGora) {
      const [th, x] = mGora;
      const g = new THREE.Group();
      const RG = 1.95, HG = 5.6;
      const stozec = (r, h, barva, px, py, pz, seg = 9) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), new THREE.MeshLambertMaterial({ color: barva, flatShading: true }));
        m.position.set(px, py, pz);
        m.castShadow = true;
        g.add(m);
        return m;
      };
      stozec(1.5, 3.4, 0x3f8f3a, 0.9, 1.7, -1.7);           // manjši sosednji vrh zadaj
      stozec(RG, HG, 0x5aa845, 0, HG / 2, 0);              // travnata gora
      stozec(0.86, 2.4, 0x8f949b, 0, HG - 1.2 + 0.01, 0);   // skalni vrh
      stozec(0.4, 1.1, 0xffffff, 0, HG - 0.55 + 0.02, 0);   // sneg
      stozec(0.38, 0.6, 0xffffff, 0.9, 3.12, -1.7, 7);
      [[1.9, 0.6], [-1.9, 0.9], [-1.6, -1.3]].forEach(([px, pz]) => {
        stozec(0.38, 1.1, 0x2f7d3b, px, 0.55, pz, 6);
      });
      // pot po sprednji strani v cik-caku
      const naPoti = (u, ven = 0) => {
        const y = 0.15 + u * 3.9, a = 0.8 * Math.sin(u * Math.PI * 3);
        const rr = RG * (1 - y / HG) + 0.05 + ven;
        return new THREE.Vector3(rr * Math.sin(a), y, rr * Math.cos(a));
      };
      const krivulja = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => naPoti(i / 39)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(krivulja, 90, 0.09, 4), mat(0xd9b77e)));
      // jeklenica v višini pasu tik za sprehajalci, na kovinskih drogovih
      const jeklo = mat(0x6b7580), visina = new THREE.Vector3(0, 0.55, 0);
      const vrv = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => naPoti(i / 39, 0.15).add(visina)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(vrv, 90, 0.035, 4), jeklo));
      for (let i = 0; i <= 12; i++) {
        const drog = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.58, 4), jeklo);
        drog.position.copy(naPoti(i / 12, 0.15)).addScaledVector(visina, 0.5);
        g.add(drog);
      }
      postavi(g, th, x);
      svet.add(g);
      g.updateMatrixWorld(true);
      // točke poti v svetu (za sprehajalce), malo pred pobočjem
      const pot = Array.from({ length: 80 }, (_, i) => g.localToWorld(naPoti(i / 79, 0.3)));
      const gor = normala(th);
      const druzba = [['dora-ferata', 1.5], ['mirt-ferata', 1.5], ['pohodnik-ferata-1', 1.4], ['pohodnik-ferata-2', 1.4]]
        .map(([e, v]) => {
          const sp = lik({ slika: `slike/${e}.svg` }, v);
          dnevni.add(sp);
          return { s: sp, v };
        });
      sprehod = { pot, gor, druzba };
      zasedi(th, x, 2.4, 2.4);
    }

    // Ponoči: osvetljen joga studio, v njem Dorini frendici (drevo in lotos), sveče, lampijončka in gong
    const mestoStudia = st => st !== stGore && mestoNaBregu(st, SIRINA / 2 + 3.3, 2.8);
    const stStudia = [...stopnje].reverse().find(mestoStudia);
    const mStudio = stStudia && mestoStudia(stStudia);
    if (mStudio) {
      const [th, x] = mStudio;
      const g = new THREE.Group();
      const kos = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
      const les = mat(0x9a6b3e), temenLes = mat(0x6b4426);
      const toplo = new THREE.MeshBasicMaterial({ color: 0xf2c27e });
      kos(new THREE.BoxGeometry(4.4, 0.3, 3.2), les, 0, 0.15, 0);                          // ploščad
      kos(new THREE.BoxGeometry(4.1, 0.02, 2.9), new THREE.MeshBasicMaterial({ color: 0xc98f55 }), 0, 0.31, 0); // osvetljena tla
      // odprt paviljon brez strehe, da se od zgoraj vidi noter: svetleča zadnja stena, nizki stranski steni, tram spredaj
      kos(new THREE.BoxGeometry(4.4, 2.3, 0.14), toplo, 0, 1.45, -1.53);                   // rižev papir
      for (const px of [-1.1, 0, 1.1]) kos(new THREE.BoxGeometry(0.08, 2.3, 0.16), temenLes, px, 1.45, -1.5);
      kos(new THREE.BoxGeometry(4.5, 0.12, 0.2), temenLes, 0, 2.62, -1.5);
      for (const px of [-2.15, 2.15]) {
        kos(new THREE.BoxGeometry(0.14, 0.9, 3.2), les, px, 0.75, 0);                      // nizki stranski steni
        kos(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), temenLes, px, 1.5, 1.5);       // sprednja stebra
        kos(new THREE.BoxGeometry(0.1, 0.1, 3.1), temenLes, px, 2.66, 0);                  // stranska trama
      }
      kos(new THREE.BoxGeometry(4.5, 0.12, 0.14), temenLes, 0, 2.66, 1.5);                 // sprednji tram
      // lučke na sprednjem tramu
      const zarnica = new THREE.MeshBasicMaterial({ color: 0xffe08a });
      for (let i = 0; i < 9; i++) {
        const px = -2 + i * 0.5;
        kos(new THREE.SphereGeometry(0.06, 6, 4), zarnica, px, 2.52 - Math.sin(i / 8 * Math.PI) * 0.18, 1.52);
      }
      // podloge za jogo
      kos(new THREE.BoxGeometry(0.8, 0.04, 1.7), new THREE.MeshBasicMaterial({ color: 0x9b5de5 }), -0.95, 0.33, 0.25);
      kos(new THREE.BoxGeometry(0.8, 0.04, 1.7), new THREE.MeshBasicMaterial({ color: 0x2ec4b6 }), 0.95, 0.33, 0.25);
      // gong na lesenem okvirju v kotu
      for (const px of [1.25, 2.0]) kos(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), temenLes, px, 1.25, -1.0);
      kos(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), temenLes, 1.625, 2.15, -1.0).rotation.z = Math.PI / 2;
      const zlato = new THREE.MeshBasicMaterial({ color: 0xe0a83a });
      const gong = kos(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 20), zlato, 1.625, 1.55, -1.0);
      gong.rotation.x = Math.PI / 2;
      const izbokl = kos(new THREE.SphereGeometry(0.1, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b }), 1.625, 1.55, -0.96);
      izbokl.scale.z = 0.5;
      // sveče ob sprednjem robu (plamenčki migetajo)
      const plamenMat = new THREE.MeshBasicMaterial({ color: 0xffc04d });
      const plameni = [];
      for (const px of [-1.8, -0.6, 0.6, 1.8]) {
        kos(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xfff3e0 }), px, 0.42, 1.4);
        const pl = kos(new THREE.ConeGeometry(0.05, 0.14, 6), plamenMat, px, 0.6, 1.4);
        pl.userData.dinamicno = true;
        plameni.push(pl);
      }
      // papirnata lampijončka pod streho
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
      for (const px of [-1.75, -0.55]) {
        kos(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3), temenLes, px, 2.42, -1.3);
        kos(new THREE.SphereGeometry(0.2, 12, 8), lampMat, px, 2.12, -1.3).scale.y = 1.25;
      }
      postavi(g, th, x);
      nocni.add(g);
      g.updateMatrixWorld(true);
      const vSvet = (px, py, pz) => g.localToWorld(new THREE.Vector3(px, py, pz));
      const sijaj = (poz, velikost, barva, moc = 1) => {
        const sj = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: barva, transparent: true, opacity: moc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        sj.scale.setScalar(velikost);
        sj.position.copy(poz);
        sj.userData.svetel = true;
        nocni.add(sj);
        return sj;
      };
      sijaj(vSvet(0, 1.4, -1.3), 7, 0xffb060, 0.4);                // topel sij za frendicama
      [-1.75, -0.55].forEach(px => sijaj(vSvet(px, 2.12, -1.25), 1.4, 0xffa040));
      const sijSvec = sijaj(vSvet(0, 0.5, 1.6), 2.4, 0xffc060, 0.5);
      // frendici: drevo in lotos na podlogah
      const jogini = [['joga-drevo', -0.95, 2.4], ['joga-lotos', 0.95, 1.9]].map(([ime, px, v]) => {
        const sp = lik({ slika: `slike/${ime}.svg` }, v);
        sp.position.copy(vSvet(px, 0.32 + v / 2, 0.3));
        sp.userData.svetel = true;
        sp.material.color.setHex(0xffe6c8);
        nocni.add(sp);
        return { s: sp, v };
      });
      joga = { th, plameni, sijSvec, jogini, gongCas: 4 };
      zasedi(th, x, 2.8, 2.6);
    }
  }

  function animirajPrigode() {
    if (joga && noc) {
      // mirno dihanje, migetanje sveč in občasen mehak gong, glasnejši, ko je studio blizu
      joga.jogini.forEach((j, i) => {
        const dih = 1 + Math.sin(cas * 0.9 + i * 1.7) * 0.025;
        j.s.scale.set(j.v / Math.sqrt(dih), j.v * dih, 1);
      });
      joga.plameni.forEach((p, i) => p.scale.set(1, 0.85 + Math.sin(cas * 11 + i * 2.1) * 0.15 + Math.sin(cas * 23 + i) * 0.08, 1));
      joga.sijSvec.material.opacity = 0.45 + Math.sin(cas * 9) * 0.06 + Math.sin(cas * 21) * 0.04;
      const blizu = Math.max(0, 1 - Math.abs(kot - joga.th) * R / 22);
      if (cas > joga.gongCas) {
        joga.gongCas = cas + 14 + Math.random() * 6;
        if (blizu > 0.05 && typeof Zvok !== 'undefined' && Zvok.gong) Zvok.gong(0.12 * blizu);
      }
    }
    if (sprehod) {
      // skupinica gre počasi gor do vrha in nazaj dol, eden za drugim
      const { pot, gor, druzba } = sprehod, n = pot.length - 1;
      const glava = 0.32 + 0.68 * (0.5 - 0.5 * Math.cos(cas * 0.07));
      druzba.forEach((d, i) => {
        const u = Math.max(0, glava - i * 0.1) * n, k = Math.min(n - 1, Math.floor(u));
        d.s.position.copy(pot[k]).lerp(pot[k + 1], u - k)
          .addScaledVector(gor, d.v * 0.48 + Math.abs(Math.sin(cas * 4 + i)) * 0.08);
      });
    }
    race.forEach(r => {
      const u = Math.sin(cas * 0.11 + r.faza) * 5;               // položaj vzdolž potoka (enote)
      const smer = Math.cos(cas * 0.11 + r.faza) > 0 ? 1 : -1;   // kam plavajo
      r.druzina.forEach((d, i) => {
        const th = r.th + (u - smer * i * 0.85) / R;
        postaviNaPotok(d, th, R + 0.06, xNa(th) + r.pas + (i ? Math.sin(cas * 2 + i) * 0.12 : 0));
        if (smer > 0) d.rotateY(Math.PI);
        d.position.addScaledVector(normala(th), Math.sin(cas * 3 + i) * 0.04);
      });
    });
    baloni.forEach(b => {
      const x = b.x + Math.sin(cas * 0.07 + b.faza) * 3;
      b.g.position.copy(tocka(b.th, x, R + 24 + Math.sin(cas * 0.5 + b.faza) * 0.8));
      b.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normala(b.th));
    });
    if (ogenj) {
      const f = 1 + Math.sin(cas * 17) * 0.12 + Math.sin(cas * 23) * 0.08;
      ogenj.plamen.scale.set(1, f, 1);
      ogenj.jedro.scale.set(1, 2 - f, 1);
      ogenj.sij.material.opacity = 0.55 + Math.sin(cas * 11) * 0.12;
    }
    if (gugalnica) gugalnica.rotation.x = Math.sin(cas * 1.8) * 0.45;
    // Tupko: občasno »mjav« v oblačku pri enem od Tupkov, ki so na zaslonu
    mjavCas -= 0.016;
    if (mjavCas < 0 && !potovanje) {
      const blizu = tupki.filter(t => !t.napis && Math.abs(t.th - kot) < 0.22); // lačni Tupko ima napis že na sliki
      if (blizu.length) mjavni(blizu[Math.floor(Math.random() * blizu.length)], false);
      mjavCas = 3 + Math.random() * 4;
    }
    if (oblacek) {
      oblacek.t += 0.016;
      const k = oblacek.t;
      const s = k < 0.2 ? k / 0.2 * 1.15 : k < 0.3 ? 1.15 - (k - 0.2) * 1.5 : 1;
      oblacek.s.scale.set(2.4 * s, 1.2 * s, 1);
      oblacek.s.material.opacity = k > 1.6 ? Math.max(0, 1 - (k - 1.6) * 3) : 1;
      if (k > 2) { svet.remove(oblacek.s); oblacek = null; }
    }
  }

  const MJAVI = ['Mjav!', 'Mjaaav!', 'Mjav?', 'Mijav!', 'Mjav mjav!', 'Lačen!'];
  function mjavni(t, zvok) {
    if (oblacek) svet.remove(oblacek.s);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.strokeStyle = '#2a1b14';
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect ? g.roundRect(8, 8, 240, 86, 36) : g.rect(8, 8, 240, 86);
    g.moveTo(110, 92); g.lineTo(128, 122); g.lineTo(146, 92);
    g.fill(); g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(112, 86, 32, 10);
    g.fillStyle = '#c2185b';
    g.font = '800 46px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(MJAVI[Math.floor(Math.random() * MJAVI.length)], 128, 54);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.position.copy(t.s.position).addScaledVector(normala(t.th), t.v * 0.55 + 0.9 + (t.napis ? 1.4 : 0));
    s.renderOrder = 10;
    s.userData.svetel = true;
    svet.add(s);
    oblacek = { s, t: 0 };
    if (zvok && Zvok.mjav) Zvok.mjav();
  }

  function animirajPiknik(dt) {
    if (zar && !noc) {
      dimCas += dt;
      if (dimCas > 0.22) {
        dimCas = 0;
        const m = new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xeeeeee, transparent: true, depthWrite: false });
        const s = new THREE.Sprite(m);
        s.scale.set(0.5, 0.5, 1);
        s.position.copy(tocka(zar.th, zar.x + (Math.random() - 0.5) * 0.3, R + 1.5));
        svet.add(s);
        const n = normala(zar.th);
        delci.push({ s, v: n.clone().multiplyScalar(0.9), g: n, zivi: 2.6, cas: 0, teza: -0.5, rast: 0.9, alfa: 0.5 });
      }
    }
    if (balin) {
      // ploščica poleti v loku, zdrsne po pesku proti cilju, počaka in začne znova
      balin.t = (balin.t + dt) % 4.5;
      const k = Math.min(1, balin.t / 2.2), e = 1 - Math.pow(1 - k, 2.4);
      balin.k.position.z = 2.1 - e * 3.5;
      balin.k.position.x = Math.sin(e * 2) * 0.14;
      balin.k.position.y = 0.12 + Math.max(0, Math.sin(Math.min(1, k / 0.55) * Math.PI)) * 1.1 * (k < 0.55 ? 1 : 0);
      balin.k.rotation.y = e * 14;
    }
  }

  // ---------- Gradnja sveta ----------

  function mat(barva, opcije = {}) { return new THREE.MeshLambertMaterial({ color: barva, ...opcije }); }

  function hisa(barvaSten, barvaStrehe, velikost = 1) {
    const g = new THREE.Group();
    const stene = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 2.2), mat(barvaSten));
    stene.position.y = 0.85;
    const streha = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.5, 4), mat(barvaStrehe));
    streha.position.y = 1.7 + 0.75;
    streha.rotation.y = Math.PI / 4;
    const vrata = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.06), mat(0x8b5a2b));
    vrata.position.set(0, 0.48, 1.11);
    oknoMat = oknoMat || mat(0xbfe9ff, { emissive: 0x334455 });
    const okno1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.06), oknoMat);
    okno1.position.set(0.78, 1.05, 1.11);
    const okno2 = okno1.clone();
    okno2.position.x = -0.78;
    const dimnik = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), mat(0xa0522d));
    dimnik.position.set(0.6, 2.6, -0.3);
    [stene, streha, vrata, okno1, okno2, dimnik].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    g.scale.setScalar(velikost);
    return g;
  }

  function zgradiKanu() {
    const g = new THREE.Group();
    const trup = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xe8590c, shininess: 60, side: THREE.DoubleSide })
    );
    trup.scale.set(0.75, 0.6, 1.9);
    trup.position.y = 0.32;
    trup.castShadow = true;
    const robGeo = new THREE.TorusGeometry(1, 0.07, 8, 40);
    robGeo.rotateX(Math.PI / 2);
    const rob = new THREE.Mesh(robGeo, new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 80 }));
    rob.scale.set(0.75, 1, 1.9);
    rob.position.y = 0.32;
    // Dora cela, z veslom v rokah (portret DORA je za ploščico)
    doraNaColnu = lik(DORA_COLN, 2.7);
    doraNaColnu.position.y = 1.45;
    const dno = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
    dno.rotation.x = -Math.PI / 2;
    dno.scale.set(0.62, 1.7, 1);
    dno.position.y = 0.12;
    const klop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.35), mat(0xa0522d));
    klop.position.y = 0.3;
    doraNaColnu.userData.svetel = true;
    // ponoči na čolnu gori lučka, da se vidi, kje je Dora
    luc = new THREE.PointLight(0xffc56b, 0, 16, 1.6);
    luc.position.set(0, 2.4, 0.4);
    g.add(trup, dno, klop, rob, doraNaColnu, luc);
    g.scale.setScalar(1.35);
    return g;
  }

  function instance(geo, material, matrike, barve) {
    const m = new THREE.InstancedMesh(geo, material, matrike.length);
    matrike.forEach((mx, i) => {
      m.setMatrixAt(i, mx);
      if (barve) m.setColorAt(i, barve[i]);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function zgradi() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd8f3ff, 45, 95);
    camera = new THREE.PerspectiveCamera(50, 1, 0.5, 300);

    hemi = new THREE.HemisphereLight(0xffffff, 0x5a8a3a, 0.8);
    scene.add(hemi);
    sonce = new THREE.DirectionalLight(0xfff0d0, 0.7);
    sonce.castShadow = true;
    sonce.shadow.mapSize.set(1024, 1024);
    Object.assign(sonce.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
    scene.add(sonce, sonce.target);

    svet = new THREE.Group();
    scene.add(svet);
    teksture();
    dnevni = new THREE.Group();   // samo podnevi (metulji)
    nocni = new THREE.Group();    // samo ponoči (oči, kresnice, sij ognja, Mirt s svetilko)
    dnevni.userData.dinamicno = nocni.userData.dinamicno = true;
    svet.add(dnevni, nocni);
    const konec = kotStopnje(n + 1);

    // Tla: travnik z odtenki
    const tlaGeo = new THREE.CylinderGeometry(R, R, 160, 240, 60, true);
    tlaGeo.rotateZ(Math.PI / 2);
    const p = tlaGeo.attributes.position;
    const barve = [];
    const svetla = new THREE.Color(0x8fd15a), temna = new THREE.Color(0x4fa63a), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), th = Math.atan2(-p.getZ(i), p.getY(i));
      const v = 0.5 + 0.25 * Math.sin(x * 0.45 + th * 37) + 0.25 * Math.sin(th * 71 - x * 0.3);
      c.copy(temna).lerp(svetla, v);
      barve.push(c.r, c.g, c.b);
    }
    tlaGeo.setAttribute('color', new THREE.Float32BufferAttribute(barve, 3));
    tla = new THREE.Mesh(tlaGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    tla.receiveShadow = true;
    svet.add(tla);

    // Breg in voda
    const od = -0.4, doKota = konec + 0.6;
    const breg = new THREE.Mesh(trak(SIRINA + 2.4, R + 0.03, od, doKota, 700), mat(0xe8d39a, { side: THREE.DoubleSide }));
    breg.receiveShadow = true;
    svet.add(breg);
    const blato = new THREE.Mesh(trak(SIRINA + 0.6, R + 0.05, od, doKota, 700), mat(0xb89a64, { side: THREE.DoubleSide }));
    svet.add(blato);

    vodaMat = new THREE.ShaderMaterial({
      uniforms: { uCas: { value: 0 }, uNoc: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uCas;
        uniform float uNoc;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          float preko = abs(vUv.x - 0.5) * 2.0;
          vec2 tok = vec2(vUv.x * 3.0, vUv.y * 2.0 + uCas * 0.55);
          float n = noise(tok * vec2(1.5, 2.5)) * 0.6 + noise(tok * vec2(4.0, 7.0) + 7.0) * 0.4;
          vec3 globoko = vec3(0.05, 0.42, 0.66), plitvo = vec3(0.30, 0.80, 0.86);
          vec3 barva = mix(globoko, plitvo, smoothstep(0.15, 1.0, preko) * 0.85 + (n - 0.5) * 0.3);
          float valovi = smoothstep(0.6, 0.72, noise(vec2(vUv.x * 7.0, vUv.y * 5.0 + uCas * 0.9)));
          barva += valovi * 0.16;
          float pena = smoothstep(0.80, 0.97, preko + (n - 0.5) * 0.3);
          barva = mix(barva, vec3(0.95, 0.99, 1.0), pena * 0.9);
          float iskra = step(0.992, hash(floor(vec2(vUv.x * 30.0, vUv.y * 40.0 + uCas * 5.0)))) * (1.0 - preko);
          barva += iskra * 0.7;
          barva = mix(barva, barva * vec3(0.32, 0.4, 0.62) + iskra * 0.5, uNoc);
          gl_FragColor = vec4(barva, 1.0);
        }`,
    });
    svet.add(new THREE.Mesh(trak(SIRINA, R + 0.08, od, doKota, 700), vodaMat));

    // Hišice in liki
    const proste = []; // mesta, kjer ne sme rasti drevo
    const dom = hisa(0xfff1d6, 0xd9480f, 1.3);
    const xDom = xNa(0) - ODMIK_HISE - 0.6;
    postavi(dom, 0.005, xDom);
    svet.add(dom);
    proste.push([0, xDom]);
    liki = [];
    let stLika = 0;
    const dodajLik = (e, velikost, th, x, r) => {
      const s = lik(e, velikost);
      s.position.copy(tocka(th, x, r));
      svet.add(s);
      liki.push({ s, baza: s.position.clone(), n: normala(th), faza: Math.random() * 20, v: velikost });
      if (e.ime === 'Tupko') { s.userData.tupko = true; tupki.push({ s, th, v: velikost, napis: /lacen/.test(e.slika || '') }); }
      // ponoči Mirt ne kolesari in ne telovadi: spi, gleda film ali je na telefonu
      if (e.ime === 'Mirt') mirtovi.push({ s, dan: s.material.map, noc: teksturaLika(MIRT_NOC[mirtovi.length % MIRT_NOC.length]) });
    };
    dodajLik(MIRT, 3.4, -0.035, xDom + 2.6, R + 1.6);
    napisReke(-0.125, 0.02);

    const barveSten = [0xffe5ec, 0xfff3b0, 0xd8f3dc, 0xe0f0ff, 0xffe8cc, 0xf3e5ff];
    const barveStreh = [0xc9184a, 0x3a86ff, 0x8338ec, 0xfb5607, 0x2a9d8f, 0xe76f51];
    oznake = [];
    // Most in piknik najprej zasedeta svoj prostor
    const thMost = MOST * KORAK, thPik = kotStopnje(PIKNIK), spPik = stranPiknika();
    ovire = [
      [thMost, xNa(thMost), 1.8, 9.2],
      [thPik + 0.5 / R, xNa(thPik) + spPik * (SIRINA / 2 + 6.4), 10, 5.2],
    ];
    // liki ob poti so vsakič v drugem vrstnem redu
    const likiOb = [...LIKI_OB_POTI].sort(() => Math.random() - 0.5);
    for (let st = 1; st <= n; st++) {
      const th = kotStopnje(st);
      // hišica: najprej ob stopnji, sicer malo prej ali kasneje, sicer na drugem bregu
      let stran = stranHise(st), thH = null;
      for (const s2 of [stran, -stran]) {
        const d = [0.01, -0.035, 0.045, -0.055].find(d => !vOviri(th + d, xNa(th + d) + s2 * ODMIK_HISE, 1.4));
        if (d !== undefined) { thH = th + d; stran = s2; break; }
      }
      if (thH !== null) {
        const xH = xNa(thH) + stran * ODMIK_HISE;
        const h = hisa(barveSten[st % 6], barveStreh[st % 6]);
        postavi(h, thH, xH);
        svet.add(h);
        proste.push([thH, xH]);
        ovire.push([thH, xH, 1.3, 1.3]);
        // Ob vsaki hišici Mirt ali Tupko v svoji situaciji
        const xL = xH + stran * 1.9;
        if (!vOviri(thH - 0.03, xL, 0.4)) {
          dodajLik(likiOb[stLika++ % likiOb.length], 3.2, thH - 0.03, xL, R + 1.5);
          ovire.push([thH - 0.03, xL, 0.8, 0.8]);
        }
      }
      // med lihimi hišicami še en lik
      if (st % 2 && st < n) {
        const thM = th + KORAK / 2, xM = xNa(thM) + stranHise(st) * (SIRINA / 2 + 2.6);
        if (!vOviri(thM, xM, 0.6)) {
          dodajLik(likiOb[stLika++ % likiOb.length], 2.9, thM, xM, R + 1.35);
          proste.push([thM, xM]);
          ovire.push([thM, xM, 0.8, 0.8]);
        }
      }

      // Plošček stopnje na vodi
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.4, 40), new THREE.MeshPhongMaterial({ shininess: 90 }));
      const obroc = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.13, 8, 32), new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90 }));
      obroc.rotation.x = Math.PI / 2;
      obroc.position.y = 0.2;
      const plosk = new THREE.Group();
      plosk.userData.dinamicno = true;
      plosk.add(disk, obroc);
      disk.castShadow = true;
      postavi(plosk, th, xNa(th), R + 0.2);
      svet.add(plosk);

      const platno = document.createElement('canvas');
      platno.width = platno.height = 256;
      const napis = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(platno), transparent: true }));
      napis.scale.set(3.6, 3.6, 1);
      napis.position.copy(tocka(th, xNa(th), R + 2.6));
      svet.add(napis);
      disk.userData.st = napis.userData.st = st;
      napis.userData.svetel = true;
      oznake.push({ st, disk, plosk, platno, napis });
    }

    // Valovi okoli trenutne stopnje: širijo se in bledijo, da se takoj vidi, kje si
    valovi = [0, 1, 2].map(i => {
      const v = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.1, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      v.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(v);
      g.userData.faza = i / 3;
      g.userData.dinamicno = true;
      svet.add(g);
      return g;
    });

    zgradiMost(MOST * KORAK, proste);
    zgradiPiknik(proste);
    zgradiRave();
    zgradiCilj(konec, proste);
    zgradiPrigode(proste);

    // Drevesa, grmi, kamni, lokvanji
    const dummy = new THREE.Object3D();
    const debla = [], krosnje = [], smreke = [], barveK = [], barveS = [], grmi = [], barveG = [], kamni = [], lokvanji = [];
    const prosto = (th, x) => Math.abs(x - xNa(th)) > SIRINA / 2 + 2 &&
      proste.every(([t, xx]) => Math.hypot((t - th) * R, xx - x) > 3.8);
    const gostota = (doKota - od) / 2.24; // 12 stopenj = 1
    let poskusi = 0;
    while (debla.length < 320 * gostota && poskusi++ < 5000 * gostota) {
      const th = od + Math.random() * (doKota - od), x = (Math.random() - 0.5) * 70;
      if (!prosto(th, x)) continue;
      postavi(dummy, th, x);
      dummy.scale.setScalar(0.8 + Math.random() * 0.7);
      dummy.updateMatrix();
      debla.push(dummy.matrix.clone());
      const zelena = new THREE.Color().setHSL(0.27 + Math.random() * 0.08, 0.55, 0.32 + Math.random() * 0.12);
      if (Math.random() < 0.55) { krosnje.push(dummy.matrix.clone()); barveK.push(zelena); }
      else { smreke.push(dummy.matrix.clone()); barveS.push(zelena.offsetHSL(0.03, 0, -0.08)); }
    }
    poskusi = 0;
    const cvetje = [0xff6b9a, 0xffd23f, 0xffffff, 0xb388ff, 0xff8c42];
    while (grmi.length < 260 * gostota && poskusi++ < 4000 * gostota) {
      const th = od + Math.random() * (doKota - od), x = (Math.random() - 0.5) * 40;
      if (Math.abs(x - xNa(th)) < SIRINA / 2 + 1.4) continue;
      if (proste.some(([t, xx]) => Math.hypot((t - th) * R, xx - x) < 2.4)) continue;
      postavi(dummy, th, x);
      dummy.scale.setScalar(0.25 + Math.random() * 0.35);
      dummy.updateMatrix();
      grmi.push(dummy.matrix.clone());
      barveG.push(new THREE.Color(Math.random() < 0.5 ? 0x5bb544 : cvetje[Math.floor(Math.random() * cvetje.length)]));
    }
    for (let i = 0; i < 160 * gostota; i++) {
      const th = od + Math.random() * (doKota - od);
      if (Math.abs(th - MOST * KORAK) * R < 2.5) continue;
      const s = Math.random() < 0.5 ? 1 : -1;
      postavi(dummy, th, xNa(th) + s * (SIRINA / 2 + 0.4 + Math.random() * 0.9), R + 0.05);
      dummy.scale.set(0.18 + Math.random() * 0.25, 0.12 + Math.random() * 0.15, 0.18 + Math.random() * 0.25);
      dummy.rotateY(Math.random() * 6);
      dummy.updateMatrix();
      kamni.push(dummy.matrix.clone());
    }
    for (let i = 0; i < 90 * gostota; i++) {
      const th = od + Math.random() * (doKota - od);
      if (oznake.some(o => Math.abs(kotStopnje(o.st) - th) * R < 2.2)) continue;
      const s = Math.random() < 0.5 ? 1 : -1;
      postavi(dummy, th, xNa(th) + s * (0.7 + Math.random() * 1.1), R + 0.1);
      dummy.scale.setScalar(0.35 + Math.random() * 0.3);
      dummy.updateMatrix();
      lokvanji.push(dummy.matrix.clone());
    }
    const debloGeo = new THREE.CylinderGeometry(0.18, 0.26, 1.2, 6).translate(0, 0.6, 0);
    const krosnjaGeo = new THREE.IcosahedronGeometry(1.15, 1).translate(0, 2.0, 0);
    const smrekaGeo = new THREE.ConeGeometry(1.0, 2.8, 7).translate(0, 2.4, 0);
    svet.add(instance(debloGeo, mat(0x8b5a2b), debla));
    if (krosnje.length) svet.add(instance(krosnjaGeo, mat(0xffffff), krosnje, barveK));
    if (smreke.length) svet.add(instance(smrekaGeo, mat(0xffffff), smreke, barveS));
    svet.add(instance(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.6, 0), mat(0xffffff), grmi, barveG));
    const kamenje = instance(new THREE.DodecahedronGeometry(1, 0), mat(0x9aa0a6), kamni);
    kamenje.castShadow = false;
    svet.add(kamenje);
    const lokvanj = instance(new THREE.CylinderGeometry(1, 1, 0.05, 14, 1, false, 0.3, Math.PI * 2 - 0.6), mat(0x3f9b3a), lokvanji);
    lokvanj.castShadow = false;
    svet.add(lokvanj);

    // Rožice na travniku: cvet in rumena sredica
    const cvetovi = [], barveC = [];
    for (let i = 0; i < 420 * gostota; i++) {
      const th = od + Math.random() * (doKota - od), x = xNa(th) + (Math.random() < 0.5 ? -1 : 1) * (SIRINA / 2 + 1.4 + Math.random() * 14);
      if (proste.some(([t, xx]) => Math.hypot((t - th) * R, xx - x) < 1.8)) continue;
      postavi(dummy, th, x, R + 0.02);
      dummy.scale.setScalar(0.7 + Math.random() * 0.6);
      dummy.updateMatrix();
      cvetovi.push(dummy.matrix.clone());
      barveC.push(new THREE.Color(cvetje[i % cvetje.length]));
    }
    const cvetGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 5).translate(0, 0.14, 0);
    const sredicaGeo = new THREE.OctahedronGeometry(0.1).translate(0, 0.18, 0);
    const cvet = instance(cvetGeo, mat(0xffffff), cvetovi, barveC);
    const sredica = instance(sredicaGeo, mat(0xffc300), cvetovi);
    cvet.castShadow = sredica.castShadow = false;
    svet.add(cvet, sredica);

    kanu = zgradiKanu();
    kanu.userData.dinamicno = true;
    svet.add(kanu);
    zgradiDanInNoc(od, doKota, proste);
    // liki, ki se ponoči potemnijo (Dora, napisi in nočni liki ostanejo svetli)
    zlepiStaticno();
    zlepiStaticno(dnevni);
    zlepiStaticno(nocni);
    svet.traverse(o => { if (o.isSprite && !o.userData.svetel) temni.push(o); });
    nastaviNoc(noc);
  }

  // ---------- Zlepljanje statičnih predmetov (manj klicev risanja = gladko na telefonu) ----------

  // Vse mirujoče mreže z navadnim Lambert materialom zlije v eno mrežo z barvami v ogliščih;
  // ostale (teksture, svetila, Phong) zlije po materialu. Gibljivi predmeti imajo userData.dinamicno.
  function zlepiStaticno(koren = svet) {
    svet.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(koren.matrixWorld).invert();
    const skupine = new Map(), odstrani = [];
    const obisci = o => {
      if (o.userData.dinamicno) return;
      if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material)) {
        const m = o.material;
        if (!m.isShaderMaterial && !m.transparent && !m.vertexColors && (m.isMeshLambertMaterial || m.isMeshPhongMaterial)) {
          const navaden = m.isMeshLambertMaterial && !m.map && m.emissive.getHex() === 0;
          const kljuc = navaden ? 'lambert' + m.side : m.uuid;
          if (!skupine.has(kljuc)) skupine.set(kljuc, { m, navaden, deli: [] });
          skupine.get(kljuc).deli.push({ geo: o.geometry, mx: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), barva: m.color, senca: o.castShadow });
          odstrani.push(o);
        }
      }
      o.children.forEach(obisci);
    };
    koren.children.slice().forEach(obisci);
    odstrani.forEach(o => o.parent.remove(o));
    skupine.forEach(({ m, navaden, deli }) => {
      const geos = deli.map(d => {
        const g = d.geo.index ? d.geo.toNonIndexed() : d.geo.clone();
        g.applyMatrix4(d.mx);
        return g;
      });
      const skupaj = geos.reduce((a, g) => a + g.attributes.position.count, 0);
      const poz = new Float32Array(skupaj * 3), nor = new Float32Array(skupaj * 3);
      const imaUv = !navaden && geos.every(g => g.attributes.uv);
      const uv = imaUv ? new Float32Array(skupaj * 2) : null;
      const bar = navaden ? new Float32Array(skupaj * 3) : null;
      let i = 0;
      geos.forEach((g, k) => {
        const n = g.attributes.position.count;
        poz.set(g.attributes.position.array, i * 3);
        nor.set(g.attributes.normal.array, i * 3);
        if (uv) uv.set(g.attributes.uv.array, i * 2);
        if (bar) { const c = deli[k].barva; for (let j = 0; j < n; j++) bar.set([c.r, c.g, c.b], (i + j) * 3); }
        i += n;
        g.dispose();
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (bar) geo.setAttribute('color', new THREE.BufferAttribute(bar, 3));
      const material = navaden ? new THREE.MeshLambertMaterial({ vertexColors: true, side: m.side }) : m;
      const mreza = new THREE.Mesh(geo, material);
      mreza.castShadow = deli.some(d => d.senca);
      mreza.receiveShadow = true;
      mreza.frustumCulled = false;
      koren.add(mreza);
    });
  }

  // ---------- Dan in noč ----------

  function platnoTeks(w, h, risi) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    risi(c.getContext('2d'));
    return new THREE.CanvasTexture(c);
  }

  function zgradiDanInNoc(od, doKota, proste) {
    const nakljucnoObPoti = (min, max) => {
      for (let i = 0; i < 40; i++) {
        const th = od + 0.1 + Math.random() * (doKota - od - 0.2);
        const x = xNa(th) + (Math.random() < 0.5 ? -1 : 1) * (min + Math.random() * (max - min));
        if (proste.every(([t, xx]) => Math.hypot((t - th) * R, xx - x) > 2.5)) return [th, x];
      }
      return [od + Math.random() * (doKota - od), 12];
    };

    // Metulji (podnevi): dve krili, mahata
    const barveMetuljev = [['#ff6b9a', '#ffd23f'], ['#4cc9f0', '#ffffff'], ['#ffb300', '#ff4f8b'], ['#b388ff', '#ffe066']];
    const teksMetuljev = barveMetuljev.map(([a, b]) => platnoTeks(64, 64, g => {
      g.lineWidth = 3; g.strokeStyle = '#2a1b14';
      [[-1, a], [1, a]].forEach(([s]) => {
        g.fillStyle = a;
        g.beginPath(); g.ellipse(32 + s * 14, 24, 14, 17, s * 0.5, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = b;
        g.beginPath(); g.ellipse(32 + s * 11, 44, 9, 11, -s * 0.4, 0, Math.PI * 2); g.fill(); g.stroke();
      });
      g.fillStyle = '#2a1b14';
      g.beginPath(); g.ellipse(32, 34, 3.5, 15, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(31, 20); g.lineTo(24, 8); g.moveTo(33, 20); g.lineTo(40, 8); g.stroke();
    }));
    for (let i = 0; i < 26 * (doKota - od) / 2.24; i++) {
      const [th, x] = nakljucnoObPoti(SIRINA / 2 + 1, 9);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksMetuljev[i % teksMetuljev.length], transparent: true }));
      m.userData.svetel = true;
      dnevni.add(m);
      metulji.push({ m, th, x, faza: Math.random() * 20, hitro: 0.6 + Math.random() * 0.6 });
    }

    // Mačje oči v grmovju (ponoči): svetijo in včasih pomežiknejo
    const teksOci = platnoTeks(128, 64, g => {
      [36, 92].forEach(x => {
        const sij = g.createRadialGradient(x, 32, 0, x, 32, 28);
        sij.addColorStop(0, 'rgba(230,255,120,.9)');
        sij.addColorStop(1, 'rgba(230,255,120,0)');
        g.fillStyle = sij; g.fillRect(x - 30, 2, 60, 60);
        g.fillStyle = '#f4ff7a';
        g.beginPath(); g.ellipse(x, 32, 12, 15, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b1b22';
        g.beginPath(); g.ellipse(x, 32, 3.5, 12, 0, 0, Math.PI * 2); g.fill();
      });
    });
    for (let i = 0; i < 14 * (doKota - od) / 2.24; i++) {
      const [th, x] = nakljucnoObPoti(SIRINA / 2 + 4, 13);
      const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksOci, transparent: true, fog: false, depthWrite: false }));
      o.position.copy(tocka(th, x, R + 0.9));
      o.scale.set(1.4, 0.7, 1);
      o.userData.svetel = true;
      nocni.add(o);
      oci.push({ o, faza: Math.random() * 30, hitro: 0.5 + Math.random() * 0.5 });
    }

    // Mirt s svetilko, včasih skupaj s Tupkom (ponoči), na bregu nasproti hišic
    [3.5, 7.5, 11.5, 14.5, 19.5, 22.5].forEach((st, i) => {
      if (st > n) return;
      const th = kotStopnje(st), stran = -stranHise(Math.floor(st));
      const e = { ime: 'Mirt', emoji: '🔦', slika: i % 2 ? 'slike/mirt-svetilka-tupko.svg' : 'slike/mirt-svetilka.svg' };
      const xS = xNa(th) + stran * (SIRINA / 2 + 2.2);
      if (vOviri(th, xS, 0.5)) return;
      const s = lik(e, 3.8);
      s.position.copy(tocka(th, xS, R + 1.8));
      s.userData.svetel = true;
      nocni.add(s);
    });

    // Kresnice (ponoči)
    for (let i = 0; i < 24 * (doKota - od) / 2.24; i++) {
      const [th, x] = nakljucnoObPoti(SIRINA / 2 - 1, 12);
      const k = new THREE.Sprite(new THREE.SpriteMaterial({ map: teksturaKroga, color: 0xd9ff6a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      k.scale.setScalar(0.45);
      k.userData.svetel = true;
      nocni.add(k);
      kresnice.push({ k, th, x, faza: Math.random() * 30 });
    }
  }

  function animirajDanInNoc() {
    if (!noc) {
      metulji.forEach(b => {
        const t = cas * b.hitro + b.faza;
        const th = b.th + Math.sin(t * 0.7) * 0.02, x = b.x + Math.cos(t * 0.5) * 1.6;
        b.m.position.copy(tocka(th, x, R + 1.3 + Math.sin(t * 2.3) * 0.5));
        const mah = Math.abs(Math.sin(cas * 14 + b.faza));
        b.m.scale.set(0.9 * (0.25 + 0.75 * mah), 0.9, 1);
      });
    } else {
      oci.forEach(e => {
        const t = (cas * e.hitro + e.faza) % 6;
        const mezik = t < 0.15 ? 0.08 : 1;  // pomežik
        const prizgane = (cas * 0.13 + e.faza) % 4 < 3.2; // včasih se oči skrijejo
        e.o.scale.set(1.4, 0.7 * mezik, 1);
        e.o.visible = prizgane;
      });
      kresnice.forEach(f => {
        const t = cas + f.faza;
        f.k.position.copy(tocka(f.th + Math.sin(t * 0.3) * 0.015, f.x + Math.cos(t * 0.4) * 1.2, R + 0.8 + Math.sin(t * 0.9) * 0.6));
        f.k.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.1));
      });
    }
  }

  function nastaviNoc(b) {
    noc = !!b;
    if (!scene) return;
    scene.fog.color.setHex(noc ? 0x1b2547 : 0xd8f3ff);
    hemi.color.setHex(noc ? 0x8ea4ff : 0xffffff);
    hemi.groundColor.setHex(noc ? 0x1a2a3a : 0x5a8a3a);
    hemi.intensity = noc ? 0.34 : 0.8;
    sonce.color.setHex(noc ? 0xb8c8ff : 0xfff0d0);
    sonce.intensity = noc ? 0.35 : 0.7;
    luc.intensity = noc ? 1.8 : 0;
    oknoMat.color.setHex(noc ? 0xffe08a : 0xbfe9ff);
    oknoMat.emissive.setHex(noc ? 0xffb43a : 0x334455);
    if (lucMat) lucMat.emissive.setHex(noc ? 0xffc866 : 0x332a10);
    if (cilj) cilj.baloni.forEach(m => m.emissive.copy(m.color).multiplyScalar(noc ? 0.55 : 0.004));
    vodaMat.uniforms.uNoc.value = noc ? 1 : 0;
    temni.forEach(o => o.material.color.setHex(noc ? 0x6a76a0 : 0xffffff));
    mirtovi.forEach(m => { m.s.material.map = noc ? m.noc : m.dan; m.s.material.color.setHex(noc ? 0xb4bfec : 0xffffff); });
    dnevni.visible = !noc;
    nocni.visible = noc;
  }

  // ---------- Stanje ----------

  function osveziOznake() {
    oznake.forEach(o => {
      const barva = o.st > prikazano ? 0x7d8ca3 : o.st === prikazano ? 0xff4f8b : 0xffc23d;
      o.disk.material.color.setHex(barva);
      narisiOznako(o.platno, o.st);
      o.napis.material.map.needsUpdate = true;
    });
  }

  function postaviKanu(th) {
    postaviNaPotok(kanu, th, R + 0.08);
    const pluje = potovanje && potovanje.t >= 0 && potovanje.t < TRAJANJE;
    const nihaj = Math.sin(cas * (pluje ? 6 : 2.2));
    let poskok = 0;
    if (odklep && odklep.t < 0.6) poskok = Math.sin(odklep.t / 0.6 * Math.PI) * 0.9;
    kanu.position.addScaledVector(normala(th), nihaj * (pluje ? 0.12 : 0.06) + poskok);
    kanu.rotateZ(nihaj * (pluje ? 0.1 : 0.05));
    if (pluje) kanu.rotateX(-0.06);
    doraNaColnu.material.rotation = Math.sin(cas * (pluje ? 8 : 2)) * (pluje ? 0.16 : 0.05); // veslanje
  }

  // ---------- Kamera in velikost ----------

  function velikost() {
    const w = ovoj.clientWidth, h = ovoj.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fovH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    razdalja = THREE.MathUtils.clamp(8.5 / Math.tan(fovH / 2), 28, 70);
    postaviKamero(1);
    camera.updateProjectionMatrix();
    scene.fog.near = razdalja * 1.05;
    scene.fog.far = razdalja * 1.9;
    sonce.position.set(20, R + 50, 30);
    sonce.target.position.set(0, R, -5);
  }

  // kamera sledi vijugam potoka levo-desno: sredina slike je povprečje poti v vidnem delu sveta
  let kameraX = null;
  function postaviKamero(f) {
    const d = razdalja * f;
    let px = 0;
    for (let i = 0; i < 8; i++) px += xNa(kot - 0.04 + i * 0.045);
    px /= 8;
    kameraX = kameraX === null ? px : kameraX + (px - kameraX) * 0.08;
    const smer = new THREE.Vector3(0, 0.82, 0.57).normalize(); // bolj od zgoraj: manj stiskanja v globino
    camera.position.set(kameraX, R, 0).addScaledVector(smer, d);
    camera.lookAt(kameraX, R - 1, -d * 0.32);
  }

  // ---------- Vnos ----------

  function klik(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mis = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mis, camera);
    const zadetki = ray.intersectObjects([tla, ...oznake.map(o => o.disk), ...oznake.map(o => o.napis), ...tupki.map(t => t.s)]);
    const tupko = zadetki.length && tupki.find(t => t.s === zadetki[0].object);
    if (tupko) { mjavni(tupko, true); return; }
    const st = zadetki.length && zadetki[0].object.userData.st;
    if (st && st <= odklenjeno) onStopnja(st);
  }

  function priklopiVnos(platno) {
    platno.addEventListener('pointerdown', e => {
      if (potovanje) return;
      vlece = true;
      zacY = zadnjiY = e.clientY;
      zacKot = ciljKot;
      premaknil = 0;
      hitrost = 0;
      try { platno.setPointerCapture(e.pointerId); } catch (_) {}
    });
    platno.addEventListener('pointermove', e => {
      if (!vlece) return;
      const dy = e.clientY - zacY;
      premaknil = Math.max(premaknil, Math.abs(dy));
      ciljKot = zacKot + dy * 0.0016;
      hitrost = (e.clientY - zadnjiY) * 0.0016;
      zadnjiY = e.clientY;
    });
    platno.addEventListener('pointerup', e => {
      vlece = false;
      if (premaknil < 8) { hitrost = 0; klik(e); }
    });
    platno.addEventListener('pointercancel', () => { vlece = false; });
    platno.addEventListener('wheel', e => {
      e.preventDefault();
      ciljKot += e.deltaY * 0.0005;
    }, { passive: false });
    window.addEventListener('resize', () => tece && velikost());
    // telefon ob obratu sporoči novo velikost, preden je postavitev končana
    if (window.ResizeObserver) new ResizeObserver(() => tece && velikost()).observe(ovoj);
  }

  // ---------- Zanka ----------

  function zanka(t) {
    if (!tece) { zankaTece = false; return; }
    requestAnimationFrame(zanka);
    const dt = Math.min(0.05, (t - zadnji) / 1000 || 0.016);
    zadnji = t;
    cas += dt;
    let zoom = 1;
    if (potovanje) {
      const prej = potovanje.t;
      potovanje.t += dt;
      const t = potovanje.t;
      if (prej < -0.5 && t >= -0.5) {
        // opravljena stopnja: zlate zvezdice nad ploščkom
        const th0 = kanuOd;
        razpok(th0, xNa(th0), R + 1, [0xffd23f, 0xffe98a, 0xffffff], 26, 0.9, true);
        Zvok.zvezda(2);
      }
      if (prej < 0 && t >= 0) Zvok.pljusk();
      const k = THREE.MathUtils.clamp(t / TRAJANJE, 0, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      kanuKot = kanuOd + (kanuDo - kanuOd) * e;
      ciljKot = kanuKot + 0.02 * Math.sin(k * Math.PI);
      zoom = 1 - 0.16 * Math.sin(k * Math.PI);
      if (t >= 0 && t < TRAJANJE) {
        brazdaCas += dt;
        if (brazdaCas > 0.07) { brazdaCas = 0; brazda(kanuKot); }
      }
      if (t >= TRAJANJE && potovanje.naCilj) {
        potovanje = null;
        cilj.slavje = cas + 7;
        onCilj();
      } else if (t >= TRAJANJE) {
        potovanje = null;
        prikazano = odklenjeno;
        osveziOznake();
        odklep = { t: 0, st: odklenjeno };
        const th1 = kotStopnje(odklenjeno);
        razpok(th1, xNa(th1), R + 1.2, [0xff4f8b, 0xffd23f, 0x19b5c9, 0xb388ff, 0x57cc99, 0xffffff], 70, 1.3, true);
        onOdklep(odklenjeno);
      }
    } else if (!vlece) {
      ciljKot += hitrost;
      hitrost *= 0.92;
    }
    ciljKot = THREE.MathUtils.clamp(ciljKot, 0, kotStopnje(n + 1) + ZA_CRTO);
    kot += (ciljKot - kot) * Math.min(1, dt * (potovanje ? 4 : 7));
    svet.rotation.x = kot;
    postaviKamero(zoom);
    animirajPiknik(dt);
    animirajRave();
    animirajPrigode();
    animirajCilj();
    animirajDanInNoc();
    posodobiDelce(dt);
    liki.forEach(l => {
      const skok = Math.pow(Math.max(0, Math.sin(cas * 1.7 + l.faza)), 12) * 0.7;
      l.s.position.copy(l.baza).addScaledVector(l.n, skok);
      const dih = 1 + Math.sin(cas * 3 + l.faza) * 0.03;
      l.s.scale.set(l.v / Math.sqrt(dih), l.v * dih, 1);
    });
    vodaMat.uniforms.uCas.value = cas;
    postaviKanu(kanuKot);
    if (odklep) odklep.t += dt;
    oznake.forEach(o => {
      const tren = o.st === prikazano;
      let s = tren ? 1.15 + Math.sin(cas * 4) * 0.07 : 1;
      let velN = tren ? 4.6 + Math.sin(cas * 4) * 0.15 : o.st > prikazano ? 2.8 : 3.4;
      if (odklep && o.st === odklep.st && odklep.t < 1.2) {
        // elastičen pok novega ploščka
        const t = odklep.t / 1.2;
        const el = 1 + Math.sin(t * Math.PI * 4) * Math.pow(1 - t, 2) * 0.7;
        s *= el;
        velN *= el;
      }
      o.plosk.scale.set(s, 1, s);
      o.napis.scale.set(velN, velN, 1);
      o.napis.position.copy(tocka(kotStopnje(o.st), xNa(kotStopnje(o.st)), R + (tren ? 6.6 : 2.6)));
    });
    if (odklep && odklep.t > 1.5) odklep = null;
    const thT = kotStopnje(prikazano);
    valovi.forEach(v => {
      const f = (cas * 0.55 + v.userData.faza) % 1;
      postavi(v, thT, xNa(thT), R + 0.12);
      v.scale.setScalar(1.1 + f * 1.6);
      v.children[0].material.opacity = potovanje ? 0 : 0.75 * (1 - f);
    });
    if (Math.abs(kot - kotSence) > 0.0003 || potovanje || odklep) {
      renderer.shadowMap.needsUpdate = true;
      kotSence = kot;
    }
    renderer.render(scene, camera);
  }

  // ---------- Javno ----------

  // podatki: { stStopenj, odklenjeno, zvezdice, prejsnje, onStopnja }
  function prikazi(vsebnik, podatki) {
    ({ odklenjeno, zvezdice, onStopnja } = podatki);
    onOdklep = podatki.onOdklep || (() => {});
    onCilj = podatki.onCilj || (() => {});
    if (!renderer) {
      ovoj = vsebnik;
      n = podatki.stStopenj;
      // telefon: nižja ločljivost risanja (1,5×) je skoraj enako ostra in pol cenejša
      const telefon = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, telefon ? 1.5 : 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false; // sence se preračunajo samo, ko se svet premakne
      ovoj.appendChild(renderer.domElement);
      zgradi();
      priklopiVnos(renderer.domElement);
    }
    const zaCrto = kotStopnje(n + 1) + ZA_CRTO;
    const cilj = podatki.naCilju || podatki.naCilj ? zaCrto : kotStopnje(Math.min(odklenjeno, n));
    if (podatki.naCilj) {
      kanuOd = kotStopnje(n);
      kanuDo = zaCrto;
      potovanje = { t: -0.9, naCilj: true };
      prikazano = n;
      kanuKot = kanuOd;
      kot = ciljKot = kanuOd;
    } else if (podatki.prejsnje && podatki.prejsnje < odklenjeno) {
      kanuOd = kotStopnje(podatki.prejsnje);
      kanuDo = cilj;
      potovanje = { t: -0.9 };
      prikazano = podatki.prejsnje;
      kanuKot = kanuOd;
      kot = ciljKot = kanuOd;
    } else {
      potovanje = null;
      prikazano = odklenjeno;
      kanuKot = cilj;
      kot = ciljKot = cilj;
    }
    hitrost = 0;
    const narisi = () => { osveziOznake(); if (napisPlatno) narisiNapisReke(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(narisi);
    narisi();
    tece = true;
    velikost();
    zadnji = performance.now();
    // največ ena zanka hkrati, tudi če se zemljevid odpre večkrat zapored
    if (!zankaTece) { zankaTece = true; requestAnimationFrame(zanka); }
  }

  function ustavi() { tece = false; }

  // za merjenje hitrosti: klici risanja in trikotniki zadnje slike
  const merilo = (podrobno) => podrobno ? (() => {
    const v = [];
    scene.traverse(o => { if (o.isMesh) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.count || 1); v.push([o.geometry.type, o.isInstancedMesh ? o.count : 1, Math.round(t), o.castShadow ? 'S' : '']); } });
    return v.sort((a, b) => b[2] - a[2]).slice(0, 25);
  })() : renderer && { ...renderer.info.render, predmeti: (() => { let n = 0; scene.traverse(() => n++); return n; })(), dpr: renderer.getPixelRatio() };

  return { podprt, prikazi, ustavi, nastaviNoc, merilo };
})();
