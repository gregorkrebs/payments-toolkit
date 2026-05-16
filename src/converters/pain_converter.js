'use strict';
// PAIN version converter: pain.001 03<->09, pain.008 02<->08
const xml2js    = require('xml2js');
const { detectNamespace } = require('../validators/pain_validator');

const NS_MAP_FWD = {
  'pain.001.001.03': 'pain.001.001.09',
  'pain.001.001.09': 'pain.001.001.03',
  'pain.008.001.02': 'pain.008.001.08',
  'pain.008.001.08': 'pain.008.001.02',
};
const NS_URI = {
  'pain.001.001.03': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  'pain.001.001.09': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
  'pain.008.001.02': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02',
  'pain.008.001.08': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08',
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === 'object' && '_' in node) return String(node._ || '');
  return String(node);
}

function splitAddressLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  let streetPart = parts[0] || '';
  let cityPart = parts[parts.length - 1] || '';
  let pstCd = '';
  let twnNm = '';

  const cityMatch = cityPart.match(/^(\d{4,5})\s+(.+)$/);
  if (cityMatch) {
    pstCd = cityMatch[1];
    twnNm = cityMatch[2].trim();
  } else {
    twnNm = cityPart;
  }

  const streetMatch = streetPart.match(/^(.*?)(?:\s+(\d+[a-zA-Z]?))$/);
  const strtNm = streetMatch ? streetMatch[1].trim() : streetPart;
  const bldgNb = streetMatch ? streetMatch[2].trim() : '';

  if (!strtNm || !pstCd || !twnNm) return null;
  return { strtNm, bldgNb, pstCd, twnNm };
}

function normalizePstlAdr(version, addr, dropAllAddress) {
  if (!addr || dropAllAddress) return null;

  const adrLines = asArray(addr.AdrLine).map(textOf).filter(Boolean);
  const ctry = textOf(addr.Ctry).trim();

  if (version === 'pain.001.001.09') {
    const structured = {
      StrtNm: textOf(addr.StrtNm).trim(),
      BldgNb: textOf(addr.BldgNb).trim(),
      PstCd: textOf(addr.PstCd).trim(),
      TwnNm: textOf(addr.TwnNm).trim(),
      Ctry: ctry,
    };

    const hasStructured = structured.StrtNm || structured.BldgNb || structured.PstCd || structured.TwnNm;
    if (!hasStructured) {
      if (!adrLines.length) return null;
      const parsed = splitAddressLine(adrLines.join(', '));
      if (!parsed) return null;
      return { StrtNm: parsed.strtNm, BldgNb: parsed.bldgNb, PstCd: parsed.pstCd, TwnNm: parsed.twnNm, ...(ctry ? { Ctry: ctry } : {}) };
    }

    if (!structured.StrtNm || !structured.PstCd || !structured.TwnNm) return null;
    return { ...structured, ...(ctry ? { Ctry: ctry } : {}) };
  }

  if (!adrLines.length) return null;
  return { AdrLine: adrLines[0], ...(ctry ? { Ctry: ctry } : {}) };
}

function getFinInstnId(node) {
  return node?.FinInstnId || null;
}

function normalizeFinInstnId(version, finInstnId) {
  if (!finInstnId) return null;
  const bic = textOf(finInstnId.BIC || finInstnId.BICFI).trim();
  const othr = finInstnId.Othr;
  if (!bic && !othr) return null;
  if (version === 'pain.001.001.09') {
    if (bic) return { BICFI: bic };
    return { Othr: othr };
  }
  if (bic) return { BIC: bic };
  return { Othr: othr };
}

function transformReqdExctnDt(version, value) {
  const node = value && value[0] ? value[0] : value;
  if (version === 'pain.001.001.09') {
    // wrap plain date text into <Dt> if not already wrapped
    if (node && node.Dt === undefined) {
      const dateText = textOf(node).trim();
      if (dateText) return [{ Dt: [{ _: dateText }] }];
    }
    return value;
  }
  if (version === 'pain.001.001.03') {
    // unwrap <Dt> back to plain text
    if (node && node.Dt !== undefined) {
      const dateText = textOf(node.Dt && node.Dt[0] !== undefined ? node.Dt[0] : node.Dt).trim();
      if (dateText) return [{ _: dateText }];
    }
    return value;
  }
  return value;
}

function transformPain001Node(node, version, dropAllAddress) {
  if (!node || typeof node !== 'object') return node;

  const cloned = Array.isArray(node) ? node.map(child => transformPain001Node(child, version, dropAllAddress)) : { ...node };
  if (Array.isArray(cloned)) return cloned;

  for (const key of Object.keys(cloned)) {
    const value = cloned[key];
    if (key === 'PstlAdr') {
      const normalized = normalizePstlAdr(version, value && value[0] ? value[0] : value, dropAllAddress);
      if (!normalized) {
        delete cloned[key];
      } else {
        cloned[key] = [normalized];
      }
      continue;
    }
    if (key === 'FinInstnId') {
      const normalized = normalizeFinInstnId(version, value && value[0] ? value[0] : value);
      if (!normalized) delete cloned[key];
      else cloned[key] = [normalized];
      continue;
    }
    if (key === 'ReqdExctnDt') {
      cloned[key] = transformReqdExctnDt(version, value);
      continue;
    }
    if (Array.isArray(value)) {
      cloned[key] = value.map(child => transformPain001Node(child, version, dropAllAddress));
    } else if (value && typeof value === 'object') {
      cloned[key] = transformPain001Node(value, version, dropAllAddress);
    }
  }

  return cloned;
}

async function convertPainVersion(xmlStr, targetVersion) {
  const srcNs = detectNamespace(xmlStr);
  if (!srcNs) return { ok: false, error: 'Quellformat unbekannt oder nicht unterstuetzt' };
  const tgtNs = targetVersion ? targetVersion : NS_MAP_FWD[srcNs];
  if (!tgtNs) return { ok: false, error: `Keine Konvertierungsziel fuer ${srcNs} bekannt` };
  if (!NS_URI[tgtNs]) return { ok: false, error: `Ziel-Namespace ${tgtNs} nicht unterstuetzt` };

  const warnings = [];

  if (srcNs.startsWith('pain.001') && tgtNs.startsWith('pain.001')) {
    const doc = await xml2js.parseStringPromise(xmlStr, { explicitArray: true, preserveChildrenOrder: true, explicitCharkey: true });
    const root = doc.Document;
    if (!root) return { ok: false, error: 'Root-Element "Document" fehlt' };

    root.$ = root.$ || {};
    root.$.xmlns = NS_URI[tgtNs];

    let cct = root.CstmrCdtTrfInitn && root.CstmrCdtTrfInitn[0];
    if (!cct) return { ok: false, error: 'CstmrCdtTrfInitn fehlt' };

    const pmtInfs = asArray(cct.PmtInf);
    const allAddresses = [];
    for (const pmtInf of pmtInfs) {
      const dbtr = pmtInf.Dbtr && pmtInf.Dbtr[0];
      if (dbtr && dbtr.PstlAdr) allAddresses.push(dbtr.PstlAdr[0]);
      for (const tx of asArray(pmtInf.CdtTrfTxInf)) {
        const cdtr = tx.Cdtr && tx.Cdtr[0];
        if (cdtr && cdtr.PstlAdr) allAddresses.push(cdtr.PstlAdr[0]);
      }
    }

    const shouldDropAllAddresses = allAddresses.some(addr => !normalizePstlAdr(tgtNs, addr, false));
    if (shouldDropAllAddresses) warnings.push('Mindestens eine Adresse war unvollständig; alle PstlAdr-Elemente wurden entfernt.');

    cct = transformPain001Node(cct, tgtNs, shouldDropAllAddresses);
    root.CstmrCdtTrfInitn[0] = cct;

    const builder = new xml2js.Builder({ headless: false, renderOpts: { pretty: true, indent: '  ', newline: '\n' } });
    const result = builder.buildObject(doc);
    return { ok: true, sourceVersion: srcNs, targetVersion: tgtNs, xml: result, warnings };
  }

  let result = xmlStr.replace(new RegExp(NS_URI[srcNs], 'g'), NS_URI[tgtNs]);
  if ((srcNs === 'pain.008.001.02' && tgtNs === 'pain.008.001.08') ||
      (srcNs === 'pain.008.001.08' && tgtNs === 'pain.008.001.02')) {
    warnings.push('Strukturelle Kompatibilitaet: pain.008 v02 und v08 sind weitgehend identisch; manuelle Pruefung empfohlen.');
  }
  return { ok: true, sourceVersion: srcNs, targetVersion: tgtNs, xml: result, warnings };
}

module.exports = { convertPainVersion, NS_MAP_FWD };
