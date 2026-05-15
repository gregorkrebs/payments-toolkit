'use strict';
const xml2js = require('xml2js');
const { validateIban } = require('./iban_validator');

// Namespace -> version map
const NS_MAP = {
  'pain.001.001.03': { type: 'CCT', version: 'pain.001.001.03', ruleset: 'SEPA 2.x' },
  'pain.001.001.09': { type: 'CCT', version: 'pain.001.001.09', ruleset: 'SEPA 3.7 (2023)' },
  'pain.002.001.03': { type: 'STS', version: 'pain.002.001.03', ruleset: 'SEPA 2.x' },
  'pain.002.001.10': { type: 'STS', version: 'pain.002.001.10', ruleset: 'SEPA 3.x' },
  'pain.008.001.02': { type: 'CDD', version: 'pain.008.001.02', ruleset: 'SDD Core 2.x' },
  'pain.008.001.08': { type: 'CDD', version: 'pain.008.001.08', ruleset: 'SDD Core 3.x (2023)' },
  'pain.008.003.02': { type: 'CDB', version: 'pain.008.003.02', ruleset: 'SDD B2B' },
};

function detectNamespace(xmlStr) {
  for (const key of Object.keys(NS_MAP)) {
    if (xmlStr.includes(key)) return key;
  }
  return null;
}

function err(fieldPath, value, message, expected) {
  return { severity: 'error', fieldPath, value: value !== undefined ? String(value) : '', message, expected: expected || '' };
}
function warn(fieldPath, value, message) {
  return { severity: 'warn', fieldPath, value: value !== undefined ? String(value) : '', message };
}
function info(fieldPath, value, message) {
  return { severity: 'info', fieldPath, value: value !== undefined ? String(value) : '', message };
}

function _v(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur) return undefined;
    cur = Array.isArray(cur[k]) ? cur[k][0] : cur[k];
  }
  if (cur && typeof cur === 'object' && '_' in cur) return cur._;
  return cur;
}

function _arr(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur) return [];
    cur = cur[k];
  }
  if (!cur) return [];
  return Array.isArray(cur) ? cur : [cur];
}

function checkIban(fieldPath, val, issues) {
  if (!val) { issues.push(err(fieldPath, val, 'Pflichtfeld fehlt: IBAN', 'Gueltige IBAN')); return; }
  const r = validateIban(val);
  if (!r.valid) issues.push(err(fieldPath, val, `Ungueltige IBAN: ${r.error}`, 'Gueltige IBAN (ISO 13616)'));
}

function checkBic(fieldPath, val, issues) {
  if (!val) return;
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(val.toUpperCase())) {
    issues.push(warn(fieldPath, val, 'BIC-Format ungueltig (erwartet 8 oder 11 Zeichen)'));
  }
}

function checkAddress(basePath, addr, issues) {
  if (!addr) return;
  const adrTp = _v(addr, 'AdrTp', 'Cd') || _v(addr, 'AdrTp');
  const ctry = _v(addr, 'Ctry');
  const lines = _arr(addr, 'AdrLine');
  const pstCd = _v(addr, 'PstCd');
  const twn = _v(addr, 'TwnNm');
  if (ctry && !twn && !lines.length) {
    issues.push(err(`${basePath}.TwnNm`, '', 'Ort (TwnNm) fehlt, obwohl Land (Ctry) angegeben ist', 'TwnNm ist Pflicht wenn Ctry gesetzt'));
  }
  if (ctry && !/^[A-Z]{2}$/.test(ctry)) {
    issues.push(err(`${basePath}.Ctry`, ctry, 'Laendercode ungueltig (ISO 3166-1 Alpha-2)', 'z.B. DE, AT, CH'));
  }
}

function validatePain001(doc, ver, issues) {
  const root = doc['Document'];
  const ccti = _v(root, 'CstmrCdtTrfInitn') || {};
  const grpHdr = _v(ccti, 'GrpHdr') || {};
  const msgId = _v(grpHdr, 'MsgId');
  const creDtTm = _v(grpHdr, 'CreDtTm');
  const nbOfTxs = _v(grpHdr, 'NbOfTxs');
  const ctrlSum = _v(grpHdr, 'CtrlSum');
  if (!msgId) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId fehlt (Pflichtfeld)', 'Max 35 Zeichen'));
  else if (msgId.length > 35) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId zu lang (max 35 Zeichen)', '<=35'));
  if (!creDtTm) issues.push(err('GrpHdr.CreDtTm', creDtTm, 'CreDtTm fehlt', 'ISO 8601 Datum+Zeit'));
  if (!nbOfTxs) issues.push(err('GrpHdr.NbOfTxs', nbOfTxs, 'Anzahl Transaktionen fehlt', 'Ganzzahl > 0'));
  if (!ctrlSum) issues.push(err('GrpHdr.CtrlSum', ctrlSum, 'Kontrollsumme fehlt', 'Summe aller Betraege'));
  const initgPty = _v(grpHdr, 'InitgPty') || {};
  const initgNm = _v(initgPty, 'Nm');
  if (!initgNm) issues.push(err('GrpHdr.InitgPty.Nm', initgNm, 'Name Auftraggeber fehlt', 'Max 70 Zeichen'));

  const pmtInfArr = _arr(ccti, 'PmtInf');
  if (!pmtInfArr.length) { issues.push(err('PmtInf', '', 'Kein PmtInf-Block vorhanden', 'Mind. 1 PmtInf erforderlich')); return; }

  let txCount = 0;
  pmtInfArr.forEach((pmtInf, pi) => {
    const pmtInfId = _v(pmtInf, 'PmtInfId');
    const pmtMtd = _v(pmtInf, 'PmtMtd');
    const pmtTpInf = _v(pmtInf, 'PmtTpInf') || {};
    const svcLvlCd = _v(pmtTpInf, 'SvcLvl', 'Cd');
    const dbtr = _v(pmtInf, 'Dbtr') || {};
    const dbtrAcct = _v(pmtInf, 'DbtrAcct') || {};
    const dbtrAgt = _v(pmtInf, 'DbtrAgt') || {};
    const base = `PmtInf[${pi}]`;
    if (!pmtInfId) issues.push(err(`${base}.PmtInfId`, pmtInfId, 'PmtInfId fehlt', 'Max 35 Zeichen'));
    if (pmtMtd !== 'TRF') issues.push(err(`${base}.PmtMtd`, pmtMtd, 'PmtMtd muss TRF sein', 'TRF'));
    if (svcLvlCd !== 'SEPA') issues.push(warn(`${base}.PmtTpInf.SvcLvl.Cd`, svcLvlCd, 'SvcLvl sollte SEPA sein'));
    const dbtrNm = _v(dbtr, 'Nm');
    if (!dbtrNm) issues.push(err(`${base}.Dbtr.Nm`, dbtrNm, 'Name Schuldner fehlt', 'Max 70 Zeichen'));
    checkAddress(`${base}.Dbtr.PstlAdr`, _v(dbtr, 'PstlAdr'), issues);
    const dbtrIban = _v(dbtrAcct, 'Id', 'IBAN');
    checkIban(`${base}.DbtrAcct.Id.IBAN`, dbtrIban, issues);
    const dbtrBic = _v(dbtrAgt, 'FinInstnId', 'BICFI') || _v(dbtrAgt, 'FinInstnId', 'BIC');
    checkBic(`${base}.DbtrAgt.FinInstnId.BICFI`, dbtrBic, issues);

    const cdtTrfTxInfArr = _arr(pmtInf, 'CdtTrfTxInf');
    if (!cdtTrfTxInfArr.length) issues.push(err(`${base}.CdtTrfTxInf`, '', 'Keine Transaktionen im PmtInf', 'Mind. 1 CdtTrfTxInf'));
    cdtTrfTxInfArr.forEach((tx, ti) => {
      txCount++;
      const txBase = `${base}.CdtTrfTxInf[${ti}]`;
      const pmtId = _v(tx, 'PmtId') || {};
      const endToEndId = _v(pmtId, 'EndToEndId');
      const instdAmt = _v(tx, 'Amt', 'InstdAmt');
      const instdAmtCcy = tx['Amt'] && tx['Amt'][0] && tx['Amt'][0]['InstdAmt'] ?
        (tx['Amt'][0]['InstdAmt'][0]['$'] && tx['Amt'][0]['InstdAmt'][0]['$']['Ccy']) : null;
      const cdtr = _v(tx, 'Cdtr') || {};
      const cdtrAcct = _v(tx, 'CdtrAcct') || {};
      const cdtrAgt = _v(tx, 'CdtrAgt') || {};
      const rmtInf = _v(tx, 'RmtInf') || {};
      if (!endToEndId) issues.push(err(`${txBase}.PmtId.EndToEndId`, endToEndId, 'EndToEndId fehlt', 'Max 35 Zeichen oder NOTPROVIDED'));
      if (!instdAmt) issues.push(err(`${txBase}.Amt.InstdAmt`, instdAmt, 'Betrag fehlt', 'Dezimalzahl > 0'));
      else if (isNaN(parseFloat(instdAmt)) || parseFloat(instdAmt) <= 0)
        issues.push(err(`${txBase}.Amt.InstdAmt`, instdAmt, 'Betrag muss groesser 0 sein', '> 0'));
      if (!instdAmtCcy) issues.push(warn(`${txBase}.Amt.InstdAmt@Ccy`, instdAmtCcy, 'Waehrung (Ccy-Attribut) nicht gesetzt'));
      const cdtrNm = _v(cdtr, 'Nm');
      if (!cdtrNm) issues.push(err(`${txBase}.Cdtr.Nm`, cdtrNm, 'Name Glaeubiger fehlt', 'Max 70 Zeichen'));
      checkAddress(`${txBase}.Cdtr.PstlAdr`, _v(cdtr, 'PstlAdr'), issues);
      const cdtrIban = _v(cdtrAcct, 'Id', 'IBAN');
      checkIban(`${txBase}.CdtrAcct.Id.IBAN`, cdtrIban, issues);
      const cdtrBic = _v(cdtrAgt, 'FinInstnId', 'BICFI') || _v(cdtrAgt, 'FinInstnId', 'BIC');
      checkBic(`${txBase}.CdtrAgt.FinInstnId.BICFI`, cdtrBic, issues);
      const unstructured = _v(rmtInf, 'Ustrd');
      const structured = _v(rmtInf, 'Strd');
      if (!unstructured && !structured) issues.push(warn(`${txBase}.RmtInf`, '', 'Verwendungszweck fehlt (Ustrd oder Strd)'));
      if (unstructured && unstructured.length > 140) issues.push(err(`${txBase}.RmtInf.Ustrd`, unstructured, 'Verwendungszweck zu lang (max 140 Zeichen)', '<=140'));
    });
  });

  const claimedNb = parseInt(nbOfTxs, 10);
  if (!isNaN(claimedNb) && claimedNb !== txCount) {
    issues.push(err('GrpHdr.NbOfTxs', nbOfTxs, `NbOfTxs (${claimedNb}) stimmt nicht mit tatsaechlicher Transaktionsanzahl (${txCount}) ueberein`, String(txCount)));
  }
}

function validatePain008(doc, ver, issues) {
  const root = doc['Document'];
  const ddInit = _v(root, 'CstmrDrctDbtInitn') || {};
  const grpHdr = _v(ddInit, 'GrpHdr') || {};
  const msgId = _v(grpHdr, 'MsgId');
  if (!msgId) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId fehlt', 'Max 35 Zeichen'));
  if (!_v(grpHdr, 'CreDtTm')) issues.push(err('GrpHdr.CreDtTm', '', 'CreDtTm fehlt', 'ISO 8601'));
  if (!_v(grpHdr, 'NbOfTxs')) issues.push(err('GrpHdr.NbOfTxs', '', 'Anzahl Transaktionen fehlt', 'Ganzzahl > 0'));
  const pmtInfArr = _arr(ddInit, 'PmtInf');
  if (!pmtInfArr.length) { issues.push(err('PmtInf', '', 'Kein PmtInf-Block', 'Mind. 1')); return; }
  pmtInfArr.forEach((pmtInf, pi) => {
    const base = `PmtInf[${pi}]`;
    const pmtMtd = _v(pmtInf, 'PmtMtd');
    if (pmtMtd !== 'DD') issues.push(err(`${base}.PmtMtd`, pmtMtd, 'PmtMtd muss DD sein', 'DD'));
    const cdtr = _v(pmtInf, 'Cdtr') || {};
    const cdtrAgt = _v(pmtInf, 'CdtrAgt') || {};
    const cdtrAcct = _v(pmtInf, 'CdtrAcct') || {};
    if (!_v(cdtr, 'Nm')) issues.push(err(`${base}.Cdtr.Nm`, '', 'Name Glaeubiger fehlt', 'Max 70 Zeichen'));
    const cdtrIban = _v(cdtrAcct, 'Id', 'IBAN');
    checkIban(`${base}.CdtrAcct.Id.IBAN`, cdtrIban, issues);
    const drctDbtTxInfArr = _arr(pmtInf, 'DrctDbtTxInf');
    drctDbtTxInfArr.forEach((tx, ti) => {
      const txBase = `${base}.DrctDbtTxInf[${ti}]`;
      if (!_v(tx, 'PmtId', 'EndToEndId')) issues.push(err(`${txBase}.PmtId.EndToEndId`, '', 'EndToEndId fehlt', 'Max 35 Zeichen'));
      const instdAmt = _v(tx, 'InstdAmt');
      if (!instdAmt || parseFloat(instdAmt) <= 0) issues.push(err(`${txBase}.InstdAmt`, instdAmt, 'Betrag fehlt oder ungueltig', '> 0'));
      const mndtRltdInf = _v(tx, 'DrctDbtTx', 'MndtRltdInf') || {};
      if (!_v(mndtRltdInf, 'MndtId')) issues.push(err(`${txBase}.DrctDbtTx.MndtRltdInf.MndtId`, '', 'Mandatsreferenz fehlt', 'Max 35 Zeichen'));
      if (!_v(mndtRltdInf, 'DtOfSgntr')) issues.push(err(`${txBase}.DrctDbtTx.MndtRltdInf.DtOfSgntr`, '', 'Mandatsdatum fehlt', 'YYYY-MM-DD'));
      const dbtr = _v(tx, 'Dbtr') || {};
      if (!_v(dbtr, 'Nm')) issues.push(err(`${txBase}.Dbtr.Nm`, '', 'Name Schuldner fehlt', 'Max 70 Zeichen'));
      const dbtrAcct = _v(tx, 'DbtrAcct') || {};
      checkIban(`${txBase}.DbtrAcct.Id.IBAN`, _v(dbtrAcct, 'Id', 'IBAN'), issues);
    });
  });
}

function validatePain002(doc, ver, issues) {
  const root = doc['Document'];
  const cstsRpt = _v(root, 'CstmrPmtStsRpt') || {};
  const grpHdr = _v(cstsRpt, 'GrpHdr') || {};
  if (!_v(grpHdr, 'MsgId')) issues.push(err('GrpHdr.MsgId', '', 'MsgId fehlt', 'Max 35 Zeichen'));
  if (!_v(grpHdr, 'CreDtTm')) issues.push(err('GrpHdr.CreDtTm', '', 'CreDtTm fehlt', 'ISO 8601'));
  const orgMsgId = _v(cstsRpt, 'OrgnlGrpInfAndSts', 'OrgnlMsgId');
  if (!orgMsgId) issues.push(warn('OrgnlGrpInfAndSts.OrgnlMsgId', '', 'Originale MsgId fehlt'));
}

async function validatePainXml(xmlStr) {
  const issues = [];
  const nsKey = detectNamespace(xmlStr);
  if (!nsKey) return { ok: false, issues: [err('root', '', 'Unbekanntes oder fehlendes PAIN-Namespace', Object.keys(NS_MAP).join(', '))] };
  const meta = NS_MAP[nsKey];
  let doc;
  try {
    doc = await xml2js.parseStringPromise(xmlStr, { explicitCharkey: true, explicitArray: true, mergeAttrs: false });
  } catch (e) {
    return { ok: false, issues: [err('xml', '', `XML-Parsefehler: ${e.message}`, 'Wohlgeformtes XML')] };
  }
  if (!doc['Document']) return { ok: false, issues: [err('Document', '', 'Root-Element "Document" fehlt', '<Document>')] };
  if (meta.version.startsWith('pain.001')) validatePain001(doc, meta.version, issues);
  else if (meta.version.startsWith('pain.008')) validatePain008(doc, meta.version, issues);
  else if (meta.version.startsWith('pain.002')) validatePain002(doc, meta.version, issues);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warn');
  return { ok: errors.length === 0, meta, issues, errors, warnings };
}

module.exports = { validatePainXml, detectNamespace, NS_MAP };
