/**
 * Caixa 232 — API JSON
 *
 * Apps Script roda como API. O front-end mora no Netlify e chama:
 *   GET  ?action=data            → snapshot público (dashboard)
 *   POST { action, token, ... }  → operações de admin
 *
 * CORS: ContentService.createTextOutput() + MimeType.JSON retorna
 * Access-Control-Allow-Origin: * automaticamente em GET. Para POST,
 * o front envia Content-Type: text/plain (string JSON no body) pra
 * evitar preflight CORS. doPost parseia via e.postData.contents.
 */

const SPREADSHEET_ID = '1Tr6_YsT7B_S4KXqx6Pe8IGsuUWTik6iG-jgv3t4oGH4';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'data';
  try {
    if (action === 'data')  return _json({ ok: true, data: carregarDadosDashboard() });
    if (action === 'ping')  return _json({ ok: true, pong: true, ts: new Date().toISOString() });
    return _json({ ok: false, erro: 'Ação desconhecida: ' + action });
  } catch (err) {
    return _json({ ok: false, erro: err.message });
  }
}

function doPost(e) {
  let body = {};
  try {
    body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    return _json({ ok: false, erro: 'Body JSON inválido' });
  }
  const action = body.action || '';
  const token  = body.token || '';

  try {
    let r;
    switch (action) {
      case 'login':        r = adminLogin(body.senha); break;
      case 'logout':       r = adminLogout(token); break;
      case 'snapshot':     r = adminGetSnapshot(token); break;

      case 'addLanc':      r = adminAdicionarLancamento(token, body.lanc); break;
      case 'editLanc':     r = adminEditarLancamento(token, body.linha, body.lanc); break;
      case 'delLanc':      r = adminDeletarLancamento(token, body.linha); break;

      case 'setConfig':    r = adminAtualizarConfig(token, body.chave, body.valor); break;

      case 'addAviso':     r = adminAdicionarAviso(token, body.aviso); break;
      case 'editAviso':    r = adminEditarAviso(token, body.linha, body.aviso); break;
      case 'delAviso':     r = adminDeletarAviso(token, body.linha); break;

      case 'addCat':       r = adminAdicionarCategoria(token, body.tipo, body.categoria); break;
      case 'delCat':       r = adminDeletarCategoriaPorNome(token, body.tipo, body.categoria); break;

      case 'addOrc':       r = adminAdicionarOrcamento(token, body.item); break;
      case 'editOrc':      r = adminEditarOrcamento(token, body.linha, body.item); break;
      case 'delOrc':       r = adminDeletarOrcamento(token, body.linha); break;

      // Batch — uma request, N operações
      case 'addLancs':     r = adminAdicionarLancamentos(token, body.lancs); break;
      case 'addOrcs':      r = adminAdicionarOrcamentos(token, body.itens); break;
      case 'delLancs':     r = adminDeletarLancamentos(token, body.linhas); break;
      case 'delAvisos':    r = adminDeletarAvisosBatch(token, body.linhas); break;
      case 'delOrcs':      r = adminDeletarOrcamentos(token, body.linhas); break;
      case 'delCats':      r = adminDeletarCategoriasBatch(token, body.itens); break;

      case 'trocarSenha':  r = adminTrocarSenha(token, body.senhaAtual, body.senhaNova); break;

      default: r = { ok: false, erro: 'Ação inválida: ' + action };
    }
    return _json(r);
  } catch (err) {
    return _json({ ok: false, erro: err.message });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
