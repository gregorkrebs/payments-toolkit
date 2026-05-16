'use strict';
// C53 (CAMT.053) -> STA (MT940) Converter
// Format follows the same rules as generateSTA() in routes/api_samples.js

function fmtAmt(v) {
  return Math.abs(parseFloat(v) || 0).toFixed(2).replace('.', ',');
}

function fmtDate6(isoDate) {
  if (!isoDate) return '010101';
  const d = String(isoDate).slice(0, 10).replace(/-/g, '');
  return d.length >= 8 ? d.slice(2, 8) : d.slice(0, 6);
}

function fmtDate4(isoDate) {
  if (!isoDate) return '0101';
  const d = String(isoDate).slice(0, 10).replace(/-/g, '');
  return d.length >= 8 ? d.slice(4, 8) : '0101';
}

function isGermanIban(iban) {
  return /^DE\d{20}$/.test((iban || '').replace(/\s/g, '').toUpperCase());
}

function ibanToBlzKonto(iban) {
  const clean = (iban || '').replace(/\s/g, '').toUpperCase();
  if (/^DE\d{20}$/.test(clean)) {
    const blz   = clean.slice(4, 12);
    const konto = clean.slice(12, 22).replace(/^0+/, '') || '0';
    return { blz, konto };
  }
  return { blz: '', konto: '' };
}

function splitInto27(str, max) {
  const chunks = [];
  for (let i = 0; i < str.length && chunks.length < max; i += 27) {
    chunks.push(str.slice(i, i + 27));
  }
  return chunks;
}

function wrap65(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 65) out.push(str.slice(i, i + 65));
  return out.join('\r\n');
}

function balLine(tag, bal) {
  if (!bal) return '';
  const ind = bal.indicator === 'CRDT' ? 'C' : bal.indicator === 'DBIT' ? 'D' : (bal.amount >= 0 ? 'C' : 'D');
  const dt  = fmtDate6(bal.date);
  const ccy = (bal.currency || 'EUR').slice(0, 3);
  const amt = fmtAmt(Math.abs(bal.amount));
  return `:${tag}:${ind}${dt}${ccy}${amt}`;
}

function stmtToMt940(stmt, idx) {
  const iban = (stmt.iban || '').replace(/\s/g, '').toUpperCase();
  const ccy  = stmt.currency || stmt.openingBalance?.currency || 'EUR';

  // :25: uses BLZ/KONTONR for German IBANs (Multicash requirement)
  const { blz, konto } = ibanToBlzKonto(iban);
  const acctId = blz && konto ? `${blz}/${konto}` : iban;

  const refNum = (stmt.referenceNumber || stmt.id || `STMT${String(idx + 1).padStart(6, '0')}`).slice(0, 16);
  const seqNb  = stmt.elctSeqNb || String(idx + 1).padStart(5, '0');

  const lines = [];
  lines.push(`:20:${refNum}`);
  lines.push(`:21:NONREF`);
  lines.push(`:25:${acctId}`);
  lines.push(`:28C:${seqNb}/001`);

  if (stmt.openingBalance) {
    lines.push(balLine('60F', stmt.openingBalance));
  } else {
    const openInd = 'C';
    lines.push(`:60F:${openInd}${fmtDate6(stmt.frDt || '')}${ccy}0,00`);
  }

  const txList = stmt.transactions || [];
  txList.forEach((tx, txIdx) => {
    const isCredit  = tx.isCredit !== undefined ? tx.isCredit : (tx.dcMark || '').startsWith('C');
    const dcSta     = isCredit ? 'C' : 'D';
    const valDt     = fmtDate6(tx.valDate || tx.bookDate);
    const bookDtStr = tx.bookDate ? fmtDate4(tx.bookDate) : '';
    const amt       = fmtAmt(tx.amount);
    const ref       = (tx.ntryRef || tx.acctSvcrRef || `REF${String(txIdx + 1).padStart(5, '0')}`).slice(0, 16);
    const bankRef   = (tx.acctSvcrRef || tx.endToEndId || `BNK${String(txIdx + 1).padStart(8, '0')}`).slice(0, 16);

    lines.push(`:61:${valDt}${bookDtStr}${dcSta}${amt}NTRF${ref}//${bankRef}`);

    const gvc      = tx.gvc || '051';
    const bucht    = (tx.buchungstext || 'SEPA').slice(0, 27);
    const primanota = String(txIdx + 1).padStart(6, '0');
    const eref     = (tx.endToEndId || `EREF${String(txIdx + 1).padStart(6, '0')}`);
    const purp     = tx.verwendungszweck || tx.remittanceInfo || '';
    const cName    = tx.gegenkontoName || tx.counterpartName || '';
    const cIban    = (tx.gegenkontoIban || tx.counterpartIban || '').replace(/\s/g, '').toUpperCase();

    let tag86 = `${gvc}?00${bucht}?10${primanota}`;

    // Strukturierter Verwendungszweck nach DFÜ-Abkommen Anlage 3
    const svwzParts = [];
    svwzParts.push(`EREF+${eref}`);
    if (tx.mandateId)  svwzParts.push(`MREF+${tx.mandateId}`);
    if (tx.creditorId) svwzParts.push(`CRED+${tx.creditorId}`);
    if (purp)          svwzParts.push(`SVWZ+${purp}`);
    const fullPurp = svwzParts.join(' ');
    splitInto27(fullPurp, 10).forEach((chunk, i) => { tag86 += `?${20 + i}${chunk}`; });

    // ?30 BLZ / ?31 Kontonummer für deutsche IBANs; IBAN direkt für ausländische
    if (isGermanIban(cIban)) {
      const { blz: cBlz, konto: cKto } = ibanToBlzKonto(cIban);
      tag86 += `?30${cBlz}`;
      tag86 += `?31${cKto}`;
    } else if (cIban) {
      const cBic = (tx.gegenkontoBic || tx.counterpartBic || '').slice(0, 11);
      if (cBic) tag86 += `?30${cBic}`;
      tag86 += `?31${cIban.slice(0, 34)}`;
    }

    // ?32 immer setzen (Multicash erkennt SEPA-Umsatz sonst nicht), max 27 Zeichen
    if (cName) {
      tag86 += `?32${cName.slice(0, 27)}`;
      if (cName.length > 27) tag86 += `?33${cName.slice(27, 54)}`;
    }

    lines.push(wrap65(`:86:${tag86}`));
  });

  if (stmt.closingBalance) {
    lines.push(balLine('62F', stmt.closingBalance));
  } else {
    lines.push(`:62F:C${fmtDate6(stmt.toDt || '')}${ccy}0,00`);
  }

  if (stmt.availableBalance) lines.push(balLine('64', stmt.availableBalance));
  lines.push('-');
  return lines.join('\r\n');
}

function camt053ToSta(parsed) {
  const statements = parsed.statements || [parsed];
  return statements.map((s, i) => stmtToMt940(s, i)).join('\r\n') + '\r\n';
}

module.exports = { camt053ToSta };
