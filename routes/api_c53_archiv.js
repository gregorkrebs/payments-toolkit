'use strict';
/* api_c53_archiv.js — Archivinhalt anzeigen (READ-ONLY, keine Generierung)
   Parst ein .C53-Archiv (ZIP mit CAMT.053 XML-Dateien) und gibt die Auszugs-Metadaten zurück.
   Separate Endpunkte vom Packer (api_packer.js), der Dateien erzeugt.
*/
const express = require('express');
const router  = express.Router();

router.post('/info', async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei hochgeladen' });
  try {
    const { parseC53ArchiveXml } = require('../src/parsers/c53_archive_xml_parser');
    const parsed = await parseC53ArchiveXml(req.file.buffer);
    if (!parsed.ok) return res.json({ ok: false, error: parsed.error });
    return res.json({
      ok: true,
      format: parsed.format || 'C53-ARCHIVE',
      version: parsed.version,
      stmtCount: parsed.stmtCount,
      sourceFiles: parsed.sourceFiles || [],
      statements: (parsed.statements || []).map(s => ({
        iban:    s.iban,
        ccy:     s.ccy,
        seqNb:   s.seqNb,
        from:    s.from,
        to:      s.to,
        txCount: (s.transactions || []).length,
        balance: s.closingBalance,
      })),
    });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
