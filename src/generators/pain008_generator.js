'use strict';
// pain.008 generator: pain.008.001.02, .08, pain.008.003.02 (B2B)
const { v4: uuidv4 } = require('uuid');

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtAmt(v) { return parseFloat(v || 0).toFixed(2); }
function fmtDate(d) { return d ? d.slice(0, 10) : new Date().toISOString().slice(0, 10); }
function fmtDtTm(d) { return d ? (d.length > 10 ? d.slice(0, 19) : d + 'T00:00:00') : new Date().toISOString().slice(0, 19); }

const NS008 = {
  '02': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02',
  '08': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08',
  'b2b': 'urn:iso:std:iso:20022:tech:xsd:pain.008.003.02',
};

function buildPain008(data, version) {
  const ver = version.endsWith('08') ? '08' : version.includes('003') ? 'b2b' : '02';
  const ns = NS008[ver];
  const msgId = esc(data.GrpHdr_MsgId || uuidv4().slice(0, 35));
  const creDtTm = fmtDtTm(data.GrpHdr_CreDtTm);
  const initNm = esc(data.GrpHdr_InitgPty_Nm || '');
  const pmtInfId = esc(data.PmtInf_PmtInfId || uuidv4().slice(0, 35));
  const collDt = fmtDate(data.PmtInf_ReqdColltnDt);
  const cdtrNm = esc(data.PmtInf_Cdtr_Nm || '');
  const cdtrIban = esc(data.PmtInf_CdtrAcct_IBAN || '');
  const cdtrBic = esc(data.PmtInf_CdtrAgt_BIC || '');
  const cdtrGid = esc(data.PmtInf_CdtrSchmeId || '');
  const seqTp = esc(data.PmtInf_SeqTp || 'RCUR');

  const txArr = Array.isArray(data.transactions) ? data.transactions : [data];
  const txCnt = txArr.length;
  const ctrlSum = txArr.reduce((s, t) => s + parseFloat(t.Tx_InstdAmt || 0), 0).toFixed(2);

  const txXml = txArr.map((tx, i) => {
    const e2e = esc(tx.Tx_EndToEndId || `E2E-${String(i + 1).padStart(3, '0')}`);
    const amt = fmtAmt(tx.Tx_InstdAmt);
    const mndtId = esc(tx.Tx_MndtId || '');
    const dtSgn = fmtDate(tx.Tx_DtOfSgntr);
    const dbtrNm = esc(tx.Tx_Dbtr_Nm || '');
    const dbtrIban = esc(tx.Tx_DbtrAcct_IBAN || '');
    const dbtrBic = esc(tx.Tx_DbtrAgt_BIC || '');
    const ustrd = esc(tx.Tx_RmtInf_Ustrd || '');
    const bicBlock = dbtrBic ? `\n            <FinInstnId><BICFI>${dbtrBic}</BICFI></FinInstnId>` :
      `\n            <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
    return `        <DrctDbtTxInf>
          <PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>
          <InstdAmt Ccy="EUR">${amt}</InstdAmt>
          <DrctDbtTx>
            <MndtRltdInf>
              <MndtId>${mndtId}</MndtId>
              <DtOfSgntr>${dtSgn}</DtOfSgntr>
            </MndtRltdInf>
          </DrctDbtTx>
          <DbtrAgt>${bicBlock}
          </DbtrAgt>
          <Dbtr><Nm>${dbtrNm}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${dbtrIban}</IBAN></Id></DbtrAcct>
          <RmtInf><Ustrd>${ustrd}</Ustrd></RmtInf>
        </DrctDbtTxInf>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${txCnt}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty><Nm>${initNm}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${pmtInfId}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${txCnt}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>${ver === 'b2b' ? 'B2B' : 'CORE'}</Cd></LclInstrm>
        <SeqTp>${seqTp}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${collDt}</ReqdColltnDt>
      <Cdtr><Nm>${cdtrNm}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${cdtrIban}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BICFI>${cdtrBic}</BICFI></FinInstnId></CdtrAgt>
      <CdtrSchmeId>
        <Id><PrvtId><Othr>
          <Id>${cdtrGid}</Id>
          <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
        </Othr></PrvtId></Id>
      </CdtrSchmeId>
${txXml}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}

module.exports = { buildPain008 };
