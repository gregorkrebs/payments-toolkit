'use strict';
/*
  pain_validator.js — SEPA Payment File Validator
  IBAN-Prüfung: sepa.js (validateIBAN)
  Basis-Validierung: pain.001.001.03/09 (CCT), pain.002.001.03/10 (STS), pain.008.001.02/08/003.02 (CDD/CDB)

  Pflicht-Zusatzvalidierungen pain.001.001.09:
    - PstlAdr: strukturiert (StrtNm/BldgNb/PstCd/TwnNm/Ctry) ODER ganz leer.
               AdrLine ist VERBOTEN (auch nicht kombiniert mit leerem Ctry).
    - FinInstnId: muss <BICFI> nutzen, KEIN <BIC>-Tag
    - Ctry: leer ("") ist verboten — entweder gültig [A-Z]{2} oder ganz weg

  Pflicht-Zusatzvalidierungen pain.001.001.03:
    - FinInstnId: <BIC>-Tag erlaubt (BICFI auch akzeptiert)
    - PstlAdr: AdrLine + Ctry erlaubt, Ctry muss [A-Z]{2} wenn vorhanden
*/

const xml2js = require('xml2js');

// Clearing-/Sonderbank-Filter
let _checkIBANStatus = null;
let _getIBANMessage  = null;
try {
  _checkIBANStatus = require('../generators/clearing_filter').checkIBANStatus;
  _getIBANMessage  = require('../generators/clearing_messages').getIBANMessage;
} catch(_) { /* Clearing-Filter nicht verfügbar */ }

// sepa.js — wird für validateIBAN + validateCreditorID genutzt
let _sepaValidateIBAN, _sepaValidateCreditorID;
try {
  const SEPA = require('../../sepa.js/dist/sepa.es5.cjs');
  _sepaValidateIBAN        = SEPA.validateIBAN;
  _sepaValidateCreditorID  = SEPA.validateCreditorID;
} catch(e) {
  // Fallback: eigene IBAN-Prüfung wenn sepa.js nicht verfügbar
  const { validateIban } = require('./iban_validator');
  _sepaValidateIBAN = (iban) => validateIban(iban).valid;
}

// Namespace -> Version Map
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

// Issue factories
function err(fieldPath, value, message, expected) {
  return { severity: 'error', fieldPath, value: value !== undefined ? String(value) : '', message, expected: expected || '' };
}
function warn(fieldPath, value, message) {
  return { severity: 'warn', fieldPath, value: value !== undefined ? String(value) : '', message };
}
function info(fieldPath, value, message) {
  return { severity: 'info', fieldPath, value: value !== undefined ? String(value) : '', message };
}

// Deep traversal helper
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

// ── IBAN (via sepa.js validateIBAN + Clearing-Filter) ──
function checkIban(fieldPath, val, issues) {
  if (!val) { issues.push(err(fieldPath, val, 'Pflichtfeld fehlt: IBAN', 'Gültige IBAN')); return; }
  const clean = val.replace(/\s/g, '').toUpperCase();
  if (!_sepaValidateIBAN(clean)) {
    issues.push(err(fieldPath, val, 'Ungültige IBAN (Prüfsumme/Format fehlerhaft)', 'Gültige IBAN (ISO 13616)'));
    return; // Clearing-Check nur bei formal gültigen IBANs
  }
  if (_checkIBANStatus && _getIBANMessage) {
    const clearing = _checkIBANStatus(clean);
    if (clearing.status !== 'OK') {
      const msg  = _getIBANMessage(clearing);
      const bank = clearing.bezeichnung ? ` (${clearing.bezeichnung})` : '';
      const text = `${msg.icon} ${msg.title}${bank}: ${msg.detail}`;
      if (clearing.status === 'BLOCK') {
        issues.push(err(fieldPath, clean, text, msg.hint));
      } else {
        issues.push(warn(fieldPath, clean, text));
      }
    }
  }
}

// ── BIC / BICFI ──
const BIC_REGEX = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function checkBic(fieldPath, val, issues) {
  if (!val) return;
  if (!BIC_REGEX.test(val.toUpperCase())) {
    issues.push(warn(fieldPath, val, 'BIC-Format ungültig (erwartet 8 oder 11 Zeichen, z.B. COBADEFFXXX)'));
  }
}

// ── Adresse pain.001.001.03 (AdrLine erlaubt) ──
function checkAddress03(basePath, addr, issues) {
  if (!addr) return;
  const ctry  = _v(addr, 'Ctry');
  const lines = _arr(addr, 'AdrLine');
  const twn   = _v(addr, 'TwnNm');
  if (ctry === '') {
    issues.push(err(`${basePath}.Ctry`, ctry, 'Leeres <Ctry>-Element ist verboten', 'Gültiger ISO-3166-1-Alpha-2-Code oder Element weglassen'));
  } else if (ctry && !/^[A-Z]{2}$/.test(ctry)) {
    issues.push(err(`${basePath}.Ctry`, ctry, 'Ländercode ungültig (ISO 3166-1 Alpha-2)', 'z.B. DE, AT, CH'));
  }
  if (ctry && !twn && !lines.length) {
    issues.push(warn(`${basePath}`, '', 'Ctry angegeben, aber weder TwnNm noch AdrLine vorhanden'));
  }
}

// ── Adresse pain.001.001.09 (strukturiert PFLICHT, AdrLine VERBOTEN) ──
function checkAddress09(basePath, addr, issues) {
  if (!addr) return;

  const adrLines = _arr(addr, 'AdrLine');
  const ctry  = _v(addr, 'Ctry');
  const strtNm = _v(addr, 'StrtNm');
  const bldgNb = _v(addr, 'BldgNb');
  const pstCd  = _v(addr, 'PstCd');
  const twnNm  = _v(addr, 'TwnNm');

  // AdrLine ist in pain.001.001.09 grundsätzlich VERBOTEN
  if (adrLines.length > 0) {
    const adrLineText = adrLines
      .map(a => (a && typeof a === 'object' && '_' in a ? a._ : String(a || '')))
      .join('; ');
    issues.push(err(`${basePath}.AdrLine`, adrLineText,
      '<AdrLine> ist in pain.001.001.09 verboten — strukturierte Adresse (StrtNm/BldgNb/PstCd/TwnNm/Ctry) verwenden',
      'Strukturierte Adressfelder'));
    return;
  }

  // Leeres Ctry-Element ist verboten
  if (ctry === '') {
    issues.push(err(`${basePath}.Ctry`, ctry,
      'Leeres <Ctry/>-Element ist verboten — entweder gültigen Ländercode angeben oder Ctry weglassen',
      'ISO 3166-1 Alpha-2 (z.B. DE)'));
  }

  // Wenn irgendein Adressfeld vorhanden: müssen alle Pflichtfelder gesetzt sein
  const hasAnyField = ctry || strtNm || bldgNb || pstCd || twnNm;
  if (hasAnyField) {
    if (!strtNm) issues.push(err(`${basePath}.StrtNm`, '', '<StrtNm> (Straße) fehlt in strukturierter Adresse', 'Straßenname'));
    if (!pstCd)  issues.push(err(`${basePath}.PstCd`,  '', '<PstCd> (PLZ) fehlt in strukturierter Adresse',   'z.B. 12345'));
    if (!twnNm)  issues.push(err(`${basePath}.TwnNm`,  '', '<TwnNm> (Stadt) fehlt in strukturierter Adresse', 'Stadtname'));
    if (!ctry) {
      issues.push(err(`${basePath}.Ctry`, '', '<Ctry> (Land) ist PFLICHT wenn PstlAdr vorhanden (pain.001.001.09)', 'ISO 3166-1 Alpha-2'));
    } else if (ctry !== '' && !/^[A-Z]{2}$/.test(ctry)) {
      issues.push(err(`${basePath}.Ctry`, ctry, 'Ländercode ungültig (ISO 3166-1 Alpha-2)', 'z.B. DE, AT, CH'));
    }
  }
}

// ── FinInstnId version-abhängig ──
function checkFinInstnId(basePath, finInstnId, version, issues) {
  if (!finInstnId) return;
  const bicfi = _v(finInstnId, 'BICFI');
  const bic   = _v(finInstnId, 'BIC');

  if (version === 'pain.001.001.09' || version === 'pain.008.001.08') {
    if (bic) {
      issues.push(err(`${basePath}.BIC`, bic,
        `${version} erfordert <BICFI> statt <BIC> für FinInstnId`,
        '<BICFI>BIC</BICFI> statt <BIC>BIC</BIC>'));
    }
    if (bicfi) checkBic(`${basePath}.BICFI`, bicfi, issues);
  } else {
    const val = bicfi || bic;
    if (val) checkBic(`${basePath}.${bicfi ? 'BICFI' : 'BIC'}`, val, issues);
  }
}

// ── pain.001 Validierung ──
function validatePain001(doc, ver, issues) {
  const root  = doc['Document'];
  const ccti  = _v(root, 'CstmrCdtTrfInitn') || {};
  const grpHdr = _v(ccti, 'GrpHdr') || {};
  const msgId   = _v(grpHdr, 'MsgId');
  const creDtTm = _v(grpHdr, 'CreDtTm');
  const nbOfTxs = _v(grpHdr, 'NbOfTxs');
  const ctrlSum = _v(grpHdr, 'CtrlSum');

  if (!msgId) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId fehlt (Pflichtfeld)', 'Max 35 Zeichen'));
  else if (String(msgId).length > 35) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId zu lang (max 35 Zeichen)', '<=35'));
  if (!creDtTm) issues.push(err('GrpHdr.CreDtTm', creDtTm, 'CreDtTm fehlt', 'ISO 8601 Datum+Zeit'));
  if (!nbOfTxs) issues.push(err('GrpHdr.NbOfTxs', nbOfTxs, 'Anzahl Transaktionen fehlt', 'Ganzzahl > 0'));
  if (!ctrlSum) issues.push(err('GrpHdr.CtrlSum', ctrlSum, 'Kontrollsumme fehlt', 'Summe aller Beträge'));

  const initgNm = _v(_v(grpHdr, 'InitgPty') || {}, 'Nm');
  if (!initgNm) issues.push(err('GrpHdr.InitgPty.Nm', initgNm, 'Name Auftraggeber fehlt', 'Max 70 Zeichen'));

  const pmtInfArr = _arr(ccti, 'PmtInf');
  if (!pmtInfArr.length) { issues.push(err('PmtInf', '', 'Kein PmtInf-Block vorhanden', 'Mind. 1 PmtInf')); return; }

  const checkAddr = ver === 'pain.001.001.09' ? checkAddress09 : checkAddress03;
  let txCount = 0;

  pmtInfArr.forEach((pmtInf, pi) => {
    const base     = `PmtInf[${pi}]`;
    const pmtInfId = _v(pmtInf, 'PmtInfId');
    const pmtMtd   = _v(pmtInf, 'PmtMtd');
    const svcLvlCd = _v(_v(pmtInf, 'PmtTpInf') || {}, 'SvcLvl', 'Cd');
    const dbtr     = _v(pmtInf, 'Dbtr') || {};
    const dbtrAcct = _v(pmtInf, 'DbtrAcct') || {};
    const dbtrAgt  = _v(pmtInf, 'DbtrAgt') || {};

    if (!pmtInfId) issues.push(err(`${base}.PmtInfId`, pmtInfId, 'PmtInfId fehlt', 'Max 35 Zeichen'));
    if (pmtMtd !== 'TRF') issues.push(err(`${base}.PmtMtd`, pmtMtd, 'PmtMtd muss TRF sein', 'TRF'));
    if (svcLvlCd !== 'SEPA') issues.push(warn(`${base}.PmtTpInf.SvcLvl.Cd`, svcLvlCd, 'SvcLvl sollte SEPA sein'));

    const dbtrNm = _v(dbtr, 'Nm');
    if (!dbtrNm) issues.push(err(`${base}.Dbtr.Nm`, dbtrNm, 'Name Schuldner fehlt', 'Max 70 Zeichen'));
    checkAddr(`${base}.Dbtr.PstlAdr`, _v(dbtr, 'PstlAdr'), issues);
    checkIban(`${base}.DbtrAcct.Id.IBAN`, _v(dbtrAcct, 'Id', 'IBAN'), issues);
    checkFinInstnId(`${base}.DbtrAgt.FinInstnId`, _v(dbtrAgt, 'FinInstnId'), ver, issues);

    const cdtTrfTxInfArr = _arr(pmtInf, 'CdtTrfTxInf');
    if (!cdtTrfTxInfArr.length) issues.push(err(`${base}.CdtTrfTxInf`, '', 'Keine Transaktionen im PmtInf', 'Mind. 1 CdtTrfTxInf'));

    cdtTrfTxInfArr.forEach((tx, ti) => {
      txCount++;
      const txBase = `${base}.CdtTrfTxInf[${ti}]`;
      const pmtId  = _v(tx, 'PmtId') || {};
      const e2eId  = _v(pmtId, 'EndToEndId');
      const instdAmt = _v(tx, 'Amt', 'InstdAmt');
      const instdAmtCcy = tx['Amt'] && tx['Amt'][0] && tx['Amt'][0]['InstdAmt']
        ? (tx['Amt'][0]['InstdAmt'][0]['$'] && tx['Amt'][0]['InstdAmt'][0]['$']['Ccy']) : null;
      const cdtr     = _v(tx, 'Cdtr') || {};
      const cdtrAcct = _v(tx, 'CdtrAcct') || {};
      const cdtrAgt  = _v(tx, 'CdtrAgt') || {};
      const rmtInf   = _v(tx, 'RmtInf') || {};

      if (!e2eId) issues.push(err(`${txBase}.PmtId.EndToEndId`, e2eId, 'EndToEndId fehlt', 'Max 35 Zeichen oder NOTPROVIDED'));
      if (!instdAmt) issues.push(err(`${txBase}.Amt.InstdAmt`, instdAmt, 'Betrag fehlt', 'Dezimalzahl > 0'));
      else if (isNaN(parseFloat(instdAmt)) || parseFloat(instdAmt) <= 0)
        issues.push(err(`${txBase}.Amt.InstdAmt`, instdAmt, 'Betrag muss größer 0 sein', '> 0'));
      if (!instdAmtCcy) issues.push(warn(`${txBase}.Amt.InstdAmt@Ccy`, instdAmtCcy, 'Währung (Ccy-Attribut) nicht gesetzt'));

      const cdtrNm = _v(cdtr, 'Nm');
      if (!cdtrNm) issues.push(err(`${txBase}.Cdtr.Nm`, cdtrNm, 'Name Gläubiger fehlt', 'Max 70 Zeichen'));
      checkAddr(`${txBase}.Cdtr.PstlAdr`, _v(cdtr, 'PstlAdr'), issues);
      checkIban(`${txBase}.CdtrAcct.Id.IBAN`, _v(cdtrAcct, 'Id', 'IBAN'), issues);
      checkFinInstnId(`${txBase}.CdtrAgt.FinInstnId`, _v(cdtrAgt, 'FinInstnId'), ver, issues);

      const ustrd = _v(rmtInf, 'Ustrd');
      const strd  = _v(rmtInf, 'Strd');
      if (!ustrd && !strd) issues.push(warn(`${txBase}.RmtInf`, '', 'Verwendungszweck fehlt (Ustrd oder Strd)'));
      if (ustrd && ustrd.length > 140) issues.push(err(`${txBase}.RmtInf.Ustrd`, ustrd, 'Verwendungszweck zu lang (max 140 Zeichen)', '<=140'));
    });
  });

  const claimedNb = parseInt(nbOfTxs, 10);
  if (!isNaN(claimedNb) && claimedNb !== txCount) {
    issues.push(err('GrpHdr.NbOfTxs', nbOfTxs, `NbOfTxs (${claimedNb}) stimmt nicht mit tatsächlicher Transaktionsanzahl (${txCount}) überein`, String(txCount)));
  }
}

// ── pain.008 Validierung ──
function validatePain008(doc, ver, issues) {
  const root   = doc['Document'];
  const ddInit = _v(root, 'CstmrDrctDbtInitn') || {};
  const grpHdr = _v(ddInit, 'GrpHdr') || {};
  const msgId  = _v(grpHdr, 'MsgId');

  if (!msgId) issues.push(err('GrpHdr.MsgId', msgId, 'MsgId fehlt', 'Max 35 Zeichen'));
  if (!_v(grpHdr, 'CreDtTm')) issues.push(err('GrpHdr.CreDtTm', '', 'CreDtTm fehlt', 'ISO 8601'));
  if (!_v(grpHdr, 'NbOfTxs')) issues.push(err('GrpHdr.NbOfTxs', '', 'Anzahl Transaktionen fehlt', 'Ganzzahl > 0'));

  const pmtInfArr = _arr(ddInit, 'PmtInf');
  if (!pmtInfArr.length) { issues.push(err('PmtInf', '', 'Kein PmtInf-Block', 'Mind. 1')); return; }

  pmtInfArr.forEach((pmtInf, pi) => {
    const base   = `PmtInf[${pi}]`;
    const pmtMtd = _v(pmtInf, 'PmtMtd');
    if (pmtMtd !== 'DD') issues.push(err(`${base}.PmtMtd`, pmtMtd, 'PmtMtd muss DD sein', 'DD'));

    const cdtr    = _v(pmtInf, 'Cdtr') || {};
    const cdtrAgt = _v(pmtInf, 'CdtrAgt') || {};
    const cdtrAcct = _v(pmtInf, 'CdtrAcct') || {};
    if (!_v(cdtr, 'Nm')) issues.push(err(`${base}.Cdtr.Nm`, '', 'Name Gläubiger fehlt', 'Max 70 Zeichen'));
    checkIban(`${base}.CdtrAcct.Id.IBAN`, _v(cdtrAcct, 'Id', 'IBAN'), issues);

    // Creditor Scheme ID (GID) via sepa.js validateCreditorID wenn vorhanden
    const schmeIdVal = _v(_v(_v(pmtInf, 'CdtrSchmeId'), 'Id', 'PrvtId'), 'Othr', 'Id');
    if (schmeIdVal && _sepaValidateCreditorID) {
      if (!_sepaValidateCreditorID(schmeIdVal)) {
        issues.push(warn(`${base}.CdtrSchmeId`, schmeIdVal, 'Gläubigeridentifikation (GID) hat ungültiges Format'));
      }
    }

    checkFinInstnId(`${base}.CdtrAgt.FinInstnId`, _v(cdtrAgt, 'FinInstnId'), ver, issues);

    const drctDbtTxInfArr = _arr(pmtInf, 'DrctDbtTxInf');
    drctDbtTxInfArr.forEach((tx, ti) => {
      const txBase = `${base}.DrctDbtTxInf[${ti}]`;
      if (!_v(tx, 'PmtId', 'EndToEndId')) issues.push(err(`${txBase}.PmtId.EndToEndId`, '', 'EndToEndId fehlt', 'Max 35 Zeichen'));

      const instdAmt = _v(tx, 'InstdAmt');
      if (!instdAmt || parseFloat(instdAmt) <= 0) issues.push(err(`${txBase}.InstdAmt`, instdAmt, 'Betrag fehlt oder ungültig', '> 0'));

      const mndtRltdInf = _v(tx, 'DrctDbtTx', 'MndtRltdInf') || {};
      if (!_v(mndtRltdInf, 'MndtId')) issues.push(err(`${txBase}.DrctDbtTx.MndtRltdInf.MndtId`, '', 'Mandatsreferenz fehlt', 'Max 35 Zeichen'));
      if (!_v(mndtRltdInf, 'DtOfSgntr')) issues.push(err(`${txBase}.DrctDbtTx.MndtRltdInf.DtOfSgntr`, '', 'Mandatsdatum fehlt', 'YYYY-MM-DD'));

      const dbtr = _v(tx, 'Dbtr') || {};
      if (!_v(dbtr, 'Nm')) issues.push(err(`${txBase}.Dbtr.Nm`, '', 'Name Schuldner fehlt', 'Max 70 Zeichen'));

      const dbtrAcct = _v(tx, 'DbtrAcct') || {};
      checkIban(`${txBase}.DbtrAcct.Id.IBAN`, _v(dbtrAcct, 'Id', 'IBAN'), issues);

      const dbtrAgt = _v(tx, 'DbtrAgt') || {};
      checkFinInstnId(`${txBase}.DbtrAgt.FinInstnId`, _v(dbtrAgt, 'FinInstnId'), ver, issues);
    });
  });
}

// ── pain.002 Validierung ──
function validatePain002(doc, ver, issues) {
  const root    = doc['Document'];
  const cstsRpt = _v(root, 'CstmrPmtStsRpt') || {};
  const grpHdr  = _v(cstsRpt, 'GrpHdr') || {};
  if (!_v(grpHdr, 'MsgId')) issues.push(err('GrpHdr.MsgId', '', 'MsgId fehlt', 'Max 35 Zeichen'));
  if (!_v(grpHdr, 'CreDtTm')) issues.push(err('GrpHdr.CreDtTm', '', 'CreDtTm fehlt', 'ISO 8601'));
  const orgMsgId = _v(cstsRpt, 'OrgnlGrpInfAndSts', 'OrgnlMsgId');
  if (!orgMsgId) issues.push(warn('OrgnlGrpInfAndSts.OrgnlMsgId', '', 'Originale MsgId fehlt'));
}

// ── Haupt-Validierungsfunktion ──
async function validatePainXml(xmlStr) {
  const issues = [];
  const nsKey  = detectNamespace(xmlStr);
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

  // XSD-Sequenz PostalAddress6 (pain.001.001.03): <Ctry> muss innerhalb jedes <PstlAdr>-Blocks
  // vor <AdrLine> stehen. xml2js verliert die Elementreihenfolge beim Parsen — daher Regex auf Raw-XML.
  if (meta.version === 'pain.001.001.03') {
    const pstlAdrBlocks = xmlStr.match(/<PstlAdr[\s\S]*?<\/PstlAdr>/g) || [];
    pstlAdrBlocks.forEach((block, i) => {
      const ctryPos   = block.indexOf('<Ctry>');
      const adrLinePos = block.indexOf('<AdrLine>');
      if (ctryPos !== -1 && adrLinePos !== -1 && ctryPos > adrLinePos) {
        issues.push(err(
          `PstlAdr[${i}]`,
          '',
          '<AdrLine> steht vor <Ctry> in PstlAdr — XSD-Sequenz verletzt: <Ctry> muss vor <AdrLine> stehen',
          '<Ctry>XX</Ctry> vor <AdrLine>...</AdrLine>'
        ));
      }
    });
  }

  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warn');
  return { ok: errors.length === 0, meta, issues, errors, warnings };
}

module.exports = { validatePainXml, detectNamespace, NS_MAP };
