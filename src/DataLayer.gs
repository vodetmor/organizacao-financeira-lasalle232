/**
 * Caixa 232 — Camada de leitura da planilha
 *
 * Funções defensivas: nenhuma quebra o site se a planilha estiver
 * mal-formada. Erros viram warnings, linhas inválidas são puladas,
 * dados ausentes viram fallbacks.
 */

function carregarDadosDashboard() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const warnings = [];

  const lancamentos = _lerLancamentos(ss, warnings);
  const config = _lerConfig(ss, warnings);
  const avisos = _lerAvisos(ss, warnings);
  const categorias = _lerCategorias(ss, warnings);

  const meta = Number(config.meta || 0);
  const resumo = calcularResumo(lancamentos, meta);

  const porCategoriaEntrada = agruparPorCategoria(lancamentos, 'Entrada');
  const porCategoriaSaida = agruparPorCategoria(lancamentos, 'Saida');

  return {
    config: config,
    meta: meta,
    resumo: resumo,
    lancamentos: lancamentos,
    avisos: avisos,
    categorias: categorias,
    porCategoriaEntrada: porCategoriaEntrada,
    porCategoriaSaida: porCategoriaSaida,
    warnings: warnings,
    ultimaLeitura: new Date().toISOString()
  };
}

function _lerLancamentos(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.LANCAMENTOS);
  if (!aba) {
    warnings.push('Aba Lancamentos não encontrada. Rode setup().');
    return [];
  }

  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];

  const lancamentos = [];
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const [data, tipo, categoria, descricao, valor] = linha;

    if (!data && !valor) continue; // linha vazia

    const tipoNorm = _normalizarTipo(tipo);
    if (!tipoNorm) {
      warnings.push('Linha ' + (i + 1) + ' em Lancamentos: tipo inválido "' + tipo + '" — ignorada.');
      continue;
    }

    const valorNum = _parseValor(valor);
    if (valorNum === null) {
      warnings.push('Linha ' + (i + 1) + ' em Lancamentos: valor inválido "' + valor + '" — ignorada.');
      continue;
    }

    lancamentos.push({
      linha: i + 1, // index real na planilha (1-based, contando header)
      data: _formatarData(data),
      tipo: tipoNorm,
      categoria: String(categoria || 'Sem categoria').trim(),
      descricao: String(descricao || '').trim(),
      valor: valorNum
    });
  }
  return lancamentos;
}

function _lerConfig(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.CONFIG);
  if (!aba) {
    warnings.push('Aba Config não encontrada. Usando defaults.');
    return { meta: 0, nome_turma: '232 La Salle', data_formatura: '' };
  }

  const dados = aba.getDataRange().getValues();
  const config = { meta: 0, nome_turma: '232 La Salle', data_formatura: '' };
  for (let i = 1; i < dados.length; i++) {
    const [chave, valor] = dados[i];
    if (!chave) continue;
    const k = String(chave).trim();
    if (k === 'meta') config.meta = Number(valor) || 0;
    else if (k === 'nome_turma') config.nome_turma = String(valor || '').trim();
    else if (k === 'data_formatura') config.data_formatura = _formatarData(valor);
    else config[k] = valor;
  }

  if (!config.meta) warnings.push('Meta não configurada em Config. Defina via /admin.');
  return config;
}

function _lerAvisos(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.AVISOS);
  if (!aba) return [];
  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];

  const lista = [];
  for (let i = 1; i < dados.length; i++) {
    const [data, titulo, mensagem, fixado] = dados[i];
    if (!titulo && !mensagem) continue;
    lista.push({
      linha: i + 1,
      data: _formatarData(data),
      titulo: String(titulo || '').trim(),
      mensagem: String(mensagem || '').trim(),
      fixado: String(fixado || 'NAO').trim().toUpperCase() === 'SIM'
    });
  }
  // ordem: fixados primeiro, depois por data desc
  lista.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return (b.data || '').localeCompare(a.data || '');
  });
  return lista;
}

function _lerCategorias(ss, warnings) {
  const aba = ss.getSheetByName(ABAS.CATEGORIAS);
  if (!aba) return { entrada: [], saida: [] };
  const dados = aba.getDataRange().getValues();
  const out = { entrada: [], saida: [] };
  for (let i = 1; i < dados.length; i++) {
    const [tipo, categoria] = dados[i];
    if (!categoria) continue;
    const tipoNorm = _normalizarTipo(tipo);
    if (!tipoNorm) continue;
    const cat = String(categoria).trim();
    if (tipoNorm === 'Entrada' && out.entrada.indexOf(cat) === -1) out.entrada.push(cat);
    if (tipoNorm === 'Saida' && out.saida.indexOf(cat) === -1) out.saida.push(cat);
  }
  return out;
}

/* =====================================================================
 *  Normalização / parsing defensivo
 * ===================================================================== */

function _normalizarTipo(tipo) {
  if (!tipo) return null;
  const t = String(tipo).trim().toLowerCase().replace(/[áàã]/g, 'a');
  if (t === 'entrada' || t === 'entradas') return 'Entrada';
  if (t === 'saida' || t === 'saidas') return 'Saida';
  return null;
}

function _parseValor(v) {
  if (v === '' || v === null || v === undefined) return null;
  // Aceita "240,00", "R$ 240,00", "240.00", número direto
  const n = (typeof v === 'number')
    ? v
    : Number(String(v).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return null;
  return Math.abs(n); // sempre positivo — sinal vem do Tipo
}

function _formatarData(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }
  return String(d).trim();
}
