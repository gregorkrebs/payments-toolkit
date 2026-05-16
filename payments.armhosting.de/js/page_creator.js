/* page_creator.js - Zahlungsdatei erstellen */
(function() {
  'use strict';

  const GROUPS = {
    SEPA:  ['CCT', 'CTV', 'CCU', 'CDD', 'CDB'],
    DTAZV: ['AZV', 'AXZ'],
  };

  let fieldDefs   = null;  // Array der Sektionen (direkt von API)
  let txCount     = 1;
  let lastXml     = '';
  let lastVersion = '';
  let lastIsValid = false;

  function init() {
    const catSel    = document.getElementById('creator-category-select');
    const otLabel   = document.getElementById('creator-ordertype-label');
    const orderSel  = document.getElementById('creator-ordertype-select');
    const ruleLabel = document.getElementById('creator-ruleset-label');
    const ruleSel   = document.getElementById('creator-ruleset-select');
    const startBtn  = document.getElementById('creator-start-btn');
    const dlBtn     = document.getElementById('creator-download-btn');
    const valBtn    = document.getElementById('creator-validate-btn');

    function updateRulesets(ot) {
      ruleLabel.style.display = 'none';
      startBtn.style.display = 'none';
      startBtn.disabled = true;
      if (!ot) return;
      fetch('/api/generate/rulesets')
        .then(r => r.json())
        .then(data => {
          const rules = data[ot] || [];
          ruleSel.innerHTML = rules.map(r =>
            `<option value="${esc(r.id)}">${esc(r.label || r.id)}</option>`
          ).join('');
          ruleLabel.style.display = rules.length ? 'block' : 'none';
          startBtn.disabled = !rules.length;
          startBtn.style.display = rules.length ? 'inline-block' : 'none';
        })
        .catch(e => console.error('Rulesets:', e));
    }

    catSel.addEventListener('change', function() {
      const cat = this.value;
      otLabel.style.display = 'none';
      ruleLabel.style.display = 'none';
      startBtn.style.display = 'none';
      startBtn.disabled = true;
      document.getElementById('creator-form-area').style.display = 'none';
      document.getElementById('creator-preview').style.display = 'none';
      if (!cat) return;
      const types = GROUPS[cat] || [];
      orderSel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      otLabel.style.display = 'block';
      updateRulesets(types[0]);
    });

    orderSel.addEventListener('change', function() {
      updateRulesets(this.value);
    });

    startBtn.addEventListener('click', function() {
      const painVer = ruleSel.value;
      if (!painVer) return;
      lastVersion = painVer;
      txCount = 1;
      loadAndRenderForm(painVer);
    });

    document.getElementById('creator-form-area').addEventListener('click', function(e) {
      if (e.target.id === 'add-tx-btn') addTransaction();
      if (e.target.classList.contains('remove-tx-btn')) removeTransaction(e.target);
      if (e.target.classList.contains('gen-id-btn')) {
        const inp = document.getElementById(e.target.getAttribute('data-target'));
        if (inp) inp.value = generateMsgId();
      }
    });

    document.getElementById('creator-form-area').addEventListener('submit', function(e) {
      e.preventDefault();
      submitForm();
    });

    // Download nur wenn valide
    dlBtn.addEventListener('click', function() {
      if (!lastXml) return;
      if (!lastIsValid) {
        alert('Download gesperrt — Datei enthält Validierungsfehler. Bitte korrigieren.');
        return;
      }
      triggerDownload(lastXml, buildFilename(lastVersion), 'application/xml');
    });

    valBtn.addEventListener('click', function() {
      if (!lastXml) return;
      const blob = new Blob([lastXml], { type: 'application/xml' });
      const file = new File([blob], 'generated.xml', { type: 'application/xml' });
      window.location.hash = 'validate';
      setTimeout(() => {
        const input = document.getElementById('validate-file-input');
        if (!input) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }, 200);
    });
  }

  function buildFilename(version) {
    const d = new Date().toISOString().slice(0, 10);
    return `${version.replace(/\./g, '_')}_${d}.xml`;
  }

  async function loadAndRenderForm(painVer) {
    try {
      const resp = await fetch(`/api/generate/fields/${encodeURIComponent(painVer)}`);
      if (!resp.ok) throw new Error('Felder konnten nicht geladen werden');
      fieldDefs = await resp.json(); // Array der Sektionen
      renderForm(fieldDefs, painVer);
    } catch(e) {
      document.getElementById('creator-form-area').innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  function generateMsgId() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return 'MSG' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
           pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  }

  function renderForm(defs, painVer) {
    const area = document.getElementById('creator-form-area');
    // fieldDefs ist direkt das Array (oder Objekt mit .sections)
    const sections = Array.isArray(defs) ? defs : (defs && defs.sections);
    if (!sections || !sections.length) {
      area.innerHTML = '<p>Keine Felddefinitionen gefunden.</p>'; return;
    }
    let html = `<form id="creator-form"><input type="hidden" name="painVersion" value="${esc(painVer)}">`;
    sections.filter(s => !s.multi).forEach(sec => {
      html += `<h2>${esc(sec.section)}</h2>`;
      sec.fields.forEach(f => { html += renderField(f, 'main'); });
    });
    const txSec = sections.find(s => s.multi);
    if (txSec) {
      html += `<h2>${esc(txSec.section)}</h2>`;
      html += `<div id="tx-blocks">${renderTxBlock(txSec.fields, 0)}</div>`;
      html += `<button type="button" id="add-tx-btn">+ Transaktion hinzufügen</button>`;
    }
    html += '<br><div id="creator-form-actions" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-top:1rem;">';
    html += '<button type="submit" class="btn-primary">XML generieren &amp; validieren</button>';
    html += '<div id="creator-autofill-container"></div>';
    html += '</div></form>';
    area.style.display = '';
    area.innerHTML = html;

    // Autofill Button
    const autoFillContainer = document.getElementById('creator-autofill-container');
    if (autoFillContainer) {
      autoFillContainer.appendChild(window.createAutofillBtn((id) => {
        const isV09 = lastVersion && lastVersion.endsWith('09');
        document.querySelectorAll('#creator-form input, #creator-form select').forEach(input => {
          const n = input.name || '';
          if (n.includes('IBAN'))             input.value = id.account.iban;
          else if (n.includes('BIC'))         input.value = id.account.bic || 'MARKDEF1100';
          else if (n.includes('_Nm') || n.includes('Name')) input.value = id.fullname || id.fullName || '';
          // Strukturierte Adressfelder (pain.001.001.09)
          else if (isV09 && n.includes('StrtNm'))   input.value = id.address ? id.address.street || '' : '';
          else if (isV09 && n.includes('BldgNb'))   input.value = '';
          else if (isV09 && n.includes('PstCd'))    input.value = id.address ? id.address.plz || '' : '';
          else if (isV09 && n.includes('TwnNm'))    input.value = id.address ? id.address.city || '' : '';
          else if (n.includes('Ctry')) {
            if (input.tagName === 'SELECT') {
              const val = 'DE';
              Array.from(input.options).forEach(o => { o.selected = (o.value === val); });
            } else {
              input.value = 'DE';
            }
          }
          // Kombinierte Adresse (pain.001.001.03)
          else if (!isV09 && n.includes('AdrLine')) input.value = id.address ? id.address.full || '' : '';
          else if (input.type === 'number' && (n.includes('Amt') || n.includes('Amount'))) input.value = (Math.random() * 500 + 10).toFixed(2);
          else if (n.includes('CdtrSchmeId')) input.value = 'DE98ZZZ09999999999';
          else if (n.includes('MndtId'))      input.value = 'MNDT-' + Math.floor(Math.random() * 100000);
          else if (n.includes('Ustrd'))       input.value = 'Rechnung ' + Math.floor(Math.random() * 10000);
          else if (n.includes('EndToEndId'))  input.value = 'EREF' + Math.floor(Math.random() * 100000);
          else if (input.type === 'date' && !input.value) {
            const d = new Date();
            if (n.includes('DtOfSgntr')) d.setDate(d.getDate() - 14);
            else d.setDate(d.getDate() + 1);
            input.value = d.toISOString().split('T')[0];
          }
        });
      }));
    }

    document.getElementById('creator-preview').style.display = 'none';
    document.getElementById('creator-validate-result').innerHTML = '';
    lastIsValid = false;
  }

  function renderField(f, prefix) {
    const id  = `f_${prefix}_${f.name}`;
    const req = f.required ? '<span class="required-mark">*</span>' : '';
    let input = '';
    if (f.type === 'select' && f.options) {
      input = `<select id="${id}" name="${f.name}"${f.required?' required':''}>` +
        f.options.map(o => {
          const val = (o && typeof o === 'object') ? (o.v || o.value || '') : o;
          const lbl = (o && typeof o === 'object') ? (o.l || o.label || val) : o;
          return `<option value="${esc(val)}">${esc(lbl)}</option>`;
        }).join('') + `</select>`;
    } else if (f.type === 'date') {
      input = `<input type="date" id="${id}" name="${f.name}"${f.required?' required':''}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}>`;
    } else {
      const maxLen = f.maxLen ? ` maxlength="${f.maxLen}"` : '';
      const defVal = f.generate ? ` value="${esc(generateMsgId())}"` : '';
      input = `<input type="text" id="${id}" name="${f.name}"${f.required?' required':''}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''} ${maxLen}${defVal}>`;
    }
    if (f.generate) {
      input = `<div class="field-with-btn">${input}<button type="button" class="gen-id-btn" data-target="${id}" title="Neue ID generieren"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Neu</button></div>`;
    }
    const help = f.help ? `<div class="field-help">${esc(f.help)}</div>` : '';
    return `<label>${esc(f.label)} ${req}${input}${help}</label>`;
  }

  function renderTxBlock(fields, idx) {
    const removeBtn = idx > 0 ? `<button type="button" class="remove-tx-btn" data-idx="${idx}">Entfernen</button>` : '';
    let html = `<div class="tx-block" data-idx="${idx}"><div class="tx-block-header">Transaktion ${idx+1} ${removeBtn}</div>`;
    fields.forEach(f => { html += renderField(f, `tx${idx}`); });
    return html + '</div>';
  }

  function addTransaction() {
    // BUG FIX: fieldDefs ist direkt das Array (kein .sections Wrapper)
    const sections = Array.isArray(fieldDefs) ? fieldDefs : (fieldDefs && fieldDefs.sections ? fieldDefs.sections : []);
    const txSec = sections.find(s => s.multi);
    if (!txSec) return;
    const container = document.getElementById('tx-blocks');
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = renderTxBlock(txSec.fields, txCount);
    container.appendChild(div.firstElementChild);
    txCount++;
  }

  function removeTransaction(btn) {
    const block = btn.closest('.tx-block');
    if (block) block.remove();
    document.querySelectorAll('.tx-block').forEach((b, i) => {
      const h = b.querySelector('.tx-block-header');
      const removeBtn = i > 0 ? `<button type="button" class="remove-tx-btn" data-idx="${i}">Entfernen</button>` : '';
      if (h) h.innerHTML = `Transaktion ${i+1} ${removeBtn}`;
    });
  }

  async function submitForm() {
    const form = document.getElementById('creator-form');
    if (!form) return;
    const resultEl    = document.getElementById('creator-validate-result');
    const previewEl   = document.getElementById('creator-preview');
    const dlBtn       = document.getElementById('creator-download-btn');

    const formData = new FormData(form);
    const data     = {};
    for (const [k,v] of formData.entries()) { data[k] = v; }

    const txBlocks = document.querySelectorAll('.tx-block');
    if (txBlocks.length) {
      data.transactions = Array.from(txBlocks).map(block => {
        const txData = {};
        block.querySelectorAll('input,select').forEach(input => {
          if (input.name) txData[input.name] = input.value;
        });
        return txData;
      });
    }

    resultEl.innerHTML = '<span class="loader">Generiere und validiere...</span>';
    lastIsValid = false;
    if (dlBtn) { dlBtn.disabled = true; dlBtn.title = 'Erst validieren'; }

    try {
      // Schritt 1: Generieren
      const genResp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!genResp.ok) {
        const err = await genResp.json().catch(() => ({ error: genResp.statusText }));
        throw new Error(err.error || genResp.statusText);
      }
      lastXml = await genResp.text();

      // Vorschau anzeigen
      document.getElementById('creator-xml-preview').textContent = lastXml;
      previewEl.style.display = 'block';

      // Schritt 2: Automatisch validieren (außer DTAZV — eigener Validator)
      if (data.painVersion && data.painVersion !== 'dtazv') {
        const blob = new Blob([lastXml], { type: 'application/xml' });
        const file = new File([blob], 'generated.xml', { type: 'application/xml' });
        const valResult = await window.uploadFile('/api/validate', file);

        if (valResult.ok) {
          lastIsValid = true;
          if (dlBtn) { dlBtn.disabled = false; dlBtn.title = 'XML herunterladen'; }
          const warnCount = (valResult.warnings || []).length;
          resultEl.innerHTML = statusBox(true, 'Validierung erfolgreich',
            warnCount > 0 ? `${warnCount} Hinweis(e) — Datei ist SEPA-konform` : 'Datei ist SEPA-konform') +
            (warnCount > 0 ? renderIssues(valResult.warnings) : '');
        } else {
          lastIsValid = false;
          if (dlBtn) { dlBtn.disabled = true; dlBtn.title = 'Download gesperrt: Validierungsfehler'; }
          const errCount = (valResult.errors || []).length;
          resultEl.innerHTML = statusBox(false, `Validierungsfehler (${errCount})`,
            'Download gesperrt — bitte Fehler korrigieren') +
            renderIssues(valResult.errors || valResult.issues || []);
        }
      } else {
        // DTAZV: kein PAIN-Validator, Download erlaubt
        lastIsValid = true;
        if (dlBtn) { dlBtn.disabled = false; dlBtn.title = 'Datei herunterladen'; }
        resultEl.innerHTML = statusBox(true, 'Datei generiert', 'DTAZV-Datei erstellt');
      }
    } catch(e) {
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
