const ExplanationEngine = {
  DROP_REASONS: {
    earnings_miss: 'La caída fue provocada por resultados débiles. Los ingresos y ganancias se han deteriorado, lo que explica el descenso del precio.',
    fundamental_deterioration: 'El declive corresponde a fundamentales debilitándose — márgenes decrecientes, deuda creciente o crecimiento lento justifican la valoración más baja.',
    balance_sheet_concerns: 'Los niveles elevados de deuda están generando preocupación. El mercado está descontando un mayor riesgo financiero.',
    capitulation_selloff: 'Parece una venta por capitulación — alto volumen con caída extrema de precio, a menudo señal de pánico más que problemas fundamentales.',
    unjustified_panic: 'La venta masiva parece desproporcionada frente a los fundamentales subyacentes. El negocio sigue siendo sólido pero el sentimiento se ha vuelto excesivamente negativo.',
    oversold_momentum: 'La acción se volvió sobrevendida por momentum. Los fundamentales se mantienen relativamente estables, sugiriendo una posible reversión a la media.',
    low_volume_drift: 'La acción ha caído gradualmente con volumen decreciente, indicando falta de convicción vendedora más que distribución agresiva.',
    sector_rotation: 'El declive parece generalizado en el sector, sugiriendo rotación más que problemas específicos de la empresa.',
    normal_correction: 'Retroceso moderado dentro de un rango de negociación normal. No indica problemas estructurales.',
  },

  generate(ticker, name, fundamental, technical, score, confluence) {
    const reasons = [];
    const concerns = [];

    const f = fundamental || {};
    const t = technical || {};
    const c = confluence || {};
    const s = score || {};

    if (f.pe > 0 && f.peBelowHistorical) {
      const pct = f.histPercentile !== undefined ? ` — más barato que el ${f.histPercentile}% de su rango histórico` : '';
      reasons.push({ type: 'positive', category: 'Valoración', text: `cotiza por debajo del P/E histórico promedio (${f.pe} vs ${f.historicalPE})${pct}` });
    } else if (f.pe > 0) {
      reasons.push({ type: 'neutral', category: 'Valoración', text: `P/E de ${f.pe} está cerca del promedio histórico de ${f.historicalPE}` });
    }

    if (f.pe > 0 && f.peBelowSector) {
      reasons.push({ type: 'positive', category: 'Valoración', text: `infravalorado frente a pares del sector (${f.pe} vs ${f.sectorAvgPE} prom. sector)` });
    }

    if (f.isQuality) {
      reasons.push({ type: 'positive', category: 'Calidad', text: `negocio de alta calidad — ROIC sólido${f.hasLowDebt ? ', balance saludable' : ''}${f.hasStrongMargins ? ', márgenes en expansión' : ''}${f.hasFCF ? ', FCF positivo' : ''}` });
    }

    if (f.roe > 0.2) {
      reasons.push({ type: 'positive', category: 'Calidad', text: `ROIC alto de ${(f.roe * 100).toFixed(1)}% — negocio eficiente en capital` });
    } else if (f.roe > 0.1) {
      reasons.push({ type: 'neutral', category: 'Calidad', text: `ROIC de ${(f.roe * 100).toFixed(1)}% es aceptable` });
    }

    if (f.revenueGrowth !== null && f.revenueGrowth > 0.08) {
      reasons.push({ type: 'positive', category: 'Crecimiento', text: `ingresos creciendo ${(f.revenueGrowth * 100).toFixed(1)}% — momentum de ventas superior al promedio` });
    } else if (f.revenueGrowth !== null && f.revenueGrowth > 0) {
      reasons.push({ type: 'neutral', category: 'Crecimiento', text: `crecimiento moderado de ingresos del ${(f.revenueGrowth * 100).toFixed(1)}%` });
    } else if (f.revenueGrowth !== null && f.revenueGrowth < 0) {
      concerns.push(`ingresos en declive ${(f.revenueGrowth * 100).toFixed(1)}% — monitorear trayectoria de ventas`);
    }

    if (f.epsGrowth !== null && f.epsGrowth > 0.1) {
      reasons.push({ type: 'positive', category: 'Crecimiento', text: `BPA creciendo ${(f.epsGrowth * 100).toFixed(1)}% — el momentum de ganancias respalda la valoración` });
    } else if (f.epsGrowth !== null && f.epsGrowth < 0) {
      concerns.push(`ganancias en declive ${(f.epsGrowth * 100).toFixed(1)}% — verificar presión en márgenes`);
    }

    if (f.hasFCF && f.freeCashflow > 0) {
      reasons.push({ type: 'positive', category: 'Calidad', text: `genera $${f.freeCashflow}B en flujo de caja libre — fuerte generación de efectivo` });
    } else {
      concerns.push(`flujo de caja libre negativo o mínimo`);
    }

    if (t.dropFromHigh > 30) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `bajó ${t.dropFromHigh.toFixed(1)}% desde su máximo de 52 semanas — posible punto de entrada valor` });
    } else if (t.dropFromHigh > 15) {
      reasons.push({ type: 'neutral', category: 'Técnico', text: `cotiza ${t.dropFromHigh.toFixed(1)}% por debajo del máximo de 52 semanas` });
    }

    if (t.rsi <= 35) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `RSI en ${t.rsi} — condiciones de sobreventa históricamente asociadas con reversiones` });
    } else if (t.rsi <= 45) {
      reasons.push({ type: 'neutral', category: 'Técnico', text: `RSI en ${t.rsi} — acercándose a territorio de sobreventa` });
    } else if (t.rsi > 70) {
      concerns.push(`RSI en ${t.rsi} — condiciones de sobrecompra`);
    }

    if (t.distanceFromSMA200 < -10 && t.distanceFromSMA200 > -30) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `muy por debajo de la MA200 (${t.distanceFromSMA200.toFixed(1)}%) — territorio de valor profundo` });
    }

    if (t.isMACDGoldenCross) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `MACD acaba de cruzar sobre la línea de señal — posible cambio de tendencia` });
    } else if (t.isMACDBullish && t.macdImproving) {
      reasons.push({ type: 'neutral', category: 'Técnico', text: `MACD mejorando y sobre la línea de señal — momentum cambiando` });
    }

    if (t.nearestSupport && t.distanceToSupport !== null && t.distanceToSupport < 8) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `cotizando cerca del soporte en $${t.nearestSupport} — piso técnico identificado` });
    }

    if (t.belowLowerBB) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `precio por debajo de la Banda Inferior de Bollinger — estadísticamente sobrevendido` });
    }

    if (t.stUpDays > t.stDownDays && t.stUpDays + t.stDownDays > 5) {
      reasons.push({ type: 'positive', category: 'Técnico', text: `recuperación a corto plazo en marcha (${t.stUpDays} subidas vs ${t.stDownDays} bajadas)` });
    }

    if (f.isQuality && f.valuationRelativelyCheap && t.dropFromHigh > 30) {
      reasons.unshift({ type: 'positive', category: 'Tesis', text: `CALIDAD EN VENTA — negocio sólido cotizando a niveles de agitación. Históricamente una configuración poderosa.` });
    }

    if (t.dropFromHigh > 40 && f.isQuality) {
      reasons.unshift({ type: 'positive', category: 'Tesis', text: `OPORTUNIDAD EXTREMA — bajó ${t.dropFromHigh.toFixed(0)}% desde máximos mientras los fundamentales se mantienen sólidos. Configuraciones similares precedieron grandes recuperaciones.` });
    }

    const finalReasons = reasons.filter(r => r.type !== 'negative').slice(0, 10);
    const finalConcerns = concerns.slice(0, 4);

    return {
      summary: `${name} (${ticker}) — ${s.label || 'Mixto'}. Puntaje de Confluencia: ${s.overall}/100.`,
      dropReason: this.DROP_REASONS[FundamentalEngine.detectDropReason(f, t)] || '',
      reasons: finalReasons,
      concerns: finalConcerns,
      grade: s.grade,
      label: s.label,
    };
  },

  formatExplanation(exp) {
    let html = '';
    html += `<div style="margin-bottom:10px;font-size:0.9rem;color:var(--text-secondary);line-height:1.5">${exp.summary}</div>`;

    if (exp.dropReason) {
      html += `<div style="margin-bottom:12px;padding:10px 12px;background:rgba(255,171,0,0.08);border-left:2px solid var(--accent-yellow);border-radius:4px;font-size:0.82rem;color:var(--text-secondary);line-height:1.5">${exp.dropReason}</div>`;
    }

    if (exp.reasons.length > 0) {
      html += `<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent-green);margin-bottom:6px">Factores Alcistas</div>`;
      for (const r of exp.reasons) {
        html += `<div class="reason-item"><span class="reason-bullet">&#9679;</span><span>${r.text}</span></div>`;
      }
    }

    if (exp.concerns.length > 0) {
      html += `<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent-red);margin:12px 0 6px">Factores de Riesgo</div>`;
      for (const r of exp.concerns) {
        html += `<div class="reason-item"><span style="color:var(--accent-red);flex-shrink:0">&#9679;</span><span>${r.text}</span></div>`;
      }
    }

    return html;
  },
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { ExplanationEngine }; }
