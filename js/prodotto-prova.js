// prodotto-prova.js – l'app della prova virtuale nella pagina prodotto
//   1. la fotocamera manda il video in un <video>
//   2. MediaPipe Face Landmarker (di Google) trova i punti del viso e la rotazione della testa
//      (tutto succede nel browser: il video non esce dal dispositivo)
//   3. gli occhiali 3D si appoggiano sugli occhi, larghi quanto il viso, girati come la testa
//   4. i pallini cambiano colore, il bottone tondo scatta la foto
//   5. la foto si può mandare agli amici (condivisione del telefono), salvare o copiare

import * as THREE from 'three';
import { COLORI, stato, trovaColore, caricaOcchiali, creaStudio } from './sguardi-3d.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELLO_VISO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// i punti del viso che usiamo (numeri della mappa di MediaPipe)
const PUNTI = {
    occhioDestroFuori: 33,
    occhioDestroDentro: 133,
    occhioSinistroFuori: 263,
    occhioSinistroDentro: 362,
    tempiaDestra: 127,
    tempiaSinistra: 356
};

const app = document.querySelector('.app');
const schermo = app.querySelector('.app-schermo');
const specchio = app.querySelector('.app-specchio');
const video = app.querySelector('.app-video');
const stato_ = app.querySelector('.app-stato');
const nomeColore = app.querySelector('.app-colore-nome');
const pallini = app.querySelector('.app-pallini');
const cursoreMisura = app.querySelector('.app-misura input');
const bottoneScatta = app.querySelector('.app-scatta');
const bottoneUltima = app.querySelector('.app-ultima');
const flash = app.querySelector('.app-flash');
const anteprima = app.querySelector('.app-anteprima');
const fotoAnteprima = app.querySelector('.app-anteprima-foto');
const altri = app.querySelector('.app-altri');
const avviso = app.querySelector('.app-avviso');

function scrivi(testo) {
    stato_.textContent = testo;
    stato_.hidden = !testo;
}


// ===== 1. la scena 3D, trasparente sopra al video =====
// la camera è "ortografica" e misura come il video (in pixel): un punto del viso
// a (x, y) nel video corrisponde allo stesso (x, y) nella scena
const scena = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-320, 320, 240, -240, 0.1, 5000);
camera.position.z = 2000;
let renderer = null;

// il gruppo che segue il viso (misure in "larghezze di occhiali")
const suViso = new THREE.Group();
suViso.visible = false;
scena.add(suViso);

// la testa invisibile: non si vede ma copre le aste dove passano dietro la testa
const testaInvisibile = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshBasicMaterial({ colorWrite: false })
);
testaInvisibile.scale.set(0.47, 0.72, 0.64);
testaInvisibile.position.set(0, -0.12, -0.7);
testaInvisibile.renderOrder = -1;
suViso.add(testaInvisibile);

let occhiali = null;

function preparaScena() {
    if (renderer) {
        return;
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    specchio.appendChild(renderer.domElement);

    scena.environment = creaStudio(renderer, true);
    scena.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.6));
    const luce = new THREE.DirectionalLight(0xffffff, 1.3);
    luce.position.set(0, 300, 1000);
    scena.add(luce);

    // gli occhiali: il "ponte" (il centro del frontale) va nel punto (0, 0, 0)
    caricaOcchiali({ video: true }).then(function(o) {
        occhiali = o;
        o.colore(trovaColore(stato.colore), true);
        o.gruppo.updateMatrixWorld(true);
        const frontale = new THREE.Box3();
        o.pezzi.forEach(function(p) {
            if (p.parte === 'struttura') {
                frontale.union(new THREE.Box3().setFromObject(p.mesh));
            }
        });
        const ponte = frontale.getCenter(new THREE.Vector3());
        o.gruppo.position.set(0, -ponte.y, -ponte.z);
        o.gruppo.traverse(function(pezzo) {
            if (pezzo.isMesh) {
                pezzo.renderOrder = 1;   // dopo la testa invisibile
            }
        });
        suViso.add(o.gruppo);
    }).catch(function(errore) {
        console.error(errore);
        scrivi('Non riesco a caricare gli occhiali.');
    });
}


// ===== 2. i colori =====
COLORI.forEach(function(c) {
    const b = document.createElement('button');
    b.className = 'pallino';
    b.dataset.colore = c.id;
    b.style.backgroundColor = c.pallino;
    b.setAttribute('aria-label', c.nome);
    b.title = c.nome;
    pallini.appendChild(b);
});

function mostraColore(id) {
    const c = trovaColore(id);
    nomeColore.textContent = c.nome;
    pallini.querySelectorAll('.pallino').forEach(function(b) {
        b.classList.toggle('selected', b.dataset.colore === c.id);
    });
    if (occhiali) {
        occhiali.colore(c, false);
    }
}

pallini.addEventListener('click', function(e) {
    const b = e.target.closest('.pallino');
    if (!b) {
        return;
    }
    stato.colore = b.dataset.colore;
    mostraColore(stato.colore);
    b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    document.dispatchEvent(new CustomEvent('sguardi:colore-prova', { detail: stato.colore }));
});
// se il colore cambia nella pagina, cambia anche qui
document.addEventListener('sguardi:colore', function(e) {
    mostraColore(e.detail);
});


// ===== 3. la fotocamera e il riconoscimento del viso =====
let flusso = null;
let riconoscitore = null;
let ultimoTempo = -1;

async function preparaRiconoscitore() {
    if (riconoscitore) {
        return riconoscitore;
    }
    const { FaceLandmarker, FilesetResolver } = await import(MEDIAPIPE + '/vision_bundle.mjs');
    const file = await FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm');
    const opzioni = function(delegato) {
        return {
            baseOptions: { modelAssetPath: MODELLO_VISO, delegate: delegato },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFacialTransformationMatrixes: true
        };
    };
    try {
        riconoscitore = await FaceLandmarker.createFromOptions(file, opzioni('GPU'));
    } catch (errore) {
        riconoscitore = await FaceLandmarker.createFromOptions(file, opzioni('CPU'));
    }
    return riconoscitore;
}

async function accendiFotocamera() {
    if (!window.isSecureContext || !navigator.mediaDevices) {
        throw new Error('insicuro');
    }
    flusso = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
    });
    video.srcObject = flusso;
    await video.play();
    if (!video.videoWidth) {
        await new Promise(function(fatto) {
            video.addEventListener('loadedmetadata', fatto, { once: true });
        });
    }
    const l = video.videoWidth;
    const a = video.videoHeight;
    camera.left = -l / 2;
    camera.right = l / 2;
    camera.top = a / 2;
    camera.bottom = -a / 2;
    camera.updateProjectionMatrix();
    adatta();
}

function spegniFotocamera() {
    if (flusso) {
        flusso.getTracks().forEach(function(traccia) { traccia.stop(); });
        flusso = null;
    }
    video.srcObject = null;
}

// lo specchio copre tutto lo schermo dell'app (come una foto "a riempire"):
// video e occhiali hanno la stessa misura, così restano allineati
let ritaglio = { x: 0, y: 0, l: 1, a: 1 };   // la parte del video che si vede (in pixel del video)
function adatta() {
    if (!video.videoWidth) {
        return;
    }
    const L = schermo.clientWidth;
    const A = schermo.clientHeight;
    const l = video.videoWidth;
    const a = video.videoHeight;
    const s = Math.max(L / l, A / a);
    specchio.style.width = (l * s) + 'px';
    specchio.style.height = (a * s) + 'px';
    specchio.style.left = ((L - l * s) / 2) + 'px';
    specchio.style.top = ((A - a * s) / 2) + 'px';
    ritaglio = { l: L / s, a: A / s, x: (l - L / s) / 2, y: (a - A / s) / 2 };
    if (renderer) {
        renderer.setSize(l * s, a * s, false);
    }
}
window.addEventListener('resize', adatta);
new ResizeObserver(adatta).observe(schermo);


// ===== 4. ogni fotogramma: trova il viso e ci mette sopra gli occhiali =====
const punto = new THREE.Vector3();
const centroOcchi = new THREE.Vector3();
const posizioneVoluta = new THREE.Vector3();
const rotazioneVoluta = new THREE.Quaternion();
const matriceTesta = new THREE.Matrix4();
const scartoPosizione = new THREE.Vector3();
const scartoScala = new THREE.Vector3();
const tempiaD = new THREE.Vector3();
const tempiaS = new THREE.Vector3();
let larghezzaVoluta = 0;
let visoTrovato = false;

function inScena(p, fuori) {
    const l = video.videoWidth;
    const a = video.videoHeight;
    return fuori.set(p.x * l - l / 2, -(p.y * a - a / 2), -p.z * l);
}

function aggiorna() {
    if (!app.open) {
        return;
    }
    requestAnimationFrame(aggiorna);
    if (occhiali) {
        occhiali.passo(0.15);
    }
    if (!riconoscitore || !flusso || video.readyState < 2 || video.currentTime === ultimoTempo) {
        renderer.render(scena, camera);
        return;
    }
    ultimoTempo = video.currentTime;
    const risultato = riconoscitore.detectForVideo(video, performance.now());

    if (risultato.faceLandmarks && risultato.faceLandmarks.length > 0) {
        const p = risultato.faceLandmarks[0];
        centroOcchi.set(0, 0, 0);
        [PUNTI.occhioDestroFuori, PUNTI.occhioDestroDentro, PUNTI.occhioSinistroFuori, PUNTI.occhioSinistroDentro].forEach(function(n) {
            centroOcchi.add(inScena(p[n], punto));
        });
        centroOcchi.multiplyScalar(0.25);
        posizioneVoluta.set(centroOcchi.x, centroOcchi.y, 0);

        inScena(p[PUNTI.tempiaDestra], tempiaD);
        inScena(p[PUNTI.tempiaSinistra], tempiaS);
        larghezzaVoluta = tempiaD.distanceTo(tempiaS) * Number(cursoreMisura.value);

        if (risultato.facialTransformationMatrixes && risultato.facialTransformationMatrixes.length > 0) {
            matriceTesta.fromArray(risultato.facialTransformationMatrixes[0].data);
            matriceTesta.decompose(scartoPosizione, rotazioneVoluta, scartoScala);
        }

        // la prima volta si salta lì, poi si segue morbidamente (così non tremano)
        if (!visoTrovato) {
            suViso.position.copy(posizioneVoluta);
            suViso.quaternion.copy(rotazioneVoluta);
            suViso.scale.setScalar(larghezzaVoluta);
            visoTrovato = true;
        } else {
            suViso.position.lerp(posizioneVoluta, 0.5);
            suViso.quaternion.slerp(rotazioneVoluta, 0.5);
            suViso.scale.setScalar(suViso.scale.x + (larghezzaVoluta - suViso.scale.x) * 0.5);
        }
        suViso.visible = !!occhiali;
        scrivi(occhiali ? '' : 'Carico gli occhiali…');
        bottoneScatta.disabled = !occhiali;
    } else {
        visoTrovato = false;
        suViso.visible = false;
        scrivi('Non vedo il tuo viso: mettiti davanti alla fotocamera');
        bottoneScatta.disabled = true;
    }
    renderer.render(scena, camera);
}


// ===== 5. aprire e chiudere l'app =====
async function apri() {
    if (!app.open) {
        app.showModal();
    }
    anteprima.hidden = true;
    preparaScena();
    mostraColore(stato.colore);
    visoTrovato = false;
    bottoneScatta.disabled = true;
    try {
        scrivi('Accendo la fotocamera…');
        if (!flusso) {
            await accendiFotocamera();
        }
        scrivi('Preparo il riconoscimento del viso…');
        await preparaRiconoscitore();
        scrivi('Cerco il tuo viso…');
        requestAnimationFrame(aggiorna);
    } catch (errore) {
        console.error(errore);
        if (errore.message === 'insicuro') {
            scrivi('La fotocamera funziona solo aprendo la pagina da un server (es. http://localhost) o da un sito https, non con doppio clic sul file.');
        } else if (errore.name === 'NotAllowedError') {
            scrivi('Hai negato il permesso di usare la fotocamera: permettilo dalle impostazioni del browser e riprova.');
        } else if (errore.name === 'NotFoundError') {
            scrivi('Non trovo nessuna fotocamera collegata.');
        } else if (errore.name === 'NotReadableError') {
            scrivi('La fotocamera è già usata da un altro programma.');
        } else {
            scrivi('Non riesco a preparare la prova (serve la connessione a internet la prima volta).');
        }
    }
}

app.addEventListener('close', function() {
    spegniFotocamera();   // la fotocamera si spegne appena chiudi
    suViso.visible = false;
    visoTrovato = false;
});
app.querySelector('.app-chiudi').addEventListener('click', function() {
    app.close();
});
document.querySelectorAll('[data-apri-prova]').forEach(function(b) {
    b.addEventListener('click', apri);
});


// ===== 6. la foto =====
let ultimaFoto = null;   // { blob, url, nome }

function scattaFoto() {
    const l = video.videoWidth;
    const a = video.videoHeight;

    // gli occhiali disegnati alla risoluzione del video, per una foto nitida
    const misuraPrima = renderer.getSize(new THREE.Vector2());
    const densitaPrima = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(l, a, false);
    renderer.render(scena, camera);

    // solo la parte che vedi sullo schermo
    const r = ritaglio;
    const foto = document.createElement('canvas');
    foto.width = Math.round(r.l);
    foto.height = Math.round(r.a);
    const pennello = foto.getContext('2d');
    pennello.save();
    pennello.translate(foto.width, 0);
    pennello.scale(-1, 1);   // a specchio, come lo vedi
    pennello.drawImage(video, r.x, r.y, r.l, r.a, 0, 0, foto.width, foto.height);
    // l'ombra morbida degli occhiali sul viso
    pennello.shadowColor = 'rgba(0, 0, 0, 0.32)';
    pennello.shadowBlur = foto.width * 0.012;
    pennello.shadowOffsetY = foto.width * 0.006;
    pennello.drawImage(renderer.domElement, r.x, r.y, r.l, r.a, 0, 0, foto.width, foto.height);
    pennello.restore();

    renderer.setPixelRatio(densitaPrima);
    renderer.setSize(misuraPrima.x, misuraPrima.y, false);

    // la firma in basso
    const c = trovaColore(stato.colore);
    const misura = Math.round(Math.max(14, foto.width * 0.028));
    pennello.font = '600 ' + misura + 'px -apple-system, "Helvetica Neue", Arial, sans-serif';
    pennello.fillStyle = 'rgba(255, 255, 255, 0.92)';
    pennello.shadowColor = 'rgba(0, 0, 0, 0.45)';
    pennello.shadowBlur = misura * 0.4;
    pennello.fillText('Sguardi · ' + c.nome, misura, foto.height - misura);

    flash.classList.remove('via');
    void flash.offsetWidth;
    flash.classList.add('via');

    foto.toBlob(function(blob) {
        if (ultimaFoto) {
            URL.revokeObjectURL(ultimaFoto.url);
        }
        ultimaFoto = { blob: blob, url: URL.createObjectURL(blob), nome: 'sguardi-' + c.id + '.jpg', tela: foto };
        bottoneUltima.style.backgroundImage = 'url(' + ultimaFoto.url + ')';
        bottoneUltima.disabled = false;
        mostraAnteprima();
    }, 'image/jpeg', 0.93);
}

function mostraAnteprima() {
    fotoAnteprima.src = ultimaFoto.url;
    altri.hidden = true;
    avviso.textContent = '';
    anteprima.hidden = false;
}

function salva() {
    const link = document.createElement('a');
    link.href = ultimaFoto.url;
    link.download = ultimaFoto.nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

const MESSAGGIO = 'Ho provato gli occhiali Sguardi 😎 Come mi stanno?';

async function invia() {
    const file = new File([ultimaFoto.blob], ultimaFoto.nome, { type: 'image/jpeg' });
    // sul telefono (e su Safari/Edge) si apre il menu di condivisione: WhatsApp, Messaggi, Instagram…
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'I miei Sguardi', text: MESSAGGIO });
            avviso.textContent = 'Inviata!';
        } catch (errore) {
            if (errore.name !== 'AbortError') {
                mostraAltri();
            }
        }
        return;
    }
    mostraAltri();
}

// senza menu di condivisione: salvo la foto e preparo i link per le app di messaggi
function mostraAltri() {
    salva();
    const testo = encodeURIComponent(MESSAGGIO);
    app.querySelector('.app-whatsapp').href = 'https://wa.me/?text=' + testo;
    app.querySelector('.app-telegram').href = 'https://t.me/share/url?url=' + encodeURIComponent(location.href) + '&text=' + testo;
    app.querySelector('.app-email').href = 'mailto:?subject=' + encodeURIComponent('I miei Sguardi') + '&body=' + testo;
    altri.hidden = false;
    avviso.textContent = 'Foto salvata nei download.';
}

async function copia() {
    try {
        const png = await new Promise(function(fatto) { ultimaFoto.tela.toBlob(fatto, 'image/png'); });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        avviso.textContent = 'Foto copiata: incollala in una chat.';
    } catch (errore) {
        avviso.textContent = 'Questo browser non permette di copiare le immagini: usa Salva.';
    }
}

bottoneScatta.addEventListener('click', scattaFoto);
bottoneUltima.addEventListener('click', function() {
    if (ultimaFoto) {
        mostraAnteprima();
    }
});
app.querySelector('.app-invia').addEventListener('click', invia);
app.querySelector('.app-salva').addEventListener('click', function() {
    salva();
    avviso.textContent = 'Foto salvata.';
});
app.querySelector('.app-copia').addEventListener('click', copia);
app.querySelector('.app-riprova').addEventListener('click', function() {
    anteprima.hidden = true;
});
// la barra spaziatrice scatta, come un'app vera
app.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && anteprima.hidden && !bottoneScatta.disabled) {
        e.preventDefault();
        scattaFoto();
    }
});
