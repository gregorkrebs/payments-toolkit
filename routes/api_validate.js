'use strict';
const router = require('express').Router();
const { validatePainXml, detectNamespace } = require('../src/validators/pain_validator');
const { validateDtazv }  = require('../src/validators/dtazv_validator');

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

module.exports = router;
