(() => {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const sendButton = document.getElementById('chat-send');
    const messages = document.getElementById('chat-messages');
    const status = document.getElementById('chat-status');

    if (!form || !input || !sendButton || !messages || !status) return;

    if (typeof window.io !== 'function') {
        status.textContent = 'El chat no está disponible en este momento.';
        return;
    }

    const socket = window.io();

    function addMessage(text, kind) {
        const message = document.createElement('div');
        message.className = `chat-message ${kind === 'patient' ? 'patient-message' : 'support-message'}`;
        message.textContent = text;
        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
    }

    socket.on('connect', () => {
        status.textContent = 'Conectado con soporte.';
    });

    socket.on('disconnect', () => {
        status.textContent = 'Se perdió la conexión. Intentando reconectar…';
    });

    socket.on('connect_error', () => {
        status.textContent = 'No pude conectar con el chat. Vuelve a iniciar sesión o inténtalo más tarde.';
    });

    socket.on('mensaje', (payload) => {
        if (typeof payload?.texto === 'string') addMessage(payload.texto, 'patient');
    });

    socket.on('mensaje_telegram', (payload) => {
        if (typeof payload?.texto === 'string') addMessage(payload.texto, 'support');
    });

    socket.on('chat_error', (payload) => {
        status.textContent = typeof payload?.texto === 'string'
            ? payload.texto
            : 'No se pudo procesar el mensaje.';
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const texto = input.value.trim();
        if (!texto || !socket.connected) {
            if (!socket.connected) status.textContent = 'Espera a que se recupere la conexión.';
            return;
        }

        socket.emit('message', { texto });
        input.value = '';
        status.textContent = 'Mensaje enviado al equipo de soporte.';
        input.focus();
    });
})();
