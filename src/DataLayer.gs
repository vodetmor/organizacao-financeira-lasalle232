/**
 * Caixa 232 — Camada de leitura
 * Defensiva: ignora linhas ruins, retorna fallbacks, anexa warnings.
 */

function carregarDadosDashboard() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Auto-setup na primeira execução: se nenhuma aba conhecida existe,
  // chama setup() pra criar tudo. Zero fricção — basta deployar e abrir.
  if (!ss.getSheetByName(ABAS.LANCAMENTOS) && !ss.getSheetByName(ABAS.CONFIG)) {
    try { setup(); } catch (e) { /* sem permissão? segue com warnings */ }
  }

  const warnings = [];

  const lancamentos = _lerLancamentos(ss, warnings);
  const config      = _lerConfig(ss, warnings);
  const avisos      = _lerAvisos(ss, warnings);
  const categorias  = _lerCategorias(ss, warnings);
  const orcamento   = _lerOrcamento(ss, warnings);

  const meta = Number(config.meta || 0);
  const resumo = calcularResumo(lancamentos, meta);
  const porCategoriaEntrada = agruparPorCategoria(lancamentos, 'Entrada');
  const porCategoriaSaida   = agruparPorCategoria(lancamentos, 'Saida');
  const orcamentoStatus     = cruzarOrcamentoComLancamentos(orcamento, lancamentos);

  return {
    config: config,
    meta: meta,
    resumo: resumo,
    lancamentos: lancamentos,
    avisos: avisos,
    categorias: categorias,
    orcamento: orcamentoStatus,
    porCategoriaEntrada: porCategoriaEntrada,
    porCategoriaSaida:   porCategoriaSaida,
    warnings: warnings,
    ultimaLeitura: new Date().toISOString()
  };
}

function _lerLancamentos(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.LANCAMENTOS);
  if (!aba) { warnings.push('Aba Lancamentos não encontrada. Rode setup().'); return []; }
  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];
  const out = [];
  for (let i = 1; i < dados.length; i++) {
    const [data, tipo, categoria, descricao, valor] = dados[i];
    if (!data && !valor) continue;
    const tipoNorm = _normTipo(tipo);
    if (!tipoNorm) { warnings.push('Linha ' + (i + 1) + ' Lancamentos: tipo inválido.'); continue; }
    const v = _parseValor(valor);
    if (v === null) { warnings.push('Linha ' + (i + 1) + ' Lancamentos: valor inválido.'); continue; }
    out.push({
      linha: i + 1,
      data: _formatarData(data),
      tipo: tipoNorm,
      categoria: String(categoria || 'Sem categoria').trim(),
      descricao: String(descricao || '').trim(),
      valor: v
    });
  }
  return out;
}

function _lerConfig(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.CONFIG);
  if (!aba) { warnings.push('Aba Config não encontrada.'); return { meta: 0, nome_turma: '232 La Salle', data_formatura: '' }; }
  const dados = aba.getDataRange().getValues();
  const cfg = { meta: 0, nome_turma: '232 La Salle', data_formatura: '' };
  for (let i = 1; i < dados.length; i++) {
    const [k, v] = dados[i];
    if (!k) continue;
    const key = String(k).trim();
    if (key === 'meta')           cfg.meta = Number(v) || 0;
    else if (key === 'nome_turma')     cfg.nome_turma = String(v || '').trim();
    else if (key === 'data_formatura') cfg.data_formatura = _formatarData(v);
    else cfg[key] = v;
  }
  if (!cfg.meta) warnings.push('Meta não configurada.');
  return cfg;
}

function _lerAvisos(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.AVISOS);
  if (!aba) return [];
  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];
  const out = [];
  for (let i = 1; i < dados.length; i++) {
    const [data, titulo, mensagem, fixado] = dados[i];
    if (!titulo && !mensagem) continue;
    out.push({
      linha: i + 1,
      data: _formatarData(data),
      titulo: String(titulo || '').trim(),
      mensagem: String(mensagem || '').trim(),
      fixado: String(fixado || 'NAO').trim().toUpperCase() === 'SIM'
    });
  }
  out.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return (b.data || '').localeCompare(a.data || '');
  });
  return out;
}

function _lerCategorias(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.CATEGORIAS);
  if (!aba) return { entrada: [], saida: [] };
  const dados = aba.getDataRange().getValues();
  const out = { entrada: [], saida: [] };
  for (let i = 1; i < dados.length; i++) {
    const [tipo, cat] = dados[i];
    if (!cat) continue;
    const t = _normTipo(tipo);
    if (!t) continue;
    const c = String(cat).trim();
    if (t === 'Entrada' && out.entrada.indexOf(c) === -1) out.entrada.push(c);
    if (t === 'Saida'   && out.saida.indexOf(c)   === -1) out.saida.push(c);
  }
  return out;
}

function _lerOrcamento(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.ORCAMENTO);
  if (!aba) { warnings.push('Aba Orcamento não encontrada.'); return []; }
  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];
  const out = [];
  for (let i = 1; i < dados.length; i++) {
    const [item, categoria, planejado, observacao] = dados[i];
    if (!item && !planejado) continue;
    const v = _parseValor(planejado);
    out.push({
      linha: i + 1,
      item: String(item || '').trim() || 'Sem nome',
      categoria: String(categoria || 'Outro').trim(),
      planejado: v === null ? 0 : v,
      observacao: String(observacao || '').trim()
    });
  }
  return out;
}

/* ===========================================================
 *  Normalização defensiva
 * =========================================================== */

function _normTipo(t) {
  if (!t) return null;
  const s = String(t).trim().toLowerCase().replace(/[áàã]/g, 'a');
  if (s === 'entrada' || s === 'entradas') return 'Entrada';
  if (s === 'saida'   || s === 'saidas')   return 'Saida';
  return null;
}

function _parseValor(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = (typeof v === 'number')
    ? v
    : Number(String(v).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return null;
  return Math.abs(n);
}

function _formatarData(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  return String(d).trim();
}
