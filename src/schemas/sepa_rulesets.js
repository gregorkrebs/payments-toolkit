'use strict';
// SEPA Regelwerke: Auftragsart -> verfuegbare PAIN-Versionen und Beschreibung
const RULESETS = {
  CCT: [
    { id: 'pain.001.001.03', label: 'SEPA Credit Transfer 2.x (pain.001.001.03)', ruleset: 'EPC125-05 v2.x', validFrom: '2009-01-01', note: 'Aeltere Version, vor 2019 Standard' },
    { id: 'pain.001.001.09', label: 'SEPA Credit Transfer 3.7 (pain.001.001.09)', ruleset: 'EPC125-05 v3.7 (2023)', validFrom: '2023-11-19', note: 'Aktueller Standard ab 2023, Pflicht in de facto allen Banken' },
  ],
  CCU: [
    { id: 'pain.001.001.09', label: 'SEPA Urgent Credit Transfer 3.7 (pain.001.001.09)', ruleset: 'EPC125-05 v3.7 (2023)', validFrom: '2023-11-19', note: 'Eilueberweisung, gleiche Dateistruktur wie CCT, Auftragsart CCU' },
  ],
  CTV: [
    { id: 'pain.001.001.03', label: 'SEPA Credit Transfer Validation 2.x (pain.001.001.03)', ruleset: 'EPC125-05 v2.x', validFrom: '2009-01-01' },
    { id: 'pain.001.001.09', label: 'SEPA Credit Transfer Validation 3.7 (pain.001.001.09)', ruleset: 'EPC125-05 v3.7 (2023)', validFrom: '2023-11-19' },
  ],
  CDD: [
    { id: 'pain.008.001.02', label: 'SEPA Direct Debit Core 2.x (pain.008.001.02)', ruleset: 'EPC130-08 v2.x', validFrom: '2009-11-01', note: 'Basislastschrift, Verbraucher' },
    { id: 'pain.008.001.08', label: 'SEPA Direct Debit Core 3.x (pain.008.001.08)', ruleset: 'EPC130-08 v3.x (2023)', validFrom: '2023-11-19', note: 'Aktueller Standard Basislastschrift' },
  ],
  CDB: [
    { id: 'pain.008.003.02', label: 'SEPA Direct Debit B2B (pain.008.003.02)', ruleset: 'EPC222-07 v2.x', validFrom: '2010-11-01', note: 'B2B-Lastschrift, nur Firmenkunden' },
  ],
  AZV: [
    { id: 'dtazv', label: 'DTAZV 6.0 — Auslandszahlung', ruleset: 'DTAZV 6.0', validFrom: '2010-01-01', note: 'Fremdwaehrungszahlung / Auslandsueberweisung' },
  ],
  AXZ: [
    { id: 'dtazv', label: 'DTAZV 6.0 — Auslandszahlung Express (AXZ)', ruleset: 'DTAZV 6.0', validFrom: '2010-01-01', note: 'Express-Auslandszahlung, gleicher Aufbau wie AZV' },
  ],
};

const ORDER_TYPES_META = {
  CCT: { label: 'CCT — SEPA Credit Transfer', description: 'Standardueberweisung im SEPA-Raum', icon: 'arrow-right' },
  CCU: { label: 'CCU — SEPA Urgent Credit Transfer', description: 'Eilueberweisung (same-day oder next-day)', icon: 'lightning' },
  CTV: { label: 'CTV — Credit Transfer Validation', description: 'Pruefauftragsart fuer Ueberweisungen', icon: 'check' },
  CDD: { label: 'CDD — SEPA Direct Debit Core', description: 'SEPA-Basislastschrift fuer Verbraucher und Unternehmen', icon: 'arrow-left' },
  CDB: { label: 'CDB — SEPA Direct Debit B2B', description: 'SEPA-Firmenlastschrift (nur Unternehmenskonten)', icon: 'building' },
  AZV: { label: 'AZV — Auslandszahlung (DTAZV)', description: 'Fremdwaehrungs- und Auslandsueberweisungen', icon: 'globe' },
  AXZ: { label: 'AXZ — Auslandszahlung Express', description: 'Eilige Auslandszahlungen', icon: 'globe-fast' },
};

module.exports = { RULESETS, ORDER_TYPES_META };
