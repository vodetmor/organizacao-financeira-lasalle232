/**
 * Caixa 232 — Setup automatizado da planilha
 *
 * Rode UMA VEZ pelo editor do Apps Script:
 *   1. Abra o editor: clasp open-script (ou direto pelo Drive)
 *   2. Selecione a função `setup` no menu suspenso
 *   3. Clique em Run e autorize as permissões
 *   4. Veja a senha admin nos Logs (Ctrl+Enter ou menu "Executions")
 *
 * O setup é idempotente: roda quantas vezes quiser, não duplica abas
 * nem sobrescreve dados existentes. Use `resetEPopular` para zerar a
 * planilha com dados de exemplo (DESTRUTIVO).
 */

const ABAS = {
  LANCAMENTOS: 'Lancamentos',
  CONFIG: 'Config',
  AVISOS: 'Avisos',
  CATEGORIAS: 'Categorias'
};

const META_INICIAL = 5000.00; // R$ 5.000,00 — valor de validação. Edite pelo /admin depois.

function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  _ensureCategorias(ss);   // primeiro: alimenta lista suspensa de Lancamentos
  _ensureLancamentos(ss);
  _ensureConfig(ss);
  _ensureAvisos(ss);
  _removerAbasPadrao(ss);

  const senha = _ensureSenhaAdmin();

  Logger.log('===============================================');
  Logger.log(' Caixa 232 — setup concluído');
  Logger.log('-----------------------------------------------');
  Logger.log(' Senha admin: ' + senha);
  Logger.log(' Guarde essa senha. Trocável pelo /admin depois.');
  Logger.log('-----------------------------------------------');
  Logger.log(' Próximos passos:');
  Logger.log('  1. Deploy > New deployment > Web app');
  Logger.log('     - Execute as: Me');
  Logger.log('     - Who has access: Anyone');
  Logger.log('  2. Copie a URL gerada e divulgue para a turma.');
  Logger.log('  3. URL admin: <URL_DO_WEBAPP>?page=admin');
  Logger.log('===============================================');

  return { senha: senha };
}

/**
 * DESTRUTIVO. Apaga todas as abas e recria com dados de exemplo.
 * Útil em dev para garantir um estado limpo. NÃO rode em produção
 * sem confirmar — apaga lançamentos reais.
 */
function resetEPopular() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Cria temp pra não deixar a planilha sem sheets durante o reset
  const temp = ss.insertSheet('__reset_temp__' + Date.now());
  ss.getSheets().forEach(s => {
    if (s.getName() !== temp.getName()) ss.deleteSheet(s);
  });

  _ensureCategorias(ss);
  _ensureLancamentos(ss);
  _ensureConfig(ss);
  _ensureAvisos(ss);

  _popularExemplos(ss);

  ss.deleteSheet(temp);

  const senha = _ensureSenhaAdmin();
  Logger.log('Reset completo. Senha admin: ' + senha);
  return { senha: senha };
}

/* =====================================================================
 *  Criação das abas (idempotente — só cria se não existir)
 * ===================================================================== */

function _ensureLancamentos(ss) {
  let aba = ss.getSheetByName(ABAS.LANCAMENTOS);
  if (aba) return aba;

  aba = ss.insertSheet(ABAS.LANCAMENTOS);
  const headers = ['Data', 'Tipo', 'Categoria', 'Descricao', 'Valor'];
  aba.getRange(1, 1, 1, headers.length).setValues([headers]);
  aba.setFrozenRows(1);
  _estilizarHeader(aba.getRange(1, 1, 1, headers.length));

  aba.setColumnWidth(1, 110);   // Data
  aba.setColumnWidth(2, 90);    // Tipo
  aba.setColumnWidth(3, 130);   // Categoria
  aba.setColumnWidth(4, 300);   // Descricao
  aba.setColumnWidth(5, 120);   // Valor

  // Formato data + moeda
  aba.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  aba.getRange('E2:E').setNumberFormat('R$ #,##0.00');

  // Validação Tipo
  const tipoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Entrada', 'Saida'], true)
    .setAllowInvalid(false)
    .setHelpText('Escolha Entrada ou Saida.')
    .build();
  aba.getRange('B2:B').setDataValidation(tipoRule);

  // Validação Categoria via INDIRECT pra puxar da aba Categorias
  // (lista é dinâmica; alimentada pelo /admin)
  const categoriasAba = ss.getSheetByName(ABAS.CATEGORIAS);
  if (categoriasAba) {
    const range = categoriasAba.getRange('B2:B');
    const catRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(range, true)
      .setAllowInvalid(true)
      .setHelpText('Escolha uma categoria definida na aba Categorias.')
      .build();
    aba.getRange('C2:C').setDataValidation(catRule);
  }

  return aba;
}

function _ensureConfig(ss) {
  let aba = ss.getSheetByName(ABAS.CONFIG);
  if (aba) return aba;

  aba = ss.insertSheet(ABAS.CONFIG);
  const headers = ['Chave', 'Valor'];
  aba.getRange(1, 1, 1, headers.length).setValues([headers]);
  aba.setFrozenRows(1);
  _estilizarHeader(aba.getRange(1, 1, 1, headers.length));

  aba.setColumnWidth(1, 180);
  aba.setColumnWidth(2, 260);

  // Valores iniciais — sobrescreve sem dó porque é aba de config
  const linhas = [
    ['meta', META_INICIAL],
    ['nome_turma', '232 La Salle'],
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
  const headers = ['Data', 'Titulo', 'Mensagem', 'Fixado'];
  aba.getRange(1, 1, 1, headers.length).setValues([headers]);
  aba.setFrozenRows(1);
  _estilizarHeader(aba.getRange(1, 1, 1, headers.length));

  aba.setColumnWidth(1, 110);
  aba.setColumnWidth(2, 180);
  aba.setColumnWidth(3, 400);
  aba.setColumnWidth(4, 90);

  aba.getRange('A2:A').setNumberFormat('yyyy-mm-dd');

  const fixadoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NAO'], true)
    .setAllowInvalid(false)
    .build();
  aba.getRange('D2:D').setDataValidation(fixadoRule);

  return aba;
}

function _ensureCategorias(ss) {
  let aba = ss.getSheetByName(ABAS.CATEGORIAS);
  if (aba) return aba;

  aba = ss.insertSheet(ABAS.CATEGORIAS);
  const headers = ['Tipo', 'Categoria'];
  aba.getRange(1, 1, 1, headers.length).setValues([headers]);
  aba.setFrozenRows(1);
  _estilizarHeader(aba.getRange(1, 1, 1, headers.length));

  aba.setColumnWidth(1, 100);
  aba.setColumnWidth(2, 200);

  const tipoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Entrada', 'Saida'], true)
    .setAllowInvalid(false)
    .build();
  aba.getRange('A2:A').setDataValidation(tipoRule);

  const iniciais = [
    ['Entrada', 'Rifa'],
    ['Entrada', 'Festa'],
    ['Entrada', 'Caixinha'],
    ['Entrada', 'Outro'],
    ['Saida', 'Buffet'],
    ['Saida', 'Decoração'],
    ['Saida', 'Fotógrafo'],
    ['Saida', 'Bebidas'],
    ['Saida', 'Outro']
  ];
  aba.getRange(2, 1, iniciais.length, 2).setValues(iniciais);

  return aba;
}

function _removerAbasPadrao(ss) {
  ['Página1', 'Sheet1', 'Folha1'].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba && ss.getSheets().length > 1) {
      try { ss.deleteSheet(aba); } catch (e) { /* sem direitos? ignora */ }
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

  const avisos = ss.getSheetByName(ABAS.AVISOS);
  const av = [
    ['2026-03-08', 'Festa dia 15!',     'Vendas de ingresso até dia 12 com qualquer organizador.', 'SIM'],
    ['2026-03-01', 'Meta atualizada',   'Subimos a meta após orçamento do buffet.',                'NAO']
  ];
  avisos.getRange(2, 1, av.length, av[0].length).setValues(av);
}

/* =====================================================================
 *  Estilo
 * ===================================================================== */

function _estilizarHeader(range) {
  range.setBackground('#14508C')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('left');
}

/* =====================================================================
 *  Senha admin (armazenada em ScriptProperties — privado ao script)
 * ===================================================================== */

function _ensureSenhaAdmin() {
  const props = PropertiesService.getScriptProperties();
  let senha = props.getProperty('ADMIN_PASSWORD');
  if (!senha) {
    senha = _gerarSenhaAleatoria();
    props.setProperty('ADMIN_PASSWORD', senha);
  }
  return senha;
}

function _gerarSenhaAleatoria() {
  // 10 caracteres alfanuméricos legíveis (sem 0/O/1/l pra evitar confusão)
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) {
    s += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  return s;
}
