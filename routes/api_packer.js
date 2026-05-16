'use strict';
/* api_packer.js — C53 Packer mit zweistufiger Pre-Pack-Validierung
   Gate 1: XML-Wohlgeformtheit (fast-xml-parser strict)
   Gate 2: camt.053.001.08 Strukturvalidierung
   Nur valide Dateien werden ins Archiv gepackt, mit generiertem Dateinamen.
*/
const express  = require('express');
const multer   = require('multer');
const AdmZip   = require('adm-zip');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const router   = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 50 },
  fileFilter: (req, file, cb) => {
    const isXml = file.originalname.toLowerCase().endsWith('.xml')
               || file.mimetype === 'application/xml'
               || file.mimetype === 'text/xml';
    if (!isXml) {
      // Nicht-XML-Dateien merken, damit der Handler explizit fehlen kann
      if (!req._nonXmlFiles) req._nonXmlFiles = [];
      req._nonXmlFiles.push(file.originalname);
    }
    cb(null, isXml);
  },
});

// Gate 1: XML-Wohlgeformtheit
function checkXmlWellFormed(xmlStr) {
  const result = XMLValidator.validate(xmlStr, { allowBooleanAttributes: false });
  if (result !== true) {
    const e = result.err || {};
    return { ok: false, error: `Zeile ${e.line || '?'}, Spalte ${e.col || '?'}: ${e.msg || result}` };
  }
  return { ok: true };
}

// Gate 2: camt.053.001.08 Strukturvalidierung
function checkCamt053Schema(xmlStr) {
  const errors = [];

  if (!xmlStr.includes('camt.053.001.08')) {
    errors.push({ path: 'Document@xmlns', message: 'Namespace camt.053.001.08 nicht gefunden — Datei ist kein CAMT.053.001.08-Dokument' });
    return { ok: false, errors };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['Stmt', 'Ntry', 'TxDtls', 'AdrLine'].includes(name),
  });

  let doc;
  try {
    doc = parser.parse(xmlStr);
  } catch (e) {
    return { ok: false, errors: [{ path: 'Document', message: `XML-Parsefehler: ${e.message}` }] };
  }

  const root = doc.Document;
  if (!root) { errors.push({ path: 'Document', message: 'Root-Element <Document> fehlt' }); return { ok: false, errors }; }

  const bks = root.BkToCstmrStmt;
  if (!bks) { errors.push({ path: 'Document/BkToCstmrStmt', message: '<BkToCstmrStmt> fehlt' }); return { ok: false, errors }; }

  const stmtArr = Array.isArray(bks.Stmt) ? bks.Stmt : (bks.Stmt ? [bks.Stmt] : []);
  if (!stmtArr.length) { errors.push({ path: 'Document/BkToCstmrStmt/Stmt', message: '<Stmt> fehlt' }); return { ok: false, errors }; }

  stmtArr.forEach((stmt, idx) => {
    const base = `Stmt[${idx}]`;
    const acct = stmt.Acct;
    if (!acct) {
      errors.push({ path: `${base}/Acct`, message: '<Acct> fehlt' });
    } else {
      if (!acct.Id?.IBAN) errors.push({ path: `${base}/Acct/Id/IBAN`, message: 'IBAN fehlt' });
      if (!acct.Ccy)      errors.push({ path: `${base}/Acct/Ccy`,     message: 'Währung (Ccy) fehlt' });
    }
    if (stmt.ElctrncSeqNb === undefined || stmt.ElctrncSeqNb === null || stmt.ElctrncSeqNb === '') {
      errors.push({ path: `${base}/ElctrncSeqNb`, message: 'ElctrncSeqNb (Auszugsnummer) fehlt' });
    }
  });

  return { ok: errors.length === 0, errors };
}

// Metadaten für Dateiumbenennung extrahieren
// Format: YYYY-MM-DD_C53_[IBAN]_[CCY]-[SEQNB-padded5].xml
function extractC53Filename(xmlStr) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['Stmt'].includes(name),
  });
  let doc;
  try { doc = parser.parse(xmlStr); } catch { return null; }

  const stmts = doc?.Document?.BkToCstmrStmt?.Stmt;
  const stmt = Array.isArray(stmts) ? stmts[0] : stmts;
  if (!stmt) return null;

  const iban   = String(stmt?.Acct?.Id?.IBAN || 'UNKNOWN').replace(/\s/g, '');
  const ccy    = String(stmt?.Acct?.Ccy || 'EUR').toUpperCase();
  const seqNb  = String(stmt?.ElctrncSeqNb ?? '0').trim().padStart(5, '0');

  // Datum: ToDtTm > FrDtTm > CreDtTm > heute
  let dateRaw = '';
  const frToDt = stmt.FrToDt;
  if (frToDt?.ToDtTm) dateRaw = String(frToDt.ToDtTm);
  else if (frToDt?.FrDtTm) dateRaw = String(frToDt.FrDtTm);
  else if (stmt.CreDtTm)   dateRaw = String(stmt.CreDtTm);
  const date = dateRaw ? dateRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);

  return `${date}_C53_${iban}_${ccy}-${seqNb}.xml`;
}

// POST /api/packer/create
router.post('/create', upload.array('files', 50), (req, res) => {
  try {
    // Nicht-XML-Dateien explizit ablehnen (wurden von multer schon herausgefiltert)
    if (req._nonXmlFiles && req._nonXmlFiles.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Nur .xml-Dateien sind erlaubt. ${req._nonXmlFiles.length} Datei(en) abgelehnt.`,
        nonXmlFiles: req._nonXmlFiles.map(name => ({ file: name, reason: 'Kein XML-Format — nur .xml-Dateien sind erlaubt' })),
      });
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Dateien hochgeladen. Bitte mindestens eine .xml-Datei auswählen.' });
    }

    const validFiles    = [];
    const rejectedFiles = [];

    for (const f of files) {
      const xmlStr   = f.buffer.toString('utf8');
      const origName = f.originalname;

      // Gate 1: XML-Wohlgeformtheit
      const g1 = checkXmlWellFormed(xmlStr);
      if (!g1.ok) {
        rejectedFiles.push({ file: origName, gate: 1, reason: `XML nicht wohlgeformt — ${g1.error}` });
        continue;
      }

      // Gate 2: camt.053.001.08 Schema
      const g2 = checkCamt053Schema(xmlStr);
      if (!g2.ok) {
        const detail = g2.errors.map(e => `[${e.path}] ${e.message}`).join(' | ');
        rejectedFiles.push({ file: origName, gate: 2, reason: `Kein gültiges CAMT.053.001.08-Dokument — ${detail}` });
        continue;
      }

      const newName = extractC53Filename(xmlStr) || origName;
      validFiles.push({ buffer: f.buffer, name: newName, origName });
    }

    // Eine einzige ungültige Datei = kein Archiv
    if (rejectedFiles.length > 0) {
      return res.status(422).json({
        ok: false,
        error: `${rejectedFiles.length} von ${files.length} Datei(en) sind keine gültigen CAMT.053.001.08-Dokumente — kein Archiv erstellt.`,
        rejected: rejectedFiles,
      });
    }

    const zip = new AdmZip();
    validFiles.forEach(f => zip.addFile(f.name, f.buffer));

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `${ts}.C53`;
    const buf = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-File-Count', String(validFiles.length));
    return res.send(buf);
  } catch(e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/packer/validate-only — nur validieren ohne Archiv zu bauen
router.post('/validate-only', upload.array('files', 50), (req, res) => {
  try {
    if (req._nonXmlFiles && req._nonXmlFiles.length > 0) {
      const results = req._nonXmlFiles.map(name => ({
        file: name, ok: false, gate: 0,
        errors: [{ path: 'file', message: 'Kein XML-Format — nur .xml-Dateien sind erlaubt' }],
      }));
      return res.status(400).json({ ok: false, results });
    }

    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ ok: false, error: 'Keine Dateien hochgeladen.' });

    const results = files.map(f => {
      const xmlStr = f.buffer.toString('utf8');
      const g1 = checkXmlWellFormed(xmlStr);
      if (!g1.ok) return { file: f.originalname, ok: false, gate: 1, errors: [{ path: 'xml', message: g1.error }] };

      const g2 = checkCamt053Schema(xmlStr);
      if (!g2.ok) return { file: f.originalname, ok: false, gate: 2, errors: g2.errors };

      const newName = extractC53Filename(xmlStr) || f.originalname;
      return { file: f.originalname, ok: true, newName };
    });

    return res.json({ ok: results.every(r => r.ok), results });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
