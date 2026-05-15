/* app.js - SPA Router und Tab-Navigation */
(function() {
  'use strict';

  const pages = {
    home:       document.getElementById('page-home'),
    validate:   document.getElementById('page-validate'),
    statement:  document.getElementById('page-statement'),
    convert:    document.getElementById('page-convert'),
    create:     document.getElementById('page-create'),
    tools:      document.getElementById('page-tools'),
    samples:    document.getElementById('page-samples'),
    packer:     document.getElementById('page-packer'),
    identities: document.getElementById('page-identities'),
    merge:      document.getElementById('page-merge'),
  };
  const navLinks = document.querySelectorAll('#main-nav a[data-page]');

  function showPage(name) {
    const key = name || 'home';
    Object.values(pages).forEach(p => { if (p) p.classList.remove('active'); });
    navLinks.forEach(a => a.classList.remove('active'));
    if (pages[key]) pages[key].classList.add('active');
    const activeLink = document.querySelector(`#main-nav a[data-page="${key}"]`);
    if (activeLink) activeLink.classList.add('active');
  }

  function routeFromHash() {
    const hash = window.location.hash.replace('#', '') || 'home';
    showPage(hash);
  }

  window.addEventListener('hashchange', routeFromHash);
  document.addEventListener('DOMContentLoaded', routeFromHash);

  navLinks.forEach(a => {
    a.addEventListener('click', e => {
      const page = a.getAttribute('data-page');
      if (page) { window.location.hash = page; }
    });
  });

  window.showPage = showPage;
})();

/* ---- Theme management ---- */
(function() {
  'use strict';
  const KEY   = 'payments-theme';
  const html  = document.documentElement;
  const mq    = window.matchMedia('(prefers-color-scheme: dark)');
  const modes = ['system', 'light', 'dark'];
  const icons  = { system: '\u25D1', light: '\u2600', dark: '\u263D' };
  const labels = { system: 'System', light: 'Hell', dark: 'Dunkel' };

  function apply(mode) {
    const effective = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode;
    html.setAttribute('data-theme', effective);
    const iconEl  = document.getElementById('theme-icon');
    const labelEl = document.getElementById('theme-label');
    const btn     = document.getElementById('theme-toggle');
    if (iconEl)  iconEl.textContent  = icons[mode];
    if (labelEl) labelEl.textContent = labels[mode];
    if (btn)     btn.setAttribute('data-mode', mode);
  }

  function cycle() {
    const btn  = document.getElementById('theme-toggle');
    const cur  = (btn && btn.getAttribute('data-mode')) || 'system';
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    localStorage.setItem(KEY, next);
    apply(next);
  }

  mq.addEventListener('change', function() {
    if ((localStorage.getItem(KEY) || 'system') === 'system') apply('system');
  });

  document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem(KEY) || 'system';
    apply(saved);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', cycle);
  });
})();
