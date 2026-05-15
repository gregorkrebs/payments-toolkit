'use strict';
/* api_samples.js — Beispieldaten-Generator: C53 (CAMT.053) und STA (MT940) */
const express = require('express');
const path    = require('path');
const AdmZip  = require('adm-zip');
const router  = express.Router();

const SAMPLES_PATH = path.join(__dirname, '../payments.armhosting.de/data/sample_transactions.json');
let _cache = null;
function getSamples() {
  if (!_cache) _cache = require(SAMPLES_PATH);
  return _cache;
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function pickRandom(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function fmtAmt(n) { return n.toFixed(2).replace('.', ','); }

function fmtYYMMDD(d) {
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + m + dd;
}

function fmtISO(d) { return d.toISOString().slice(0, 10); }
function xmlEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Returns array of Date objects for Mon-Fri within [from, to] (inclusive, Date objects) */
function getWeekdaysInRange(from, to) {
  const days = [];
  const cur = new Date(from); cur.setHours(0,0,0,0);
  const end = new Date(to);   end.setHours(23,59,59,999);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Count weekdays (Mon-Fri) from Jan 1 of that year through date (inclusive) — 1-based */
function countWeekdaysUpTo(date) {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  jan1.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  let count = 0;
  const cur = new Date(jan1);
  while (cur <= d) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Format C53 single-day XML filename: YYYY-MM-DD_C53_IBAN_EUR_YY-NNNNN.xml */
function formatC53Filename(date, iban, ccy) {
  const iso   = fmtISO(date);
  const yy    = String(date.getFullYear()).slice(-2);
  const cnt   = String(countWeekdaysUpTo(date)).padStart(5, '0');
  const ibanShort = (iban || 'DEXX').replace(/\s/g, '');
  return `${iso}_C53_${ibanShort}_${ccy || 'EUR'}_${yy}-${cnt}.xml`;
}

/* ── STA (MT940) generator ────────────────────────────────────────────── */
function generateSTA(txList, opts) {
  const iban     = opts.iban        || 'DE89370400440532013000';
  const bic      = opts.bic         || 'COBADEFFXXX';
  const name     = opts.accountName || 'Max Mustermann';
  const ccy      = opts.currency    || 'EUR';
  const startBal = parseFloat(opts.openingBalance) || 10000.00;

  // Sort by dayOfYear
  const sorted = txList.slice().sort((a, b) => a.dayOfYear - b.dayOfYear);
  const year   = opts.year || new Date().getFullYear();

  function dayToDate(doy) {
    const d = new Date(year, 0, 1); d.setDate(d.getDate() + doy - 1); return d;
  }

  const firstDay = sorted[0].dayOfYear;
  const lastDay  = sorted[sorted.length - 1].dayOfYear;
  const fromDate = fmtYYMMDD(dayToDate(firstDay));
  const toDate   = fmtYYMMDD(dayToDate(lastDay));

  let balance = startBal;
  const lines = [];
  lines.push(`:20:STMT${fromDate}001`);
  lines.push(`:21:NONREF`);
  lines.push(`:25:${iban}/${ccy}`);
  lines.push(`:28C:00001/001`);
  const openInd = balance >= 0 ? 'C' : 'D';
  lines.push(`:60F:${openInd}${fromDate}${ccy}${fmtAmt(Math.abs(balance))}`);

  sorted.forEach((tx, idx) => {
    const d    = dayToDate(tx.dayOfYear);
    const dStr = fmtYYMMDD(d);
    const amt  = tx.amount;
    const dcSta = tx.dc === 'C' ? 'C' : 'D';
    const gvc   = tx.gvc || '051';
    const ref   = `REF${String(idx + 1).padStart(5, '0')}`;
    const bankRef = `BNK${dStr}${String(idx + 1).padStart(3, '0')}`;
    lines.push(`:61:${dStr}${dStr}${dcSta}${fmtAmt(amt)}N${gvc}${ref}//${bankRef}`);
    const bic30  = (tx.counterBic  || '').slice(0, 11);
    const iban31 = (tx.counterIban || '').slice(0, 34);
    const name32 = (tx.counterName || '').slice(0, 35);
    const purp   = (tx.purpose     || '').slice(0, 27);
    const bucht  = (tx.buchungstext|| '').slice(0, 27);
    let tag86 = `${gvc}?00${bucht}?10${String(idx + 1).padStart(6, '0')}?20${purp}`;
    if (bic30)  tag86 += `?30${bic30}`;
    if (iban31) tag86 += `?31${iban31}`;
    if (name32) tag86 += `?32${name32}`;
    lines.push(`:86:${tag86}`);
    balance += dcSta === 'C' ? amt : -amt;
  });

  const closeInd = balance >= 0 ? 'C' : 'D';
  lines.push(`:62F:${closeInd}${toDate}${ccy}${fmtAmt(Math.abs(balance))}`);
  lines.push(`-`);
  return lines.join('\r\n') + '\r\n';
}

/* ── C53 (CAMT.053 v08) generator for a single day ───────────────────── */
function generateC53ForDay(txList, date, opts, stmtCounter) {
  const iban     = opts.iban        || 'DE89370400440532013000';
  const bic      = opts.bic         || 'COBADEFFXXX';
  const name     = opts.accountName || 'Max Mustermann';
  const ccy      = opts.currency    || 'EUR';
  const startBal = typeof opts._runningBalance === 'number' ? opts._runningBalance : (parseFloat(opts.openingBalance) || 10000.00);
  const NS = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.08';

  const sorted = txList.slice().sort((a, b) => (a._seq||0) - (b._seq||0));
  const isoDate = fmtISO(date);
  const now     = new Date().toISOString().slice(0, 19);

  let balance = startBal;
  sorted.forEach(tx => { balance += tx.dc === 'C' ? tx.amount : -tx.amount; });
  const closingBal = balance;

  const yy  = String(date.getFullYear()).slice(-2);
  const cnt = String(stmtCounter).padStart(5, '0');
  const msgId  = `C53-${yy}-${cnt}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const stmtId = `STMT-${isoDate.replace(/-/g,'')}`;

  const openInd  = startBal  >= 0 ? 'CRDT' : 'DBIT';
  const closeInd = closingBal >= 0 ? 'CRDT' : 'DBIT';

  const entries = sorted.map((tx, idx) => {
    const dcC53   = tx.dc === 'C' ? 'CRDT' : 'DBIT';
    const eref    = `EREF${String(idx + 1).padStart(6, '0')}`;
    const svcrRef = `SVC${isoDate.replace(/-/g,'')}${String(idx + 1).padStart(4, '0')}`;
    const purp    = xmlEsc((tx.purpose || '').slice(0, 140));
    const cName   = xmlEsc((tx.counterName || '').slice(0, 70));
    const cIban   = xmlEsc((tx.counterIban || '').slice(0, 34));
    const cBic    = xmlEsc((tx.counterBic  || '').slice(0, 11));
    const amtStr  = tx.amount.toFixed(2);
    const isCredit = tx.dc === 'C';

    // RltdPties: Dbtr/Cdtr + Konto — KEIN AgentElement hier (TransactionParties6)
    const ptiesContent = isCredit
      ? `${cName ? `<Dbtr><Pty><Nm>${cName}</Nm></Pty></Dbtr>` : ''}${cIban ? `<DbtrAcct><Id><IBAN>${cIban}</IBAN></Id></DbtrAcct>` : ''}`
      : `${cName ? `<Cdtr><Pty><Nm>${cName}</Nm></Pty></Cdtr>` : ''}${cIban ? `<CdtrAcct><Id><IBAN>${cIban}</IBAN></Id></CdtrAcct>` : ''}`;
    const rltdPties = ptiesContent ? `\n        <RltdPties>${ptiesContent}</RltdPties>` : '';

    // RltdAgts: BICs der Gegenpartei — TransactionAgents5, nach RltdPties
    const rltdAgts = cBic
      ? (isCredit
        ? `\n        <RltdAgts><DbtrAgt><FinInstnId><BICFI>${cBic}</BICFI></FinInstnId></DbtrAgt></RltdAgts>`
        : `\n        <RltdAgts><CdtrAgt><FinInstnId><BICFI>${cBic}</BICFI></FinInstnId></CdtrAgt></RltdAgts>`)
      : '';

    // RmtInf: nur wenn Verwendungszweck vorhanden (Max140Text minLength=1)
    const rmtInf = purp ? `\n        <RmtInf><Ustrd>${purp}</Ustrd></RmtInf>` : '';

    return `    <Ntry>
      <Amt Ccy="${ccy}">${amtStr}</Amt>
      <CdtDbtInd>${dcC53}</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>${isoDate}</Dt></BookgDt>
      <ValDt><Dt>${isoDate}</Dt></ValDt>
      <AcctSvcrRef>${svcrRef}</AcctSvcrRef>
      <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${isCredit ? 'RCDT' : 'ICDT'}</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
      <NtryDtls>
        <TxDtls>
          <Refs><EndToEndId>${eref}</EndToEndId></Refs>
          <Amt Ccy="${ccy}">${amtStr}</Amt>
          <CdtDbtInd>${dcC53}</CdtDbtInd>${rltdPties}${rltdAgts}${rmtInf}
        </TxDtls>
      </NtryDtls>
    </Ntry>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${NS}">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>${stmtId}</Id>
      <ElctrncSeqNb>${stmtCounter}</ElctrncSeqNb>
      <CreDtTm>${now}</CreDtTm>
      <FrToDt>
        <FrDtTm>${isoDate}T00:00:00</FrDtTm>
        <ToDtTm>${isoDate}T23:59:59</ToDtTm>
      </FrToDt>
      <Acct>
        <Id><IBAN>${xmlEsc(iban)}</IBAN></Id>
        <Ccy>${ccy}</Ccy>
        <Nm>${xmlEsc(name)}</Nm>
        <Svcr><FinInstnId><BICFI>${xmlEsc(bic)}</BICFI></FinInstnId></Svcr>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${Math.abs(startBal).toFixed(2)}</Amt>
        <CdtDbtInd>${openInd}</CdtDbtInd>
        <Dt><Dt>${isoDate}</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${Math.abs(closingBal).toFixed(2)}</Amt>
        <CdtDbtInd>${closeInd}</CdtDbtInd>
        <Dt><Dt>${isoDate}</Dt></Dt>
      </Bal>
${entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

/* ── Route ─────────────────────────────────────────────────────────── */
router.post('/generate', (req, res) => {
  try {
    const { format, count, iban, bic, accountName, currency, openingBalance, year, dateFrom, dateTo } = req.body;
    const n   = Math.min(Math.max(parseInt(count) || 10, 1), 250);
    const fmt = String(format || 'sta').toLowerCase();
    if (fmt !== 'sta' && fmt !== 'c53') {
      return res.status(400).json({ error: 'Unbekanntes Format. Erlaubt: sta, c53' });
    }
    const samples = getSamples();
    const picked  = pickRandom(samples, n);
    const opts    = { iban, bic, accountName, currency, openingBalance, year: parseInt(year) || new Date().getFullYear() };

    if (fmt === 'sta') {
      const content  = generateSTA(picked, opts);
      const filename = `example_${n}tx_${opts.year}.sta`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(content);
    }

    // C53 — check for date range
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate   = dateTo   ? new Date(dateTo)   : null;

    if (fromDate && toDate && !isNaN(fromDate) && !isNaN(toDate)) {
      // Multi/single-day mode
      const weekdays = getWeekdaysInRange(fromDate, toDate);
      if (weekdays.length === 0) {
        return res.status(400).json({ error: 'Kein Werktag im angegebenen Zeitraum.' });
      }

      // Distribute transactions randomly across weekdays (days without any get no XML)
      const distributed = weekdays.map(() => []);
      picked.forEach((tx, i) => {
        const dayIdx = Math.floor(Math.random() * weekdays.length);
        distributed[dayIdx].push({ ...tx, _seq: i });
      });

      const filledDays = weekdays.filter((_, i) => distributed[i].length > 0);

      if (filledDays.length === 0) {
        return res.status(400).json({ error: 'Keine Transaktionen verteilt.' });
      }

      if (filledDays.length === 1) {
        // Single XML
        const dayIdx = weekdays.indexOf(filledDays[0]);
        const stmtCounter = countWeekdaysUpTo(filledDays[0]);
        const xmlOpts = { ...opts, _runningBalance: parseFloat(openingBalance) || 10000.00 };
        const content  = generateC53ForDay(distributed[dayIdx], filledDays[0], xmlOpts, stmtCounter);
        const filename = formatC53Filename(filledDays[0], opts.iban, opts.currency || 'EUR');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(content);
      }

      // Multiple days → ZIP as .C53
      const zip = new AdmZip();
      let runningBalance = parseFloat(openingBalance) || 10000.00;

      weekdays.forEach((day, idx) => {
        const txsForDay = distributed[idx];
        if (txsForDay.length === 0) return;
        const stmtCounter = countWeekdaysUpTo(day);
        const xmlOpts = { ...opts, _runningBalance: runningBalance };
        const xml = generateC53ForDay(txsForDay, day, xmlOpts, stmtCounter);
        // Update running balance
        txsForDay.forEach(tx => { runningBalance += tx.dc === 'C' ? tx.amount : -tx.amount; });
        const xmlFilename = formatC53Filename(day, opts.iban, opts.currency || 'EUR');
        zip.addFile(xmlFilename, Buffer.from(xml, 'utf8'));
      });

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
      const zipFilename = `${ts}.C53`;
      const zipBuf = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
      return res.send(zipBuf);

    } else {
      // Fallback: single C53 XML, all transactions, use year
      const yearNum = opts.year;
      const txWithDays = picked.map((tx, i) => ({ ...tx, _seq: i }));
      const firstDay = new Date(yearNum, 0, 2); // Jan 2
      const stmtCounter = countWeekdaysUpTo(firstDay);
      const xmlOpts = { ...opts, _runningBalance: parseFloat(openingBalance) || 10000.00 };
      const content  = generateC53ForDay(txWithDays, firstDay, xmlOpts, stmtCounter);
      const filename = `example_${n}tx_${yearNum}.xml`;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(content);
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
