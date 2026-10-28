const FundamentalScanner = {

  SECTOR_AVG_PE: {
    'Technology': 28, 'Healthcare': 22, 'Financial': 14,
    'Consumer Discretionary': 25, 'Consumer Staples': 22,
    'Energy': 12, 'Industrials': 20, 'Materials': 18,
    'Real Estate': 35, 'Communication': 20, 'Utilities': 18,
  },
  SECTOR_AVG_PB: {
    'Technology': 8, 'Healthcare': 5, 'Financial': 1.8,
    'Consumer Discretionary': 6, 'Consumer Staples': 6,
    'Energy': 1.5, 'Industrials': 4, 'Materials': 3,
    'Real Estate': 2.5, 'Communication': 4, 'Utilities': 2,
  },
  SECTOR_AVG_ROE: {
    'Technology': 0.25, 'Healthcare': 0.18, 'Financial': 0.15,
    'Consumer Discretionary': 0.20, 'Consumer Staples': 0.22,
    'Energy': 0.12, 'Industrials': 0.15, 'Materials': 0.12,
    'Real Estate': 0.08, 'Communication': 0.14, 'Utilities': 0.10,
  },
  SECTOR_AVG_DEBT_EQUITY: {
    'Technology': 0.8, 'Healthcare': 1.2, 'Financial': 3.0,
    'Consumer Discretionary': 1.5, 'Consumer Staples': 1.5,
    'Energy': 1.0, 'Industrials': 1.2, 'Materials': 1.0,
    'Real Estate': 4.0, 'Communication': 1.8, 'Utilities': 1.8,
  },
  SECTOR_AVG_MARGIN: {
    'Technology': 25, 'Healthcare': 18, 'Financial': 30,
    'Consumer Discretionary': 10, 'Consumer Staples': 15,
    'Energy': 12, 'Industrials': 12, 'Materials': 12,
    'Real Estate': 25, 'Communication': 15, 'Utilities': 15,
  },
  SECTOR_AVG_REV_GROWTH: {
    'Technology': 0.12, 'Healthcare': 0.08, 'Financial': 0.06,
    'Consumer Discretionary': 0.07, 'Consumer Staples': 0.05,
    'Energy': 0.05, 'Industrials': 0.06, 'Materials': 0.04,
    'Real Estate': 0.06, 'Communication': 0.07, 'Utilities': 0.04,
  },

  PE_PERCENTILE_BUCKETS: [0.5, 0.7, 0.85, 0.95, 1.05, 1.2, 1.5, 2.0, 3.0],

  estimateHistoricalPE(currentPE, sector) {
    const sectorAvg = this.SECTOR_AVG_PE[sector] || 20;
    const growthFactor = sectorAvg > 0 ? currentPE / sectorAvg : 1;
    return currentPE * (1.2 + (growthFactor - 1) * 0.3);
  },

  calcPEHistoricalPercentile(currentPE, sector) {
    const histPE = this.estimateHistoricalPE(currentPE, sector);
    if (!currentPE || !histPE || histPE <= 0) return 50;
    const ratio = currentPE / histPE;
    let below = 0;
    for (const p of this.PE_PERCENTILE_BUCKETS) {
      if (ratio <= p) below++;
    }
    return Math.round((below / this.PE_PERCENTILE_BUCKETS.length) * 100);
  },

  calcPESectorPercentile(pe, sector) {
    const sectorPE = this.SECTOR_AVG_PE[sector] || 20;
    if (!pe || pe <= 0) return 50;
    const ratio = pe / sectorPE;
    let below = 0;
    for (const p of this.PE_PERCENTILE_BUCKETS) {
      if (ratio <= p) below++;
    }
    return Math.round((below / this.PE_PERCENTILE_BUCKETS.length) * 100);
  },

  calcPEG(pe, epsGrowth) {
    if (!pe || pe <= 0 || epsGrowth == null || epsGrowth <= 0) return null;
    return pe / (epsGrowth * 100);
  },

  calcFCFYield(fcf, marketCap) {
    if (!fcf || !marketCap || marketCap <= 0) return null;
    return fcf / marketCap;
  },

  calcEVToEBITDA(ev, ebitda) {
    if (!ev || !ebitda || ebitda <= 0) return null;
    return ev / ebitda;
  },

  calcPtoS(marketCap, revenue) {
    if (!marketCap || !revenue || revenue <= 0) return null;
    return marketCap / revenue;
  },

  analyzeStock(data, sector) {
    const {
      trailingPE, forwardPE, priceToBook,
      revenueGrowth, earningsGrowth, epsGrowth,
      returnOnEquity, returnOnAssets, returnOnCapital,
      debtToEquity, freeCashflow,
      grossMargins, operatingMargins, profitMargins,
      marketCap, enterpriseValue, totalRevenue, netIncomeToCommon,
      ebitda, priceToSales, evToEbitda, peg,
      operatingCashflow, currentRatio, quickRatio, totalDebt,
      dividendYield, beta, sharesOutstanding,
    } = data;

    const pe = trailingPE || forwardPE || 0;
    const peForward = forwardPE || pe;
    const sectorPE = this.SECTOR_AVG_PE[sector] || 20;
    const sectorPB = this.SECTOR_AVG_PB[sector] || 5;
    const sectorROE = this.SECTOR_AVG_ROE[sector] || 0.15;
    const sectorDebtEquity = this.SECTOR_AVG_DEBT_EQUITY[sector] || 1.5;
    const sectorMargin = this.SECTOR_AVG_MARGIN[sector] || 15;
    const sectorRevGrowth = this.SECTOR_AVG_REV_GROWTH[sector] || 0.07;

    const histPE = this.estimateHistoricalPE(pe, sector);
    const histPEPercentile = this.calcPEHistoricalPercentile(pe, sector);
    const sectorPEPercentile = this.calcPESectorPercentile(pe, sector);
    const pegValue = this.calcPEG(pe, earningsGrowth);
    const fcfYield = this.calcFCFYield(freeCashflow, marketCap);
    const evEbitda = this.calcEVToEBITDA(enterpriseValue, ebitda);
    const pToS = this.calcPtoS(marketCap, totalRevenue);

    const currentRatioVal = currentRatio || 0;
    const quickRatioVal = quickRatio || 0;
    const de = debtToEquity != null && debtToEquity !== undefined ? debtToEquity : 0;
    const margin = profitMargins != null ? profitMargins : (operatingMargins != null ? operatingMargins : (grossMargins != null ? grossMargins : 0));
    const marginVal = margin * 100;
    const roeVal = returnOnEquity || 0;
    const roaVal = returnOnAssets || 0;
    const roicVal = returnOnCapital || roeVal;
    const revGrowthVal = revenueGrowth || 0;
    const epsGrowthVal = epsGrowth != null ? epsGrowth : (earningsGrowth || 0);
    const fcfVal = freeCashflow || 0;
    const divYield = dividendYield || 0;

    return {
      pe: pe > 0 ? Math.round(pe * 100) / 100 : null,
      peForward: peForward > 0 ? Math.round(peForward * 100) / 100 : null,
      historicalPE: histPE > 0 ? Math.round(histPE * 100) / 100 : null,
      histPEPercentile,
      sectorPEPercentile,
      peBelowSector: pe > 0 && pe < sectorPE,
      peBelowHistorical: pe > 0 && pe < histPE,
      peVsSectorRatio: pe > 0 ? Math.round((pe / sectorPE) * 1000) / 1000 : null,
      peVsHistRatio: pe > 0 ? Math.round((pe / histPE) * 1000) / 1000 : null,
      peg: pegValue != null ? Math.round(pegValue * 100) / 100 : null,
      priceToBook: priceToBook != null ? Math.round(priceToBook * 100) / 100 : null,
      pbVsSectorRatio: priceToBook != null && sectorPB > 0 ? Math.round((priceToBook / sectorPB) * 1000) / 1000 : null,
      fcfYield,
      evEbitda,
      pToS,
      revenueGrowth: revGrowthVal,
      earningsGrowth: epsGrowthVal,
      roe: roeVal,
      roa: roaVal,
      roic: roicVal,
      debtToEquity: Math.round(de * 100) / 100,
      operatingMargin: Math.round(marginVal * 100) / 100,
      grossMargin: grossMargins != null ? Math.round(grossMargins * 100) / 100 : null,
      profitMargin: profitMargins != null ? Math.round(profitMargins * 100) / 100 : null,
      marketCap: marketCap != null ? Math.round(marketCap / 1e9 * 10) / 10 : null,
      enterpriseValue: enterpriseValue != null ? Math.round(enterpriseValue / 1e9 * 10) / 10 : null,
      totalRevenue: totalRevenue != null ? Math.round(totalRevenue / 1e9 * 10) / 10 : null,
      netIncome: netIncomeToCommon != null ? Math.round(netIncomeToCommon / 1e9 * 10) / 10 : null,
      fcf: fcfVal != null ? Math.round(fcfVal / 1e9 * 10) / 10 : null,
      dividendYield: divYield * 100,
      currentRatio: currentRatioVal,
      quickRatio: quickRatioVal,
      beta: beta || null,
      sharesOutstanding: sharesOutstanding != null ? Math.round(sharesOutstanding / 1e9 * 10) / 10 : null,
      sector,
      sectorPE,
      sectorROE,
      sectorDebtEquity,
      sectorMargin,
      sectorRevGrowth,
      hasStrongROE: roeVal > sectorROE,
      hasLowDebt: de < sectorDebtEquity,
      hasStrongMargins: marginVal > sectorMargin,
      hasGrowth: revGrowthVal > sectorRevGrowth,
      hasFCF: fcfVal > 0,
      hasDividend: divYield > 0.02,
    };
  },

  calcFundamentalScore(fund) {
    if (!fund) return 0;
    let score = 0;

    // P/E vs sector (max 25 points)
    if (fund.pe > 0 && fund.sectorPE > 0) {
      const peRatio = fund.pe / fund.sectorPE;
      if (peRatio < 0.6) score += 25;
      else if (peRatio < 0.8) score += 22;
      else if (peRatio < 0.95) score += 18;
      else if (peRatio < 1.05) score += 10;
      else if (peRatio < 1.3) score += 5;
    } else { score += 8; }

    // P/E vs historical (max 25 points)
    if (fund.pe > 0 && fund.historicalPE > 0) {
      const histRatio = fund.pe / fund.historicalPE;
      if (histRatio < 0.6) score += 25;
      else if (histRatio < 0.8) score += 22;
      else if (histRatio < 0.95) score += 18;
      else if (histRatio < 1.05) score += 10;
      else if (histRatio < 1.2) score += 5;
    } else { score += 8; }

    // PEG ratio (max 15 points)
    if (fund.peg != null && fund.peg > 0) {
      if (fund.peg < 1) score += 15;
      else if (fund.peg < 1.5) score += 12;
      else if (fund.peg < 2) score += 8;
      else if (fund.peg < 3) score += 4;
    } else { score += 8; }

    // ROE vs sector (max 15 points)
    if (fund.roe > 0) {
      if (fund.roe > fund.sectorROE * 1.5) score += 15;
      else if (fund.roe > fund.sectorROE * 1.2) score += 12;
      else if (fund.roe > fund.sectorROE) score += 8;
      else if (fund.roe > fund.sectorROE * 0.6) score += 4;
    } else { score += 3; }

    // Margins vs sector (max 10 points)
    if (fund.operatingMargin > 0) {
      if (fund.operatingMargin > fund.sectorMargin * 1.5) score += 10;
      else if (fund.operatingMargin > fund.sectorMargin) score += 7;
      else if (fund.operatingMargin > fund.sectorMargin * 0.7) score += 4;
    } else { score += 2; }

    // Growth vs sector (max 10 points)
    if (fund.revenueGrowth != null) {
      if (fund.revenueGrowth > fund.sectorRevGrowth * 2) score += 10;
      else if (fund.revenueGrowth > fund.sectorRevGrowth) score += 7;
      else if (fund.revenueGrowth > fund.sectorRevGrowth * 0.5) score += 4;
    } else { score += 3; }

    // FCF yield (max 5 points)
    if (fund.fcfYield != null && fund.fcfYield > 0) {
      if (fund.fcfYield > 0.06) score += 5;
      else if (fund.fcfYield > 0.04) score += 4;
      else if (fund.fcfYield > 0.02) score += 3;
      else if (fund.fcfYield > 0) score += 1;
    } else { score += 1; }

    // Debt (max 5 points)
    if (fund.debtToEquity != null && fund.debtToEquity >= 0) {
      if (fund.debtToEquity < fund.sectorDebtEquity * 0.5) score += 5;
      else if (fund.debtToEquity < fund.sectorDebtEquity) score += 4;
      else if (fund.debtToEquity < fund.sectorDebtEquity * 1.5) score += 2;
    }

    return Math.min(score, 100);
  },

  calcOverallQualityScore(fund) {
    if (!fund) return 0;
    let score = 0;

    const roe = fund.roe || 0;
    if (roe > 0.3) score += 25;
    else if (roe > 0.2) score += 20;
    else if (roe > 0.15) score += 15;
    else if (roe > 0.1) score += 10;
    else if (roe > 0.05) score += 5;

    const margin = fund.operatingMargin || 0;
    if (margin > 30) score += 20;
    else if (margin > 20) score += 16;
    else if (margin > 12) score += 10;
    else if (margin > 5) score += 5;

    const revenueOk = fund.revenueGrowth != null && fund.revenueGrowth > 0;
    const epsOk = fund.earningsGrowth != null && fund.earningsGrowth > 0;
    const fcfOk = fund.fcf > 0;
    if (revenueOk && epsOk && fcfOk) score += 20;
    else if (revenueOk && epsOk) score += 14;
    else if (revenueOk || epsOk) score += 8;

    const de = fund.debtToEquity || 1;
    if (de < 0.3) score += 15;
    else if (de < 0.5) score += 12;
    else if (de < 1) score += 8;
    else if (de < 2) score += 4;

    if (fund.fcfYield != null && fund.fcfYield > 0.05) score += 10;
    else if (fund.fcfYield != null && fund.fcfYield > 0.03) score += 6;

    if (fund.hasDividend) score += 10;

    if (fund.histPEPercentile < 30 && fund.pe > 0) score += 10;
    else if (fund.histPEPercentile < 50 && fund.pe > 0) score += 5;

    return Math.min(score, 100);
  },

  compareToSector(fund) {
    if (!fund) return {};
    return {
      peComparison: fund.peVsSectorRatio != null ? {
        stockPE: fund.pe,
        sectorPE: fund.sectorPE,
        ratio: fund.peVsSectorRatio,
        percent: fund.peVsSectorRatio < 1 ? ((1 - fund.peVsSectorRatio) * 100).toFixed(1) + '% below sector' : ((fund.peVsSectorRatio - 1) * 100).toFixed(1) + '% above sector',
        percentile: fund.sectorPEPercentile,
      } : null,
      peHistComparison: fund.peVsHistRatio != null ? {
        stockPE: fund.pe,
        historicalPE: fund.historicalPE,
        ratio: fund.peVsHistRatio,
        percent: fund.peVsHistRatio < 1 ? ((1 - fund.peVsHistRatio) * 100).toFixed(1) + '% below historical' : ((fund.peVsHistRatio - 1) * 100).toFixed(1) + '% above historical',
        percentile: fund.histPEPercentile,
      } : null,
      roeComparison: fund.roe > 0 ? {
        stockROE: fund.roe,
        sectorROE: fund.sectorROE,
        outperforming: fund.roe > fund.sectorROE,
        diff: ((fund.roe - fund.sectorROE) * 100).toFixed(1) + 'pp',
      } : null,
      marginComparison: fund.operatingMargin > 0 ? {
        stockMargin: fund.operatingMargin,
        sectorMargin: fund.sectorMargin,
        outperforming: fund.operatingMargin > fund.sectorMargin,
        diff: (fund.operatingMargin - fund.sectorMargin).toFixed(1) + 'pp',
      } : null,
      growthComparison: fund.revenueGrowth != null ? {
        stockGrowth: fund.revenueGrowth,
        sectorGrowth: fund.sectorRevGrowth,
        outperforming: fund.revenueGrowth > fund.sectorRevGrowth,
        diff: ((fund.revenueGrowth - fund.sectorRevGrowth) * 100).toFixed(1) + 'pp',
      } : null,
      debtComparison: fund.debtToEquity != null ? {
        stockDebt: fund.debtToEquity,
        sectorDebt: fund.sectorDebtEquity,
        lowerThanSector: fund.debtToEquity < fund.sectorDebtEquity,
      } : null,
      pbComparison: fund.priceToBook != null && fund.pbVsSectorRatio != null ? {
        stockPB: fund.priceToBook,
        sectorPB: fund.sectorPB,
        ratio: fund.pbVsSectorRatio,
      } : null,
    };
  },

  buildFundamentalTableData(results) {
    return results.map(r => {
      const f = r.fundamental;
      if (!f || f.error) return null;
      const fundData = this.analyzeStock(r.fundamentalData || r.fundamental, r.stock.sector);
      const score = this.calcFundamentalScore(fundData);
      const qualityScore = this.calcOverallQualityScore(fundData);
      const comparisons = this.compareToSector(fundData);
      return {
        stock: r.stock,
        price: r.price,
        change: r.change,
        fundamental: fundData,
        fundamentalScore: score,
        qualityScore,
        comparisons,
      };
    }).filter(Boolean).sort((a, b) => b.fundamentalScore - a.fundamentalScore);
  },

  getSectorSummary(results) {
    const sectors = {};
    for (const r of results) {
      if (!r || !r.stock || r.error) continue;
      const sector = r.stock.sector;
      if (!sectors[sector]) {
        sectors[sector] = { stocks: [], pes: [], roes: [], margins: [], debtEquities: [], revGrowths: [] };
      }
      const f = r.fundamental;
      if (!f || f.error) continue;
      const pe = f.trailingPE || f.forwardPE || 0;
      sectors[sector].stocks.push(r.stock.ticker);
      if (pe > 0) sectors[sector].pes.push(pe);
      if (f.returnOnEquity != null) sectors[sector].roes.push(f.returnOnEquity);
      if (f.operatingMargins != null) sectors[sector].margins.push(f.operatingMargins * 100);
      if (f.debtToEquity != null && f.debtToEquity >= 0) sectors[sector].debtEquities.push(f.debtToEquity);
      if (f.revenueGrowth != null) sectors[sector].revGrowths.push(f.revenueGrowth);
    }

    const summary = {};
    for (const [sector, data] of Object.entries(sectors)) {
      const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      summary[sector] = {
        count: data.stocks.length,
        avgPE: avg(data.pes) != null ? Math.round(avg(data.pes) * 100) / 100 : null,
        avgROE: avg(data.roes) != null ? Math.round(avg(data.roes) * 100, 1) : null,
        avgMargin: avg(data.margins) != null ? Math.round(avg(data.margins) * 10) / 10 : null,
        avgDebtEquity: avg(data.debtEquities) != null ? Math.round(avg(data.debtEquities) * 100) / 100 : null,
        avgRevGrowth: avg(data.revGrowths) != null ? Math.round(avg(data.revGrowths) * 100, 1) : null,
        stocks: data.stocks.sort(),
      };
    }
    return summary;
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { FundamentalScanner }; }
