/* page_statement.js - Kontoauszuege anzeigen + CSV-Export */
(function() {
  'use strict';

  let parsedData = null;
  let currentFile = null;

  function init() {
    initUploadZone('statement-upload-area', 'statement-file-input', function(file, zone) {
      currentFile = file;
      setZoneFile(zone, file);
      runParse(file);
    });
    document.getElementById('stmt-select').addEventListener('change', function() {
      if (parsedData) renderStatement(parsedData, parseInt(this.value) || 0);
    });
    document.getElementById('stmt-export-csv-btn').addEventListener('click', exportCsv);
    document.getElementById('stmt-export-pdf-btn').addEventListener('click', exportPdf);
  }

  async function runParse(file) {
    setLoading('statement-result', 'Datei wird eingelesen...');
    document.getElementById('statement-controls').style.display = 'none';
    document.getElementById('statement-charts').style.display   = 'none';
    try {
      parsedData = await uploadFile('/api/parse/statement', file);
      renderAllStatements(parsedData);
    } catch(e) {
      document.getElementById('statement-result').innerHTML = statusBox(false, 'Fehler', esc(e.message));
    }
  }

  function renderAllStatements(data) {
    if (!data || !data.statements || !data.statements.length) {
      document.getElementById('statement-result').innerHTML = statusBox(false, 'Keine Kontodaten gefunden');
      return;
    }
    const sel = document.getElementById('stmt-select');
    sel.innerHTML = '';
    data.statements.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${s.iban || s.accountId || 'Konto ' + (i+1)} (${s.transactions?.length || 0} Buchungen)`;
      sel.appendChild(opt);
    });
    document.getElementById('statement-controls').style.display = 'flex';
    renderStatement(data, 0);
    document.getElementById('statement-charts').style.display = 'block';
    renderDebitCreditChart('chart-debitcredit', data.statements);
    renderBalanceChart('chart-balance', data.statements[0]);
  }

  function renderStatement(data, idx) {
    const stmt = data.statements[idx];
    if (!stmt) return;
    const el = document.getElementById('statement-result');
    const txs = stmt.transactions || [];

    // Summary row
    const openBal  = stmt.openingBalance;
    const closeBal = stmt.closingBalance;
    const creditSum = txs.reduce((s,t) => t.isCredit ? s + (t.amount||0) : s, 0);
    const debitSum  = txs.reduce((s,t) => t.isDebit  ? s + (t.amount||0) : s, 0);
    stmt.summary = { creditSum, debitSum };

    let html = renderSummary([
      { label: 'IBAN / Konto',    value: stmt.iban || stmt.accountId || '—' },
      { label: 'Währung',        value: stmt.currency || '—' },
      { label: 'Erüffnungssaldo',value: openBal  ? (openBal.indicator + ' ' + fmtAmt(openBal.amount, openBal.currency)) : '—' },
      { label: 'Schlusssaldo',    value: closeBal ? (closeBal.indicator + ' ' + fmtAmt(closeBal.amount, closeBal.currency)) : '—' },
      { label: 'Buchungen',       value: txs.length },
      { label: 'Gutschriften ∑',  value: fmtAmt(creditSum), cls: 'amt-credit' },
      { label: 'Lastschriften ∑', value: fmtAmt(debitSum),  cls: 'amt-debit' },
    ]);

    // Transaction table
    html += `<table class="data-table">
      <thead><tr>
        <th>Buchungsdatum</th><th>Wertstellung</th><th>S/H</th>
        <th>Betrag</th><th>Buchungstext</th><th>Verwendungszweck</th>
        <th>Zusatzinfo</th><th>Gegenkonto</th><th>Gegenkonto Name</th><th>Referenz</th>
      </tr></thead>
      <tbody>`;
    html += txs.map(t => {
      const isCr  = t.isCredit;
      const amtCls= isCr ? 'amt-credit' : 'amt-debit';
      const vzweck = typeof t.verwendungszweck === 'string' ? t.verwendungszweck : (t.remittanceInfo ? String(t.remittanceInfo) : '');
      const zusatz = t.addtlNtryInf || '';
      return `<tr>
        <td>${esc(t.bookDate||t.valueDate||'')}</td>
        <td>${esc(t.valDate||t.valueDate||'')}</td>
        <td>${isCr?'H':'S'}</td>
        <td class="${amtCls}">${fmtAmt(t.amount, stmt.currency)}</td>
        <td>${esc(t.buchungstext||t.transactionCode||'')}</td>
        <td>${esc(vzweck)}</td>
        <td>${esc(zusatz)}</td>
        <td>${esc(t.gegenkontoIban||t.counterpartIban||'')}</td>
        <td>${esc(t.gegenkontoName||t.counterpartName||'')}</td>
        <td>${esc(t.reference||t.txRef||'')}</td>
      </tr>`;
    }).join('');
    html += '</tbody></table>';
    el.innerHTML = html;

    // Update balance chart for this statement
    renderBalanceChart('chart-balance', stmt);
  }

  async function exportCsv() {
    if (!currentFile) return;
    try {
      const fd   = new FormData();
      fd.append('file', currentFile);
      const resp = await fetch('/api/export/csv', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      triggerDownload(blob, currentFile.name.replace(/\.\w+$/, '') + '_export.csv', 'text/csv');
    } catch(e) {
      alert('CSV-Export fehlgeschlagen: ' + e.message);
    }
  }

  function exportPdf() {
    if (!parsedData || !parsedData.statements) return;
    const idx  = parseInt(document.getElementById('stmt-select').value) || 0;
    const stmt = parsedData.statements[idx];
    if (!stmt) return;
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      alert('PDF-Export nicht verfuegbar (jsPDF nicht geladen).');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const txs  = stmt.transactions || [];
    const openBal  = stmt.openingBalance;
    const closeBal = stmt.closingBalance;
    const ibanStr  = stmt.iban || stmt.accountId || '—';

    doc.setFontSize(14);
    doc.text('Kontoauszug', 14, 15);
    doc.setFontSize(10);
    doc.text(`IBAN: ${ibanStr}   Währung: ${stmt.currency || '—'}`, 14, 22);
    const balLine = [
      openBal  ? `Erüffnungssaldo: ${openBal.indicator}  ${openBal.amount?.toFixed(2)}  ${openBal.currency}` : '',
      closeBal ? `Schlusssaldo: ${closeBal.indicator}  ${closeBal.amount?.toFixed(2)}  ${closeBal.currency}` : '',
    ].filter(Boolean).join('     ');
    if (balLine) doc.text(balLine, 14, 28);
    doc.text(`Buchungen: ${txs.length}   Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 14, 34);

    const body = txs.map(t => [
      t.bookDate || t.valueDate || '',
      t.isCredit ? 'H' : 'S',
      (t.amount || 0).toFixed(2),
      t.buchungstext || t.transactionCode || '',
      (typeof t.verwendungszweck === 'string' ? t.verwendungszweck : (t.remittanceInfo || '')).slice(0, 60),
      t.gegenkontoName || t.counterpartName || '',
      t.gegenkontoIban || t.counterpartIban || '',
    ]);

    doc.autoTable({
      startY: 38,
      head: [['Datum', 'S/H', 'Betrag', 'Buchungstext', 'Verwendungszweck', 'Name Gegenkonto', 'IBAN Gegenkonto']],
      body,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: { 4: { cellWidth: 65 } },
    });

    const safe = ibanStr.replace(/\s/g, '');
    doc.save(`kontoauszug_${safe}.pdf`);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
