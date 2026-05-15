/* page_validation.js - Validierung */
(function() {
  'use strict';

  let currentFile = null;

  function init() {
    initUploadZone('validate-upload-area', 'validate-file-input', function(file, zone) {
      currentFile = file;
      setZoneFile(zone, file);
      runValidation(file);
    });
  }

  async function runValidation(file) {
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

    const format  = r.format || '?';
    const version = r.meta?.version || '';
    const ruleset = r.meta?.ruleset || '';
    const errCnt  = (r.errors || []).length;
    const warnCnt = (r.warnings || []).length;

    let html = '';
    // Main status
    html += statusBox(r.ok,
      r.ok ? `Gueltig — ${format} ${version}` : `Ungueltig — ${errCnt} Fehler, ${warnCnt} Warnungen`,
      `Datei: <strong>${esc(filename)}</strong>${ruleset ? ' | Regelwerk: <strong>'+esc(ruleset)+'</strong>' : ''}`
    );

    // Meta badges
    if (version) html += `<p><span class="meta-badge">Format: ${esc(format)}</span><span class="meta-badge">${esc(version)}</span>${ruleset?`<span class="meta-badge">${esc(ruleset)}</span>`:''}</p>`;

    // Issue sections
    const issues = r.issues || [];
    const errors   = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warn');
    const infos    = issues.filter(i => i.severity === 'info');

    if (errors.length) {
      html += collapseSection(`Fehler (${errors.length})`, renderIssues(errors), true);
    }
    if (warnings.length) {
      html += collapseSection(`Warnungen (${warnings.length})`, renderIssues(warnings), errors.length === 0);
    }
    if (infos.length) {
      html += collapseSection(`Hinweise (${infos.length})`, renderIssues(infos), false);
    }

    // Content detail tree
    if (r.fieldTree || r.parsed) {
      html += buildContentTree(r, issues);
    }

    // DTAZV specific
    if (format === 'DTAZV') {
      html += `<p>Auftragsart: <strong>${esc(r.orderType||'')}</strong> | Transaktionen: <strong>${r.txCount||0}</strong></p>`;
      if (r.aRec) {
        const a = r.aRec;
        html += collapseSection('A-Record (Header)', `
          <div class="field-row"><span class="f-path">BLZ</span><span class="f-value">${esc(a.blz)}</span></div>
          <div class="field-row"><span class="f-path">Konto-Nr</span><span class="f-value">${esc(a.kontoNr)}</span></div>
          <div class="field-row"><span class="f-path">Datum</span><span class="f-value">${esc(a.datum)}</span></div>
          <div class="field-row"><span class="f-path">Auftragsart</span><span class="f-value">${esc(a.auftragsart)}</span></div>
          <div class="field-row"><span class="f-path">Waehrung</span><span class="f-value">${esc(a.waehrung)}</span></div>
        `, true);
      }
    }

    el.innerHTML = html;
  }

  function buildContentTree(r, issues) {
    if (!r.meta) return '';
    const errMap = {};
    issues.forEach(i => { errMap[i.fieldPath || i.field] = i; });

    let html = '<h2>Inhalt (aufgedroesel)</h2>';
    const raw = r.fieldTree?.raw || r.parsed?.raw;
    if (!raw) return html + '<p>Kein Inhalt zum Anzeigen.</p>';

    // pain.001
    const ver = r.meta.version || '';
    if (ver.startsWith('pain.001')) html += renderPain001Tree(raw, errMap);
    else if (ver.startsWith('pain.008')) html += renderPain008Tree(raw, errMap);
    else if (ver.startsWith('pain.002')) html += '<p>Status-Report-Inhalt (keine Feldanzeige implementiert)</p>';
    return html;
  }

  function fRow(path, label, value, errMap) {
    const issue = errMap[path];
    const cls   = issue ? (issue.severity === 'error' ? 'has-error' : 'has-warn') : '';
    const badge = issue
      ? `<span class="f-badge ${issue.severity}">${issue.severity === 'error' ? 'FEHLER' : 'WARNUNG'}</span>`
      : `<span class="f-badge ok">OK</span>`;
    const hint  = issue ? `<div class="issue-hint">&rarr; ${esc(issue.message)}${issue.expected?' — Erwartet: <em>'+esc(issue.expected)+'</em>':''}</div>` : '';
    return `<div class="field-row ${cls}">
      <span class="f-path">${esc(label||path)}</span>
      <span class="f-value">${esc(value||'—')}</span>
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
      ['GrpHdr.MsgId',            'Message ID',           _v(gh,'MsgId')],
      ['GrpHdr.CreDtTm',          'Erstellungszeitpunkt', _v(gh,'CreDtTm')],
      ['GrpHdr.NbOfTxs',          'Anzahl Transaktionen', _v(gh,'NbOfTxs')],
      ['GrpHdr.CtrlSum',          'Kontrollsumme',        _v(gh,'CtrlSum')],
      ['GrpHdr.InitgPty.Nm',      'Auftraggeber Name',    _v(gh,'InitgPty','Nm')],
    ];
    html += collapseSection('Group Header', ghFields.map(([p,l,v]) => fRow(p,l,v,errMap)).join(''), true);

    const pmtInfArr = (init['PmtInf'] || []);
    pmtInfArr.forEach((pi, idx) => {
      const base = `PmtInf[${idx}]`;
      const dbtr = _v(pi,'Dbtr') || {};
      const dbtrAdr = _v(dbtr,'PstlAdr') || {};
      const fields = [
        [`${base}.PmtInfId`,          'PmtInf ID',           _v(pi,'PmtInfId')],
        [`${base}.PmtMtd`,            'Zahlungsmethode',     _v(pi,'PmtMtd')],
        [`${base}.PmtTpInf.SvcLvl.Cd`,'Service Level',      _v(pi,'PmtTpInf','SvcLvl','Cd')],
        [`${base}.Dbtr.Nm`,           'Schuldner Name',      _v(dbtr,'Nm')],
        [`${base}.Dbtr.PstlAdr.Ctry`, 'Schuldner Land',      _v(dbtrAdr,'Ctry')],
        [`${base}.Dbtr.PstlAdr.TwnNm`,'Schuldner Ort',       _v(dbtrAdr,'TwnNm')],
        [`${base}.DbtrAcct.Id.IBAN`,  'Schuldner IBAN',      _v(pi,'DbtrAcct','Id','IBAN')],
        [`${base}.DbtrAgt.FinInstnId.BICFI`,'Schuldner BIC', _v(pi,'DbtrAgt','FinInstnId','BICFI')],
      ];
      const txArr = pi['CdtTrfTxInf'] || [];
      const txHtml = txArr.map((tx, ti) => {
        const txBase = `${base}.CdtTrfTxInf[${ti}]`;
        const cdtr   = _v(tx,'Cdtr') || {};
        const cdtrAdr= _v(cdtr,'PstlAdr') || {};
        const amtObj = tx['Amt'] && tx['Amt'][0] && tx['Amt'][0]['InstdAmt'] ? tx['Amt'][0]['InstdAmt'][0] : {};
        const amtVal = amtObj._ || '';
        const amtCcy = (amtObj.$ && amtObj.$.Ccy) || '';
        const txFields = [
          [`${txBase}.PmtId.EndToEndId`,       'End-to-End ID',   _v(tx,'PmtId','EndToEndId')],
          [`${txBase}.Amt.InstdAmt`,            `Betrag ${amtCcy}`,amtVal],
          [`${txBase}.Cdtr.Nm`,                'Empfaenger Name', _v(cdtr,'Nm')],
          [`${txBase}.Cdtr.PstlAdr.Ctry`,      'Empf. Land',      _v(cdtrAdr,'Ctry')],
          [`${txBase}.Cdtr.PstlAdr.TwnNm`,     'Empf. Ort',       _v(cdtrAdr,'TwnNm')],
          [`${txBase}.CdtrAcct.Id.IBAN`,       'Empfaenger IBAN', _v(tx,'CdtrAcct','Id','IBAN')],
          [`${txBase}.CdtrAgt.FinInstnId.BICFI`,'Empfaenger BIC',  _v(tx,'CdtrAgt','FinInstnId','BICFI')],
          [`${txBase}.RmtInf.Ustrd`,           'Verwendungszweck',_v(tx,'RmtInf','Ustrd')],
        ];
        return collapseSection(`Transaktion ${ti+1}`, txFields.map(([p,l,v]) => fRow(p,l,v,errMap)).join(''), ti===0);
      }).join('');
      html += collapseSection(`Payment Info ${idx+1}`, fields.map(([p,l,v]) => fRow(p,l,v,errMap)).join('') + txHtml, true);
    });
    return html;
  }

  function renderPain008Tree(raw, errMap) {
    const doc  = raw['Document'];
    const init = _v(doc,'CstmrDrctDbtInitn') || {};
    const gh   = _v(init,'GrpHdr') || {};
    let html   = '';
    const ghFields = [
      ['GrpHdr.MsgId',       'Message ID',           _v(gh,'MsgId')],
      ['GrpHdr.CreDtTm',     'Erstellungszeitpunkt', _v(gh,'CreDtTm')],
      ['GrpHdr.NbOfTxs',     'Anzahl Transaktionen', _v(gh,'NbOfTxs')],
      ['GrpHdr.CtrlSum',     'Kontrollsumme',        _v(gh,'CtrlSum')],
      ['GrpHdr.InitgPty.Nm', 'Auftraggeber Name',    _v(gh,'InitgPty','Nm')],
    ];
    html += collapseSection('Group Header', ghFields.map(([p,l,v]) => fRow(p,l,v,errMap)).join(''), true);
    const pmtInfArr = init['PmtInf'] || [];
    pmtInfArr.forEach((pi, idx) => {
      const base = `PmtInf[${idx}]`;
      const cdtr = _v(pi,'Cdtr') || {};
      const fields = [
        [`${base}.PmtInfId`,     'PmtInf ID',          _v(pi,'PmtInfId')],
        [`${base}.PmtMtd`,       'Zahlungsmethode',    _v(pi,'PmtMtd')],
        [`${base}.PmtTpInf.LclInstrm.Cd`, 'Lastschrifttyp', _v(pi,'PmtTpInf','LclInstrm','Cd')],
        [`${base}.PmtTpInf.SeqTp`,        'Sequenztyp',     _v(pi,'PmtTpInf','SeqTp')],
        [`${base}.Cdtr.Nm`,      'Glaeubiger Name',    _v(cdtr,'Nm')],
        [`${base}.CdtrAcct.Id.IBAN`, 'Glaeubiger IBAN',_v(pi,'CdtrAcct','Id','IBAN')],
        [`${base}.CdtrAgt.FinInstnId.BICFI`, 'Glaeubiger BIC', _v(pi,'CdtrAgt','FinInstnId','BICFI')],
      ];
      const txArr  = pi['DrctDbtTxInf'] || [];
      const txHtml = txArr.map((tx,ti) => {
        const txBase = `${base}.DrctDbtTxInf[${ti}]`;
        const dbtr = _v(tx,'Dbtr') || {};
        const mndt = _v(tx,'DrctDbtTx','MndtRltdInf') || {};
        const txFields = [
          [`${txBase}.PmtId.EndToEndId`,       'End-to-End ID',       _v(tx,'PmtId','EndToEndId')],
          [`${txBase}.InstdAmt`,               'Betrag',               _v(tx,'InstdAmt')],
          [`${txBase}.DrctDbtTx.MndtRltdInf.MndtId`,'Mandatsreferenz',_v(mndt,'MndtId')],
          [`${txBase}.DrctDbtTx.MndtRltdInf.DtOfSgntr`,'Mandatsdatum',_v(mndt,'DtOfSgntr')],
          [`${txBase}.Dbtr.Nm`,               'Schuldner Name',       _v(dbtr,'Nm')],
          [`${txBase}.DbtrAcct.Id.IBAN`,       'Schuldner IBAN',      _v(tx,'DbtrAcct','Id','IBAN')],
          [`${txBase}.DbtrAgt.FinInstnId.BICFI`,'Schuldner BIC',      _v(tx,'DbtrAgt','FinInstnId','BICFI')],
          [`${txBase}.RmtInf.Ustrd`,           'Verwendungszweck',    _v(tx,'RmtInf','Ustrd')],
        ];
        return collapseSection(`Transaktion ${ti+1}`, txFields.map(([p,l,v]) => fRow(p,l,v,errMap)).join(''), ti===0);
      }).join('');
      html += collapseSection(`Payment Info ${idx+1}`, fields.map(([p,l,v]) => fRow(p,l,v,errMap)).join('') + txHtml, true);
    });
    return html;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
