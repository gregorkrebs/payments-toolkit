'use strict';
// pain.001.001.03 and pain.001.001.09 XML generator
const { v4: uuidv4 } = require('uuid');

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtAmt(v) { return parseFloat(v).toFixed(2); }
function fmtDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  return d.slice(0, 10);
}
function fmtDtTm(d) {
  if (!d) return new Date().toISOString().slice(0, 19);
  return d.length > 10 ? d.slice(0, 19) : d + 'T00:00:00';
}

const NS = {
  '03': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  '09': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
};

function buildPain001(data, version) {
  const ver = version.endsWith('09') ? '09' : '03';
  const ns = NS[ver];
  const msgId = data.GrpHdr_MsgId || uuidv4().slice(0, 35);
  const creDtTm = fmtDtTm(data.GrpHdr_CreDtTm);
  const initNm = esc(data.GrpHdr_InitgPty_Nm || '');
  const pmtInfId = data.PmtInf_PmtInfId || uuidv4().slice(0, 35);
  const execDate = fmtDate(data.PmtInf_ReqdExctnDt);
  const dbtrNm = esc(data.PmtInf_Dbtr_Nm || '');
  const dbtrCtry = esc(data.PmtInf_Dbtr_Ctry || '');
  const dbtrAdrLine = esc(data.PmtInf_Dbtr_AdrLine || '');
  const dbtrIban = esc(data.PmtInf_DbtrAcct_IBAN || '');
  const dbtrBic = esc(data.PmtInf_DbtrAgt_BIC || '');

  // Transactions — either array or single object
  const txArr = Array.isArray(data.transactions) ? data.transactions : [data];
  const txCount = txArr.length;
  const ctrlSum = txArr.reduce((s, tx) => s + parseFloat(tx.Tx_Amt || 0), 0).toFixed(2);

  const addrBlockDbtr = (dbtrCtry || dbtrAdrLine) ? `
            <PstlAdr>
              <Ctry>${dbtrCtry}</Ctry>${dbtrAdrLine ? `\n              <AdrLine>${dbtrAdrLine}</AdrLine>` : ''}
            </PstlAdr>` : '';

  const bicBlockDbtr = dbtrBic ? `
          <FinInstnId>
            <BICFI>${dbtrBic}</BICFI>
          </FinInstnId>` : ver === '09' ? `
          <FinInstnId>
            <Othr><Id>NOTPROVIDED</Id></Othr>
          </FinInstnId>` : '';

  const txXml = txArr.map((tx, i) => {
    const e2eId = esc(tx.Tx_EndToEndId || `E2E-${String(i + 1).padStart(3, '0')}`);
    const amt = fmtAmt(tx.Tx_Amt || 0);
    const cdtrNm = esc(tx.Tx_Cdtr_Nm || '');
    const cdtrCtry = esc(tx.Tx_Cdtr_Ctry || '');
    const cdtrAdrLine = esc(tx.Tx_Cdtr_AdrLine || '');
    const cdtrIban = esc(tx.Tx_CdtrAcct_IBAN || '');
    const cdtrBic = esc(tx.Tx_CdtrAgt_BIC || '');
    const ustrd = esc(tx.Tx_RmtInf_Ustrd || '');
    const addrBlockCdtr = (cdtrCtry || cdtrAdrLine) ? `
              <PstlAdr>
                <Ctry>${cdtrCtry}</Ctry>${cdtrAdrLine ? `\n                <AdrLine>${cdtrAdrLine}</AdrLine>` : ''}
              </PstlAdr>` : '';
    const bicCdtr = cdtrBic ? `
            <FinInstnId><BICFI>${cdtrBic}</BICFI></FinInstnId>` :
      ver === '09' ? `\n            <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>` : '';
    return `        <CdtTrfTxInf>
          <PmtId>
            <EndToEndId>${e2eId}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="EUR">${amt}</InstdAmt>
          </Amt>
          <CdtrAgt>${bicCdtr}
          </CdtrAgt>
          <Cdtr>
            <Nm>${cdtrNm}</Nm>${addrBlockCdtr}
          </Cdtr>
          <CdtrAcct>
            <Id><IBAN>${cdtrIban}</IBAN></Id>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${ustrd}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${txCount}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${initNm}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${txCount}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${ver === '09' ? `<Dt>${execDate}</Dt>` : execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${dbtrNm}</Nm>${addrBlockDbtr}
      </Dbtr>
      <DbtrAcct>
        <Id><IBAN>${dbtrIban}</IBAN></Id>
      </DbtrAcct>
      <DbtrAgt>${bicBlockDbtr}
      </DbtrAgt>
${txXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

module.exports = { buildPain001 };
