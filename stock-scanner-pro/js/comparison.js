const ComparisonEngine = {
  METRIC_SECTIONS: [
    {
      name: 'Valoración',
      metrics: [
        { key: 'trailingPE', label: 'P/E (TTM)', fmt: v => v?.toFixed(2), better: 'lower', nullOk: true },
        { key: 'forwardPE', label: 'P/E Adelantado', fmt: v => v?.toFixed(2), better: 'lower', nullOk: true },
        { key: 'priceToBook', label: 'Precio/Valor Contable', fmt: v => v?.toFixed(2), better: 'lower', nullOk: true },
        { key: 'evEBITDA', label: 'EV/EBITDA', fmt: v => v?.toFixed(2), better: 'lower', nullOk: true },
        { key: 'fcfYield', label: 'Rendimiento FCF', fmt: v => v != null ? (v * 100).toFixed(2) + '%' : null, better: 'higher', nullOk: true },
      ]
    },
    {
      name: 'Rentabilidad',
      metrics: [
        { key: 'returnOnEquity', label: 'ROE', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'returnOnAssets', label: 'ROA', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'profitMargins', label: 'Margen Neto', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'operatingMargins', label: 'Margen Operativo', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'grossMargins', label: 'Margen Bruto', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
      ]
    },
    {
      name: 'Crecimiento',
      metrics: [
        { key: 'revenueGrowth', label: 'Crec. Ingresos', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'earningsGrowth', label: 'Crec. Ganancias', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'revenuePerShareGrowth', label: 'Crec. Ingreso/Acción', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
        { key: 'netIncomeGrowth', label: 'Crec. Ingreso Neto', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'higher', nullOk: true },
      ]
    },
    {
      name: 'Salud Financiera',
      metrics: [
        { key: 'debtToEquity', label: 'Deuda/Patrimonio', fmt: v => v?.toFixed(2), better: 'lower', nullOk: true },
        { key: 'currentRatio', label: 'Razón Circulante', fmt: v => v?.toFixed(2), better: 'higher', nullOk: true },
        { key: 'quickRatio', label: 'Prueba Ácida', fmt: v => v?.toFixed(2), better: 'higher', nullOk: true },
        { key: 'freeCashflow', label: 'FCF (B)', fmt: v => v != null ? '$' + (v / 1e9).toFixed(2) + 'B' : null, better: 'higher', nullOk: true },
        { key: 'totalDebt', label: 'Deuda Total (B)', fmt: v => v != null ? '$' + (v / 1e9).toFixed(2) + 'B' : null, better: 'lower', nullOk: true },
      ]
    },
    {
      name: 'Eficiencia',
      metrics: [
        { key: 'assetTurnover', label: 'Rotación de Activos', fmt: v => v?.toFixed(2), better: 'higher', nullOk: true },
        { key: 'inventoryTurnover', label: 'Rotación Inventario', fmt: v => v?.toFixed(2), better: 'higher', nullOk: true },
        { key: 'operatingCashflow', label: 'Flujo Caja Operativo (B)', fmt: v => v != null ? '$' + (v / 1e9).toFixed(2) + 'B' : null, better: 'higher', nullOk: true },
      ]
    },
    {
      name: 'Mercado',
      metrics: [
        { key: 'marketCap', label: 'Cap. Mercado (B)', fmt: v => v != null ? '$' + (v / 1e9).toFixed(1) + 'B' : null, better: 'higher', nullOk: true },
        { key: 'enterpriseValue', label: 'Valor Empresa (B)', fmt: v => v != null ? '$' + (v / 1e9).toFixed(1) + 'B' : null, better: 'higher', nullOk: true },
        { key: 'beta', label: 'Beta', fmt: v => v?.toFixed(2), better: 'neutral', nullOk: true },
        { key: 'dividendYield', label: 'Rendimiento Dividendo', fmt: v => v != null ? (v * 100).toFixed(2) + '%' : null, better: 'higher', nullOk: true },
        { key: 'payoutRatio', label: 'Ratio de Pago', fmt: v => v != null ? (v * 100).toFixed(1) + '%' : null, better: 'neutral', nullOk: true },
        { key: 'fiftyTwoWeekHigh', label: 'Máx. 52 Sem.', fmt: v => v != null ? '$' + v.toFixed(2) : null, better: 'neutral', nullOk: true },
        { key: 'fiftyTwoWeekLow', label: 'Mín. 52 Sem.', fmt: v => v != null ? '$' + v.toFixed(2) : null, better: 'neutral', nullOk: true },
        { key: 'averageVolume', label: 'Vol. Promedio', fmt: v => v != null ? v.toLocaleString() : null, better: 'neutral', nullOk: true },
        { key: 'sharesOutstanding', label: 'Acciones Circulantes (B)', fmt: v => v != null ? (v / 1e9).toFixed(2) + 'B' : null, better: 'neutral', nullOk: true },
      ]
    },
  ],

  async compare(tickerA, tickerB) {
    const [rawA, rawB] = await Promise.all([
      API.fetchFundamentals(tickerA),
      API.fetchFundamentals(tickerB),
    ]);

    const normA = this._normalize(rawA);
    const normB = this._normalize(rawB);

    const enrichedA = this._enrich(normA);
    const enrichedB = this._enrich(normB);

    const sections = this.METRIC_SECTIONS.map(sec => {
      const rows = sec.metrics.map(m => {
        const valA = enrichedA[m.key];
        const valB = enrichedB[m.key];
        const fmtA = m.fmt(valA) || '--';
        const fmtB = m.fmt(valB) || '--';
        let better = 'neutral';
        if (fmtA !== '--' && fmtB !== '--' && m.better !== 'neutral') {
          if (m.better === 'higher') {
            better = valA > valB ? 'A' : valB > valA ? 'B' : 'tie';
          } else {
            better = valA < valB ? 'A' : valB < valA ? 'B' : 'tie';
          }
        }
        return { label: m.label, valA: fmtA, valB: fmtB, cls: better };
      });
      return { name: sec.name, rows };
    });

    return {
      tickerA: tickerA.toUpperCase(),
      tickerB: tickerB.toUpperCase(),
      nameA: rawA.name || tickerA.toUpperCase(),
      nameB: rawB.name || tickerB.toUpperCase(),
      sectorA: rawA.sector || '--',
      sectorB: rawB.sector || '--',
      sections,
    };
  },

  _normalize(raw) {
    const g = (o) => o?.raw != null ? o.raw : (typeof o === 'number' ? o : null);
    return {
      trailingPE: g(raw.trailingPE),
      forwardPE: g(raw.forwardPE),
      priceToBook: g(raw.priceToBook),
      returnOnEquity: g(raw.returnOnEquity),
      returnOnAssets: g(raw.returnOnAssets),
      debtToEquity: g(raw.debtToEquity),
      freeCashflow: g(raw.freeCashflow),
      operatingCashflow: g(raw.operatingCashflow),
      revenueGrowth: g(raw.revenueGrowth),
      earningsGrowth: g(raw.earningsGrowth),
      grossMargins: g(raw.grossMargins),
      operatingMargins: g(raw.operatingMargins),
      profitMargins: g(raw.profitMargins),
      marketCap: g(raw.marketCap),
      enterpriseValue: g(raw.enterpriseValue),
      totalRevenue: g(raw.totalRevenue),
      netIncomeToCommon: g(raw.netIncomeToCommon),
      beta: g(raw.beta),
      dividendYield: g(raw.dividendYield),
      fiftyTwoWeekHigh: g(raw.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: g(raw.fiftyTwoWeekLow),
      averageVolume: g(raw.averageVolume),
      currentRatio: g(raw.currentRatio),
      quickRatio: g(raw.quickRatio),
      totalDebt: g(raw.totalDebt),
      sharesOutstanding: g(raw.sharesOutstanding),
      sector: raw.sector || '--',
      name: raw.name || '',
    };
  },

  _enrich(n) {
    const ev = n.enterpriseValue;
    const ebitda = n.operatingCashflow != null ? n.operatingCashflow * 1.15 : null;
    return {
      ...n,
      evEBITDA: ev != null && ebitda != null && ebitda !== 0 ? ev / ebitda : null,
      fcfYield: n.marketCap != null && n.freeCashflow != null && n.marketCap > 0 ? n.freeCashflow / n.marketCap : null,
      revenuePerShareGrowth: n.revenueGrowth,
      netIncomeGrowth: n.earningsGrowth,
      assetTurnover: n.totalRevenue != null && n.enterpriseValue != null ? n.totalRevenue / n.enterpriseValue : null,
      payoutRatio: n.dividendYield != null && n.earningsGrowth != null && n.earningsGrowth !== 0 ? n.dividendYield / (n.earningsGrowth + 0.01) : null,
    };
  },

  render(data) {
    const container = document.getElementById('compResults');
    const empty = document.getElementById('compEmpty');
    if (!data) { empty.style.display = 'flex'; container.innerHTML = ''; return; }
    empty.style.display = 'none';

    let html = '';
    for (const sec of data.sections) {
      html += `<div class="comp-card"><div class="comp-section-title">${sec.name}</div><table class="comp-table"><thead><tr><th>Métrica</th><th>${data.tickerA} <span class="comp-header-ticker">${data.nameA}</span></th><th>${data.tickerB} <span class="comp-header-ticker">${data.nameB}</span></th></tr></thead><tbody>`;
      for (const r of sec.rows) {
        let clsA = 'comp-value-neutral', clsB = 'comp-value-neutral', badge = '';
        if (r.cls === 'A') { clsA = 'comp-value-better'; clsB = 'comp-value-worse'; badge = '<span class="comp-winner-badge">mejor</span>'; }
        else if (r.cls === 'B') { clsA = 'comp-value-worse'; clsB = 'comp-value-better'; badge = '<span class="comp-winner-badge" style="background:rgba(38,166,154,0.15);color:var(--accent-green)">mejor</span>'; }
        else if (r.cls === 'tie') { clsA = 'comp-value-neutral'; clsB = 'comp-value-neutral'; }
        html += `<tr><td>${r.label}</td><td class="${clsA}">${r.valA}${r.cls === 'A' ? badge : ''}</td><td class="${clsB}">${r.valB}${r.cls === 'B' ? badge : ''}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }
    container.innerHTML = html;
  },
};
