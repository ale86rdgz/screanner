const ScoringEngine = {
  countLongConditions(t, f) {
    return this.countSignals(f, t);
  },

  countSignals(fundamental, technical) {
    const noTech = !technical || technical.error;
    const noFund = !fundamental || fundamental.error;

    const items = [];
    const add = (num, cat, label, met, detail) => items.push({ num, cat, label, met: !!met, detail: detail || null });

    // ===== 15 SEÑALES TÉCNICAS =====
    const t = technical;
    if (noTech) {
      for (let i = 1; i <= 15; i++) add(i, 'tech', 'Datos técnicos insuficientes', false, null);
    } else {
      // 1. Tendencia primaria: precio sobre SMA200
      add(1, 'tech', 'Tendencia primaria: precio sobre SMA 200', t.distanceFromSMA200 > 0, `Dist ${t.distanceFromSMA200}%`);
      // 2. Tendencia intermedia: SMA50 > SMA200
      add(2, 'tech', 'Tendencia intermedia: SMA 50 > SMA 200', t.sma50 > t.sma200, `SMA50 ${t.sma50} vs SMA200 ${t.sma200}`);
      // 3. Estructura del precio: máximos y mínimos crecientes
      add(3, 'tech', 'Estructura del precio: máximos y mínimos crecientes', t.structureBullish, `HH:${t.higherHighs ? 'Sí' : 'No'} HL:${t.higherLows ? 'Sí' : 'No'}`);
      // 4. Momentum corto plazo: precio sobre EMA20
      add(4, 'tech', 'Momentum corto plazo: precio sobre EMA 20', t.distanceFromEMA20 > 0, `Dist ${t.distanceFromEMA20}%`);
      // 5. RSI entre 50 y 65
      add(5, 'tech', 'RSI entre 50 y 65', t.rsi >= 50 && t.rsi <= 65, `RSI ${t.rsi}`);
      // 6. RSI recuperando 50 tras corrección
      add(6, 'tech', 'RSI recuperando 50 tras una corrección', t.rsiRecovering50, `RSI ${t.rsi}`);
      // 7. MACD por encima de su señal
      add(7, 'tech', 'MACD por encima de su línea de señal', t.isMACDBullish, `Histo ${t.macdHistogram}`);
      // 8. Cruce alcista reciente del MACD
      add(8, 'tech', 'Cruce alcista reciente del MACD', !!(t.macdCross && t.macdCross.direction === 'up') || t.macdCrossRecent, t.macdCross ? `Hace ${t.macdCross.daysAgo}d` : 'Sin cruce reciente');
      // 9. Volumen actual > promedio 20
      add(9, 'tech', 'Volumen actual > promedio 20', t.volumeAboveAvg, `${t.volumeVs20}x`);
      // 10. OBV con tendencia ascendente
      add(10, 'tech', 'OBV con tendencia ascendente', t.obvAboveSMA || t.obvRising, `OBV ${t.obvRising ? '↑' : '↓'}`);
      // 11. Ruptura de resistencia importante
      add(11, 'tech', 'Ruptura de resistencia importante', t.brokeResistance || t.breakoutRecent, t.resistanceLevel ? `Res ${t.resistanceLevel}` : 'Sin resistencia');
      // 12. Confirmación de ruptura con volumen
      add(12, 'tech', 'Ruptura confirmada con volumen', t.breakoutWithVolume, `${t.volumeVs20}x`);
      // 13. Pullback hacia EMA20/50 que respeta soporte
      add(13, 'tech', 'Pullback hacia EMA 20/50 respetando soporte', t.pullbackOk, t.nearestSupport ? `Soporte ${t.nearestSupport}` : '');
      // 14. Soporte cercano y resistencia lejana
      add(14, 'tech', 'Soporte cercano y resistencia relativamente alejada', t.distanceToSupport !== null && t.distanceToSupport < 6 && (t.distanceToResistance === null || t.distanceToResistance > 10), `Sup ${t.distanceToSupport}% · Res ${t.distanceToResistance}%`);
      // 15. ATR / riesgo: stop razonable y R/R ≥ 2:1
      add(15, 'tech', 'Stop técnicamente razonable y R/R ≥ 2:1', t.stopPct !== null && t.stopPct <= 8 && t.rrRatio !== null && t.rrRatio >= 2, `Stop ${t.stopPct}% · R/R ${t.rrRatio}`);
    }

    // ===== 5 SEÑALES FUNDAMENTALES =====
    const f = fundamental;
    if (noFund) {
      for (let i = 16; i <= 20; i++) add(i, 'fund', 'Datos fundamentales insuficientes', false, null);
    } else {
      // 16. Crecimiento de ingresos positivo
      add(16, 'fund', 'Crecimiento de ingresos positivo', f.revenueGrowth !== null && f.revenueGrowth > 0, `${f.revenueGrowth !== null ? (f.revenueGrowth * 100).toFixed(1) : '—'}%`);
      // 17. EPS creciendo, idealmente > ventas
      add(17, 'fund', 'EPS creciendo, idealmente > ventas', f.epsGrowth !== null && f.epsGrowth > 0 && f.epsBeatRevenue, `EPS ${f.epsGrowth !== null ? (f.epsGrowth * 100).toFixed(1) : '—'}%`);
      // 18. Rentabilidad ROE/ROIC saludable
      add(18, 'fund', 'Rentabilidad ROE/ROIC saludable', !!(f.roe > 0.15 || f.roic > 0.12 || f.returnOnAssets > 0.08), `ROE ${((f.roe || 0) * 100).toFixed(1)}%`);
      // 19. Deuda controlada
      add(19, 'fund', 'Deuda controlada respecto a flujo de caja', !!f.debtControlled, `D/E ${f.debtToEquity}`);
      // 20. Valuación relativa (P/E, Fwd P/E, EV/EBITDA, P/S, PEG)
      add(20, 'fund', 'Valuación relativa razonable (P/E, EV/EBITDA, P/S, PEG)', !!f.valuationRelativelyCheap, `P/E ${f.pe}` + (f.evToEbitda ? ` · EV/EBITDA ${f.evToEbitda}` : ''));
    }

    const techItems = items.filter(i => i.cat === 'tech');
    const fundItems = items.filter(i => i.cat === 'fund');
    const techCount = techItems.filter(i => i.met).length;
    const fundCount = fundItems.filter(i => i.met).length;
    const count = techCount + fundCount;
    const total = 20;
    const score = count * 5;

    return {
      count,
      total,
      score,
      items,
      techCount,
      techTotal: 15,
      fundCount,
      fundTotal: 5,
      techScore: Math.round((techCount / 15) * 100),
      fundScore: fundCount ? Math.round((fundCount / 5) * 100) : 0,
    };
  },

  calcTechnicalScore(t) {
    if (!t || t.error) return 0;
    let score = 0;
    if (t.rsi <= 30) score += 30;
    else if (t.rsi <= 35) score += 25;
    else if (t.rsi <= 40) score += 18;
    else if (t.rsi <= 45) score += 10;
    else if (t.rsi <= 50) score += 5;

    if (t.dropFromHigh >= 40) score += 25;
    else if (t.dropFromHigh >= 30) score += 20;
    else if (t.dropFromHigh >= 20) score += 15;
    else if (t.dropFromHigh >= 10) score += 8;
    else if (t.dropFromHigh >= 5) score += 3;

    if (t.distanceFromSMA200 < -15) score += 15;
    else if (t.distanceFromSMA200 < -10) score += 12;
    else if (t.distanceFromSMA200 < -5) score += 8;
    else if (t.distanceFromSMA200 < 0) score += 5;
    else if (t.distanceFromSMA200 < 5) score += 2;

    if (t.isMACDGoldenCross) score += 15;
    else if (t.isMACDBullish && t.macdImproving) score += 10;
    else if (t.isMACDBullish) score += 5;
    else if (t.macdImproving) score += 3;

    if (t.distanceToSupport !== null && t.distanceToSupport < 5) score += 10;
    else if (t.distanceToSupport !== null && t.distanceToSupport < 10) score += 5;

    if (t.volumeRatio < 0.7 && t.dropFromHigh > 15) score += 5;

    return Math.min(score, 100);
  },

  calcUndervaluationScore(f) {
    if (!f) return 0;
    let score = 0;

    if (f.pe > 0 && f.historicalPE > 0) {
      const ratio = f.pe / f.historicalPE;
      if (ratio < 0.6) score += 30;
      else if (ratio < 0.8) score += 25;
      else if (ratio < 0.95) score += 18;
      else if (ratio < 1.05) score += 10;
      else if (ratio < 1.2) score += 5;
    } else {
      score += 12;
    }

    if (f.pe > 0 && f.sectorAvgPE > 0) {
      const ratio = f.pe / f.sectorAvgPE;
      if (ratio < 0.6) score += 25;
      else if (ratio < 0.8) score += 20;
      else if (ratio < 0.95) score += 14;
      else if (ratio < 1.05) score += 8;
      else if (ratio < 1.2) score += 3;
    }

    if (f.revenueGrowth !== null) {
      if (f.revenueGrowth > 0.2) score += 20;
      else if (f.revenueGrowth > 0.1) score += 15;
      else if (f.revenueGrowth > 0.05) score += 12;
      else if (f.revenueGrowth > 0) score += 8;
      else if (f.revenueGrowth > -0.05) score += 3;
    } else score += 8;

    if (f.epsGrowth !== null) {
      if (f.epsGrowth > 0.2) score += 15;
      else if (f.epsGrowth > 0.1) score += 12;
      else if (f.epsGrowth > 0.05) score += 8;
      else if (f.epsGrowth > 0) score += 5;
    } else score += 6;

    if (f.marketCap && f.freeCashflow) {
      const fcfYield = f.freeCashflow / f.marketCap * 100;
      if (fcfYield > 0.05) score += 10;
      else if (fcfYield > 0.03) score += 6;
      else if (fcfYield > 0.01) score += 3;
    }

    return Math.min(score, 100);
  },

  calcQualityScore(f) {
    if (!f) return 0;
    let score = 0;

    const roe = f.roe || 0;
    if (roe > 0.3) score += 22;
    else if (roe > 0.2) score += 18;
    else if (roe > 0.15) score += 14;
    else if (roe > 0.1) score += 10;
    else if (roe > 0.05) score += 5;

    const revenueOk = f.revenueGrowth !== null && f.revenueGrowth > 0;
    const epsOk = f.epsGrowth !== null && f.epsGrowth > 0;
    const fcfOk = f.freeCashflow > 0;
    if (revenueOk && epsOk && fcfOk) score += 20;
    else if (revenueOk && epsOk) score += 14;
    else if (revenueOk || epsOk) score += 8;

    const de = f.debtToEquity || 1;
    if (de < 0.3) score += 18;
    else if (de < 0.5) score += 15;
    else if (de < 1) score += 12;
    else if (de < 2) score += 8;
    else if (de < 3) score += 4;
    else if (de < 5) score += 2;

    const margin = f.operatingMargin || 0;
    if (margin > 25) score += 15;
    else if (margin > 15) score += 12;
    else if (margin > 8) score += 8;
    else if (margin > 0) score += 4;

    if (f.freeCashflow > 0 && f.freeCashflow > 1) score += 15;
    else if (f.freeCashflow > 0) score += 8;

    if (revenueOk) score += 10;
    else if (f.revenueGrowth !== null && f.revenueGrowth > -0.05) score += 5;

    return Math.min(score, 100);
  },

  calcMomentumScore(t) {
    if (!t || t.error) return 0;
    let score = 0;

    if (t.isMACDGoldenCross) score += 25;
    else if (t.isMACDBullish && t.macdImproving) score += 18;
    else if (t.isMACDBullish) score += 12;
    else if (t.macdImproving) score += 6;

    const stUpDays = t.stUpDays || 0;
    const stDownDays = t.stDownDays || 0;
    const totalDays = stUpDays + stDownDays;
    if (totalDays > 0) {
      const upRatio = stUpDays / totalDays;
      if (upRatio > 0.65) score += 30;
      else if (upRatio > 0.55) score += 22;
      else if (upRatio > 0.45) score += 15;
      else if (upRatio > 0.35) score += 8;
      else score += 3;
    }

    if (t.volumeRatio && t.volumeRatio > 1.2) score += 15;
    else if (t.volumeRatio && t.volumeRatio > 1) score += 8;

    if (t.rsi && t.rsi > 40 && t.rsi < 60) score += 15;
    else if (t.rsi && t.rsi <= 40) score += 10;

    if (t.distanceFromSMA20 !== undefined) {
      if (t.distanceFromSMA20 > -2 && t.distanceFromSMA20 < 2) score += 15;
      else if (t.distanceFromSMA20 > 0) score += 8;
    }

    return Math.min(score, 100);
  },

  calcRecoveryScore(f, t) {
    if (!t || t.error) return 30;
    let score = 0;

    if (t.dropFromHigh >= 40) score += 30;
    else if (t.dropFromHigh >= 30) score += 25;
    else if (t.dropFromHigh >= 20) score += 20;
    else if (t.dropFromHigh >= 10) score += 12;
    else if (t.dropFromHigh >= 5) score += 6;

    if (t.rsi <= 30) score += 20;
    else if (t.rsi <= 35) score += 16;
    else if (t.rsi <= 40) score += 12;
    else if (t.rsi <= 50) score += 6;

    if (t.distanceToSupport !== null && t.distanceToSupport < 8) score += 18;
    else if (t.distanceToSupport !== null && t.distanceToSupport < 15) score += 12;
    else if (t.distanceToSupport !== null && t.distanceToSupport < 25) score += 6;

    if (f && f.pe > 0 && f.historicalPE > 0 && f.pe < f.historicalPE) score += 17;
    if (f && f.pe > 0 && f.sectorAvgPE > 0 && f.pe < f.sectorAvgPE) score += 15;

    return Math.min(score, 100);
  },

  calcRiskScore(f) {
    if (!f) return 50;
    let score = 0;

    const de = f.debtToEquity || 1;
    if (de > 5) score += 22;
    else if (de > 3) score += 18;
    else if (de > 2) score += 14;
    else if (de > 1) score += 8;

    if (f.revenueGrowth !== null) {
      if (f.revenueGrowth < -0.1) score += 20;
      else if (f.revenueGrowth < -0.05) score += 14;
      else if (f.revenueGrowth < 0) score += 8;
    }

    if (f.epsGrowth !== null) {
      if (f.epsGrowth < -0.1) score += 18;
      else if (f.epsGrowth < -0.05) score += 12;
      else if (f.epsGrowth < 0) score += 6;
    }

    if (f.operatingMargin !== null) {
      if (f.operatingMargin < -0.1) score += 15;
      else if (f.operatingMargin < 0) score += 8;
    }

    if (!f.freeCashflow || f.freeCashflow <= 0) score += 15;

    return Math.min(score, 100);
  },

  gradeFor(overall) {
    if (overall >= 75) return 'A';
    if (overall >= 60) return 'B';
    if (overall >= 45) return 'C';
    if (overall >= 30) return 'D';
    return 'F';
  },

  labelFor(overall) {
    if (overall >= 75) return 'Oportunidad Fuerte';
    if (overall >= 60) return 'Oportunidad Moderada';
    if (overall >= 45) return 'Regular';
    if (overall >= 30) return 'Débil';
    return 'Evitar';
  },

  calculateConfluence(fundamental, technical) {
    if (fundamental && fundamental.error) {
      return this._emptyScore();
    }

    const signals = this.countSignals(fundamental, technical);
    const overall = signals.score;

    const upside = this._estimateUpside(fundamental, technical);

    return {
      overall,
      opportunityScore: overall,
      signalCount: signals.count,
      signalTotal: signals.total,
      techCount: signals.techCount,
      techTotal: signals.techTotal,
      fundCount: signals.fundCount,
      fundTotal: signals.fundTotal,
      technicalScore: signals.techScore,
      fundamentalScore: signals.fundScore,
      signals,
      grade: this.gradeFor(overall),
      label: this.labelFor(overall),
      upside,
    };
  },

  _estimateUpside(f, t) {
    if (t && t.highest52w) {
      const price = t.sma200 || (t.nearestSupport) || 0;
      if (price > 0) {
        const upside = ((t.highest52w - price) / price) * 100;
        return Math.round(Math.min(Math.max(upside, 0), 100) * 10) / 10;
      }
    }
    return 0;
  },

  _emptyScore() {
    return { overall: 0, grade: 'F', label: 'Sin Datos', opportunityScore: 0, technicalScore: 0, fundamentalScore: 0, signals: { count: 0, total: 20, items: [] }, upside: 0 };
  },

  rankStocks(results) {
    return results
      .filter(r => r && r.score && !r.error)
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, 50)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  },

sortStocks(stocks, sortBy = 'long', dir = 'desc') {
    const s = [...stocks];
    const reverse = dir !== 'asc';
    const num = (v) => (typeof v === 'number' && !isNaN(v)) ? v : (v === null || v === undefined ? Number.NEGATIVE_INFINITY : 0);
    const keyOf = (r) => {
      switch (sortBy) {
        case 'ticker': return r.stock.ticker;
        case 'name': return r.stock.name || '';
        case 'sector': return r.stock.sector;
        case 'price': return num(r.price);
        case 'upside': return num(r.score?.upside);
        case 'change': return num(r.change);
        case 'risk': return -num(r.fundamental?.debtToEquity);
        case 'rsi': return num(r.technical?.rsi);
        case 'beta': return num(r.fundamental?.beta);
        case 'dma200': return num(r.technical?.distanceFromSMA200);
        case 'dma30': return num(r.technical?.distanceFromSMA30);
        case 'dwma21': return num(r.technical?.distanceFromWMA21);
        case 'vwap': return num(r.technical?.distanceFromVWAP20);
        case 'dpoc': return num(r.technical?.distanceFromPOC);
        case 'stage': return num(r.weinstein?.stage);
        case 'macd': return r.technical && r.technical.macdCross ? (r.technical.macdCross.direction === 'up' ? 2 : 1) : 0;
        case 'score': return num(r.score?.overall);
        case 'long':
        default: return num(r.longConditions?.count);
      }
    };
    s.sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      let c;
      if (typeof ka === 'string' && typeof kb === 'string') c = ka.localeCompare(kb);
      else c = ka < kb ? -1 : ka > kb ? 1 : 0;
      return reverse ? -c : c;
    });
    return s.slice(0, 150).map((r, i) => ({ ...r, rank: i + 1 }));
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { ScoringEngine }; }
