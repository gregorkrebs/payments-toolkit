'use strict';
const router = require('express').Router();
const { parseSta }           = require('../src/parsers/sta_parser');
const { parseCamt053 }       = require('../src/parsers/c53_parser');
const { parseC53ArchiveXml } = require('../src/parsers/c53_archive_xml_parser');
const { staToCamt053 }       = require('../src/converters/sta_to_c53');
const { camt053ToSta }       = require('../src/converters/c53_to_sta');
const { convertPainVersion } = require('../src/converters/pain_converter');
const { detectNamespace }    = require('../src/validators/pain_validator');

router.post('/', async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei hochgeladen' });
  const buf       = req.file.buffer;
  const filename  = req.file.originalname;
  const targetFmt = (req.body.targetFormat || '').toLowerCase();

  try {
    const head    = buf.slice(0, 300).toString('utf8');
    const isSta   = /^:20:/m.test(buf.toString('utf8'));
    const isXml   = head.includes('<?xml') || head.includes('<Document');
    const isZip   = buf[0] === 0x50 && buf[1] === 0x4B;
    const nsKey   = isXml ? detectNamespace(head) : null;
    const isPain  = !!(nsKey && (nsKey.startsWith('pain.001') || nsKey.startsWith('pain.008')));
    const isC53   = isXml && (head.includes('camt.053') || head.includes('BkToCstmrStmt'));

    // PAIN version conversion
    if (isPain) {
      if (!targetFmt || targetFmt.startsWith('pain')) {
        const result = await convertPainVersion(buf.toString('utf8'), targetFmt || null);
        if (!result.ok) return res.json(result);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="converted_${result.targetVersion}.xml"`);
        return res.send(result.xml);
      }
      return res.json({ ok: false, error: 'PAIN-Dateien koennen nur in andere PAIN-Versionen konvertiert werden' });
    }

    // STA -> C53
    if (isSta && (targetFmt === 'c53' || targetFmt === 'camt.053')) {
      const parsed = parseSta(buf.toString('utf8'));
      const xml    = staToCamt053(parsed);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\..*$/, '')}.c53.xml"`);
      return res.send(xml);
    }

    // C53/C53-XML/C53-ARCHIVE -> STA
    if ((isC53 || isZip) && targetFmt === 'sta') {
      const parsed = isZip ? await parseC53ArchiveXml(buf) : await parseCamt053(buf.toString('utf8'));
      if (!parsed.ok) return res.json(parsed);
      const sta = camt053ToSta(parsed);
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\..*$/, '')}.sta"`);
      return res.send(sta);
    }

    // STA -> STA (no-op, for testing)
    if (isSta && targetFmt === 'sta') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf.toString('utf8'));
    }

    return res.json({ ok: false, error: `Konvertierung von erkanntem Format nach "${targetFmt}" nicht unterstuetzt` });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET list of available conversions
router.get('/options', (req, res) => {
  res.json({
    conversions: [
      { from: 'STA (MT940)',  to: 'CAMT.053 (C53)',    targetFormat: 'c53',             description: 'SWIFT MT940 Kontoauszug -> ISO 20022 XML' },
      { from: 'C53 (XML)',    to: 'STA (MT940)',        targetFormat: 'sta',             description: 'ISO 20022 C53 XML -> SWIFT MT940' },
      { from: 'C53-ARCHIVE',  to: 'STA (MT940)',        targetFormat: 'sta',             description: 'C53-Archiv (ZIP/XML) -> SWIFT MT940' },
      { from: 'pain.001.001.03', to: 'pain.001.001.09', targetFormat: 'pain.001.001.09', description: 'SEPA Credit Transfer: v03 -> v09' },
      { from: 'pain.001.001.09', to: 'pain.001.001.03', targetFormat: 'pain.001.001.03', description: 'SEPA Credit Transfer: v09 -> v03' },
      { from: 'pain.008.001.02', to: 'pain.008.001.08', targetFormat: 'pain.008.001.08', description: 'SEPA Direct Debit Core: v02 -> v08' },
      { from: 'pain.008.001.08', to: 'pain.008.001.02', targetFormat: 'pain.008.001.02', description: 'SEPA Direct Debit Core: v08 -> v02' },
    ]
  });
});

module.exports = router;
