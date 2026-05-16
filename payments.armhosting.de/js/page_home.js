/* page_home.js - Homepage mit Modulkacheln */
(function() {
  'use strict';
  const modules = [
    {
      page: 'validate',
      title: 'Zahlungsdatei-Validierung',
      desc: 'PAIN-XML (001/002/008) und DTAZV-Dateien auf Gültigkeit prüfen. Fehlerfelder werden exakt benannt.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>'
    },
    {
      page: 'statement',
      title: 'Kontoauszüge',
      desc: 'STA (MT940), C53 (CAMT.053) und C53-Archiv-XML einlesen, grafisch aufbereiten und als CSV exportieren.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>'
    },
    {
      page: 'convert',
      title: 'Konvertierung',
      desc: 'STA ↔ C53, C53-XML → STA, PAIN v03 ↔ v09, PAIN.008 v02 ↔ v08.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4"/></svg>'
    },
    {
      page: 'create',
      title: 'Zahlungsdatei erstellen',
      desc: 'Auftragsart + Regelwerk auswählen, Formular ausfüllen, XML-Datei generieren und direkt validieren.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
    },
    {
      page: 'tools',
      title: 'IBAN-Tools',
      desc: 'IBAN prüfen, berechnen (Land+BBAN), DE-Komfortmodus (BLZ+Konto), IBAN zerlegen, Batch-Prüfung.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
    },
    {
      page: 'samples',
      title: 'Beispieldaten',
      desc: 'STA (MT940) oder C53 (CAMT.053 XML) Beispieldateien mit 1-250 zufälligen Umsätzen aus 250 Mustertransaktionen generieren.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M2 12l5-5M2 12l5 5"/><circle cx="12" cy="12" r="3"/></svg>'
    },
    {
      page: 'packer',
      title: 'C53 Packer',
      desc: 'Mehrere CAMT.053 XML-Dateien zu einer .C53 ZIP-Archiv-Datei zusammenpacken. Dateiname: YYYYMMDDHHMM.C53.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
    },
    {
      page: 'identities',
      title: 'Identitäten generieren',
      desc: 'Realistische Testidentitäten mit Bankdaten, Adresse und Kontaktdaten generieren.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    },
    {
      page: 'merge',
      title: 'Zahlungen zusammenfassen',
      desc: 'Mehrere Zahlungsdateien (CCT/CCU) zusammenfassen und als einheitliche pain.001.003.03 exportieren.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/><path d="M7 12h10M12 7v10"/></svg>'
    },
  ];
  function render() {
    const grid = document.getElementById('home-cards');
    if (!grid) return;
    grid.innerHTML = modules.map(m =>
      `<div class="card">
        <div class="card-icon">${m.icon}</div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.desc)}</p>
        <a href="#${m.page}" class="card-link">Öffnen</a>
      </div>`
    ).join('');
  }
  document.addEventListener('DOMContentLoaded', render);
})();
