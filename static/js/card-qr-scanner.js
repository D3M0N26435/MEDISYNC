// Escáner de QR en «Mi tarjeta»: al leerlo abre la tarjeta pública.
import { createQrScanner } from './qr-scanner.js';

(function initCardQrScanner() {
    const dialog = document.getElementById('card-scan-dialog');
    const openButton = document.getElementById('scan-own-qr');
    if (!dialog || !openButton) return;

    const video = document.getElementById('card-scan-video');
    const status = document.getElementById('card-scan-status');
    const closeButton = document.getElementById('card-scan-close');

    const scanner = createQrScanner({
        dialog,
        video,
        status,
        onToken: (token) => {
            status.textContent = 'QR leído correctamente. Abriendo la tarjeta…';
            window.location.assign(`/emergencia?t=${encodeURIComponent(token)}`);
        }
    });

    openButton.addEventListener('click', () => {
        dialog.showModal();
        scanner.start();
    });
    if (closeButton) closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', scanner.stop);
})();
