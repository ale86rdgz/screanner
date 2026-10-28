const App = {
  scanResults: [],
  isScanning: false,
  extremeMode: false,
  qualitySaleMode: false,
  timeframe: '1d',

  async init() {
    UI.init();
    ChartRenderer.init('stockChart');
    UI.on('onSelectStock', (ticker) => this.selectStock(ticker));
    UI.on('onFilterChange', () => this.applyFilters());
    UI.on('onSortChange', (sortBy, sortDir) => this.applyFilters(sortBy, sortDir));
    UI.on('onTfChange', (tf) => this.changeTimeframe(tf));
    UI.on('onBacktest', () => this.runBacktest());
    UI.on('onBacktestBatch', () => this.runBacktestBatch());
    UI.on('onCompare', () => this.runComparison());
    document.getElementById('scanBtn').addEventListener('click', () => this.startScan());
    UI.on('onStageAnalysis', () => this.runStageAnalysis());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closeDetailPanel();
    });
  },

  updateModeIndicator() {
    const el = document.getElementById('modeIndicator');
    if (this.extremeMode) el.textContent = '\u26A1 Modo Extremo: Acciones con caídas del 40%+ y fundamentales de calidad';
    else if (this.qualitySaleMode) el.textContent = '\u2605 Calidad en Venta: Alta calidad a precios descontados';
    else el.textContent = '';
  },

  async startScan() {
    if (this.isScanning) return;
    this.isScanning = true;

    UI.setScanButtonLoading(true);
    UI.showLoading(true);
    UI.showScanProgress(0, CONFIG.STOCKS.length);
    UI.closeDetailPanel();

    const allStocks = CONFIG.STOCKS;
    const stocks = allStocks;
    const results = [];
    let successCount = 0;

    try {
      for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        try {
          const [chartData, intraday, fundamentals] = await Promise.all([
            API.fetchChartData(stock.ticker, '1d', '1y'),
            API.fetchChartData(stock.ticker, '4h', '2y'),
            API.fetchFundamentals(stock.ticker),
          ]);
          const result = this.analyzeStock(stock, chartData, intraday, fundamentals);
          results.push(result);
          if (result.score.overall > 0) successCount++;
        } catch (err) {
          results.push({
            stock,
            error: true, price: null, change: null, ohlc: [],
            fundamental: { score: 0, error: true },
            technical: { score: 0, error: true },
            score: { overall: 0, grade: 'F', label: 'Error', opportunityScore: 0, technicalScore: 0, fundamentalScore: 0, signals: { count: 0, total: 20, items: [] }, upside: 0 },
          });
        }

        UI.showScanProgress(i + 1, stocks.length, stock.ticker);
      }

      this.scanResults = results;
      this.applyFilters();
    } finally {
      UI.setScanButtonLoading(false);
      UI.showLoading(false);
      UI.showScanProgress();
      this.isScanning = false;
    }
  },

  analyzeStock(stock, chartData, intraday, fundamentals) {
    const ohlc = chartData.ohlc || [];
    const currentPrice = chartData.currentPrice || intraday.currentPrice || 0;
    const prevClose = chartData.previousClose || 0;
    const change = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    const fundamentalResult = FundamentalEngine.analyze(fundamentals, stock.sector);
    const technical = ohlc.length > 30 ? TechnicalEngine.analyze(ohlc) : { score: 0, error: true };
    const technical4h = (intraday && intraday.ohlc && intraday.ohlc.length > 30) ? TechnicalEngine.analyze(intraday.ohlc) : { score: 0, error: true };

    const technicalActive = this.timeframe === '4h' ? technical4h : technical;
    const signals = ScoringEngine.countSignals(fundamentalResult, technicalActive);
    const signals4h = ScoringEngine.countSignals(fundamentalResult, technical4h);
    const score = { overall: signals.score, opportunityScore: signals.score, signalCount: signals.count, signalTotal: signals.total, signals, grade: ScoringEngine.gradeFor(signals.score), label: ScoringEngine.labelFor(signals.score), upside: ScoringEngine._estimateUpside(fundamentalResult, technicalActive), technicalScore: signals.techScore, fundamentalScore: signals.fundScore, techCount: signals.techCount, techTotal: signals.techTotal, fundCount: signals.fundCount, fundTotal: signals.fundTotal };
    const longConditions = signals;
    const longConditions4h = signals4h;

    let weinstein = null;
    if (ohlc.length >= 200 && typeof StageAnalyzer !== 'undefined') {
      try { weinstein = StageAnalyzer.analyze(stock.ticker, ohlc); }
      catch (e) { weinstein = null; }
    }

    return {
      stock,
      price: currentPrice,
      change: Math.round(change * 100) / 100,
      ohlc,
      ohlc4h: intraday ? intraday.ohlc : [],
      fundamental: fundamentalResult,
      technical,
      technical4h,
      score,
      combined: score,
      longConditions,
      longConditions4h,
      mcPass: fundamentalResult.mcPass,
      weinstein,
    };
  },

  activeTechnical(r) {
    return this.timeframe === '4h' ? r.technical4h : r.technical;
  },

  async changeTimeframe(tf) {
    if (this.timeframe === tf) return;
    this.timeframe = tf;
    if (!this.scanResults || this.scanResults.length === 0) return;
    this.applyFilters();
    if (this.selectedStock) this.selectStock(this.selectedStock, true);
  },

  selectStock(ticker, force) {
    if (!force && this.selectedStock === ticker) return;
    const result = this.scanResults.find(r => r.stock.ticker === ticker);
    if (!result || result.error) return;
    this.selectedStock = ticker;
    UI.showDetail(this.toView(result));
  },

  toView(r) {
    const is4h = this.timeframe === '4h';
    const tech = is4h ? r.technical4h : r.technical;
    const signals = is4h ? (r.longConditions4h || ScoringEngine.countSignals(r.fundamental, r.technical4h)) : (r.longConditions || ScoringEngine.countSignals(r.fundamental, r.technical));
    return {
      ...r,
      technical: tech,
      longConditions: signals,
      ohlc: is4h ? (r.ohlc4h || r.ohlc) : r.ohlc,
    };
  },

  applyFilters(sortBy, sortDir) {
    const sector = document.getElementById('sectorFilter').value;
    const sorter = sortBy || document.getElementById('sortSelect').value;
    const dir = sortDir || UI.sortDir;

    let filtered = this.scanResults.map(r => this.toView(r));

    filtered = filtered.filter(r => r.mcPass !== false);

    if (sector && sector !== 'All') {
      filtered = filtered.filter(r => r.stock.sector === sector);
    }

    if (this.extremeMode) {
      filtered = filtered.filter(r => {
        const f = r.fundamental;
        const t = r.technical;
        if (!f || !t) return false;
        return FundamentalEngine.isExtremeSetup(f, t);
      });
    }

    if (this.qualitySaleMode) {
      filtered = filtered.filter(r => {
        const f = r.fundamental;
        const t = r.technical;
        if (!f) return false;
        const quality = f.isQuality;
        const undervalued = f.pe > 0 && f.peBelowHistorical;
        const decentDrop = t && t.dropFromHigh >= 15;
        return quality && (undervalued || decentDrop);
      });
    }

    const sorted = ScoringEngine.sortStocks(filtered, sorter, dir);
    UI.renderTable(sorted);
    UI.updateStats(sorted);
  },

  async runBacktest() {
    const ticker = document.getElementById('btTicker').value.trim().toUpperCase();
    const startDate = document.getElementById('btStartDate').value;
    const endDate = document.getElementById('btEndDate').value;
    const entryPrice = parseFloat(document.getElementById('btEntryPrice').value) || null;

    if (!ticker) { UI.renderBacktestResult({ error: 'Ingresa un ticker' }); return; }
    if (!startDate || !endDate) { UI.renderBacktestResult({ error: 'Selecciona fechas de inicio y fin' }); return; }

    const result = await BacktestEngine.run(ticker, entryPrice, startDate, endDate);
    UI.renderBacktestResult(result);
  },

  async runBacktestBatch() {
    if (!this.scanResults || this.scanResults.length === 0) {
      UI.renderBacktestResults([{ ticker: 'N/A', result: { error: 'Escanea primero las acciones' } }]);
      return;
    }

    const startDate = document.getElementById('btStartDate').value;
    const endDate = document.getElementById('btEndDate').value;
    if (!startDate || !endDate) {
      UI.renderBacktestResults([{ ticker: 'N/A', result: { error: 'Selecciona fechas de inicio y fin' } }]);
      return;
    }

    const top10 = ScoringEngine.sortStocks(this.scanResults, 'long').slice(0, 10);
    const stocks = top10.map(r => ({ ticker: r.stock.ticker, name: r.stock.name, entryPrice: r.price }));

    UI.showLoading(true);
    const results = await BacktestEngine.batchRun(stocks, startDate, endDate);
    UI.showLoading(false);
    UI.renderBacktestResults(results);
  },

  async runComparison() {
    const tickerA = document.getElementById('compTickerA').value.trim().toUpperCase();
    const tickerB = document.getElementById('compTickerB').value.trim().toUpperCase();
    if (!tickerA || !tickerB) { ComparisonEngine.render(null); return; }
    UI.showLoading(true);
    try {
      const data = await ComparisonEngine.compare(tickerA, tickerB);
      ComparisonEngine.render(data);
    } catch (err) {
      ComparisonEngine.render(null);
    }
    UI.showLoading(false);
  },

  async runStageAnalysis() {
    const ticker = document.getElementById('stageTicker').value.trim().toUpperCase();
    if (!ticker) return;
    UI.showLoading(true);
    try {
      const chartData = await API.fetchChartData(ticker);
      const ohlc = chartData.ohlc || [];
      const result = StageAnalyzer.analyze(ticker, ohlc);
      if (chartData.currentPrice) {
        if (!result.error) {
          const fund = await API.fetchFundamentals(ticker);
          result.price = chartData.currentPrice;
          result.name = fund.name || ticker;
        }
      }
      UI.renderStageResult(result);
    } catch (err) {
      UI.renderStageResult({ error: 'Error al analizar: ' + err.message });
    }
    UI.showLoading(false);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
