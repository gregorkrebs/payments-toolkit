/* ui_helpers.js - Shared UI utilities */
(function() {
  'use strict';

  // ---- File Upload Zone ----
  window.initUploadZone = function(zoneId, inputId, onFileReady) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) onFileReady(file, zone);
    });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) onFileReady(file, zone);
    });
  };

  // ---- Upload feedback in zone ----
  window.setZoneFile = function(zone, file) {
    const p = zone.querySelector('p');
    if (p) p.textContent = 'Datei: ' + file.name + ' (' + Math.round(file.size/1024) + ' KB)';
  };

  // ---- Loading indicator ----
  window.setLoading = function(containerId, msg) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<span class="loader">${msg || 'Bitte warten...'}</span>`;
  };

  // ---- Simple HTML escaping ----
  window.esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  // ---- Format amounts ----
  window.fmtAmt = function(v, ccy) {
    const n = parseFloat(v);
    if (isNaN(n)) return v || '—';
    const s = n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return ccy ? s + ' ' + ccy : s;
  };

  // ---- Status box ----
  window.statusBox = function(ok, title, body) {
    const cls = ok === true ? 'status-ok' : ok === false ? 'status-error' : 'status-warn';
    return `<div class="${cls}"><strong>${esc(title)}</strong>${body ? '<br>' + body : ''}</div>`;
  };

  // ---- Render issue list ----
  window.renderIssues = function(issues) {
    if (!issues || !issues.length) return '';
    const items = issues.map(i => {
      const sev  = i.severity || 'info';
      const path = i.fieldPath || i.field || '';
      const val  = i.value !== undefined ? i.value : '';
      const exp  = i.expected ? ` — Erwartet: <em>${esc(i.expected)}</em>` : '';
      return `<li class="issue-item ${sev}">
        <span class="issue-field">${esc(path)}</span>
        ${val !== '' ? `<span class="issue-value"> = "${esc(val)}"</span>` : ''}
        <span class="issue-hint"> &rarr; ${esc(i.message)}${exp}</span>
      </li>`;
    }).join('');
    return `<ul class="issue-list">${items}</ul>`;
  };

  // ---- Collapsible section ----
  window.collapseSection = function(title, content, startOpen) {
    const id = 'sec-' + Math.random().toString(36).slice(2,8);
    return `<div class="field-section">
      <div class="field-section-header" onclick="document.getElementById('${id}').style.display=document.getElementById('${id}').style.display==='none'?'block':'none'">
        ${esc(title)}
      </div>
      <div class="field-section-body" id="${id}" style="display:${startOpen?'block':'none'}">
        ${content}
      </div>
    </div>`;
  };

  // ---- Download helper ----
  window.triggerDownload = function(content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---- Upload file to API, return JSON ----
  window.uploadFile = async function(url, file, extraFields) {
    const fd = new FormData();
    fd.append('file', file);
    if (extraFields) Object.entries(extraFields).forEach(([k,v]) => fd.append(k,v));
    const resp = await fetch(url, { method: 'POST', body: fd });
    if (!resp.ok) {
      let err = await resp.text();
      try { err = JSON.parse(err).error || err; } catch(e2) {}
      throw new Error(err);
    }
    return resp.json();
  };

  // ---- Render summary boxes ----
  window.renderSummary = function(items) {
    return '<div class="summary-box">' +
      items.map(({ label, value, cls }) =>
        `<div class="summary-item"><div class="s-label">${esc(label)}</div><div class="s-value${cls?' '+cls:''}">${esc(String(value))}</div></div>`
      ).join('') + '</div>';
  };

  // ---- Fetch Autofill Data ----
  window.fetchDummyIdentity = async function() {
    const res = await fetch('/api/generate/bankaccount?amount=1');
    const json = await res.json();
    if (!json.data || !json.data[0]) throw new Error('Keine Testdaten erhalten');
    return json.data[0];
  };

  // ---- Autofill Button Generator ----
  window.createAutofillBtn = function(onFillAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '&#127922; Testdaten';
    btn.title = 'Generiert realistische Dummy-Daten für dieses Formular';
    btn.style.cssText = 'border: 1px solid #FFD700; color: #b89b00; background: transparent; font-size: 0.85em; padding: 0.2rem 0.6rem; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.3rem; margin-left: 0.5rem; transition: background 0.2s;';
    
    btn.addEventListener('mouseenter', () => btn.style.backgroundColor = 'rgba(255, 215, 0, 0.1)');
    btn.addEventListener('mouseleave', () => btn.style.backgroundColor = 'transparent');

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const originalText = btn.innerHTML;
      try {
        btn.innerHTML = '&#8987; Lade...';
        btn.disabled = true;
        const identity = await window.fetchDummyIdentity();
        await onFillAction(identity);
      } catch(err) {
        console.error('Autofill Fehler:', err);
        alert('Fehler beim Abrufen der Testdaten: ' + err.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
    return btn;
  };
})();
