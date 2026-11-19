// sguardi-3d.js – il "cuore" condiviso della pagina prodotto (prodotto.html)
// qui ci sono:
//   - i colori degli occhiali
//   - il caricamento del modello occhialis.glb, centrato e largo 1
//   - i materiali realistici (acetato lucido, lenti in vetro, metallo)
//   - l'esploso (le parti che si allontanano) e le aste che si chiudono
//   - lo "studio fotografico": una stanza con dei pannelli luminosi che si riflette sugli occhiali
// lo usano js/prodotto.js (il palco e i render) e js/prodotto-prova.js (la prova con la fotocamera)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// il file degli occhiali: i gruppi dentro si chiamano struttura, aste, lenti, gomma, ferramenta
export const FILE_OCCHIALI = 'occhialis.glb';
const PARTI = ['struttura', 'aste', 'lenti', 'gomma', 'ferramenta'];

// i colori: montatura = frontale e aste, gomma = naselli e terminali, metallo = cerniere
// cristallo: true vuol dire montatura trasparente come il vetro
export const COLORI = [
    { id: 'ciliegia',   nome: 'Ciliegia',   pallino: '#8a1626', montatura: '#6e0f1c', gomma: '#4a0a13', metallo: '#d4b47c', lenti: '#6a4f3c',
      testo: 'Un rosso profondo e lucido, come una ciliegia matura. Lenti fumé calde e cerniere color oro.' },
    { id: 'mezzanotte', nome: 'Mezzanotte', pallino: '#1c1c1f', montatura: '#0d0d0f', gomma: '#141416', metallo: '#c8ccd2', lenti: '#48505a',
      testo: 'Il nero più elegante, per ogni giorno e ogni sera. Lenti grigie che non cambiano i colori, cerniere argento.' },
    { id: 'cristallo',  nome: 'Cristallo',  pallino: '#e3ecef', montatura: '#f3f7f8', gomma: '#e6eef0', metallo: '#d9dcdf', lenti: '#7a848c', cristallo: true,
      testo: 'Trasparenti come il vetro: la luce attraversa la montatura e la fa brillare. Cerniere argento in vista.' },
    { id: 'oceano',     nome: 'Blu oceano', pallino: '#1d3a66', montatura: '#132a4d', gomma: '#0f2240', metallo: '#c8ccd2', lenti: '#4a5b6e',
      testo: 'Un blu profondo che da lontano sembra nero e alla luce si accende. Lenti blu fumé e cerniere argento.' },
    { id: 'salvia',     nome: 'Salvia',     pallino: '#7f9173', montatura: '#6f8064', gomma: '#5b6a52', metallo: '#d4b47c', lenti: '#56664c',
      testo: 'Un verde morbido e naturale, che si abbina a tutto. Lenti verdi classiche e cerniere color oro.' },
    { id: 'sabbia',     nome: 'Sabbia',     pallino: '#e0cfb0', montatura: '#d9c7a6', gomma: '#cbb592', metallo: '#d4b47c', lenti: '#7a5e47',
      testo: 'Il colore caldo delle dune: luminoso, discreto, estivo. Lenti marroni e cerniere color oro.' },
    { id: 'tramonto',   nome: 'Tramonto',   pallino: '#e5532a', montatura: '#d9461a', gomma: '#b8370f', metallo: '#c8ccd2', lenti: '#66412a',
      testo: 'Un arancio acceso, per chi vuole farsi notare. Lenti bronzo e cerniere argento.' }
];

// il colore scelto, condiviso tra la pagina e la prova virtuale
export const stato = { colore: 'ciliegia' };

export function trovaColore(id) {
    return COLORI.find(function(c) { return c.id === id; }) || COLORI[0];
}

// le etichette dell'esploso: quale parte, da che lato (1 destra, -1 sinistra, 0 centro)
// e in che punto della sua scatola (0…1 in x, y, z) si attacca la linea
export const ETICHETTE = [
    { testo: 'Frontale in acetato', parte: 'struttura',  lato: 0,  punto: [0.18, 1, 0.8] },
    { testo: 'Lenti',               parte: 'lenti',      lato: 1,  punto: [0.6, 0.6, 1] },
    { testo: 'Cerniere in metallo', parte: 'ferramenta', lato: 1,  punto: [0.5, 1, 0.5] },
    { testo: 'Aste',                parte: 'aste',       lato: -1, punto: [0.5, 1, 0.45] },
    { testo: 'Naselli',             parte: 'gomma',      lato: 0,  punto: [0.5, 0, 0.5] },
    { testo: 'Terminali',           parte: 'gomma',      lato: 1,  punto: [0.5, 0.4, 0.1] }
];


// ===== lo studio fotografico =====
// una stanza scura con dei pannelli bianchi "più che bianchi" (come i softbox dei fotografi):
// gli occhiali lucidi li riflettono e sembrano fotografati
export function creaStudio(renderer, chiaro) {
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(
        new THREE.SphereGeometry(20, 32, 16),
        new THREE.MeshBasicMaterial({ color: chiaro ? 0x6d6d70 : 0x18181a, side: THREE.BackSide })
    ));
    function pannello(larghezza, altezza, x, y, z, forza) {
        const p = new THREE.Mesh(
            new THREE.PlaneGeometry(larghezza, altezza),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(forza), side: THREE.DoubleSide })
        );
        p.position.set(x, y, z);
        p.lookAt(0, 0, 0);
        studio.add(p);
    }
    pannello(9, 9, 0, 12, 0, chiaro ? 4 : 3);           // il grande softbox dall'alto
    pannello(1.2, 12, -8, 2, 4, chiaro ? 4 : 2.2);       // la striscia a sinistra (fa le righe di luce)
    pannello(1.2, 12, 8, 2, 4, chiaro ? 4 : 2.2);        // la striscia a destra
    pannello(12, 2.5, 0, 3, -10, 3);                     // il controluce dietro (illumina i bordi)
    if (chiaro) {
        pannello(6, 3, 2, 0.5, 10, 2);                   // una luce davanti, morbida
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(studio, 0.02).texture;
    pmrem.dispose();
    return ambiente;
}


// ===== i materiali =====
// video: true per la prova con la fotocamera (lì il "vetro vero" non funziona sopra al video,
// quindi lenti e cristallo diventano semplicemente semitrasparenti)
function creaMateriali(video) {
    const acetato = new THREE.MeshPhysicalMaterial({
        roughness: 0.13,
        clearcoat: 1,               // la vernice lucida sopra
        clearcoatRoughness: 0.03,
        ior: 1.5,
        specularIntensity: 1,
        thickness: 0.05,            // per il cristallo: quanto è "spesso" il vetro
        attenuationColor: new THREE.Color('#dfeceb'),
        attenuationDistance: 0.6
    });
    const m = {
        struttura: acetato,
        aste: acetato.clone(),
        gomma: new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
        ferramenta: new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.16 }),
        lenti: null
    };
    if (video) {
        m.lenti = new THREE.MeshPhysicalMaterial({
            transparent: true, opacity: 0.62, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0,
            depthWrite: false, side: THREE.DoubleSide
        });
    } else {
        m.lenti = new THREE.MeshPhysicalMaterial({
            transmission: 1, roughness: 0.02, ior: 1.52, thickness: 0.015,
            clearcoat: 1, clearcoatRoughness: 0, specularIntensity: 1
        });
    }
    return m;
}


// ===== il modello =====
let promessaFile = null;
function caricaFile() {
    if (!promessaFile) {
        promessaFile = new GLTFLoader().loadAsync(FILE_OCCHIALI);
    }
    return promessaFile;
}

function trovaParte(oggetto) {
    let o = oggetto;
    while (o) {
        if (PARTI.includes(o.name)) {
            return o.name;
        }
        o = o.parent;
    }
    return 'struttura';
}

// di quanto si sposta ogni pezzo nell'esploso (in "larghezze di occhiali"; davanti è +z)
function spintaEsploso(pezzo) {
    const s = pezzo.lato;
    switch (pezzo.parte) {
        case 'lenti':      return new THREE.Vector3(s * 0.06, 0.04, 0.32);
        case 'ferramenta': return new THREE.Vector3(s * 0.2, 0.14, 0.06);
        case 'aste':       return new THREE.Vector3(s * 0.3, 0, -0.12);
        case 'gomma':      return s === 0 ? new THREE.Vector3(0, -0.26, -0.05) : new THREE.Vector3(s * 0.42, -0.02, -0.42);
        default:           return new THREE.Vector3();
    }
}

// carica gli occhiali e restituisce un oggetto con tutto quello che serve
export async function caricaOcchiali(opzioni) {
    const video = !!(opzioni && opzioni.video);
    const file = await caricaFile();
    const interno = file.scene.clone(true);
    const materiali = creaMateriali(video);

    interno.updateMatrixWorld(true);
    const scatola = new THREE.Box3().setFromObject(interno);
    const misura = scatola.getSize(new THREE.Vector3());
    const centro = scatola.getCenter(new THREE.Vector3());
    const L = misura.x;   // la larghezza degli occhiali nel file (in metri)

    // ogni pezzo: a che parte appartiene, da che lato sta, la sua scatola
    const pezzi = [];
    interno.traverse(function(o) {
        if (!o.isMesh) {
            return;
        }
        const parte = trovaParte(o);
        o.material = materiali[parte];
        const b = new THREE.Box3().setFromObject(o);
        const c = b.getCenter(new THREE.Vector3());
        o.geometry.computeBoundingBox();
        const pezzo = {
            mesh: o,
            parte: parte,
            lato: Math.abs(c.x - centro.x) < L * 0.08 ? 0 : Math.sign(c.x - centro.x),
            scatolaLocale: o.geometry.boundingBox.clone(),
            base: o.position.clone()
        };
        pezzo.spinta = spintaEsploso(pezzo).multiplyScalar(L);
        pezzi.push(pezzo);
    });

    // i perni delle cerniere: le aste ruotano attorno a questi punti quando si chiudono
    const perni = {};
    [-1, 1].forEach(function(lato) {
        const cerniera = pezzi.find(function(p) { return p.parte === 'ferramenta' && p.lato === lato; });
        if (cerniera) {
            perni[lato] = new THREE.Box3().setFromObject(cerniera.mesh).getCenter(new THREE.Vector3());
        } else {
            perni[lato] = new THREE.Vector3(centro.x + lato * L / 2, centro.y, scatola.max.z - misura.z * 0.1);
        }
    });

    // le misure vere (il file è in metri): servono per la scheda tecnica
    function misuraParte(nome) {
        const b = new THREE.Box3();
        pezzi.forEach(function(p) {
            if (p.parte === nome) {
                b.union(new THREE.Box3().setFromObject(p.mesh));
            }
        });
        return b.isEmpty() ? null : b.getSize(new THREE.Vector3());
    }
    const frontale = misuraParte('struttura') || misura;
    const aste = misuraParte('aste') || misura;
    const lente = pezzi.find(function(p) { return p.parte === 'lenti' && p.lato === 1; });
    const misureLente = lente ? new THREE.Box3().setFromObject(lente.mesh).getSize(new THREE.Vector3()) : null;
    const misure = {
        larghezza: Math.round(L * 1000),
        altezza: Math.round(frontale.y * 1000),
        profondita: Math.round(misura.z * 1000),
        aste: Math.round(aste.z * 1000),
        lenteLarga: misureLente ? Math.round(misureLente.x * 1000) : null,
        lenteAlta: misureLente ? Math.round(misureLente.y * 1000) : null
    };

    // il gruppo che si usa fuori: centrato in (0, 0, 0) e largo 1
    interno.position.copy(centro).negate();
    const gruppo = new THREE.Group();
    gruppo.scale.setScalar(1 / L);
    gruppo.add(interno);

    // esploso: 0 = montati, 1 = tutti separati. piega: 0 = aste aperte, 1 = chiuse a metà
    const q = new THREE.Quaternion();
    const asseY = new THREE.Vector3(0, 1, 0);
    function posa(esploso, piega) {
        pezzi.forEach(function(p) {
            p.mesh.position.copy(p.base).addScaledVector(p.spinta, esploso);
            const siPiega = p.lato !== 0 && (p.parte === 'aste' || p.parte === 'gomma');
            if (siPiega && piega > 0) {
                const perno = perni[p.lato];
                q.setFromAxisAngle(asseY, piega * p.lato * 0.8);
                // ruotare attorno al perno = ruotare attorno all'origine e poi spostare
                p.mesh.quaternion.copy(q);
                p.mesh.position.add(perno).sub(perno.clone().applyQuaternion(q));
                if (p.lato < 0) {
                    p.mesh.position.y -= L * 0.012 * piega;   // un'asta passa appena sotto l'altra
                }
            } else {
                p.mesh.quaternion.identity();
            }
        });
    }

    // il punto (nel mondo) dove attaccare un'etichetta o puntare la camera
    function ancora(parte, lato, punto, fuori) {
        const p = pezzi.find(function(x) { return x.parte === parte && x.lato === lato; }) ||
                  pezzi.find(function(x) { return x.parte === parte; });
        fuori = fuori || new THREE.Vector3();
        if (!p) {
            return fuori.set(0, 0, 0);
        }
        const b = p.scatolaLocale;
        fuori.set(
            b.min.x + (b.max.x - b.min.x) * punto[0],
            b.min.y + (b.max.y - b.min.y) * punto[1],
            b.min.z + (b.max.z - b.min.z) * punto[2]
        );
        return p.mesh.localToWorld(fuori);
    }

    // i colori: si va verso il colore scelto un po' alla volta (passo) o subito
    const obiettivo = {
        struttura: new THREE.Color(), aste: new THREE.Color(), gomma: new THREE.Color(),
        ferramenta: new THREE.Color(), lenti: new THREE.Color(), vetro: 0
    };
    function colore(c, subito) {
        obiettivo.struttura.set(c.montatura);
        obiettivo.aste.set(c.aste || c.montatura);
        obiettivo.gomma.set(c.gomma);
        obiettivo.ferramenta.set(c.metallo);
        obiettivo.lenti.set(c.lenti);
        obiettivo.vetro = c.cristallo ? 1 : 0;
        if (subito) {
            passo(1);
        }
    }
    function passo(quanto) {
        ['struttura', 'aste', 'gomma', 'ferramenta', 'lenti'].forEach(function(nome) {
            materiali[nome].color.lerp(obiettivo[nome], quanto);
        });
        ['struttura', 'aste', 'gomma'].forEach(function(nome) {
            const m = materiali[nome];
            if (video) {
                // sopra al video: il cristallo è plastica semitrasparente
                const voluta = obiettivo.vetro ? 0.38 : 1;
                m.opacity += (voluta - m.opacity) * quanto;
                const trasparente = m.opacity < 0.99;
                if (m.transparent !== trasparente) {
                    m.transparent = trasparente;
                    m.needsUpdate = true;
                }
            } else {
                m.transmission += (obiettivo.vetro - m.transmission) * quanto;
                if (m.transmission < 0.002) {
                    m.transmission = 0;
                }
                m.roughness = 0.13 - 0.08 * m.transmission;
            }
        });
    }

    posa(0, 0);
    return { gruppo, pezzi, materiali, misure, posa, ancora, colore, passo };
}
