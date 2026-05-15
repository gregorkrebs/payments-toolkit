'use strict';
const router  = require('express').Router();
const { buildPain001 } = require('../src/generators/pain001_generator');
const { buildPain008 } = require('../src/generators/pain008_generator');
const { RULESETS }     = require('../src/schemas/sepa_rulesets');
const { FIELD_DEFS }   = require('../src/schemas/order_type_fields');

// GET /api/generate/rulesets - return all order types with available rulesets
router.get('/rulesets', (req, res) => res.json(RULESETS));

// GET /api/generate/fields/:painVersion - return field definitions for a specific version
router.get('/fields/:painVersion', (req, res) => {
  const v = req.params.painVersion;
  const defs = FIELD_DEFS[v];
  if (!defs) return res.status(404).json({ error: `Keine Felddefinitionen fuer "${v}"` });
  res.json(defs);
});

// POST /api/generate - generate a payment file
router.post('/', (req, res) => {
  const painVersion = req.body.painVersion;
  const data = req.body; // Frontend sends flat body: { painVersion, field1, field2, ..., transactions: [] }
  if (!painVersion) return res.status(400).json({ error: 'painVersion ist erforderlich' });
  try {
    let result;
    if (painVersion.startsWith('pain.001')) {
      result = { xml: buildPain001(data, painVersion), mime: 'application/xml', ext: 'xml' };
    } else if (painVersion.startsWith('pain.008')) {
      result = { xml: buildPain008(data, painVersion), mime: 'application/xml', ext: 'xml' };
    } else if (painVersion === 'dtazv') {
      const { buildDtazv } = require('../src/generators/dtazv_generator');
      const orderType = data.AOrderType || 'AZV';
      result = { xml: buildDtazv(data, orderType), mime: 'text/plain', ext: 'txt' };
    } else {
      return res.status(400).json({ error: `Unbekannte Version "${painVersion}"` });
    }
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="payment_${Date.now()}.${result.ext}"`);
    res.send(result.xml);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bankaccount', (req, res) => {
  const { generateIdentity } = require('../src/generators/identity_generator');
  
  const requested = parseInt(req.query.amount) || 3;
  const max_allowed = 200;
  const amount = Math.min(requested, max_allowed);
  
  const results = [];

  for (let i = 0; i < amount; i++) {
    const id = generateIdentity();
    const data = {
      id: i + 1,
      firstname: id.firstName,
      lastname:  id.lastName,
      fullname:  id.fullName,
      birthday:  id.birthday,
      age:       id.age,
      gender:    id.gender,
      email:     id.email,
      phone:     id.phone,
      address: {
        street:       id.address.street,
        plz:          id.address.plz,
        city:         id.address.city,
        state:        id.address.state,
        country:      "Deutschland",
        country_code: "DE",
        full:         id.address.full
      },
      account: {
        iban:           id.account.iban,
        iban_formatted: id.account.iban.replace(/(.{4})/g, '$1 ').trim(),
        bic:            id.account.bic,
        bankname:       id.account.bankname,
        account_number: id.account.konto,
        bank_code:      id.account.blz
      }
    };
    results.push(data);
  }

  const response = {
    meta: {
      requested:   requested,
      delivered:   amount,
      limited:     requested > max_allowed,
      max_allowed: max_allowed,
      timestamp:   new Date().toISOString()
    },
    data: results
  };

  console.log(`=== Requested: ${requested} | Delivered: ${amount} ===`);
  res.json(response);
});

module.exports = router;