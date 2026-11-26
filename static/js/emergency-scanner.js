const dialog = document.getElementById('emergency-dialog');
const video = document.getElementById('emergency-video');
const status = document.getElementById('emergency-scan-status');
const codeInput = document.getElementById('emergency-code');
const openButton = document.getElementById('open-emergency-scanner');
const closeButton = document.getElementById('close-emergency-dialog');
const codeForm = document.getElementById('emergency-code-form');

let stream = null;
let loopTimer = null;
let detector = null;

function cleanCode(value) {
    const text = String(value || '').trim();
    try {
        const url = new URL(text, window.location.origin);
        const fromQuery = url.searchParams.get('t');
        if (fromQuery) return fromQuery.trim();
    } catch (error) {
        // El valor puede ser directamente el código, no una URL.
    }
    return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '';
}

function goToCard(code) {
    const token = cleanCode(code);
    if (!token) {
        status.textContent = 'Ese código no es válido. Revisa el QR o pide el enlace al asegurado.';
        return;
    }
    window.location.assign(`/emergencia?t=${encodeURIComponent(token)}`);
}

async function scanLoop() {
    if (!dialog.open || !detector) return;
    try {
        const codes = await detector.detect(video);
        const token = codes.map((item) => cleanCode(item.rawValue)).find(Boolean);
        if (token) {
            goToCard(token);
            return;
        }
    } catch (error) {
        // Sigue intentando; algunos navegadores lanzan mientras la cámara arranca.
    }
    loopTimer = window.setTimeout(scanLoop, 250);
}

async function startScanner() {
    status.textContent = 'Activando la cámara…';
    if (typeof window.BarcodeDetector === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Este navegador no puede leer QR. Usa el código manual o actualiza el navegador.';
        return;
    }
    try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        video.srcObject = stream;
        await video.play();
        status.textContent = 'Apunta la cámara al QR del asegurado.';
        scanLoop();
    } catch (error) {
        status.textContent = 'No se pudo acceder a la cámara. Puedes escribir el código manualmente.';
    }
}

function stopScanner() {
    window.clearTimeout(loopTimer);
    loopTimer = null;
    detector = null;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
    }
    video.srcObject = null;
}

openButton.addEventListener('click', () => {
    dialog.showModal();
    startScanner();
});
closeButton.addEventListener('click', () => {
    stopScanner();
    dialog.close();
});
dialog.addEventListener('close', stopScanner);
codeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    goToCard(codeInput.value);
});
