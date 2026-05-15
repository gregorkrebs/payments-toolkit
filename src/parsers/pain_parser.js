'use strict';
// PAIN XML parser — normalizes pain.001/.002/.008 into JS objects
const xml2js = require('xml2js');
const { detectNamespace, NS_MAP } = require('../validators/pain_validator');

async function parsePain(xmlStr) {
  let doc;
  try { doc = await xml2js.parseStringPromise(xmlStr, { explicitCharkey: true, explicitArray: true }); }
  catch(e) { return { ok: false, error: `XML-Parsefehler: ${e.message}` }; }
  const nsKey = detectNamespace(xmlStr);
  const meta  = nsKey ? NS_MAP[nsKey] : { type: 'UNKNOWN', version: 'unknown', ruleset: '' };
  const root  = doc['Document'];
  if (!root) return { ok: false, error: 'Root-Element "Document" fehlt' };
  return { ok: true, meta, raw: doc };
}

module.exports = { parsePain };
