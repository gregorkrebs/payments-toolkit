'use strict';
const router = require('express').Router();
const { parseSta }           = require('../src/parsers/sta_parser');
const { parseCamt053 }       = require('../src/parsers/c53_parser');
const { parseC53ArchiveXml } = require('../src/parsers/c53_archive_xml_parser');

function stmtsToCsv(statements) {
  const rows = [];
  const cols = ['Konto/IBAN','Buchungsdatum','Wertstellungsdatum','Betrag','Waehrung','Soll/Haben','Buchungstext','Verwendungszweck','Gegenkonto IBAN','Gegenkonto Name','Referenz'];
  rows.push(cols.map(c => `"${c}"`).join(';'));
  for (const stmt of statements) {
    const iban = stmt.iban || stmt.id || '';
    const ccy  = stmt.currency || (stmt.openingBalance?.currency) || 'EUR';
    for (const tx of (stmt.transactions || [])) {
      const sd = [
        iban,
        tx.bookDate || tx.valDate || '',
        tx.valDate  || tx.bookDate || '',
        tx.amountSigned !== undefined ? tx.amountSigned.toFixed(2) : (tx.isCredit ? tx.amount : -tx.amount).toFixed(2),
        tx.currency || ccy,
        tx.isCredit ? 'Gutschrift' : 'Lastschrift',
        (tx.buchungstext || tx.bankTxCode || '').replace(/"/g,'""'),
        (tx.verwendungszweck || '').replace(/"/g,'""'),
        (tx.gegenkontoIban || '').replace(/"/g,'""'),
        (tx.gegenkontoName || '').replace(/"/g,'""'),
        (tx.ntryRef || tx.acctSvcrRef || tx.bankRef || tx.reference || '').replace(/"/g,'""'),
      ];
      rows.push(sd.map(v => `"${v}"`).join(';'));
    }
  }
  return rows.join('\r\n');
}

// POST /api/export/csv — accepts same upload as /api/parse/statement
router.post('/csv', async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei hochgeladen' });
  const buf      = req.file.buffer;
  const filename = req.file.originalname;
  try {
    let statements;
    const head  = buf.slice(0,300).toString('utf8');
    const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
    if (/^:20:/m.test(buf.toString('utf8'))) {
      const parsed = parseSta(buf.toString('utf8'));
      statements = parsed.statements;
    } else if (isZip) {
      const parsed = await parseC53ArchiveXml(buf);
      if (!parsed.ok) return res.json(parsed);
      statements = parsed.statements;
    } else {
      const parsed = await parseCamt053(buf.toString('utf8'));
      if (!parsed.ok) return res.json(parsed);
      statements = parsed.statements;
    }
    const csv = stmtsToCsv(statements || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.[^.]+$/, '')}_export.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
