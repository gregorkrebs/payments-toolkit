/* page_tools.js - Hilfstools */
(function() {
  'use strict';

  function init() {
    // Tab switching
    document.querySelectorAll('#tools-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#tools-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        const panel = document.getElementById('tool-' + this.dataset.tool);
        if (panel) panel.classList.add('active');
      });
    });

    // Add Autofill buttons to tool panels
    
    // 1. IBAN pruefen
    const h2Validate = document.querySelector('#tool-iban-validate h2');
    h2Validate.appendChild(window.createAutofillBtn((id) => {
      document.getElementById('iban-validate-input').value = id.account.iban;
    }));

    // 2. IBAN berechnen
    const h2Calc = document.querySelector('#tool-iban-calculate h2');
    h2Calc.appendChild(window.createAutofillBtn((id) => {
      document.getElementById('iban-calc-country').value = id.account.iban.substring(0,2);
      document.getElementById('iban-calc-bban').value = id.account.iban.substring(4);
    }));

    // 3. Deutsche IBAN berechnen
    const h2De = document.querySelector('#tool-iban-de h2');
    h2De.appendChild(window.createAutofillBtn((id) => {
      document.getElementById('iban-de-blz').value = id.account.bank_code;
      document.getElementById('iban-de-konto').value = id.account.account_number;
    }));

    // 4. IBAN zerlegen
    const h2Breakdown = document.querySelector('#tool-iban-breakdown h2');
    h2Breakdown.appendChild(window.createAutofillBtn((id) => {
      document.getElementById('iban-breakdown-input').value = id.account.iban;
    }));

    // IBAN validate
    document.getElementById('iban-validate-btn').addEventListener('click', async () => {
      const iban = document.getElementById('iban-validate-input').value.trim();
      const el   = document.getElementById('iban-validate-result');
      if (!iban) { el.innerHTML = statusBox(null, 'Bitte IBAN eingeben'); return; }
      try {
        const r = await postJson('/api/tools/iban/validate', { iban });
        if (r.valid) {
          let details = `IBAN: <strong>${esc(iban)}</strong> ist gueltig.<br><br>`;
          if (r.country === 'DE') {
            details += `
              <table class="data-table" style="margin-top: 0.5rem;">
                <tbody>
                  <tr><td style="width:140px;color:var(--text-muted)">IBAN</td><td><strong>${esc(r.iban)}</strong></td></tr>
                  <tr><td style="color:var(--text-muted)">BLZ</td><td>${esc(r.blz || '')}</td></tr>
                  <tr><td style="color:var(--text-muted)">Kontonummer</td><td>${esc(r.konto || '')}</td></tr>
                  <tr><td style="color:var(--text-muted)">BIC</td><td>${esc(r.bic || '-')}</td></tr>
                  <tr><td style="color:var(--text-muted)">Bank</td><td>${esc(r.bankname || '')}</td></tr>
                  <tr><td style="color:var(--text-muted)">Ort</td><td>${esc(r.plz || '')} ${esc(r.city || '')}</td></tr>
                  <tr><td style="color:var(--text-muted)">PZ-Methode</td><td>${esc(r.method || '-')}</td></tr>
                </tbody>
              </table>
            `;
          }
          el.innerHTML = statusBox(true, 'Gueltig', details);
        } else {
          el.innerHTML = statusBox(false, 'Ungueltig', esc(r.error || r.message || ''));
        }
      } catch(e) { el.innerHTML = statusBox(false, 'Fehler', esc(e.message)); }
    });

    // Bank search (fuzzy autocomplete)
    const searchInput = document.getElementById('bank-search-input');
    const searchResults = document.getElementById('bank-search-results');
    
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });

    // Handle typing
    searchInput.addEventListener('input', async (e) => {
      const val = e.target.value.trim();
      if (val.length < 3) {
        searchResults.style.display = 'none';
        return;
      }
      try {
        const r = await fetch('/api/tools/banksearch?q=' + encodeURIComponent(val));
        const json = await r.json();
        const results = json.results || [];
        
        if (results.length === 0) {
          searchResults.innerHTML = '<div style="padding: 0.75rem; color: var(--tx2); font-size: 0.9em;">Keine Ergebnisse gefunden.</div>';
        } else {
          searchResults.innerHTML = results.map(b => {
            const isDE  = b.source === 'DE';
            const badge = isDE
              ? ''
              : `<span style="font-size:0.75em;padding:1px 5px;border-radius:3px;background:var(--in-bg);color:var(--in-t);border:1px solid var(--in-b);margin-left:5px">EU-SEPA</span>`;
            const locationLine = isDE
              ? `<span>BLZ: ${esc(b.blz)}</span><span>BIC: ${b.bic ? esc(b.bic) : '–'}</span><span>${b.plz ? esc(b.plz)+' ' : ''}${b.city ? esc(b.city) : '–'}</span>`
              : `<span>Land: ${esc(b.country)}</span><span>BIC: ${b.bic ? esc(b.bic) : '–'}</span><span>${b.city ? esc(b.city) : '–'}</span>`;
            return `<div class="bank-search-item" style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--border);cursor:pointer"
                 data-source="${esc(b.source)}" data-blz="${esc(b.blz)}" data-bic="${esc(b.bic||'')}"
                 data-name="${esc(b.name)}" data-plz="${esc(b.plz||'')}" data-city="${esc(b.city||'')}"
                 data-address="${esc(b.address||'')}" data-country="${esc(b.country||'')}">
              <strong style="font-size:0.95em;line-height:1.2">${esc(b.name)}${badge}</strong>
              <div style="font-size:0.83em;color:var(--tx2);margin-top:0.2rem;display:flex;gap:1rem;flex-wrap:wrap">${locationLine}</div>
            </div>`;
          }).join('');

          // Hover + click
          searchResults.querySelectorAll('.bank-search-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--al)');
            item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');
            item.addEventListener('click', () => {
              const d = item.dataset;
              const resultEl = document.getElementById('bank-search-result');
              const isDE = d.source === 'DE';
              const rows = [];
              rows.push(`<tr><td style="width:140px;color:var(--tx2)">Bank</td><td><strong>${esc(d.name)}</strong></td></tr>`);
              if (isDE && d.blz) rows.push(`<tr><td style="color:var(--tx2)">BLZ</td><td>${esc(d.blz)}</td></tr>`);
              rows.push(`<tr><td style="color:var(--tx2)">BIC / SWIFT</td><td>${d.bic ? esc(d.bic) : '–'}</td></tr>`);
              if (isDE) {
                rows.push(`<tr><td style="color:var(--tx2)">Ort</td><td>${d.plz ? esc(d.plz)+' ' : ''}${d.city ? esc(d.city) : '–'}</td></tr>`);
              } else {
                if (d.address) rows.push(`<tr><td style="color:var(--tx2)">Adresse</td><td>${esc(d.address)}</td></tr>`);
                if (d.city)    rows.push(`<tr><td style="color:var(--tx2)">Stadt</td><td>${esc(d.city)}</td></tr>`);
                rows.push(`<tr><td style="color:var(--tx2)">Land</td><td>${esc(d.country)}</td></tr>`);
              }
              const source = isDE
                ? '<span style="font-size:0.8em;color:var(--tx2)">Quelle: Bundesbank BLZ-Datei</span>'
                : '<span style="font-size:0.8em;padding:1px 6px;border-radius:3px;background:var(--in-bg);color:var(--in-t);border:1px solid var(--in-b)">EU-SEPA Teilnehmer (EPC)</span>';
              resultEl.innerHTML = statusBox(true, 'Bank gefunden', `
                <table class="data-table" style="margin-top:0.5rem"><tbody>${rows.join('')}</tbody></table>
                <div style="margin-top:0.5rem">${source}</div>
              `);
              searchResults.style.display = 'none';
            });
          });
        }
        searchResults.style.display = 'block';
      } catch (err) {
        console.error('Bank search failed:', err);
      }
    });

    // IBAN calculate (country + BBAN)
    document.getElementById('iban-calc-btn').addEventListener('click', async () => {
      const country = document.getElementById('iban-calc-country').value.trim().toUpperCase();
      const bban    = document.getElementById('iban-calc-bban').value.trim();
      const el      = document.getElementById('iban-calc-result');
      try {
        const r = await postJson('/api/tools/iban/calculate', { country, bban });
        if (r.iban) el.innerHTML = statusBox(true, 'IBAN berechnet', `<strong>${esc(r.iban)}</strong>`);
        else el.innerHTML = statusBox(false, 'Fehler', esc(r.error || ''));
      } catch(e) { el.innerHTML = statusBox(false, 'Fehler', esc(e.message)); }
    });

    // DE IBAN from BLZ + Konto
    document.getElementById('iban-de-btn').addEventListener('click', async () => {
      const blz   = document.getElementById('iban-de-blz').value.trim();
      const konto = document.getElementById('iban-de-konto').value.trim();
      const el    = document.getElementById('iban-de-result');
      try {
        const r = await postJson('/api/tools/iban/de', { blz, konto });
        if (r.iban) el.innerHTML = statusBox(true, 'IBAN berechnet', `<strong>${esc(r.iban)}</strong>`);
        else el.innerHTML = statusBox(false, 'Fehler', esc(r.error || ''));
      } catch(e) { el.innerHTML = statusBox(false, 'Fehler', esc(e.message)); }
    });

    // IBAN breakdown
    document.getElementById('iban-breakdown-btn').addEventListener('click', async () => {
      const iban = document.getElementById('iban-breakdown-input').value.trim();
      const el   = document.getElementById('iban-breakdown-result');
      try {
        const r = await postJson('/api/tools/iban/breakdown', { iban });
        if (!r.ok) { el.innerHTML = statusBox(false, 'Ungueltig', esc(r.error||'')); return; }
        const bd = r.breakdown || r;
        let html = renderSummary([
          { label: 'IBAN',         value: bd.iban || iban },
          { label: 'Land',         value: bd.country || bd.countryCode || '' },
          { label: 'Pruefziffern', value: bd.checkDigits || '' },
          { label: 'BBAN',         value: bd.bban || '' },
        ]);
        if (bd.blz)   html += renderSummary([{ label: 'BLZ', value: bd.blz }, { label: 'Kontonummer', value: bd.konto || '' }]);
        if (bd.bankName) html += renderSummary([{ label: 'Bank', value: bd.bankName }]);
        el.innerHTML = html;
      } catch(e) { el.innerHTML = statusBox(false, 'Fehler', esc(e.message)); }
    });

    // Batch validation
    document.getElementById('iban-batch-btn').addEventListener('click', async () => {
      const raw   = document.getElementById('iban-batch-input').value;
      const ibans = raw.split('\n').map(l => l.trim()).filter(Boolean);
      const el    = document.getElementById('iban-batch-result');
      if (!ibans.length) { el.innerHTML = statusBox(null, 'Keine IBANs eingegeben'); return; }
      if (ibans.length > 500) { el.innerHTML = statusBox(false, 'Max. 500 IBANs erlaubt'); return; }
      try {
        const r    = await postJson('/api/tools/iban/batch', { ibans });
        const rows = r.results || r;
        let html   = `<p>Geprueft: ${rows.length} | Gueltig: ${rows.filter(x=>x.valid).length} | Ungueltig: ${rows.filter(x=>!x.valid).length}</p>`;
        html += `<table class="data-table"><thead><tr><th>#</th><th>IBAN</th><th>Status</th><th>Hinweis</th></tr></thead><tbody>`;
        rows.forEach((row, i) => {
          const cls = row.valid ? 'amt-credit' : 'amt-debit';
          html += `<tr>
            <td>${i+1}</td>
            <td>${esc(row.iban||row.input||'')}</td>
            <td class="${cls}">${row.valid ? 'Gueltig' : 'Ungueltig'}</td>
            <td>${esc(row.error||row.message||'')}</td>
          </tr>`;
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch(e) { el.innerHTML = statusBox(false, 'Fehler', esc(e.message)); }
    });
  }

  async function postJson(url, body) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || resp.statusText);
    }
    return resp.json();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
