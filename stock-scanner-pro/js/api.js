const API = {
  cache: new Map(),

  log(...args) { console.log('[API]', ...args); },

  async fetchLocal(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Proxy error ${res.status}`);
    return res.json();
  },

  async fetchChartData(ticker, interval = '1d', range = '1y') {
    const key = `chart_${ticker}_${interval}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const data = await this.fetchLocal(`/api/chart?ticker=${ticker}&range=${range}&interval=${interval}`);
    const result = data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const adjclose = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : null;
    const meta = result.meta;

    const ohlc = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      if (quotes.open[i] && quotes.high[i] && quotes.low[i] && quotes.close[i]) {
        ohlc.push({
          date: new Date(result.timestamp[i] * 1000),
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume[i] || 0,
          adjclose: adjclose ? adjclose[i] : null,
        });
      }
    }

    const lastClose = ohlc.length > 1 ? ohlc[ohlc.length - 2].close : null;
    const chartData = { ticker, ohlc, currentPrice: meta.regularMarketPrice, previousClose: lastClose || meta.previousClose || meta.chartPreviousClose };
    this.cache.set(key, chartData);
    return chartData;
  },

  async fetchFundamentals(ticker) {
    const key = `fund_${ticker}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const base = {
      trailingPE: null, forwardPE: null, priceToBook: null,
      revenueGrowth: null, earningsGrowth: null, freeCashflow: null,
      returnOnEquity: null, returnOnAssets: null, returnOnCapital: null, debtToEquity: null,
      grossMargins: null, operatingMargins: null, profitMargins: null,
      marketCap: null, enterpriseValue: null, totalRevenue: null,
      netIncomeToCommon: null, sector: 'Technology', industry: '', description: '', name: '',
      operatingCashflow: null, currentRatio: null, quickRatio: null,
      totalDebt: null, sharesOutstanding: null,
      ebitda: null, priceToSales: null, evToEbitda: null, peg: null,
    };

    try {
      const data = await this.fetchLocal(`/api/fundamentals?ticker=${ticker}`);
      if (data.error) throw new Error(data.error);

      const r = data.quoteSummary.result[0];
      const profile = r.assetProfile || {};
      const fin = r.financialData || {};
      const stats = r.defaultKeyStatistics || {};
      const detail = r.summaryDetail || {};
      const price = r.price || {};

      if (profile.sector) base.sector = profile.sector;
      base.industry = profile.industry || '';
      base.description = profile.longBusinessSummary || '';
      base.name = (price.longName || price.shortName || '');

      const g = (o) => o && o.raw !== undefined ? o.raw : null;

      base.trailingPE = g(detail.trailingPE) || g(stats.trailingPE);
      base.forwardPE = g(detail.forwardPE) || g(stats.forwardPE) || g(price.forwardPE);
      base.priceToBook = g(detail.priceToBook) || g(stats.priceToBook);
      base.marketCap = g(detail.marketCap) || g(stats.marketCap) || g(price.marketCap);
      base.totalRevenue = g(fin.totalRevenue);
      base.enterpriseValue = g(fin.enterpriseValue);
      base.netIncomeToCommon = g(fin.netIncomeToCommon);

      base.revenueGrowth = g(fin.revenueGrowth);
      base.earningsGrowth = g(fin.earningsGrowth);
      base.freeCashflow = g(fin.freeCashflow);
      base.returnOnEquity = g(fin.returnOnEquity);
      base.returnOnAssets = g(fin.returnOnAssets);
      base.returnOnCapital = g(stats.returnOnCapital) || g(fin.returnOnCapital);
      base.debtToEquity = g(fin.debtToEquity);
      base.grossMargins = g(fin.grossMargins);
      base.operatingMargins = g(fin.operatingMargins);
      base.profitMargins = g(fin.profitMargins);

      base.ebitda = g(fin.ebitda);
      base.priceToSales = g(fin.priceToSalesTrailing12Months) || g(stats.priceToSalesTrailing12Months);
      base.evToEbitda = g(stats.enterpriseToEbitda) || g(fin.enterpriseToEbitda);
      base.peg = g(stats.pegRatio) || g(detail.pegRatio);

      base.totalRevenue = g(fin.totalRevenue);
      base.netIncomeToCommon = g(fin.netIncomeToCommon);

      base.fiftyTwoWeekHigh = g(detail.fiftyTwoWeekHigh);
      base.fiftyTwoWeekLow = g(detail.fiftyTwoWeekLow);
      base.averageVolume = g(detail.averageVolume);
      base.beta = g(detail.beta) || g(stats.beta);
      base.dividendYield = g(detail.dividendYield) || g(stats.dividendYield);
      base.operatingCashflow = g(fin.operatingCashflow);
      base.currentRatio = g(fin.currentRatio);
      base.quickRatio = g(fin.quickRatio);
      base.totalDebt = g(fin.totalDebt);
      base.sharesOutstanding = g(stats.sharesOutstanding);

    } catch (err) {
      this.log(`Fundamentals ${ticker}: ${err.message}`);
    }

    this.cache.set(key, base);
    return base;
  },

  async scanStock(ticker, interval = '1d', range = '1y') {
    const [chartData, fundamentals] = await Promise.all([
      this.fetchChartData(ticker, interval, range),
      this.fetchFundamentals(ticker),
    ]);
    return { chartData, fundamentals };
  },

  async clearCacheEntry(ticker, interval) {
    this.cache.delete(`chart_${ticker}_${interval}`);
  },

  clearCache() { this.cache.clear(); },
};
