/**
 * Caixa 232 — Backend do /admin
 * Auth: senha em ScriptProperties + token de sessão no CacheService.
 */

const TOKEN_TTL = 30 * 60; // 30 minutos

/* ===========================================================
 *  Auth
 * =========================================================== */

function adminLogin(senha) {
  try {
    const correta = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!correta) return { ok: false, erro: 'Senha não configurada. Rode setup().' };
    if (!senha || senha !== correta) {
      Utilities.sleep(500);
      return { ok: false, erro: 'Senha incorreta.' };
    }
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('adm_' + token, '1', TOKEN_TTL);
    return { ok: true, token: token, ttl: TOKEN_TTL };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove('adm_' + token);
  return { ok: true };
}

function _auth(token) {
  if (!token) throw new Error('Não autenticado.');
  if (!CacheService.getScriptCache().get('adm_' + token)) throw new Error('Sessão expirada.');
}

function adminTrocarSenha(token, senhaAtual, senhaNova) {
  try {
    _auth(token);
    const correta = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (senhaAtual !== correta) return { ok: false, erro: 'Senha atual incorreta.' };
    if (!senhaNova || senhaNova.length < 6) return { ok: false, erro: 'Nova senha precisa ter pelo menos 6 caracteres.' };
    PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', senhaNova);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function adminGetSnapshot(token) {
  try {
    _auth(token);
    return { ok: true, data: carregarDadosDashboard() };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/* ===========================================================
 *  CRUD Lançamentos
 * =========================================================== */

function adminAdicionarLancamento(token, lanc) {
  try {
    _auth(token);
    const err = _validarLanc(lanc);
    if (err) return { ok: false, erro: err };
    _aba(ABAS.LANCAMENTOS).appendRow([
      lanc.data, lanc.tipo, lanc.categoria, lanc.descricao || '', Number(lanc.valor)
    ]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminEditarLancamento(token, linha, lanc) {
  try {
    _auth(token);
    const err = _validarLanc(lanc);
    if (err) return { ok: false, erro: err };
    const aba = _aba(ABAS.LANCAMENTOS);
    const r = _linha(aba, linha);
    aba.getRange(r, 1, 1, 5).setValues([[
      lanc.data, lanc.tipo, lanc.categoria, lanc.descricao || '', Number(lanc.valor)
    ]]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminDeletarLancamento(token, linha) {
  try {
    _auth(token);
    const aba = _aba(ABAS.LANCAMENTOS);
    aba.deleteRow(_linha(aba, linha));
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

/* ===========================================================
 *  CRUD Config
 * =========================================================== */

function adminAtualizarConfig(token, chave, valor) {
  try {
    _auth(token);
    if (!chave) return { ok: false, erro: 'Chave obrigatória.' };
    const aba = _aba(ABAS.CONFIG);
    const dados = aba.getDataRange().getValues();
    let r = -1;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(chave).trim()) { r = i + 1; break; }
    }
    if (r === -1) {
      aba.appendRow([chave, valor]);
      r = aba.getLastRow();
    } else {
      aba.getRange(r, 2).setValue(valor);
    }
    if (chave === 'meta') aba.getRange('B' + r).setNumberFormat('R$ #,##0.00');
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

/* ===========================================================
 *  CRUD Avisos
 * =========================================================== */

function adminAdicionarAviso(token, aviso) {
  try {
    _auth(token);
    if (!aviso || !aviso.titulo) return { ok: false, erro: 'Título obrigatório.' };
    _aba(ABAS.AVISOS).appendRow([
      aviso.data || new Date(), aviso.titulo, aviso.mensagem || '', aviso.fixado ? 'SIM' : 'NAO'
    ]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminEditarAviso(token, linha, aviso) {
  try {
    _auth(token);
    const aba = _aba(ABAS.AVISOS);
    const r = _linha(aba, linha);
    aba.getRange(r, 1, 1, 4).setValues([[
      aviso.data || '', aviso.titulo || '', aviso.mensagem || '', aviso.fixado ? 'SIM' : 'NAO'
    ]]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminDeletarAviso(token, linha) {
  try {
    _auth(token);
    const aba = _aba(ABAS.AVISOS);
    aba.deleteRow(_linha(aba, linha));
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

/* ===========================================================
 *  CRUD Categorias
 * =========================================================== */

function adminAdicionarCategoria(token, tipo, categoria) {
  try {
    _auth(token);
    const t = _normTipo(tipo);
    if (!t) return { ok: false, erro: 'Tipo precisa ser Entrada ou Saida.' };
    if (!categoria) return { ok: false, erro: 'Categoria obrigatória.' };
    _aba(ABAS.CATEGORIAS).appendRow([t, String(categoria).trim()]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminDeletarCategoriaPorNome(token, tipo, nome) {
  try {
    _auth(token);
    const t = _normTipo(tipo);
    if (!t) return { ok: false, erro: 'Tipo inválido.' };
    if (!nome) return { ok: false, erro: 'Nome obrigatório.' };
    const aba = _aba(ABAS.CATEGORIAS);
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      const t2 = _normTipo(dados[i][0]);
      const n = String(dados[i][1] || '').trim();
      if (t2 === t && n === String(nome).trim()) {
        aba.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, erro: 'Categoria não encontrada.' };
  } catch (e) { return { ok: false, erro: e.message }; }
}

/* ===========================================================
 *  CRUD Orçamento (NOVO)
 * =========================================================== */

function adminAdicionarOrcamento(token, item) {
  try {
    _auth(token);
    const err = _validarOrc(item);
    if (err) return { ok: false, erro: err };
    _aba(ABAS.ORCAMENTO).appendRow([
      item.item,
      item.categoria,
      Number(item.planejado),
      item.prazo || '',
      item.observacao || ''
    ]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminEditarOrcamento(token, linha, item) {
  try {
    _auth(token);
    const err = _validarOrc(item);
    if (err) return { ok: false, erro: err };
    const aba = _aba(ABAS.ORCAMENTO);
    const r = _linha(aba, linha);
    aba.getRange(r, 1, 1, 5).setValues([[
      item.item,
      item.categoria,
      Number(item.planejado),
      item.prazo || '',
      item.observacao || ''
    ]]);
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

function adminDeletarOrcamento(token, linha) {
  try {
    _auth(token);
    const aba = _aba(ABAS.ORCAMENTO);
    aba.deleteRow(_linha(aba, linha));
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

/* ===========================================================
 *  Helpers
 * =========================================================== */

function _aba(nome) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = ss.getSheetByName(nome);
  if (!aba) throw new Error('Aba "' + nome + '" não encontrada. Rode setup().');
  return aba;
}

function _linha(aba, linha) {
  const r = parseInt(linha, 10);
  if (!r || r < 2 || r > aba.getLastRow()) throw new Error('Linha inválida: ' + linha);
  return r;
}

function _validarLanc(l) {
  if (!l) return 'Lançamento vazio.';
  if (!l.data) return 'Data obrigatória.';
  if (!_normTipo(l.tipo)) return 'Tipo precisa ser Entrada ou Saida.';
  if (!l.categoria) return 'Categoria obrigatória.';
  const v = Number(l.valor);
  if (isNaN(v) || v <= 0) return 'Valor precisa ser número positivo.';
  return null;
}

function _validarOrc(o) {
  if (!o) return 'Item vazio.';
  if (!o.item) return 'Nome do item obrigatório.';
  if (!o.categoria) return 'Categoria obrigatória.';
  const v = Number(o.planejado);
  if (isNaN(v) || v < 0) return 'Valor planejado precisa ser número.';
  return null;
}
