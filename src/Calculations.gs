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

    const statusInfo = _statusTemporal(progresso, o.prazo);
    out.push({
      linha: o.linha,
      item: o.item,
      categoria: o.categoria,
      observacao: o.observacao,
      prazo: o.prazo || '',
      planejado: _r2(o.planejado),
      pago: pago,
      restante: restante,
      progresso: progresso,
      diasRestantes: statusInfo.diasRestantes,
      status: statusInfo.status   // 'quitado' | 'no-prazo' | 'apertando' | 'atrasado' | 'sem-prazo'
    });
  }

  // Ordem: atrasados primeiro, depois por prazo crescente; quitados no fim
  const ordemStatus = { 'atrasado': 0, 'apertando': 1, 'no-prazo': 2, 'sem-prazo': 3, 'quitado': 4 };
  out.sort((a, b) => {
    const so = (ordemStatus[a.status] || 9) - (ordemStatus[b.status] || 9);
    if (so !== 0) return so;
    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
    return b.planejado - a.planejado;
  });

  return {
    itens: out,
    totalPlanejado: _r2(totalPlanejado),
    totalPago: _r2(totalPago),
    totalRestante: _r2(Math.max(0, totalPlanejado - totalPago)),
    progressoMedio: totalPlanejado > 0 ? _r2(Math.min(100, (totalPago / totalPlanejado) * 100)) : 0
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }

/**
 * Status temporal de um item:
 *   quitado    — já está 100% pago
 *   atrasado   — prazo passou e ainda falta valor
 *   apertando  — falta valor e prazo é ≤ 30 dias
 *   no-prazo   — falta valor e prazo é > 30 dias
 *   sem-prazo  — falta valor mas sem prazo cadastrado
 */
function _statusTemporal(progresso, prazoStr) {
  if (progresso >= 100) return { status: 'quitado', diasRestantes: null };
  if (!prazoStr) return { status: 'sem-prazo', diasRestantes: null };
  const dias = _diasAte(prazoStr);
  if (dias === null) return { status: 'sem-prazo', diasRestantes: null };
  if (dias < 0) return { status: 'atrasado', diasRestantes: dias };
  if (dias <= 30) return { status: 'apertando', diasRestantes: dias };
  return { status: 'no-prazo', diasRestantes: dias };
}

function _diasAte(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const partes = String(yyyyMmDd).split('-').map(n => parseInt(n, 10));
  if (partes.length !== 3 || partes.some(isNaN)) return null;
  const alvo = new Date(partes[0], partes[1] - 1, partes[2]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

/**
 * Série temporal: para cada data com lançamento, calcula saldo acumulado real
 * vs trajetória ideal (interpola entre 0 hoje e meta na dataFormatura).
 * Retorno: { pontos: [{data, saldoReal, saldoIdeal}], dataInicio, dataFim }
 */
function calcularEvolucaoTemporal(lancamentos, meta, dataFormatura) {
  if (!lancamentos || lancamentos.length === 0) {
    return { pontos: [], dataInicio: '', dataFim: dataFormatura || '' };
  }

  // ordena lançamentos por data crescente
  const ordenados = lancamentos.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // agrupa por data e calcula delta diário (entradas - saídas)
  const porDia = {};
  for (let i = 0; i < ordenados.length; i++) {
    const l = ordenados[i];
    if (!l.data) continue;
    const delta = (l.tipo === 'Entrada' ? 1 : -1) * l.valor;
    porDia[l.data] = (porDia[l.data] || 0) + delta;
  }

  const datas = Object.keys(porDia).sort();
  if (datas.length === 0) return { pontos: [], dataInicio: '', dataFim: dataFormatura || '' };

  const dataInicio = datas[0];
  const dataFim = dataFormatura || datas[datas.length - 1];

  const diasTotal = _diasEntre(dataInicio, dataFim);
  const m = Number(meta) || 0;

  let saldoAcum = 0;
  const pontos = [];
  for (let i = 0; i < datas.length; i++) {
    const d = datas[i];
    saldoAcum += porDia[d];
    const diasDoInicio = _diasEntre(dataInicio, d);
    const saldoIdeal = (diasTotal > 0 && m > 0)
      ? _r2((diasDoInicio / diasTotal) * m)
      : 0;
    pontos.push({
      data: d,
      saldoReal: _r2(saldoAcum),
      saldoIdeal: saldoIdeal
    });
  }

  // Adiciona ponto final na dataFormatura (saldo permanece = último real, ideal = meta)
  if (dataFim && dataFim !== pontos[pontos.length - 1].data) {
    pontos.push({
      data: dataFim,
      saldoReal: _r2(saldoAcum),
      saldoIdeal: _r2(m)
    });
  }

  return { pontos: pontos, dataInicio: dataInicio, dataFim: dataFim, meta: _r2(m) };
}

function _diasEntre(d1Str, d2Str) {
  const p1 = String(d1Str).split('-').map(n => parseInt(n, 10));
  const p2 = String(d2Str).split('-').map(n => parseInt(n, 10));
  if (p1.length !== 3 || p2.length !== 3) return 0;
  const a = new Date(p1[0], p1[1] - 1, p1[2]);
  const b = new Date(p2[0], p2[1] - 1, p2[2]);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
