/* page_merge.js - Enhanced Zahlungen zusammenfassen */
(function() {
  'use strict';

  // ── State ──
  const state = {
    files: [],       // { file, name, type, txCount, total }
    transactions: [] // { id, fileIdx, fileName, fileType, e2e, valuta, amt, ccy, cdtrNm, cdtrIban, cdtrBic, rmtInf, checked, modified }
  };
  let editingIdx = null;

  // ── DOM refs (populated in init) ──
  let uploadArea, fileInput, filesSection, filesTbody,
      txSection, txTbody, checkAll, txCountLabel, selectionInfo,
      exportBtn, selectAllBtn, selectNoneBtn, clearBtn,
      modal, mfE2e, mfValuta, mfAmt, mfCcy, mfCdtrNm, mfCdtrIban, mfCdtrBic, mfRmtinf,
      ibanErr, modalSave, modalCancel, modalClose, resultEl;

  // ── Toast ──
  function toast(msg, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 350);
    }, 3500);
  }

  // ── IBAN Mod97 ──
  function validateIban(iban) {
    const s = iban.replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(s)) return false;
    const rearranged = s.slice(4) + s.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let remainder = 0;
    for (const ch of numeric) {
      remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
    }
    return remainder === 1;
  }

  // ── XML sniff: detect CCT vs CCU ──
  function detectPainType(xmlStr) {
    if (/pain\.001\.002/.test(xmlStr) || /urn:iso:std:iso:20022:tech:xsd:pain\.001\.002/.test(xmlStr)) return 'CCU';
    if (/pain\.001/.test(xmlStr)) return 'CCT';
    return 'CCT';
  }

  // ── Parse pain.001 XML ──
  function parsePain001(xmlStr, fileIdx, fileName, fileType) {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const ns = 'urn:iso:std:iso:20022:tech:xsd:pain.001.003.03';

    function q(el, tag) {
      let found = el.getElementsByTagNameNS(ns, tag)[0];
      if (!found) found = el.getElementsByTagName(tag)[0];
      return found ? found.textContent.trim() : '';
    }

    // Gather ReqdExctnDt from PmtInf level (used as valuta fallback)
    const pmtInfs = doc.getElementsByTagName('PmtInf');
    const txs = [];
    let txIndex = 0;

    Array.from(pmtInfs).forEach(pmtInf => {
      const valutaFallback = q(pmtInf, 'ReqdExctnDt');
      const cdtTrfTxInfs = pmtInf.getElementsByTagName('CdtTrfTxInf');
      Array.from(cdtTrfTxInfs).forEach(tx => {
        const amt = parseFloat(q(tx, 'InstdAmt') || q(tx, 'Amt') || '0');
        const ccy = (() => {
          const amtEl = tx.querySelector('InstdAmt') || tx.querySelector('Amt');
          return amtEl ? (amtEl.getAttribute('Ccy') || 'EUR') : 'EUR';
        })();
        txs.push({
          id: fileIdx + '_' + txIndex++,
          fileIdx,
          fileName,
          fileType,
          e2e: q(tx, 'EndToEndId'),
          valuta: valutaFallback,
          amt,
          ccy,
          cdtrNm: q(tx, 'Nm'),
          cdtrIban: q(tx, 'IBAN'),
          cdtrBic: q(tx, 'BIC'),
          rmtInf: q(tx, 'Ustrd'),
          checked: true,
          modified: false,
        });
      });
    });
    return txs;
  }

  // ── Load files ──
  async function addFiles(files) {
    const xmlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'));
    const skipped = files.length - xmlFiles.length;
    let added = 0;

    for (const file of xmlFiles) {
      const already = state.files.find(x => x.name === file.name && x.size === file.size);
      if (already) continue;

      const text = await file.text();
      const fileType = detectPainType(text);
      const txs = parsePain001(text, state.files.length, file.name, fileType);
      const total = txs.reduce((s, t) => s + t.amt, 0);

      state.files.push({ file, name: file.name, type: fileType, txCount: txs.length, total, size: file.size });
      state.transactions.push(...txs);
      added++;
    }

    if (skipped > 0) toast(skipped + ' Datei(en) uebersprungen (nur .xml erlaubt)', 'err');
    if (added > 0) toast(added + ' Datei(en) geladen', 'ok');

    renderFilesTable();
    renderTxTable();
    updateSelectionInfo();
  }

  // ── Render file metadata table ──
  function renderFilesTable() {
    filesSection.style.display = state.files.length ? '' : 'none';
    txSection.style.display = state.files.length ? '' : 'none';

    filesTbody.innerHTML = state.files.map((f, i) => `
      <tr>
        <td>${esc(f.name)}</td>
        <td><span class="badge badge-${f.type.toLowerCase()}">${esc(f.type)}</span></td>
        <td>${f.txCount}</td>
        <td>${f.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td><button class="remove-file-btn" data-idx="${i}" title="Datei entfernen">&times;</button></td>
      </tr>
    `).join('');

    filesTbody.querySelectorAll('.remove-file-btn').forEach(btn => {
      btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.idx)));
    });
  }

  function removeFile(idx) {
    state.transactions = state.transactions.filter(t => t.fileIdx !== idx);
    // Remap remaining fileIdx values
    state.transactions.forEach(t => { if (t.fileIdx > idx) t.fileIdx--; });
    state.files.splice(idx, 1);
    // Update fileIdx references for files that shifted
    state.files.forEach((f, i) => {
      state.transactions.filter(t => t.fileIdx === i).forEach(t => { t.fileIdx = i; t.fileName = f.name; });
    });
    renderFilesTable();
    renderTxTable();
    updateSelectionInfo();
  }

  // ── Render transaction table ──
  function renderTxTable() {
    const total = state.transactions.length;
    txCountLabel.textContent = total + ' Transaktionen';

    txTbody.innerHTML = state.transactions.map((tx, i) => `
      <tr class="${tx.modified ? 'merge-tx--modified' : ''}" data-idx="${i}">
        <td><input type="checkbox" class="merge-tx-check" data-idx="${i}" ${tx.checked ? 'checked' : ''}></td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${esc(tx.fileName)}">${esc(shortName(tx.fileName))}</td>
        <td><span class="badge badge-${tx.fileType.toLowerCase()}">${esc(tx.fileType)}</span></td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${esc(tx.e2e)}">${esc(tx.e2e)}</td>
        <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis" title="${esc(tx.cdtrNm)}">${esc(tx.cdtrNm)}</td>
        <td style="font-family:monospace;font-size:0.8rem">${esc(tx.cdtrIban)}</td>
        <td class="merge-tx__amt">${tx.amt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>${esc(tx.valuta)}</td>
      </tr>
    `).join('');

    // Checkbox listeners
    txTbody.querySelectorAll('.merge-tx-check').forEach(cb => {
      cb.addEventListener('change', e => {
        e.stopPropagation();
        state.transactions[parseInt(cb.dataset.idx)].checked = cb.checked;
        updateSelectionInfo();
        updateCheckAll();
      });
    });

    // Double-click to edit
    txTbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('dblclick', () => openEditModal(parseInt(row.dataset.idx)));
    });

    updateCheckAll();
  }

  function shortName(name) {
    return name.length > 18 ? name.slice(0, 15) + '...' : name;
  }

  function updateCheckAll() {
    const all = state.transactions.length > 0 && state.transactions.every(t => t.checked);
    const some = state.transactions.some(t => t.checked);
    checkAll.checked = all;
    checkAll.indeterminate = some && !all;
  }

  function updateSelectionInfo() {
    const sel = state.transactions.filter(t => t.checked);
    const total = sel.reduce((s, t) => s + t.amt, 0);
    selectionInfo.textContent = sel.length + ' von ' + state.transactions.length + ' ausgewählt · Summe: ' +
      total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    exportBtn.disabled = sel.length === 0;
  }

  // ── Edit Modal ──
  function openEditModal(idx) {
    editingIdx = idx;
    const tx = state.transactions[idx];
    mfE2e.value = tx.e2e;
    mfValuta.value = tx.valuta;
    mfAmt.value = tx.amt;
    mfCcy.value = tx.ccy;
    mfCdtrNm.value = tx.cdtrNm;
    mfCdtrIban.value = tx.cdtrIban;
    mfCdtrBic.value = tx.cdtrBic;
    mfRmtinf.value = tx.rmtInf;
    ibanErr.textContent = '';
    mfCdtrIban.classList.remove('invalid');
    modal.showModal();
  }

  function closeModal() {
    modal.close();
    editingIdx = null;
  }

  function saveModal() {
    const iban = mfCdtrIban.value.trim().replace(/\s/g, '');
    if (iban && !validateIban(iban)) {
      ibanErr.textContent = 'Ungueltige IBAN (Pruefziffernfehler)';
      mfCdtrIban.classList.add('invalid');
      return;
    }
    ibanErr.textContent = '';
    mfCdtrIban.classList.remove('invalid');

    const tx = state.transactions[editingIdx];
    const changed = (
      tx.e2e !== mfE2e.value || tx.valuta !== mfValuta.value ||
      tx.amt !== parseFloat(mfAmt.value) || tx.ccy !== mfCcy.value.toUpperCase() ||
      tx.cdtrNm !== mfCdtrNm.value || tx.cdtrIban !== iban ||
      tx.cdtrBic !== mfCdtrBic.value || tx.rmtInf !== mfRmtinf.value
    );
    tx.e2e = mfE2e.value;
    tx.valuta = mfValuta.value;
    tx.amt = parseFloat(mfAmt.value) || 0;
    tx.ccy = (mfCcy.value || 'EUR').toUpperCase();
    tx.cdtrNm = mfCdtrNm.value;
    tx.cdtrIban = iban;
    tx.cdtrBic = mfCdtrBic.value;
    tx.rmtInf = mfRmtinf.value;
    if (changed) tx.modified = true;

    closeModal();
    renderTxTable();
    updateSelectionInfo();
    if (changed) toast('Transaktion gespeichert', 'ok');
  }

  // ── Export ──
  async function exportMergedFile() {
    const active = state.transactions.filter(t => t.checked);
    if (active.length === 0) return;

    // Pre-validate
    const invalid = active.filter(t => !t.cdtrNm || !t.cdtrIban || !validateIban(t.cdtrIban) || !t.amt || t.amt <= 0);
    if (invalid.length > 0) {
      toast(invalid.length + ' Transaktion(en) haben ungueltige Pflichtfelder (Name, IBAN, Betrag). Bitte pruefen.', 'err');
      resultEl.innerHTML = statusBox(false, 'Validierungsfehler',
        'Folgende Transaktionen künnen nicht exportiert werden:<br>' +
        invalid.map(t => `<code>${esc(t.e2e || t.id)}</code> – ${esc(t.cdtrNm || '(kein Name)')} – IBAN: ${esc(t.cdtrIban || '(leer)')}`).join('<br>'));
      return;
    }

    exportBtn.disabled = true;
    resultEl.innerHTML = '<span class="loader">Verarbeite Transaktionen...</span>';

    try {
      const payload = {
        transactions: active.map(t => ({
          e2e: t.e2e,
          valuta: t.valuta,
          amt: t.amt,
          ccy: t.ccy,
          cdtrNm: t.cdtrNm,
          cdtrIban: t.cdtrIban,
          cdtrBic: t.cdtrBic,
          rmtInf: t.rmtInf,
        }))
      };

      const resp = await fetch('/api/merge/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
      }

      const blob = await resp.blob();
      const now = new Date();
      const stamp = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      const cdHeader = resp.headers.get('Content-Disposition');
      const filename = cdHeader?.match(/filename="([^"]+)"/)?.[1] || ('CCT_zusammengefasst_' + stamp + '.xml');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast(filename + ' heruntergeladen', 'ok');
      resultEl.innerHTML = statusBox(true, 'Export erfolgreich',
        `<strong>${esc(filename)}</strong> mit ${active.length} Transaktion(en) exportiert.`);
    } catch(e) {
      toast('Export fehlgeschlagen: ' + e.message, 'err');
      resultEl.innerHTML = statusBox(false, 'Fehler', esc(e.message));
    } finally {
      exportBtn.disabled = false;
      updateSelectionInfo();
    }
  }

  // ── Init ──
  function init() {
    uploadArea   = document.getElementById('merge-upload-area');
    fileInput    = document.getElementById('merge-file-input');
    filesSection = document.getElementById('merge-files-section');
    filesTbody   = document.getElementById('merge-files-tbody');
    txSection    = document.getElementById('merge-tx-section');
    txTbody      = document.getElementById('merge-tx-tbody');
    checkAll     = document.getElementById('merge-check-all');
    txCountLabel = document.getElementById('merge-tx-count-label');
    selectionInfo= document.getElementById('merge-selection-info');
    exportBtn    = document.getElementById('merge-export-btn');
    selectAllBtn = document.getElementById('merge-select-all-btn');
    selectNoneBtn= document.getElementById('merge-select-none-btn');
    clearBtn     = document.getElementById('merge-clear-btn');
    modal        = document.getElementById('merge-edit-modal');
    mfE2e        = document.getElementById('mf-e2e');
    mfValuta     = document.getElementById('mf-valuta');
    mfAmt        = document.getElementById('mf-amt');
    mfCcy        = document.getElementById('mf-ccy');
    mfCdtrNm     = document.getElementById('mf-cdtr-nm');
    mfCdtrIban   = document.getElementById('mf-cdtr-iban');
    mfCdtrBic    = document.getElementById('mf-cdtr-bic');
    mfRmtinf     = document.getElementById('mf-rmtinf');
    ibanErr      = document.getElementById('mf-iban-err');
    modalSave    = document.getElementById('merge-modal-save');
    modalCancel  = document.getElementById('merge-modal-cancel');
    modalClose   = document.getElementById('merge-modal-close');
    resultEl     = document.getElementById('merge-result');

    if (!uploadArea) return;

    // Upload zone
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

    // Toolbar buttons
    clearBtn.addEventListener('click', () => {
      state.files = []; state.transactions = [];
      renderFilesTable(); renderTxTable(); updateSelectionInfo();
    });

    selectAllBtn.addEventListener('click', () => {
      state.transactions.forEach(t => t.checked = true);
      renderTxTable(); updateSelectionInfo();
    });

    selectNoneBtn.addEventListener('click', () => {
      state.transactions.forEach(t => t.checked = false);
      renderTxTable(); updateSelectionInfo();
    });

    checkAll.addEventListener('change', () => {
      state.transactions.forEach(t => t.checked = checkAll.checked);
      renderTxTable(); updateSelectionInfo();
    });

    exportBtn.addEventListener('click', exportMergedFile);

    // Modal
    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', saveModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // IBAN real-time validation
    mfCdtrIban.addEventListener('input', () => {
      const v = mfCdtrIban.value.trim();
      if (v.length >= 15) {
        const ok = validateIban(v);
        mfCdtrIban.classList.toggle('invalid', !ok);
        ibanErr.textContent = ok ? '' : 'Ungueltige IBAN';
      } else {
        mfCdtrIban.classList.remove('invalid');
        ibanErr.textContent = '';
      }
    });

    renderFilesTable();
    renderTxTable();
    updateSelectionInfo();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
