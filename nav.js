/* nav.js — shared navigation logic */

(function () {
  'use strict';

  /* ── Active page highlighting ── */
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkFile = href.split('/').pop() || 'index.html';
    if (
      linkFile === filename ||
      (filename === '' && linkFile === 'index.html')
    ) {
      link.classList.add('active');
    }
  });

  /* ── Theme toggle with localStorage persistence ── */
  const savedTheme = localStorage.getItem('silverado-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  syncThemeBtn(savedTheme);

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('silverado-theme', next);
    syncThemeBtn(next);
  }

  function syncThemeBtn(theme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀ Light' : '◑ Dark';
    });
  }

  window.toggleTheme = toggleTheme;

  /* ── Mobile hamburger menu ── */
  function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('open');
  }

  window.toggleMobileMenu = toggleMobileMenu;

  /* ── Close mobile menu on link click ── */
  document.addEventListener('click', function (e) {
    if (e.target.matches('#mobileMenu .nav-link')) {
      const menu = document.getElementById('mobileMenu');
      if (menu) menu.classList.remove('open');
    }
  });
})();
