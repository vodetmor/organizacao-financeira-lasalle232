/**
 * Caixa 232 — Cálculos puros
 *
 * Sem SpreadsheetApp aqui. Entra dado, sai número.
 * Semântica: meta mede SALDO (S = A − G).
 */

function calcularResumo(lancamentos, meta) {
  let arrecadado = 0;
  let gasto = 0;
  for (let i = 0; i < lancamentos.length; i++) {
    const l = lancamentos[i];
    if (l.tipo === 'Entrada') arrecadado += l.valor;
    else if (l.tipo === 'Saida') gasto += l.valor;
  }
  const saldo = arrecadado - gasto;
  const m = Number(meta) || 0;
  const falta = Math.max(0, m - saldo);
  const percentual = m > 0 ? (saldo / m) * 100 : 0;
  return {
    arrecadado: _r2(arrecadado),
    gasto:      _r2(gasto),
    saldo:      _r2(saldo),
    falta:      _r2(falta),
    percentual: _r2(percentual),
    meta:       _r2(m)
  };
}

function agruparPorCategoria(lancamentos, tipo) {
  const mapa = {};
  let total = 0;
  for (let i = 0; i < lancamentos.length; i++) {
    const l = lancamentos[i];
    if (l.tipo !== tipo) continue;
    mapa[l.categoria] = (mapa[l.categoria] || 0) + l.valor;
    total += l.valor;
  }
  const out = [];
  for (const cat in mapa) {
    out.push({
      categoria: cat,
      total: _r2(mapa[cat]),
      percentual: total > 0 ? _r2((mapa[cat] / total) * 100) : 0
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

/**
 * Cruza o orçamento com os lançamentos reais por categoria.
 * Para cada item do orçamento, calcula:
 *   - planejado (vem do orçamento)
 *   - pago     = soma de Saidas dessa categoria que ainda "couberam"
 *                (rateio simples: distribuímos os pagos da categoria entre os
 *                 itens dessa categoria proporcionalmente ao planejado)
 *   - restante = max(0, planejado − pago)
 *   - progresso = (pago / planejado) * 100
 *
 * Quando uma categoria tem só 1 item, o rateio é trivial.
 * Quando uma categoria tem N itens, o rateio é proporcional.
 */
function cruzarOrcamentoComLancamentos(orcamento, lancamentos) {
  // 1. soma de Saidas por categoria
  const gastoPorCat = {};
  for (let i = 0; i < lancamentos.length; i++) {
    const l = lancamentos[i];
    if (l.tipo !== 'Saida') continue;
    gastoPorCat[l.categoria] = (gastoPorCat[l.categoria] || 0) + l.valor;
  }

  // 2. soma de planejado por categoria (pra rateio proporcional)
  const planejadoPorCat = {};
  for (let i = 0; i < orcamento.length; i++) {
    const o = orcamento[i];
    planejadoPorCat[o.categoria] = (planejadoPorCat[o.categoria] || 0) + o.planejado;
  }

  // 3. monta resultado item a item
  const out = [];
  let totalPlanejado = 0;
  let totalPago = 0;
  for (let i = 0; i < orcamento.length; i++) {
    const o = orcamento[i];
    const totalGastoCat = gastoPorCat[o.categoria] || 0;
    const totalPlanCat  = planejadoPorCat[o.categoria] || 0;
    const proporcao = totalPlanCat > 0 ? (o.planejado / totalPlanCat) : 0;
    const pago = _r2(totalGastoCat * proporcao);
    const restante = _r2(Math.max(0, o.planejado - pago));
    const progresso = o.planejado > 0 ? _r2(Math.min(100, (pago / o.planejado) * 100)) : 0;

    totalPlanejado += o.planejado;
    totalPago += pago;

    out.push({
      linha: o.linha,
      item: o.item,
      categoria: o.categoria,
      observacao: o.observacao,
      planejado: _r2(o.planejado),
      pago: pago,
      restante: restante,
      progresso: progresso
    });
  }

  out.sort((a, b) => b.planejado - a.planejado);

  return {
    itens: out,
    totalPlanejado: _r2(totalPlanejado),
    totalPago: _r2(totalPago),
    totalRestante: _r2(Math.max(0, totalPlanejado - totalPago)),
    progressoMedio: totalPlanejado > 0 ? _r2(Math.min(100, (totalPago / totalPlanejado) * 100)) : 0
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }
