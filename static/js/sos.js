import { startEmergencySharing } from './emergency-alerts.js';
import { loadEmergencyCard, renderPatientCard } from './patient-card.js';
import { createQrScanner } from './qr-scanner.js';

(function init() {
    const dialog = document.getElementById('sos-dialog');
    if (!dialog) return;
    const openBtn = document.getElementById('open-sos');
    const selfBtn = document.getElementById('sos-self');
    const otherBtn = document.getElementById('sos-other');
    const scanBtn = document.getElementById('sos-scan');
    const otherField = document.getElementById('sos-other-field');
    const otherName = document.getElementById('sos-other-name');
    const scanSection = document.getElementById('sos-scan-section');
    const scanVideo = document.getElementById('sos-scan-video');
    const scanStatus = document.getElementById('sos-scan-status');
    const scannedCardSlot = document.getElementById('sos-scanned-card');
    const helpScannedBtn = document.getElementById('sos-help-scanned');
    const sendBtn = document.getElementById('sos-send');
    const cancelBtn = document.getElementById('sos-cancel');
    const closeBtn = document.getElementById('sos-close');
    const status = document.getElementById('sos-status');

    let target = 'self';
    let scannedCard = null;

    const scanner = createQrScanner({
        dialog,
        video: scanVideo,
        status: scanStatus,
        onToken: async (token) => {
            scanStatus.textContent = 'Verificando la tarjeta…';
            scannedCard = null;
            helpScannedBtn.hidden = true;
            scannedCardSlot.replaceChildren();
            try {
                const card = await loadEmergencyCard(token);
                if (!dialog.open) return;
                if (!card || card.active === false) {
                    scanStatus.textContent = 'La tarjeta no está disponible o fue desactivada.';
                    return;
                }
                scannedCard = card;
                renderPatientCard(scannedCardSlot, card, {
                    subtitle: 'Tarjeta leída por QR',
                    footer: 'Datos registrados por la administración de MediSync.'
                });
                helpScannedBtn.hidden = false;
                scanStatus.textContent = `Tarjeta de ${card.name || 'asegurado'} verificada. Ya puedes pedir ayuda para esta persona.`;
            } catch (error) {
                console.error(error);
                scanStatus.textContent = 'No se pudo verificar la tarjeta. Inténtalo de nuevo.';
            }
        }
    });

    if (openBtn) openBtn.addEventListener('click', () => dialog.showModal());

    function setTarget(value) {
        target = value;
        selfBtn.classList.toggle('active', value === 'self');
        otherBtn.classList.toggle('active', value === 'other');
        scanBtn.classList.toggle('active', value === 'scan');
        otherField.hidden = value !== 'other';
        scanSection.hidden = value !== 'scan';
        if (value === 'other') otherName.focus();
        if (value === 'scan') {
            scanStatus.textContent = '';
            scanner.start();
        } else {
            scanner.stop();
            scannedCard = null;
            scannedCardSlot.replaceChildren();
            helpScannedBtn.hidden = true;
        }
    }

    selfBtn.addEventListener('click', () => setTarget('self'));
    otherBtn.addEventListener('click', () => setTarget('other'));
    scanBtn.addEventListener('click', () => setTarget('scan'));

    closeBtn.addEventListener('click', () => dialog.close());
    cancelBtn.addEventListener('click', () => dialog.close());

    async function sendHelp(button) {
        if (target === 'scan' && !scannedCard) {
            status.textContent = 'Escanea primero el QR de la tarjeta de la persona.';
            return;
        }
        button.disabled = true;
        status.textContent = 'Obteniendo ubicación…';
        try {
            const card = target === 'scan' ? scannedCard : null;
            const name = card
                ? card.name || ''
                : target === 'other'
                    ? String(otherName.value || '').trim() || 'Persona sin seguro'
                    : 'Yo';
            await startEmergencySharing(card, name, (message) => { status.textContent = message; });
            status.textContent = 'Ubicación enviada. El equipo de despacho ya puede verla.';
            setTimeout(() => dialog.close(), 1500);
        } catch (error) {
            console.error(error);
            status.textContent = error.message || 'No se pudo enviar la ubicación. Revisa los permisos e inténtalo de nuevo.';
        } finally {
            button.disabled = false;
        }
    }

    sendBtn.addEventListener('click', () => sendHelp(sendBtn));
    helpScannedBtn.addEventListener('click', () => sendHelp(helpScannedBtn));

    dialog.addEventListener('close', () => {
        scanner.stop();
        setTarget('self');
        otherName.value = '';
        scanStatus.textContent = '';
        scannedCard = null;
        scannedCardSlot.replaceChildren();
        helpScannedBtn.hidden = true;
        status.textContent = '';
    });
})();
