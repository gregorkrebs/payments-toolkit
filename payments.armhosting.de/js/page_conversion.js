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

  async function sniffXmlFormat(file) {
    return new Promise(function(resolve) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const head = e.target.result;
        if (/pain\.001|pain\.008/.test(head)) resolve('PAIN');
        else if (/camt\.053|BkToCstmrStmt/.test(head)) resolve('C53');
        else resolve('XML');
      };
      reader.readAsText(file.slice(0, 400));
    });
  }

  async function loadOptions(file) {
    const optDiv = document.getElementById('convert-options');
    const resSel = document.getElementById('convert-target-select');
    optDiv.style.display = 'none';
    try {
      const resp = await fetch('/api/convert/options');
      if (!resp.ok) throw new Error('Konnte Optionen nicht laden');
      const raw = await resp.json();
      convOptions = Array.isArray(raw) ? raw : (raw.conversions || []);

      const name = file.name.toLowerCase();
      let srcFormat = '';
      if (name.endsWith('.sta') || name.endsWith('.mt940')) {
        srcFormat = 'STA';
      } else if (name.endsWith('.zip')) {
        srcFormat = 'C53-ARCHIVE';
      } else if (name.endsWith('.c53')) {
        srcFormat = 'C53';
      } else if (name.endsWith('.xml')) {
        srcFormat = await sniffXmlFormat(file);
      }

      let relevant;
      if (srcFormat === 'STA') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('STA'));
      } else if (srcFormat === 'C53-ARCHIVE') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('C53-ARCHIVE'));
      } else if (srcFormat === 'C53') {
        relevant = convOptions.filter(o => o.from.toUpperCase().startsWith('C53') && !o.from.toUpperCase().startsWith('C53-ARCHIVE'));
      } else if (srcFormat === 'PAIN') {
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
      document.getElementById('convert-result').innerHTML = '';
    } catch(e) {
      document.getElementById('convert-result').innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  async function runConvert() {
    if (!currentFile) return;
    const target   = document.getElementById('convert-target-select').value;
    const resultEl = document.getElementById('convert-result');
    resultEl.innerHTML = '<span class="loader">Konvertierung läuft...</span>';
    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('targetFormat', target);
      const resp = await fetch('/api/convert', { method: 'POST', body: fd });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err);
      }
      const blob = await resp.blob();
      const cd   = resp.headers.get('content-disposition') || '';
      const m    = cd.match(/filename="([^"]+)"/);
      const fname = m ? m[1] : currentFile.name.replace(/\.\w+$/, '') + '_konvertiert';
      triggerDownload(blob, fname, resp.headers.get('content-type') || 'application/octet-stream');
      resultEl.innerHTML = statusBox(true, 'Konvertiert', `Datei "${esc(fname)}" wurde heruntergeladen.`);
    } catch(e) {
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
