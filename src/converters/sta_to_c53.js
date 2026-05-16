'use strict';
// STA (MT940) -> CAMT.053.001.08 Converter
// XML structure follows generateC53ForDay() in routes/api_samples.js

const { v4: uuidv4 } = require('uuid');
const { ibanFromDe } = require('../validators/iban_validator');

const NS = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.08';

// Lazy-loaded BLZ→BIC lookup table built from BLZ.xml (same source as identity_generator)
let _blzToBic = null;
function getBlzToBic() {
  if (_blzToBic) return _blzToBic;
  try {
    const path = require('path');
    const { XMLParser } = require('fast-xml-parser');
    const fs = require('fs');
    const xml = fs.readFileSync(path.join(__dirname, '../generators/BLZ.xml'), 'utf8');
    const doc = new XMLParser({ ignoreAttributes: true }).parse(xml);
    _blzToBic = {};
    for (const e of (doc.Document?.BLZEintrag || [])) {
      if ((e.BLZLoesch === 1 || e.BLZLoesch === '1') || String(e.Merkmal) !== '1' || !e.BIC) continue;
      _blzToBic[String(e.BLZ)] = String(e.BIC);
    }
  } catch (_) {
    _blzToBic = {};
  }
  return _blzToBic;
}

function bicForIban(iban) {
  if (!iban || !/^DE\d{20}$/.test(iban)) return '';
  const blz = iban.slice(4, 12);
  return getBlzToBic()[blz] || '';
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isoDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  if (/^\d{6}$/.test(d)) {
    const yy = d.slice(0, 2), mm = d.slice(2, 4), dd = d.slice(4, 6);
    return `${parseInt(yy) > 50 ? '19' : '20'}${yy}-${mm}-${dd}`;
  }
  return d;
}

function txXml(tx, idx, stmtDate, ccy) {
  const isCredit = tx.isCredit !== undefined ? tx.isCredit : (tx.dcMark || '').startsWith('C');
  const dcC53    = isCredit ? 'CRDT' : 'DBIT';
  const amt      = Math.abs(tx.amount || 0).toFixed(2);
  const txCcy    = esc(tx.currency || ccy || 'EUR');
  const bookDt   = isoDate(tx.bookDate || tx.valDate || stmtDate);
  const valDt    = isoDate(tx.valDate  || tx.bookDate || stmtDate);
  const svcrRef  = esc(tx.bankRef || tx.acctSvcrRef || `SVC${String(idx + 1).padStart(8, '0')}`);
  const e2e      = esc(tx.endToEndId || 'NOTPROVIDED');
  const purp     = esc((tx.verwendungszweck || tx.details?.verwendungszweck || '').slice(0, 140));
  const cName    = esc((tx.gegenkontoName   || tx.details?.gegenkontoName   || '').slice(0, 70));
  const cBic     = esc((tx.gegenkontoBic    || '').slice(0, 11));
  const fmlyCd   = isCredit ? 'RCDT' : 'ICDT';

  // ?31 in STA contains IBAN for modern files, or Kontonummer for legacy files.
  // ?30 contains BLZ (8 digits) for legacy or BIC for modern — never use a BLZ as BICFI.
  let cIbanRaw = (tx.gegenkontoIban || tx.details?.kontoNr || '').replace(/\s/g, '').toUpperCase();
  if (cIbanRaw && !/^[A-Z]{2}\d{2}/.test(cIbanRaw)) {
    // Looks like a bare Kontonummer — try to reconstruct IBAN from BLZ (?30) + Konto (?31)
    const blzRaw = (tx.details?.blz || '').replace(/\s/g, '');
    if (/^\d{8}$/.test(blzRaw) && /^\d{1,10}$/.test(cIbanRaw)) {
      const r = ibanFromDe(blzRaw, cIbanRaw);
      if (r.ok) cIbanRaw = r.iban;
      else cIbanRaw = '';  // unusable — omit rather than put garbage in <IBAN>
    } else {
      cIbanRaw = '';
    }
  }
  const cIban = esc(cIbanRaw.slice(0, 34));

  const ptiesContent = isCredit
    ? `${cName ? `<Dbtr><Pty><Nm>${cName}</Nm></Pty></Dbtr>` : ''}${cIban ? `<DbtrAcct><Id><IBAN>${cIban}</IBAN></Id></DbtrAcct>` : ''}`
    : `${cName ? `<Cdtr><Pty><Nm>${cName}</Nm></Pty></Cdtr>` : ''}${cIban ? `<CdtrAcct><Id><IBAN>${cIban}</IBAN></Id></CdtrAcct>` : ''}`;
  const rltdPties = ptiesContent ? `\n        <RltdPties>${ptiesContent}</RltdPties>` : '';

  const rltdAgts = cBic
    ? (isCredit
        ? `\n        <RltdAgts><DbtrAgt><FinInstnId><BICFI>${cBic}</BICFI></FinInstnId></DbtrAgt></RltdAgts>`
        : `\n        <RltdAgts><CdtrAgt><FinInstnId><BICFI>${cBic}</BICFI></FinInstnId></CdtrAgt></RltdAgts>`)
    : '';

  const rmtInf = purp ? `\n        <RmtInf><Ustrd>${purp}</Ustrd></RmtInf>` : '';

  return `    <Ntry>
      <Amt Ccy="${txCcy}">${amt}</Amt>
      <CdtDbtInd>${dcC53}</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>${bookDt}</Dt></BookgDt>
      <ValDt><Dt>${valDt}</Dt></ValDt>
      <AcctSvcrRef>${svcrRef}</AcctSvcrRef>
      <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${fmlyCd}</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
      <NtryDtls>
        <TxDtls>
          <Refs><EndToEndId>${e2e}</EndToEndId></Refs>
          <Amt Ccy="${txCcy}">${amt}</Amt>
          <CdtDbtInd>${dcC53}</CdtDbtInd>${rltdPties}${rltdAgts}${rmtInf}
        </TxDtls>
      </NtryDtls>
    </Ntry>`;
}

function stmtXml(stmt, idx) {
  const now      = new Date().toISOString().slice(0, 19);
  const stmtId   = esc(stmt.referenceNumber || `STMT-${uuidv4().slice(0, 8).toUpperCase()}`);
  const seqNb    = esc(stmt.statementNumber || String(idx + 1));

  // :25: in STA can be BLZ/KONTONR instead of IBAN — reconstruct IBAN if needed
  let resolvedIban = (stmt.iban || '').replace(/\s/g, '');
  if (!resolvedIban && stmt.blz && stmt.konto) {
    const result = ibanFromDe(stmt.blz, stmt.konto);
    if (result.ok) resolvedIban = result.iban;
  }
  const iban     = esc(resolvedIban);
  const bic      = esc(bicForIban(resolvedIban));
  const ccy      = esc(stmt.currency || stmt.openingBalance?.currency || 'EUR');

  // Derive a representative date for the statement from balances or transactions
  const stmtDate = stmt.openingBalance?.date
    || stmt.closingBalance?.date
    || stmt.transactions?.[0]?.bookDate
    || new Date().toISOString().slice(0, 10);
  const frDt = isoDate(stmt.frDt || stmtDate);
  const toDt = isoDate(stmt.toDt || stmtDate);

  const openBal  = stmt.openingBalance;
  const closBal  = stmt.closingBalance;
  const openInd  = openBal ? (openBal.indicator === 'C' ? 'CRDT' : 'DBIT') : 'CRDT';
  const closeInd = closBal ? (closBal.indicator === 'C' ? 'CRDT' : 'DBIT') : 'CRDT';
  const openAmt  = openBal ? Math.abs(openBal.amount).toFixed(2) : '0.00';
  const closeAmt = closBal ? Math.abs(closBal.amount).toFixed(2) : '0.00';
  const openDt   = isoDate(openBal?.date || frDt);
  const closeDt  = isoDate(closBal?.date || toDt);

  const entries = (stmt.transactions || []).map((tx, i) => txXml(tx, i, stmtDate, ccy)).join('\n');

  return `    <Stmt>
      <Id>${stmtId}</Id>
      <ElctrncSeqNb>${seqNb}</ElctrncSeqNb>
      <CreDtTm>${now}</CreDtTm>
      <FrToDt>
        <FrDtTm>${frDt}T00:00:00</FrDtTm>
        <ToDtTm>${toDt}T23:59:59</ToDtTm>
      </FrToDt>
      <Acct>
        <Id><IBAN>${iban}</IBAN></Id>
        <Ccy>${ccy}</Ccy>${bic ? `\n        <Svcr><FinInstnId><BICFI>${bic}</BICFI></FinInstnId></Svcr>` : ''}
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${openAmt}</Amt>
        <CdtDbtInd>${openInd}</CdtDbtInd>
        <Dt><Dt>${openDt}</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${closeAmt}</Amt>
        <CdtDbtInd>${closeInd}</CdtDbtInd>
        <Dt><Dt>${closeDt}</Dt></Dt>
      </Bal>
${entries}
    </Stmt>`;
}

function staToCamt053(parsed) {
  const msgId   = `C53-${uuidv4().slice(0, 8).toUpperCase()}`;
  const now     = new Date().toISOString().slice(0, 19);
  const stmts   = (parsed.statements || [parsed]).map((s, i) => stmtXml(s, i)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${NS}">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
    </GrpHdr>
${stmts}
  </BkToCstmrStmt>
</Document>`;
}

module.exports = { staToCamt053 };
