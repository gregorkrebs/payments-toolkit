'use strict';
// C53-Archive-XML parser
// Handles:
//   1. Plain CAMT.053 XML files (single account, single day — from MultiCash archives)
//   2. ZIP archives containing one or more CAMT.053 XML files
// Always delegates parsing to c53_parser and returns the same normalized structure.

const path     = require('path');
const { parseCamt053 } = require('./c53_parser');

let AdmZip;
try { AdmZip = require('adm-zip'); } catch(e) { AdmZip = null; }

function isZip(buffer) {
  // ZIP magic bytes: PK (0x50 0x4B)
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4B;
}

async function parseC53ArchiveXml(buffer) {
  if (isZip(buffer)) {
    if (!AdmZip) return { ok: false, error: 'ZIP-Dateien benoetigen das adm-zip Paket (npm install adm-zip)' };
    const zip = new AdmZip(buffer);
    const xmlEntries = zip.getEntries().filter(e => {
      const name = e.entryName.toLowerCase();
      return (name.endsWith('.xml') || name.endsWith('.c53')) && !e.isDirectory;
    });
    if (!xmlEntries.length) return { ok: false, error: 'ZIP-Archiv enthaelt keine XML/C53-Dateien' };

    const results = [];
    for (const entry of xmlEntries) {
      const xmlStr = entry.getData().toString('utf8');
      const result = await parseCamt053(xmlStr);
      result.sourceFile = entry.entryName;
      // Tag each statement with its source filename for the dropdown
      (result.statements || []).forEach(s => { s.sourceFile = entry.entryName; });
      results.push(result);
    }
    // Merge all statements from all XML files into one response
    const allStmts = results.flatMap(r => r.statements || []);
    const firstOk  = results.find(r => r.ok);
    if (!firstOk) return { ok: false, error: results.map(r => r.error).join('; ') };
    return {
      ok: true, format: 'C53-ARCHIVE', version: firstOk.version,
      sourceFiles: xmlEntries.map(e => e.entryName),
      stmtCount:   allStmts.length,
      statements:  allStmts,
      // Stats
      msgId: firstOk.msgId, creDtTm: firstOk.creDtTm
    };
  }

  // Plain XML — parse directly
  const xmlStr = buffer.toString('utf8');
  const result = await parseCamt053(xmlStr);
  result.format = 'C53-XML';
  return result;
}

module.exports = { parseC53ArchiveXml };
