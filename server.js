'use strict';
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'payments.armhosting.de')));

// Routes
const apiValidate  = require('./routes/api_validate');
const apiParse     = require('./routes/api_parse');
const apiConvert   = require('./routes/api_convert');
const apiGenerate  = require('./routes/api_generate');
const apiExport    = require('./routes/api_export');
const apiTools     = require('./routes/api_tools');
const apiSamples   = require('./routes/api_samples');
const apiPacker    = require('./routes/api_packer');
const apiMerge     = require('./routes/api_merge');

app.use('/api/validate',  upload.single('file'), apiValidate);
app.use('/api/parse',     upload.single('file'), apiParse);
app.use('/api/convert',   upload.single('file'), apiConvert);
app.use('/api/generate',  apiGenerate);
app.use('/api/export',    upload.single('file'), apiExport);
app.use('/api/tools',     apiTools);
app.use('/api/samples',   apiSamples);
app.use('/api/packer',    apiPacker);
app.use('/api/merge',     upload.array('files', 50), apiMerge);

// SPA fallback - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'payments.armhosting.de', 'index.html'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 2549;
app.listen(PORT, () => console.log(`Payments Toolkit running on http://localhost:${PORT}`));
