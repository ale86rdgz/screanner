const BacktestEngine = {
  result: null,

  async run(ticker, entryPrice, entryDate, exitDate) {
    try {
      const resp = await fetch(`/api/chart?ticker=${ticker}&range=2y&interval=1d`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const ohlc = json.chart?.result?.[0];
      if (!ohlc) throw new Error('No chart data');
      const timestamps = ohlc.timestamp;
      const q = ohlc.indicators?.quote?.[0];
      if (!q || !timestamps) throw new Error('No quote data');
      const closes = q.close;
      const volumes = q.volume;

      const entryMs = new Date(entryDate).getTime();
      const exitMs = new Date(exitDate).getTime();
      let entryIdx = -1, exitIdx = -1;
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i] * 1000;
        if (entryIdx === -1 && t >= entryMs) entryIdx = i;
        if (exitIdx === -1 && t >= exitMs) exitIdx = i;
        if (entryIdx !== -1 && exitIdx !== -1) break;
      }
      if (entryIdx === -1) entryIdx = Math.max(0, timestamps.length - 252);
      if (exitIdx === -1) exitIdx = timestamps.length - 1;
      if (exitIdx <= entryIdx) exitIdx = Math.min(entryIdx + 20, timestamps.length - 1);

      const data = [];
      for (let i = entryIdx; i <= exitIdx; i++) {
        data.push({ date: new Date(timestamps[i] * 1000).toISOString().split('T')[0], close: closes[i], volume: volumes[i] || 0 });
      }

      return this.analyze(data, entryPrice, ticker);
    } catch (err) {
      console.error(`Backtest error for ${ticker}:`, err);
      return { error: err.message };
    }
  },

  analyze(data, entryPrice, ticker) {
    if (!data.length || data.length < 5) return { error: 'Insufficient data' };

    const startPrice = entryPrice || data[0].close;
    const endPrice = data[data.length - 1].close;
    const holdReturn = ((endPrice - startPrice) / startPrice) * 100;

    let maxDrawdown = 0;
    let peak = data[0].close;
    for (const d of data) {
      if (d.close > peak) peak = d.close;
      const dd = ((peak - d.close) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const fakeDate30 = Math.min(30, data.length - 1);
    const price30d = entryPrice !== null ? entryPrice : data[0]?.close || 0;
    const price30dAfter = data[fakeDate30]?.close || endPrice;
    const return30d = ((price30dAfter - price30d) / price30d) * 100;

    const avgReturn = holdReturn;
    const minPrice = Math.min(...data.map(d => d.close));
    const maxPrice = Math.max(...data.map(d => d.close));

    let upDays = 0, dnDays = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].close > data[i - 1].close) upDays++;
      else if (data[i].close < data[i - 1].close) dnDays++;
    }
    const winRate = data.length > 1 ? (upDays / (upDays + dnDays)) * 100 : 50;

    const histData = data.map(d => ({ date: d.date, close: d.close }));
    const bestDate = data[upDays > dnDays ? data.length - 1 : 0];
    const worstDate = data[upDays > dnDays ? 0 : data.length - 1];

    this.result = {
      ticker,
      startDate: data[0].date,
      endDate: data[data.length - 1].date,
      startPrice: Math.round(startPrice * 100) / 100,
      endPrice: Math.round(endPrice * 100) / 100,
      holdReturn: Math.round(holdReturn * 100) / 100,
      return30d: Math.round(return30d * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      upDays, dnDays,
      avgReturn: Math.round(avgReturn * 100) / 100,
      minPrice: Math.round(minPrice * 100) / 100,
      maxPrice: Math.round(maxPrice * 100) / 100,
      bestDate: bestDate?.date || '',
      worstDate: worstDate?.date || '',
      histogram: histData,
      days: data.length,
    };

    return this.result;
  },

  async batchRun(stocks, startDate, endDate) {
    const results = [];
    for (const s of stocks) {
      const r = await this.run(s.ticker, s.entryPrice, startDate, endDate);
      results.push({ ticker: s.ticker, name: s.name || s.ticker, result: r });
    }
    this.result = results;
    return results;
  },
};
