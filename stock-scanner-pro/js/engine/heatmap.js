const HeatmapEngine = {
  CANVAS_SIZE: { w: 1200, h: 700 },
  MIN_CELL_W: 18,
  MIN_CELL_H: 10,
  SECTOR_ORDER: ['Technology', 'Healthcare', 'Financial', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Industrials', 'Materials', 'Real Estate', 'Communication', 'Utilities'],

  buildMatrix(stocks) {
    const grouped = {};
    for (const s of stocks) {
      const sec = (s.stock && s.stock.sector) || s.sector || 'Other';
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push(s);
    }
    const cells = [];
    for (const sec of this.SECTOR_ORDER) {
      if (!grouped[sec]) continue;
      const total = grouped[sec].length;
      const cols = Math.ceil(Math.sqrt(total * 1.5));
      const rows = Math.ceil(total / cols);
      const avgScore = grouped[sec].reduce((a, b) => a + ((b.combined && b.combined.overall) || (b.score && b.score.overall) || 0), 0) / total;
      let row = [], ri = 0, ci = 0;
      const secStocks = grouped[sec].sort((a, b) => {
        const sa = (a.combined && a.combined.overall) || (a.score && a.score.overall) || 0;
        const sb = (b.combined && b.combined.overall) || (b.score && b.score.overall) || 0;
        return sb - sa;
      });
      for (let i = 0; i < total; i++) {
        if (ci >= cols) { ci = 0; ri++; }
        if (!row[ri]) row[ri] = [];
        row[ri].push(secStocks[i]);
        ci++;
      }
      cells.push({ sector: sec, row, cols, rows, avgScore, count: total, stocks: secStocks });
    }
    return cells;
  },

  getColor(value) {
    const v = Math.min(100, Math.max(0, value || 0));
    if (v >= 80) return '#1b6e3d';
    if (v >= 70) return '#2a8c4a';
    if (v >= 60) return '#3ca55c';
    if (v >= 50) return '#5cb85c';
    if (v >= 40) return '#8db600';
    if (v >= 30) return '#c4a400';
    if (v >= 25) return '#d49400';
    if (v >= 20) return '#e07b00';
    if (v >= 15) return '#d4462a';
    return '#9a1f1f';
  },

  draw(canvas, matrix, onClick) {
    try {
      const ctx = canvas.getContext('2d');
      const parent = canvas.parentElement;
      const parentW = parent ? parent.clientWidth : 900;
      const S = { ...this.CANVAS_SIZE, w: Math.max(600, Math.min(1200, parentW - 4)) };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = S.w * dpr;
      canvas.height = S.h * dpr;
      canvas.style.width = S.w + 'px';
      canvas.style.height = S.h + 'px';
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, S.w, S.h);

      const pad = { t: 30, r: 24, b: 30, l: 24 };
      const gap = 8;
      const secGap = 14;
      const usableW = S.w - pad.l - pad.r;
      const usableH = S.h - pad.t - pad.b;
      let y = pad.t;

      canvas._cells = [];

      for (const sec of matrix) {
        if (!sec.row || !sec.row.length) continue;
        const rows = sec.row.length;
        const cols = sec.row[0].length;

      const cellW = Math.max(this.MIN_CELL_W, Math.min(80, (usableW - secGap) / cols - gap));
      const cellH = Math.max(this.MIN_CELL_H, Math.min(44, (usableH / matrix.length / rows) - gap));
      if (cellW < this.MIN_CELL_W || cellH < this.MIN_CELL_H) continue;

        let maxCellX = 0;
        const startY = y;
        for (let ri = 0; ri < rows; ri++) {
          const cells = sec.row[ri];
          const rowW = cells.length * (cellW + gap) - gap;
          let x = pad.l + (usableW - rowW) / 2;
          for (const st of cells) {
            const score = (st.combined && st.combined.overall) || (st.score && st.score.overall) || 0;
            const color = this.getColor(score);
            const ticker = (st.stock && st.stock.ticker) || st.ticker || '?';
            const sectorName = (st.stock && st.stock.sector) || st.sector || sec.sector;

            const rx = Math.round(x);
            const ry = Math.round(y);
            const rw = Math.round(cellW);
            const rh = Math.round(cellH);
            this._roundRect(ctx, rx, ry, rw, rh, 3, color);

            ctx.fillStyle = '#e6edf3';
            ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ticker, rx + rw / 2, ry + rh / 2 - 3);
            ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = 'rgba(230,237,243,0.7)';
            ctx.fillText(score + '', rx + rw / 2, ry + rh / 2 + 9);

            canvas._cells.push({ ticker, x: rx, y: ry, w: rw, h: rh, sector: sectorName });
            x += cellW + gap;
          }
          y += cellH + gap;
        }
        y += secGap - gap + 12;

        ctx.fillStyle = '#8b949e';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${sec.sector} (${sec.count})`, pad.l, startY - 14);

        if (y - startY > maxCellX) maxCellX = y - startY;
      }

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const c of canvas._cells) {
          if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
            onClick?.(c.ticker, c.sector);
            return;
          }
        }
      };
    } catch (err) {
      console.error('[Heatmap] Error drawing:', err);
    }
  },

  _roundRect(ctx, x, y, w, h, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else {
      r = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    }
  },
};
