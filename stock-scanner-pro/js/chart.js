const ChartRenderer = {
  canvas: null,
  ctx: null,
  data: null,
  dpr: 1,
  width: 0,
  height: 0,
  mainHeight: 0,
  volumeHeight: 0,
  rsiHeight: 0,
  macdHeight: 0,
  padding: { top: 20, right: 70, bottom: 30, left: 10 },
  innerPadding: 6,

  COLORS: {},

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.COLORS = CONFIG.CHART;
  },

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = rect.width || 600;
    const h = 420;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.width = w;
    this.height = h;
    this.mainHeight = h * 0.55;
    this.volumeHeight = h * 0.12;
    this.rsiHeight = h * 0.16;
    this.macdHeight = h * 0.17;
  },

  render(ohlcData, extraData) {
    if (!this.canvas || !ohlcData || ohlcData.length < 30) return;
    this.data = ohlcData;
    this.resize();
    this.drawMainPane(extraData);
    this.drawVolumePane();
    this.drawRSIPane(extraData);
    this.drawMACDPane(extraData);
  },

  drawMainPane(extraData) {
    const { ctx, width, height, padding, innerPadding, mainHeight, data } = this;
    const C = this.COLORS;
    const top = padding.top;
    const bottom = top + mainHeight;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = mainHeight - innerPadding * 2;

    ctx.clearRect(0, 0, width, height);

    const closes = data.map(d => d.close);
    const maxPrice = Math.max(...data.map(d => d.high));
    const minPrice = Math.min(...data.map(d => d.low));
    const priceRange = maxPrice - minPrice || 1;
    const candleWidth = Math.max(1, chartWidth / data.length - 1);
    const halfCandle = Math.max(0, candleWidth / 2);

    const xPos = (i) => padding.left + (i / data.length) * chartWidth;
    const yPos = (price) => top + innerPadding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

    ctx.strokeStyle = C.GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + innerPadding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      const price = maxPrice - (priceRange / 4) * i;
      ctx.fillStyle = C.TEXT_COLOR;
      ctx.font = '10px SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatPrice(price), width - padding.right + 6, y + 3);
    }

    const sma20 = TechnicalEngine.calculateSMA(closes, 20);
    const sma50 = TechnicalEngine.calculateSMA(closes, 50);
    const sma200 = TechnicalEngine.calculateSMA(closes, 200);

    this.drawLine(sma20, C.MA20_COLOR, xPos, yPos);
    this.drawLine(sma50, C.MA50_COLOR, xPos, yPos);
    this.drawLine(sma200, C.MA200_COLOR, xPos, yPos);

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = xPos(i);
      const isUp = d.close >= d.open;
      const color = isUp ? C.CANDLE_UP_COLOR : C.CANDLE_DOWN_COLOR;
      const openY = yPos(d.open);
      const closeY = yPos(d.close);
      const highY = yPos(d.high);
      const lowY = yPos(d.low);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      if (candleWidth >= 3) {
        ctx.fillStyle = color;
        ctx.fillRect(x - halfCandle, bodyTop, candleWidth - 1, bodyHeight);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x - 0.5, bodyTop, 1, bodyHeight);
      }
    }

    if (extraData && extraData.nearestSupport) {
      const supportY = yPos(extraData.nearestSupport);
      ctx.strokeStyle = 'rgba(38, 166, 154, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, supportY);
      ctx.lineTo(width - padding.right, supportY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(38, 166, 154, 0.6)';
      ctx.font = '9px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Support $' + this.formatPrice(extraData.nearestSupport), padding.left + 4, supportY - 4);
    }

    if (extraData && extraData.nearestResistance) {
      const resY = yPos(extraData.nearestResistance);
      ctx.strokeStyle = 'rgba(239, 83, 80, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, resY);
      ctx.lineTo(width - padding.right, resY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239, 83, 80, 0.6)';
      ctx.font = '9px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Resistance $' + this.formatPrice(extraData.nearestResistance), padding.left + 4, resY - 4);
    }

    const lastDate = data[data.length - 1].date;
    ctx.fillStyle = C.TEXT_COLOR;
    ctx.font = '10px SF Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), width - padding.right, height - 6);

    const firstDate = data[0].date;
    ctx.textAlign = 'left';
    ctx.fillText(firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), padding.left, height - 6);

    ctx.fillStyle = C.TEXT_COLOR;
    ctx.font = '9px SF Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('MA20', width - padding.right - 50, top + 12);
    ctx.fillStyle = C.MA20_COLOR;
    ctx.fillRect(width - padding.right - 54, top + 5, 8, 8);

    ctx.fillStyle = C.TEXT_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText('MA50', width - padding.right - 50, top + 24);
    ctx.fillStyle = C.MA50_COLOR;
    ctx.fillRect(width - padding.right - 54, top + 17, 8, 8);

    ctx.fillStyle = C.TEXT_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText('MA200', width - padding.right - 50, top + 36);
    ctx.fillStyle = C.MA200_COLOR;
    ctx.fillRect(width - padding.right - 54, top + 29, 8, 8);
  },

  drawLine(values, color, xPos, yPos) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null || values[i] === undefined) { started = false; continue; }
      const x = xPos(i);
      const y = yPos(values[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },

  drawVolumePane() {
    const { ctx, width, height, padding, data, mainHeight, volumeHeight } = this;
    const C = this.COLORS;
    const top = padding.top + mainHeight;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = volumeHeight - 4;

    const volumes = data.map(d => d.volume);
    const maxVolume = Math.max(...volumes) || 1;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = padding.left + (i / data.length) * chartWidth;
      const barHeight = (d.volume / maxVolume) * chartHeight;
      const barWidth = Math.max(1, chartWidth / data.length - 1);
      const isUp = d.close >= d.open;
      ctx.fillStyle = isUp ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)';
      ctx.fillRect(x, top + chartHeight - barHeight, barWidth, barHeight);
    }

    ctx.strokeStyle = C.GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, top);
    ctx.lineTo(width - padding.right, top);
    ctx.stroke();

    ctx.fillStyle = C.TEXT_COLOR;
    ctx.font = '9px SF Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Vol', padding.left + 4, top + 12);
  },

  drawRSIPane(extraData) {
    const { ctx, width, height, padding, data, mainHeight, volumeHeight, rsiHeight } = this;
    const C = this.COLORS;
    const top = padding.top + mainHeight + volumeHeight;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = rsiHeight - 4;

    ctx.strokeStyle = C.GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, top);
    ctx.lineTo(width - padding.right, top);
    ctx.stroke();

    const closes = data.map(d => d.close);
    const rsiValues = TechnicalEngine.calculateRSI(closes, 14);

    const rsiMax = 100;
    const rsiMin = 0;
    const rsiRange = rsiMax - rsiMin;

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255, 171, 0, 0.2)';
    ctx.lineWidth = 1;
    const overboughtY = top + 4 + chartHeight - ((70 - rsiMin) / rsiRange) * chartHeight;
    const oversoldY = top + 4 + chartHeight - ((30 - rsiMin) / rsiRange) * chartHeight;
    ctx.beginPath(); ctx.moveTo(padding.left, overboughtY); ctx.lineTo(width - padding.right, overboughtY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padding.left, oversoldY); ctx.lineTo(width - padding.right, oversoldY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 171, 0, 0.3)';
    ctx.font = '8px SF Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('70', width - padding.right + 6, overboughtY + 3);
    ctx.fillText('30', width - padding.right + 6, oversoldY + 3);

    const xPos = (i) => padding.left + (i / rsiValues.length) * chartWidth;
    const yPos = (val) => val !== null ? top + 4 + chartHeight - ((val - rsiMin) / rsiRange) * chartHeight : 0;

    ctx.strokeStyle = C.RSI_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < rsiValues.length; i++) {
      if (rsiValues[i] === null) { started = false; continue; }
      const x = xPos(i);
      const y = yPos(rsiValues[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (extraData && extraData.rsi !== undefined) {
      ctx.fillStyle = C.RSI_COLOR;
      ctx.font = 'bold 10px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RSI ' + extraData.rsi.toFixed(1), padding.left + 4, top + 14);
    }
  },

  drawMACDPane(extraData) {
    const { ctx, width, height, padding, data, mainHeight, volumeHeight, rsiHeight, macdHeight } = this;
    const C = this.COLORS;
    const top = padding.top + mainHeight + volumeHeight + rsiHeight;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = macdHeight - 4;

    ctx.strokeStyle = C.GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, top);
    ctx.lineTo(width - padding.right, top);
    ctx.stroke();

    const closes = data.map(d => d.close);
    const macd = TechnicalEngine.calculateMACD(closes);
    const xPos = (i) => padding.left + (i / macd.macdLine.length) * chartWidth;

    const validValues = [];
    for (let i = 0; i < macd.macdLine.length; i++) {
      if (macd.macdLine[i] !== null) validValues.push(macd.macdLine[i]);
      if (macd.signal[i] !== null) validValues.push(macd.signal[i]);
      if (macd.histogram[i] !== null) validValues.push(Math.abs(macd.histogram[i]));
    }
    const macdMax = Math.max(...validValues) || 1;
    const macdMin = Math.min(...validValues) || -1;
    const macdRange = (macdMax - macdMin) || 1;

    const yPos = (val) => val !== null ? top + 4 + chartHeight / 2 - ((val) / macdRange) * (chartHeight / 2 - 4) : 0;

    const zeroY = top + 4 + chartHeight / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padding.left, zeroY); ctx.lineTo(width - padding.right, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    this.drawLine(macd.histogram.map(v => v !== null ? v : null), C.TEXT_COLOR, xPos, yPos);
    for (let i = 0; i < macd.histogram.length; i++) {
      if (macd.histogram[i] === null) continue;
      const x = xPos(i);
      const val = macd.histogram[i];
      const barWidth = Math.max(1, chartWidth / macd.histogram.length - 1);
      const color = val >= 0 ? C.HISTOGRAM_UP : C.HISTOGRAM_DOWN;
      ctx.fillStyle = color;
      if (val >= 0) {
        ctx.fillRect(x, zeroY - (val / macdRange) * (chartHeight / 2 - 4), barWidth, (val / macdRange) * (chartHeight / 2 - 4));
      } else {
        ctx.fillRect(x, zeroY, barWidth, (-val / macdRange) * (chartHeight / 2 - 4));
      }
    }

    this.drawLine(macd.macdLine, C.MACD_COLOR, xPos, yPos);
    this.drawLine(macd.signal, C.SIGNAL_COLOR, xPos, yPos);

    if (extraData) {
      ctx.fillStyle = C.MACD_COLOR;
      ctx.font = 'bold 10px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MACD', padding.left + 4, top + 14);
    }
  },

  formatPrice(price) {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 10) return price.toFixed(1);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(3);
  },

  clear() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },
};
