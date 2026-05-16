'use strict';
// pain.001.001.03 and pain.001.001.09 XML generator
const { v4: uuidv4 } = require('uuid');

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtAmt(v) { return parseFloat(v).toFixed(2); }
function fmtDate(d) { return d ? d.slice(0, 10) : new Date().toISOString().slice(0, 10); }
function fmtDtTm(d) {
  if (!d) return new Date().toISOString().slice(0, 19);
  return d.length > 10 ? d.slice(0, 19) : d + 'T00:00:00';
}

const NS = {
  '03': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  '09': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
};

// Baut einen PstlAdr-Block:
// v09 = strukturiert (StrtNm/BldgNb/PstCd/TwnNm/Ctry), v03 = AdrLine + Ctry
function buildPstlAdr(ver, data, prefix) {
  if (ver === '09') {
    const strtNm = esc(data[`${prefix}StrtNm`] || '');
    const bldgNb = esc(data[`${prefix}BldgNb`] || '');
    const pstCd  = esc(data[`${prefix}PstCd`]  || '');
    const twnNm  = esc(data[`${prefix}TwnNm`]  || '');
    const ctry   = esc(data[`${prefix}Ctry`]   || '');
    if (!strtNm && !bldgNb && !pstCd && !twnNm) return '';
    return `
            <PstlAdr>
              ${strtNm ? `<StrtNm>${strtNm}</StrtNm>` : ''}
              ${bldgNb ? `<BldgNb>${bldgNb}</BldgNb>` : ''}
              ${pstCd  ? `<PstCd>${pstCd}</PstCd>`   : ''}
              ${twnNm  ? `<TwnNm>${twnNm}</TwnNm>`   : ''}
              ${ctry   ? `<Ctry>${ctry}</Ctry>`       : ''}
            </PstlAdr>`;
  } else {
    const ctry    = esc(data[`${prefix}Ctry`]    || '');
    const adrLine = esc(data[`${prefix}AdrLine`] || '');
    if (!adrLine) return '';
    return `
            <PstlAdr>
              ${ctry    ? `<Ctry>${ctry}</Ctry>`          : ''}
              ${adrLine ? `<AdrLine>${adrLine}</AdrLine>` : ''}
            </PstlAdr>`;
  }
}

function buildPain001(data, version) {
  const ver = version.endsWith('09') ? '09' : '03';
  const ns  = NS[ver];
  // pain.001.001.03: BIC-Tag; pain.001.001.09: BICFI-Tag
  const bicTag = ver === '09' ? 'BICFI' : 'BIC';

  const msgId    = data.GrpHdr_MsgId || uuidv4().slice(0, 35);
  const creDtTm  = fmtDtTm(data.GrpHdr_CreDtTm);
  const initNm   = esc(data.GrpHdr_InitgPty_Nm || '');
  const pmtInfId = data.PmtInf_PmtInfId || uuidv4().slice(0, 35);
  const execDate = fmtDate(data.PmtInf_ReqdExctnDt);
  const dbtrNm   = esc(data.PmtInf_Dbtr_Nm || '');
  const dbtrBic  = esc(data.PmtInf_DbtrAgt_BIC || '');
  const dbtrIban = esc(data.PmtInf_DbtrAcct_IBAN || '');

  const txArr    = Array.isArray(data.transactions) ? data.transactions : [data];
  const txCount  = txArr.length;
  const ctrlSum  = txArr.reduce((s, tx) => s + parseFloat(tx.Tx_Amt || 0), 0).toFixed(2);

  const addrDbtr = buildPstlAdr(ver, data, 'PmtInf_Dbtr_');

  const bicBlockDbtr = dbtrBic
    ? `\n          <FinInstnId><${bicTag}>${dbtrBic}</${bicTag}></FinInstnId>`
    : ver === '09'
      ? `\n          <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`
      : '';

  const txXml = txArr.map((tx, i) => {
    const e2eId   = esc(tx.Tx_EndToEndId || `E2E-${String(i + 1).padStart(3, '0')}`);
    const amt     = fmtAmt(tx.Tx_Amt || 0);
    const cdtrNm  = esc(tx.Tx_Cdtr_Nm || '');
    const cdtrBic = esc(tx.Tx_CdtrAgt_BIC || '');
    const cdtrIban = esc(tx.Tx_CdtrAcct_IBAN || '');
    const ustrd   = esc(tx.Tx_RmtInf_Ustrd || '');

    const addrCdtr = buildPstlAdr(ver, tx, 'Tx_Cdtr_');

    const bicCdtr = cdtrBic
      ? `\n            <FinInstnId><${bicTag}>${cdtrBic}</${bicTag}></FinInstnId>`
      : ver === '09'
        ? `\n            <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`
        : '';

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
            <Nm>${cdtrNm}</Nm>${addrCdtr}
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
        <Nm>${dbtrNm}</Nm>${addrDbtr}
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
