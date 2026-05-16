'use strict';
// Felddefinitionen fuer Zahlungsdatei-Creator
// Format: { name, label, type, required, maxLen, pattern, placeholder, help, section }
// section: 'grpHdr' | 'pmtInf' | 'cdtTrf' | 'dbtInf' | 'mndtInf'

// Hilfsfunktionen
function tf(name, label, required, maxLen, placeholder, help, extra) {
  return { name, label, type: 'text', required: !!required, maxLen: maxLen || 35, placeholder: placeholder || '', help: help || '', ...(extra||{}) };
}
function nf(name, label, required, placeholder, help) {
  return { name, label, type: 'number', required: !!required, placeholder: placeholder || '0.00', help: help || '', step: '0.01', min: '0.01' };
}
function df(name, label, required, help) {
  return { name, label, type: 'date', required: !!required, help: help || '' };
}
function sel(name, label, required, options, help) {
  return { name, label, type: 'select', required: !!required, options, help: help || '' };
}

// ISO 3166-1 Alpha-2 Länder (europäischer SEPA-Raum + häufige Handelsnationen)
// Muss vor FIELD_DEFS stehen, da groupPain001Fields darauf zugreift
const COUNTRY_OPTIONS = [
  { v: '',   l: '-- kein Land --' },
  { v: 'DE', l: 'DE — Deutschland' },
  { v: 'AT', l: 'AT — Österreich' },
  { v: 'CH', l: 'CH — Schweiz' },
  { v: 'FR', l: 'FR — Frankreich' },
  { v: 'NL', l: 'NL — Niederlande' },
  { v: 'BE', l: 'BE — Belgien' },
  { v: 'LU', l: 'LU — Luxemburg' },
  { v: 'IT', l: 'IT — Italien' },
  { v: 'ES', l: 'ES — Spanien' },
  { v: 'PT', l: 'PT — Portugal' },
  { v: 'PL', l: 'PL — Polen' },
  { v: 'CZ', l: 'CZ — Tschechien' },
  { v: 'SK', l: 'SK — Slowakei' },
  { v: 'HU', l: 'HU — Ungarn' },
  { v: 'RO', l: 'RO — Rumänien' },
  { v: 'BG', l: 'BG — Bulgarien' },
  { v: 'HR', l: 'HR — Kroatien' },
  { v: 'SI', l: 'SI — Slowenien' },
  { v: 'SE', l: 'SE — Schweden' },
  { v: 'DK', l: 'DK — Dänemark' },
  { v: 'FI', l: 'FI — Finnland' },
  { v: 'NO', l: 'NO — Norwegen' },
  { v: 'IE', l: 'IE — Irland' },
  { v: 'GB', l: 'GB — Großbritannien' },
  { v: 'US', l: 'US — USA' },
  { v: 'CN', l: 'CN — China' },
  { v: 'JP', l: 'JP — Japan' },
  { v: 'IN', l: 'IN — Indien' },
  { v: 'BR', l: 'BR — Brasilien' },
  { v: 'AU', l: 'AU — Australien' },
  { v: 'CA', l: 'CA — Kanada' },
  { v: 'TR', l: 'TR — Türkei' },
  { v: 'RU', l: 'RU — Russland' },
  { v: 'AE', l: 'AE — Vereinigte Arabische Emirate' },
];

function groupPain001Fields(ver) {
  // Adressfelder: pain.001.001.09 = strukturiert (StrtNm/BldgNb/PstCd/TwnNm/Ctry)
  //               pain.001.001.03 = AdrLine + Ctry
  const dbtrAddrFields = ver === '09' ? [
    tf('PmtInf_Dbtr_StrtNm',  'Straße (Auftraggeber)',     false, 70, 'Musterstraße',    'Straßenname — strukturierte Adresse (pain.001.001.09)'),
    tf('PmtInf_Dbtr_BldgNb',  'Hausnummer',                false, 16, '1',              'Hausnummer'),
    tf('PmtInf_Dbtr_PstCd',   'PLZ',                       false, 16, '12345',          'Postleitzahl'),
    tf('PmtInf_Dbtr_TwnNm',   'Stadt',                     false, 35, 'Musterstadt',    'Stadtname'),
    sel('PmtInf_Dbtr_Ctry',   'Land (ISO 3166-1)',          false,
      COUNTRY_OPTIONS, 'Land des Auftraggebers — ISO 3166-1 Alpha-2'),
  ] : [
    tf('PmtInf_Dbtr_Ctry',    'Land Auftraggeber',         false,  2, 'DE',             'ISO 3166-1 Laendercode, z.B. DE'),
    tf('PmtInf_Dbtr_AdrLine', 'Adresse (Strassenzeile)',   false, 70, 'Musterstr. 1, 12345 Musterstadt', 'Straße + Hausnr + PLZ + Stadt in einer Zeile'),
  ];

  const cdtrAddrFields = ver === '09' ? [
    tf('Tx_Cdtr_StrtNm',  'Straße (Empfänger)',             false, 70, 'Beispielstraße', 'Straßenname'),
    tf('Tx_Cdtr_BldgNb',  'Hausnummer',                     false, 16, '5',             'Hausnummer'),
    tf('Tx_Cdtr_PstCd',   'PLZ',                            false, 16, '10115',         'Postleitzahl'),
    tf('Tx_Cdtr_TwnNm',   'Stadt',                          false, 35, 'Berlin',        'Stadtname'),
    sel('Tx_Cdtr_Ctry',   'Land (ISO 3166-1)',               false,
      COUNTRY_OPTIONS, 'Land des Empfängers — ISO 3166-1 Alpha-2'),
  ] : [
    tf('Tx_Cdtr_Ctry',    'Land Empfaenger',                false,  2, 'DE',            'ISO 3166-1 Laendercode'),
    tf('Tx_Cdtr_AdrLine', 'Adresse Empfaenger',             false, 70, 'Beispielstr. 5, 10115 Berlin', 'Strassenadresse des Empfaengers'),
  ];

  return [
    { section: 'Group Header', fields: [
      tf('GrpHdr_MsgId',   'Message ID',         true,  35, 'MSG20230101001',   'Eindeutige Nachrichtenreferenz, max 35 Zeichen', { generate: true }),
      df('GrpHdr_CreDtTm', 'Erstellungszeitpunkt',true,                         'Datum und Uhrzeit der Erstellung'),
      tf('GrpHdr_InitgPty_Nm', 'Name des Auftraggebers', true, 70, 'Muster GmbH', 'Name des Unternehmens/Person, das die Datei erzeugt'),
    ]},
    { section: 'Zahlung (Payment Information)', fields: [
      tf('PmtInf_PmtInfId', 'Payment Info ID',   true,  35, 'PMTINF001',        'Eindeutige ID fuer diesen Zahlungsblock'),
      df('PmtInf_ReqdExctnDt', 'Gewuenschtes Ausfuehrungsdatum', true,           'SEPA-Standardlaufzeit: 1 Bankarbeitstag'),
      tf('PmtInf_Dbtr_Nm',   'Name Auftraggeber', true,  70, 'Muster GmbH',     'Vollstaendiger Name des Schuldners'),
      ...dbtrAddrFields,
      tf('PmtInf_DbtrAcct_IBAN', 'IBAN Auftraggeber', true, 34, 'DE89370400440532013000', 'IBAN des Auftraggeberkontos (ISO 13616)'),
      tf('PmtInf_DbtrAgt_BIC',   'BIC Auftraggeber-Bank', ver === '09' ? false : true, 11, 'COBADEFFXXX', 'BIC der kontoführenden Bank (optional ab SEPA 3.7)'),
    ]},
    { section: 'Transaktion', multi: true, fields: [
      tf('Tx_EndToEndId',    'End-to-End-ID',     true,  35, 'EREF001',          'Eindeutige Transaktionsreferenz (wird unveraendert weitergeleitet)'),
      nf('Tx_Amt',           'Betrag (EUR)',       true,  '1234.56',             'Ueberweisungsbetrag in EUR'),
      tf('Tx_Cdtr_Nm',       'Name Empfaenger',   true,  70, 'Max Mustermann',   'Vollstaendiger Name des Empfaengers'),
      ...cdtrAddrFields,
      tf('Tx_CdtrAcct_IBAN', 'IBAN Empfaenger',   true,  34, 'DE12345678901234567890', 'IBAN des Empfaengers'),
      tf('Tx_CdtrAgt_BIC',   'BIC Empfaenger-Bank', ver === '09' ? false : true, 11, 'SSKMDEMMXXX', 'BIC der Bank des Empfaengers'),
      tf('Tx_RmtInf_Ustrd',  'Verwendungszweck',  false, 140, 'Rechnung 2023/001','Unstrukturierter Verwendungszweck (max 140 Zeichen)'),
    ]},
  ];
}

function groupPain008Fields(ver) {
  const isB2B = ver === 'b2b';
  return [
    { section: 'Group Header', fields: [
      tf('GrpHdr_MsgId',       'Message ID',          true, 35, 'MSG20230101001', 'Eindeutige Nachrichtenreferenz', { generate: true }),
      df('GrpHdr_CreDtTm',     'Erstellungszeitpunkt',true,                       'Datum und Uhrzeit der Erstellung'),
      tf('GrpHdr_InitgPty_Nm', 'Name Glaeubigers',    true, 70, 'Muster GmbH',   'Name des Glaeubiger-Unternehmens'),
    ]},
    { section: 'Lastschrift-Info', fields: [
      tf('PmtInf_PmtInfId',   'Payment Info ID',        true,  35, 'PMTINF001', 'Eindeutige ID fuer diesen Block'),
      df('PmtInf_ReqdColltnDt','Faelligkeitsdatum',      true,                   'Faelligkeitsdatum der Lastschrift'),
      tf('PmtInf_Cdtr_Nm',    'Name Glaeubiger',         true,  70, 'Muster GmbH', 'Vollstaendiger Name des Glaeubiger'),
      tf('PmtInf_CdtrAcct_IBAN', 'IBAN Glaeubiger',     true,  34, 'DE89370400440532013000', 'IBAN des Glaeubiger-Kontos'),
      tf('PmtInf_CdtrAgt_BIC',   'BIC Glaeubiger-Bank', true,  11, 'COBADEFFXXX', 'BIC der kontoführenden Bank'),
      tf('PmtInf_CdtrSchmeId', 'Glaeubigeridentifikation (GID)', true, 35, 'DE98ZZZ09999999999', 'SEPA-Glaeubigeridentifikation (Creditor Identifier)'),
      sel('PmtInf_SeqTp',     'Sequenztyp',              true,
        [{v:'FRST',l:'FRST — Erstlastschrift'},{v:'RCUR',l:'RCUR — Folgelastschrift'},{v:'OOFF',l:'OOFF — Einmallastschrift'},{v:'FNAL',l:'FNAL — Letzte Lastschrift'}],
        'Gibt an ob es sich um eine Erst-, Folge-, Einmal- oder Letzteinreichung handelt'),
    ]},
    { section: 'Transaktion', multi: true, fields: [
      tf('Tx_EndToEndId',     'End-to-End-ID',           true,  35, 'EREF001',   'Eindeutige Transaktionsreferenz'),
      nf('Tx_InstdAmt',       'Betrag (EUR)',             true,  '50.00',         'Lastschriftbetrag in EUR'),
      tf('Tx_MndtId',         'Mandatsreferenz',         true,  35, 'MNDT-2023-001', 'Eindeutige Mandatsreferenz'),
      df('Tx_DtOfSgntr',      'Datum der Mandatsunterzeichnung', true,            'Datum, an dem das Mandat unterschrieben wurde (YYYY-MM-DD)'),
      tf('Tx_Dbtr_Nm',        'Name Schuldner',          true,  70, 'Max Mustermann', 'Vollstaendiger Name des Lastschrift-Schuldners'),
      tf('Tx_DbtrAcct_IBAN',  'IBAN Schuldner',          true,  34, 'DE12345678901234567890', 'IBAN des Schuldner-Kontos'),
      tf('Tx_DbtrAgt_BIC',    'BIC Schuldner-Bank',      isB2B, 11, 'SSKMDEMMXXX', isB2B ? 'Pflichtfeld bei B2B-Lastschrift' : 'Optional ab SEPA 3.x'),
      tf('Tx_RmtInf_Ustrd',   'Verwendungszweck',        false, 140, 'Lastschrift Mitgliedsbeitrag', 'Verwendungszweck'),
    ]},
  ];
}

function groupDtazvFields() {
  return [
    { section: 'Auftraggeber (A-Record)', fields: [
      tf('ABlz',      'BLZ Auftraggeber-Bank',    true,  8,  '37040044',   '8-stellige Bankleitzahl des Auftraggebers'),
      tf('AKonto',    'Kontonummer Auftraggeber', true,  10, '0532013000', 'Kontonummer (bis 10 Stellen)'),
      df('ADatum',    'Ausfuehrungsdatum',        true,                    'Gewuenschtes Ausfuehrungsdatum'),
      tf('AOrderType','Auftragsart',              false, 3,  'AZV',        'AZV (Standard) oder AXZ (Express)'),
      tf('AWaehrung', 'Waehrung',                 false, 3,  'EUR',        'ISO 4217 Waehrungskennzeichen (z.B. EUR, USD)'),
    ]},
    { section: 'Transaktion', multi: true, fields: [
      nf('TBetrag',    'Betrag',                  true,  '1234.56',        'Ueberweisungsbetrag (positiv)'),
      tf('TWaehrung',  'Waehrung',                true,  3,  'USD',        'ISO 4217 Zielwaehrung (z.B. USD, GBP, CHF)'),
      tf('TEmpfName',  'Empfaengername',           true,  27, 'John Doe',  'Name des Empfaengers (max 27 Zeichen)'),
      tf('TEmpfAdr1',  'Adresszeile 1',            false, 27, '123 Main St','Strasse und Hausnummer (max 27 Zeichen)'),
      tf('TEmpfAdr2',  'Adresszeile 2',            false, 27, 'New York NY','Stadt / Region (max 27 Zeichen)'),
      tf('TEmpfLand',  'Empfaenger-Land',          true,  2,  'US',        'ISO 3166-1 Laendercode (2-stellig, z.B. US, GB, CH)'),
      tf('TEmpfIban',  'IBAN Empfaenger',          false, 34, '',          'IBAN (wenn vorhanden)'),
      tf('TEmpfBic',   'BIC Empfaenger-Bank',      true,  11, 'CHASUS33XXX','SWIFT/BIC der Empfaengerbank'),
      tf('TEmpfBankName','Name der Empfaengerbank',false, 35, 'JPMorgan Chase','Name der Bank (optional)'),
      tf('TVerwendung','Verwendungszweck',         false, 70, 'Invoice 2024/001','Verwendungszweck (max 70 Zeichen)'),
    ]},
  ];
}

const FIELD_DEFS = {
  'pain.001.001.03': groupPain001Fields('03'),
  'pain.001.001.09': groupPain001Fields('09'),
  'pain.008.001.02': groupPain008Fields('02'),
  'pain.008.001.08': groupPain008Fields('08'),
  'pain.008.003.02': groupPain008Fields('b2b'),
  'dtazv': groupDtazvFields(),
};

module.exports = { FIELD_DEFS };
