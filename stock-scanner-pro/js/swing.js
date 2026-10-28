const SwingEngine = {
  filter(results) {
    try {
      const matches = [];

      for (const r of results) {
        if (r.error || !r.technical || r.technical.error) continue;
        if (!Array.isArray(r.ohlc) || r.ohlc.length < 200) continue;

        const t = r.technical;
        const closes = r.ohlc.map(d => d.close);
        const lastPrice = closes[closes.length - 1];

        // 1. Trend filters
        const priceAboveSMA200 = t.distanceFromSMA200 > -0.5;
        const sma50AboveSMA200 = t.sma50 > t.sma200;
        if (!priceAboveSMA200 || !sma50AboveSMA200) continue;

        // EMA20 > EMA50
        if ((t.ema20 || 0) <= (t.ema50 || 0)) continue;

        // 2. Pullback: price dropped toward EMA20 or SMA50 in last 3-7 days
        const pullbackDay = this.findPullbackDay(closes, t);
        if (!pullbackDay) continue;

        // Price hasn't closed below EMA20 in last 2 days
        if (t.closeBelowEMA20) continue;

        // 3. MACD bullish cross in last 1-3 days
        if (!t.macdCrossRecent) continue;

        // 4. RSI between 40 and 70
        if (t.rsi < 40 || t.rsi > 70) continue;

        matches.push({
          ticker: r.stock.ticker,
          name: r.stock.name || '',
          sector: r.stock.sector || '',
          price: r.price,
          change: r.change,
          sma200: t.sma200,
          sma50: t.sma50,
          ema20: t.ema20,
          rsi: t.rsi,
          macdCrossed: t.macdCrossDays[0],
          distEMA20: t.distanceFromEMA20,
          distSMA50: t.distanceFromSMA50,
          pullbackDays: pullbackDay,
          score: r.score,
        });
      }

      return { success: true, matches, total: matches.length };
    } catch (err) {
      return { success: false, error: err.message, matches: [] };
    }
  },

  findPullbackDay(closes, tech) {
    const len = closes.length;
    if (len < 8) return null;

    const ema20 = (function calcEMAPullback(prices) {
      const period = 20, m = 2 / (period + 1);
      let e = prices[0];
      for (let i = 1; i < prices.length; i++) e = (prices[i] - e) * m + e;
      return e;
    })(closes.slice(-40));

    const sma50 = (function calcSMAPullback(prices) {
      let sum = 0;
      for (let i = Math.max(0, prices.length - 50); i < prices.length; i++) sum += prices[i];
      return sum / Math.min(50, prices.length);
    })(closes);

    const lastPrice = closes[len - 1];
    const prices7 = closes.slice(-7);
    const prices3 = closes.slice(-3);

    const highest7 = Math.max(...prices7);
    const lowest7 = Math.min(...prices7);
    const highToLowDrop = ((highest7 - lowest7) / highest7) * 100;

    // Must have pulled back at least 1.5% from the 7-day high
    const droppedEnough = highToLowDrop >= 1.5;

    // Price must be approaching EMA20 or SMA50 (within 3% of either)
    const nearEMA20 = Math.abs(lastPrice - ema20) / ema20 * 100 <= 3;
    const nearSMA50 = Math.abs(lastPrice - sma50) / sma50 * 100 <= 3;
    const nearSupport = nearEMA20 || nearSMA50;

    // Price should be in the lower half of the 7-day range
    const midRange = (highest7 + lowest7) / 2;
    const inLowerHalf = lastPrice <= midRange;

    // At least 2 out of last 3 days should be red (closing lower than previous)
    let redDays = 0;
    for (let i = closes.length - 2; i >= Math.max(0, closes.length - 4); i--) {
      if (closes[i] < closes[i - 1]) redDays++;
    }
    const recentWeakness = redDays >= 2;

    if (droppedEnough && nearSupport && inLowerHalf && recentWeakness) {
      return highToLowDrop;
    }

    return null;
  },

  getBestMatch(matches) {
    if (!matches || matches.length === 0) return null;
    let best = matches[0];
    let bestScore = -Infinity;

    for (const m of matches) {
      let s = 0;
      // RSI closer to 45-55 range is better for swing entries
      const rsiIdeal = Math.abs(m.rsi - 50);
      s += (10 - rsiIdeal) * 1.5;
      // MACD cross more recent is better
      if (m.macdCrossed === 1) s += 5;
      else if (m.macdCrossed === 2) s += 3;
      else s += 1;
      // Pullback depth: 2-5% is ideal
      if (m.pullbackDays >= 2 && m.pullbackDays <= 5) s += 4;
      else if (m.pullbackDays < 2) s -= 2;
      // Near EMA20 is better than near SMA50
      if (Math.abs(m.distEMA20) < 1) s += 3;
      // Positive change signals early reversal
      if (m.change > 0) s += 1;
      // Overall score component
      if (m.score && m.score.overall) s += m.score.overall * 0.5;

      if (s > bestScore) { bestScore = s; best = m; }
    }

    return best;
  },

  getTopBuyPicks(results, count = 10) {
    try {
      const scored = [];

      for (const r of results) {
        if (r.error || !r.technical || r.technical.error) continue;
        if (!Array.isArray(r.ohlc) || r.ohlc.length < 200) continue;

        const t = r.technical;
        let score = 0;
        const reasons = [];

        // Trend (max 25)
        if (t.distanceFromSMA200 > -0.5) { score += 8; reasons.push('Precio>SMA200'); }
        if (t.sma50 > t.sma200) { score += 7; reasons.push('SMA50>SMA200'); }
        if ((t.ema20 || 0) > (t.ema50 || 0)) { score += 5; reasons.push('EMA20>EMA50'); }
        if (t.stUpDays > t.stDownDays) { score += 5; reasons.push('Momento+' + t.stUpDays + 'd'); }

        // RSI (max 20)
        if (t.rsi >= 40 && t.rsi <= 70) { score += 5; }
        if (t.rsi >= 45 && t.rsi <= 60) { score += 15; reasons.push('RSI ideal'); }

        // MACD (max 15)
        if (t.isMACDBullish) { score += 3; reasons.push('MACD+'); }
        if (t.macdCrossRecent) { score += 12; reasons.push('Cruce MACD'); }

        // Pullback (max 15)
        if (!t.closeBelowEMA20) score += 3;
        const closes = r.ohlc.map(d => d.close);
        const pullback = this.findPullbackDay(closes, t);
        if (pullback) { score += 12; reasons.push('Pullback ' + pullback.toFixed(1) + '%'); }

        // Fundamental quality (max 15)
        const f = r.fundamental;
        if (f && !f.error) {
          if (f.isQuality) { score += 6; reasons.push('Calidad'); }
          if (f.pe > 0 && f.peBelowHistorical) { score += 5; reasons.push('P/E bajo hist.'); }
          if (f.revenueGrowth > 0.05) { score += 4; reasons.push('Crec.' + (f.revenueGrowth * 100).toFixed(0) + '%'); }
        }

        // Overall score (max 10)
        if (r.score && r.score.overall) {
          score += Math.min(10, r.score.overall / 10);
        }

        scored.push({
          ticker: r.stock.ticker,
          name: r.stock.name || '',
          sector: r.stock.sector || '',
          price: r.price,
          change: r.change,
          sma200: t.sma200,
          sma50: t.sma50,
          ema20: t.ema20,
          rsi: t.rsi,
          buyScore: Math.round(score * 10) / 10,
          reasons: reasons.join(', '),
          overallScore: Math.round((r.score?.overall || 0) * 10) / 10,
        });
      }

      scored.sort((a, b) => b.buyScore - a.buyScore);
      return scored.slice(0, count);
    } catch (err) {
      return [];
    }
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { SwingEngine }; }
