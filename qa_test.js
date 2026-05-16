'use strict';
const { validatePainXml } = require('./src/validators/pain_validator');
const { buildPain001 }    = require('./src/generators/pain001_generator');

async function runQA() {
  console.log('=== TASK 4 QA ===\n');
  let passed = 0; let failed = 0;
  function check(label, condition) {
    if (condition) { console.log('  ✓', label); passed++; }
    else           { console.log('  ✗ FAIL:', label); failed++; }
  }

  // ── Negativtests: Validator muss Fehler erkennen ──
  console.log('--- A: Negativtests ---');

  // A1: AdrLine in pain.001.001.09 → VERBOTEN
  const xmlA1 = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
<CstmrCdtTrfInitn><GrpHdr><MsgId>MSG001</MsgId><CreDtTm>2026-01-01T10:00:00</CreDtTm>
<NbOfTxs>1</NbOfTxs><CtrlSum>100.00</CtrlSum><InitgPty><Nm>Test</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>PI001</PmtInfId><PmtMtd>TRF</PmtMtd>
<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
<ReqdExctnDt><Dt>2026-01-02</Dt></ReqdExctnDt>
<Dbtr><Nm>Test GmbH</Nm><PstlAdr><AdrLine>Teststr 1</AdrLine></PstlAdr></Dbtr>
<DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
<DbtrAgt><FinInstnId><BICFI>COBADEFFXXX</BICFI></FinInstnId></DbtrAgt>
<CdtTrfTxInf><PmtId><EndToEndId>E2E001</EndToEndId></PmtId>
<Amt><InstdAmt Ccy="EUR">100.00</InstdAmt></Amt>
<CdtrAgt><FinInstnId><BICFI>COBADEFFXXX</BICFI></FinInstnId></CdtrAgt>
<Cdtr><Nm>Max</Nm></Cdtr>
<CdtrAcct><Id><IBAN>DE75512108001245126199</IBAN></Id></CdtrAcct>
<RmtInf><Ustrd>Test</Ustrd></RmtInf>
</CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>`;

  const rA1 = await validatePainXml(xmlA1);
  check('A1 AdrLine in v09 erkannt', !rA1.ok && rA1.errors.some(e => e.message.includes('AdrLine')));

  // A2: Leeres <Ctry/> in pain.001.001.09 → VERBOTEN
  const xmlA2 = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
<CstmrCdtTrfInitn><GrpHdr><MsgId>MSG001</MsgId><CreDtTm>2026-01-01T10:00:00</CreDtTm>
<NbOfTxs>1</NbOfTxs><CtrlSum>100.00</CtrlSum><InitgPty><Nm>Test</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>PI001</PmtInfId><PmtMtd>TRF</PmtMtd>
<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
<ReqdExctnDt><Dt>2026-01-02</Dt></ReqdExctnDt>
<Dbtr><Nm>Test</Nm><PstlAdr><StrtNm>Teststr</StrtNm><Ctry></Ctry></PstlAdr></Dbtr>
<DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
<DbtrAgt><FinInstnId><BICFI>COBADEFFXXX</BICFI></FinInstnId></DbtrAgt>
<CdtTrfTxInf><PmtId><EndToEndId>E2E001</EndToEndId></PmtId>
<Amt><InstdAmt Ccy="EUR">100.00</InstdAmt></Amt>
<CdtrAgt><FinInstnId><BICFI>COBADEFFXXX</BICFI></FinInstnId></CdtrAgt>
<Cdtr><Nm>Max</Nm></Cdtr>
<CdtrAcct><Id><IBAN>DE75512108001245126199</IBAN></Id></CdtrAcct>
<RmtInf><Ustrd>Test</Ustrd></RmtInf>
</CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>`;

  const rA2 = await validatePainXml(xmlA2);
  check('A2 Leeres Ctry in v09 erkannt', !rA2.ok && rA2.errors.some(e => e.message.toLowerCase().includes('ctry') || e.message.toLowerCase().includes('leer')));

  // A3: BIC statt BICFI in pain.001.001.09 → VERBOTEN
  const xmlA3 = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
<CstmrCdtTrfInitn><GrpHdr><MsgId>MSG001</MsgId><CreDtTm>2026-01-01T10:00:00</CreDtTm>
<NbOfTxs>1</NbOfTxs><CtrlSum>100.00</CtrlSum><InitgPty><Nm>Test</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>PI001</PmtInfId><PmtMtd>TRF</PmtMtd>
<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
<ReqdExctnDt><Dt>2026-01-02</Dt></ReqdExctnDt>
<Dbtr><Nm>Test</Nm></Dbtr>
<DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
<DbtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></DbtrAgt>
<CdtTrfTxInf><PmtId><EndToEndId>E2E001</EndToEndId></PmtId>
<Amt><InstdAmt Ccy="EUR">100.00</InstdAmt></Amt>
<CdtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></CdtrAgt>
<Cdtr><Nm>Max</Nm></Cdtr>
<CdtrAcct><Id><IBAN>DE75512108001245126199</IBAN></Id></CdtrAcct>
<RmtInf><Ustrd>Test</Ustrd></RmtInf>
</CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>`;

  const rA3 = await validatePainXml(xmlA3);
  check('A3 BIC statt BICFI in v09 erkannt', !rA3.ok && rA3.errors.some(e => e.message.includes('BICFI')));

  // A4: Fehlende Pflichtfelder
  const xmlA4 = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
<CstmrCdtTrfInitn><GrpHdr></GrpHdr><PmtInf></PmtInf></CstmrCdtTrfInitn></Document>`;
  const rA4 = await validatePainXml(xmlA4);
  check('A4 Fehlende Pflichtfelder erkannt', !rA4.ok && rA4.errors.length >= 4);

  // ── Positivtests: Generator erstellt valide Dateien ──
  console.log('\n--- B: Generator pain.001.001.09 ---');
  const genData09 = {
    GrpHdr_MsgId: 'MSGTEST001',
    GrpHdr_CreDtTm: '2026-05-15T10:00:00',
    GrpHdr_InitgPty_Nm: 'Test GmbH',
    PmtInf_PmtInfId: 'PI001',
    PmtInf_ReqdExctnDt: '2026-05-16',
    PmtInf_Dbtr_Nm: 'Test GmbH',
    PmtInf_Dbtr_StrtNm: 'Musterstraße',
    PmtInf_Dbtr_BldgNb: '1',
    PmtInf_Dbtr_PstCd: '12345',
    PmtInf_Dbtr_TwnNm: 'Musterstadt',
    PmtInf_Dbtr_Ctry: 'DE',
    PmtInf_DbtrAcct_IBAN: 'DE89370400440532013000',
    PmtInf_DbtrAgt_BIC: 'COBADEFFXXX',
    transactions: [{
      Tx_EndToEndId: 'EREF001',
      Tx_Amt: '123.45',
      Tx_Cdtr_Nm: 'Max Mustermann',
      Tx_Cdtr_StrtNm: 'Beispielstr',
      Tx_Cdtr_BldgNb: '5',
      Tx_Cdtr_PstCd: '10115',
      Tx_Cdtr_TwnNm: 'Berlin',
      Tx_Cdtr_Ctry: 'DE',
      Tx_CdtrAcct_IBAN: 'DE75512108001245126199',
      Tx_CdtrAgt_BIC: 'COBADEFFXXX',
      Tx_RmtInf_Ustrd: 'Rechnung 2026/001',
    }]
  };

  const xml09 = buildPain001(genData09, 'pain.001.001.09');
  check('B1 <BICFI> verwendet', xml09.includes('<BICFI>'));
  check('B2 Strukturierte Adresse (StrtNm)', xml09.includes('<StrtNm>Musterstraße</StrtNm>'));
  check('B3 Strukturierte Adresse (TwnNm)', xml09.includes('<TwnNm>Musterstadt</TwnNm>'));
  check('B4 Ctry korrekt', xml09.includes('<Ctry>DE</Ctry>'));
  check('B5 Kein <AdrLine>', !xml09.includes('<AdrLine>'));
  check('B6 Kein <BIC>-Tag', !xml09.includes('<BIC>COBADEFFXXX</BIC>'));
  check('B7 ReqdExctnDt mit <Dt>', xml09.includes('<Dt>2026-05-16</Dt>'));

  const rB = await validatePainXml(xml09);
  check('B8 Generierte Datei besteht Validator', rB.ok);
  if (!rB.ok) rB.errors.forEach(e => console.log('     ERROR:', e.fieldPath, ':', e.message));

  console.log('\n--- C: Generator pain.001.001.03 ---');
  const genData03 = {
    GrpHdr_MsgId: 'MSGTEST002',
    GrpHdr_CreDtTm: '2026-05-15T10:00:00',
    GrpHdr_InitgPty_Nm: 'Test GmbH',
    PmtInf_PmtInfId: 'PI001',
    PmtInf_ReqdExctnDt: '2026-05-16',
    PmtInf_Dbtr_Nm: 'Test GmbH',
    PmtInf_Dbtr_Ctry: 'DE',
    PmtInf_Dbtr_AdrLine: 'Musterstraße 1, 12345 Musterstadt',
    PmtInf_DbtrAcct_IBAN: 'DE89370400440532013000',
    PmtInf_DbtrAgt_BIC: 'COBADEFFXXX',
    transactions: [{
      Tx_EndToEndId: 'EREF001',
      Tx_Amt: '50.00',
      Tx_Cdtr_Nm: 'Max Mustermann',
      Tx_Cdtr_Ctry: 'DE',
      Tx_Cdtr_AdrLine: 'Beispielstr 5, 10115 Berlin',
      Tx_CdtrAcct_IBAN: 'DE75512108001245126199',
      Tx_CdtrAgt_BIC: 'COBADEFFXXX',
      Tx_RmtInf_Ustrd: 'Rechnung 2026/002',
    }]
  };

  const xml03 = buildPain001(genData03, 'pain.001.001.03');
  check('C1 <BIC>-Tag in v03', xml03.includes('<BIC>COBADEFFXXX</BIC>'));
  check('C2 <AdrLine> in v03', xml03.includes('<AdrLine>'));
  check('C3 ReqdExctnDt ohne <Dt>-Wrapper', xml03.includes('<ReqdExctnDt>2026-05-16</ReqdExctnDt>'));
  check('C4 Kein <BICFI>-Tag in v03', !xml03.includes('<BICFI>'));

  const rC = await validatePainXml(xml03);
  check('C5 Generierte v03-Datei besteht Validator', rC.ok);
  if (!rC.ok) rC.errors.forEach(e => console.log('     ERROR:', e.fieldPath, ':', e.message));

  console.log('');
  console.log(`=== ERGEBNIS: ${passed} bestanden, ${failed} fehlgeschlagen ===`);
  if (failed > 0) process.exit(1);
}

runQA().catch(e => { console.error('QA CRASH:', e.message, e.stack); process.exit(1); });
