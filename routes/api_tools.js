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

// GET /api/tools/banksearch?q=...
// Searches German banks (BLZ.xml, primary) and EU SEPA participants (fallback/supplement).
// Priority: DE banks first; EU-only (non-German) banks appended after.
// BIC supplement: if a DE bank in BLZ.xml has no BIC, looks it up in EU XML by name.
router.get('/banksearch', (req, res) => {
  const { banks }             = require('../src/generators/identity_generator');
  const { lookupByBic, supplementBicByName, searchEuBanks } = require('../src/generators/eu_banks');

  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  const ql       = q.toLowerCase();
  const results  = [];
  const seenBics = new Set();

  // ── 1. German banks from BLZ.xml (Hauptstellen, priority) ──────────────────
  for (const [blz, bankInfo] of Object.entries(banks)) {
    const name = bankInfo[0].toLowerCase();
    const bic  = (bankInfo[1] || '').toLowerCase();
    if (!(blz.includes(ql) || name.includes(ql) || bic.includes(ql))) continue;

    let finalBic = bankInfo[1] || '';

    // Supplement missing BIC from EU XML (best-effort name match)
    if (!finalBic) {
      const eu = supplementBicByName(bankInfo[0]);
      if (eu) finalBic = eu.bic;
    }

    if (finalBic) seenBics.add(finalBic.toUpperCase());

    results.push({
      source:  'DE',
      blz:     blz,
      name:    bankInfo[0],
      bic:     finalBic,
      plz:     bankInfo[3] || '',
      city:    bankInfo[4] || '',
      address: '',
      country: 'DE',
    });
    if (results.length >= 30) break;
  }

  // ── 2. EU SEPA participants (non-German, fallback) ──────────────────────────
  const euHits = searchEuBanks(q, 50);
  for (const e of euHits) {
    if (e.countryCode === 'DE') continue;          // German banks already in BLZ.xml
    if (seenBics.has(e.bic.toUpperCase())) continue; // dedup
    seenBics.add(e.bic.toUpperCase());
    results.push({
      source:  'EU',
      blz:     '',
      name:    e.name,
      bic:     e.bic,
      plz:     '',
      city:    e.city,
      address: e.address,
      country: e.countryCode,
    });
    if (results.length >= 50) break;
  }

  res.json({ results, total: results.length });
});

module.exports = router;
