const THEME_STORAGE_KEY = 'finanzas-theme';

function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (_error) {
    return 'light';
  }
}

function syncThemeControl(theme) {
  const toggle = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-toggle-label');
  const icon = document.getElementById('theme-toggle-icon');
  const isDark = theme === 'dark';

  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    toggle.title = isDark ? 'Usar tema claro' : 'Usar tema oscuro';
  }
  if (label) label.textContent = isDark ? 'Claro' : 'Oscuro';
  if (icon) icon.textContent = isDark ? '☀' : '◐';
}

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (_error) {
      // El tema sigue funcionando durante la sesión aunque el navegador bloquee el almacenamiento.
    }
  }
  syncThemeControl(nextTheme);
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

window.toggleTheme = toggleTheme;
applyTheme(document.documentElement.dataset.theme || getSavedTheme(), false);

