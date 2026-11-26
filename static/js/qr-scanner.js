// Escáner QR compartido: solo cámara, sin entrada manual de código.
export function cleanQrCode(value) {
    const text = String(value || '').trim();
    try {
        const url = new URL(text, window.location.origin);
        const fromQuery = url.searchParams.get('t');
        if (fromQuery) return fromQuery.trim();
    } catch (error) {
        // El valor puede ser directamente el token.
    }
    return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '';
}

export function createQrScanner({ dialog, video, status, onToken }) {
    let stream = null;
    let loopTimer = null;
    let detector = null;

    function stop() {
        window.clearTimeout(loopTimer);
        loopTimer = null;
        detector = null;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }
        if (video) video.srcObject = null;
    }

    async function scanLoop() {
        if (!dialog.open || !detector || !video) return;
        try {
            const codes = await detector.detect(video);
            const rawValue = codes.map((item) => item.rawValue).find((value) => cleanQrCode(value));
            if (rawValue) {
                const token = cleanQrCode(rawValue);
                stop();
                onToken(token);
                return;
            }
            if (codes.length) status.textContent = 'Ese código no es válido. Escanea un QR de tarjeta de MediSync.';
        } catch (error) {
            // Algunos navegadores lanzan mientras la cámara todavía arranca.
        }
        loopTimer = window.setTimeout(scanLoop, 250);
    }

    async function start() {
        if (!status) return;
        stop();
        status.textContent = 'Activando la cámara…';
        if (typeof window.BarcodeDetector === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            status.textContent = 'Este navegador no puede leer QR. Usa un dispositivo con cámara compatible.';
            return;
        }
        try {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            video.srcObject = stream;
            await video.play();
            status.textContent = 'Apunta la cámara al código QR de la tarjeta.';
            scanLoop();
        } catch (error) {
            status.textContent = 'No se pudo acceder a la cámara. Revisa los permisos e inténtalo de nuevo.';
        }
    }

    return { start, stop };
}
