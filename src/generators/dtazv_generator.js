'use strict';
// DTAZV 6.0 Generator — Auslandszahlungen (AZV / AXZ)
// Record layout: A-Record (128 chars) + N x T-Record (187 chars) + E-Record (128 chars)
// Character set: Latin-1, fixed-width, space-padded

function pad(s, len) { return String(s || '').padEnd(len, ' ').slice(0, len); }
function padNum(n, len) { return String(Math.round(n * 100) || 0).padStart(len, '0'); }
function fmtDate(d) {
  if (!d) d = new Date().toISOString().slice(0, 10);
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return parts[2] + parts[1] + parts[0].slice(2); // DDMMYY
  return '010101';
}

function buildARecord(data, orderType, txCount) {
  const blz       = pad(data.ABlz || '', 8);
  const konto     = pad(data.AKonto || '', 10);
  const datum     = fmtDate(data.ADatum);
  const auftragsart = pad(orderType || data.AOrderType || 'AZV', 3);
  const reserviert  = pad('', 44); // positions 28-71
  const kundennr    = pad('', 8);  // positions 72-79
  const waehrung    = pad(data.AWaehrung || 'EUR', 3); // positions 80-82
  const reserviert2 = pad('', 45); // positions 83-127
  const rec = 'A' + blz + konto + datum + auftragsart + reserviert + kundennr + waehrung + reserviert2;
  return rec.slice(0, 128).padEnd(128, ' ');
}

function buildTRecord(tx, idx) {
  // DTAZV 6.0 T-Record layout (187 chars):
  // Pos  1    : Record-Kennung 'T'
  // Pos  2-14 : Betrag (13 Stellen, implizite 2 Dezimalstellen, rechtsbündig, mit führenden Nullen)
  // Pos 15-17 : Waehrung (3 Buchstaben ISO 4217)
  // Pos 18-44 : Empfaengername (27 Zeichen)
  // Pos 45-71 : Empfaengerzusatz/Adr1 (27 Zeichen)
  // Pos 72-98 : Strasse/Adr2 (27 Zeichen)
  // Pos 99-100: Laendercode (2 Zeichen ISO 3166-1)
  // Pos 101-170: Verwendungszweck (70 Zeichen)
  // Pos 171-181: BIC Empfaengerbank (11 Zeichen)
  // Pos 182-187: Reserve (6 Zeichen)
  const betragRaw = parseFloat(tx.TBetrag || 0);
  const betragStr = padNum(betragRaw, 13);
  const waehrung  = pad(tx.TWaehrung || 'EUR', 3);
  const empfName  = pad(tx.TEmpfName || '', 27);
  const empfAdr1  = pad(tx.TEmpfAdr1 || '', 27);
  const empfAdr2  = pad(tx.TEmpfAdr2 || '', 27);
  const land      = pad(tx.TEmpfLand || '', 2);
  const verwendung= pad(tx.TVerwendung || '', 70);
  const bic       = pad(tx.TEmpfBic || '', 11);
  const reserve   = pad('', 6);

  const rec = 'T' + betragStr + waehrung + empfName + empfAdr1 + empfAdr2 + land + verwendung + bic + reserve;
  return rec.slice(0, 187).padEnd(187, ' ');
}

function buildERecord(txCount, totalBetrag) {
  // E-Record (128 chars):
  // Pos  1    : 'E'
  // Pos  2-8  : Anzahl T-Records (7 Stellen)
  // Pos  9-21 : Kontrollsumme Betraege (13 Stellen, implizite 2 Dezimalstellen)
  // Pos 22-128: Reserve
  const count   = String(txCount).padStart(7, '0');
  const sumStr  = padNum(totalBetrag, 13);
  const reserve = pad('', 107);
  const rec = 'E' + count + sumStr + reserve;
  return rec.slice(0, 128).padEnd(128, ' ');
}

function buildDtazv(data, orderType) {
  orderType = (orderType || data.AOrderType || 'AZV').toUpperCase();

  const txArr = Array.isArray(data.transactions) ? data.transactions : [data];
  if (!txArr.length) throw new Error('Mindestens eine Transaktion erforderlich');

  const tRecords = txArr.map((tx, i) => buildTRecord(tx, i));
  const totalBetrag = txArr.reduce((s, tx) => s + parseFloat(tx.TBetrag || 0), 0);

  const aRecord = buildARecord(data, orderType, txArr.length);
  const eRecord = buildERecord(txArr.length, totalBetrag);

  return [aRecord, ...tRecords, eRecord].join('\n') + '\n';
}

module.exports = { buildDtazv };
