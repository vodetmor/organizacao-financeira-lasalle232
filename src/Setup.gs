/**
 * Caixa 232 — Setup automatizado
 *
 * Rode UMA VEZ pelo editor do Apps Script:
 *   1. Editor → função "setup" → Run
 *   2. Autorize quando pedir
 *   3. Pronto. Senha admin = "Financeiro@232" (trocável depois)
 *
 * Idempotente: roda quantas vezes quiser, não duplica abas.
 */

const ABAS = {
  LANCAMENTOS: 'Lancamentos',
  ORCAMENTO:   'Orcamento',
  CONFIG:      'Config',
  AVISOS:      'Avisos',
  CATEGORIAS:  'Categorias'
};

const META_INICIAL = 5000.00;
const SENHA_ADMIN  = 'Financeiro@232';

function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  _ensureCategorias(ss);
  _ensureLancamentos(ss);
  _ensureOrcamento(ss);
  _migrarOrcamentoPrazo(ss);   // adiciona coluna Prazo se aba antiga sem ela
  _ensureConfig(ss);
  _ensureAvisos(ss);
  _removerAbasPadrao(ss);

  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', SENHA_ADMIN);

  Logger.log('Setup concluído. Senha admin: ' + SENHA_ADMIN);
  return { senha: SENHA_ADMIN };
}

/**
 * DESTRUTIVO — apaga tudo e recria com dados de exemplo. Útil em dev.
 */
function resetEPopular() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const temp = ss.insertSheet('__reset__' + Date.now());
  ss.getSheets().forEach(s => { if (s.getName() !== temp.getName()) ss.deleteSheet(s); });

  _ensureCategorias(ss);
  _ensureLancamentos(ss);
  _ensureOrcamento(ss);
  _ensureConfig(ss);
  _ensureAvisos(ss);

  _popularExemplos(ss);

  ss.deleteSheet(temp);
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', SENHA_ADMIN);
  Logger.log('Reset completo. Senha: ' + SENHA_ADMIN);
  return { senha: SENHA_ADMIN };
}

/* ===========================================================
 *  Criação das abas (idempotente)
 * =========================================================== */

function _ensureLancamentos(ss) {
  let aba = ss.getSheetByName(ABAS.LANCAMENTOS);
  if (aba) return aba;
  aba = ss.insertSheet(ABAS.LANCAMENTOS);
  const h = ['Data', 'Tipo', 'Categoria', 'Descricao', 'Valor'];
  aba.getRange(1, 1, 1, h.length).setValues([h]);
  aba.setFrozenRows(1);
  _header(aba.getRange(1, 1, 1, h.length));
  aba.setColumnWidth(1, 110);
  aba.setColumnWidth(2, 90);
  aba.setColumnWidth(3, 140);
  aba.setColumnWidth(4, 320);
  aba.setColumnWidth(5, 120);
  aba.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  aba.getRange('E2:E').setNumberFormat('R$ #,##0.00');
  // Lista suspensa simples — UX, não programação
  aba.getRange('B2:B').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Entrada', 'Saida'], true).build()
  );
  return aba;
}

function _ensureOrcamento(ss) {
  let aba = ss.getSheetByName(ABAS.ORCAMENTO);
  if (aba) return aba;
  aba = ss.insertSheet(ABAS.ORCAMENTO);
  const h = ['Item', 'Categoria', 'ValorPlanejado', 'Prazo', 'Observacao'];
  aba.getRange(1, 1, 1, h.length).setValues([h]);
  aba.setFrozenRows(1);
  _header(aba.getRange(1, 1, 1, h.length));
  aba.setColumnWidth(1, 200);
  aba.setColumnWidth(2, 130);
  aba.setColumnWidth(3, 140);
  aba.setColumnWidth(4, 120);
  aba.setColumnWidth(5, 300);
  aba.getRange('C2:C').setNumberFormat('R$ #,##0.00');
  aba.getRange('D2:D').setNumberFormat('yyyy-mm-dd');

  // Itens de exemplo — prazos escalonados ao longo do ano até a formatura
  const exemplos = [
    ['Buffet',         'Buffet',     2500.00, '2026-09-15', 'Jantar + bebidas pra toda a turma'],
    ['Fotógrafo',      'Fotógrafo',   800.00, '2026-08-30', 'Cobertura completa do evento + álbum'],
    ['Decoração',      'Decoração',   600.00, '2026-11-30', 'Cenário entrada, mesas, balões'],
    ['Som + DJ',       'Bebidas',     400.00, '2026-11-30', '4h de pista de dança'],
    ['Convites',       'Outro',       200.00, '2026-08-01', 'Impressão + entrega aos formandos'],
    ['Lembrancinhas',  'Outro',       300.00, '2026-11-15', 'Pra cada formando'],
    ['Espaço/salão',   'Outro',       800.00, '2026-07-30', 'Aluguel do local da festa']
  ];
  aba.getRange(2, 1, exemplos.length, 5).setValues(exemplos);
  return aba;
}

/**
 * Migração: adiciona coluna "Prazo" na aba Orcamento antiga (4 col → 5 col).
 * Idempotente: se já tiver Prazo, não faz nada.
 */
function _migrarOrcamentoPrazo(ss) {
  const aba = ss.getSheetByName(ABAS.ORCAMENTO);
  if (!aba || aba.getLastColumn() < 1) return;
  const headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
  if (headers.indexOf('prazo') !== -1) return; // já migrada

  // Insere coluna D (entre ValorPlanejado e Observacao)
  aba.insertColumnBefore(4);
  aba.getRange(1, 4).setValue('Prazo');
  _header(aba.getRange(1, 4));
  aba.setColumnWidth(4, 120);
  aba.getRange('D2:D').setNumberFormat('yyyy-mm-dd');
}

function _ensureConfig(ss) {
  let aba = ss.getSheetByName(ABAS.CONFIG);
  if (aba) return aba;
  aba = ss.insertSheet(ABAS.CONFIG);
  const h = ['Chave', 'Valor'];
  aba.getRange(1, 1, 1, h.length).setValues([h]);
  aba.setFrozenRows(1);
  _header(aba.getRange(1, 1, 1, h.length));
  aba.setColumnWidth(1, 180);
  aba.setColumnWidth(2, 260);
  const linhas = [
    ['meta',           META_INICIAL],
    ['nome_turma',     '232 La Salle'],
    ['data_formatura', '2026-12-15']
  ];
  aba.getRange(2, 1, linhas.length, 2).setValues(linhas);
  aba.getRange('B2').setNumberFormat('R$ #,##0.00');
  return aba;
}

function _ensureAvisos(ss) {
  let aba = ss.getSheetByName(ABAS.AVISOS);
  if (aba) return aba;
  aba = ss.insertSheet(ABAS.AVISOS);
  const h = ['Data', 'Titulo', 'Mensagem', 'Fixado'];
  aba.getRange(1, 1, 1, h.length).setValues([h]);
  aba.setFrozenRows(1);
  _header(aba.getRange(1, 1, 1, h.length));
  aba.setColumnWidth(1, 110);
  aba.setColumnWidth(2, 200);
  aba.setColumnWidth(3, 420);
  aba.setColumnWidth(4, 90);
  aba.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  aba.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['SIM', 'NAO'], true).build()
  );
  return aba;
}

function _ensureCategorias(ss) {
  let aba = ss.getSheetByName(ABAS.CATEGORIAS);
  if (aba) return aba;
  aba = ss.insertSheet(ABAS.CATEGORIAS);
  const h = ['Tipo', 'Categoria'];
  aba.getRange(1, 1, 1, h.length).setValues([h]);
  aba.setFrozenRows(1);
  _header(aba.getRange(1, 1, 1, h.length));
  aba.setColumnWidth(1, 100);
  aba.setColumnWidth(2, 200);
  aba.getRange('A2:A').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Entrada', 'Saida'], true).build()
  );
  const iniciais = [
    ['Entrada', 'Rifa'],
    ['Entrada', 'Festa'],
    ['Entrada', 'Caixinha'],
    ['Entrada', 'Doação'],
    ['Entrada', 'Outro'],
    ['Saida',   'Buffet'],
    ['Saida',   'Decoração'],
    ['Saida',   'Fotógrafo'],
    ['Saida',   'Bebidas'],
    ['Saida',   'Outro']
  ];
  aba.getRange(2, 1, iniciais.length, 2).setValues(iniciais);
  return aba;
}

function _removerAbasPadrao(ss) {
  ['Página1', 'Sheet1', 'Folha1'].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba && ss.getSheets().length > 1) {
      try { ss.deleteSheet(aba); } catch (e) {}
    }
  });
}

function _popularExemplos(ss) {
  const lanc = ss.getSheetByName(ABAS.LANCAMENTOS);
  const exemplos = [
    ['2026-03-01', 'Entrada', 'Rifa',      'Rifa do PS5 — 12 números',  240.00],
    ['2026-03-05', 'Saida',   'Buffet',    'Sinal do buffet',           800.00],
    ['2026-03-10', 'Entrada', 'Festa',     'Festa de março',          1500.00],
    ['2026-03-18', 'Entrada', 'Caixinha',  'Mensalidade da turma',      320.00],
    ['2026-03-22', 'Saida',   'Decoração', 'Adiantamento decoração',    250.00],
    ['2026-04-05', 'Entrada', 'Rifa',      'Rifa 2 — fone bluetooth',   180.00]
  ];
  lanc.getRange(2, 1, exemplos.length, exemplos[0].length).setValues(exemplos);

  const av = ss.getSheetByName(ABAS.AVISOS);
  const avisos = [
    ['2026-03-08', 'Festa dia 15!',   'Vendas de ingresso até dia 12 com qualquer organizador.', 'SIM'],
    ['2026-03-01', 'Meta atualizada', 'Subimos a meta após orçamento do buffet.',                'NAO']
  ];
  av.getRange(2, 1, avisos.length, avisos[0].length).setValues(avisos);
}

function _header(range) {
  range.setBackground('#14508C')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('left');
}
