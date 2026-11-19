// prodotto.js – la pagina prodotto:
//   1. il "palco": gli occhiali 3D fermi al centro dello schermo che, mentre scorri,
//      girano, si smontano (l'esploso), chiudono le aste e cambiano colore
//   2. il "fotografo": un secondo renderer che fa i render realistici (sfondo chiaro,
//      ombra morbida sul piano) per la sezione Colori, la gamma e il telefono finto
//   3. le misure prese dal modello

import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { COLORI, ETICHETTE, stato, trovaColore, caricaOcchiali, creaStudio } from './sguardi-3d.js';

const limita = function(x, a, b) { return Math.min(b, Math.max(a, x)); };
const morbido = function(t) { return t * t * (3 - 2 * t); };   // parte e arriva piano
const muoviPiano = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;


// ======================================================================
// 1. IL PALCO
// ======================================================================
const palco = document.querySelector('.palco');
const fisso = palco.querySelector('.palco-fisso');
const tela = palco.querySelector('.palco-tela');
const livelloEtichette = palco.querySelector('.palco-etichette');
const testi = Array.from(palco.querySelectorAll('.palco-testo'));
const nomeColorePalco = palco.querySelector('.palco-colore-nome');
const pallinoColorePalco = palco.querySelector('.palco-colore-pallino');

const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;   // non "brucia" i colori
renderer.setClearColor(0xf5f5f7, 1);

const scena = new THREE.Scene();
scena.environment = creaStudio(renderer, true);
// lo sfondo: chiaro, con un alone bianco dietro gli occhiali (si vede anche attraverso le lenti)
scena.background = (function() {
    const t = document.createElement('canvas');
    t.width = 512;
    t.height = 512;
    const g = t.getContext('2d');
    const sfumatura = g.createRadialGradient(256, 270, 0, 256, 270, 300);
    sfumatura.addColorStop(0, '#ffffff');
    sfumatura.addColorStop(0.6, '#f5f5f7');
    sfumatura.addColorStop(1, '#e4e4e9');
    g.fillStyle = sfumatura;
    g.fillRect(0, 0, 512, 512);
    const texture = new THREE.CanvasTexture(t);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
})();
// una luce principale (fa i punti di luce sulla vernice) e una fredda da dietro (accende i bordi)
const luceChiave = new THREE.DirectionalLight(0xffffff, 1.4);
luceChiave.position.set(2, 3, 4);
scena.add(luceChiave);
const luceBordo = new THREE.DirectionalLight(0xcfe0ff, 1.2);
luceBordo.position.set(-3, 1.5, -3);
scena.add(luceBordo);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);

// le "fermate" del racconto: p = a che punto dello scorrimento (0…1)
// az = giro attorno (0 = davanti), el = quanto dall'alto, d = distanza,
// perno = 1 se si guarda la cerniera da vicino, e = esploso, f = aste piegate
// ty / tx = di quanto spostare il punto guardato (così gli occhiali non finiscono sotto i testi)
const CHIAVI = [
    { p: 0.00, az: 0,     el: 0.10, d: 3.3,  tx: 0,     ty: 0.2,  perno: 0, e: 0, f: 0 },
    { p: 0.10, az: 0,     el: 0.10, d: 3.0,  tx: 0,     ty: 0.17, perno: 0, e: 0, f: 0 },
    { p: 0.28, az: -0.72, el: 0.30, d: 2.3,  tx: -0.38, ty: 0,    perno: 0, e: 0, f: 0 },
    { p: 0.38, az: -0.6,  el: 0.5,  d: 3.0,  tx: 0,     ty: 0,    perno: 0, e: 0, f: 0 },
    { p: 0.50, az: -0.55, el: 0.55, d: 3.5,  tx: 0,     ty: 0.1,  perno: 0, e: 1, f: 0 },
    { p: 0.60, az: -0.75, el: 0.5,  d: 3.5,  tx: 0,     ty: 0.1,  perno: 0, e: 1, f: 0 },
    { p: 0.70, az: 1.05,  el: 0.32, d: 1.5,  tx: -0.3,  ty: 0,    perno: 1, e: 0, f: 0 },
    { p: 0.77, az: 0.75,  el: 0.38, d: 1.4,  tx: -0.3,  ty: 0,    perno: 1, e: 0, f: 0 },
    { p: 0.83, az: 0.45,  el: 0.16, d: 2.8,  tx: 0,     ty: -0.12, perno: 0, e: 0, f: 0 },
    { p: 1.00, az: 0.45,  el: 0.16, d: 2.8,  tx: 0,     ty: -0.12, perno: 0, e: 0, f: 0 }
];
const INIZIO_COLORI = 0.84;

function posaDelRacconto(p) {
    let i = 0;
    while (i < CHIAVI.length - 2 && p > CHIAVI[i + 1].p) {
        i++;
    }
    const a = CHIAVI[i];
    const b = CHIAVI[i + 1];
    const t = morbido(limita((p - a.p) / (b.p - a.p), 0, 1));
    const mix = function(k) { return a[k] + (b[k] - a[k]) * t; };
    return { az: mix('az'), el: mix('el'), d: mix('d'), tx: mix('tx'), ty: mix('ty'), perno: mix('perno'), e: mix('e'), f: mix('f') };
}

let occhiali = null;
const perno = new THREE.Vector3();
const guarda = new THREE.Vector3();
let progressoLiscio = 0;
let mouseX = 0;
let mouseY = 0;
let coloreAttuale = '';

// le etichette dell'esploso
const etichette = ETICHETTE.map(function(dati) {
    const el = document.createElement('div');
    el.className = 'etichetta';
    el.innerHTML = '<span class="etichetta-linea"></span><span class="etichetta-nome"></span>';
    el.querySelector('.etichetta-nome').textContent = dati.testo;
    livelloEtichette.appendChild(el);
    return { dati: dati, el: el, punto: new THREE.Vector3() };
});

function progressoPalco() {
    const r = palco.getBoundingClientRect();
    const corsa = r.height - window.innerHeight;
    return corsa > 0 ? limita(-r.top / corsa, 0, 1) : 0;
}

function adattaPalco() {
    const l = fisso.clientWidth;
    const a = fisso.clientHeight;
    renderer.setSize(l, a, false);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', adattaPalco);
adattaPalco();

window.addEventListener('pointermove', function(e) {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
});

let palcoVisibile = true;
new IntersectionObserver(function(voci) {
    palcoVisibile = voci[0].isIntersecting;
}).observe(palco);

function aggiornaTesti(p) {
    testi.forEach(function(t) {
        const da = Number(t.dataset.da);
        const a = Number(t.dataset.a);
        const sfuma = 0.035;
        let o = Math.min(limita((p - da) / sfuma, 0, 1), limita((a - p) / sfuma, 0, 1));
        if (da === 0) {
            o = limita((a - p) / sfuma, 0, 1);   // il titolo c'è già all'inizio
        }
        t.style.opacity = o;
        t.style.transform = 'translateY(' + ((1 - o) * 24).toFixed(1) + 'px)';
    });
}

function aggiornaEtichette(esploso) {
    const o = limita((esploso - 0.6) / 0.35, 0, 1);
    const l = fisso.clientWidth;
    const a = fisso.clientHeight;
    etichette.forEach(function(et) {
        et.el.style.opacity = o;
        if (o <= 0) {
            return;
        }
        occhiali.ancora(et.dati.parte, et.dati.lato, et.dati.punto, et.punto);
        et.punto.project(camera);
        const x = (et.punto.x * 0.5 + 0.5) * l;
        const y = (-et.punto.y * 0.5 + 0.5) * a;
        et.el.classList.toggle('a-sinistra', x < l / 2);
        et.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    });
}

function cambiaColorePalco(colore) {
    if (coloreAttuale === colore.id) {
        return;
    }
    coloreAttuale = colore.id;
    occhiali.colore(colore, false);
    nomeColorePalco.textContent = colore.nome;
    pallinoColorePalco.style.backgroundColor = colore.pallino;
}

const orologio = new THREE.Clock();
function anima() {
    requestAnimationFrame(anima);
    if (!occhiali || !palcoVisibile) {
        return;
    }
    const tempo = orologio.getElapsedTime();
    const p = progressoPalco();
    // come su un sito Apple: la scena insegue lo scorrimento con un po' di inerzia
    progressoLiscio += (p - progressoLiscio) * (muoviPiano ? 0.09 : 1);
    const q = progressoLiscio;
    const posa = posaDelRacconto(q);

    occhiali.posa(posa.e, posa.f);

    // i colori: prima quello scelto, alla fine del racconto passano tutti
    if (q >= INIZIO_COLORI) {
        const n = Math.min(COLORI.length - 1, Math.floor((q - INIZIO_COLORI) / (1 - INIZIO_COLORI) * COLORI.length));
        cambiaColorePalco(COLORI[n]);
    } else {
        cambiaColorePalco(trovaColore(stato.colore));
    }
    occhiali.passo(0.08);

    // la camera
    let az = posa.az;
    let el = posa.el;
    if (muoviPiano) {
        const calma = 1 - posa.perno;
        az += Math.sin(tempo * 0.35) * 0.12 * limita(1 - q / 0.12, 0, 1);   // all'inizio dondola piano
        az += mouseX * 0.18 * calma;
        el += mouseY * 0.08 * calma;
    }
    if (q > INIZIO_COLORI) {
        az += (q - INIZIO_COLORI) * 5;   // alla fine girano mentre cambiano colore
    }
    // sullo schermo del telefono (stretto e alto) la camera si allontana
    const lontano = Math.max(1, 1.15 / camera.aspect);
    const d = posa.d * (posa.perno > 0.5 ? Math.sqrt(lontano) : lontano);

    scena.updateMatrixWorld();
    occhiali.ancora('ferramenta', 1, [0.5, 0.5, 0.5], perno);
    guarda.set(0, 0, 0).lerp(perno, posa.perno);
    camera.position.set(
        guarda.x + Math.sin(az) * Math.cos(el) * d,
        guarda.y + Math.sin(el) * d,
        guarda.z + Math.cos(az) * Math.cos(el) * d
    );
    camera.lookAt(guarda);
    // sposta l'inquadratura (non gli occhiali): tx verso destra, ty verso l'alto dello schermo
    // sul telefono i testi stanno sotto, quindi niente spostamento di lato
    const spostaX = camera.aspect < 1 ? 0 : posa.tx * d;
    const spostaY = (camera.aspect < 1 ? Math.max(posa.ty, 0) + 0.06 : posa.ty) * d;
    camera.translateX(spostaX * 0.35);
    camera.translateY(spostaY * 0.35);
    camera.updateMatrixWorld();

    aggiornaTesti(q);
    aggiornaEtichette(posa.e);
    renderer.render(scena, camera);
}

caricaOcchiali().then(function(o) {
    occhiali = o;
    scena.add(o.gruppo);
    o.colore(trovaColore(stato.colore), true);
    coloreAttuale = stato.colore;
    nomeColorePalco.textContent = trovaColore(stato.colore).nome;
    palco.querySelector('.palco-attesa').remove();
    tela.classList.add('pronta');
    scriviMisure(o.misure);
}).catch(function(errore) {
    console.error(errore);
    palco.querySelector('.palco-attesa').textContent = 'Non riesco a caricare gli occhiali: apri la pagina da un server (es. http://localhost).';
});
anima();

// ?p=0.5 nell'indirizzo: la pagina si apre a quel punto del racconto (comodo per controllare)
const pIniziale = Number(new URLSearchParams(location.search).get('p'));
if (pIniziale > 0) {
    window.scrollTo(0, palco.offsetTop + (palco.offsetHeight - window.innerHeight) * pIniziale);
    progressoLiscio = pIniziale;
}

// i link della barra che portano a un punto preciso del racconto (es. l'esploso)
document.querySelectorAll('[data-vai]').forEach(function(link) {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const corsa = palco.offsetHeight - window.innerHeight;
        window.scrollTo({ top: palco.offsetTop + corsa * Number(link.dataset.vai), behavior: 'smooth' });
    });
});


// ======================================================================
// 2. IL FOTOGRAFO: i render realistici
// ======================================================================
const LARGHEZZA_FOTO = 2000;
const ALTEZZA_FOTO = 1250;

// i punti di vista (gli occhiali sono appoggiati su un piano)
const ANGOLI = {
    treQuarti: { az: -0.62, el: 0.36, d: 2.25 },
    fronte:    { az: 0,     el: 0.1,  d: 2.15 },
    lato:      { az: -1.45, el: 0.12, d: 2.3 },
    alto:      { az: -0.25, el: 1.05, d: 2.4 }
};

const fotografo = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
fotografo.setPixelRatio(1);
fotografo.setSize(LARGHEZZA_FOTO, ALTEZZA_FOTO, false);
fotografo.toneMapping = THREE.NeutralToneMapping;
fotografo.toneMappingExposure = 1.05;

const set = new THREE.Scene();
const coloreSfondo = new THREE.Color('#f5f5f7');
set.background = coloreSfondo;
set.environment = creaStudio(fotografo, true);
const luceSet = new THREE.DirectionalLight(0xffffff, 1.2);
luceSet.position.set(1.5, 4, 3);
set.add(luceSet);
const cameraSet = new THREE.PerspectiveCamera(26, LARGHEZZA_FOTO / ALTEZZA_FOTO, 0.01, 50);

// l'ombra "di contatto": guardiamo gli occhiali da sotto, disegniamo la loro sagoma scura
// e la sfochiamo due volte: diventa un'ombra morbida che sta sul piano (come in studio)
function creaOmbra(renderer, scena, larghezza, profondita, altezza) {
    const gruppo = new THREE.Group();
    const bersaglio = new THREE.WebGLRenderTarget(1024, 1024);
    bersaglio.texture.generateMipmaps = false;
    const bersaglioSfocato = new THREE.WebGLRenderTarget(1024, 1024);
    bersaglioSfocato.texture.generateMipmaps = false;

    const forma = new THREE.PlaneGeometry(larghezza, profondita).rotateX(Math.PI / 2);
    const piano = new THREE.Mesh(forma, new THREE.MeshBasicMaterial({
        map: bersaglio.texture, transparent: true, opacity: 0.85, depthWrite: false
    }));
    piano.renderOrder = 1;
    piano.scale.y = -1;
    gruppo.add(piano);
    const pianoSfoca = new THREE.Mesh(forma);
    pianoSfoca.visible = false;
    gruppo.add(pianoSfoca);

    const cameraOmbra = new THREE.OrthographicCamera(-larghezza / 2, larghezza / 2, profondita / 2, -profondita / 2, 0, altezza);
    cameraOmbra.rotation.x = Math.PI / 2;   // guarda in su
    gruppo.add(cameraOmbra);

    const sagoma = new THREE.MeshDepthMaterial();
    sagoma.userData.buio = { value: 1.6 };
    sagoma.onBeforeCompile = function(shader) {
        shader.uniforms.buio = sagoma.userData.buio;
        shader.fragmentShader = 'uniform float buio;\n' + shader.fragmentShader.replace(
            'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
            'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * buio );'
        );
    };
    sagoma.depthTest = false;
    sagoma.depthWrite = false;

    const sfocaO = new THREE.ShaderMaterial(HorizontalBlurShader);
    sfocaO.depthTest = false;
    const sfocaV = new THREE.ShaderMaterial(VerticalBlurShader);
    sfocaV.depthTest = false;

    function sfoca(quanto) {
        pianoSfoca.visible = true;
        pianoSfoca.material = sfocaO;
        sfocaO.uniforms.tDiffuse.value = bersaglio.texture;
        sfocaO.uniforms.h.value = quanto / 256;
        renderer.setRenderTarget(bersaglioSfocato);
        renderer.render(pianoSfoca, cameraOmbra);
        pianoSfoca.material = sfocaV;
        sfocaV.uniforms.tDiffuse.value = bersaglioSfocato.texture;
        sfocaV.uniforms.v.value = quanto / 256;
        renderer.setRenderTarget(bersaglio);
        renderer.render(pianoSfoca, cameraOmbra);
        pianoSfoca.visible = false;
    }

    function disegna() {
        const sfondo = scena.background;
        const ambiente = scena.environment;
        scena.background = null;
        scena.environment = null;
        piano.visible = false;
        scena.overrideMaterial = sagoma;
        const trasparenza = renderer.getClearAlpha();
        renderer.setClearAlpha(0);
        renderer.setRenderTarget(bersaglio);
        renderer.clear();
        renderer.render(scena, cameraOmbra);
        scena.overrideMaterial = null;
        sfoca(1.2);
        sfoca(0.5);
        renderer.setRenderTarget(null);
        renderer.setClearAlpha(trasparenza);
        scena.background = sfondo;
        scena.environment = ambiente;
        piano.visible = true;
    }
    return { gruppo: gruppo, disegna: disegna };
}

let occhialiSet = null;
let ombra = null;
const centroSet = new THREE.Vector3();
const renders = {};          // 'ciliegia|treQuarti' → indirizzo dell'immagine
let fila = Promise.resolve();   // un render alla volta

async function preparaSet() {
    occhialiSet = await caricaOcchiali();
    const g = occhialiSet.gruppo;
    set.add(g);
    // gli occhiali appoggiati sul piano (y = 0)
    g.updateMatrixWorld(true);
    const scatola = new THREE.Box3().setFromObject(g);
    g.position.y = -scatola.min.y;
    g.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(g).getCenter(centroSet);
    ombra = creaOmbra(fotografo, set, 3, 3, 0.35);
    set.add(ombra.gruppo);
    ombra.disegna();
}

// angolo 'telefono': di fronte, senza sfondo né ombra (un PNG trasparente)
function scatta(idColore, angolo) {
    const chiave = idColore + '|' + angolo;
    const trasparente = angolo === 'telefono';
    if (renders[chiave]) {
        return renders[chiave];
    }
    renders[chiave] = fila = fila.then(function() {
        const a = ANGOLI[trasparente ? 'fronte' : angolo];
        occhialiSet.colore(trovaColore(idColore), true);
        set.background = trasparente ? null : coloreSfondo;
        ombra.gruppo.visible = !trasparente;
        fotografo.setClearColor(0x000000, 0);
        cameraSet.position.set(
            centroSet.x + Math.sin(a.az) * Math.cos(a.el) * a.d,
            centroSet.y + Math.sin(a.el) * a.d,
            centroSet.z + Math.cos(a.az) * Math.cos(a.el) * a.d
        );
        cameraSet.lookAt(centroSet.x, centroSet.y - 0.02, centroSet.z);
        fotografo.render(set, cameraSet);
        return new Promise(function(fatto) {
            fotografo.domElement.toBlob(function(blob) {
                fatto(URL.createObjectURL(blob));
            }, trasparente ? 'image/png' : 'image/jpeg', 0.92);
        });
    }).then(function(url) {
        // lascia respirare la pagina tra un render e l'altro
        return new Promise(function(fatto) { setTimeout(function() { fatto(url); }, 30); });
    });
    return renders[chiave];
}


// ======================================================================
// 3. LA SEZIONE COLORI, LA GAMMA E IL TELEFONO
// ======================================================================
const vetrinaFoto = document.querySelector('.vetrina-foto');
const vetrinaAttesa = document.querySelector('.vetrina-attesa');
const vetrinaNome = document.querySelector('.vetrina-nome');
const vetrinaTesto = document.querySelector('.vetrina-testo');
const vetrinaScarica = document.querySelector('.vetrina-scarica');
const pallini = document.querySelector('.vetrina-pallini');
const angoli = document.querySelector('.vetrina-angoli');
const gamma = document.querySelector('.gamma-griglia');
const telefonoFoto = document.querySelector('.telefono-foto');
const telefonoNome = document.querySelector('.telefono-nome');
const telefonoPallini = document.querySelector('.telefono-pallini');
let angoloScelto = 'treQuarti';
let richiestaVetrina = 0;

COLORI.forEach(function(c) {
    const b = document.createElement('button');
    b.className = 'pallino';
    b.dataset.colore = c.id;
    b.style.backgroundColor = c.pallino;
    b.setAttribute('aria-label', c.nome);
    b.title = c.nome;
    pallini.appendChild(b);

    const s = document.createElement('span');
    s.dataset.colore = c.id;
    s.style.backgroundColor = c.pallino;
    telefonoPallini.appendChild(s);

    const scheda = document.createElement('button');
    scheda.className = 'gamma-scheda';
    scheda.dataset.colore = c.id;
    scheda.innerHTML = '<div class="gamma-foto"><img alt=""></div><strong></strong><span></span>';
    scheda.querySelector('strong').textContent = c.nome;
    scheda.querySelector('span').textContent = (c.metallo === '#d4b47c' ? 'Cerniere oro' : 'Cerniere argento') + ' · ' + (c.cristallo ? 'montatura trasparente' : 'acetato lucido');
    scheda.querySelector('img').alt = 'Gli occhiali Sguardi in ' + c.nome;
    gamma.appendChild(scheda);
});

// scegliere un colore: cambia la vetrina, il telefono, il palco e la prova virtuale
function scegliColore(id) {
    const c = trovaColore(id);
    stato.colore = c.id;
    pallini.querySelectorAll('.pallino').forEach(function(b) {
        b.classList.toggle('selected', b.dataset.colore === c.id);
    });
    telefonoPallini.querySelectorAll('span').forEach(function(s) {
        s.classList.toggle('selected', s.dataset.colore === c.id);
    });
    vetrinaNome.textContent = c.nome;
    vetrinaTesto.textContent = c.testo;
    telefonoNome.textContent = c.nome;
    mostraVetrina();
    if (occhialiSet) {
        scatta(c.id, 'telefono').then(function(url) {
            if (stato.colore === c.id) {
                telefonoFoto.src = url;
            }
        });
    }
    document.dispatchEvent(new CustomEvent('sguardi:colore', { detail: c.id }));
}

function mostraVetrina() {
    if (!occhialiSet) {
        return;
    }
    const questa = ++richiestaVetrina;
    const c = trovaColore(stato.colore);
    vetrinaFoto.classList.remove('visibile');
    vetrinaAttesa.hidden = false;
    scatta(c.id, angoloScelto).then(function(url) {
        if (questa !== richiestaVetrina) {
            return;
        }
        vetrinaFoto.onload = function() {
            vetrinaFoto.classList.add('visibile');
            vetrinaAttesa.hidden = true;
        };
        vetrinaFoto.src = url;
        vetrinaFoto.alt = 'Render degli occhiali Sguardi in ' + c.nome + ', vista ' + angoli.querySelector('.selected').textContent.toLowerCase();
        vetrinaScarica.href = url;
        vetrinaScarica.download = 'sguardi-' + c.id + '-' + angoloScelto + '.jpg';
    });
}

pallini.addEventListener('click', function(e) {
    const b = e.target.closest('.pallino');
    if (b) {
        scegliColore(b.dataset.colore);
    }
});
angoli.addEventListener('click', function(e) {
    const b = e.target.closest('button');
    if (!b) {
        return;
    }
    angoloScelto = b.dataset.angolo;
    angoli.querySelectorAll('button').forEach(function(x) {
        x.classList.toggle('selected', x === b);
    });
    mostraVetrina();
});
gamma.addEventListener('click', function(e) {
    const s = e.target.closest('.gamma-scheda');
    if (s) {
        scegliColore(s.dataset.colore);
        document.getElementById('colori').scrollIntoView({ behavior: 'smooth' });
    }
});
// quando la prova virtuale cambia colore, la pagina lo segue
document.addEventListener('sguardi:colore-prova', function(e) {
    scegliColore(e.detail);
});

function scriviMisure(misure) {
    document.querySelectorAll('[data-misura]').forEach(function(el) {
        const v = misure[el.dataset.misura];
        if (v) {
            el.textContent = v;
        }
    });
}

scegliColore(stato.colore);
preparaSet().then(function() {
    mostraVetrina();
    scatta(stato.colore, 'telefono').then(function(url) { telefonoFoto.src = url; });
    // poi, con calma, tutta la gamma
    COLORI.forEach(function(c) {
        scatta(c.id, 'treQuarti').then(function(url) {
            gamma.querySelector('[data-colore="' + c.id + '"] img').src = url;
        });
    });
}).catch(function(errore) {
    console.error(errore);
    vetrinaAttesa.textContent = 'Non riesco a preparare i render.';
});
