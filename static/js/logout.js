import { closeSession } from './firebase.js';

document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Cerrando sesión…';
        await closeSession();
    });
});
