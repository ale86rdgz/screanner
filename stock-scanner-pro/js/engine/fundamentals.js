const FundamentalEngine = {
  SECTOR_AVG_PE: {
    'Technology': 28, 'Healthcare': 22, 'Financial': 14,
    'Consumer Discretionary': 25, 'Consumer Staples': 22,
    'Energy': 12, 'Industrials': 20, 'Materials': 18,
    'Real Estate': 35, 'Communication': 20, 'Utilities': 18,
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
  PE_PERCENTILES: [0.5, 0.65, 0.8, 0.95, 1.05, 1.2, 1.5, 2.0, 3.0],

  estimateHistoricalPE(pe) { return pe ? pe * 1.25 : pe * 1.3; },

  calcHistoricalPercentile(currentPE, sector) {
    const sectorAvg = this.SECTOR_AVG_PE[sector] || 20;
    const histPE = this.estimateHistoricalPE(currentPE);
    if (!currentPE || !histPE) return 50;
    const ratio = currentPE / histPE;
    let below = 0;
    for (const p of this.PE_PERCENTILES) {
      if (ratio <= p) below++;
    }
    return Math.round((below / this.PE_PERCENTILES.length) * 100);
  },

  isQualityCompany(data) {
    return (
      (data.returnOnEquity || 0) > 0.12 &&
      ((data.operatingMargins || data.profitMargins || 0)) > 0.08 &&
      (data.freeCashflow || 0) > 0 &&
      (data.debtToEquity === null || data.debtToEquity === undefined || data.debtToEquity < 2) &&
      (data.revenueGrowth === null || data.revenueGrowth > -0.03)
    );
  },

  isExtremeSetup(fund, tech) {
    if (!fund || !tech) return false;
    const quality = this.isQualityCompany(fund);
    const extremeDrop = tech.dropFromHigh >= 40;
    const oversold = tech.rsi <= 35;
    const compressed = fund.pe > 0 && fund.historicalPE > 0 && fund.pe < fund.historicalPE * 0.8;
    return quality && extremeDrop && (oversold || compressed);
  },

  detectDropReason(fund, tech) {
    if (!fund || !tech) return 'Unknown';
    const { revenueGrowth, epsGrowth, freeCashflow, operatingMargins } = fund;
    const { dropFromHigh, rsi, volumeRatio } = tech;

    const revDeclining = revenueGrowth !== null && revenueGrowth < -0.03;
    const epsDeclining = epsGrowth !== null && epsGrowth < -0.05;
    const marginsDeteriorating = operatingMargins !== null && operatingMargins < 0.05;
    const weakCashflow = !freeCashflow || freeCashflow <= 0;
    const fundamentalWeakness = revDeclining || epsDeclining || marginsDeteriorating;
    const highDebt = (fund.debtToEquity || 0) > 3;

    if (dropFromHigh > 30) {
      if (fundamentalWeakness || highDebt) {
        if (revDeclining && epsDeclining) return 'earnings_miss';
        if (highDebt) return 'balance_sheet_concerns';
        return 'fundamental_deterioration';
      }
      if (dropFromHigh > 40 && volumeRatio && volumeRatio > 1.5) return 'capitulation_selloff';
      return 'unjustified_panic';
    }

    if (dropFromHigh > 15) {
      if (rsi <= 30) return 'oversold_momentum';
      if (volumeRatio && volumeRatio < 0.6) return 'low_volume_drift';
      return 'sector_rotation';
    }

    return 'normal_correction';
  },

  analyze(data, sector) {
    const {
      trailingPE, forwardPE, priceToBook,
      revenueGrowth, earningsGrowth,
      returnOnEquity, returnOnAssets, returnOnCapital,
      debtToEquity, freeCashflow,
      grossMargins, operatingMargins, profitMargins,
      marketCap, enterpriseValue, totalRevenue, netIncomeToCommon,
      ebitda, priceToSales, evToEbitda, peg, beta,
    } = data;

    const sectorAvgPE = this.SECTOR_AVG_PE[sector] || 20;
    const sectorAvgDebt = this.SECTOR_AVG_DEBT_EQUITY[sector] || 1.5;
    const sectorAvgMargin = this.SECTOR_AVG_MARGIN[sector] || 15;

    const pe = trailingPE || forwardPE || 20;
    const historicalPE = this.estimateHistoricalPE(pe);
    const peBelowHistorical = pe < historicalPE;
    const peBelowSector = pe < sectorAvgPE;
    const histPercentile = this.calcHistoricalPercentile(pe, sector);
    const isQuality = this.isQualityCompany(data);

    // ===== Señal 20: Valuación relativa =====
    const evEbitdaVal = evToEbitda || (enterpriseValue && ebitda ? enterpriseValue / ebitda : null);
    const psVal = priceToSales;
    const pegVal = peg;
    const fwdPEVal = forwardPE || null;
    const valuationChecks = [];
    if (pe > 0 && historicalPE > 0) valuationChecks.push({ label: `P/E ${pe.toFixed(1)} < histórico ${historicalPE.toFixed(1)}`, met: pe < historicalPE * 0.95 });
    if (pe > 0 && sectorAvgPE > 0) valuationChecks.push({ label: `P/E ${pe.toFixed(1)} < sector ${sectorAvgPE}`, met: pe < sectorAvgPE * 0.95 });
    if (evEbitdaVal > 0) valuationChecks.push({ label: `EV/EBITDA ${evEbitdaVal.toFixed(1)}`, met: evEbitdaVal < 15 });
    if (psVal > 0) valuationChecks.push({ label: `P/S ${psVal.toFixed(1)}`, met: psVal < 3 });
    if (pegVal > 0) valuationChecks.push({ label: `PEG ${pegVal.toFixed(2)}`, met: pegVal < 1.5 });
    if (fwdPEVal > 0) valuationChecks.push({ label: `Fwd P/E ${fwdPEVal.toFixed(1)}`, met: fwdPEVal < historicalPE });
    const valuationMetCount = valuationChecks.filter(c => c.met).length;
    const valuationRelativelyCheap = valuationChecks.length > 0 && (valuationMetCount >= 2 || (pe > 0 && peBelowHistorical && peBelowSector));

    const roe = returnOnEquity || 0;
    const roic = returnOnCapital || returnOnAssets || 0;
    const hasHealthyRentabilidad = roe > 0.15 || roic > 0.12;

    const hasRevenueGrowth = revenueGrowth !== null && revenueGrowth !== undefined;
    const revGrowthVal = hasRevenueGrowth ? revenueGrowth : 0;
    const hasEarningsGrowth = earningsGrowth !== null && earningsGrowth !== undefined;
    const epsGrowthVal = hasEarningsGrowth ? earningsGrowth : 0;
    const epsBeatRevenue = hasEarningsGrowth && hasRevenueGrowth && epsGrowthVal > revGrowthVal && epsGrowthVal > 0;

    const fcf = freeCashflow || 0;
    const hasFCF = fcf > 0;
    const de = debtToEquity !== null && debtToEquity !== undefined ? debtToEquity : 1;
    const hasLowDebt = de < sectorAvgDebt;
    const debtControlled = de < sectorAvgDebt && (fcf > 0 || de < 1.5);
    const margin = (profitMargins || operatingMargins || grossMargins || 0) * 100;
    const hasStrongMargins = margin > sectorAvgMargin;

    return {
      pe: Math.round(pe * 100) / 100,
      historicalPE: Math.round(historicalPE * 100) / 100,
      peBelowHistorical,
      sectorAvgPE,
      peBelowSector,
      histPercentile,
      revenueGrowth: hasRevenueGrowth ? Math.round(revGrowthVal * 100) / 100 : null,
      epsGrowth: hasEarningsGrowth ? Math.round(epsGrowthVal * 100) / 100 : null,
      freeCashflow: Math.round(fcf / 1e9 * 100) / 100,
      roe: Math.round(roe * 100) / 100,
      debtToEquity: Math.round(de * 100) / 100,
      operatingMargin: Math.round(margin * 100) / 100,
      marketCap: marketCap ? Math.round(marketCap / 1e9 * 10) / 10 : null,
      totalRevenue: totalRevenue ? Math.round(totalRevenue / 1e9 * 10) / 10 : null,
      netIncome: netIncomeToCommon ? Math.round(netIncomeToCommon / 1e9 * 10) / 10 : null,
      hasFCF,
      hasLowDebt,
      hasStrongMargins,
      isQuality,
      roe,
      roic: Math.round(roic * 100) / 100,
      hasHealthyRentabilidad,
      epsBeatRevenue,
      debtControlled,
      forwardPE: fwdPEVal ? Math.round(fwdPEVal * 100) / 100 : null,
      evToEbitda: evEbitdaVal ? Math.round(evEbitdaVal * 10) / 10 : null,
      priceToSales: psVal ? Math.round(psVal * 100) / 100 : null,
      peg: pegVal ? Math.round(pegVal * 100) / 100 : null,
      beta: typeof beta === 'number' && !isNaN(beta) ? Math.round(beta * 100) / 100 : null,
      valuationChecks,
      valuationMetCount,
      valuationRelativelyCheap,
      mcPass: marketCap == null || marketCap >= 10e9,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { FundamentalEngine }; }
