/* page_packer.js — C53 Packer: XML-Dateien zu einer .C53 ZIP-Datei packen */
(function() {
  'use strict';

  let selectedFiles = [];

  function init() {
    const dropZone  = document.getElementById('packer-drop-zone');
    const fileInput = document.getElementById('packer-file-input');
    const fileList  = document.getElementById('packer-file-list');
    const packBtn   = document.getElementById('packer-pack-btn');
    const clearBtn  = document.getElementById('packer-clear-btn');
    const resultEl  = document.getElementById('packer-result');

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

    clearBtn.addEventListener('click', () => {
      selectedFiles = [];
      renderFileList();
    });

    packBtn.addEventListener('click', () => packFiles(resultEl, packBtn));

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
        packBtn.disabled  = true;
        clearBtn.disabled = true;
        return;
      }
      packBtn.disabled  = false;
      clearBtn.disabled = false;
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

    renderFileList();
  }

  async function packFiles(resultEl, packBtn) {
    if (selectedFiles.length === 0) return;
    packBtn.disabled = true;
    resultEl.innerHTML = '<span class="loader">Packe Dateien...</span>';
    try {
      const fd = new FormData();
      selectedFiles.forEach(f => fd.append('files', f, f.name));
      const resp = await fetch('/api/packer/create', { method: 'POST', body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
      }
      const blob     = await resp.blob();
      const filename = resp.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'archive.C53';
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const count = resp.headers.get('X-File-Count') || selectedFiles.length;
      resultEl.innerHTML = statusBox(true, 'Fertig',
        `<strong>${esc(filename)}</strong> mit ${count} XML-Datei(en) wurde heruntergeladen.`);
    } catch(e) {
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    } finally {
      packBtn.disabled = false;
    }
  }

  init();
})();
