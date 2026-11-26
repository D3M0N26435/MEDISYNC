// Escáner de QR para el panel «Mi tarjeta». No pide códigos a mano.
(function initCardQrScanner() {
    const dialog = document.getElementById('card-scan-dialog');
    const openButton = document.getElementById('scan-own-qr');
    if (!dialog || !openButton) return;

    const video = document.getElementById('card-scan-video');
    const status = document.getElementById('card-scan-status');
    const closeButton = document.getElementById('card-scan-close');
    const result = document.getElementById('card-scan-result');

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
            // El valor puede ser directamente el token.
        }
        return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '';
    }

    function stopScanner() {
        window.clearTimeout(loopTimer);
        loopTimer = null;
        detector = null;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }
        if (video) video.srcObject = null;
    }

    function handleToken(rawValue) {
        const token = cleanCode(rawValue);
        if (!token) {
            status.textContent = 'Ese código no corresponde a una tarjeta de MediSync.';
            loopTimer = window.setTimeout(scanLoop, 300);
            return;
        }
        stopScanner();
        const url = `/emergencia?t=${encodeURIComponent(token)}`;
        if (result) {
            result.href = url;
            result.hidden = false;
            result.textContent = 'Abrir tarjeta pública leída';
        }
        status.textContent = 'QR leído correctamente. Puedes abrir la tarjeta pública.';
        dialog.close();
    }

    async function scanLoop() {
        if (!dialog.open || !detector || !video) return;
        try {
            const codes = await detector.detect(video);
            const rawValue = codes.map((item) => item.rawValue).find((value) => cleanCode(value));
            if (rawValue) {
                handleToken(rawValue);
                return;
            }
        } catch (error) {
            // Algunos navegadores lanzan mientras la cámara todavía arranca.
        }
        loopTimer = window.setTimeout(scanLoop, 250);
    }

    async function startScanner() {
        status.textContent = 'Activando la cámara…';
        if (result) {
            result.hidden = true;
            result.removeAttribute('href');
        }
        if (typeof window.BarcodeDetector === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            status.textContent = 'Este navegador no puede leer QR. Usa un dispositivo con cámara compatible.';
            return;
        }
        try {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            video.srcObject = stream;
            await video.play();
            status.textContent = 'Apunta la cámara al código QR de tu tarjeta.';
            scanLoop();
        } catch (error) {
            status.textContent = 'No se pudo acceder a la cámara. Revisa los permisos e inténtalo de nuevo.';
        }
    }

    openButton.addEventListener('click', () => {
        dialog.showModal();
        startScanner();
    });

    if (closeButton) closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        stopScanner();
        status.textContent = '';
    });
})();
