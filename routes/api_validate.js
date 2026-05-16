'use strict';
const express = require('express');
const router  = express.Router();
const xml2js  = require('xml2js');
const { validatePainXml, detectNamespace } = require('../src/validators/pain_validator');
const { validateDtazv }  = require('../src/validators/dtazv_validator');

const SEPA_TEXT_REGEX = /^[A-Za-z0-9\/?:().,'+\- ÄÖÜäöüß]*$/;

// Detect file type from content/extension
function detectFormat(buf, filename) {
  const name = (filename || '').toLowerCase();
  const head = buf.slice(0, 300).toString('utf8');
  // ZIP / C53-Archive
  if (name.endsWith('.c53') || name.endsWith('.zip') || (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4B)) return 'C53-ARCHIVE';
  // XML-based formats
  if (head.includes('<?xml') || head.includes('<Document')) {
    if (head.includes('pain.001') || head.includes('pain.002') || head.includes('pain.008')) return 'PAIN';
    if (head.includes('camt.053') || head.includes('BkToCstmrStmt')) return 'C53';
    return 'XML';
  }
  // MT940/STA: by extension or content (:20: tag)
  if (name.endsWith('.sta') || name.endsWith('.mt940')) return 'STA';
  const textUtf8 = buf.toString('utf8');
  if (/^:20:/m.test(textUtf8)) return 'STA';
  // DTAZV: A-record with known order type
  const textLatin = buf.toString('latin1');
  if (/^A.{24}(CCT|CDD|CDB|CCU|CTV|AZV|AXZ)/i.test(textLatin)) return 'DTAZV';
  return 'UNKNOWN';
}

// Build a grouped field tree from parsed pain for display
async function buildPainFieldTree(xmlStr, validateResult) {
  const { parsePain } = require('../src/parsers/pain_parser');
  const parsed = await parsePain(xmlStr);
  if (!parsed.ok) return null;
  const errMap = {};
  (validateResult.issues || []).forEach(i => { errMap[i.fieldPath] = i; });
  return { meta: validateResult.meta, errorMap: errMap, raw: parsed.raw };
}

router.post('/', async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei hochgeladen' });
  const buf      = req.file.buffer;
  const filename = req.file.originalname;
  const format   = detectFormat(buf, filename);

  try {
    if (format === 'PAIN') {
      const xmlStr = buf.toString('utf8');
      const result = await validatePainXml(xmlStr);
      const fieldTree = await buildPainFieldTree(xmlStr, result);
      return res.json({ ok: result.ok, format: 'PAIN', filename, ...result, fieldTree });
    }

    if (format === 'DTAZV') {
      const text   = buf.toString('latin1');
      const result = validateDtazv(text);
      return res.json({ ok: result.ok, format: 'DTAZV', filename, ...result });
    }

    if (format === 'STA') {
      const { parseSta } = require('../src/parsers/sta_parser');
      try {
        const parsed    = parseSta(buf.toString('utf8'));
        const stmtCount = (parsed.statements || []).length;
        const txCount   = (parsed.statements || []).reduce((s, st) => s + (st.transactions || []).length, 0);
        const issues    = parsed.ok ? [] : [{ severity: 'error', fieldPath: 'file', message: parsed.error || 'Parsefehler' }];
        return res.json({
          ok: parsed.ok, format: 'STA', filename,
          meta: { stmtCount, txCount },
          issues,
          summary: parsed.ok ? `${stmtCount} Kontoauszug/Kontoauszuege mit ${txCount} Buchungen erkannt` : undefined,
        });
      } catch(staErr) {
        return res.json({ ok: false, format: 'STA', filename, error: `STA-Parsefehler: ${staErr.message}` });
      }
    }

    if (format === 'C53') {
      const { parseCamt053 } = require('../src/parsers/c53_parser');
      const xmlStr = buf.toString('utf8');
      const parsed = await parseCamt053(xmlStr);
      const warnings = [], errors = [];
      if (!parsed.ok) errors.push({ severity:'error', fieldPath:'xml', message: parsed.error });
      return res.json({ ok: parsed.ok, format: 'C53', filename, meta: { version: parsed.version }, errors, warnings, parsed });
    }

    if (format === 'C53-ARCHIVE') {
      const { parseC53ArchiveXml } = require('../src/parsers/c53_archive_xml_parser');
      const parsed = await parseC53ArchiveXml(buf);
      const warnings = [], errors = [];
      if (!parsed.ok) errors.push({ severity:'error', fieldPath:'file', message: parsed.error });
      const stmtCount = (parsed.statements || []).length;
      return res.json({ ok: parsed.ok, format: 'C53-ARCHIVE', filename, meta: { stmtCount }, errors, warnings,
        summary: parsed.ok ? `${stmtCount} Kontoauszug/Kontoauszuege gefunden` : undefined });
    }

    return res.json({ ok: false, format, filename, error: `Format "${format}" wird nicht erkannt. Bitte PAIN-XML, DTAZV, STA (MT940) oder C53/C53-Archiv hochladen.` });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/validate/apply-edits ──────────────────────────────────────────
// Body: JSON { xml: string, edits: [{path, value}] }
// Parses PAIN-XML, applies field edits by path, rebuilds and returns modified XML.
router.post('/apply-edits', async (req, res) => {
  const { xml, edits } = req.body || {};
  if (!xml || typeof xml !== 'string') return res.status(400).json({ ok: false, error: 'xml fehlt' });
  if (!Array.isArray(edits) || edits.length === 0) return res.status(400).json({ ok: false, error: 'Keine Änderungen übergeben' });

  const version = detectNamespace(xml);
  if (!version) return res.status(400).json({ ok: false, error: 'Unbekanntes PAIN-Format in XML' });

  let parsed;
  try {
    parsed = await xml2js.parseStringPromise(xml, {
      explicitCharkey: true, explicitArray: true, mergeAttrs: false, charkey: '_', attrkey: '$',
    });
  } catch(e) {
    return res.status(400).json({ ok: false, error: `XML-Parsefehler: ${e.message}` });
  }

  const rootKey = version.startsWith('pain.001') ? 'CstmrCdtTrfInitn'
    : version.startsWith('pain.008') ? 'CstmrDrctDbtInitn'
    : version.startsWith('pain.002') ? 'CstmrPmtStsRpt'
    : null;
  if (!rootKey || !parsed.Document || !parsed.Document[rootKey]) {
    return res.status(400).json({ ok: false, error: `Root-Element für ${version} nicht gefunden` });
  }

  const failures = [];
  for (const { path, value } of edits) {
    try {
      const v = String(value);
      validateEditValue(path, v);
      applyEditPath(parsed.Document[rootKey][0], path, v);
    } catch(e) {
      failures.push(`${path}: ${e.message}`);
    }
  }
  if (failures.length > 0) return res.status(400).json({ ok: false, error: failures.join('; ') });

  // AdrLine entfernen wo strukturierte Felder vorhanden sind (03→09-Konvertierung)
  cleanupAdrLine(parsed.Document[rootKey][0]);

  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    charkey: '_', attrkey: '$', headless: false,
  });
  const newXml = builder.buildObject(parsed);

  // Always validate after edits and before download.
  const recheck = await validatePainXml(newXml);
  if (!recheck.ok) {
    return res.status(422).json({
      ok: false,
      error: 'Die geänderte Datei ist nicht valide. Bitte Fehler korrigieren.',
      issues: recheck.issues || [],
      errors: recheck.errors || [],
      warnings: recheck.warnings || [],
      meta: recheck.meta || {},
      missingFields: collectMissingFields(recheck.issues || []),
    });
  }

  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${version.replace(/\./g,'_')}_edited_${ts}.xml"`);
  res.send(newXml);
});

// Navigate parsed xml2js tree by dot-notation path (e.g. "PmtInf[0].Dbtr.Nm")
// and set the leaf value. All elements assumed to be arrays (explicitArray:true).
// Leaf elements are created (upsert) if they don't exist yet.
function applyEditPath(root, path, value) {
  const segs = path.split('.');
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const m = segs[i].match(/^(\w+)\[(\d+)\]$/);
    const key = m ? m[1] : segs[i];
    const idx = m ? parseInt(m[2], 10) : 0;
    if (!cur[key] || cur[key][idx] === undefined) throw new Error(`Pfad nicht gefunden bei '${segs[i]}'`);
    cur = cur[key][idx];
  }
  const last = segs[segs.length - 1];
  const lm = last.match(/^(\w+)\[(\d+)\]$/);
  const lkey = lm ? lm[1] : last;
  const lidx = lm ? parseInt(lm[2], 10) : 0;

  // Element noch nicht vorhanden → anlegen (upsert für Adressfelder wie StrtNm etc.)
  if (!cur[lkey] || cur[lkey][lidx] === undefined) {
    if (!cur[lkey]) cur[lkey] = [];
    cur[lkey][lidx] = value;
    return;
  }

  const leaf = cur[lkey][lidx];
  if (leaf !== null && typeof leaf === 'object') {
    leaf._ = value;
  } else {
    cur[lkey][lidx] = value;
  }
}

// Entfernt AdrLine aus jedem PstlAdr-Knoten, der bereits strukturierte Felder hat.
// Wird nach apply-edits aufgerufen, damit AdrLine→StrtNm/TwnNm/PstCd-Konvertierung atomar klappt.
function cleanupAdrLine(node) {
  if (!node || typeof node !== 'object') return;
  const STRUCTURED = ['StrtNm', 'BldgNb', 'PstCd', 'TwnNm'];
  for (const val of Object.values(node)) {
    const arr = Array.isArray(val) ? val : [val];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.PstlAdr)) {
        item.PstlAdr.forEach(adr => {
          if (adr && STRUCTURED.some(k => adr[k]) && adr.AdrLine) delete adr.AdrLine;
        });
      }
      cleanupAdrLine(item);
    }
  }
}

function validateEditValue(path, value) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error('Ungültige Steuerzeichen erkannt');
  }
  if (/[<>]/.test(value)) {
    throw new Error('Winkelklammern sind in Feldwerten nicht erlaubt');
  }

  const isTextField = /\.Nm$|\.Ustrd$|\.AdrLine$|\.StrtNm$|\.TwnNm$|\.PstCd$/.test(path);
  if (isTextField && !SEPA_TEXT_REGEX.test(value)) {
    throw new Error('Ungültige Zeichen für SEPA-Textfeld');
  }

  if (/\.Nm$/.test(path) && value.length > 70) {
    throw new Error('Name zu lang (max. 70 Zeichen)');
  }
  if (/\.Ustrd$/.test(path) && value.length > 140) {
    throw new Error('Verwendungszweck zu lang (max. 140 Zeichen)');
  }
  if (/\.MsgId$|\.PmtInfId$|\.EndToEndId$/.test(path) && value.length > 35) {
    throw new Error('Kennung zu lang (max. 35 Zeichen)');
  }
}

function collectMissingFields(issues) {
  const seen = new Set();
  const rows = [];
  issues.forEach(i => {
    if (!i || !i.fieldPath || i.severity !== 'error') return;
    if (seen.has(i.fieldPath)) return;
    seen.add(i.fieldPath);

    // AdrLine-Fehler: raw-Adresstext mitliefern damit Frontend parsen kann
    if (/\.AdrLine$/.test(i.fieldPath)) {
      rows.push({ path: i.fieldPath, message: i.message || '', rawValue: i.value || '', isAdrLine: true });
      return;
    }

    if (!/fehlt|Pflicht/i.test(i.message || '')) return;
    if (!/\.TwnNm$|\.BICFI$|\.BIC$|\.Ctry$|\.StrtNm$|\.PstCd$/.test(i.fieldPath)) return;
    rows.push({ path: i.fieldPath, message: i.message || '', rawValue: i.value || '' });
  });
  return rows;
}

module.exports = router;
