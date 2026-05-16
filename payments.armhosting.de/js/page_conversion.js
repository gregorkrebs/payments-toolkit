/* page_conversion.js - Format-Konvertierung */
(function() {
  'use strict';

  let currentFile = null;
  let convOptions = [];

  function init() {
    initUploadZone('convert-upload-area', 'convert-file-input', function(file, zone) {
      currentFile = file;
      setZoneFile(zone, file);
      loadOptions(file);
    });

    const runBtn = document.getElementById('convert-run-btn');
    if (runBtn) runBtn.addEventListener('click', runConvert);
  }

  // Quellformat via Namespace-Analyse (vollautomatisch)
  async function detectSourceFormat(file) {
    return new Promise(function(resolve) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const head = e.target.result;
        const name = file.name.toLowerCase();
        if (name.endsWith('.sta') || name.endsWith('.mt940') || /^:20:/m.test(head)) {
          return resolve({ format: 'STA', display: 'STA (MT940)' });
        }
        if (name.endsWith('.zip') || head.charCodeAt(0) === 0x50) {
          return resolve({ format: 'C53-ARCHIVE', display: 'C53-Archiv (ZIP)' });
        }
        // Namespace-Analyse für XML
        const nsMatch = head.match(/pain\.\d{3}\.\d{3}\.\d{2}/);
        if (nsMatch) {
          return resolve({ format: 'PAIN', version: nsMatch[0], display: nsMatch[0] });
        }
        if (/camt\.053|BkToCstmrStmt/.test(head)) {
          if (name.endsWith('.c53') || name.endsWith('.zip')) {
            return resolve({ format: 'C53-ARCHIVE', display: 'C53-Archiv' });
          }
          return resolve({ format: 'C53', display: 'C53 (CAMT.053)' });
        }
        resolve({ format: 'UNKNOWN', display: 'Unbekannt' });
      };
      reader.readAsText(file.slice(0, 600));
    });
  }

  async function loadOptions(file) {
    const optDiv    = document.getElementById('convert-options');
    const resSel    = document.getElementById('convert-target-select');
    const resultEl  = document.getElementById('convert-result');
    optDiv.style.display = 'none';
    resultEl.innerHTML = '<span class="loader">Format wird erkannt...</span>';

    try {
      const [resp, srcInfo] = await Promise.all([
        fetch('/api/convert/options'),
        detectSourceFormat(file),
      ]);
      if (!resp.ok) throw new Error('Konnte Optionen nicht laden');
      const raw = await resp.json();
      convOptions = Array.isArray(raw) ? raw : (raw.conversions || []);

      // Quellformat anzeigen (read-only)
      resultEl.innerHTML = `<div class="status-ok" style="margin-bottom:0.75rem">
        <strong>Quellformat erkannt:</strong> <code>${esc(srcInfo.display)}</code>
        ${srcInfo.version ? ` &nbsp;·&nbsp; Version: <code>${esc(srcInfo.version)}</code>` : ''}
      </div>`;

      // Relevante Zieloptionen filtern
      let relevant = [];
      const { format, version } = srcInfo;
      if (format === 'STA') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('STA'));
      } else if (format === 'C53-ARCHIVE') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('C53-ARCHIVE'));
      } else if (format === 'C53') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('C53') && !o.from.toUpperCase().startsWith('C53-ARCHIVE'));
      } else if (format === 'PAIN' && version) {
        relevant = convOptions.filter(o => o.from.toLowerCase() === version.toLowerCase());
      } else if (format === 'PAIN') {
        relevant = convOptions.filter(o => o.from.toLowerCase().startsWith('pain'));
      } else {
        relevant = convOptions;
      }

      const displayList = relevant.length ? relevant : convOptions;
      resSel.innerHTML = displayList.map(o =>
        `<option value="${esc(o.targetFormat || o.to || '')}">` +
        `${esc(o.label || (o.from + ' → ' + (o.targetFormat || o.to)))}` +
        `</option>`
      ).join('');
      optDiv.style.display = displayList.length ? 'flex' : 'none';
    } catch(e) {
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  async function runConvert() {
    if (!currentFile) return;
    const target   = document.getElementById('convert-target-select').value;
    const resultEl = document.getElementById('convert-result');

    // Pre-Conversion-Check: PAIN-Quellen validieren
    const srcInfo = await detectSourceFormat(currentFile);
    if (srcInfo.format === 'PAIN') {
      resultEl.innerHTML = '<span class="loader">Quell-Datei wird validiert...</span>';
      try {
        const preVal = await window.uploadFile('/api/validate', currentFile);
        if (!preVal.ok) {
          const errCount = (preVal.errors || []).length;
          resultEl.innerHTML =
            statusBox(false, `Quelldatei ungültig (${errCount} Fehler) — Konvertierung abgebrochen`,
              'Bitte Quelldatei zuerst korrigieren') +
            renderIssues(preVal.errors || preVal.issues || []);
          return;
        }
      } catch(e) {
        resultEl.innerHTML = statusBox(false, 'Validierungsfehler', esc(e.message));
        return;
      }
    }

    resultEl.innerHTML = '<span class="loader">Konvertierung läuft...</span>';
    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('targetFormat', target);
      const resp = await fetch('/api/convert', { method: 'POST', body: fd });
      if (!resp.ok) {
        const errText = await resp.text();
        let msg = errText;
        try { msg = JSON.parse(errText).error || errText; } catch {}
        throw new Error(msg);
      }
      const blob  = await resp.blob();
      const cd    = resp.headers.get('content-disposition') || '';
      const m     = cd.match(/filename="([^"]+)"/);
      const fname = m ? m[1] : currentFile.name.replace(/\.\w+$/, '') + '_konvertiert';
      triggerDownload(blob, fname, resp.headers.get('content-type') || 'application/octet-stream');

      // Post-Conversion-Check: Output validieren (wenn PAIN)
      if (target && target.startsWith('pain')) {
        resultEl.innerHTML = '<span class="loader">Konvertierter Output wird validiert...</span>';
        const convertedFile = new File([blob], fname, { type: 'application/xml' });
        try {
          const postVal = await window.uploadFile('/api/validate', convertedFile);
          if (postVal.ok) {
            resultEl.innerHTML = statusBox(true, 'Konvertiert & validiert',
              `"${esc(fname)}" wurde heruntergeladen und ist SEPA-konform.`);
          } else {
            const errCount = (postVal.errors || []).length;
            resultEl.innerHTML = statusBox(null, `Konvertiert — aber ${errCount} Validierungsfehler im Output`,
              `"${esc(fname)}" heruntergeladen. Bitte Output prüfen.`) +
              renderIssues(postVal.errors || postVal.issues || []);
          }
        } catch {
          resultEl.innerHTML = statusBox(true, 'Konvertiert', `"${esc(fname)}" heruntergeladen (Post-Validierung fehlgeschlagen).`);
        }
      } else {
        resultEl.innerHTML = statusBox(true, 'Konvertiert', `Datei "${esc(fname)}" wurde heruntergeladen.`);
      }
    } catch(e) {
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
