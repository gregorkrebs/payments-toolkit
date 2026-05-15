'use strict';
// CAMT.053 (C53) Parser — supports v02 and v08, single and multi-statement files
const xml2js = require('xml2js');

const NS_CAMT053 = [
  'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02',
  'urn:iso:std:iso:20022:tech:xsd:camt.053.001.08',
  'urn:iso:std:iso:20022:tech:xsd:camt.053.001.11',
];

function _v(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur) return undefined;
    cur = Array.isArray(cur[k]) ? cur[k][0] : cur[k];
  }
  if (cur && typeof cur === 'object' && '_' in cur) return cur._;
  if (cur && typeof cur === 'object' && '$' in cur) return cur;
  return cur;
}

function _arr(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur) return [];
    cur = cur[k];
  }
  return Array.isArray(cur) ? cur : (cur ? [cur] : []);
}

function parseAmt(obj) {
  if (!obj) return { value: 0, ccy: '' };
  if (typeof obj === 'string') return { value: parseFloat(obj) || 0, ccy: '' };
  if (obj['_']) return { value: parseFloat(obj['_']) || 0, ccy: (obj['$'] && obj['$']['Ccy']) || '' };
  if (Array.isArray(obj) && obj[0]) return parseAmt(obj[0]);
  return { value: 0, ccy: '' };
}

function parseBal(balArr) {
  return _arr({ x: balArr }, 'x').map(b => {
    const tp   = _v(b, 'Tp', 'CdOrPrtry', 'Cd') || _v(b, 'Tp', 'CdOrPrtry', 'Prtry') || '';
    const sub  = _v(b, 'Tp', 'SubTp', 'CdOrPrtry', 'Cd') || '';
    const amt  = parseAmt(_v(b, 'Amt'));
    const cdt  = _v(b, 'CdtDbtInd') || '';
    const dt   = _v(b, 'Dt', 'Dt') || _v(b, 'Dt', 'DtTm') || '';
    return { type: tp, subType: sub, amount: cdt === 'DBIT' ? -amt.value : amt.value, currency: amt.ccy, indicator: cdt, date: dt };
  });
}

function parseNtry(ntry) {
  const amt    = parseAmt(_v(ntry, 'Amt'));
  const cdtDbt = _v(ntry, 'CdtDbtInd') || '';
  const sts    = _v(ntry, 'Sts', 'Cd') || _v(ntry, 'Sts') || '';
  const bookDt = _v(ntry, 'BookgDt', 'Dt') || _v(ntry, 'BookgDt', 'DtTm') || '';
  const valDt  = _v(ntry, 'ValDt', 'Dt')   || _v(ntry, 'ValDt', 'DtTm')  || '';
  const acctSvcrRef = _v(ntry, 'AcctSvcrRef') || '';
  const ntryRef     = _v(ntry, 'NtryRef')     || '';
  const reversal    = _v(ntry, 'RvslInd')     || false;
  const bankTxCd    = _v(ntry, 'BkTxCd', 'Domn', 'Cd') || _v(ntry, 'BkTxCd', 'Prtry', 'Cd') || '';
  const addtlNtryInf = _v(ntry, 'AddtlNtryInf') || '';
  const isCredit = cdtDbt === 'CRDT';
  const isDebit  = cdtDbt === 'DBIT';
  const amountSigned = isCredit ? amt.value : -amt.value;

  const txDetails = _arr(ntry, 'NtryDtls', '0', 'TxDtls') || _arr({ x: ntry['NtryDtls'] }, 'x', '0', 'TxDtls');
  let verwendungszweck = '', gegenkontoIban = '', gegenkontoName = '', endToEndId = '', mandateId = '';

  // Try to extract from first TxDtls
  const firstTxDtls = Array.isArray(ntry['NtryDtls']) && ntry['NtryDtls'][0]
    ? (Array.isArray(ntry['NtryDtls'][0]['TxDtls']) ? ntry['NtryDtls'][0]['TxDtls'][0] : null) : null;

  // Helper: unwrap xml2js charkey objects to plain strings
  function strVal(x) {
    if (x === null || x === undefined) return '';
    if (typeof x === 'string') return x;
    if (typeof x === 'object' && '_' in x) return String(x._);
    return String(x);
  }

  if (firstTxDtls) {
    const rmtInf = firstTxDtls['RmtInf'];
    if (rmtInf) {
      const ustrd = _arr(rmtInf[0] || rmtInf, 'Ustrd');
      verwendungszweck = ustrd.map(strVal).filter(Boolean).join(' ');
      if (!verwendungszweck) {
        const strd = _arr(rmtInf[0] || rmtInf, 'Strd');
        if (strd.length) {
          const crd = _v(strd[0], 'CdtrRefInf', 'Ref');
          verwendungszweck = crd || '';
        }
      }
    }
    endToEndId = _v(firstTxDtls, 'Refs', 'EndToEndId') || '';
    mandateId  = _v(firstTxDtls, 'Refs', 'MndtId')     || '';
    const rltdPties = firstTxDtls['RltdPties'] ? firstTxDtls['RltdPties'][0] : null;
    if (rltdPties) {
      gegenkontoName = isCredit
        ? (_v(rltdPties, 'Dbtr', 'Nm') || _v(rltdPties, 'Dbtr', 'Pty', 'Nm') || '')
        : (_v(rltdPties, 'Cdtr', 'Nm') || _v(rltdPties, 'Cdtr', 'Pty', 'Nm') || '');
      const acct = isCredit
        ? (_v(rltdPties, 'DbtrAcct', 'Id', 'IBAN') || '')
        : (_v(rltdPties, 'CdtrAcct', 'Id', 'IBAN') || '');
      gegenkontoIban = acct;
    }
  }

  return {
    amount: amt.value, currency: amt.ccy, amountSigned, isCredit, isDebit,
    indicator: cdtDbt, status: sts, bookDate: bookDt, valDate: valDt,
    acctSvcrRef, ntryRef, reversal: !!reversal, bankTxCode: bankTxCd,
    verwendungszweck, addtlNtryInf, gegenkontoIban, gegenkontoName, endToEndId, mandateId
  };
}

function parseStmt(stmt) {
  const id     = _v(stmt, 'Id')           || '';
  const elctSeqNb = _v(stmt, 'ElctrncSeqNb') || '';
  const creDtTm   = _v(stmt, 'CreDtTm')      || '';
  const frDt      = _v(stmt, 'FrToDt', 'FrDtTm') || _v(stmt, 'FrToDt', 'FrDt') || '';
  const toDt      = _v(stmt, 'FrToDt', 'ToDtTm') || _v(stmt, 'FrToDt', 'ToDt') || '';
  const iban      = _v(stmt, 'Acct', 'Id', 'IBAN')  || '';
  const othrId    = _v(stmt, 'Acct', 'Id', 'Othr', 'Id') || '';
  const ccy       = _v(stmt, 'Acct', 'Ccy') || '';
  const acctNm    = _v(stmt, 'Acct', 'Nm')  || '';
  const svcr      = _v(stmt, 'Acct', 'Svcr', 'FinInstnId', 'BICFI') || _v(stmt, 'Acct', 'Svcr', 'FinInstnId', 'Nm') || '';
  const balances  = parseBal(stmt['Bal']);
  const entries   = _arr(stmt, 'Ntry').map(parseNtry);

  const credits = entries.filter(e => e.isCredit);
  const debits  = entries.filter(e => e.isDebit);
  const summary = {
    txCount:     entries.length,
    creditCount: credits.length,
    debitCount:  debits.length,
    creditSum:   credits.reduce((s,e) => s + e.amount, 0),
    debitSum:    debits.reduce((s,e)  => s + e.amount, 0),
  };

  const opbdBal  = balances.find(b => b.type === 'OPBD');
  const clbdBal  = balances.find(b => b.type === 'CLBD');
  const openingBalance  = opbdBal  ? { amount: Math.abs(opbdBal.amount),  currency: opbdBal.currency,  indicator: opbdBal.indicator === 'CRDT' ? 'C' : opbdBal.indicator === 'DBIT' ? 'D' : opbdBal.indicator,  date: opbdBal.date  } : null;
  const closingBalance  = clbdBal  ? { amount: Math.abs(clbdBal.amount),  currency: clbdBal.currency,  indicator: clbdBal.indicator === 'CRDT' ? 'C' : clbdBal.indicator === 'DBIT' ? 'D' : clbdBal.indicator,  date: clbdBal.date  } : null;
  return { id, elctSeqNb, creDtTm, frDt, toDt, iban: iban || othrId, currency: ccy, accountName: acctNm, servicer: svcr, balances, openingBalance, closingBalance, transactions: entries, summary };
}

async function parseCamt053(xmlStr) {
  let doc;
  try {
    doc = await xml2js.parseStringPromise(xmlStr, { explicitCharkey: true, explicitArray: true, mergeAttrs: false });
  } catch(e) {
    return { ok: false, error: `XML-Parsefehler: ${e.message}` };
  }
  const root  = doc['Document'];
  if (!root)  return { ok: false, error: 'Root-Element "Document" fehlt' };
  const bkToCstmrStmt = root['BkToCstmrStmt'];
  if (!bkToCstmrStmt || !bkToCstmrStmt[0]) return { ok: false, error: 'BkToCstmrStmt fehlt' };
  const bk    = bkToCstmrStmt[0];
  const grpHdr= bk['GrpHdr'] ? bk['GrpHdr'][0] : {};
  const msgId = _v(grpHdr, 'MsgId') || '';
  const creDtTm = _v(grpHdr, 'CreDtTm') || '';
  const stmts = _arr(bk, 'Stmt').map(parseStmt);
  // Detect version from namespace
  let version = 'camt.053.unknown';
  const xmlHead = xmlStr.slice(0, 500);
  for (const ns of NS_CAMT053) {
    if (xmlHead.includes(ns)) { version = ns.split(':').pop(); break; }
  }
  return { ok: true, format: 'C53', version, msgId, creDtTm, stmtCount: stmts.length, statements: stmts };
}

module.exports = { parseCamt053, parseStmt, parseNtry };
