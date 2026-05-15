'use strict';
const router = require('express').Router();
const { parseSta }              = require('../src/parsers/sta_parser');
const { parseCamt053 }          = require('../src/parsers/c53_parser');
const { parseC53ArchiveXml }    = require('../src/parsers/c53_archive_xml_parser');

function detectStatementFormat(buf, filename) {
  const name = (filename || '').toLowerCase();
  const head = buf.slice(0, 300).toString('utf8');
  if (name.endsWith('.zip') || name.endsWith('.c53')) return 'C53-ARCHIVE';
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4B) return 'C53-ARCHIVE';
  if (head.includes('camt.053'))                  return 'C53';
  if (head.includes('BkToCstmrStmt'))             return 'C53';
  if (head.includes('<?xml'))                     return 'C53-XML';
  if (name.endsWith('.sta') || name.endsWith('.mt940') || name.endsWith('.txt')) return 'STA';
  // Try STA pattern
  if (/^:20:/m.test(buf.toString('utf8')))        return 'STA';
  return 'UNKNOWN';
}

router.post('/statement', async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei hochgeladen' });
  const buf      = req.file.buffer;
  const filename = req.file.originalname;
  const fmt      = req.body.format || detectStatementFormat(buf, filename);
  try {
    let result;
    if (fmt === 'STA') {
      const text = buf.toString('utf8');
      result = parseSta(text);
      result.format = 'STA';
    } else if (fmt === 'C53' || fmt === 'C53-XML') {
      result = await parseCamt053(buf.toString('utf8'));
    } else if (fmt === 'C53-ARCHIVE') {
      result = await parseC53ArchiveXml(buf);
    } else {
      // Auto-try
      const text = buf.toString('utf8');
      if (/^:20:/m.test(text)) { result = parseSta(text); result.format = 'STA'; }
      else { result = await parseC53ArchiveXml(buf); }
    }
    if (!result.ok && result.ok !== undefined) return res.json(result);
    res.json({ ok: true, filename, ...result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
