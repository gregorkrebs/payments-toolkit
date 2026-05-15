'use strict';
/* api_packer.js — C53 Packer: mehrere XMLs zu einer .C53 (ZIP) packen */
const express  = require('express');
const multer   = require('multer');
const AdmZip   = require('adm-zip');
const router   = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.xml')
            || file.mimetype === 'application/xml'
            || file.mimetype === 'text/xml';
    cb(null, ok);
  },
});

router.post('/create', upload.array('files', 50), (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Dateien hochgeladen.' });
    }
    const zip = new AdmZip();
    files.forEach(f => { zip.addFile(f.originalname, f.buffer); });
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `${ts}.C53`;
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-File-Count', String(files.length));
    return res.send(buf);
  } catch(e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
