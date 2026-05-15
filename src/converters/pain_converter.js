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

async function convertPainVersion(xmlStr, targetVersion) {
  const srcNs = detectNamespace(xmlStr);
  if (!srcNs) return { ok: false, error: 'Quellformat unbekannt oder nicht unterstuetzt' };
  const tgtNs = targetVersion ? targetVersion : NS_MAP_FWD[srcNs];
  if (!tgtNs) return { ok: false, error: `Keine Konvertierungsziel fuer ${srcNs} bekannt` };
  if (!NS_URI[tgtNs]) return { ok: false, error: `Ziel-Namespace ${tgtNs} nicht unterstuetzt` };

  const warnings = [];
  // Simple namespace replacement (field structure is largely identical between versions)
  let result = xmlStr.replace(new RegExp(NS_URI[srcNs], 'g'), NS_URI[tgtNs]);

  // pain.001.001.03 -> 09: ReqdExctnDt is a date string -> must wrap in <Dt>
  if (srcNs === 'pain.001.001.03' && tgtNs === 'pain.001.001.09') {
    result = result.replace(/<ReqdExctnDt>(\d{4}-\d{2}-\d{2})<\/ReqdExctnDt>/g,
      (_, dt) => `<ReqdExctnDt><Dt>${dt}</Dt></ReqdExctnDt>`);
    warnings.push('ReqdExctnDt wurde in <Dt>-Element eingebettet (pain.009 erfordert dies)');
  }
  // pain.001.001.09 -> 03: ReqdExctnDt unwrap <Dt>
  if (srcNs === 'pain.001.001.09' && tgtNs === 'pain.001.001.03') {
    result = result.replace(/<ReqdExctnDt><Dt>(\d{4}-\d{2}-\d{2})<\/Dt><\/ReqdExctnDt>/g,
      (_, dt) => `<ReqdExctnDt>${dt}</ReqdExctnDt>`);
    warnings.push('ReqdExctnDt wurde aus <Dt>-Element entpackt (pain.003 erwartet direkten Wert)');
  }
  // pain.008.001.08: Sts became Sts/Cd in some contexts - handled structurally identically here
  if ((srcNs === 'pain.008.001.02' && tgtNs === 'pain.008.001.08') ||
      (srcNs === 'pain.008.001.08' && tgtNs === 'pain.008.001.02')) {
    warnings.push('Strukturelle Kompatibilitaet: pain.008 v02 und v08 sind weitgehend identisch; manuelle Pruefung empfohlen.');
  }

  return { ok: true, sourceVersion: srcNs, targetVersion: tgtNs, xml: result, warnings };
}

module.exports = { convertPainVersion, NS_MAP_FWD };
