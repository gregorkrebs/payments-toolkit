/* chart_helpers.js - Chart.js wrapper functions */
(function() {
  'use strict';

  const charts = {};

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  // Bar chart: credit vs debit for each statement
  window.renderDebitCreditChart = function(canvasId, statements) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const labels  = statements.map((s,i) => s.iban ? s.iban.slice(-6) : `Konto ${i+1}`);
    const credits = statements.map(s => (s.summary?.creditSum || 0));
    const debits  = statements.map(s => (s.summary?.debitSum  || 0));
    charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Gutschriften', data: credits, backgroundColor: 'rgba(60,140,60,0.7)' },
          { label: 'Lastschriften', data: debits, backgroundColor: 'rgba(180,40,40,0.7)' },
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Gutschriften vs. Lastschriften' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  };

  // Line chart: balance over time for a single statement
  window.renderBalanceChart = function(canvasId, stmt) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !stmt) return;
    const txs = stmt.transactions || [];
    if (!txs.length) return;

    // Build running balance from opening
    let openBal = 0;
    if (stmt.openingBalance) {
      openBal = stmt.openingBalance.indicator === 'C' || stmt.openingBalance.indicator === 'CRDT'
        ? stmt.openingBalance.amount : -stmt.openingBalance.amount;
    }
    let running = openBal;
    const labels = [];
    const data   = [];
    for (const tx of txs) {
      running += (tx.amountSigned !== undefined ? tx.amountSigned : (tx.isCredit ? tx.amount : -tx.amount));
      labels.push(tx.bookDate || tx.valDate || '');
      data.push(parseFloat(running.toFixed(2)));
    }
    charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Saldoverlauf', data, fill: false, tension: 0.1, borderColor: '#333', pointRadius: 2 }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Saldoverlauf' } },
        scales: { y: { beginAtZero: false } }
      }
    });
  };
})();
