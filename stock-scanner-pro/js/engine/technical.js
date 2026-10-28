const TechnicalEngine = {
  calculateSMA(data, period) {
    const r = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { r.push(null); continue; }
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += data[j];
      r.push(s / period);
    }
    return r;
  },

  calculateEMA(data, period) {
    const r = [];
    const m = 2 / (period + 1);
    let e = data[0];
    r.push(e);
    for (let i = 1; i < data.length; i++) { e = (data[i] - e) * m + e; r.push(e); }
    return r;
  },

  calculatePOC(ohlcData, bins = 120) {
    if (!ohlcData || ohlcData.length === 0) return null;
    let minLow = Infinity, maxHigh = -Infinity;
    for (const d of ohlcData) {
      if (d.low < minLow) minLow = d.low;
      if (d.high > maxHigh) maxHigh = d.high;
    }
    if (!isFinite(minLow) || !isFinite(maxHigh) || maxHigh <= minLow) return null;
    const binSize = (maxHigh - minLow) / bins;
    const vol = new Array(bins).fill(0);
    for (const d of ohlcData) {
      const lo = Math.max(0, Math.floor((d.low - minLow) / binSize));
      const hi = Math.min(bins - 1, Math.floor((d.high - minLow) / binSize));
      const share = (d.volume || 0) / (hi - lo + 1);
      for (let b = lo; b <= hi; b++) vol[b] += share;
    }
    let best = 0;
    for (let b = 1; b < bins; b++) if (vol[b] > vol[best]) best = b;
    return minLow + (best + 0.5) * binSize;
  },

  calculateWMA(data, period) {
    const r = [];
    let sumW = 0;
    for (let i = 1; i <= period; i++) sumW += i;
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { r.push(null); continue; }
      let s = 0;
      for (let j = 0; j < period; j++) s += data[i - j] * (period - j);
      r.push(s / sumW);
    }
    return r;
  },

  calculateVWAP(ohlcData, anchor = 0) {
    const r = [];
    let cumPV = 0, cumV = 0;
    for (let i = 0; i < ohlcData.length; i++) {
      const d = ohlcData[i];
      if (i >= anchor) {
        const tp = (d.high + d.low + d.close) / 3;
        const vol = d.volume || 0;
        cumPV += tp * vol;
        cumV += vol;
      }
      r.push(cumV > 0 ? cumPV / cumV : null);
    }
    return r;
  },

  calculateRSI(prices, period = 14) {
    const changes = [];
    for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    const r = [];
    for (let i = 0; i < period; i++) r.push(null);
    let avgG = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgL = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    r.push(avgL === 0 ? 100 : 100 - (100 / (1 + avgG / avgL)));
    for (let i = period; i < changes.length; i++) {
      avgG = (avgG * (period - 1) + gains[i]) / period;
      avgL = (avgL * (period - 1) + losses[i]) / period;
      r.push(avgL === 0 ? 100 : 100 - (100 / (1 + avgG / avgL)));
    }
    return r;
  },

  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12.map((v, i) => v !== null && ema26[i] !== null ? v - ema26[i] : null);
    const valid = macdLine.filter(v => v !== null);
    const sigRaw = this.calculateEMA(valid, 9);
    const signal = []; let si = 0;
    for (let i = 0; i < macdLine.length; i++) signal.push(macdLine[i] !== null && si < sigRaw.length ? sigRaw[si++] : null);
    const hist = [];
    for (let i = 0; i < macdLine.length; i++) hist.push(macdLine[i] !== null && signal[i] !== null ? macdLine[i] - signal[i] : null);
    return { macdLine, signal, histogram: hist };
  },

  findPivotLows(prices, left = 5, right = 5) {
    const pivots = [];
    for (let i = left; i < prices.length - right; i++) {
      let isLow = true;
      for (let j = i - left; j <= i + right; j++) { if (prices[j] < prices[i]) { isLow = false; break; } }
      if (isLow) pivots.push({ index: i, price: prices[i] });
    }
    return pivots;
  },

  calculateBollinger(prices, period = 20) {
    const sma = this.calculateSMA(prices, period);
    const upper = [], lower = [];
    for (let i = 0; i < prices.length; i++) {
      if (sma[i] === null) { upper.push(null); lower.push(null); continue; }
      let sumSq = 0;
      for (let j = Math.max(0, i - period + 1); j <= i; j++) sumSq += (prices[j] - sma[i]) ** 2;
      const std = Math.sqrt(sumSq / period);
      upper.push(sma[i] + 2 * std);
      lower.push(sma[i] - 2 * std);
    }
    return { upper, middle: sma, lower };
  },

  analyze(ohlcData) {
    const closes = ohlcData.map(d => d.close);
    const highs = ohlcData.map(d => d.high);
    const lows = ohlcData.map(d => d.low);
    const volumes = ohlcData.map(d => d.volume);
    const len = closes.length;

    if (len < 50) return { error: 'Insufficient data', score: 0 };

    const lastPrice = closes[len - 1];
    const highest52w = Math.max(...closes);
    const lowest52w = Math.min(...closes);
    const dropFromHigh = ((highest52w - lastPrice) / highest52w) * 100;

    const rsiValues = this.calculateRSI(closes, 14);
    const currentRSI = rsiValues[rsiValues.length - 1] || 50;

    const sma20 = this.calculateSMA(closes, 20);
    const sma30 = this.calculateSMA(closes, 30);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = this.calculateSMA(closes, 200);
    const cSMA20 = sma20[sma20.length - 1] || lastPrice;
    const cSMA30 = sma30[sma30.length - 1] || lastPrice;
    const cSMA50 = sma50[sma50.length - 1] || lastPrice;
    const cSMA200 = sma200[sma200.length - 1] || lastPrice;

    const wma21 = this.calculateWMA(closes, 21);
    const cWMA21 = wma21[wma21.length - 1] || lastPrice;

    const vwapFull = this.calculateVWAP(ohlcData, 0);
    const vwap20 = this.calculateVWAP(ohlcData, Math.max(0, len - 20));
    const cVWAP = vwapFull[vwapFull.length - 1] || lastPrice;
    const cVWAP20 = vwap20[vwap20.length - 1] || cVWAP;
    const distVWAP = ((lastPrice - cVWAP) / cVWAP) * 100;
    const distVWAP20 = ((lastPrice - cVWAP20) / cVWAP20) * 100;

    const cPOC = this.calculatePOC(ohlcData);
    const distPOC = cPOC ? ((lastPrice - cPOC) / cPOC) * 100 : null;

    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const cEMA20 = ema20[ema20.length - 1] || lastPrice;
    const cEMA50 = ema50[ema50.length - 1] || lastPrice;

    const macd = this.calculateMACD(closes);
    const lMACD = macd.macdLine[macd.macdLine.length - 1] || 0;
    const lSig = macd.signal[macd.signal.length - 1] || 0;
    const lHist = macd.histogram[macd.histogram.length - 1] || 0;
    const pHist = macd.histogram[macd.histogram.length - 2] || 0;

    const avgVol = volumes.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, volumes.length);
    const recVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length);
    const volRatio = recVol / (avgVol || 1);

    const distSMA20 = ((lastPrice - cSMA20) / cSMA20) * 100;
    const distSMA30 = ((lastPrice - cSMA30) / cSMA30) * 100;
    const distSMA50 = ((lastPrice - cSMA50) / cSMA50) * 100;
    const distSMA200 = cSMA200 > 0 ? ((lastPrice - cSMA200) / cSMA200) * 100 : 0;
    const distEMA20 = ((lastPrice - cEMA20) / cEMA20) * 100;
    const distEMA50 = ((lastPrice - cEMA50) / cEMA50) * 100;
    const distWMA21 = ((lastPrice - cWMA21) / cWMA21) * 100;

    const pivotsLow = this.findPivotLows(lows, 3, 3);
    const nearestSupport = pivotsLow.length > 0
      ? pivotsLow.filter(p => p.price <= lastPrice).pop() || pivotsLow[0]
      : null;
    const distSupport = nearestSupport ? ((lastPrice - nearestSupport.price) / lastPrice) * 100 : null;

    const isBullish = lMACD > lSig;
    const macdImproving = lHist > pHist;
    const goldenCross = lMACD > lSig && (macd.macdLine[macd.macdLine.length - 2] || 0) <= (macd.signal[macd.signal.length - 2] || 0);

    // Multi-day MACD cross: check if cross occurred in last 1-3 days
    const macdCrossDays = [];
    for (let d = 1; d <= 3; d++) {
      const idx = macd.macdLine.length - d;
      const pIdx = idx - 1;
      if (idx >= 0 && pIdx >= 0) {
        const curM = macd.macdLine[idx];
        const curS = macd.signal[idx];
        const prevM = macd.macdLine[pIdx];
        const prevS = macd.signal[pIdx];
        if (curM != null && curS != null && prevM != null && prevS != null && curM > curS && prevM <= prevS) {
          macdCrossDays.push(d);
        }
      }
    }
    const macdCrossRecent = macdCrossDays.length > 0;

    // Most recent MACD cross (up or down) in the last 3 days
    let macdCross = null;
    for (let d = 1; d <= 3; d++) {
      const idx = macd.macdLine.length - d;
      const pIdx = idx - 1;
      if (idx >= 0 && pIdx >= 0) {
        const curM = macd.macdLine[idx];
        const curS = macd.signal[idx];
        const prevM = macd.macdLine[pIdx];
        const prevS = macd.signal[pIdx];
        if (curM != null && curS != null && prevM != null && prevS != null) {
          if (curM > curS && prevM <= prevS) { macdCross = { direction: 'up', daysAgo: d, belowZero: curM < 0 }; break; }
          if (curM < curS && prevM >= prevS) { macdCross = { direction: 'down', daysAgo: d, belowZero: curM < 0 }; break; }
        }
      }
    }

    // SMA50/SMA200 cross (golden/death) in the last 5 days
    let smaCross = null;
    for (let d = 1; d <= 5; d++) {
      const idx = closes.length - d;
      const pIdx = idx - 1;
      if (idx >= 0 && pIdx >= 0) {
        const c50 = sma50[idx], c200 = sma200[idx], p50 = sma50[pIdx], p200 = sma200[pIdx];
        if (c50 != null && c200 != null && p50 != null && p200 != null) {
          if (c50 > c200 && p50 <= p200) { smaCross = { direction: 'up', daysAgo: d }; break; }
          if (c50 < c200 && p50 >= p200) { smaCross = { direction: 'down', daysAgo: d }; break; }
        }
      }
    }

    // EMA3/EMA9 cross (fast/slow) in the last 2 candles
    const ema3 = this.calculateEMA(closes, 3);
    const ema9 = this.calculateEMA(closes, 9);
    let sma39Cross = null;
    for (let d = 1; d <= 2; d++) {
      const idx = closes.length - d;
      const pIdx = idx - 1;
      if (idx >= 0 && pIdx >= 0) {
        const c3 = ema3[idx], c9 = ema9[idx], p3 = ema3[pIdx], p9 = ema9[pIdx];
        if (c3 != null && c9 != null && p3 != null && p9 != null) {
          if (c3 > c9 && p3 <= p9) { sma39Cross = { direction: 'up', daysAgo: d }; break; }
          if (c3 < c9 && p3 >= p9) { sma39Cross = { direction: 'down', daysAgo: d }; break; }
        }
      }
    }
    const cEMA3 = ema3[ema3.length - 1];
    const cEMA9 = ema9[ema9.length - 1];
    const isSMA39Bullish = cEMA3 != null && cEMA9 != null ? cEMA3 > cEMA9 : null;

    // SMA200 trend (slope over ~10 bars)
    const sma200Now = cSMA200;
    const sma200Prev = sma200[Math.max(0, sma200.length - 11)] != null ? sma200[sma200.length - 11] : sma200Now;
    const sma200SlopePct = sma200Prev > 0 ? ((sma200Now - sma200Prev) / sma200Prev) * 100 : 0;
    const sma200Trend = sma200SlopePct > 0.5 ? 'up' : sma200SlopePct < -0.5 ? 'down' : 'flat';

    // Check if price closed below EMA20 in last 2 days
    const closeBelowEMA20 = [];
    for (let d = 1; d <= 2; d++) {
      const idx = closes.length - d;
      if (idx >= 0 && ema20[idx] != null) {
        closeBelowEMA20.push(closes[idx] < ema20[idx]);
      }
    }
    const anyCloseBelowEMA20 = closeBelowEMA20.some(v => v);

    const stTrend = closes.slice(-20);
    const stUp = stTrend.filter((v, i) => i > 0 && v > stTrend[i - 1]).length;
    const stDn = stTrend.filter((v, i) => i > 0 && v < stTrend[i - 1]).length;

    const bb = this.calculateBollinger(closes, 20);
    const lastBBLow = bb.lower[bb.lower.length - 1];
    const belowLowerBB = lastBBLow !== null && lastPrice <= lastBBLow;

    const volatility = (Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20))) / lastPrice * 100;

    // ===== ATR14 =====
    const trs = [];
    for (let i = 1; i < ohlcData.length; i++) {
      const h = ohlcData[i].high, l = ohlcData[i].low, pc = closes[i - 1];
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atrP = 14;
    let atr = trs.length >= atrP ? trs.slice(0, atrP).reduce((a, b) => a + b, 0) / atrP : null;
    for (let i = atrP; i < trs.length && atr !== null; i++) atr = (atr * (atrP - 1) + trs[i]) / atrP;
    const atr14 = atr !== null ? Math.round(atr * 100) / 100 : null;
    const stopPct = atr14 && lastPrice > 0 ? Math.round((atr14 * 2 / lastPrice) * 1000) / 10 : null;
    const resistanceTarget = nearestSupport ? nearestSupport.price : highest52w;
    let rrRatio = null;
    if (atr14 && lastPrice > 0 && lastPrice - 2 * atr14 > 0) {
      const risk = 2 * atr14;
      const reward = Math.max(0, resistanceTarget - lastPrice);
      rrRatio = risk > 0 ? Math.round((reward / risk) * 10) / 10 : null;
    }

    // ===== OBV + tendencia =====
    const obvArr = [0];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) obvArr.push(obvArr[i - 1] + (volumes[i] || 0));
      else if (closes[i] < closes[i - 1]) obvArr.push(obvArr[i - 1] - (volumes[i] || 0));
      else obvArr.push(obvArr[i - 1]);
    }
    const obvNow = obvArr[obvArr.length - 1];
    const obvPrev = obvArr[Math.max(0, obvArr.length - 21)];
    const obvRising = obvNow > obvPrev;
    const obvSma = this.calculateSMA(obvArr, 20);
    const obvAboveSMA = obvSma[obvSma.length - 1] !== null ? obvNow > obvSma[obvSma.length - 1] : false;

    // ===== Higher highs / higher lows (estructura) =====
    const pivotHighs = [];
    for (let i = 3; i < highs.length - 3; i++) {
      let isHigh = true;
      for (let j = i - 3; j <= i + 3; j++) { if (highs[j] > highs[i]) { isHigh = false; break; } }
      if (isHigh) pivotHighs.push({ index: i, price: highs[i] });
    }
    const lastTwoHighs = pivotHighs.slice(-2);
    const lastTwoLows = pivotsLow.slice(-2);
    const higherHighs = lastTwoHighs.length === 2 && lastTwoHighs[1].price > lastTwoHighs[0].price;
    const higherLows = lastTwoLows.length === 2 && lastTwoLows[1].price > lastTwoLows[0].price;
    const structureBullish = higherHighs && higherLows;

    // ===== Ruptura de resistencia =====
    const lookback = Math.min(130, closes.length - 1);
    const resWindow = lastPrice >= highest52w ? null : Math.max(...closes.slice(0, lookback));
    const resistanceLevel = resWindow !== null ? Math.round(resWindow * 100) / 100 : null;
    const distanceToResistance = resistanceLevel ? Math.round(((resistanceLevel - lastPrice) / lastPrice) * 1000) / 10 : null;
    const brokeResistance = resistanceLevel != null && lastPrice > resistanceLevel;
    const breakoutRecent = resistanceLevel != null && lastPrice > resistanceLevel &&
      closes.slice(-5).some((c, idx) => {
        const prior = Math.max(...closes.slice(0, closes.length - 5 + idx));
        return c > prior;
      });
    const volNow = volumes[volumes.length - 1] || 0;
    const volPrevAvg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.max(1, volumes.slice(-21, -1).length);
    const volumeVs20 = volPrevAvg > 0 ? Math.round((volNow / volPrevAvg) * 100) / 100 : null;
    const breakoutWithVolume = brokeResistance && volumeVs20 !== null && volumeVs20 >= 1.4;

    // ===== Pullback hacia EMA20/50 que respeta soporte =====
    const pullbackOk = !anyCloseBelowEMA20 &&
      distEMA20 !== undefined && distEMA20 >= -2.5 && distEMA20 <= 2.5 &&
      (distSupport === null || distSupport < 6) &&
      nearestSupport !== null;

    // ===== RSI recuperando 50 tras corrección =====
    const rsiPrev5 = rsiValues[Math.max(0, rsiValues.length - 6)];
    const rsiRecovering50 = (rsiPrev5 != null && rsiPrev5 < 50 && currentRSI >= 50) ||
      (currentRSI >= 50 && currentRSI <= 55 && (rsiPrev5 == null || rsiPrev5 >= 50));

    // ===== Volumen actual > promedio (señal) =====
    const volumeAboveAvg = volumeVs20 !== null && volumeVs20 > 1;

    return {
      score: 0,
      rsi: Math.round(currentRSI * 10) / 10,
      dropFromHigh: Math.round(dropFromHigh * 10) / 10,
      sma20: Math.round(cSMA20 * 100) / 100,
      sma30: Math.round(cSMA30 * 100) / 100,
      sma50: Math.round(cSMA50 * 100) / 100,
      sma200: Math.round(cSMA200 * 100) / 100,
      wma21: Math.round(cWMA21 * 100) / 100,
      distanceFromSMA30: Math.round(distSMA30 * 10) / 10,
      distanceFromWMA21: Math.round(distWMA21 * 10) / 10,
      vwap: Math.round(cVWAP * 100) / 100,
      vwap20: Math.round(cVWAP20 * 100) / 100,
      distanceFromVWAP: Math.round(distVWAP * 10) / 10,
      distanceFromVWAP20: Math.round(distVWAP20 * 10) / 10,
      poc: cPOC ? Math.round(cPOC * 100) / 100 : null,
      distanceFromPOC: distPOC !== null ? Math.round(distPOC * 10) / 10 : null,
      macdCrossBelowZero: !!(macdCross && macdCross.belowZero),
      smaCross,
      sma39Cross,
      isSMA39Bullish,
      sma200Trend,
      sma200SlopePct: Math.round(sma200SlopePct * 10) / 10,
      macdLine: Math.round(lMACD * 100) / 100,
      macdSignal: Math.round(lSig * 100) / 100,
      macdHistogram: Math.round(lHist * 100) / 100,
      isMACDBullish: isBullish,
      macdImproving,
      isMACDGoldenCross: goldenCross,
      macdCrossDays,
      macdCrossRecent,
      macdCross,
      ema20: Math.round(cEMA20 * 100) / 100,
      ema50: Math.round(cEMA50 * 100) / 100,
      distanceFromEMA20: Math.round(distEMA20 * 10) / 10,
      distanceFromEMA50: Math.round(distEMA50 * 10) / 10,
      distanceFromSMA20: Math.round(distSMA20 * 10) / 10,
      distanceFromSMA50: Math.round(distSMA50 * 10) / 10,
      distanceFromSMA200: Math.round(distSMA200 * 10) / 10,
      closeBelowEMA20: anyCloseBelowEMA20,
      highest52w: Math.round(highest52w * 100) / 100,
      lowest52w: Math.round(lowest52w * 100) / 100,
      nearestSupport: nearestSupport ? Math.round(nearestSupport.price * 100) / 100 : null,
      distanceToSupport: distSupport !== null ? Math.round(distSupport * 10) / 10 : null,
      volumeRatio: Math.round(volRatio * 100) / 100,
      stUpDays: stUp,
      stDownDays: stDn,
      belowLowerBB,
      volatility: Math.round(volatility * 10) / 10,
      dropFromHighPct: Math.round(dropFromHigh * 10) / 10,
      atr14,
      stopPct,
      rrRatio,
      obv: obvNow,
      obvRising,
      obvAboveSMA,
      structureBullish,
      higherHighs,
      higherLows,
      resistanceLevel,
      distanceToResistance,
      brokeResistance,
      breakoutRecent,
      volumeVs20,
      breakoutWithVolume,
      pullbackOk,
      rsiRecovering50,
      volumeAboveAvg,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { TechnicalEngine }; }
