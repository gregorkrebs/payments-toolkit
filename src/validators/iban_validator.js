'use strict';

const { isValidIBAN: isValidGermanIBAN } = require('ibantools-germany');

// IBAN country format: [total_length, bban_structure_description] 
// 
const IBAN_FORMATS = {
  AD: { len: 24 }, AE: { len: 23 }, AL: { len: 28 }, AT: { len: 20 }, AZ: { len: 28 },
  BA: { len: 20 }, BE: { len: 16 }, BG: { len: 22 }, BH: { len: 22 }, BR: { len: 29 },
  BY: { len: 28 }, CH: { len: 21 }, CR: { len: 22 }, CY: { len: 28 }, CZ: { len: 24 },
  DE: { len: 22 }, DK: { len: 18 }, DO: { len: 28 }, EE: { len: 20 }, EG: { len: 29 },
  ES: { len: 24 }, FI: { len: 18 }, FO: { len: 18 }, FR: { len: 27 }, GB: { len: 22 },
  GE: { len: 22 }, GI: { len: 23 }, GL: { len: 18 }, GR: { len: 27 }, GT: { len: 28 },
  HR: { len: 21 }, HU: { len: 28 }, IE: { len: 22 }, IL: { len: 23 }, IQ: { len: 23 },
  IS: { len: 26 }, IT: { len: 27 }, JO: { len: 30 }, KW: { len: 30 }, KZ: { len: 20 },
  LB: { len: 28 }, LC: { len: 32 }, LI: { len: 21 }, LT: { len: 20 }, LU: { len: 20 },
  LV: { len: 21 }, LY: { len: 25 }, MC: { len: 27 }, MD: { len: 24 }, ME: { len: 22 },
  MK: { len: 19 }, MR: { len: 27 }, MT: { len: 31 }, MU: { len: 30 }, NL: { len: 18 },
  NO: { len: 15 }, PK: { len: 24 }, PL: { len: 28 }, PS: { len: 29 }, PT: { len: 25 },
  QA: { len: 29 }, RO: { len: 24 }, RS: { len: 22 }, SA: { len: 24 }, SC: { len: 31 },
  SE: { len: 24 }, SI: { len: 19 }, SK: { len: 24 }, SM: { len: 27 }, ST: { len: 25 },
  SV: { len: 28 }, TL: { len: 23 }, TN: { len: 24 }, TR: { len: 26 }, UA: { len: 29 },
  VA: { len: 22 }, VG: { len: 24 }, XK: { len: 20 }
};

function _numericIban(iban) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  return rearranged.split('').map(c => {
    const code = c.charCodeAt(0);
    return code >= 65 && code <= 90 ? String(code - 55) : c;
  }
  ).join('');
}

function mod97(numStr) {
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++)
    remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97;
  return remainder;
}

// ---------------------------------------------------------------------------
// Haupt-Validierung
// ---------------------------------------------------------------------------

function validateIban(raw) {
  const iban = (raw || '').replace(/\s/g, '').toUpperCase();
  if (!iban) return { valid: false, error: 'IBAN ist leer' };
  if (iban.length < 5) return { valid: false, error: 'IBAN zu kurz' };

  const country = iban.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country)) return { valid: false, error: 'Ungueltige Laenderkennung' };

  const fmt = IBAN_FORMATS[country];
  if (!fmt) return { valid: false, error: `Laenderkennung ${country} nicht unterstuetzt` };

  if (iban.length !== fmt.len) {
    return { valid: false, error: `Laenge falsch: ${iban.length} Zeichen, erwartet ${fmt.len} fuer ${country}` };
  }

  if (!/^[A-Z0-9]+$/.test(iban.slice(4))) {
    return { valid: false, error: 'BBAN enthaelt ungueltige Zeichen' };
  }

  if (!/^\d{2}$/.test(iban.slice(2, 4))) {
    return { valid: false, error: 'Pruefziffern ungueltig' };
  }

  const remainder = mod97(_numericIban(iban));
  if (remainder !== 1) {
    return { valid: false, error: `Pruefziffernfehler (Modulo 97 = ${remainder}, erwartet 1)` };
  }

  const result = {
    valid: true,
    iban,
    country,
    checkDigits: iban.slice(2, 4),
    bban: iban.slice(4)
  };

  // Deutsche IBANs: Kontonummer-Prüfziffer via ibantools-germany validieren
  if (country === 'DE') {
    result.blz = result.bban.slice(0, 8);
    result.konto = result.bban.slice(8).replace(/^0+/, '') || '0';

    const { banks } = require('../generators/identity_generator');
    const bankInfo = banks[result.blz];

    if (!bankInfo) {
      return {
        ...result,
        valid: false,
        error: `BLZ ${result.blz} ist unbekannt. (Nicht in BLZ.xml vorhanden)`
      };
    }
    
    if (!bankInfo[0] || bankInfo[0].trim() === '') {
      return {
        ...result,
        valid: false,
        error: 'Bank existiert nicht'
      };
    }

    const kontoValid = isValidGermanIBAN(iban);
    if (!kontoValid) {
      return {
        ...result,
        valid: false,
        error: 'Kontonummer-Pruefziffer ungueltig (deutsche Bankdaten)'
      };
    }
    
    result.bankname = bankInfo[0];
    result.bic = bankInfo[1] || '';
    result.method = bankInfo[2] || '';
    result.plz = bankInfo[3] || '';
    result.city = bankInfo[4] || '';
  }

  return result;
}

function breakdownIban(raw) {
  return validateIban(raw);
}

function calculateCheckDigits(country, bban) {
  const cc = (country || '').toUpperCase();
  const b = (bban || '').toUpperCase().replace(/\s/g, '');
  if (!IBAN_FORMATS[cc]) return { ok: false, error: `Laenderkennung ${cc} unbekannt` };
  const trial = `${cc}00${b}`;
  const r = mod97(_numericIban(trial));
  const digits = String(98 - r).padStart(2, '0');
  return { ok: true, iban: `${cc}${digits}${b}` };
}

// DE-specific: BLZ (8 digits) + Konto (up to 10 digits) -> IBAN 
function ibanFromDe(blz, konto) {
  const b = (blz || '').replace(/\s/g, '');
  const k = (konto || '').replace(/\s/g, '');
  if (!/^\d{8}$/.test(b)) return { ok: false, error: 'BLZ muss 8 Ziffern haben' };
  if (!/^\d{1,10}$/.test(k)) return { ok: false, error: 'Kontonummer muss 1-10 Ziffern haben' };
  const bban = b + k.padStart(10, '0');
  return calculateCheckDigits('DE', bban);
}

function batchValidate(list) {
  return list.map(raw => ({ input: raw, ...validateIban(raw) }));
}

module.exports = {
  IBAN_FORMATS,
  validateIban,
  calculateCheckDigits,
  ibanFromDe,
  breakdownIban,
  batchValidate
};