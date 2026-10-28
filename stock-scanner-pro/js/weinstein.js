const StageAnalyzer = {
  PERIOD: 30,

  analyze(ticker, ohlc) {
    if (!ohlc || ohlc.length < 200) return { ticker, stage: 0, error: 'Datos insuficientes (mín. 200 días)' };

    const weekly = this._toWeekly(ohlc);
    if (weekly.length < this.PERIOD + 5) return { ticker, stage: 0, error: 'Datos semanales insuficientes' };

    const closes = weekly.map(w => w.close);
    const wma = this._wma(closes, this.PERIOD);
    const currentWma = wma[wma.length - 1];

    const prices = weekly.map(w => w.close);
    const priceToWma = (prices[prices.length - 1] - currentWma) / currentWma * 100;

    const slope = this._wmaSlope(wma);
    const wmaDir = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat';

    const volTrend = this._volumeTrend(weekly);

    const { support, resistance } = this._findSR(weekly, wma, 20);
    const stage1High = resistance;

    const stage = this._determineStage(prices, wma, priceToWma, slope, volTrend, support, resistance);
    const transition = this._detectTransition(prices, wma, priceToWma, slope, volTrend, stage, stage1High, support);

    const weeklyData = weekly.map((w, i) => ({
      ...w,
      wma30: i < this.PERIOD - 1 ? null : wma[i],
    }));

    const stageNames = { 0: 'Sin datos', 1: 'Acumulación', 2: 'Alcista', 3: 'Distribución', 4: 'Bajista' };
    const stageDescs = {
      0: 'Datos insuficientes para determinar la etapa.',
      1: 'Consolidación lateral. La WMA30 se aplana. El volumen se contrae. Los inversores informados acumulan silenciosamente.',
      2: 'Tendencia alcista. Precio sobre WMA30 con pendiente positiva. Volumen creciente en semanas alcistas. Es la etapa para comprar y mantener.',
      3: 'Distribución lateral. La WMA30 se aplana tras una subida prolongada. Grandes inversores venden gradualmente. Ojo con la ruptura bajista.',
      4: 'Tendencia bajista. Precio bajo WMA30 con pendiente negativa. Evitar compras. Buscar señales de acumulación para la próxima Etapa 1.',
    };

    return {
      ticker,
      stage,
      stageName: stageNames[stage],
      stageDescription: stageDescs[stage],
      wma30: Math.round(currentWma * 100) / 100,
      wma30Slope: Math.round(slope * 10) / 10,
      priceToWma: Math.round(priceToWma * 10) / 10,
      volumeTrend: Math.round(volTrend * 100) / 100,
      wmaDirection: wmaDir,
      supportLevel: Math.round(support * 100) / 100,
      resistanceLevel: Math.round(resistance * 100) / 100,
      breakoutLevel: Math.round(stage1High * 100) / 100,
      transition,
      transitionConfidence: transition ? this._confidence(prices, wma, volTrend, stage) : 0,
      weeklyData,
      error: null,
    };
  },

  _toWeekly(ohlc) {
    if (ohlc.length === 0) return [];
    const weeks = [];
    let current = { weekStart: ohlc[0].date, open: ohlc[0].open, high: ohlc[0].high, low: ohlc[0].low, close: ohlc[0].close, volume: ohlc[0].volume };

    for (let i = 1; i < ohlc.length; i++) {
      const d = ohlc[i];
      const dWeek = this._weekStart(d.date);
      const cWeek = this._weekStart(current.weekStart);
      if (dWeek.getTime() === cWeek.getTime()) {
        current.high = Math.max(current.high, d.high);
        current.low = Math.min(current.low, d.low);
        current.close = d.close;
        current.volume += d.volume || 0;
      } else {
        weeks.push({ ...current });
        current = { weekStart: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume || 0 };
      }
    }
    weeks.push(current);
    return weeks;
  },

  _weekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _wma(data, period) {
    const result = [];
    const divisor = period * (period + 1) / 2;
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j] * (period - j);
      }
      result.push(sum / divisor);
    }
    return result;
  },

  _wmaSlope(wma) {
    const valid = wma.filter(v => v !== null);
    if (valid.length < 10) return 0;
    const recent = valid.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];
    return first > 0 ? (last - first) / first * 100 : 0;
  },

  _volumeTrend(weekly) {
    if (weekly.length < this.PERIOD) return 1;
    const recent = weekly.slice(-10).reduce((s, w) => s + w.volume, 0) / 10;
    const hist = weekly.slice(-this.PERIOD, -10).reduce((s, w) => s + w.volume, 0) / (this.PERIOD - 10);
    return hist > 0 ? recent / hist : 1;
  },

  _findSR(weekly, wma, lookback) {
    const start = Math.max(0, weekly.length - lookback);
    const slice = weekly.slice(start);
    const prices = slice.map(w => w.close);
    const wmaSlice = wma.slice(start + (wma.length - weekly.length));

    const high = Math.max(...prices);
    const low = Math.min(...prices);

    const recentWma = wmaSlice.filter(v => v !== null);
    const avgWma = recentWma.length > 0 ? recentWma.reduce((a, b) => a + b, 0) / recentWma.length : low;

    let support = low;
    let resistance = high;

    for (const price of prices) {
      if (price > support && price <= avgWma * 0.98) support = price;
    }
    for (const price of prices) {
      if (price < resistance && price >= avgWma * 1.02) resistance = price;
    }

    return { support, resistance };
  },

  _determineStage(prices, wma, priceToWma, slope, volTrend, support, resistance) {
    const lastPrice = prices[prices.length - 1];
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const posInRange = maxPrice > minPrice ? (lastPrice - minPrice) / (maxPrice - minPrice) * 100 : 50;

    const wmaRising = slope > 0.05;
    const wmaFalling = slope < -0.05;
    const wmaFlat = !wmaRising && !wmaFalling;
    const nearWma = Math.abs(priceToWma) <= 4;
    const volHigh = volTrend > 1.2;

    // Stage 2: price clearly above a rising WMA30
    if (priceToWma > 4 && wmaRising) return 2;

    // Stage 4: price clearly below a falling WMA30
    if (priceToWma < -4 && wmaFalling) return 4;

    // Price near the WMA30 (base or top)
    if (nearWma) {
      return this._toppingAfterMarkup(prices, wma, slope, posInRange) ? 3 : 1;
    }

    // Above the WMA but without a strong rising slope
    if (priceToWma > 4) {
      return wmaFalling ? 3 : 2;
    }

    // Below the WMA but without a strong falling slope
    if (priceToWma < -4) {
      return wmaRising ? 1 : 4;
    }

    // Very close to the WMA
    return posInRange > 60 ? 3 : (posInRange < 40 ? 1 : (priceToWma >= 0 ? 2 : 4));
  },

  _weekRange(prices) {
    const slice = prices.slice(-15);
    const max = Math.max(...slice);
    const min = Math.min(...slice);
    return min > 0 ? (max - min) / min * 100 : 0;
  },

  _toppingAfterMarkup(prices, wma, slope, posInRange) {
    const v = wma.filter(x => x !== null);
    if (v.length < 15) return posInRange > 60;
    if (posInRange < 45) return false;
    const minV = Math.min(...v);
    const maxV = Math.max(...v);
    if (minV > 0) {
      const drawup = (maxV - minV) / minV * 100;
      if (drawup >= 8) {
        const iMax = v.indexOf(maxV);
        return iMax >= Math.floor(v.length * 0.4) && slope <= 2;
      }
    }
    // Ventana corta o WMA plana: detectar techo visible (precio descolgado del maximo sin colapso)
    const winLen = Math.min(prices.length, 40);
    const win = prices.slice(-winLen);
    const hi = Math.max(...win);
    const iHi = win.indexOf(hi);
    const offHigh = (hi - prices[prices.length - 1]) / hi * 100;
    return iHi <= winLen - 9 && offHigh >= 5 && offHigh <= 18 && slope < 2;
  },

  _detectTransition(prices, wma, priceToWma, slope, volTrend, stage, stage1High, support) {
    const lastPrice = prices[prices.length - 1];
    const lastWma = wma[wma.length - 1];

    if (stage === 2 && Math.abs(priceToWma) < 5 && slope > 0.1 && priceToWma > 0) {
      if (stage1High > 0 && lastPrice > stage1High * 0.98) return 'bullish_breakout';
    }

    if (stage === 4) {
      if (priceToWma > -5 && slope > -0.1) return 'recovery_to_accumulation';
    }

    if ((stage === 1 || stage === 3) && priceToWma > 0 && volTrend > 1.2 && slope > 0.15) {
      return 'bullish_breakout';
    }

    if (stage === 2 && priceToWma < -3 && slope < -0.1) {
      return 'distributing';
    }

    return null;
  },

  _confidence(prices, wma, volTrend, stage) {
    let conf = 50;
    if (volTrend > 1.2) conf += 15;
    if (volTrend > 1.5) conf += 10;
    const wmaV = wma.filter(v => v !== null).slice(-5);
    const slopeInc = wmaV.length > 2 && wmaV[wmaV.length - 1] > wmaV[wmaV.length - 3];
    if (slopeInc) conf += 15;
    const priceBreak = prices[prices.length - 1] > prices.slice(-10).reduce((a, b) => Math.max(a, b), 0) * 0.97;
    if (priceBreak) conf += 10;
    return Math.min(conf, 100);
  },

  formatStage(stage) {
    const icons = { 1: '\u25B2', 2: '\u2191', 3: '\u25BC', 4: '\u2193' };
    const colors = { 1: 'var(--accent-celeste)', 2: 'var(--accent-green)', 3: 'var(--accent-yellow)', 4: 'var(--accent-red)' };
    const names = { 1: 'Acumulación', 2: 'Alcista', 3: 'Distribución', 4: 'Bajista' };
    const stageNum = stage.stage || 0;
    return {
      icon: icons[stageNum] || '--',
      color: colors[stageNum] || 'var(--text-muted)',
      name: names[stageNum] || 'Sin datos',
      html: `<span style="color:${colors[stageNum] || 'var(--text-muted)'};font-weight:700">${icons[stageNum] || ''} ${names[stageNum] || 'Sin datos'}</span>`,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { StageAnalyzer }; }
