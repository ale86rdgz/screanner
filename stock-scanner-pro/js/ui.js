const UI = {
  currentData: [],
  selectedTicker: null,
  sortBy: 'score',
  sortKey: 'long',
  sortDir: 'desc',
  callbacks: {},

  init() {
    this.populateSectorFilter();
    this.setupMainTabs();
    this.setupEventListeners();
    this.setupSortableHeaders();
    this.loadWatchlist();
    this.showEmptyState();
  },

  populateSectorFilter() {
    const select = document.getElementById('sectorFilter');
    CONFIG.SECTORS.forEach(sector => {
      const option = document.createElement('option');
      option.value = sector;
      option.textContent = sector === 'All' ? 'Todos los Sectores' : sector;
      select.appendChild(option);
    });
  },

  setupMainTabs() {
    document.querySelectorAll('.main-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById('panel' + btn.dataset.tabpanel.charAt(0).toUpperCase() + btn.dataset.tabpanel.slice(1));
        if (panel) {
          panel.classList.add('active');
          if (panel.id === 'panelHeatmap') this.renderHeatmap();
          if (panel.id === 'panelWatchlist') this.renderWatchlist();
          if (panel.id === 'panelCompare') { /* nothing on init */ }
          if (panel.id === 'panelStages') { /* nothing on init */ }
          if (panel.id === 'panelSwing') this.renderSwingTop10();
          if (panel.id === 'panelResumen') this.renderReport();
        }
      });
    });
  },

  setupEventListeners() {
    document.getElementById('sectorFilter').addEventListener('change', () => {
      if (this.callbacks.onFilterChange) this.callbacks.onFilterChange();
    });

    document.getElementById('sortSelect').addEventListener('change', (e) => {
      const key = e.target.value;
      this.sortKey = key;
      this.sortDir = this._defaultDir(key);
      this.updateSortIndicators();
      if (this.callbacks.onSortChange) this.callbacks.onSortChange(this.sortKey, this.sortDir);
    });

    document.getElementById('tfSelect').addEventListener('change', (e) => {
      if (this.callbacks.onTfChange) this.callbacks.onTfChange(e.target.value);
    });

    document.querySelectorAll('#detailPanel .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.closest('.tab-bar').nextElementSibling?.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.closest('.tab-bar').parentElement.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1));
        if (tab) tab.classList.add('active');
      });
    });

    document.getElementById('detailOverlay').addEventListener('click', () => {
      this.closeDetailPanel();
    });

    document.getElementById('btRunBtn').addEventListener('click', () => {
      if (this.callbacks.onBacktest) this.callbacks.onBacktest();
    });

    document.getElementById('btBatchBtn').addEventListener('click', () => {
      if (this.callbacks.onBacktestBatch) this.callbacks.onBacktestBatch();
    });

    document.getElementById('compBtn').addEventListener('click', () => {
      if (this.callbacks.onCompare) this.callbacks.onCompare();
    });

    document.getElementById('stageBtn').addEventListener('click', () => {
      if (this.callbacks.onStageAnalysis) this.callbacks.onStageAnalysis();
    });

    document.getElementById('stageTicker').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.callbacks.onStageAnalysis) this.callbacks.onStageAnalysis();
    });

    document.getElementById('runSwingFilterBtn').addEventListener('click', () => {
      this.runSwingFilter();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDetailPanel();
    });
  },

  on(event, callback) {
    this.callbacks[event] = callback;
  },

  _defaultDir(key) {
    return ['ticker', 'name', 'sector'].includes(key) ? 'asc' : 'desc';
  },

  setupSortableHeaders() {
    document.querySelectorAll('#rankingTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (!key) return;
        if (this.sortKey === key) {
          this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortKey = key;
          this.sortDir = this._defaultDir(key);
        }
        document.getElementById('sortSelect').value = key;
        this.updateSortIndicators();
        if (this.callbacks.onSortChange) this.callbacks.onSortChange(this.sortKey, this.sortDir);
      });
    });
    this.updateSortIndicators();
  },

  updateSortIndicators() {
    document.querySelectorAll('#rankingTable th[data-sort]').forEach(th => {
      const key = th.dataset.sort;
      const active = key === this.sortKey;
      th.classList.toggle('sorted', active);
      if (active) th.dataset.dir = this.sortDir;
      else delete th.dataset.dir;
    });
  },

  // ===== TABLE RENDERING =====
  renderTable(results) {
    const tbody = document.getElementById('tableBody');
    const table = document.getElementById('rankingTable');
    const empty = document.getElementById('emptyState');

    tbody.innerHTML = '';
    this.currentData = results;

    if (!results || results.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-state-title').textContent = 'Sin resultados';
      empty.querySelector('.empty-state-text').textContent = 'Ajusta los filtros o escanea de nuevo.';
      return;
    }

    table.style.display = '';
    empty.style.display = 'none';

    results.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.dataset.ticker = r.stock.ticker;

      if (r.stock.ticker === this.selectedTicker) tr.classList.add('active');

      const changeClass = (r.change || 0) >= 0 ? 'change-positive' : 'change-negative';
      const changeSign = (r.change || 0) >= 0 ? '+' : '';

      const lc = r.longConditions;
      const lcCount = lc ? lc.count : 0;
      const lcTotal = 20;
      const lcGrade = lcCount >= 15 ? 'score-high' : lcCount >= 10 ? 'score-mid' : 'score-low';

      const t = r.technical;
      let rsiHtml = '--';
      if (t && t.rsi != null) {
        const rsiCls = t.rsi < 35 ? 'rsi-oversold' : t.rsi > 70 ? 'rsi-overbought' : 'rsi-neutral';
        rsiHtml = `<span class="rsi-badge ${rsiCls}">${t.rsi.toFixed(1)}</span>`;
      }

      let macdHtml = '—';
      if (t && t.macdCross) {
        const bz = t.macdCross.belowZero ? '<span class="macd-bz" title="Cruce por debajo de cero">0&#9660;</span>' : '';
        if (t.macdCross.direction === 'up') {
          macdHtml = `<span class="macd-cross macd-up" title="Cruce alcista hace ${t.macdCross.daysAgo} día(s)">&#8593; Cruce alcista${t.macdCross.belowZero ? ' (bajo 0)' : ''}</span>${bz}`;
        } else {
          macdHtml = `<span class="macd-cross macd-down" title="Cruce bajista hace ${t.macdCross.daysAgo} día(s)">&#8595; Cruce bajista${t.macdCross.belowZero ? ' (bajo 0)' : ''}</span>${bz}`;
        }
      } else if (t && t.isMACDBullish) {
        macdHtml = `<span class="macd-cross macd-up" title="MACD alcista">&#8599; Alcista</span>`;
      } else if (t && t.isMACDBullish === false) {
        macdHtml = `<span class="macd-cross macd-down" title="MACD bajista">&#8600; Bajista</span>`;
      }

      let smaCrossHtml = '—';
      if (t && t.smaCross) {
        if (t.smaCross.direction === 'up') {
          smaCrossHtml = `<span class="macd-cross macd-up" title="Cruce dorado (SMA50 sobre SMA200) hace ${t.smaCross.daysAgo} día(s)">&#8593; Cruce 50/200</span>`;
        } else {
          smaCrossHtml = `<span class="macd-cross macd-down" title="Cruce de muerte (SMA50 bajo SMA200) hace ${t.smaCross.daysAgo} día(s)">&#8595; Cruce 50/200</span>`;
        }
      }

      let sma39Html = '—';
      if (t && t.sma39Cross) {
        if (t.sma39Cross.direction === 'up') {
          sma39Html = `<span class="macd-cross macd-up" title="Cruce alcista EMA3 sobre EMA9 hace ${t.sma39Cross.daysAgo} día(s)">&#8593; Cruce 3/9</span>`;
        } else {
          sma39Html = `<span class="macd-cross macd-down" title="Cruce bajista EMA3 bajo EMA9 hace ${t.sma39Cross.daysAgo} día(s)">&#8595; Cruce 3/9</span>`;
        }
      } else if (t && t.isSMA39Bullish === true) {
        sma39Html = `<span class="macd-cross macd-up" title="EMA3 sobre EMA9 (diario)">&#8599; Alcista</span>`;
      } else if (t && t.isSMA39Bullish === false) {
        sma39Html = `<span class="macd-cross macd-down" title="EMA3 bajo EMA9 (diario)">&#8600; Bajista</span>`;
      }

      let smaTrendHtml = '—';
      if (t && t.sma200Trend) {
        if (t.sma200Trend === 'up') smaTrendHtml = `<span class="trend-ind trend-up" title="MA200 alcista (+${t.sma200SlopePct}%)">&#8593;</span>`;
        else if (t.sma200Trend === 'down') smaTrendHtml = `<span class="trend-ind trend-down" title="MA200 bajista (${t.sma200SlopePct}%)">&#8595;</span>`;
        else smaTrendHtml = `<span class="trend-ind trend-flat" title="MA200 plana (${t.sma200SlopePct}%)">&#8594;</span>`;
      }

      const fmtDist = (v, cls) => {
        if (v === undefined || v === null || isNaN(v)) return '<span class="dist-val">--</span>';
        const sign = v > 0 ? '+' : '';
        const col = v > 0 ? 'dist-pos' : v < 0 ? 'dist-neg' : 'dist-neutral';
        return `<span class="dist-val ${col}">${sign}${v.toFixed(1)}%</span>`;
      };

      let stageHtml = '—';
      if (r.weinstein && r.weinstein.stage) {
        const sw = r.weinstein.stage;
        const stIcons = { 1: '\u25B2', 2: '\u2191', 3: '\u25BC', 4: '\u2193' };
        const stNames = { 1: 'Acum.', 2: 'Alcista', 3: 'Distrib.', 4: 'Bajista' };
        stageHtml = `<span class="stage-badge stage-${sw}" title="Etapa ${sw}: ${r.weinstein.stageName} — ${r.weinstein.stageDescription || ''}">${stIcons[sw] || ''} ${stNames[sw] || 'Sin datos'}</span>`;
      }

      tr.innerHTML = `
        <td class="rank-cell">${r.rank || i + 1}</td>
        <td class="ticker-cell">${r.stock.ticker}</td>
        <td class="name-cell">${r.stock.name}</td>
        <td class="sector-cell hide-mobile">${r.stock.sector}</td>
        <td class="price-cell">${r.price ? this.formatPrice(r.price) : '--'}</td>
        <td class="change-cell ${changeClass}">${r.change !== undefined ? changeSign + r.change.toFixed(2) + '%' : '--'}</td>
        <td class="hide-mobile">${r.fundamental && typeof r.fundamental.beta === 'number' ? `<span class="dist-val ${r.fundamental.beta >= 1 ? 'dist-pos' : 'dist-neg'}" title="Beta acci&oacute;n original (subyacente)">${r.fundamental.beta.toFixed(2)}</span>` : '--'}</td>
        <td class="rsi-cell">${rsiHtml}</td>
        <td class="macd-cell hide-mobile">${macdHtml}</td>
        <td class="hide-mobile">${smaCrossHtml}</td>
        <td class="hide-mobile">${sma39Html}</td>
        <td class="hide-mobile">${smaTrendHtml}</td>
        <td class="hide-mobile">${fmtDist(t && t.distanceFromSMA200)}</td>
        <td class="hide-mobile">${fmtDist(t && t.distanceFromSMA30)}</td>
        <td class="hide-mobile">${fmtDist(t && t.distanceFromWMA21)}</td>
        <td class="hide-mobile">${fmtDist(t && t.distanceFromPOC)}</td>
        <td class="hide-mobile">${fmtDist(t && t.distanceFromVWAP20)}</td>
        <td class="hide-mobile">${stageHtml}</td>
        <td class="score-cell"><span class="score-badge ${lcGrade}" title="${lcCount}/${lcTotal} señales alcistas (15 técnicas + 5 fundamentales)">${lcCount}<span class="lc-total">/${lcTotal}</span></span></td>
      `;

      tr.addEventListener('click', () => {
        if (this.callbacks.onSelectStock) this.callbacks.onSelectStock(r.stock.ticker);
      });

      tbody.appendChild(tr);
    });
  },

  updateStats(results) {
    document.getElementById('totalCount').textContent = results.length;
    document.getElementById('strongCount').textContent = results.filter(r => (r.longConditions?.count || 0) >= 15).length;
    document.getElementById('moderateCount').textContent = results.filter(r => { const c = r.longConditions?.count || 0; return c >= 10 && c < 15; }).length;
    document.getElementById('weakCount').textContent = results.filter(r => (r.longConditions?.count || 0) < 10).length;
  },

  // ===== DETAIL PANEL =====
  showDetail(data) {
    this.selectedTicker = data.stock.ticker;

    document.getElementById('detailEmpty').style.display = 'none';
    const detailView = document.getElementById('detailView');
    detailView.style.display = '';

    document.getElementById('detailTicker').textContent = data.stock.ticker;
    document.getElementById('detailName').textContent = data.stock.name;
    document.getElementById('detailPrice').textContent = data.price ? '$' + this.formatPrice(data.price) : '--';

    const changeEl = document.getElementById('detailChange');
    if (data.change !== undefined) {
      const changeClass = data.change >= 0 ? 'change-positive' : 'change-negative';
      const sign = data.change >= 0 ? '+' : '';
      changeEl.textContent = sign + data.change.toFixed(2) + '%';
      changeEl.className = 'detail-change ' + changeClass;
    } else {
      changeEl.textContent = '--';
      changeEl.className = 'detail-change';
    }

    const wtBtn = document.getElementById('watchlistToggle');
    const wl = this.getWatchlist();
    if (wl.includes(data.stock.ticker)) {
      wtBtn.textContent = '\u2713 Seguimiento';
      wtBtn.classList.add('in-watchlist');
    } else {
      wtBtn.textContent = '+ Seguimiento';
      wtBtn.classList.remove('in-watchlist');
    }
    wtBtn.onclick = () => this.toggleWatchlist(data.stock.ticker);

    const score = data.score;
    const lc = data.longConditions || { count: 0, total: 20, items: [] };
    const scoreCircle = document.getElementById('scoreCircle');
    const scoreGrade = document.getElementById('scoreGrade');
    const scoreLabel = document.getElementById('scoreLabel');
    const scoreBreakdown = document.getElementById('scoreBreakdown');

    const signalGrade = lc.count >= 15 ? 'score-circle-high' : lc.count >= 10 ? 'score-circle-mid' : 'score-circle-low';
    scoreCircle.className = 'score-circle ' + signalGrade;
    scoreCircle.textContent = lc.count * 5;
    scoreGrade.textContent = lc.count + '/20 señales (' + (lc.count * 5) + '/100) \u2014 ' + (score && score.label ? score.label : '');
    scoreLabel.textContent = '15 señales técnicas + 5 fundamentales';
    const techMet = (lc.items || []).filter(i => i.cat === 'tech' && i.met).length;
    const fundMet = (lc.items || []).filter(i => i.cat === 'fund' && i.met).length;
    scoreBreakdown.innerHTML = techMet + '/15 técnicas + ' + fundMet + '/5 fundamentales cumplidas';

    this.renderMetrics(data);
    this.renderExplanation(data);
    this.renderFundamentalBreakdown(data);
    this.renderTechnicalBreakdown(data);
    this.renderScoreBreakdown(data);
    this.renderChart(data);
    this.selectDetailTab('breakdown');

    if (window.innerWidth <= 1100) {
      document.getElementById('detailPanel').classList.add('open');
      document.getElementById('detailOverlay').classList.add('visible');
    }

    document.querySelectorAll('#rankingTable tr').forEach(tr => {
      tr.classList.toggle('active', tr.dataset.ticker === data.stock.ticker);
    });
  },

  renderMetrics(data) {
    const grid = document.getElementById('metricsGrid');
    grid.innerHTML = '';

    const f = data.fundamental;
    const t = data.technical;
    const metrics = [];

    if (f.pe) metrics.push({ label: 'P/E', value: f.pe.toFixed(1), cls: f.pe < f.sectorAvgPE ? 'positive' : 'neutral' });
    if (f.revenueGrowth !== null) metrics.push({ label: 'Crec. Ingresos', value: (f.revenueGrowth * 100).toFixed(1) + '%', cls: f.revenueGrowth > 0 ? 'positive' : 'negative' });
    if (f.roic) metrics.push({ label: 'ROIC', value: (f.roic * 100).toFixed(1) + '%', cls: f.roic > 0.12 ? 'positive' : 'neutral' });
    else if (f.roe) metrics.push({ label: 'ROE', value: (f.roe * 100).toFixed(1) + '%', cls: f.roe > 0.15 ? 'positive' : 'neutral' });
    if (f.debtToEquity) metrics.push({ label: 'D/E', value: f.debtToEquity.toFixed(2), cls: f.debtToEquity < 1 ? 'positive' : f.debtToEquity < 2 ? 'neutral' : 'negative' });
    if (t.rsi) metrics.push({ label: 'RSI (14)', value: t.rsi.toFixed(1), cls: t.rsi < 35 ? 'positive' : t.rsi > 70 ? 'negative' : 'neutral' });
    if (t.dropFromHigh !== undefined) metrics.push({ label: 'Desde Máx.', value: '-' + t.dropFromHigh.toFixed(1) + '%', cls: t.dropFromHigh > 20 ? 'positive' : 'neutral' });
    if (t.distanceFromSMA200 !== undefined) metrics.push({ label: 'vs MA200', value: t.distanceFromSMA200.toFixed(1) + '%', cls: t.distanceFromSMA200 < -5 ? 'positive' : 'neutral' });
    if (t.distanceFromVWAP20 !== undefined) metrics.push({ label: 'vs VWAP(20)', value: t.distanceFromVWAP20.toFixed(1) + '%', cls: t.distanceFromVWAP20 > 0 ? 'positive' : 'neutral' });
    if (f.freeCashflow) metrics.push({ label: 'FCF (B)', value: '$' + f.freeCashflow.toFixed(1) + 'B', cls: 'positive' });
    if (f.marketCap) metrics.push({ label: 'Cap. Mercado', value: '$' + f.marketCap.toFixed(1) + 'B', cls: 'neutral' });
    if (data.score.upside) metrics.push({ label: 'Potencial', value: data.score.upside.toFixed(1) + '%', cls: data.score.upside > 20 ? 'positive' : 'neutral' });
    if (f.histPercentile !== undefined) metrics.push({ label: 'Percentil Val.', value: f.histPercentile + '%', cls: f.histPercentile < 30 ? 'positive' : 'neutral' });
    if (t.volumeRatio) metrics.push({ label: 'Vol. Relativo', value: t.volumeRatio.toFixed(1) + 'x', cls: t.volumeRatio > 1.2 ? 'negative' : 'neutral' });

    metrics.forEach(m => {
      const card = document.createElement('div');
      card.className = 'metric-card';
      card.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value ${m.cls}">${m.value}</div>`;
      grid.appendChild(card);
    });
  },

  renderExplanation(data) {
    const box = document.getElementById('explanationBox');
    const explanation = ExplanationEngine.generate(
      data.stock.ticker, data.stock.name,
      data.fundamental, data.technical, data.score
    );
    box.innerHTML = ExplanationEngine.formatExplanation(explanation);
  },

  renderFundamentalBreakdown(data) {
    const container = document.getElementById('fundamentalBreakdown');
    const f = data.fundamental;
    if (!f) { container.innerHTML = '<div class="breakdown-item">Sin datos fundamentales</div>'; return; }
    const items = [];

    items.push({ label: 'P/E Actual', value: f.pe.toFixed(2) });
    items.push({ label: 'P/E Histórico (est.)', value: f.historicalPE.toFixed(2) });
    items.push({ label: 'Bajo Histórico', value: f.peBelowHistorical ? 'Sí' : 'No' });
    items.push({ label: 'P/E Prom. Sector', value: f.sectorAvgPE.toFixed(1) });
    items.push({ label: 'Bajo Sector', value: f.peBelowSector ? 'Sí' : 'No' });
    items.push({ label: 'Percentil Val.', value: f.histPercentile !== undefined ? f.histPercentile + '%' : 'N/A' });
    items.push({ label: 'Crec. Ingresos', value: f.revenueGrowth !== null ? (f.revenueGrowth * 100).toFixed(1) + '%' : 'N/A' });
    items.push({ label: 'Crec. BPA', value: f.epsGrowth !== null ? (f.epsGrowth * 100).toFixed(1) + '%' : 'N/A' });
    items.push({ label: 'Flujo de Caja Libre', value: f.hasFCF ? '$' + f.freeCashflow + 'B' : 'Negativo' });
    items.push({ label: 'ROE', value: (f.roe * 100).toFixed(1) + '%' });
    items.push({ label: 'ROIC', value: f.roic ? (f.roic * 100).toFixed(1) + '%' : 'N/A' });
    items.push({ label: 'D/E', value: f.debtToEquity.toFixed(2) });
    items.push({ label: 'Margen Operativo', value: f.operatingMargin.toFixed(1) + '%' });
    items.push({ label: 'Forward P/E', value: f.forwardPE !== null ? f.forwardPE.toFixed(1) : 'N/A' });
    items.push({ label: 'EV/EBITDA', value: f.evToEbitda !== null ? f.evToEbitda.toFixed(1) : 'N/A' });
    items.push({ label: 'P/S', value: f.priceToSales !== null ? f.priceToSales.toFixed(2) : 'N/A' });
    items.push({ label: 'PEG', value: f.peg !== null ? f.peg.toFixed(2) : 'N/A' });
    items.push({ label: 'Market Cap', value: f.marketCap ? '$' + f.marketCap + 'B' + (f.mcPass ? '' : ' <USD 10B') : 'N/A' });
    items.push({ label: 'Val. Relativa (señal 20)', value: f.valuationRelativelyCheap ? 'Sí (' + f.valuationMetCount + '/' + (f.valuationChecks||[]).length + ' métricas)' : 'No' });
    items.push({ label: 'Empresa de Calidad', value: f.isQuality ? 'Sí' : 'No' });

    container.innerHTML = items.map(item => `
      <div class="breakdown-item">
        <span class="breakdown-label">${item.label}</span>
        <span class="breakdown-value" style="color:var(--accent-blue)">${item.value}</span>
      </div>
    `).join('');
  },

  renderTechnicalBreakdown(data) {
    const container = document.getElementById('technicalBreakdown');
    const t = data.technical;
    if (!t || t.error) { container.innerHTML = '<div class="breakdown-item">Sin datos técnicos</div>'; return; }
    const items = [];

    items.push({ label: 'Último Precio', value: '$' + this.formatPrice(data.price) });
    items.push({ label: 'RSI (14)', value: t.rsi?.toFixed(1) || '--' });
    items.push({ label: 'Máx. 52 Sem.', value: t.highest52w ? '$' + this.formatPrice(t.highest52w) : '--' });
    items.push({ label: 'Mín. 52 Sem.', value: t.lowest52w ? '$' + this.formatPrice(t.lowest52w) : '--' });
    items.push({ label: 'Caída desde Máx.', value: t.dropFromHigh !== undefined ? '-' + t.dropFromHigh.toFixed(1) + '%' : '--' });
    items.push({ label: 'SMA20', value: t.sma20 ? '$' + this.formatPrice(t.sma20) : '--' });
    items.push({ label: 'SMA50', value: t.sma50 ? '$' + this.formatPrice(t.sma50) : '--' });
    items.push({ label: 'SMA200', value: t.sma200 ? '$' + this.formatPrice(t.sma200) : '--' });
    items.push({ label: 'VWAP', value: t.vwap ? '$' + this.formatPrice(t.vwap) : '--' });
    items.push({ label: 'VWAP (20)', value: t.vwap20 ? '$' + this.formatPrice(t.vwap20) : '--' });
    items.push({ label: 'vs VWAP (20)', value: t.distanceFromVWAP20 !== undefined ? t.distanceFromVWAP20.toFixed(1) + '%' : '--' });
    items.push({ label: 'Cruce MACD bajo 0', value: t.macdCrossBelowZero ? 'Sí' : 'No' });
    items.push({ label: 'vs SMA20', value: t.distanceFromSMA20 !== undefined ? t.distanceFromSMA20.toFixed(1) + '%' : '--' });
    items.push({ label: 'vs SMA50', value: t.distanceFromSMA50 !== undefined ? t.distanceFromSMA50.toFixed(1) + '%' : '--' });
    items.push({ label: 'vs SMA200', value: t.distanceFromSMA200 !== undefined ? t.distanceFromSMA200.toFixed(1) + '%' : '--' });
    items.push({ label: 'MACD', value: t.isMACDBullish ? 'Alcista' : 'Bajista' });
    items.push({ label: 'Histograma MACD', value: t.macdHistogram !== undefined ? t.macdHistogram.toFixed(2) : '--' });
    items.push({ label: 'Vol. Relativo (10/60)', value: t.volumeRatio ? t.volumeRatio.toFixed(2) + 'x' : '--' });
    items.push({ label: 'Vol vs Prom. 20', value: t.volumeVs20 !== null && t.volumeVs20 !== undefined ? t.volumeVs20.toFixed(2) + 'x' : '--' });
    items.push({ label: 'OBV', value: t.obvRising ? '↑ Ascendente' : '↓ Descendente' });
    items.push({ label: 'Estructura HH/HL', value: t.structureBullish ? 'Alcista' : 'Neutral/Bajista' });
    items.push({ label: 'Resistencia', value: t.resistanceLevel ? '$' + this.formatPrice(t.resistanceLevel) : '--' });
    items.push({ label: 'Dist. a Resistencia', value: t.distanceToResistance !== null && t.distanceToResistance !== undefined ? t.distanceToResistance.toFixed(1) + '%' : '--' });
    items.push({ label: 'Ruptura de Resistencia', value: t.brokeResistance ? (t.breakoutWithVolume ? 'Sí (con volumen)' : 'Sí') : 'No' });
    items.push({ label: 'Pullback sano', value: t.pullbackOk ? 'Sí' : 'No' });
    items.push({ label: 'RSI recuperando 50', value: t.rsiRecovering50 ? 'Sí' : 'No' });
    items.push({ label: 'ATR (14)', value: t.atr14 !== null && t.atr14 !== undefined ? '$' + this.formatPrice(t.atr14) : '--' });
    items.push({ label: 'Stop (2×ATR)', value: t.stopPct !== null && t.stopPct !== undefined ? t.stopPct.toFixed(1) + '%' : '--' });
    items.push({ label: 'R/R Ratio', value: t.rrRatio !== null && t.rrRatio !== undefined ? t.rrRatio.toFixed(1) : '--' });
    items.push({ label: 'Soporte Cercano', value: t.nearestSupport ? '$' + this.formatPrice(t.nearestSupport) : '--' });
    items.push({ label: 'Dist. al Soporte', value: t.distanceToSupport !== null ? t.distanceToSupport.toFixed(1) + '%' : '--' });
    items.push({ label: 'Bajo BB Inferior', value: t.belowLowerBB ? 'Sí' : 'No' });
    items.push({ label: 'Volatilidad (20d)', value: t.volatility ? t.volatility.toFixed(1) + '%' : '--' });
    items.push({ label: 'Días Sub/Baj (20)', value: (t.stUpDays || 0) + '/' + (t.stDownDays || 0) });
    items.push({ label: 'Razón de Caída', value: FundamentalEngine.detectDropReason(data.fundamental, t) });

    container.innerHTML = items.map(item => `
      <div class="breakdown-item">
        <span class="breakdown-label">${item.label}</span>
        <span class="breakdown-value" style="color:var(--accent-purple)">${item.value}</span>
      </div>
    `).join('');
  },

  renderScoreBreakdown(data) {
    const container = document.getElementById('scoreBreakdownTab');
    const s = data.score;
    const lc = data.longConditions || { count: 0, total: 20, items: [] };

    let checklist = '';
    if (lc && lc.items && lc.items.length) {
      const byCat = (cat) => lc.items.filter(i => i.cat === cat);
      const renderGroup = (cat, title) => {
        const list = byCat(cat);
        const met = list.filter(i => i.met).length;
        return `<div class="lc-panel"><div class="lc-title">${title} (${met}/${list.length})</div><div class="lc-list">` +
          list.map(it => `
          <div class="lc-item ${it.met ? 'met' : ''}">
            <span class="lc-check">${it.met ? '&#10003;' : '&#10007;'}</span>
            <span class="lc-label">${it.num}. ${it.label}${it.detail ? ` <small>(${it.detail})</small>` : ''}</span>
          </div>`).join('') + '</div></div>';
      };
      checklist = renderGroup('tech', 'Señales Técnicas Alcistas') + renderGroup('fund', 'Señales Fundamentales');
    }

    const items = [
      { label: 'Señales técnicas', value: lc.techCount || 0, total: 15 },
      { label: 'Señales fundamentales', value: lc.fundCount || 0, total: 5 },
      { label: 'Total', value: lc.count || 0, total: 20 },
    ];
    const subscores = '<div class="subscore-grid">' + items.map(item => `
      <div class="subscore-item">
        <div class="subscore-label">${item.label}</div>
        <div class="subscore-value" style="color:${item.value >= item.total * 0.6 ? 'var(--accent-green)' : 'var(--accent-red)'}">${item.value}/${item.total}</div>
      </div>
    `).join('') + '</div>';

    container.innerHTML = checklist + subscores;
  },

  selectDetailTab(name) {
    const bar = document.querySelector('#detailPanel .detail-tabs');
    if (!bar) return;
    bar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('#detailPanel .tab-content').forEach(c => c.classList.remove('active'));
    const tab = document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1));
    if (tab) tab.classList.add('active');
  },

  renderChart(data) {
    ChartRenderer.init('stockChart');
    if (data.ohlc && data.ohlc.length > 30) {
      ChartRenderer.render(data.ohlc, data.technical);
    } else {
      ChartRenderer.clear();
    }
  },

  // ===== HEATMAP =====
  renderHeatmap() {
    try {
      const canvas = document.getElementById('heatmapCanvas');
      const empty = document.getElementById('heatmapEmpty');
      if (!App.scanResults || App.scanResults.length < 5) {
        canvas.style.display = 'none';
        empty.style.display = 'flex';
        return;
      }
      canvas.style.display = 'block';
      empty.style.display = 'none';
      const matrix = HeatmapEngine.buildMatrix(App.scanResults);
      HeatmapEngine.draw(canvas, matrix, (ticker, sector) => {
        if (this.callbacks.onSelectStock) this.callbacks.onSelectStock(ticker);
        document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tabpanel="scanner"]').classList.add('active');
        document.getElementById('panelScanner').classList.add('active');
      });
    } catch (err) {
      console.error('[UI] Heatmap error:', err);
    }
  },

  // ===== WATCHLIST =====
  getWatchlist() {
    try { return JSON.parse(localStorage.getItem('stockScannerWatchlist') || '[]'); }
    catch { return []; }
  },

  saveWatchlist(tickers) {
    localStorage.setItem('stockScannerWatchlist', JSON.stringify(tickers));
    document.getElementById('watchlistBadge').textContent = tickers.length;
  },

  toggleWatchlist(ticker) {
    const wl = this.getWatchlist();
    const idx = wl.indexOf(ticker);
    if (idx >= 0) { wl.splice(idx, 1); }
    else { wl.push(ticker); }
    this.saveWatchlist(wl);
    const wtBtn = document.getElementById('watchlistToggle');
    if (wl.includes(ticker)) {
      wtBtn.textContent = '\u2713 Seguimiento';
      wtBtn.classList.add('in-watchlist');
    } else {
      wtBtn.textContent = '+ Seguimiento';
      wtBtn.classList.remove('in-watchlist');
    }
  },

  loadWatchlist() {
    const wl = this.getWatchlist();
    document.getElementById('watchlistBadge').textContent = wl.length;
  },

  renderWatchlist() {
    const wl = this.getWatchlist();
    const empty = document.getElementById('watchlistEmpty');
    const wrapper = document.getElementById('watchlistTableWrapper');
    const body = document.getElementById('watchlistBody');

    if (wl.length === 0) {
      empty.style.display = 'flex';
      wrapper.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    wrapper.style.display = 'block';
    body.innerHTML = '';

    wl.forEach(ticker => {
      const result = App.scanResults?.find(r => r.stock.ticker === ticker);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ticker-cell">${ticker}</td>
        <td class="name-cell">${result?.stock?.name || ticker}</td>
        <td class="sector-cell">${result?.stock?.sector || '--'}</td>
        <td class="score-cell">${result?.score?.overall ? `<span class="score-badge ${result.score.overall >= 60 ? 'score-high' : result.score.overall >= 40 ? 'score-mid' : 'score-low'}">${result.score.overall}</span>` : '--'}</td>
        <td style="font-size:0.75rem;color:var(--text-muted)">Guardado</td>
        <td><button class="watchlist-remove-btn" data-ticker="${ticker}">Eliminar</button></td>
      `;
      tr.querySelector('.watchlist-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleWatchlist(ticker);
        this.renderWatchlist();
      });
      tr.addEventListener('click', () => {
        if (this.callbacks.onSelectStock) this.callbacks.onSelectStock(ticker);
        document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tabpanel="scanner"]').classList.add('active');
        document.getElementById('panelScanner').classList.add('active');
      });
      body.appendChild(tr);
    });
  },

  // ===== BACKTEST =====
  renderBacktestResult(result) {
    const container = document.getElementById('btResults');
    const empty = document.getElementById('btEmpty');
    if (!result) {
      empty.style.display = 'flex';
      container.innerHTML = '';
      return;
    }
    empty.style.display = 'none';

    if (result.error) {
      container.innerHTML = `<div class="bt-result-card"><div class="bt-result-header"><span>Error</span><span style="color:var(--accent-red)">${result.error}</span></div></div>`;
      return;
    }

    const returnClass = result.holdReturn >= 0 ? 'change-positive' : 'change-negative';
    const returnSign = result.holdReturn >= 0 ? '+' : '';
    const maxH = 36;

    let histogramHtml = '';
    const prices = result.histogram || [];
    const closePrices = prices.map(d => d.close);
    const minP = Math.min(...closePrices);
    const maxP = Math.max(...closePrices);
    const rangeP = maxP - minP || 1;
    if (closePrices.length > 1) {
      histogramHtml = '<div class="bt-histogram">';
      const step = Math.max(1, Math.floor(closePrices.length / 60));
      for (let i = 0; i < closePrices.length; i += step) {
        const h = ((closePrices[i] - minP) / rangeP) * maxH;
        const isUp = i === 0 || closePrices[i] >= closePrices[i - 1];
        histogramHtml += `<div class="bt-bar" style="height:${Math.max(2, h)}px;background:${isUp ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>`;
      }
      histogramHtml += '</div>';
    }

    container.innerHTML = `
      <div class="bt-result-card" style="animation:fadeIn 0.3s ease forwards">
        <div class="bt-result-header">
          <div>
            <div class="bt-result-title">${result.ticker}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${result.startDate} \u2192 ${result.endDate} (${result.days} días)</div>
          </div>
          <div class="bt-result-return ${returnClass}">${returnSign}${result.holdReturn.toFixed(2)}%</div>
        </div>
        ${histogramHtml}
        <div class="bt-metrics">
          <div class="bt-metric">Entrada: <span>$${result.startPrice.toFixed(2)}</span></div>
          <div class="bt-metric">Salida: <span>$${result.endPrice.toFixed(2)}</span></div>
          <div class="bt-metric">Máx. DD: <span style="color:var(--accent-red)">-${result.maxDrawdown.toFixed(2)}%</span></div>
          <div class="bt-metric">Tasa Acierto: <span>${result.winRate.toFixed(1)}%</span></div>
          <div class="bt-metric">Días Subida: <span style="color:var(--accent-green)">${result.upDays}</span></div>
          <div class="bt-metric">Días Bajada: <span style="color:var(--accent-red)">${result.dnDays}</span></div>
          <div class="bt-metric">Retorno 30d: <span class="${result.return30d >= 0 ? 'change-positive' : 'change-negative'}">${result.return30d >= 0 ? '+' : ''}${result.return30d.toFixed(2)}%</span></div>
          <div class="bt-metric">Mínimo: <span>$${result.minPrice.toFixed(2)}</span></div>
          <div class="bt-metric">Máximo: <span>$${result.maxPrice.toFixed(2)}</span></div>
        </div>
      </div>
    `;
  },

  renderBacktestResults(results) {
    const container = document.getElementById('btResults');
    const empty = document.getElementById('btEmpty');
    if (!results || results.length === 0) {
      empty.style.display = 'flex';
      container.innerHTML = '';
      return;
    }
    empty.style.display = 'none';
    container.innerHTML = '';

    results.forEach(r => {
      if (r.result.error) {
        container.innerHTML += `<div class="bt-result-card"><div class="bt-result-header"><span>${r.ticker}</span><span style="color:var(--accent-red)">${r.result.error}</span></div></div>`;
        return;
      }
      const res = r.result;
      const returnClass = res.holdReturn >= 0 ? 'change-positive' : 'change-negative';
      const returnSign = res.holdReturn >= 0 ? '+' : '';

      const closePrices = (res.histogram || []).map(d => d.close);
      const minP = Math.min(...closePrices);
      const maxP = Math.max(...closePrices);
      const rangeP = maxP - minP || 1;
      const maxH = 30;
      let histHtml = '';
      if (closePrices.length > 1) {
        histHtml = '<div class="bt-histogram" style="height:30px">';
        const step = Math.max(1, Math.floor(closePrices.length / 40));
        for (let i = 0; i < closePrices.length; i += step) {
          const h = ((closePrices[i] - minP) / rangeP) * maxH;
          const isUp = i === 0 || closePrices[i] >= closePrices[i - 1];
          histHtml += `<div class="bt-bar" style="height:${Math.max(2, h)}px;background:${isUp ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>`;
        }
        histHtml += '</div>';
      }

      container.innerHTML += `
        <div class="bt-result-card" style="animation:fadeIn 0.2s ease forwards">
          <div class="bt-result-header">
            <div class="bt-result-title">${r.ticker}</div>
            <div class="bt-result-return ${returnClass}">${returnSign}${res.holdReturn.toFixed(2)}%</div>
          </div>
          ${histHtml}
          <div class="bt-metrics">
            <div class="bt-metric">Max DD: <span style="color:var(--accent-red)">-${res.maxDrawdown.toFixed(1)}%</span></div>
            <div class="bt-metric">Win Rate: <span>${res.winRate.toFixed(0)}%</span></div>
            <div class="bt-metric">${res.days}d</div>
          </div>
        </div>
      `;
    });
  },

  // ===== STAGE ANALYSIS =====
  renderStageResult(data) {
    const empty = document.getElementById('stageEmpty');
    const detail = document.getElementById('stageDetail');

    if (!data || data.error) {
      empty.style.display = 'flex';
      detail.style.display = 'none';
      if (data?.error) empty.querySelector('.empty-state-text').textContent = data.error;
      return;
    }

    empty.style.display = 'none';
    detail.style.display = 'block';

    document.getElementById('stageTickerLabel').textContent = data.ticker;
    document.getElementById('stageNameLabel').textContent = data.name || '';

    const fmt = StageAnalyzer.formatStage(data);
    const badge = document.getElementById('stageBadge');
    badge.textContent = fmt.icon + ' ' + fmt.name;
    badge.style.background = fmt.color + '18';
    badge.style.color = fmt.color;
    badge.style.border = '2px solid ' + fmt.color;

    const stageNames = { 1: 'Acumulación', 2: 'Alcista', 3: 'Distribución', 4: 'Bajista' };
    const dirNames = { up: 'alcista \u2191', down: 'bajista \u2193', flat: 'plana \u2192' };

    const summary = document.getElementById('stageSummary');
    summary.innerHTML = `
      <strong>Etapa ${data.stage} — ${stageNames[data.stage] || 'Desconocida'}</strong><br>
      WMA30: <strong>$${data.wma30}</strong> (pendiente ${dirNames[data.wmaDirection] || data.wmaDirection}, ${data.wma30Slope > 0 ? '+' : ''}${data.wma30Slope}%)<br>
      Precio vs WMA30: <strong style="color:${data.priceToWma > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${data.priceToWma > 0 ? '+' : ''}${data.priceToWma}%</strong><br>
      Volumen reciente vs histórico: <strong>${(data.volumeTrend * 100).toFixed(0)}%</strong>${data.transition ? '<br>Transición: <strong style="color:var(--accent-fuchsia)">' + this._transitionName(data.transition) + '</strong>' : ''}
    `;

    document.getElementById('stageDescription').textContent = data.stageDescription;

    const grid = document.getElementById('stageGrid');
    grid.innerHTML = '';
    const items = [
      { label: 'WMA30', value: '$' + data.wma30.toFixed(2) },
      { label: 'Pendiente WMA', value: (data.wma30Slope > 0 ? '+' : '') + data.wma30Slope + '%' },
      { label: 'Dist. WMA30', value: (data.priceToWma > 0 ? '+' : '') + data.priceToWma + '%' },
      { label: 'Tendencia Vol.', value: (data.volumeTrend * 100).toFixed(0) + '%' },
      { label: 'Soporte', value: data.supportLevel ? '$' + data.supportLevel.toFixed(2) : '--' },
      { label: 'Resistencia', value: data.resistanceLevel ? '$' + data.resistanceLevel.toFixed(2) : '--' },
      { label: 'Nivel Ruptura', value: data.breakoutLevel ? '$' + data.breakoutLevel.toFixed(2) : '--' },
      { label: 'Confianza Trans.', value: data.transitionConfidence ? data.transitionConfidence + '%' : '--' },
    ];
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'stage-grid-item';
      div.innerHTML = `<div class="stage-grid-label">${item.label}</div><div class="stage-grid-value">${item.value}</div>`;
      grid.appendChild(div);
    });

    this._renderStageChart(data);

    const signals = document.getElementById('stageSignals');
    signals.innerHTML = '';
    const signalItems = this._stageSignals(data);
    signalItems.forEach(s => {
      const div = document.createElement('div');
      div.className = 'stage-signal';
      div.innerHTML = `<span class="stage-signal-icon" style="color:${s.color}">${s.icon}</span><div><div class="stage-signal-text">${s.text}</div><div class="stage-signal-detail">${s.detail}</div></div>`;
      signals.appendChild(div);
    });
  },

  _transitionName(t) {
    const names = {
      bullish_breakout: 'Ruptura alcista inminente \u2191',
      recovery_to_accumulation: 'Recuperación hacia acumulación',
      distributing: 'Posible distribución',
    };
    return names[t] || t;
  },

  _stageSignals(data) {
    const signals = [];
    const s = data;

    if (s.stage === 2) {
      if (s.transition === 'bullish_breakout' || s.transitionConfidence > 50) {
        signals.push({ icon: '\u2705', color: 'var(--accent-green)', text: 'Etapa 2 confirmada — Inicio de tendencia alcista', detail: 'Precio sobre WMA30 con pendiente positiva. Volumen confirma el movimiento.' });
      } else {
        signals.push({ icon: '\u2191', color: 'var(--accent-green)', text: 'Tendencia alcista activa', detail: 'Mantener mientras el precio se mantenga sobre la WMA30 con pendiente positiva.' });
      }
    }
    if (s.stage === 1) {
      signals.push({ icon: '\u25B2', color: 'var(--accent-celeste)', text: 'Zona de acumulación', detail: 'La WMA30 se está aplanando. Buscar ruptura sobre resistencia de la Etapa 1 con volumen creciente para entrada.' });
      if (s.resistanceLevel) {
        signals.push({ icon: '\uD83C\uDFAF', color: 'var(--accent-celeste)', text: 'Nivel clave a vigilar: $' + s.resistanceLevel.toFixed(2), detail: 'Ruptura semanal sobre este nivel con volumen > 1.5x confirma inicio de Etapa 2.' });
      }
    }
    if (s.stage === 3) {
      signals.push({ icon: '\u26A0', color: 'var(--accent-yellow)', text: 'Posible distribución — Precaución', detail: 'La WMA30 se aplana tras una subida prolongada. Considerar reducir posición.' });
    }
    if (s.stage === 4) {
      signals.push({ icon: '\u274C', color: 'var(--accent-red)', text: 'Etapa bajista — Evitar compras', detail: 'Esperar a que se forme una nueva base de acumulación (Etapa 1) antes de considerar entrada.' });
    }

    if (s.priceToWma > 15) {
      signals.push({ icon: '\uD83D\uDCC8', color: 'var(--accent-yellow)', text: 'Extendido desde WMA30 (+' + s.priceToWma + '%)', detail: 'Precio muy alejado de la media. Posible corrección o consolidación cercana.' });
    }
    if (s.volumeTrend > 1.3 && s.stage === 2) {
      signals.push({ icon: '\uD83D\uDCCA', color: 'var(--accent-green)', text: 'Volumen creciente confirma tendencia', detail: 'El volumen reciente es ' + (s.volumeTrend * 100).toFixed(0) + '% del histórico, indicando participación.' });
    }
    if (s.transition === 'bullish_breakout') {
      signals.push({ icon: '\uD83D\uDE80', color: 'var(--accent-fuchsia)', text: '\u2605 Señal de COMPRA — Inicio de Etapa 2', detail: 'Ruptura de acumulación con WMA30 alcista y volumen de confirmación. Entrada ideal según Weinstein.' });
    }

    return signals;
  },

  _renderStageChart(data) {
    const canvas = document.getElementById('stageChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width || 600;
    const H = 300;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const weekly = data.weeklyData || [];
    const valid = weekly.filter(w => w.close != null);
    if (valid.length < 5) return;

    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const prices = valid.map(w => w.close);
    const wmas = valid.map(w => w.wma30);
    const maxP = Math.max(...prices, ...wmas.filter(v => v != null));
    const minP = Math.min(...prices, ...wmas.filter(v => v != null));
    const range = maxP - minP || 1;

    const xStep = cw / Math.max(1, valid.length - 1);

    ctx.clearRect(0, 0, W, H);

    function yPos(v) { return pad.top + ch - ((v - minP) / range) * ch; }

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(136,136,160,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = maxP - (range / 4) * i;
      ctx.fillText('$' + v.toFixed(0), pad.left - 4, pad.top + (ch / 4) * i + 3);
    }

    if (data.wma30 && data.wma30 > 0) {
      ctx.strokeStyle = 'rgba(214,51,132,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < valid.length; i++) {
        if (wmas[i] == null) continue;
        const x = pad.left + i * xStep;
        const y = yPos(wmas[i]);
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(79,195,247,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < valid.length; i++) {
      const x = pad.left + i * xStep;
      const y = yPos(prices[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
      ctx.stroke();

    ctx.fillStyle = '#4fc3f7';
    for (let i = 0; i < valid.length; i += Math.max(1, Math.floor(valid.length / 40))) {
      const x = pad.left + i * xStep;
      const y = yPos(prices[i]);
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }

    const lastX = pad.left + (valid.length - 1) * xStep;
    const lastY = yPos(prices[prices.length - 1]);
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.stroke();
  },

  // ===== LOADING / PROGRESS =====
  showLoading(visible) {
    const bar = document.getElementById('loadingBar');
    bar.style.display = visible ? 'block' : 'none';
  },

  showScanProgress(current, total, ticker) {
    const progress = document.getElementById('scanProgress');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const tickerEl = document.getElementById('currentTicker');

    if (current === undefined) {
      progress.classList.remove('visible');
      tickerEl.textContent = '';
      return;
    }

    progress.classList.add('visible');
    fill.style.width = total > 0 ? (current / total) * 100 + '%' : '0%';
    text.textContent = `${current} / ${total}`;
    if (ticker) tickerEl.textContent = ticker;
  },

  setScanButtonLoading(loading) {
    const btn = document.getElementById('scanBtn');
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
    btn.querySelector('.btn-text').textContent = loading ? 'Escaneando...' : 'Escanear S&P500';
  },

  showEmptyState() {
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('rankingTable').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('emptyState').querySelector('.empty-state-title').textContent = 'Listo para escanear';
    document.getElementById('emptyState').querySelector('.empty-state-text').innerHTML = 'Haz clic en <strong>"Escanear S&P500"</strong> para encontrar oportunidades infravaloradas. El escáner analiza fundamentales y técnicos de más de 130 acciones con CEDEAR/ADR (comprables desde Argentina).';
  },

  closeDetailPanel() {
    document.getElementById('detailPanel').classList.remove('open');
    document.getElementById('detailOverlay').classList.remove('visible');
  },

  formatPrice(price) {
    if (!price && price !== 0) return '--';
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (price >= 10) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price.toFixed(3);
  },

  // ===== REPORT / RESUMEN =====
  renderReport() {
    const reportReady = document.getElementById('reportReady');
    const reportEmpty = document.getElementById('reportEmpty');
    const content = document.getElementById('reportContent');

    if (!App.scanResults || App.scanResults.length === 0) {
      reportReady.style.display = 'none';
      reportEmpty.style.display = 'flex';
      return;
    }

    reportEmpty.style.display = 'none';
    reportReady.style.display = 'block';

    const html = ReportEngine.generateHTML(App.scanResults);
    reportReady.innerHTML = html;

    document.getElementById('exportReportBtn').onclick = () => this.exportReport();
    this.loadEmailConfig();
    document.getElementById('emailConfigToggleBtn').onclick = () => this.toggleEmailConfig();
    document.getElementById('sendReportEmailBtn').onclick = () => this.sendReportEmail();
  },

  toggleEmailConfig() {
    const panel = document.getElementById('emailConfigPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') this.loadEmailConfig();
  },

  async loadEmailConfig() {
    try {
      const res = await fetch('/api/get-email-config');
      const config = await res.json();
      if (config.configured) {
        document.getElementById('emailAddr').value = config.email || '';
        document.getElementById('smtpHost').value = config.smtpHost || 'smtp.gmail.com';
        document.getElementById('smtpPort').value = config.smtpPort || 587;
      }
    } catch {}
  },

  async sendReportEmail() {
    const btn = document.getElementById('sendReportEmailBtn');
    const status = document.getElementById('emailStatus');
    const email = document.getElementById('emailAddr').value.trim();
    const password = document.getElementById('emailPass').value.trim();
    const smtpHost = document.getElementById('smtpHost').value.trim() || 'smtp.gmail.com';
    const smtpPort = parseInt(document.getElementById('smtpPort').value) || 587;

    if (!email || !password) {
      status.textContent = 'Por favor completa email y contraseña.';
      status.style.color = 'var(--accent-red)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';
    status.textContent = 'Enviando informe...';
    status.style.color = 'var(--text-muted)';

    try {
      const reportHtml = ReportEngine.generateHTML(App.scanResults);
      if (!reportHtml) {
        status.textContent = 'No hay datos de informe para enviar.';
        status.style.color = 'var(--accent-red)';
        btn.disabled = false;
        btn.textContent = 'Enviar';
        return;
      }

      // Save config
      await fetch('/api/save-email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, smtpHost, smtpPort }),
      });

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: reportHtml, email, password, smtpHost, smtpPort }),
      });
      const result = await res.json();

      if (result.success) {
        status.textContent = `Informe enviado exitosamente a ${email}`;
        status.style.color = 'var(--accent-green)';
      } else {
        status.textContent = 'Error: ' + (result.error || 'desconocido');
        status.style.color = 'var(--accent-red)';
      }
    } catch (err) {
      status.textContent = 'Error de conexión: ' + err.message;
      status.style.color = 'var(--accent-red)';
    }

    btn.disabled = false;
    btn.textContent = 'Enviar';
  },

  exportReport() {
    const html = ReportEngine.generateHTML(App.scanResults);
    if (!html) return;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-sp500-${dateStr}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ===== SWING TRADING =====
  runSwingFilter() {
    const status = document.getElementById('swingStatus');
    const empty = document.getElementById('swingEmpty');
    const wrapper = document.getElementById('swingTableWrapper');
    const body = document.getElementById('swingBody');
    const summary = document.getElementById('swingSummary');
    const best = document.getElementById('swingBest');

    if (!App.scanResults || App.scanResults.length === 0) {
      status.textContent = 'Escanea el mercado primero.';
      status.style.color = 'var(--accent-red)';
      return;
    }

    status.textContent = 'Filtrando...';
    status.style.color = 'var(--text-muted)';

    const result = SwingEngine.filter(App.scanResults);
    if (!result.success || result.matches.length === 0) {
      status.textContent = 'No se encontraron acciones que cumplan todas las condiciones.';
      status.style.color = 'var(--accent-red)';
      empty.style.display = 'flex';
      wrapper.style.display = 'none';
      return;
    }

    status.textContent = `${result.matches.length} acción(es) encontrada(s) que cumplen TODAS las condiciones.`;
    status.style.color = 'var(--accent-green)';
    empty.style.display = 'none';
    wrapper.style.display = 'block';

    body.innerHTML = result.matches.map(m => {
      const macdText = m.macdCrossed === 1 ? 'Hoy' : `Hace ${m.macdCrossed} días`;
      const sectorDir = m.sector ? m.sector.toLowerCase().includes('health') || m.sector.toLowerCase().includes('utility') || m.sector.toLowerCase().includes('defensive') ? '\u2191 Defensivo' : m.sector.toLowerCase().includes('tech') || m.sector.toLowerCase().includes('consumer cyclical') ? '\u2191 Crecimiento' : '\u2192 Neutral' : '';
      let justification = `Precio sobre SMA200, tendencia alcista (SMA50 > SMA200, EMA20 > EMA50).`;
      justification += ` Pullback de ${m.pullbackDays.toFixed(1)}% hacia ${Math.abs(m.distEMA20) < Math.abs(m.distSMA50) ? 'EMA20' : 'SMA50'}.`;
      justification += ` MACD cruce alcista (${macdText}), RSI ${m.rsi.toFixed(1)} en rango neutral.`;
      if (m.distEMA20 > -1 && m.distEMA20 < 1) justification += ` Cotizando justo en EMA20 (soporte).`;
      if (m.rsi < 55) justification += ` RSI alejado de sobrecompra, permite recorrido alcista.`;

      return `<tr>
        <td><strong>${m.ticker}</strong><br><span style="font-size:0.65rem;color:var(--text-muted)">${m.name}</span></td>
        <td>${this.formatPrice(m.price)}</td>
        <td class="${(m.change || 0) >= 0 ? 'change-positive' : 'change-negative'}">${(m.change || 0) >= 0 ? '+' : ''}${(m.change || 0).toFixed(2)}%</td>
        <td>$${this.formatPrice(m.sma200)}</td>
        <td>$${this.formatPrice(m.sma50)}</td>
        <td>$${this.formatPrice(m.ema20)}</td>
        <td><span class="swing-rsi ${m.rsi < 55 ? 'swing-rsi-ideal' : 'swing-rsi-ok'}">${m.rsi.toFixed(1)}</span></td>
        <td><span class="swing-macd-badge">${macdText}</span></td>
        <td style="font-size:0.7rem;color:var(--text-muted);max-width:260px">${justification}</td>
      </tr>`;
    }).join('');

    summary.innerHTML = `
      <strong>${result.matches.length}</strong> acción(es) filtrada(s) de <strong>${App.scanResults.length}</strong> escaneadas.
      &bull; Criterios: Tendencia alcista (SMA50>SMA200, EMA20>EMA50, Precio>SMA200) + Pullback reciente + MACD cruce alcista + RSI 40-70.
    `;

    const bestMatch = SwingEngine.getBestMatch(result.matches);
    if (bestMatch) {
      best.innerHTML = `
        <div style="font-weight:600;color:var(--accent-fuchsia);margin-bottom:4px">\u2605 Mejor Oportunidad Actual</div>
        <div><strong>${bestMatch.ticker}</strong> — Precio $${this.formatPrice(bestMatch.price)}, RSI ${bestMatch.rsi.toFixed(1)}, MACD cruce ${bestMatch.macdCrossed === 1 ? 'hoy' : 'hace ' + bestMatch.macdCrossed + ' días'}.</div>
        <div style="color:var(--text-muted);margin-top:4px">
          Presenta pullback controlado (${bestMatch.pullbackDays.toFixed(1)}%) con tendencia de fondo alcista intacta.
          El RSI en ${bestMatch.rsi.toFixed(1)} da espacio para subir sin estar sobrecomprado.
          ${bestMatch.sector ? 'Sector: ' + bestMatch.sector + '. ' : ''}
          Entrada ideal cerca de EMA20 con stop bajo SMA50.
        </div>
      `;
    } else {
      best.innerHTML = '';
    }

    // Top 10 mejores condiciones de compra
    this.renderSwingTop10();
  },

  renderSwingTop10() {
    const section = document.getElementById('swingTop10Section');
    const status = document.getElementById('swingTop10Status');
    const body = document.getElementById('swingTop10Body');

    if (!App.scanResults || App.scanResults.length === 0) {
      section.style.display = 'none';
      return;
    }

    const top10 = SwingEngine.getTopBuyPicks(App.scanResults, 10);
    if (top10.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    status.textContent = `Ranking de las ${top10.length} mejores oportunidades de compra sobre ${App.scanResults.length} acciones analizadas.`;

    body.innerHTML = top10.map((m, i) => {
      const rankClass = i === 0 ? 'swing-rank-1' : i < 3 ? 'swing-rank-2' : '';
      const scoreClass = m.buyScore >= 70 ? 'score-high' : m.buyScore >= 50 ? 'score-mid' : 'score-low';

      return `<tr>
        <td><span class="swing-rank ${rankClass}">${i + 1}</span></td>
        <td><strong>${m.ticker}</strong><br><span style="font-size:0.65rem;color:var(--text-muted)">${m.name}</span></td>
        <td>${this.formatPrice(m.price)}</td>
        <td class="${(m.change || 0) >= 0 ? 'change-positive' : 'change-negative'}">${(m.change || 0) >= 0 ? '+' : ''}${(m.change || 0).toFixed(2)}%</td>
        <td><span class="swing-rsi ${m.rsi >= 45 && m.rsi <= 60 ? 'swing-rsi-ideal' : 'swing-rsi-ok'}">${m.rsi.toFixed(1)}</span></td>
        <td><span class="score-badge ${scoreClass}">${m.buyScore}</span></td>
        <td style="font-size:0.7rem;color:var(--text-muted);max-width:260px">${m.reasons}</td>
      </tr>`;
    }).join('');
  },
};
