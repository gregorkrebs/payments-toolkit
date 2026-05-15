'use strict';
// DTAZV / DTA format validator
// Supports order types: CCT, CDD, CDB, CCU, CTV, AZV, AXZ
// Record layout: A-record (header, 128 chars), T-record (transaction, 187 chars), E-record (trailer, 128 chars)

const ORDER_TYPES = ['CCT', 'CDD', 'CDB', 'CCU', 'CTV', 'AZV', 'AXZ'];

function _pad(s, len) { return (s || '').padEnd(len).slice(0, len); }

function parseRecord(line) {
  if (!line || line.length < 1) return null;
  const type = line.charAt(0);
  return { type, raw: line };
}

function validateARecord(line, issues) {
  if (line.length < 128) {
    issues.push({ severity: 'error', field: 'A-Record.Laenge', value: String(line.length), message: `A-Record zu kurz (${line.length} Zeichen, erwartet 128)` });
    return null;
  }
  const rec = {
    recordType: line.slice(0, 1),
    blz: line.slice(1, 9).trim(),
    kontoNr: line.slice(9, 19).trim(),
    datum: line.slice(19, 25).trim(),
    auftragsart: line.slice(25, 28).trim(),
    reserviert: line.slice(28, 72).trim(),
    kundennr: line.slice(72, 80).trim(),
    waehrung: line.slice(80, 83).trim(),
    reserviert2: line.slice(83, 128).trim(),
  };
  if (!/^\d{8}$/.test(rec.blz) && rec.blz !== '') {
    issues.push({ severity: 'warn', field: 'A-Record.BLZ', value: rec.blz, message: 'BLZ sollte 8 Ziffern haben' });
  }
  if (!ORDER_TYPES.includes(rec.auftragsart.toUpperCase())) {
    issues.push({ severity: 'error', field: 'A-Record.Auftragsart', value: rec.auftragsart, message: `Unbekannte Auftragsart "${rec.auftragsart}". Erwartet: ${ORDER_TYPES.join(', ')}` });
  }
  if (rec.waehrung && !/^[A-Z]{3}$/.test(rec.waehrung)) {
    issues.push({ severity: 'warn', field: 'A-Record.Waehrung', value: rec.waehrung, message: 'Waehrungskennzeichen sollte 3 Grossbuchstaben sein (ISO 4217)' });
  }
  if (!/^\d{6}$/.test(rec.datum)) {
    issues.push({ severity: 'warn', field: 'A-Record.Datum', value: rec.datum, message: 'Datum sollte 6 Ziffern haben (DDMMYY)' });
  }
  return rec;
}

function validateTRecord(line, idx, orderType, issues) {
  // T-Records fuer SEPA (CCT, CDD, CDB, CCU, CTV) sind 187 Zeichen
  // T-Records fuer AZV/AXZ koennen laenger sein
  const minLen = (orderType === 'AZV' || orderType === 'AXZ') ? 128 : 187;
  if (line.length < minLen) {
    issues.push({ severity: 'error', field: `T-Record[${idx}].Laenge`, value: String(line.length), message: `T-Record zu kurz (${line.length} Zeichen, erwartet mind. ${minLen})` });
    return null;
  }
  const rec = { recordType: 'T', raw: line };
  if (orderType === 'CCT' || orderType === 'CCU' || orderType === 'CTV') {
    rec.betrag = line.slice(1, 12).trim();
    rec.waehrung = line.slice(12, 15).trim();
    rec.cdtrIban = line.slice(15, 49).trim();
    rec.cdtrBic = line.slice(49, 60).trim();
    rec.cdtrName = line.slice(60, 95).trim();
    rec.verwendung = line.slice(95, 165).trim();
    rec.endToEndId = line.slice(165, 200 < line.length ? 200 : line.length).trim();
    if (rec.betrag && (isNaN(parseFloat(rec.betrag)) || parseFloat(rec.betrag) <= 0)) {
      issues.push({ severity: 'error', field: `T-Record[${idx}].Betrag`, value: rec.betrag, message: 'Betrag muss eine positive Zahl sein' });
    }
    if (rec.cdtrIban) {
      const { validateIban } = require('./iban_validator');
      const v = validateIban(rec.cdtrIban);
      if (!v.valid) issues.push({ severity: 'error', field: `T-Record[${idx}].CdtrIBAN`, value: rec.cdtrIban, message: `Ungueltige IBAN: ${v.error}` });
    }
  } else if (orderType === 'CDD' || orderType === 'CDB') {
    rec.betrag = line.slice(1, 12).trim();
    rec.dbtrIban = line.slice(15, 49).trim();
    rec.dbtrBic = line.slice(49, 60).trim();
    rec.dbtrName = line.slice(60, 95).trim();
    rec.mandatsRef = line.slice(95, 130).trim();
    rec.verwendung = line.slice(130, 165).trim();
    if (!rec.mandatsRef) issues.push({ severity: 'error', field: `T-Record[${idx}].MandatsRef`, value: '', message: 'Mandatsreferenz fehlt (Pflichtfeld fuer CDD/CDB)' });
    if (rec.dbtrIban) {
      const { validateIban } = require('./iban_validator');
      const v = validateIban(rec.dbtrIban);
      if (!v.valid) issues.push({ severity: 'error', field: `T-Record[${idx}].DbtrIBAN`, value: rec.dbtrIban, message: `Ungueltige IBAN: ${v.error}` });
    }
  } else if (orderType === 'AZV' || orderType === 'AXZ') {
    rec.betrag = line.slice(1, 15).trim();
    rec.waehrung = line.slice(15, 18).trim();
    rec.empfaenger = line.slice(18, 68).trim();
    rec.land = line.slice(68, 70).trim();
    rec.verwendung = line.slice(70, 140).trim();
    if (!rec.empfaenger) issues.push({ severity: 'error', field: `T-Record[${idx}].Empfaenger`, value: '', message: 'Empfaengername fehlt (Pflichtfeld AZV/AXZ)' });
    if (rec.land && !/^[A-Z]{2}$/.test(rec.land)) issues.push({ severity: 'warn', field: `T-Record[${idx}].Land`, value: rec.land, message: 'Laendercode sollte 2 Grossbuchstaben sein (ISO 3166-1)' });
  }
  return rec;
}

function validateERecord(line, txCount, sumBetrag, issues) {
  if (line.length < 128) {
    issues.push({ severity: 'error', field: 'E-Record.Laenge', value: String(line.length), message: `E-Record zu kurz (${line.length} Zeichen, erwartet 128)` });
    return null;
  }
  const claimedCount = parseInt(line.slice(1, 8).trim(), 10);
  const claimedSum = parseFloat(line.slice(8, 21).trim());
  if (!isNaN(claimedCount) && claimedCount !== txCount) {
    issues.push({ severity: 'error', field: 'E-Record.AnzahlSaetze', value: String(claimedCount), message: `Transaktionsanzahl im E-Record (${claimedCount}) stimmt nicht mit tatsaechlicher Anzahl (${txCount}) ueberein` });
  }
  return { recordType: 'E', claimedCount, claimedSum };
}

function validateDtazv(text) {
  const issues = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  if (!lines.length) return { ok: false, issues: [{ severity: 'error', field: 'Datei', value: '', message: 'Datei ist leer' }] };
  let aRec = null, eRec = null, txRecords = [];
  let orderType = '';
  lines.forEach((line, i) => {
    const type = line.charAt(0);
    if (type === 'A') {
      if (aRec) issues.push({ severity: 'warn', field: `Zeile ${i + 1}`, value: 'A', message: 'Mehrere A-Records gefunden' });
      aRec = validateARecord(line, issues);
      if (aRec) orderType = (aRec.auftragsart || '').toUpperCase();
    } else if (type === 'T' || type === 'C') {
      txRecords.push(validateTRecord(line, txRecords.length, orderType, issues));
    } else if (type === 'E') {
      eRec = validateERecord(line, txRecords.length, 0, issues);
    } else {
      issues.push({ severity: 'warn', field: `Zeile ${i + 1}`, value: type, message: `Unbekannter Record-Typ "${type}"` });
    }
  });
  if (!aRec) issues.push({ severity: 'error', field: 'A-Record', value: '', message: 'A-Record (Header) fehlt' });
  if (!eRec) issues.push({ severity: 'error', field: 'E-Record', value: '', message: 'E-Record (Trailer) fehlt' });
  if (!txRecords.length) issues.push({ severity: 'warn', field: 'T-Records', value: '0', message: 'Keine Transaktionen gefunden' });
  const errors = issues.filter(i => i.severity === 'error');
  return { ok: errors.length === 0, orderType, txCount: txRecords.length, aRec, eRec, issues, errors, warnings: issues.filter(i => i.severity === 'warn') };
}

module.exports = { validateDtazv, ORDER_TYPES };
