'use strict';
// Felddefinitionen fuer Zahlungsdatei-Creator
// Format: { name, label, type, required, maxLen, pattern, placeholder, help, section }
// section: 'grpHdr' | 'pmtInf' | 'cdtTrf' | 'dbtInf' | 'mndtInf'

const FIELD_DEFS = {
  'pain.001.001.03': groupPain001Fields('03'),
  'pain.001.001.09': groupPain001Fields('09'),
  'pain.008.001.02': groupPain008Fields('02'),
  'pain.008.001.08': groupPain008Fields('08'),
  'pain.008.003.02': groupPain008Fields('b2b'),
};

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

function groupPain001Fields(ver) {
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
      tf('PmtInf_Dbtr_Ctry', 'Land Auftraggeber', false,  2, 'DE',              'ISO 3166-1 Laendercode, z.B. DE'),
      tf('PmtInf_Dbtr_AdrLine', 'Adresse (Strassenzeile)', false, 70, 'Musterstr. 1, 12345 Musterstadt', 'Strassenadresse'),
      tf('PmtInf_DbtrAcct_IBAN', 'IBAN Auftraggeber', true, 34, 'DE89370400440532013000', 'IBAN des Auftraggeberkontos (ISO 13616)'),
      tf('PmtInf_DbtrAgt_BIC',   'BIC Auftraggeber-Bank', ver === '09' ? false : true, 11, 'COBADEFFXXX', 'BIC der kontoführenden Bank (optional ab SEPA 3.7)'),
    ]},
    { section: 'Transaktion', multi: true, fields: [
      tf('Tx_EndToEndId',    'End-to-End-ID',     true,  35, 'EREF001',          'Eindeutige Transaktionsreferenz (wird unveraendert weitergeleitet)'),
      nf('Tx_Amt',           'Betrag (EUR)',       true,  '1234.56',             'Ueberweisungsbetrag in EUR'),
      tf('Tx_Cdtr_Nm',       'Name Empfaenger',   true,  70, 'Max Mustermann',   'Vollstaendiger Name des Empfaengers'),
      tf('Tx_Cdtr_Ctry',     'Land Empfaenger',   false,  2, 'DE',               'ISO 3166-1 Laendercode'),
      tf('Tx_Cdtr_AdrLine',  'Adresse Empfaenger',false, 70, 'Beispielstr. 5, 10115 Berlin', 'Strassenadresse des Empfaengers'),
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

module.exports = { FIELD_DEFS };
