/**
 * Caixa 232 — Backend do /admin
 *
 * Auth: senha admin armazenada em ScriptProperties (criada no setup).
 * Cliente chama adminLogin(senha) e recebe um token (cache 30min).
 * Cada operação write exige token válido.
 *
 * IMPORTANTE: as escritas usam SpreadsheetApp diretamente. O cliente
 * NUNCA recebe nem manipula range/linha sem revalidar do server.
 */

const TOKEN_TTL_SEGUNDOS = 30 * 60; // 30 minutos

/* =====================================================================
 *  Auth
 * ===================================================================== */

function adminLogin(senha) {
  try {
    const senhaCorreta = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!senhaCorreta) {
      return { ok: false, erro: 'Senha admin não configurada. Rode setup() no editor.' };
    }
    if (!senha || senha !== senhaCorreta) {
      Utilities.sleep(500); // delay anti brute-force ingênuo
      return { ok: false, erro: 'Senha incorreta.' };
    }
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('admin_token_' + token, '1', TOKEN_TTL_SEGUNDOS);
    return { ok: true, token: token, ttl: TOKEN_TTL_SEGUNDOS };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminLogout(token) {
  CacheService.getScriptCache().remove('admin_token_' + token);
  return { ok: true };
}

function _exigirAuth(token) {
  if (!token) throw new Error('Não autenticado.');
  const valido = CacheService.getScriptCache().get('admin_token_' + token);
  if (!valido) throw new Error('Sessão expirada. Faça login novamente.');
}

function adminTrocarSenha(token, senhaAtual, senhaNova) {
  try {
    _exigirAuth(token);
    const senhaCorreta = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (senhaAtual !== senhaCorreta) {
      return { ok: false, erro: 'Senha atual incorreta.' };
    }
    if (!senhaNova || senhaNova.length < 6) {
      return { ok: false, erro: 'Nova senha precisa ter pelo menos 6 caracteres.' };
    }
    PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', senhaNova);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  Snapshot pro /admin (dados crus + warnings)
 * ===================================================================== */

function adminGetSnapshot(token) {
  try {
    _exigirAuth(token);
    return { ok: true, data: carregarDadosDashboard() };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  CRUD: Lançamentos
 * ===================================================================== */

function adminAdicionarLancamento(token, lanc) {
  try {
    _exigirAuth(token);
    const erro = _validarLancamento(lanc);
    if (erro) return { ok: false, erro: erro };

    const aba = _abaOuErro(ABAS.LANCAMENTOS);
    aba.appendRow([
      lanc.data,
      lanc.tipo,
      lanc.categoria,
      lanc.descricao || '',
      Number(lanc.valor)
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminEditarLancamento(token, linha, lanc) {
  try {
    _exigirAuth(token);
    const erro = _validarLancamento(lanc);
    if (erro) return { ok: false, erro: erro };
    const aba = _abaOuErro(ABAS.LANCAMENTOS);
    const row = _validarLinha(aba, linha);
    aba.getRange(row, 1, 1, 5).setValues([[
      lanc.data, lanc.tipo, lanc.categoria, lanc.descricao || '', Number(lanc.valor)
    ]]);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminDeletarLancamento(token, linha) {
  try {
    _exigirAuth(token);
    const aba = _abaOuErro(ABAS.LANCAMENTOS);
    const row = _validarLinha(aba, linha);
    aba.deleteRow(row);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  CRUD: Config (meta, nome_turma, data_formatura, chaves arbitrárias)
 * ===================================================================== */

function adminAtualizarConfig(token, chave, valor) {
  try {
    _exigirAuth(token);
    if (!chave) return { ok: false, erro: 'Chave obrigatória.' };
    const aba = _abaOuErro(ABAS.CONFIG);
    const dados = aba.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(chave).trim()) {
        row = i + 1;
        break;
      }
    }
    if (row === -1) {
      aba.appendRow([chave, valor]);
    } else {
      aba.getRange(row, 2).setValue(valor);
    }
    if (chave === 'meta') aba.getRange('B' + (row === -1 ? aba.getLastRow() : row)).setNumberFormat('R$ #,##0.00');
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  CRUD: Avisos
 * ===================================================================== */

function adminAdicionarAviso(token, aviso) {
  try {
    _exigirAuth(token);
    if (!aviso.titulo) return { ok: false, erro: 'Título obrigatório.' };
    const aba = _abaOuErro(ABAS.AVISOS);
    aba.appendRow([
      aviso.data || new Date(),
      aviso.titulo,
      aviso.mensagem || '',
      aviso.fixado ? 'SIM' : 'NAO'
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminEditarAviso(token, linha, aviso) {
  try {
    _exigirAuth(token);
    const aba = _abaOuErro(ABAS.AVISOS);
    const row = _validarLinha(aba, linha);
    aba.getRange(row, 1, 1, 4).setValues([[
      aviso.data || '',
      aviso.titulo || '',
      aviso.mensagem || '',
      aviso.fixado ? 'SIM' : 'NAO'
    ]]);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminDeletarAviso(token, linha) {
  try {
    _exigirAuth(token);
    const aba = _abaOuErro(ABAS.AVISOS);
    const row = _validarLinha(aba, linha);
    aba.deleteRow(row);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  CRUD: Categorias
 * ===================================================================== */

function adminAdicionarCategoria(token, tipo, categoria) {
  try {
    _exigirAuth(token);
    const tipoNorm = _normalizarTipo(tipo);
    if (!tipoNorm) return { ok: false, erro: 'Tipo precisa ser Entrada ou Saida.' };
    if (!categoria) return { ok: false, erro: 'Categoria obrigatória.' };
    const aba = _abaOuErro(ABAS.CATEGORIAS);
    aba.appendRow([tipoNorm, String(categoria).trim()]);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminDeletarCategoria(token, linha) {
  try {
    _exigirAuth(token);
    const aba = _abaOuErro(ABAS.CATEGORIAS);
    const row = _validarLinha(aba, linha);
    aba.deleteRow(row);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/**
 * Deleta categoria buscando por (tipo, nome) — mais conveniente
 * para o cliente que não tem o índice de linha da aba Categorias.
 */
function adminDeletarCategoriaPorNome(token, tipo, nome) {
  try {
    _exigirAuth(token);
    const tipoNorm = _normalizarTipo(tipo);
    if (!tipoNorm) return { ok: false, erro: 'Tipo inválido.' };
    if (!nome) return { ok: false, erro: 'Nome obrigatório.' };

    const aba = _abaOuErro(ABAS.CATEGORIAS);
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      const t = _normalizarTipo(dados[i][0]);
      const n = String(dados[i][1] || '').trim();
      if (t === tipoNorm && n === String(nome).trim()) {
        aba.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, erro: 'Categoria não encontrada.' };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* =====================================================================
 *  Helpers
 * ===================================================================== */

function _abaOuErro(nome) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = ss.getSheetByName(nome);
  if (!aba) throw new Error('Aba "' + nome + '" não encontrada. Rode setup().');
  return aba;
}

function _validarLinha(aba, linha) {
  const row = parseInt(linha, 10);
  if (!row || row < 2 || row > aba.getLastRow()) {
    throw new Error('Linha inválida: ' + linha);
  }
  return row;
}

function _validarLancamento(l) {
  if (!l) return 'Lançamento vazio.';
  if (!l.data) return 'Data obrigatória.';
  if (!_normalizarTipo(l.tipo)) return 'Tipo precisa ser Entrada ou Saida.';
  if (!l.categoria) return 'Categoria obrigatória.';
  const valor = Number(l.valor);
  if (isNaN(valor) || valor <= 0) return 'Valor precisa ser número positivo.';
  return null;
}
