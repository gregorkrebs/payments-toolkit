'use strict';
// C53 (CAMT.053) or C53-XML -> STA (MT940) Converter

function fmtAmt(v) {
  if (isNaN(v) || v === null || v === undefined) return '0,00';
  return Math.abs(v).toFixed(2).replace('.', ',');
}

function fmtDate6(isoDate) {
  if (!isoDate) return '010101';
  const d = isoDate.slice(0,10).replace(/-/g,'');
  if (d.length >= 8) return d.slice(2,8); // YYMMDD
  return d.slice(0,6);
}

function fmtDate4(isoDate) {
  if (!isoDate) return '0101';
  const d = isoDate.slice(0,10).replace(/-/g,'');
  if (d.length >= 8) return d.slice(4,8); // MMDD
  return '0101';
}

function balLine(tag, bal) {
  if (!bal) return '';
  const ind = bal.indicator === 'CRDT' ? 'C' : bal.indicator === 'DBIT' ? 'D' : (bal.amount >= 0 ? 'C' : 'D');
  const dt  = fmtDate6(bal.date);
  const ccy = (bal.currency || 'EUR').slice(0,3);
  const amt = fmtAmt(Math.abs(bal.amount));
  return `:${tag}:${ind}${dt}${ccy}${amt}`;
}

function stmtToMt940(stmt, idx) {
  const lines = [];
  const refNum  = stmt.referenceNumber || stmt.id || `STMT${String(idx+1).padStart(6,'0')}`;
  const iban    = stmt.iban || '';
  const ccy     = stmt.currency || (stmt.openingBalance?.currency) || 'EUR';
  lines.push(`:20:${refNum.slice(0,16)}`);
  lines.push(`:25:${iban}/${ccy}`);
  lines.push(`:28C:${stmt.elctSeqNb || String(idx+1).padStart(5,'0')}/00`);

  // Opening balance
  if (stmt.openingBalance) {
    lines.push(balLine('60F', stmt.openingBalance));
  } else {
    lines.push(`:60F:C${fmtDate6(stmt.frDt || '')}${ccy}0,00`);
  }

  // Transactions
  for (const tx of (stmt.transactions || [])) {
    const ind    = tx.isCredit ? 'C' : 'D';
    const valDt  = fmtDate6(tx.valDate || tx.bookDate);
    const bookDt = tx.bookDate ? fmtDate4(tx.bookDate) : '';
    const amt    = fmtAmt(tx.amount);
    const ref    = (tx.ntryRef || tx.acctSvcrRef || 'NONREF').slice(0,16);
    const bankRef= (tx.acctSvcrRef || tx.endToEndId || '').slice(0,16);
    const btCode = (tx.bankTxCode || 'NTR').slice(0,3).padEnd(3,'X');
    let line61   = `:61:${valDt}${bookDt}${ind}${amt}N${btCode}${ref}`;
    if (bankRef) line61 += `//${bankRef}`;
    lines.push(line61);

    // :86: line
    const gvc   = tx.gvc || '999';
    const vwz   = tx.verwendungszweck || '';
    const gkNm  = tx.gegenkontoName || '';
    const gkIban= tx.gegenkontoIban || '';
    let tag86   = `:86:${gvc}`;
    if (vwz || gkNm || gkIban) {
      tag86 += `?00${tx.buchungstext||'SEPA'}`;
      if (vwz) {
        // Split into max 27-char chunks for ?20/?21/...
        for (let i = 0; i < Math.min(vwz.length, 378); i += 27) {
          const code = 20 + Math.floor(i/27);
          tag86 += `?${code}${vwz.slice(i, i+27)}`;
        }
      }
      if (gkIban) tag86 += `?31${gkIban}`;
      if (gkNm)   tag86 += `?32${gkNm.slice(0,27)}`;
    }
    lines.push(tag86);
  }

  // Closing balance
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
  // parsed is result of parseCamt053 or parseC53ArchiveXml
  const statements = parsed.statements || [parsed];
  return statements.map((s,i) => stmtToMt940(s,i)).join('\r\n');
}

module.exports = { camt053ToSta };
