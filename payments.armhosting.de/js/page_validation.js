/* page_validation.js - Validierung + Inline-Bearbeitung */
(function() {
  'use strict';

  let currentFile = null;
  let currentXmlText = null;   // raw XML text for apply-edits
  let editedFields  = {};      // { xmlPath: newValue }
  let originalFieldValues = {}; // { xmlPath: originalValue }
  let currentMeta   = null;    // { version, ruleset, ... }

  function init() {
    initUploadZone('validate-upload-area', 'validate-file-input', function(file, zone) {
      currentFile = file;
      setZoneFile(zone, file);
      runValidation(file);
    });

    // Inline-edit: dblclick on any .f-value.editable (event delegation)
    document.getElementById('validate-result').addEventListener('dblclick', onValueDblClick);
    // Download button click (injected into result HTML)
    document.getElementById('validate-result').addEventListener('click', function(e) {
      if (e.target.id === 'validate-modified-download-btn') downloadModified();
    });
  }

  async function runValidation(file) {
    // Read text for potential editing (non-blocking)
    currentXmlText = null;
    editedFields   = {};
    originalFieldValues = {};
    currentMeta    = null;
    file.text().then(t => { currentXmlText = t; }).catch(() => {});

    setLoading('validate-result', 'Datei wird validiert...');
    try {
      const result = await uploadFile('/api/validate', file);
      renderResult(result, file.name);
    } catch(e) {
      document.getElementById('validate-result').innerHTML =
        statusBox(false, 'Fehler', esc(e.message));
    }
  }

  function renderResult(r, filename) {
    const el = document.getElementById('validate-result');
    if (!r) { el.innerHTML = statusBox(false, 'Keine Antwort erhalten'); return; }

    currentMeta = r.meta || null;

    const format  = r.format || '?';
    const version = r.meta?.version || '';
    const ruleset = r.meta?.ruleset || '';
    const errCnt  = (r.errors || []).length;
    const warnCnt = (r.warnings || []).length;

    let html = '';
    html += statusBox(r.ok,
      r.ok ? `Gueltig — ${format} ${version}` : `Ungueltig — ${errCnt} Fehler, ${warnCnt} Warnungen`,
      `Datei: <strong>${esc(filename)}</strong>${ruleset ? ' | Regelwerk: <strong>'+esc(ruleset)+'</strong>' : ''}`
    );

    if (version) html += `<p><span class="meta-badge">Format: ${esc(format)}</span><span class="meta-badge">${esc(version)}</span>${ruleset?`<span class="meta-badge">${esc(ruleset)}</span>`:''}</p>`;

    const issues   = r.issues || [];
    const completionCandidates = findCompletionCandidates(issues, version);
    const errors   = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warn');
    const infos    = issues.filter(i => i.severity === 'info');

    if (errors.length)   html += collapseSection(`Fehler (${errors.length})`,     renderIssues(errors),   true);
    if (warnings.length) html += collapseSection(`Warnungen (${warnings.length})`, renderIssues(warnings), errors.length === 0);
    if (infos.length)    html += collapseSection(`Hinweise (${infos.length})`,     renderIssues(infos),    false);

    if (r.fieldTree || r.parsed) {
      html += buildContentTree(r, issues);
    }

    if (format === 'DTAZV') {
      html += `<p>Auftragsart: <strong>${esc(r.orderType||'')}</strong> | Transaktionen: <strong>${r.txCount||0}</strong></p>`;
      if (r.aRec) {
        const a = r.aRec;
        html += collapseSection('A-Record (Header)', `
          <div class="field-row"><span class="f-path">BLZ</span><span class="f-value">${esc(a.blz)}</span></div>
          <div class="field-row"><span class="f-path">Konto-Nr</span><span class="f-value">${esc(a.kontoNr)}</span></div>
          <div class="field-row"><span class="f-path">Datum</span><span class="f-value">${esc(a.datum)}</span></div>
          <div class="field-row"><span class="f-path">Auftragsart</span><span class="f-value">${esc(a.auftragsart)}</span></div>
          <div class="field-row"><span class="f-path">Währung</span><span class="f-value">${esc(a.waehrung)}</span></div>
        `, true);
      }
    }

    // Inline-edit download bar (only for PAIN formats that have editable tree)
    const isPain = format === 'PAIN' && (version.startsWith('pain.001') || version.startsWith('pain.008'));
    if (isPain) {
      html += `<div class="validate-edit-bar" id="validate-edit-bar" style="display:none">
        <button id="validate-modified-download-btn" class="btn-primary">
          &#8595; Geänderte Zahlung herunterladen
        </button>
        <span class="edit-count" id="validate-edit-count"></span>
        <span style="font-size:0.8rem;color:var(--tx2)">Tipp: Doppelklick auf einen Wert im Inhaltsbaum zum Bearbeiten</span>
      </div>`;

      if (completionCandidates.length) {
        html += buildCompletionModalHtml(completionCandidates, version);
      }

      html += '<div id="validate-download-feedback"></div>';
    }

    el.innerHTML = html;
    updateEditBar();
    if (completionCandidates.length) {
      setTimeout(() => openCompletionModal(completionCandidates, version), 0);
    }
  }

  function onValueDblClick(e) {
    const span = e.target.closest('.f-value.editable');
    if (!span || span.querySelector('input')) return; // already in edit mode

    const path     = span.getAttribute('data-xmlpath');
    if (!path) return;

    const preText = span.textContent;
    span.setAttribute('data-pre-edit', preText);

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'f-edit-input';
    input.value     = (editedFields[path] !== undefined ? editedFields[path] : preText === '—' ? '' : preText);

    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      const newVal = input.value; // keep whitespace as-is
      const origVal = originalFieldValues[path] !== undefined ? originalFieldValues[path] : (preText === '—' ? '' : preText);

      if (newVal === origVal) {
        delete editedFields[path];
        span.classList.remove('f-edited');
      } else {
        editedFields[path] = newVal;
        span.classList.add('f-edited');
      }

      span.textContent = newVal || '—';
      updateEditBar();
    }

    function cancel() {
      if (committed) return;
      committed = true;
      span.textContent = preText;
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
    });
  }

  function updateEditBar() {
    const count = Object.keys(editedFields).length;
    const bar   = document.getElementById('validate-edit-bar');
    const btn   = document.getElementById('validate-modified-download-btn');
    const label = document.getElementById('validate-edit-count');
    if (!bar || !btn) return;
    bar.style.display  = count > 0 ? 'flex' : 'none';
    btn.disabled       = count === 0 || !currentXmlText;
    if (label) label.textContent = count === 1 ? '1 Feld geändert' : `${count} Felder geändert`;
  }

  async function downloadModified() {
    const edits = Object.entries(editedFields).map(([path, value]) => ({ path, value }));
    if (!edits.length || !currentXmlText) return;

    const btn = document.getElementById('validate-modified-download-btn');
    const feedbackEl = document.getElementById('validate-download-feedback');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Wird erstellt…'; }
    if (feedbackEl) feedbackEl.innerHTML = '';

    try {
      const resp = await fetch('/api/validate/apply-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: currentXmlText, edits }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));

        if (feedbackEl) {
          const issueHtml = Array.isArray(err.issues) ? renderIssues(err.issues) : '';
          feedbackEl.innerHTML = statusBox(false, 'Änderungen konnten nicht gespeichert werden', esc(err.error || resp.statusText)) + issueHtml;
        }

        if (Array.isArray(err.missingFields) && err.missingFields.length) {
          openCompletionModal(err.missingFields, currentMeta?.version || '');
        }

        // Mark currently visible rows with issues after failed save.
        if (Array.isArray(err.issues)) {
          markRowsWithIssues(err.issues);
        }
        return;
      }
      const blob = await resp.blob();
      const cd   = resp.headers.get('content-disposition') || '';
      const m    = cd.match(/filename="([^"]+)"/);
      const fname = m ? m[1] : (currentMeta?.version || 'zahlung').replace(/\./g,'_') + '_edited.xml';
      triggerDownload(blob, fname, 'application/xml');
      if (feedbackEl) {
        feedbackEl.innerHTML = statusBox(true, 'Datei erfolgreich validiert und erstellt', 'Die Änderungen wurden übernommen und die XML-Datei kann sicher heruntergeladen werden.');
      }
    } catch(e) {
      if (feedbackEl) {
        feedbackEl.innerHTML = statusBox(false, 'Fehler beim Herunterladen', esc(e.message));
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  function buildContentTree(r, issues) {
    if (!r.meta) return '';
    const errMap = {};
    issues.forEach(i => { errMap[i.fieldPath || i.field] = i; });

    let html = '<h2>Inhalt</h2>';
    const raw = r.fieldTree?.raw || r.parsed?.raw;
    if (!raw) return html + '<p>Kein Inhalt zum Anzeigen.</p>';

    const ver = r.meta.version || '';
    if (ver.startsWith('pain.001')) html += renderPain001Tree(raw, errMap);
    else if (ver.startsWith('pain.008')) html += renderPain008Tree(raw, errMap);
    else if (ver.startsWith('pain.002')) html += '<p>Status-Report-Inhalt (keine Feldanzeige implementiert)</p>';
    return html;
  }

  function fRow(path, label, value, errMap, xmlpath) {
    const issue = errMap[path];
    const cls   = issue ? (issue.severity === 'error' ? 'has-error' : 'has-warn') : '';
    const badge = issue
      ? `<span class="f-badge ${issue.severity}">${issue.severity === 'error' ? 'FEHLER' : 'WARNUNG'}</span>`
      : `<span class="f-badge ok">OK</span>`;
    const hint = issue ? `<div class="issue-hint">&rarr; ${esc(issue.message)}${issue.expected?' — Erwartet: <em>'+esc(issue.expected)+'</em>':''}</div>` : '';

    const key = xmlpath || path;
    const rawVal = value || '';
    if (xmlpath && originalFieldValues[key] === undefined) originalFieldValues[key] = rawVal;

    const hasEdit = editedFields[key] !== undefined;
    const displayVal = hasEdit ? editedFields[key] : (rawVal || '—');
    const editedCls = hasEdit ? ' f-edited' : '';
    const editable  = xmlpath ? ` class="f-value editable${editedCls}" data-xmlpath="${esc(key)}" title="Doppelklick zum Bearbeiten"` : ` class="f-value"`;

    return `<div class="field-row ${cls}">
      <span class="f-path">${esc(label||path)}</span>
      <span${editable}>${esc(displayVal)}</span>
      ${badge}
      ${hint}
    </div>`;
  }

  function _v(obj, ...keys) {
    let cur = obj;
    for (const k of keys) { if (!cur) return ''; cur = Array.isArray(cur[k]) ? cur[k][0] : cur[k]; }
    if (cur && typeof cur === 'object' && '_' in cur) return cur._;
    return cur || '';
  }

  function renderPain001Tree(raw, errMap) {
    const doc  = raw['Document'];
    const init = _v(doc,'CstmrCdtTrfInitn') || {};
    const gh   = _v(init,'GrpHdr') || {};
    let html   = '';
    const ghFields = [
      ['GrpHdr.MsgId',       'Message ID',           _v(gh,'MsgId'),            'GrpHdr.MsgId'],
      ['GrpHdr.CreDtTm',     'Erstellungszeitpunkt', _v(gh,'CreDtTm'),          'GrpHdr.CreDtTm'],
      ['GrpHdr.NbOfTxs',     'Anzahl Transaktionen', _v(gh,'NbOfTxs'),          'GrpHdr.NbOfTxs'],
      ['GrpHdr.CtrlSum',     'Kontrollsumme',        _v(gh,'CtrlSum'),          'GrpHdr.CtrlSum'],
      ['GrpHdr.InitgPty.Nm', 'Auftraggeber Name',    _v(gh,'InitgPty','Nm'),    'GrpHdr.InitgPty.Nm'],
    ];
    html += collapseSection('Group Header', ghFields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join(''), true);

    const pmtInfArr = (init['PmtInf'] || []);
    const isV09 = (currentMeta?.version || '').endsWith('.09');
    pmtInfArr.forEach((pi, idx) => {
      const base    = `PmtInf[${idx}]`;
      const dbtr    = _v(pi,'Dbtr') || {};
      const dbtrAdr = _v(dbtr,'PstlAdr') || {};
      const dbtrBicPath = `${base}.DbtrAgt.FinInstnId.${isV09 ? 'BICFI' : 'BIC'}`;
      const dbtrBicVal = _v(pi,'DbtrAgt','FinInstnId', isV09 ? 'BICFI' : 'BIC') || _v(pi,'DbtrAgt','FinInstnId', isV09 ? 'BIC' : 'BICFI');
      const fields  = [
        [`${base}.PmtInfId`,           'PmtInf ID',          _v(pi,'PmtInfId'),                       `${base}.PmtInfId`],
        [`${base}.PmtMtd`,             'Zahlungsmethode',    _v(pi,'PmtMtd'),                         `${base}.PmtMtd`],
        [`${base}.PmtTpInf.SvcLvl.Cd`,'Service Level',      _v(pi,'PmtTpInf','SvcLvl','Cd'),         `${base}.PmtTpInf.SvcLvl.Cd`],
        [`${base}.Dbtr.Nm`,            'Schuldner Name',     _v(dbtr,'Nm'),                           `${base}.Dbtr.Nm`],
        [`${base}.Dbtr.PstlAdr.Ctry`,  'Schuldner Land',     _v(dbtrAdr,'Ctry'),                      `${base}.Dbtr.PstlAdr.Ctry`],
        [isV09 ? `${base}.Dbtr.PstlAdr.TwnNm` : `${base}.Dbtr.PstlAdr.AdrLine`, 'Schuldner Ort/Adresse', isV09 ? _v(dbtrAdr,'TwnNm') : _v(dbtrAdr,'AdrLine'), isV09 ? `${base}.Dbtr.PstlAdr.TwnNm` : `${base}.Dbtr.PstlAdr.AdrLine`],
        [`${base}.DbtrAcct.Id.IBAN`,   'Schuldner IBAN',     _v(pi,'DbtrAcct','Id','IBAN'),           `${base}.DbtrAcct.Id.IBAN`],
        [dbtrBicPath, 'Schuldner BIC', dbtrBicVal, dbtrBicPath],
      ];
      const txArr  = pi['CdtTrfTxInf'] || [];
      const txHtml = txArr.map((tx, ti) => {
        const txBase  = `${base}.CdtTrfTxInf[${ti}]`;
        const cdtr    = _v(tx,'Cdtr') || {};
        const cdtrAdr = _v(cdtr,'PstlAdr') || {};
        const cdtrBicPath = `${txBase}.CdtrAgt.FinInstnId.${isV09 ? 'BICFI' : 'BIC'}`;
        const cdtrBicVal = _v(tx,'CdtrAgt','FinInstnId', isV09 ? 'BICFI' : 'BIC') || _v(tx,'CdtrAgt','FinInstnId', isV09 ? 'BIC' : 'BICFI');
        const amtObj  = tx['Amt'] && tx['Amt'][0] && tx['Amt'][0]['InstdAmt'] ? tx['Amt'][0]['InstdAmt'][0] : {};
        const amtVal  = amtObj._ || '';
        const amtCcy  = (amtObj.$ && amtObj.$.Ccy) || '';
        const txFields = [
          [`${txBase}.PmtId.EndToEndId`,        'End-to-End ID',    _v(tx,'PmtId','EndToEndId'),           `${txBase}.PmtId.EndToEndId`],
          [`${txBase}.Amt.InstdAmt`,             `Betrag ${amtCcy}`, amtVal,                                `${txBase}.Amt.InstdAmt`],
          [`${txBase}.Cdtr.Nm`,                 'Empfänger Name',  _v(cdtr,'Nm'),                         `${txBase}.Cdtr.Nm`],
          [`${txBase}.Cdtr.PstlAdr.Ctry`,       'Empf. Land',       _v(cdtrAdr,'Ctry'),                    `${txBase}.Cdtr.PstlAdr.Ctry`],
          [isV09 ? `${txBase}.Cdtr.PstlAdr.TwnNm` : `${txBase}.Cdtr.PstlAdr.AdrLine`, 'Empf. Ort/Adresse', isV09 ? _v(cdtrAdr,'TwnNm') : _v(cdtrAdr,'AdrLine'), isV09 ? `${txBase}.Cdtr.PstlAdr.TwnNm` : `${txBase}.Cdtr.PstlAdr.AdrLine`],
          [`${txBase}.CdtrAcct.Id.IBAN`,        'Empfänger IBAN',  _v(tx,'CdtrAcct','Id','IBAN'),         `${txBase}.CdtrAcct.Id.IBAN`],
          [cdtrBicPath, 'Empfänger BIC', cdtrBicVal, cdtrBicPath],
          [`${txBase}.RmtInf.Ustrd`,            'Verwendungszweck', _v(tx,'RmtInf','Ustrd'),               `${txBase}.RmtInf.Ustrd`],
        ];
        return collapseSection(`Transaktion ${ti+1}`, txFields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join(''), ti===0);
      }).join('');
      html += collapseSection(`Payment Info ${idx+1}`, fields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join('') + txHtml, true);
    });
    return html;
  }

  // Parst eine einzeilige deutsche Adresse in strukturierte Felder.
  // Beispiel: "Marienstraße 29, 48477 Hörstel"
  function parseGermanAddress(raw) {
    const str = (raw || '').trim();
    let strtNm = '', bldgNb = '', pstCd = '', twnNm = '';
    const plzMatch = str.match(/\b(\d{5})\s+(.+)$/);
    if (plzMatch) {
      pstCd  = plzMatch[1];
      twnNm  = plzMatch[2].replace(/,\s*$/, '').trim();
    }
    const streetPart = plzMatch
      ? str.slice(0, str.indexOf(plzMatch[0])).replace(/,\s*$/, '').trim()
      : str;
    const houseMatch = streetPart.match(/^(.+?)\s+(\d{1,4}[a-zA-Z]?)$/);
    if (houseMatch) {
      strtNm = houseMatch[1].trim();
      bldgNb = houseMatch[2].trim();
    } else {
      strtNm = streetPart;
    }
    return { strtNm, bldgNb, pstCd, twnNm };
  }

  function findCompletionCandidates(issues, version) {
    if (!Array.isArray(issues) || !version.startsWith('pain.001')) return [];
    const candidates = [];
    const seen = new Set();

    issues.forEach(i => {
      if (!i || i.severity !== 'error' || !i.fieldPath) return;

      // AdrLine → in strukturierte Felder aufsplitten und vorausfüllen
      if (/\.AdrLine$/.test(i.fieldPath)) {
        const base   = i.fieldPath.replace(/\.AdrLine$/, '');
        const parsed = parseGermanAddress(i.value || '');
        [
          { path: `${base}.StrtNm`, message: 'Straßenname',        suggestedValue: parsed.strtNm },
          { path: `${base}.BldgNb`, message: 'Hausnummer',          suggestedValue: parsed.bldgNb },
          { path: `${base}.PstCd`,  message: 'Postleitzahl (5-stellig)', suggestedValue: parsed.pstCd },
          { path: `${base}.TwnNm`,  message: 'Stadt',               suggestedValue: parsed.twnNm },
          { path: `${base}.Ctry`,   message: 'Ländercode',          suggestedValue: 'DE' },
        ].forEach(f => { if (!seen.has(f.path)) { seen.add(f.path); candidates.push(f); } });
        return;
      }

      // Standard-Pflichtfelder (fehlt/Pflicht)
      if (/fehlt|Pflicht/i.test(i.message || '') && /\.TwnNm$|\.BICFI$|\.BIC$|\.Ctry$|\.StrtNm$|\.PstCd$/.test(i.fieldPath)) {
        if (!seen.has(i.fieldPath)) {
          seen.add(i.fieldPath);
          candidates.push({ path: i.fieldPath, message: i.message || '' });
        }
      }
    });

    return candidates;
  }

  function buildCompletionModalHtml(missingFields, version) {
    const hasAddressFields = missingFields.some(f => /\.StrtNm$|\.TwnNm$|\.PstCd$/.test(f.path));
    const addrHint = hasAddressFields
      ? `<div class="validate-modal__addr-hint">
           ℹ️ Adressdaten wurden aus dem ursprünglichen <code>AdrLine</code>-Feld vorausgefüllt.
           Bitte prüfen und ggf. korrigieren, bevor die Datei erstellt wird.
         </div>`
      : '';
    const rows = missingFields.map((f, i) => {
      const placeholder = /BIC/.test(f.path) ? 'z.B. MARKDEF1100'
        : /Ctry/.test(f.path) ? 'z.B. DE'
        : /PstCd/.test(f.path) ? 'z.B. 48477'
        : /BldgNb/.test(f.path) ? 'z.B. 29'
        : 'Fehlenden Wert eintragen';
      const prefill = f.suggestedValue || '';
      return `<label class="validate-modal__field" for="missing-field-${i}">
        <span>${esc(f.path)}</span>
        <input id="missing-field-${i}" data-path="${esc(f.path)}" type="text"
               value="${esc(prefill)}" placeholder="${esc(placeholder)}" />
        <small>${esc(f.message || '')}</small>
      </label>`;
    }).join('');

    return `<dialog id="validate-missing-modal" class="validate-modal" aria-label="Fehlende Pflichtfelder ergänzen">
      <div class="validate-modal__header">
        <div class="validate-modal__title-wrap">
          <svg class="validate-modal__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2L2 7v6c0 5.5 3.8 8.7 10 9 6.2-.3 10-3.5 10-9V7l-10-5z"></path><path d="M8 12l2.5 2.5L16 9"></path>
          </svg>
          <div>
            <h3>Fehlende Angaben ergänzen</h3>
            <p>Version: <strong>${esc(version)}</strong> - Datei bleibt im gewählten Format.</p>
          </div>
        </div>
        <button type="button" id="validate-missing-modal-close" class="validate-modal__close" aria-label="Schließen">×</button>
      </div>
      <div class="validate-modal__body">${addrHint}${rows}</div>
      <div id="validate-missing-modal-error"></div>
      <div class="validate-modal__footer">
        <button type="button" id="validate-missing-modal-cancel">Abbrechen</button>
        <button type="button" id="validate-missing-modal-apply" class="btn-primary">Werte übernehmen</button>
      </div>
    </dialog>
    <button type="button" id="validate-open-missing-modal" class="btn-primary" style="margin-top:0.75rem">
      Fehlende Pflichtfelder ergänzen
    </button>`;
  }

  function openCompletionModal(missingFields, version) {
    const resultEl = document.getElementById('validate-result');
    let dlg = document.getElementById('validate-missing-modal');
    if (!dlg && Array.isArray(missingFields) && missingFields.length) {
      resultEl.insertAdjacentHTML('beforeend', buildCompletionModalHtml(missingFields, version));
      dlg = document.getElementById('validate-missing-modal');
    }
    if (!dlg) return;

    const openBtn = document.getElementById('validate-open-missing-modal');
    const closeBtn = document.getElementById('validate-missing-modal-close');
    const cancelBtn = document.getElementById('validate-missing-modal-cancel');
    const applyBtn = document.getElementById('validate-missing-modal-apply');
    const errEl = document.getElementById('validate-missing-modal-error');

    function close() { if (dlg.open) dlg.close(); }

    if (openBtn && !openBtn.dataset.bound) { openBtn.dataset.bound = '1'; openBtn.addEventListener('click', () => dlg.showModal()); }
    if (closeBtn && !closeBtn.dataset.bound) { closeBtn.dataset.bound = '1'; closeBtn.addEventListener('click', close); }
    if (cancelBtn && !cancelBtn.dataset.bound) { cancelBtn.dataset.bound = '1'; cancelBtn.addEventListener('click', close); }
    if (applyBtn && !applyBtn.dataset.bound) {
      applyBtn.dataset.bound = '1';
      applyBtn.addEventListener('click', function() {
        const inputs = Array.from(dlg.querySelectorAll('input[data-path]'));
        // BldgNb ist optional (Hausnummer kann im Straßennamen stehen)
        const OPTIONAL_FIELDS = /\.BldgNb$/;
        let hasError = false;
        if (errEl) errEl.innerHTML = '';
        inputs.forEach(input => {
          const val = input.value.trim();
          const path = input.getAttribute('data-path');
          input.classList.remove('invalid');
          if (!val && !OPTIONAL_FIELDS.test(path)) {
            hasError = true;
            input.classList.add('invalid');
            return;
          }
          if (val) {
            editedFields[path] = val;
            const target = document.querySelector(`.f-value.editable[data-xmlpath="${CSS.escape(path)}"]`);
            if (target) {
              target.textContent = val;
              target.classList.add('f-edited');
            }
          }
        });
        if (hasError) {
          if (errEl) errEl.innerHTML = statusBox(false, 'Bitte Pflichtfelder ausfüllen', 'Leere Felder wurden markiert.');
          return;
        }
        updateEditBar();
        close();
      });
    }

    if (!dlg.open) dlg.showModal();
  }

  function markRowsWithIssues(issues) {
    issues.forEach(i => {
      if (!i || !i.fieldPath) return;
      const row = document.querySelector(`.f-value[data-xmlpath="${CSS.escape(i.fieldPath)}"]`)?.closest('.field-row');
      if (row) row.classList.add(i.severity === 'warn' ? 'has-warn' : 'has-error');
    });
  }

  function renderPain008Tree(raw, errMap) {
    const doc  = raw['Document'];
    const init = _v(doc,'CstmrDrctDbtInitn') || {};
    const gh   = _v(init,'GrpHdr') || {};
    let html   = '';
    const ghFields = [
      ['GrpHdr.MsgId',       'Message ID',           _v(gh,'MsgId'),         'GrpHdr.MsgId'],
      ['GrpHdr.CreDtTm',     'Erstellungszeitpunkt', _v(gh,'CreDtTm'),       'GrpHdr.CreDtTm'],
      ['GrpHdr.NbOfTxs',     'Anzahl Transaktionen', _v(gh,'NbOfTxs'),       'GrpHdr.NbOfTxs'],
      ['GrpHdr.CtrlSum',     'Kontrollsumme',        _v(gh,'CtrlSum'),       'GrpHdr.CtrlSum'],
      ['GrpHdr.InitgPty.Nm', 'Auftraggeber Name',    _v(gh,'InitgPty','Nm'), 'GrpHdr.InitgPty.Nm'],
    ];
    html += collapseSection('Group Header', ghFields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join(''), true);
    const pmtInfArr = init['PmtInf'] || [];
    pmtInfArr.forEach((pi, idx) => {
      const base = `PmtInf[${idx}]`;
      const cdtr = _v(pi,'Cdtr') || {};
      const fields = [
        [`${base}.PmtInfId`,               'PmtInf ID',         _v(pi,'PmtInfId'),                      `${base}.PmtInfId`],
        [`${base}.PmtMtd`,                 'Zahlungsmethode',   _v(pi,'PmtMtd'),                        `${base}.PmtMtd`],
        [`${base}.PmtTpInf.LclInstrm.Cd`, 'Lastschrifttyp',    _v(pi,'PmtTpInf','LclInstrm','Cd'),     `${base}.PmtTpInf.LclInstrm.Cd`],
        [`${base}.PmtTpInf.SeqTp`,        'Sequenztyp',        _v(pi,'PmtTpInf','SeqTp'),              `${base}.PmtTpInf.SeqTp`],
        [`${base}.Cdtr.Nm`,               'Gläubiger Name',   _v(cdtr,'Nm'),                          `${base}.Cdtr.Nm`],
        [`${base}.CdtrAcct.Id.IBAN`,      'Gläubiger IBAN',   _v(pi,'CdtrAcct','Id','IBAN'),          `${base}.CdtrAcct.Id.IBAN`],
        [`${base}.CdtrAgt.FinInstnId.BICFI`,'Gläubiger BIC',  _v(pi,'CdtrAgt','FinInstnId','BICFI'),  `${base}.CdtrAgt.FinInstnId.BICFI`],
      ];
      const txArr  = pi['DrctDbtTxInf'] || [];
      const txHtml = txArr.map((tx,ti) => {
        const txBase = `${base}.DrctDbtTxInf[${ti}]`;
        const dbtr   = _v(tx,'Dbtr') || {};
        const mndt   = _v(tx,'DrctDbtTx','MndtRltdInf') || {};
        const txFields = [
          [`${txBase}.PmtId.EndToEndId`,                 'End-to-End ID',      _v(tx,'PmtId','EndToEndId'),    `${txBase}.PmtId.EndToEndId`],
          [`${txBase}.InstdAmt`,                         'Betrag',              _v(tx,'InstdAmt'),              `${txBase}.InstdAmt`],
          [`${txBase}.DrctDbtTx.MndtRltdInf.MndtId`,   'Mandatsreferenz',     _v(mndt,'MndtId'),              `${txBase}.DrctDbtTx.MndtRltdInf.MndtId`],
          [`${txBase}.DrctDbtTx.MndtRltdInf.DtOfSgntr`,'Mandatsdatum',        _v(mndt,'DtOfSgntr'),           `${txBase}.DrctDbtTx.MndtRltdInf.DtOfSgntr`],
          [`${txBase}.Dbtr.Nm`,                         'Schuldner Name',      _v(dbtr,'Nm'),                  `${txBase}.Dbtr.Nm`],
          [`${txBase}.DbtrAcct.Id.IBAN`,                'Schuldner IBAN',      _v(tx,'DbtrAcct','Id','IBAN'),  `${txBase}.DbtrAcct.Id.IBAN`],
          [`${txBase}.DbtrAgt.FinInstnId.BICFI`,        'Schuldner BIC',       _v(tx,'DbtrAgt','FinInstnId','BICFI'), `${txBase}.DbtrAgt.FinInstnId.BICFI`],
          [`${txBase}.RmtInf.Ustrd`,                    'Verwendungszweck',    _v(tx,'RmtInf','Ustrd'),        `${txBase}.RmtInf.Ustrd`],
        ];
        return collapseSection(`Transaktion ${ti+1}`, txFields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join(''), ti===0);
      }).join('');
      html += collapseSection(`Payment Info ${idx+1}`, fields.map(([p,l,v,x]) => fRow(p,l,v,errMap,x)).join('') + txHtml, true);
    });
    return html;
  }

  document.addEventListener('DOMContentLoaded', function() {
    init();
    document.getElementById('validate-result').addEventListener('click', function(e) {
      if (e.target.id === 'validate-open-missing-modal') {
        openCompletionModal([], currentMeta?.version || '');
      }
    });
  });
})();
