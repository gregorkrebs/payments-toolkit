/* page_identities.js */

(function () {
  'use strict';

  let currentData = null;
  let currentView = 'card'; // 'card' | 'table'

  function init() {
    const slider  = document.getElementById('identities-slider');
    const numInput= document.getElementById('identities-count');
    const genBtn  = document.getElementById('identities-gen-btn');
    const copyBtn = document.getElementById('identities-copy-json-btn');
    const dlBtn   = document.getElementById('identities-download-btn');
    const viewCard= document.getElementById('identities-view-card');
    const viewTbl = document.getElementById('identities-view-table');

    // Slider <-> Number sync
    slider.addEventListener('input', () => { numInput.value = slider.value; });
    numInput.addEventListener('input', () => {
      let v = Math.min(200, Math.max(1, parseInt(numInput.value) || 1));
      numInput.value = v;
      slider.value   = v;
    });

    // View toggle
    viewCard.addEventListener('click', () => {
      currentView = 'card';
      viewCard.classList.add('active');
      viewTbl.classList.remove('active');
      if (currentData) render(currentData);
    });
    viewTbl.addEventListener('click', () => {
      currentView = 'table';
      viewTbl.classList.add('active');
      viewCard.classList.remove('active');
      if (currentData) render(currentData);
    });

    // Generate
    genBtn.addEventListener('click', async () => {
      const amount = parseInt(numInput.value) || 3;
      const resultEl = document.getElementById('identities-result');
      const metaEl   = document.getElementById('identities-meta');
      resultEl.innerHTML = '<span class="loader">Generiere Identitäten...</span>';
      metaEl.style.display = 'none';
      copyBtn.disabled = true;
      dlBtn.disabled   = true;

      try {
        const resp = await fetch(`/api/generate/bankaccount?amount=${amount}`);
        if (!resp.ok) throw new Error(await resp.text());
        const json = await resp.json();
        currentData = json;
        renderMeta(json.meta);
        render(json);
        copyBtn.disabled = false;
        dlBtn.disabled   = false;
      } catch (e) {
        resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
      }
    });

    // Copy all as JSON
    copyBtn.addEventListener('click', () => {
      if (!currentData) return;
      navigator.clipboard.writeText(JSON.stringify(currentData, null, 2))
        .then(() => flashBtn(copyBtn, '✓ Kopiert!'))
        .catch(() => flashBtn(copyBtn, '✗ Fehler'));
    });

    // Download JSON
    dlBtn.addEventListener('click', () => {
      if (!currentData) return;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      triggerDownload(JSON.stringify(currentData, null, 2), `identities_${ts}.json`, 'application/json');
    });
  }

  // ---- Meta bar ----
  function renderMeta(meta) {
    const el = document.getElementById('identities-meta');
    if (!meta) return;
    const limited = meta.limited
      ? `<span class="badge badge-warn">Limitiert: ${meta.requested} angefragt → ${meta.delivered} geliefert (Max: ${meta.max_allowed})</span>`
      : `<span class="badge badge-ok">${meta.delivered} Identitäten generiert</span>`;
    el.innerHTML = `${limited} <span class="meta-ts">${new Date(meta.timestamp).toLocaleString('de-DE')}</span>`;
    el.style.display = 'flex';
  }

  // ---- Render dispatcher ----
  function render(json) {
    const el = document.getElementById('identities-result');
    if (!json || !json.data || !json.data.length) {
      el.innerHTML = statusBox(null, 'Keine Daten');
      return;
    }
    el.innerHTML = currentView === 'table' ? renderTable(json.data) : renderCards(json.data);
  }

  // ---- Card view ----
  function renderCards(data) {
    return `<div class="identity-card-grid">` +
      data.map(id => `
        <div class="identity-card">
          <div class="identity-card-header">
            <span class="identity-index">#${id.id}</span>
            <span class="identity-name copyable" title="Name kopieren" data-copy="${esc(id.fullname)}">${esc(id.fullname)}</span>
            <button class="copy-card-btn icon-btn" data-copy='${JSON.stringify(id)}' title="Diese Identität als JSON kopieren">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
          <div class="identity-card-body">
            <div class="id-section">
              <div class="id-row">
                <span class="id-label">Vorname</span>
                <span class="id-value copyable" data-copy="${esc(id.firstname)}">${esc(id.firstname)}</span>
              </div>
              <div class="id-row">
                <span class="id-label">Nachname</span>
                <span class="id-value copyable" data-copy="${esc(id.lastname)}">${esc(id.lastname)}</span>
              </div>
              <div class="id-row">
                <span class="id-label">Geburtstag</span>
                <span class="id-value copyable" data-copy="${esc(id.birthday)}">${esc(id.birthday)} <span class="age-badge">${id.age} J.</span></span>
              </div>
              ${id.gender ? `<div class="id-row"><span class="id-label">Geschlecht</span><span class="id-value">${esc(id.gender)}</span></div>` : ''}
              ${id.email  ? `<div class="id-row"><span class="id-label">E-Mail</span><span class="id-value copyable" data-copy="${esc(id.email)}">${esc(id.email)}</span></div>` : ''}
              ${id.phone  ? `<div class="id-row"><span class="id-label">Telefon</span><span class="id-value copyable" data-copy="${esc(id.phone)}">${esc(id.phone)}</span></div>` : ''}
            </div>
            <div class="id-section id-section-addr">
              <div class="id-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:0.25rem">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Adresse
              </div>
              <div class="id-row">
                <span class="id-label">Straße</span>
                <span class="id-value copyable" data-copy="${esc(id.address.street)}">${esc(id.address.street)}</span>
              </div>
              <div class="id-row">
                <span class="id-label">PLZ / Stadt</span>
                <span class="id-value copyable" data-copy="${esc(id.address.plz + ' ' + id.address.city)}">${esc(id.address.plz)} ${esc(id.address.city)}</span>
              </div>
              ${id.address.state ? `<div class="id-row"><span class="id-label">Bundesland</span><span class="id-value copyable" data-copy="${esc(id.address.state)}">${esc(id.address.state)}</span></div>` : ''}
              <div class="id-row">
                <span class="id-label">Vollständig</span>
                <span class="id-value copyable" data-copy="${esc(id.address.full)}">${esc(id.address.full)}</span>
              </div>
            </div>
            <div class="id-section id-section-bank">
              <div class="id-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:0.25rem">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                Bankdaten
              </div>
              <div class="id-row">
                <span class="id-label">IBAN</span>
                <span class="id-value copyable mono" data-copy="${esc(id.account.iban)}">${esc(id.account.iban_formatted || id.account.iban)}</span>
              </div>
              <div class="id-row">
                <span class="id-label">BIC</span>
                <span class="id-value copyable mono" data-copy="${esc(id.account.bic)}">${esc(id.account.bic)}</span>
              </div>
              <div class="id-row">
                <span class="id-label">Bank</span>
                <span class="id-value copyable" data-copy="${esc(id.account.bankname)}">${esc(id.account.bankname)}</span>
              </div>
              ${id.account.account_number ? `<div class="id-row"><span class="id-label">Kontonr.</span><span class="id-value copyable mono" data-copy="${esc(id.account.account_number)}">${esc(id.account.account_number)}</span></div>` : ''}
              ${id.account.bank_code      ? `<div class="id-row"><span class="id-label">BLZ</span><span class="id-value copyable mono" data-copy="${esc(id.account.bank_code)}">${esc(id.account.bank_code)}</span></div>` : ''}
            </div>
          </div>
        </div>
      `).join('') +
    `</div>`;
  }

  // ---- Table view ----
  function renderTable(data) {
    const cols = [
      { key: 'id',              label: '#'          },
      { key: 'fullname',        label: 'Name'       },
      { key: 'birthday',        label: 'Geburtstag' },
      { key: 'age',             label: 'Alter'      },
      { key: 'email',           label: 'E-Mail'     },
      { key: 'phone',           label: 'Telefon'    },
      { key: '_address',        label: 'Adresse'    },
      { key: '_iban',           label: 'IBAN'       },
      { key: '_bic',            label: 'BIC'        },
      { key: '_bankname',       label: 'Bank'       },
    ];

    const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
    const rows = data.map(id => {
      const cells = cols.map(c => {
        let val = '', copyVal = '';
        switch(c.key) {
          case '_address':  val = esc(id.address.full);  copyVal = id.address.full;  break;
          case '_iban':     val = esc(id.account.iban_formatted || id.account.iban); copyVal = id.account.iban; break;
          case '_bic':      val = esc(id.account.bic);   copyVal = id.account.bic;   break;
          case '_bankname': val = esc(id.account.bankname); copyVal = id.account.bankname; break;
          default: val = esc(id[c.key] ?? ''); copyVal = String(id[c.key] ?? '');
        }
        return `<td><span class="copyable" data-copy="${esc(copyVal)}">${val}</span></td>`;
      }).join('');
      return `<tr data-id="${id.id}">
        ${cells}
        <td><button class="icon-btn copy-card-btn" data-copy='${JSON.stringify(id)}' title="JSON kopieren">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button></td>
      </tr>`;
    }).join('');

    return `<div class="table-scroll">
      <table class="data-table identities-table">
        <thead><tr>${head}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ---- Copy on click (delegated) ----
  document.addEventListener('click', e => {
    // Copyable value
    const copyable = e.target.closest('.copyable');
    if (copyable && copyable.dataset.copy !== undefined) {
      navigator.clipboard.writeText(copyable.dataset.copy).then(() => flashEl(copyable));
      return;
    }
    // Copy card/row as JSON
    const copyBtn = e.target.closest('.copy-card-btn');
    if (copyBtn && copyBtn.dataset.copy) {
      try {
        const obj = JSON.parse(copyBtn.dataset.copy);
        navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => flashBtn(copyBtn, '✓'));
      } catch {}
    }
  });

  // ---- Helpers ----
  function flashBtn(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }

  function flashEl(el) {
    el.classList.add('copy-flash');
    setTimeout(() => el.classList.remove('copy-flash'), 600);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
