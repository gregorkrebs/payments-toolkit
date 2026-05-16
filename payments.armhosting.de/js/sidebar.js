/* sidebar.js - Collapsible sidebar with accordion and localStorage */
(function() {
  'use strict';

  const STORAGE_KEY = 'sidebarState';
  const sidebar     = document.getElementById('sidebar');
  const toggleBtn   = document.getElementById('sidebar-toggle');

  if (!sidebar) return;

  // ── State ──
  function isCollapsed() { return sidebar.classList.contains('collapsed'); }

  function setCollapsed(collapsed) {
    if (collapsed) {
      sidebar.classList.add('collapsed');
      // Close all submenus when collapsing
      sidebar.querySelectorAll('.sidebar__submenu.open').forEach(m => {
        m.classList.remove('open');
        const trigger = sidebar.querySelector(`[data-group="${m.id.replace('submenu-', '')}"]`);
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    } else {
      sidebar.classList.remove('collapsed');
    }
    localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  }

  // Restore saved state
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'collapsed') setCollapsed(true);

  // ── Toggle button ──
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      setCollapsed(!isCollapsed());
    });
  }

  // ── Accordion ──
  sidebar.querySelectorAll('.sidebar__accordion').forEach(function(trigger) {
    trigger.addEventListener('click', function() {
      const groupName  = this.getAttribute('data-group');
      const submenu    = document.getElementById('submenu-' + groupName);
      if (!submenu) return;

      // If sidebar is collapsed, expand it first, then open submenu
      if (isCollapsed()) {
        setCollapsed(false);
        setTimeout(function() { openSubmenu(submenu, trigger); }, 50);
        return;
      }

      const isOpen = submenu.classList.contains('open');
      // Close all other submenus
      sidebar.querySelectorAll('.sidebar__submenu.open').forEach(function(m) {
        if (m !== submenu) {
          m.classList.remove('open');
          const t = sidebar.querySelector('[data-group="' + m.id.replace('submenu-', '') + '"]');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
      if (isOpen) {
        submenu.classList.remove('open');
        this.setAttribute('aria-expanded', 'false');
      } else {
        openSubmenu(submenu, trigger);
      }
    });
  });

  function openSubmenu(submenu, trigger) {
    submenu.classList.add('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  // ── Active state (hash-based routing) ──
  function updateActive() {
    const hash = window.location.hash.replace('#', '') || 'home';
    // Direct items
    sidebar.querySelectorAll('.sidebar__item[data-page], .sidebar__subitem[data-page]').forEach(function(el) {
      const page = el.getAttribute('data-page');
      el.classList.toggle('sidebar__item--active', page === hash);
    });
    // Auto-open accordion whose child is active
    sidebar.querySelectorAll('.sidebar__submenu').forEach(function(submenu) {
      const hasActive = submenu.querySelector('.sidebar__item--active');
      if (hasActive && !isCollapsed()) {
        submenu.classList.add('open');
        const groupName = submenu.id.replace('submenu-', '');
        const trigger   = sidebar.querySelector('[data-group="' + groupName + '"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
    });
  }

  window.addEventListener('hashchange', updateActive);
  document.addEventListener('DOMContentLoaded', updateActive);

  // ── Mobile backdrop ──
  const backdrop = document.getElementById('sidebar-backdrop');
  const mobileBtn = document.getElementById('mobile-sidebar-toggle');

  function openMobile() {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
  }
  function closeMobile() {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
  }

  if (mobileBtn) mobileBtn.addEventListener('click', function() {
    sidebar.classList.contains('mobile-open') ? closeMobile() : openMobile();
  });
  if (backdrop) backdrop.addEventListener('click', closeMobile);
})();
