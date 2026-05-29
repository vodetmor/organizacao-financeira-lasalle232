/**
 * Caixa 232 — Roteador do Web App
 *
 * doGet(e) decide qual página renderizar com base no parâmetro ?page=:
 *   default        → Index.html  (dashboard público read-only)
 *   page=admin     → Admin.html  (área de edição protegida por senha)
 *
 * No carregamento do dashboard público, os dados já são injetados no
 * HTML via template scriptlet (`<?= initialData ?>`) para evitar
 * flash de loading e segunda chamada ao servidor.
 */

const SPREADSHEET_ID = '1Tr6_YsT7B_S4KXqx6Pe8IGsuUWTik6iG-jgv3t4oGH4';

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'dashboard';
  const isAdmin = page === 'admin';
  const template = HtmlService.createTemplateFromFile(isAdmin ? 'Admin' : 'Index');

  if (isAdmin) {
    template.initialData = 'null';
  } else {
    let json;
    try {
      json = JSON.stringify(carregarDadosDashboard());
    } catch (err) {
      json = JSON.stringify({ erro: 'Falha ao carregar dados: ' + err.message });
    }
    // Escapa '<' para não quebrar o <script> que recebe o JSON inline
    template.initialData = json.replace(/</g, '\\u003c');
  }

  const title = isAdmin
    ? 'Admin · Caixa 232'
    : 'Caixa 232 · Formatura La Salle';

  return template.evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * Helper invocado dentro dos templates HTML para incluir
 * arquivos (Styles, App, AdminApp). Uso:
 *   <?!= include('Styles'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ===========================================================
 * Endpoints chamados pelo cliente via google.script.run
 * Sempre defensivos: try/catch + retornar shape consistente.
 * =========================================================== */

function getDashboardData() {
  try {
    return { ok: true, data: carregarDadosDashboard() };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}
