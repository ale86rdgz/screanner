const ReportEngine = {
  generateHTML(results) {
    const report = this.generate(results);
    return this.formatHTML(report);
  },
  // server-side version that returns raw data
  generateRawReport(results) {
    return this.generate(results);
  },
  getHTML(report) {
    return this.formatHTML(report);
  },
  generate(results) {
    if (!results || results.length === 0) return null;

    const valid = results.filter(r => !r.error && r.technical && !r.technical.error && r.longConditions && r.mcPass !== false);
    if (valid.length === 0) return null;

    const lcOf = (r) => (r.longConditions && r.longConditions.count) || 0;
    const lc4hOf = (r) => {
      const t = r.technical4h;
      if (!t || t.error) return 0;
      const lc = ScoringEngine.countSignals(r.fundamental, t);
      return lc ? lc.count : 0;
    };
    const techTiebreak = (t) => {
      if (!t) return 0;
      let s = 0;
      if (t.isMACDBullish) s += 2;
      if (t.macdCross && t.macdCross.direction === 'up') s += 2;
      if (t.sma200Trend === 'up') s += 2;
      if (t.distanceFromSMA200 > 0) s += 1;
      if (t.macdImproving) s += 1;
      if (t.rsi >= 45 && t.rsi <= 60) s += 1;
      return s;
    };
    const sorted = [...valid].sort((a, b) => {
      const d = lcOf(b) - lcOf(a);
      return d !== 0 ? d : techTiebreak(b.technical) - techTiebreak(a.technical);
    });
    const sorted4h = [...valid].sort((a, b) => {
      const d = lc4hOf(b) - lc4hOf(a);
      return d !== 0 ? d : techTiebreak(b.technical4h) - techTiebreak(a.technical4h);
    });
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const strong = valid.filter(r => lcOf(r) >= 15);
    const moderate = valid.filter(r => lcOf(r) >= 10 && lcOf(r) < 15);
    const weak = valid.filter(r => lcOf(r) < 10);

    const sectorMap = {};
    valid.forEach(r => {
      const s = r.stock.sector;
      if (!sectorMap[s]) sectorMap[s] = { count: 0, totalLong: 0 };
      sectorMap[s].count++;
      sectorMap[s].totalLong += lcOf(r);
    });

    const topPicks = sorted.slice(0, 15).map(r => {
      const expl = ExplanationEngine.generate(r.stock.ticker, r.stock.name, r.fundamental, r.technical, r.score);
      const topReason = expl.reasons.length > 0 ? expl.reasons[0].text : (expl.summary || '');
      const dropReason = FundamentalEngine.detectDropReason(r.fundamental, r.technical);
      const t = r.technical;
      const t4 = r.technical4h;
      return {
        result: r,
        explanation: expl,
        topReason,
        dropReason,
        rsi: t && t.rsi != null ? t.rsi : null,
        macdUp: !!(t && t.macdCross && t.macdCross.direction === 'up'),
        macdDown: !!(t && t.macdCross && t.macdCross.direction === 'down'),
        macdBullish: !!(t && t.isMACDBullish),
        macdBelowZero: !!(t && t.macdCrossBelowZero),
        lcCount: lcOf(r),
        lcTotal: 20,
        sma200Trend: t && t.sma200Trend ? t.sma200Trend : '--',
        distSMA200: t && t.distanceFromSMA200 != null ? t.distanceFromSMA200 : null,
        distSMA30: t && t.distanceFromSMA30 != null ? t.distanceFromSMA30 : null,
        distWMA21: t && t.distanceFromWMA21 != null ? t.distanceFromWMA21 : null,
        distVWAP20: t && t.distanceFromVWAP20 != null ? t.distanceFromVWAP20 : null,
        rsi4h: t4 && t4.rsi != null ? t4.rsi : null,
        macdUp4h: !!(t4 && t4.macdCross && t4.macdCross.direction === 'up'),
        macdDown4h: !!(t4 && t4.macdCross && t4.macdCross.direction === 'down'),
        macdBullish4h: !!(t4 && t4.isMACDBullish),
        macdBelowZero4h: !!(t4 && t4.macdCrossBelowZero),
        sma200Trend4h: t4 && t4.sma200Trend ? t4.sma200Trend : '--',
        distVWAP20_4h: t4 && t4.distanceFromVWAP20 != null ? t4.distanceFromVWAP20 : null,
        distSMA200_4h: t4 && t4.distanceFromSMA200 != null ? t4.distanceFromSMA200 : null,
        lcCount4h: lc4hOf(r),
        lcTotal4h: 20,
        stage: r.weinstein && r.weinstein.stage ? r.weinstein.stage : null,
      };
    });

    const extreme = valid.filter(r => {
      const f = r.fundamental;
      const t = r.technical;
      return f && t && FundamentalEngine.isExtremeSetup(f, t);
    });

    const quality = valid.filter(r => {
      const f = r.fundamental;
      const t = r.technical;
      if (!f) return false;
      const isQuality = f.isQuality;
      const undervalued = f.pe > 0 && f.peBelowHistorical;
      const decentDrop = t && t.dropFromHigh >= 15;
      return isQuality && (undervalued || decentDrop);
    });

    const risks = [];
    valid.forEach(r => {
      const f = r.fundamental;
      if (f && f.debtToEquity > 3) risks.push({ ticker: r.stock.ticker, text: `Deuda elevada (D/E: ${f.debtToEquity.toFixed(2)})` });
      if (f && f.revenueGrowth !== null && f.revenueGrowth < -0.05) risks.push({ ticker: r.stock.ticker, text: `Ingresos en declive (${(f.revenueGrowth * 100).toFixed(1)}%)` });
      if (f && f.epsGrowth !== null && f.epsGrowth < -0.1) risks.push({ ticker: r.stock.ticker, text: `Ganancias en declive (${(f.epsGrowth * 100).toFixed(1)}%)` });
    });

    const topSectors = Object.entries(sectorMap)
      .map(([name, data]) => ({ name, count: data.count, avgScore: Math.round(data.totalLong / data.count) }))
      .sort((a, b) => b.avgScore - a.avgScore);

    // RSI ranking (daily): top 10 highest / lowest
    const rsiCandidates = valid
      .filter(r => r.technical && !r.technical.error && r.technical.rsi != null)
      .map(r => ({
        ticker: r.stock.ticker,
        name: r.stock.name,
        price: r.price,
        change: r.change,
        rsi: r.technical.rsi,
      }));
    const topRSI = [...rsiCandidates].sort((a, b) => b.rsi - a.rsi).slice(0, 10);
    const lowRSI = [...rsiCandidates].sort((a, b) => a.rsi - b.rsi).slice(0, 10);

    // Bullish MACD cross below zero within last 3 daily candles
    const macdBullishBelowZero3d = valid
      .filter(r => r.technical && !r.technical.error &&
        r.technical.macdCross &&
        r.technical.macdCross.direction === 'up' &&
        r.technical.macdCross.belowZero &&
        r.technical.macdCross.daysAgo != null &&
        r.technical.macdCross.daysAgo <= 3)
      .map(r => ({
        ticker: r.stock.ticker,
        name: r.stock.name,
        price: r.price,
        change: r.change,
        rsi: r.technical.rsi != null ? r.technical.rsi : null,
        macdLine: r.technical.macdLine,
        macdSignal: r.technical.macdSignal,
        daysAgo: r.technical.macdCross.daysAgo,
      }))
      .sort((a, b) => a.daysAgo - b.daysAgo);

    const has4h = valid.some(r => r.technical4h && !r.technical4h.error && r.technical4h.rsi != null);

    return {
      date: dateStr,
      time: timeStr,
      totalScanned: results.length,
      validCount: valid.length,
      strongCount: strong.length,
      moderateCount: moderate.length,
      weakCount: weak.length,
      topPicks,
      swingPicks: has4h ? sorted4h.slice(0, 15) : [],
      extreme,
      quality,
      risks: risks.slice(0, 15),
      sectors: topSectors,
      avgLong: Math.round(valid.reduce((s, r) => s + lcOf(r), 0) / valid.length),
      maxLong: 20,
      topLong: lcOf(sorted[0] || {}),
      avgLong4h: has4h ? (valid.length ? Math.round(valid.reduce((s, r) => s + lc4hOf(r), 0) / valid.length) : 0) : 0,
      topLong4h: has4h ? lc4hOf(sorted4h[0] || {}) : 0,
      has4h,
      topRSI,
      lowRSI,
      macdBullishBelowZero3d,
    };
  },

  formatHTML(report) {
    if (!report) return '<p style="color:#666;text-align:center;padding:40px">No hay datos disponibles.</p>';

    const scoreColor = (s) => s >= 60 ? '#1b8a3d' : s >= 40 ? '#b8860b' : '#c0392b';
    const scoreBg = (s) => s >= 60 ? '#e8f5e9' : s >= 40 ? '#fff8e1' : '#fbe9e7';
    const lcColor = (c) => c >= 15 ? '#1b8a3d' : c >= 10 ? '#b8860b' : '#c0392b';
    const lcBg = (c) => c >= 15 ? '#e8f5e9' : c >= 10 ? '#fff8e1' : '#fbe9e7';
    const chgClass = (v) => (v || 0) >= 0 ? '<span style="color:#1b8a3d">' : '<span style="color:#c0392b">';
    const chgSign = (v) => (v || 0) >= 0 ? '+' : '';
    const fmtD = (v) => typeof v === 'number' ? v.toFixed(1) : '--';
    const fmtP = (v) => v ? '$' + v.toFixed(2) : '--';
    const rsiTxt = (p) => p.rsi != null ? `${p.rsi.toFixed(1)}` : '--';
    const rsiColor = (r) => r.rsi != null ? (r.rsi < 35 ? '#1b8a3d' : r.rsi > 70 ? '#c0392b' : '#555') : '#888';
    const macdTxt = (p) => p.macdUp ? '▲ Cruz alcista' : p.macdDown ? '▼ Cruz bajista' : (p.macdBullish ? '▲ Alcista' : '—');
    const macdColor = (p) => p.macdDown ? '#c0392b' : (p.macdUp || p.macdBullish) ? '#1b8a3d' : '#888';
    const macdTxt4h = (r) => {
      const t = r.technical4h;
      if (!t || !t.macdCross) return (t && t.isMACDBullish) ? '▲ Alcista' : '—';
      const dir = t.macdCross.direction === 'up' ? '▲ Cruz alcista' : '▼ Cruz bajista';
      return t.macdCross.belowZero ? dir + ' (bajo 0)' : dir;
    };
    const macdColor4h = (r) => {
      const t = r.technical4h;
      if (!t || !t.macdCross) return (t && t.isMACDBullish) ? '#1b8a3d' : '#888';
      return t.macdCross.direction === 'up' ? '#1b8a3d' : '#c0392b';
    };
    const distTxt = (v) => v === null || v === undefined ? '--' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    const distColor = (v) => v == null ? '#888' : v >= 0 ? '#1b8a3d' : '#c0392b';
    const trendTxt = (tr) => tr === 'up' ? '↑ Alcista' : tr === 'down' ? '↓ Bajista' : '→ Plana';
    const trendColor = (tr) => tr === 'up' ? '#1b8a3d' : tr === 'down' ? '#c0392b' : '#888';
    const STAGE = {
      0: { txt: 'Sin datos', color: '#888' },
      1: { txt: 'E1 Acum.', color: '#1565c0' },
      2: { txt: 'E2 Alcista', color: '#1b8a3d' },
      3: { txt: 'E3 Distrib.', color: '#b8860b' },
      4: { txt: 'E4 Bajista', color: '#c0392b' },
    };
    const stageTxt = (s) => s == null || !STAGE[s] ? '—' : STAGE[s].txt;
    const stageColor = (s) => s == null || !STAGE[s] ? '#888' : STAGE[s].color;

    const rows = report.topPicks.slice(0, 8).map((pick, i) => {
      const r = pick.result;
      return `<tr>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-weight:700;font-size:13px;color:#1565c0">#${i+1} ${r.stock.ticker}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#555">${r.stock.name}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${fmtP(r.price)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${chgClass(r.change)}${chgSign(r.change)}${fmtD(r.change)}%</span></td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;color:${rsiColor(pick)}">${rsiTxt(pick)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-size:11px;font-weight:600;color:${macdColor(pick)}">${macdTxt(pick)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;text-align:center;color:${stageColor(pick.stage)};font-size:11px;font-weight:700">${stageTxt(pick.stage)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;text-align:center">
          <span style="display:inline-block;padding:2px 9px;border-radius:4px;font-weight:700;font-size:13px;color:${lcColor(pick.lcCount)};background:${lcBg(pick.lcCount)}" title="${pick.lcCount}/20 señales · ${pick.lcCount * 5}/100 pts">${pick.lcCount}/${pick.lcTotal} · ${pick.lcCount * 5}</span>
        </td>
        <td style="padding:9px 8px;border-bottom:1px solid #e0e0e0;font-size:11px;color:#555;line-height:1.4">${pick.topReason.slice(0, 120)}</td>
      </tr>`;
    }).join('');

    const extRows = report.extreme.slice(0, 5).map(r => {
      return `<tr>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-weight:600;font-size:12px;color:#1565c0">${r.stock.ticker}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#555">${r.stock.name}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${fmtP(r.price)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;color:#c0392b">-${fmtD(r.technical.dropFromHigh)}%</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;color:#e65100">${fmtD(r.technical.rsi)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:${scoreColor(r.score.overall)};background:${scoreBg(r.score.overall)}">${r.score.overall}</span>
        </td>
      </tr>`;
    }).join('');

    const qRows = report.quality.slice(0, 5).map(r => {
      return `<tr>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-weight:600;font-size:12px;color:#1565c0">${r.stock.ticker}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#555">${r.stock.name}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${fmtP(r.price)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${r.fundamental ? r.fundamental.pe.toFixed(1) : '--'}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px">${r.fundamental ? (r.fundamental.roe * 100).toFixed(1) + '%' : '--'}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #e0e0e0;text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:${scoreColor(r.score.overall)};background:${scoreBg(r.score.overall)}">${r.score.overall}</span>
        </td>
      </tr>`;
    }).join('');

    const secRows = report.sectors.slice(0, 12).map(s => {
      const c = s.avgScore >= 60 ? '#1b8a3d' : s.avgScore >= 40 ? '#b8860b' : '#c0392b';
      const barW = Math.min(s.avgScore, 100);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eceff1;font-size:12px;color:#333">${s.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eceff1;font-size:12px;text-align:center;color:#555">${s.count} acciones</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eceff1;font-size:12px">
          <div style="background:#e0e0e0;border-radius:3px;height:14px;width:120px;display:inline-block;vertical-align:middle">
            <div style="background:${c};border-radius:3px;height:14px;width:${barW}%"></div>
          </div>
          <span style="margin-left:6px;font-weight:600;color:${c}">${s.avgScore}</span>
        </td>
      </tr>`;
    }).join('');

    const riskRows = report.risks.length > 0
      ? report.risks.slice(0, 10).map(r => `<tr><td style="padding:5px 8px;border-bottom:1px solid #eceff1;font-size:11px;color:#333"><strong>${r.ticker}</strong>: ${r.text}</td></tr>`).join('')
      : '<tr><td style="padding:10px;font-size:12px;color:#888;text-align:center">No se detectaron riesgos significativos.</td></tr>';

    return `
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:700px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;color:#333;font-size:14px;line-height:1.5">
<tr><td style="padding:20px 20px 0">

  <!-- HEADER -->
  <table cellpadding="0" cellspacing="0" width="100%" style="border-bottom:2px solid #1565c0;padding-bottom:14px;margin-bottom:18px">
  <tr>
    <td>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#1565c0">Informe de Oportunidades</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#888">${report.date} &middot; ${report.time} &middot; ${report.validCount} acciones analizadas de ${report.totalScanned}</p>
    </td>
    <td align="right" style="font-size:11px;color:#aaa;vertical-align:top">S&P 500<br>Opportunity Scanner</td>
  </tr>
  </table>

  <!-- SUMMARY CARDS -->
  <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px">
  <tr>
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#e8f5e9;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#1b8a3d">${report.strongCount}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#388e3c">Fuertes</div></td></tr>
      </table>
    </td>
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#fff8e1;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#b8860b">${report.moderateCount}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#8d6e00">Moderadas</div></td></tr>
      </table>
    </td>
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#fbe9e7;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#c0392b">${report.weakCount}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#c0392b">Debiles</div></td></tr>
      </table>
    </td>
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#e3f2fd;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#1565c0">${report.avgLong}<span style="font-size:14px;color:#90a4ae">/${report.maxLong}</span></div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#1565c0">Señales Prom.</div></td></tr>
      </table>
    </td>
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#f3e5f5;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#7b1fa2">${report.extreme.length}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#7b1fa2">Extremas</div></td></tr>
      </table>
    </td>
    ${report.has4h ? `
    <td width="16.6%" style="padding:4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#f3e5f5;border-radius:6px">
      <tr><td style="text-align:center;padding:12px 6px"><div style="font-size:26px;font-weight:700;color:#7b1fa2">${report.avgLong4h}<span style="font-size:14px;color:#90a4ae">/${report.maxLong}</span></div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#7b1fa2">Señales Prom 4H</div></td></tr>
      </table>
    </td>` : ''}
  </tr>
  </table>

  <!-- TOP PICKS -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">★ Mejores por Señales (15 técnicas + 5 fundamentales)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">% Hoy</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">MACD</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Etapa</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Señales</th>
    <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Razon</th>
  </tr>
  </thead>
  <tbody>
  ${rows}
  </tbody>
  </table>

  <!-- LONG SIGNALS TABLE -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">⚓ Señales Alcistas Diarias (RSI · MACD · Medias · VWAP)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">MACD</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Tend. MA200</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Dist MA200</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Dist MA30</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Dist WMA21</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">VWAP</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Etapa</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Señales</th>
  </tr>
  </thead>
  <tbody>
  ${report.topPicks.map(pick => `<tr>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-weight:600;font-size:12px;color:#1565c0">${pick.result.stock.ticker}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${rsiColor(pick)}">${rsiTxt(pick)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:11px;font-weight:600;color:${macdColor(pick)}">${macdTxt(pick)}${pick.macdBelowZero ? ' <span style="color:#7b1fa2">(bajo 0)</span>' : ''}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:11px;font-weight:600;color:${trendColor(pick.sma200Trend)}">${trendTxt(pick.sma200Trend)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(pick.distSMA200)}">${distTxt(pick.distSMA200)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(pick.distSMA30)}">${distTxt(pick.distSMA30)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(pick.distWMA21)}">${distTxt(pick.distWMA21)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(pick.distVWAP20)}">${distTxt(pick.distVWAP20)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;text-align:center;color:${stageColor(pick.stage)};font-size:11px;font-weight:700">${stageTxt(pick.stage)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;text-align:center">
      <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:${lcColor(pick.lcCount)};background:${lcBg(pick.lcCount)}">${pick.lcCount}/${pick.lcTotal}</span>
    </td>
  </tr>`).join('')}
  </tbody>
  </table>

  ${report.has4h ? `<!-- SWING 4H SIGNALS TABLE -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">⚡ Swing 4H (RSI · MACD bajo 0 · VWAP)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">MACD</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Tend. MA200</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Dist MA200</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">VWAP</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Etapa</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Señales</th>
  </tr>
  </thead>
  <tbody>
  ${report.swingPicks.map(r => {
    const t4 = r.technical4h;
    const lc4 = r.technical4h ? (ScoringEngine.countSignals(r.fundamental, r.technical4h)) : { count: 0, total: 20 };
    const swingPick = {
      rsi: t4 && t4.rsi != null ? t4.rsi : null,
      sma200Trend: t4 && t4.sma200Trend ? t4.sma200Trend : '--',
      distSMA200: t4 && t4.distanceFromSMA200 != null ? t4.distanceFromSMA200 : null,
      distVWAP20: t4 && t4.distanceFromVWAP20 != null ? t4.distanceFromVWAP20 : null,
      lcCount: lc4 ? lc4.count : 0,
      lcTotal: lc4 ? lc4.total : 10,
    };
    return `<tr>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-weight:600;font-size:12px;color:#1565c0">${r.stock.ticker}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${rsiColor(swingPick)}">${rsiTxt(swingPick)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:11px;font-weight:600;color:${macdColor4h(r)}">${macdTxt4h(r)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:11px;font-weight:600;color:${trendColor(swingPick.sma200Trend)}">${trendTxt(swingPick.sma200Trend)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(swingPick.distSMA200)}">${distTxt(swingPick.distSMA200)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${distColor(swingPick.distVWAP20)}">${distTxt(swingPick.distVWAP20)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;text-align:center;color:${stageColor(r.weinstein && r.weinstein.stage)};font-size:11px;font-weight:700">${stageTxt(r.weinstein && r.weinstein.stage)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;text-align:center">
      <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:${lcColor(swingPick.lcCount)};background:${lcBg(swingPick.lcCount)}">${swingPick.lcCount}/${swingPick.lcTotal}</span>
    </td>
  </tr>`;
  }).join('')}
  </tbody>
  </table>` : ''}

  <!-- RSI EXTREMES -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">📊 RSI Extremos (Vela Diaria)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:10px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">% Hoy</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
  </tr>
  </thead>
  <tbody>
  ${report.topRSI.length === 0 ? '<tr><td style="padding:10px;font-size:12px;color:#888;text-align:center" colspan="5">Sin datos.</td></tr>' : report.topRSI.map((p) => `<tr>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-weight:700;font-size:12px;color:#1565c0">${p.ticker}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:12px;color:#555">${p.name}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px">${fmtP(p.price)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px">${chgClass(p.change)}${chgSign(p.change)}${fmtD(p.change)}%</span></td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;font-weight:700;color:${p.rsi >= 70 ? '#c0392b' : p.rsi >= 60 ? '#b8860b' : '#333'}">${p.rsi.toFixed(1)}</td>
  </tr>`).join('')}
  </tbody>
  </table>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">% Hoy</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
  </tr>
  </thead>
  <tbody>
  ${report.lowRSI.length === 0 ? '<tr><td style="padding:10px;font-size:12px;color:#888;text-align:center" colspan="5">Sin datos.</td></tr>' : report.lowRSI.map((p) => `<tr>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-weight:700;font-size:12px;color:#1565c0">${p.ticker}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:12px;color:#555">${p.name}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px">${fmtP(p.price)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px">${chgClass(p.change)}${chgSign(p.change)}${fmtD(p.change)}%</span></td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;font-weight:700;color:${p.rsi <= 30 ? '#1b8a3d' : p.rsi <= 40 ? '#b8860b' : '#333'}">${p.rsi.toFixed(1)}</td>
  </tr>`).join('')}
  </tbody>
  </table>

  <!-- MACD BULLISH CROSS BELOW ZERO -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">🟢 Cruce Alcista MACD bajo 0 (últimas 3 velas diarias)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">MACD</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Cruce</th>
  </tr>
  </thead>
  <tbody>
  ${report.macdBullishBelowZero3d.length === 0 ? '<tr><td style="padding:10px;font-size:12px;color:#888;text-align:center" colspan="6">No se detectaron cruces alcistas bajo 0 en las últimas 3 velas.</td></tr>' : report.macdBullishBelowZero3d.map((p) => `<tr>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-weight:700;font-size:12px;color:#1565c0">${p.ticker}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:12px;color:#555">${p.name}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px">${fmtP(p.price)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${p.rsi != null ? (p.rsi >= 70 ? '#c0392b' : p.rsi <= 30 ? '#1b8a3d' : '#555') : '#888'}">${p.rsi != null ? p.rsi.toFixed(1) : '--'}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-family:monospace;font-size:12px;color:${p.macdLine > p.macdSignal ? '#1b8a3d' : '#c0392b'}">${fmtD(p.macdLine)} / ${fmtD(p.macdSignal)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #eceff1;font-size:11px;font-weight:600;color:#1b8a3d">hace ${p.daysAgo} vela${p.daysAgo === 1 ? '' : 's'}</td>
  </tr>`).join('')}
  </tbody>
  </table>

  <!-- SECTOR DISTRIBUTION -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">♦ Distribucion por Sector</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Sector</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Acciones</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Señales Promedio</th>
  </tr>
  </thead>
  <tbody>
  ${secRows}
  </tbody>
  </table>

  <!-- EXTREME OPPORTUNITIES -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">⚡ Oportunidades Extremas</h2>
  ${report.extreme.length === 0 ? '<p style="font-size:12px;color:#888;margin-bottom:18px">No se detectaron oportunidades extremas en este momento.</p>': `
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Caida</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">RSI</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Score</th>
  </tr>
  </thead>
  <tbody>
  ${extRows}
  </tbody>
  </table>`}

  <!-- QUALITY SALES -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">★ Calidad en Venta</h2>
  ${report.quality.length === 0 ? '<p style="font-size:12px;color:#888;margin-bottom:18px">No se detectaron oportunidades de calidad en venta en este momento.</p>' : `
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <thead>
  <tr style="background:#f5f5f5">
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Ticker</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Nombre</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">Precio</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">P/E</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:left;border-bottom:1px solid #e0e0e0">ROIC</th>
    <th style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#666;text-align:center;border-bottom:1px solid #e0e0e0">Score</th>
  </tr>
  </thead>
  <tbody>
  ${qRows}
  </tbody>
  </table>`}

  <!-- RISKS -->
  <h2 style="font-size:15px;font-weight:600;color:#333;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0">⚠ Alertas de Riesgo</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:18px">
  <tbody>
  ${riskRows}
  </tbody>
  </table>

  <!-- FOOTER -->
  <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e0e0e0;padding-top:10px;margin-top:10px">
  <tr><td style="font-size:10px;color:#aaa;text-align:center;line-height:1.6">
    Informe generado automaticamente por S&P500 Opportunity Scanner &mdash; ${report.date}<br>
    Este informe no constituye asesoramiento financiero. Realice su propia investigacion antes de invertir.
  </td></tr>
  </table>

</td></tr>
</table>`;
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { ReportEngine }; }
