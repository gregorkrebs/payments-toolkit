/* page_merge.js - Zahlungen zusammenfassen */
(function() {
  'use strict';

  let selectedFiles = [];
  let mergedData = null;

  function init() {
    const dropZone = document.getElementById('merge-upload-area');
    const fileInput = document.getElementById('merge-file-input');
    const fileList = document.getElementById('merge-file-list');
    const controls = document.getElementById('merge-controls');
    const exportBtn = document.getElementById('merge-export-btn');
    const resultEl = document.getElementById('merge-result');

    if (!dropZone) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', () => {
      addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });

    exportBtn.addEventListener('click', exportMergedFile);

    function addFiles(files) {
      const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'));
      const rejected = files.length - xmlFiles.length;
      xmlFiles.forEach(f => {
        if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
          selectedFiles.push(f);
        }
      });
      renderFileList();
      if (rejected > 0) {
        resultEl.innerHTML = statusBox(false, 'Hinweis', `${rejected} Datei(en) uebersprungen (nur .xml erlaubt).`);
      }
    }

    function renderFileList() {
      if (selectedFiles.length === 0) {
        fileList.innerHTML = '<p class="packer-empty">Noch keine Dateien ausgewaehlt.</p>';
        controls.style.display = 'none';
        return;
      }
      controls.style.display = 'block';
      fileList.innerHTML = selectedFiles.map((f, i) =>
        `<div class="packer-file-item">
          <span class="packer-file-name">${esc(f.name)}</span>
          <span class="packer-file-size">${(f.size / 1024).toFixed(1)} KB</span>
          <button class="btn-icon packer-remove" data-idx="${i}" title="Entfernen">&times;</button>
        </div>`
      ).join('');
      fileList.querySelectorAll('.packer-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedFiles.splice(parseInt(btn.dataset.idx), 1);
          renderFileList();
        });
      });
    }

    async function exportMergedFile() {
      if (selectedFiles.length === 0) return;
      exportBtn.disabled = true;
      resultEl.innerHTML = '<span class="loader">Verarbeite Dateien...</span>';
      
      try {
        const fd = new FormData();
        selectedFiles.forEach(f => fd.append('files', f, f.name));
        
        // Add global parameters if provided
        const name = document.getElementById('merge-name')?.value;
        const iban = document.getElementById('merge-iban')?.value;
        const bic = document.getElementById('merge-bic')?.value;
        const valuta = document.getElementById('merge-valuta')?.value;
        
        if (name) fd.append('name', name);
        if (iban) fd.append('iban', iban);
        if (bic) fd.append('bic', bic);
        if (valuta) fd.append('valuta', valuta);

        const resp = await fetch('/api/merge/export', { method: 'POST', body: fd });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: resp.statusText }));
          throw new Error(err.error || resp.statusText);
        }
        const blob = await resp.blob();
        const filename = resp.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'merged_payment.xml';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resultEl.innerHTML = statusBox(true, 'Fertig', `<strong>${esc(filename)}</strong> wurde heruntergeladen.`);
      } catch(e) {
        resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
      } finally {
        exportBtn.disabled = false;
      }
    }

    renderFileList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
