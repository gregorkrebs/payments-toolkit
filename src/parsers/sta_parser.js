'use strict';
// MT940 / STA Parser
// Supports multi-statement files (multiple :20: blocks)

function parseDate6(d) {
  if (!d || d.length < 6) return d || '';
  const yy = d.slice(0, 2), mm = d.slice(2, 4), dd = d.slice(4, 6);
  const year = parseInt(yy) > 50 ? '19' + yy : '20' + yy;
  return `${year}-${mm}-${dd}`;
}

function parseDate8(d) {
  if (!d || d.length < 8) return d || '';
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}

function parseAmount(s) {
  if (!s) return 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function parseBalance(raw) {
  // Format: C/D YYMMDD EUR 1234,56
  const m = raw.match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)$/);
  if (!m) return { indicator: '', date: '', currency: '', amount: 0, raw };
  return {
    indicator: m[1], // C = credit, D = debit
    date:      parseDate6(m[2]),
    currency:  m[3],
    amount:    parseAmount(m[4]),
    raw
  };
}

function parseTx61(raw) {
  // :61: YYMMDD[MMDD]C/D[R]EUR<amount>N<code>[<ref>][//<bankref>]
  const m = raw.match(/^(\d{6})(\d{4})?([CD]R?)([A-Z]{3})?([\d,]+)N([A-Z0-9]{3})(.*?)?(\/\/(.+?))?(\r?\n(.*))?$/);
  if (!m) {
    // Fallback: try simple parse
    const m2 = raw.match(/^(\d{6})(\d{4})?([CD]R?)([\d,]+)/);
    if (!m2) return { raw, valDate: '', bookDate: '', dcMark: '', amount: 0, bookCode: '', reference: '', bankRef: '' };
    return {
      raw, valDate: parseDate6(m2[1]), bookDate: m2[2] ? parseDate6(m2[1].slice(0,2) + m2[2]) : '',
      dcMark: m2[3], amount: parseAmount(m2[4]), bookCode: '', reference: '', bankRef: ''
    };
  }
  return {
    raw,
    valDate:   parseDate6(m[1]),
    bookDate:  m[2] ? parseDate6(m[1].slice(0,2) + m[2]) : '',
    dcMark:    m[3],
    currency:  m[4] || '',
    amount:    parseAmount(m[5]),
    bookCode:  m[6] || '',
    reference: (m[7] || '').trim(),
    bankRef:   (m[9] || '').trim(),
    infoLine:  (m[11] || '').trim()
  };
}

function parseTag86(raw) {
  // :86: GVC Buchungstext Gegenkonto Name Verwendungszweck
  // SWIFT subfield pattern: /CODE/value
  const result = { raw, gvc: '', text: '', fields: {} };
  const lines = raw.replace(/\r/g,'').split('\n');
  const full  = lines.join(' ');
  // Extract GVC (3 chars at start)
  if (/^\d{3}/.test(full)) { result.gvc = full.slice(0,3); }
  // Parse structured subfields like ?00 ?10 ?20 etc (DTA-style)
  const dtaMatch = full.match(/\?(\d{2})([^?]*)/g);
  if (dtaMatch) {
    dtaMatch.forEach(chunk => {
      const code = chunk.slice(1,3);
      const val  = chunk.slice(3).trim();
      result.fields[code] = val;
    });
    result.buchungstext    = result.fields['00'] || '';
    result.primanota       = result.fields['10'] || '';
    result.verwendungszweck= [result.fields['20'],result.fields['21'],result.fields['22'],result.fields['23'],result.fields['24'],result.fields['25'],result.fields['26'],result.fields['27'],result.fields['28'],result.fields['29']].filter(Boolean).join('');
    result.blz             = result.fields['30'] || '';
    result.kontoNr         = result.fields['31'] || '';
    result.gegenkontoName  = result.fields['32'] || '' + (result.fields['33'] || '');
    result.eref            = result.fields['34'] || '';
  } else {
    result.text = full.slice(3).trim();
    result.verwendungszweck = result.text;
  }
  return result;
}

function splitIntoStatements(text) {
  // A file can contain multiple statements (:20: marks a new statement)
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Split on lines starting with :20:
  const parts = normalized.split(/(?=^:20:)/m);
  return parts.filter(p => p.trim().length > 0);
}

function parseSingleStatement(text) {
  // Collapse multi-line tag values: lines NOT starting with : are continuations
  const lines = text.split('\n');
  const tags  = [];
  let cur     = null;
  for (const line of lines) {
    if (/^:\d{2}[A-Z]?:/.test(line) || /^:62[FM]:/.test(line) || /^:64:/.test(line) || /^:65:/.test(line)) {
      if (cur) tags.push(cur);
      const colonEnd = line.indexOf(':', 1);
      cur = { tag: line.slice(1, colonEnd), value: line.slice(colonEnd + 1) };
    } else if (cur && line.trim() && !line.startsWith('-')) {
      cur.value += '\n' + line;
    }
  }
  if (cur) tags.push(cur);

  const stmt      = { transactions: [] };
  let pendingTx   = null;

  for (const { tag, value } of tags) {
    const v = value.trim();
    switch (tag) {
      case '20':  stmt.referenceNumber = v; break;
      case '21':  stmt.relatedRef      = v; break;
      case '25':  { const p = v.split('/'); stmt.iban = p[0].trim(); stmt.currency = p[1] ? p[1].trim() : ''; break; }
      case '28C': { const p = v.split('/'); stmt.statementNumber = p[0]; stmt.sequenceNumber = p[1] || ''; break; }
      case '60F': case '60M': stmt.openingBalance   = parseBalance(v); break;
      case '62F': case '62M': stmt.closingBalance   = parseBalance(v); break;
      case '64':  stmt.availableBalance = parseBalance(v); break;
      case '65':  stmt.futureBalance    = parseBalance(v); break;
      case '61':
        if (pendingTx) stmt.transactions.push(pendingTx);
        pendingTx = { ...parseTx61(v), details: null };
        break;
      case '86':
        if (pendingTx) { pendingTx.details = parseTag86(v); }
        else { stmt.information = v; }
        break;
    }
  }
  if (pendingTx) stmt.transactions.push(pendingTx);

  // Enrich transactions with derived fields
  stmt.transactions.forEach(tx => {
    tx.isCredit  = tx.dcMark && tx.dcMark.startsWith('C');
    tx.isDebit   = tx.dcMark && tx.dcMark.startsWith('D');
    tx.amountSigned = tx.isCredit ? tx.amount : -tx.amount;
    tx.gegenkontoIban  = tx.details?.kontoNr || '';
    tx.gegenkontoName  = tx.details?.gegenkontoName || '';
    tx.verwendungszweck= tx.details?.verwendungszweck || tx.details?.text || '';
    tx.buchungstext    = tx.details?.buchungstext || '';
    tx.gvc             = tx.details?.gvc || '';
  });

  // Summary
  const credits = stmt.transactions.filter(t => t.isCredit);
  const debits  = stmt.transactions.filter(t => t.isDebit);
  stmt.summary  = {
    txCount:     stmt.transactions.length,
    creditCount: credits.length,
    debitCount:  debits.length,
    creditSum:   credits.reduce((s,t) => s + t.amount, 0),
    debitSum:    debits.reduce((s,t)  => s + t.amount, 0),
  };

  return stmt;
}

function parseSta(text) {
  const parts = splitIntoStatements(text);
  const statements = parts.map(parseSingleStatement).filter(s => s.iban || s.transactions.length > 0);
  return { format: 'STA', stmtCount: statements.length, statements };
}

module.exports = { parseSta, parseSingleStatement, parseDate6, parseBalance, parseTx61, parseTag86 };
