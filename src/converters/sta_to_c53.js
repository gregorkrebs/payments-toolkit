'use strict';
// STA (MT940) -> CAMT.053 XML Converter
const { v4: uuidv4 } = require('uuid');

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isoDate(d) {
  if (!d) return new Date().toISOString().slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
  // Try to parse YYMMDD
  if (/^\d{6}$/.test(d)) {
    const yy = d.slice(0,2), mm = d.slice(2,4), dd = d.slice(4,6);
    return `${parseInt(yy)>50?'19':'20'}${yy}-${mm}-${dd}`;
  }
  return d;
}

function balXml(bal, codeType) {
  if (!bal) return '';
  const cdt    = bal.indicator === 'C' ? 'CRDT' : 'DBIT';
  const amt    = Math.abs(bal.amount).toFixed(2);
  const ccy    = esc(bal.currency || 'EUR');
  const dt     = isoDate(bal.date);
  return `    <Bal>
      <Tp><CdOrPrtry><Cd>${codeType}</Cd></CdOrPrtry></Tp>
      <Amt Ccy="${ccy}">${amt}</Amt>
      <CdtDbtInd>${cdt}</CdtDbtInd>
      <Dt><Dt>${dt}</Dt></Dt>
    </Bal>`;
}

function txXml(tx, idx) {
  const cdt   = tx.isCredit ? 'CRDT' : 'DBIT';
  const amt   = Math.abs(tx.amount).toFixed(2);
  const ccy   = esc(tx.currency || 'EUR');
  const bookDt= isoDate(tx.valDate || tx.bookDate);
  const valDt = isoDate(tx.valDate || tx.bookDate);
  const acctRef= esc(tx.bankRef || tx.reference || `TX-${String(idx+1).padStart(6,'0')}`);
  const ntryRef= esc(tx.reference || '');
  const e2e   = esc(tx.endToEndId || 'NOTPROVIDED');
  const ustrd = esc(tx.verwendungszweck || tx.details?.text || '');
  const cdtrNm= esc(tx.gegenkontoName || '');
  const cdtrIban= esc(tx.gegenkontoIban || '');
  const btCode= esc(tx.bookCode || tx.gvc || '');

  const rltdPties = (cdtrNm || cdtrIban) ? `
              <RltdPties>
                ${tx.isCredit
                  ? `<Dbtr><Pty><Nm>${cdtrNm}</Nm></Pty></Dbtr>
                <DbtrAcct><Id><IBAN>${cdtrIban}</IBAN></Id></DbtrAcct>`
                  : `<Cdtr><Pty><Nm>${cdtrNm}</Nm></Pty></Cdtr>
                <CdtrAcct><Id><IBAN>${cdtrIban}</IBAN></Id></CdtrAcct>`}
              </RltdPties>` : '';

  return `    <Ntry>
      <Amt Ccy="${ccy}">${amt}</Amt>
      <CdtDbtInd>${cdt}</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>${bookDt}</Dt></BookgDt>
      <ValDt><Dt>${valDt}</Dt></ValDt>
      <AcctSvcrRef>${acctRef}</AcctSvcrRef>
      <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>DMCT</SubFmlyCd></Fmly></Domn><Prtry><Cd>${btCode}</Cd></Prtry></BkTxCd>
      <NtryDtls>
        <TxDtls>
          <Refs>
            <EndToEndId>${e2e}</EndToEndId>
          </Refs>${rltdPties}
          <RmtInf>
            <Ustrd>${ustrd}</Ustrd>
          </RmtInf>
        </TxDtls>
      </NtryDtls>
    </Ntry>`;
}

function stmtXml(stmt, idx) {
  const stmtId = esc(stmt.referenceNumber || uuidv4().slice(0,35));
  const seqNb  = esc(stmt.statementNumber || String(idx+1));
  const creDtTm= new Date().toISOString().slice(0,19);
  const iban   = esc(stmt.iban || '');
  const ccy    = esc(stmt.currency || 'EUR');
  const openBal= balXml(stmt.openingBalance,   'OPBD');
  const closBal= balXml(stmt.closingBalance,    'CLBD');
  const avBal  = stmt.availableBalance ? balXml(stmt.availableBalance, 'AVLB') : '';
  const txs    = (stmt.transactions || []).map((tx,i) => txXml(tx, i)).join('\n');
  return `  <Stmt>
    <Id>${stmtId}</Id>
    <ElctrncSeqNb>${seqNb}</ElctrncSeqNb>
    <CreDtTm>${creDtTm}</CreDtTm>
    <Acct>
      <Id><IBAN>${iban}</IBAN></Id>
      <Ccy>${ccy}</Ccy>
    </Acct>
${openBal}
${closBal}
${avBal}
${txs}
  </Stmt>`;
}

function staToCamt053(parsed) {
  const msgId  = uuidv4().slice(0,35);
  const creDtTm= new Date().toISOString().slice(0,19);
  const stmts  = (parsed.statements || [parsed]).map((s,i) => stmtXml(s,i)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
    </GrpHdr>
${stmts}
  </BkToCstmrStmt>
</Document>`;
}

module.exports = { staToCamt053 };
