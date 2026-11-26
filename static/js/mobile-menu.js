(function initMobileMenu() {
    const aside = document.querySelector('aside');
    const toggle = document.getElementById('menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (!aside || !toggle || !navLinks) return;

    function closeMenu() {
        aside.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', () => {
        const open = !aside.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    // Cierra al seleccionar una pestaña.
    navLinks.addEventListener('click', (event) => {
        const link = event.target.closest('a[role="tab"]');
        if (link && window.innerWidth <= 768) closeMenu();
    });

    // Cierra si se redimensiona a desktop.
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMenu();
    });
})();
