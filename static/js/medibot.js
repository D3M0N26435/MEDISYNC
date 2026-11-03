(() => {
    const socket = io({ autoConnect: false });
    const button = document.getElementById('medibot-btn');
    const closeButton = document.getElementById('medibot-close');
    const modal = document.getElementById('medibot-modal');
    const form = document.getElementById('medibot-form');
    const input = document.getElementById('bot-input');
    const sendButton = document.getElementById('medibot-send');
    const messages = document.getElementById('bot-mensajes');
    const status = document.getElementById('medibot-status');

    let pendingQuestion = '';
    let pendingReply = null;

    function setStatus(message) {
        status.textContent = message;
    }

    function addMessage(text, kind) {
        const message = document.createElement('div');
        message.className = kind === 'sent' ? 'bot-msg-sent' : 'bot-msg-received';
        message.textContent = text;
        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    function setOpen(open) {
        modal.classList.toggle('is-open', open);
        modal.setAttribute('aria-hidden', String(!open));
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Cerrar MediBot' : 'Abrir MediBot');
        if (open) input.focus();
    }

    function setWaiting(waiting) {
        input.disabled = waiting;
        sendButton.disabled = waiting;
    }

    function sendPendingQuestion() {
        if (!pendingQuestion || !socket.connected) return;
        const question = pendingQuestion;
        pendingQuestion = '';
        setStatus('MediBot está preparando una respuesta…');
        socket.emit('medibot_query', { pregunta: question });
    }

    button.addEventListener('click', () => setOpen(!modal.classList.contains('is-open')));
    closeButton.addEventListener('click', () => setOpen(false));

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const question = input.value.trim();
        if (!question || pendingReply) return;

        addMessage(question, 'sent');
        pendingReply = addMessage('Escribiendo…', 'received');
        pendingQuestion = question;
        input.value = '';
        setWaiting(true);

        if (socket.connected) {
            sendPendingQuestion();
        } else {
            setStatus('Conectando con MediBot…');
            socket.connect();
        }
    });

    socket.on('connect', () => {
        setStatus('Conectado');
        sendPendingQuestion();
    });

    socket.on('disconnect', () => {
        setStatus('Se perdió la conexión. Intentando reconectar…');
    });

    window.addEventListener('firebase-session-renewed', () => {
        if (!socket.connected) return;
        socket.disconnect();
        socket.connect();
    });

    socket.on('connect_error', () => {
        setStatus('No pude conectar con MediBot. Vuelve a iniciar sesión o inténtalo más tarde.');
        if (pendingReply) {
            pendingReply.textContent = 'No pude conectar. Inténtalo de nuevo más tarde.';
            pendingReply = null;
            pendingQuestion = '';
            setWaiting(false);
        }
    });

    socket.on('medibot_respuesta', (payload) => {
        const answer = typeof payload?.respuesta === 'string'
            ? payload.respuesta
            : 'No recibí una respuesta válida. Inténtalo de nuevo.';
        if (pendingReply) {
            pendingReply.textContent = answer;
            pendingReply = null;
        } else {
            addMessage(answer, 'received');
        }
        messages.scrollTop = messages.scrollHeight;
        setWaiting(false);
        setStatus(socket.connected ? 'Conectado' : 'Desconectado');
        input.focus();
    });

    socket.connect();
})();
