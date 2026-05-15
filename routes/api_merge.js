/* api_merge.js - XML merging route */
'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { XMLParser } = require('fast-xml-parser');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

router.post('/export', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Dateien hochgeladen' });
    }

    const globalParams = {
      name: req.body.name,
      iban: req.body.iban,
      bic: req.body.bic,
      valuta: req.body.valuta
    };

    // Parse all XML files and extract transactions
    const allTransactions = [];
    for (const file of files) {
      try {
        const xml = file.buffer.toString('utf8');
        const parsed = parser.parse(xml);
        // Extract transactions from pain.001 format
        if (parsed.Document && parsed.Document.CstmrCdtTrfInitn) {
          const pmtInf = parsed.Document.CstmrCdtTrfInitn.PmtInf;
          if (Array.isArray(pmtInf)) {
            pmtInf.forEach(pi => {
              if (pi.CdtTrfTxInf) {
                const txs = Array.isArray(pi.CdtTrfTxInf) ? pi.CdtTrfTxInf : [pi.CdtTrfTxInf];
                allTransactions.push(...txs);
              }
            });
          } else if (pmtInf && pmtInf.CdtTrfTxInf) {
            const txs = Array.isArray(pmtInf.CdtTrfTxInf) ? pmtInf.CdtTrfTxInf : [pmtInf.CdtTrfTxInf];
            allTransactions.push(...txs);
          }
        }
      } catch (e) {
        console.error('Error parsing file:', file.name, e.message);
      }
    }

    if (allTransactions.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Transaktionen gefunden' });
    }

    // Generate merged pain.001.003.03 XML
    const mergedXml = generateMergedPain001(allTransactions, globalParams);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="merged_payment.xml"');
    res.send(mergedXml);
  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

function generateMergedPain001(transactions, params) {
  const now = new Date();
  const msgId = `MSG${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.003.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now.toISOString()}</CreDtTm>
      <NbOfTxs>${transactions.length}</NbOfTxs>
      <InitgPty>
        <Nm>${params.name || 'Payments Toolkit'}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMTINF-${msgId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${transactions.length}</NbOfTxs>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${params.valuta || now.toISOString().split('T')[0]}</ReqdExctnDt>
      <Dbtr>
        <Nm>${params.name || 'DEBITOR NAME'}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${params.iban || 'DE89370400440532013000'}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${params.bic || 'COBADEFFXXX'}</BIC>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SHAR</ChrgBr>
`;

  transactions.forEach((tx, idx) => {
    xml += `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>EREF${String(idx+1).padStart(6,'0')}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${tx.Amt?.InstdAmt || '100.00'}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BIC>${tx.CdtrAgt?.FinInstnId?.BIC || 'GENODEFFXXX'}</BIC>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${tx.Cdtr?.Nm || 'CREDITOR NAME'}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${tx.CdtrAcct?.Id?.IBAN || 'DE75512108001234567890'}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${tx.RmtInf?.Ustrd || 'Payment reference'}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
`;
  });

  xml += `    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

  return xml;
}

module.exports = router;
