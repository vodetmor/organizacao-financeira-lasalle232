/**
 * Caixa 232 — Cálculos puros
 *
 * Todas as funções aqui são puras: recebem dados, devolvem números.
 * Sem SpreadsheetApp, sem efeitos colaterais. Fáceis de testar e
 * impossíveis de corromper a planilha.
 *
 * Semântica decidida no plano:
 *   - Meta mede SALDO (S = A − G) sobre meta total.
 *   - Falta = max(0, meta − saldo).
 *   - Arrecadado e Gasto continuam visíveis em cards separados
 *     (transparência total — alunos vêem tudo).
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
    arrecadado: _round2(arrecadado),
    gasto: _round2(gasto),
    saldo: _round2(saldo),
    falta: _round2(falta),
    percentual: _round2(percentual),
    meta: _round2(m)
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
      total: _round2(mapa[cat]),
      percentual: total > 0 ? _round2((mapa[cat] / total) * 100) : 0
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

function _round2(n) {
  return Math.round(n * 100) / 100;
}
