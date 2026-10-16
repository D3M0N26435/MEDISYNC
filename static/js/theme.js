(function () {
    const storageKey = 'medisync_theme';
    let theme = 'light';

    try {
        theme = localStorage.getItem(storageKey) || 'light';
    } catch (_) {
        // If storage is unavailable, keep the page usable with the light theme.
    }

    function applyTheme(nextTheme) {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;

        try {
            localStorage.setItem(storageKey, theme);
        } catch (_) {
            // The selected theme still applies for the current page.
        }

        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const isDark = theme === 'dark';
            button.setAttribute('aria-label', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
            button.setAttribute('aria-pressed', String(isDark));
            const icon = button.querySelector('[data-theme-icon]');
            if (icon) icon.textContent = isDark ? '☀' : '☾';
        });
    }

    document.documentElement.dataset.theme = theme;

    function bindThemeButtons() {
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
        });
        applyTheme(theme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindThemeButtons, { once: true });
    } else {
        bindThemeButtons();
    }
}());
