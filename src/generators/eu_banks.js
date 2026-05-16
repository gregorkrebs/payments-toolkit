'use strict';
// EU SEPA Instant Credit Transfer participants (EBA SEPA participant list)
// Source: eu_sepa_participants.xml (EPC/EBA)
// Fields: BIC, ParticipantName, ADDRESS, CITY, COUNTRY

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Country name (as in EPC XML) → ISO 3166-1 alpha-2
const COUNTRY_ISO = {
  'ALBANIA': 'AL', 'ANDORRA': 'AD', 'AUSTRIA': 'AT', 'BELGIUM': 'BE',
  'BULGARIA': 'BG', 'CROATIA': 'HR', 'CYPRUS': 'CY', 'CZECH REPUBLIC': 'CZ',
  'CZECHIA': 'CZ', 'DENMARK': 'DK', 'ESTONIA': 'EE', 'FINLAND': 'FI',
  'FRANCE': 'FR', 'GEORGIA': 'GE', 'GERMANY': 'DE', 'GREECE': 'GR',
  'HUNGARY': 'HU', 'ICELAND': 'IS', 'IRELAND': 'IE', 'ITALY': 'IT',
  'LATVIA': 'LV', 'LIECHTENSTEIN': 'LI', 'LITHUANIA': 'LT', 'LUXEMBOURG': 'LU',
  'MALTA': 'MT', 'MOLDOVA': 'MD', 'MONACO': 'MC', 'NETHERLANDS': 'NL',
  'NORTH MACEDONIA': 'MK', 'NORWAY': 'NO', 'POLAND': 'PL', 'PORTUGAL': 'PT',
  'ROMANIA': 'RO', 'SAN MARINO': 'SM', 'SERBIA': 'RS', 'SLOVAKIA': 'SK',
  'SLOVENIA': 'SI', 'SPAIN': 'ES', 'SWEDEN': 'SE', 'SWITZERLAND': 'CH',
  'UKRAINE': 'UA', 'UNITED KINGDOM': 'GB',
};

let _byBic     = null;   // Map<BIC_UPPER, entry>
let _byNameNorm = null;  // Map<normalized_name, entry[]>  – for BIC supplement
let _list      = null;   // Array<entry> for full-text search

function load() {
  if (_byBic) return;
  const xml    = fs.readFileSync(path.join(__dirname, 'eu_sepa_participants.xml'), 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const data   = parser.parse(xml);
  const rows   = Array.isArray(data.DATAROOT.BANK) ? data.DATAROOT.BANK : [data.DATAROOT.BANK];

  _byBic     = new Map();
  _byNameNorm = new Map();
  _list      = [];

  for (const row of rows) {
    const bic = String(row.BIC || '').trim().toUpperCase();
    if (!bic) continue;
    const countryUpper = String(row.COUNTRY || '').trim().toUpperCase();
    const entry = {
      bic,
      name:        String(row.ParticipantName || '').trim(),
      address:     String(row.ADDRESS  || '').trim(),
      city:        String(row.CITY     || '').trim(),
      countryName: countryUpper,
      countryCode: COUNTRY_ISO[countryUpper] || countryUpper.slice(0, 2).toUpperCase(),
      readiness:   String(row.ReadinessDate || '').trim(),
    };

    _byBic.set(bic, entry);
    _list.push(entry);

    // Index by normalised name for fuzzy BIC supplement
    const norm = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!_byNameNorm.has(norm)) _byNameNorm.set(norm, []);
    _byNameNorm.get(norm).push(entry);
  }
}

/**
 * Exact BIC lookup (case-insensitive).
 * Returns entry or null.
 */
function lookupByBic(bic) {
  load();
  return _byBic.get(String(bic || '').trim().toUpperCase()) || null;
}

/**
 * Best-effort BIC supplement for a bank identified only by name.
 * Used when BLZ.xml has no BIC for an entry.
 * Returns first EU entry whose normalised name is a prefix-match, or null.
 */
function supplementBicByName(bankName) {
  load();
  const norm = String(bankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm.length < 4) return null;
  // Exact match first
  if (_byNameNorm.has(norm)) return _byNameNorm.get(norm)[0];
  // Prefix match: find entries whose norm-name starts with the first 8 chars of our norm
  const prefix = norm.slice(0, 8);
  for (const [key, entries] of _byNameNorm) {
    if (key.startsWith(prefix) || prefix.startsWith(key.slice(0, 8))) {
      // Only trust if country is DE (German bank)
      const de = entries.find(e => e.countryCode === 'DE');
      if (de) return de;
    }
  }
  return null;
}

/**
 * Text search over the EU participant list.
 * Priority: BIC prefix > name word-start > substring (only for q >= 4 chars) > city/country.
 * Returns up to `limit` entries, ranked by relevance tier.
 */
function searchEuBanks(q, limit = 30) {
  load();
  const ql = String(q || '').toLowerCase().trim();
  if (ql.length < 2) return [];

  const tier1 = []; // BIC prefix or exact name/word start
  const tier2 = []; // name substring (only long queries)
  const tier3 = []; // city / country match

  for (const e of _list) {
    const nameLow = e.name.toLowerCase();
    const bicLow  = e.bic.toLowerCase();

    // BIC: exact or prefix
    if (bicLow === ql || bicLow.startsWith(ql)) { tier1.push(e); continue; }
    // Name: starts with query, or any word in name starts with query
    if (nameLow.startsWith(ql) || nameLow.split(/[\s,.\-/]+/).some(w => w.startsWith(ql))) {
      tier1.push(e); continue;
    }
    // Substring match – only for queries >= 4 chars (avoids "ing" in "Going" etc.)
    if (ql.length >= 4 && nameLow.includes(ql)) {
      tier2.push(e); continue;
    }
    // City / country
    if (e.city.toLowerCase().startsWith(ql) || e.countryCode.toLowerCase() === ql ||
        e.countryName.toLowerCase().startsWith(ql)) {
      tier3.push(e); continue;
    }
  }

  return [...tier1, ...tier2, ...tier3].slice(0, limit);
}

/** Total number of loaded EU entries (for diagnostics). */
function euBankCount() {
  load();
  return _list.length;
}

module.exports = { lookupByBic, supplementBicByName, searchEuBanks, euBankCount, COUNTRY_ISO };
