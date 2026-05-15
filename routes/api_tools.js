'use strict';
const router = require('express').Router();
const { validateIban, calculateCheckDigits, ibanFromDe, breakdownIban, batchValidate } = require('../src/validators/iban_validator');

// POST /api/tools/iban/validate
router.post('/iban/validate', (req, res) => {
  const { iban } = req.body;
  if (!iban) return res.status(400).json({ error: 'IBAN erforderlich' });
  res.json(validateIban(iban));
});

// POST /api/tools/iban/calculate
router.post('/iban/calculate', (req, res) => {
  const { country, bban } = req.body;
  if (!country || !bban) return res.status(400).json({ error: 'country und bban erforderlich' });
  res.json(calculateCheckDigits(country, bban));
});

// POST /api/tools/iban/de
router.post('/iban/de', (req, res) => {
  const { blz, konto } = req.body;
  if (!blz || !konto) return res.status(400).json({ error: 'blz und konto erforderlich' });
  res.json(ibanFromDe(blz, konto));
});

// POST /api/tools/iban/breakdown
router.post('/iban/breakdown', (req, res) => {
  const { iban } = req.body;
  if (!iban) return res.status(400).json({ error: 'IBAN erforderlich' });
  res.json(breakdownIban(iban));
});

// POST /api/tools/iban/batch
router.post('/iban/batch', (req, res) => {
  const { ibans } = req.body;
  if (!Array.isArray(ibans) || !ibans.length) return res.status(400).json({ error: 'ibans (Array) erforderlich' });
  if (ibans.length > 500) return res.status(400).json({ error: 'Maximal 500 IBANs pro Anfrage' });
  res.json({ results: ibans.map(raw => ({ input: raw, ...validateIban(raw) })) });
});

// GET /api/tools/iban/countries - list supported countries
router.get('/iban/countries', (req, res) => {
  const { IBAN_FORMATS } = require('../src/validators/iban_validator');
  res.json(Object.entries(IBAN_FORMATS).map(([cc, f]) => ({ country: cc, length: f.len })));
});

// GET /api/tools/banksearch
router.get('/banksearch', (req, res) => {
  const { banks } = require('../src/generators/identity_generator');
  const q = (req.query.q || '').toLowerCase();
  if (q.length < 3) return res.json({ results: [] });
  
  const results = [];
  for (const [blz, bankInfo] of Object.entries(banks)) {
    const name = bankInfo[0].toLowerCase();
    const bic = bankInfo[1] ? bankInfo[1].toLowerCase() : '';
    
    if (blz.includes(q) || name.includes(q) || bic.includes(q)) {
      results.push({
        blz: blz,
        name: bankInfo[0],
        bic: bankInfo[1] || '',
        method: bankInfo[2] || '',
        plz: bankInfo[3] || '',
        city: bankInfo[4] || ''
      });
      if (results.length >= 50) break;
    }
  }
  res.json({ results });
});

module.exports = router;
