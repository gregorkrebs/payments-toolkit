/* page_samples.js - Beispieldaten generieren */
(function() {
  'use strict';

  function init() {
    const formatSel   = document.getElementById('samples-format');
    const countSlider = document.getElementById('samples-count-slider');
    const countNum    = document.getElementById('samples-count-num');
    const dateRow     = document.getElementById('samples-date-row');
    const staDateRow  = document.getElementById('samples-sta-date-row');
    const genBtn      = document.getElementById('samples-gen-btn');
    const resultEl    = document.getElementById('samples-result');

    const pad = n => String(n).padStart(2, '0');
    function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

    function lastWeekday(from) {
      const d = new Date(from);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      return d;
    }

    function defaultStaDate() {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      document.getElementById('samples-sta-date').value = isoDate(lastWeekday(yesterday));
    }

    // Default date range: 7 days back to last weekday
    function defaultDates() {
      const lastWd = lastWeekday(new Date(new Date().setDate(new Date().getDate() - 1)));
      const from = new Date(lastWd); from.setDate(from.getDate() - 6);
      document.getElementById('samples-date-from').value = isoDate(from);
      document.getElementById('samples-date-to').value   = isoDate(lastWd);
    }

    function toggleDateRow() {
      const isSta = formatSel.value === 'sta';
      const isC53 = formatSel.value === 'c53';
      if (staDateRow) staDateRow.style.display = isSta ? '' : 'none';
      if (dateRow)    dateRow.style.display    = isC53 ? '' : 'none';
      if (isSta) defaultStaDate();
      if (isC53) defaultDates();
    }

    formatSel.addEventListener('change', toggleDateRow);
    toggleDateRow();

    // Add Autofill to details
    const summaryEl = document.querySelector('details summary');
    if (summaryEl) {
      summaryEl.appendChild(window.createAutofillBtn((id) => {
        document.getElementById('samples-iban').value = id.account.iban;
        document.getElementById('samples-bic').value = id.account.bic || '';
        document.getElementById('samples-acname').value = id.fullname || id.fullName || '';
      }));
    }

    // Sync slider <-> number input
    countSlider.addEventListener('input', function() { countNum.value = this.value; });
    countNum.addEventListener('input', function() {
      let v = Math.min(250, Math.max(1, parseInt(this.value) || 1));
      this.value = v; countSlider.value = v;
    });

    genBtn.addEventListener('click', async function() {
      const format   = formatSel.value;
      const count    = parseInt(countNum.value) || 10;
      const iban     = (document.getElementById('samples-iban').value    || '').trim() || undefined;
      const bic      = (document.getElementById('samples-bic').value     || '').trim() || undefined;
      const acname   = (document.getElementById('samples-acname').value  || '').trim() || undefined;
      const year     = (document.getElementById('samples-year').value    || String(new Date().getFullYear())).trim();
      const opBal    = (document.getElementById('samples-openbal').value || '').trim() || undefined;
      const staDate  = format === 'sta' ? (document.getElementById('samples-sta-date').value  || undefined) : undefined;
      const dateFrom = format === 'c53' ? (document.getElementById('samples-date-from').value || undefined) : undefined;
      const dateTo   = format === 'c53' ? (document.getElementById('samples-date-to').value   || undefined) : undefined;

      resultEl.innerHTML = '<span class="loader">Generiere Datei...</span>';
      genBtn.disabled = true;
      try {
        const resp = await fetch('/api/samples/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, count, iban, bic, accountName: acname, year, openingBalance: opBal, staDate, dateFrom, dateTo }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: resp.statusText }));
          throw new Error(err.error || resp.statusText);
        }
        const blob     = await resp.blob();
        const filename = resp.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
                         || (format === 'c53' ? 'example.xml' : 'example.sta');
        const isZip = filename.toLowerCase().endsWith('.c53') || blob.type.includes('zip');
        if (isZip) {
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a'); a.href = url; a.download = filename; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } else {
          triggerDownload(await blob.text(), filename, blob.type);
        }
        const label = format === 'c53'
          ? (isZip ? 'C53 Archiv (.C53 ZIP mit je 1 XML/Werktag)' : 'C53 XML (CAMT.053)')
          : 'STA (MT940)';
        resultEl.innerHTML = statusBox(true, 'Fertig',
          `<strong>${esc(filename)}</strong> mit ${count} Umsätzen wurde als <em>${label}</em> heruntergeladen.`);
      } catch(e) {
        resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
      } finally {
        genBtn.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
