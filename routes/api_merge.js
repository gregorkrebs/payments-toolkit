/* api_merge.js - Zahlungen zusammenfassen */
'use strict';
const express = require('express');
const router = express.Router();
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// POST /api/merge/export
// Accepts either:
//   A) Content-Type: application/json  { transactions: [{e2e, valuta, amt, ccy, cdtrNm, cdtrIban, cdtrBic, rmtInf}] }
//   B) Content-Type: multipart/form-data  (legacy: files[] + optional name/iban/bic/valuta)
router.post('/export', async (req, res) => {
  try {
    let transactions;
    const now = new Date();
    const stamp = fmtStamp(now);

    // ── Debtor aus Payload lesen ──
    const dbtr = {
      nm:   String(req.body.dbtrNm   || '').trim(),
      iban: String(req.body.dbtrIban || '').replace(/\s/g, '').toUpperCase(),
      bic:  String(req.body.dbtrBic  || '').trim(),
    };

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(dbtr.iban)) {
      return res.status(400).json({ ok: false, error: 'Ungültige oder fehlende Auftraggeber-IBAN.' });
    }
    if (!dbtr.nm) {
      return res.status(400).json({ ok: false, error: 'Auftraggeber-Name fehlt.' });
    }

    if (req.body && Array.isArray(req.body.transactions)) {
      // ── Path A: JSON payload from enhanced UI ──
      transactions = req.body.transactions.map((t, i) => ({
        e2e:      String(t.e2e || ('EREF' + String(i + 1).padStart(6, '0'))),
        valuta:   t.valuta || now.toISOString().slice(0, 10),
        amt:      parseFloat(t.amt) || 0,
        ccy:      String(t.ccy || 'EUR').slice(0, 3).toUpperCase(),
        cdtrNm:   String(t.cdtrNm || ''),
        cdtrIban: String(t.cdtrIban || '').replace(/\s/g, ''),
        cdtrBic:  String(t.cdtrBic || ''),
        rmtInf:   String(t.rmtInf || ''),
      }));
    } else if (req.files && req.files.length > 0) {
      // ── Path B: FormData files (legacy) ──
      const globalParams = { name: req.body.name, iban: req.body.iban, bic: req.body.bic, valuta: req.body.valuta };
      transactions = [];
      for (const file of req.files) {
        try {
          const txs = extractTransactionsFromXml(file.buffer.toString('utf8'));
          txs.forEach((tx, i) => {
            transactions.push({
              e2e:      tx.e2e || ('EREF' + String(transactions.length + 1).padStart(6, '0')),
              valuta:   globalParams.valuta || tx.valuta || now.toISOString().slice(0, 10),
              amt:      tx.amt,
              ccy:      tx.ccy || 'EUR',
              cdtrNm:   globalParams.name || tx.cdtrNm,
              cdtrIban: globalParams.iban || tx.cdtrIban,
              cdtrBic:  globalParams.bic  || tx.cdtrBic,
              rmtInf:   tx.rmtInf,
            });
          });
        } catch (e) {
          // skip unparseable file
        }
      }
    } else {
      return res.status(400).json({ ok: false, error: 'Keine Transaktionen oder Dateien uebermittelt' });
    }

    if (transactions.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Transaktionen gefunden' });
    }

    // ── Gruppierung: pro Debtor-IBAN + Valuta-Datum ──
    const groups = new Map();
    transactions.forEach(tx => {
      const key = `${dbtr.iban}|${tx.valuta}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tx);
    });

    const xml = buildPain001v09(groups, dbtr, now, stamp);
    const filename = `CCT_zusammengefasst_${stamp}.xml`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function fmtStamp(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0');
}

function extractTransactionsFromXml(xmlStr) {
  const parsed = xmlParser.parse(xmlStr);
  const doc = parsed.Document || parsed['ns2:Document'] || parsed;
  const root = doc.CstmrCdtTrfInitn;
  if (!root) return [];

  const pmtInfs = Array.isArray(root.PmtInf) ? root.PmtInf : (root.PmtInf ? [root.PmtInf] : []);
  const txs = [];
  for (const pi of pmtInfs) {
    const valuta = pi.ReqdExctnDt || '';
    const raw = Array.isArray(pi.CdtTrfTxInf) ? pi.CdtTrfTxInf : (pi.CdtTrfTxInf ? [pi.CdtTrfTxInf] : []);
    for (const tx of raw) {
      const amtEl = tx.Amt?.InstdAmt;
      const amt = parseFloat(typeof amtEl === 'object' ? amtEl['#text'] : amtEl) || 0;
      const ccy = typeof amtEl === 'object' ? (amtEl['@_Ccy'] || 'EUR') : 'EUR';
      txs.push({
        e2e:      String(tx.PmtId?.EndToEndId || ''),
        valuta,
        amt,
        ccy,
        cdtrNm:   String(tx.Cdtr?.Nm || ''),
        cdtrIban: String(tx.CdtrAcct?.Id?.IBAN || ''),
        cdtrBic:  String(tx.CdtrAgt?.FinInstnId?.BIC || ''),
        rmtInf:   String(tx.RmtInf?.Ustrd || ''),
      });
    }
  }
  return txs;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPain001v09(groups, dbtr, now, stamp) {
  const NS = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';
  const msgId = 'MERGE' + stamp.replace(/[-_]/g, '');
  const creDtTm = now.toISOString().slice(0, 19);

  // Gesamt-Zähler für GrpHdr
  let totalTxCount = 0;
  let totalCtrlSum = 0;
  groups.forEach(txs => {
    totalTxCount += txs.length;
    txs.forEach(tx => { totalCtrlSum += tx.amt; });
  });

  const dbtrBicBlock = dbtr.bic
    ? `<FinInstnId><BICFI>${esc(dbtr.bic)}</BICFI></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;

  let pmtInfXml = '';
  let pmtInfIdx = 0;
  groups.forEach((txs, key) => {
    const valuta = key.split('|')[1];
    const grpSum = txs.reduce((s, tx) => s + tx.amt, 0).toFixed(2);
    pmtInfIdx++;
    pmtInfXml += `    <PmtInf>
      <PmtInfId>PMTINF-${esc(stamp)}-${String(pmtInfIdx).padStart(3, '0')}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${txs.length}</NbOfTxs>
      <CtrlSum>${grpSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt><Dt>${esc(valuta)}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${esc(dbtr.nm)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(dbtr.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${dbtrBicBlock}</DbtrAgt>
      <ChrgBr>SHAR</ChrgBr>
`;
    txs.forEach(tx => {
      const cdtrBicBlock = tx.cdtrBic
        ? `<CdtrAgt><FinInstnId><BICFI>${esc(tx.cdtrBic)}</BICFI></FinInstnId></CdtrAgt>`
        : `<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>`;
      pmtInfXml += `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${esc(tx.e2e)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${esc(tx.ccy)}">${tx.amt.toFixed(2)}</InstdAmt>
        </Amt>
        ${cdtrBicBlock}
        <Cdtr>
          <Nm>${esc(tx.cdtrNm)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id><IBAN>${esc(tx.cdtrIban)}</IBAN></Id>
        </CdtrAcct>
        ${tx.rmtInf ? `<RmtInf><Ustrd>${esc(tx.rmtInf)}</Ustrd></RmtInf>` : ''}
      </CdtTrfTxInf>
`;
    });
    pmtInfXml += `    </PmtInf>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${NS}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${totalTxCount}</NbOfTxs>
      <CtrlSum>${totalCtrlSum.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${esc(dbtr.nm)}</Nm>
      </InitgPty>
    </GrpHdr>
${pmtInfXml}  </CstmrCdtTrfInitn>
</Document>`;
}

module.exports = router;
