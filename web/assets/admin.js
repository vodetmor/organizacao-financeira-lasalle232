/**
 * Caixa 232 — Admin
 */
(function () {
  'use strict';

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const hoje = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const SESSION_KEY = 'caixa232_admin_token';
  let token = sessionStorage.getItem(SESSION_KEY) || null;
  let snapshot = null;

  function toast(msg, tipo) {
    const t = $('#toast');
    const icone = tipo === 'sucesso'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : tipo === 'erro'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>'
        : '';
    t.innerHTML = icone + '<span>' + escapeHtml(msg) + '</span>';
    t.className = 'toast toast--show' + (tipo ? ' toast--' + tipo : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ━━━━━━━━━━━━ Auth ━━━━━━━━━━━━ */
  async function login() {
    const senha = $('#login-senha').value;
    const btn = $('#btn-login');
    const erroEl = $('#login-erro');
    btn.disabled = true; btn.textContent = 'entrando…';
    erroEl.style.display = 'none';
    try {
      const r = await API.post('login', { senha });
      if (r.ok) {
        token = r.token;
        sessionStorage.setItem(SESSION_KEY, token);
        $('#login-modal').classList.remove('modal-bg--show');
        $('#admin-area').style.display = '';
        await carregarSnapshot();
      } else {
        erroEl.textContent = r.erro || 'Falha ao entrar';
        erroEl.style.display = '';
        $('#login-senha').classList.add('input--erro');
      }
    } catch (err) {
      erroEl.textContent = 'Erro: ' + err.message;
      erroEl.style.display = '';
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  }

  function logout() {
    if (token) API.post('logout', { token }).catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    token = null;
    window.location.href = '/';
  }

  async function carregarSnapshot() {
    try {
      const r = await API.post('snapshot', { token });
      if (r.ok) {
        snapshot = r.data;
        renderTudo();
      } else if (r.erro && r.erro.indexOf('Sess') === 0) {
        sessionStorage.removeItem(SESSION_KEY);
        token = null;
        toast('Sessão expirada. Faça login.', 'erro');
        $('#login-modal').classList.add('modal-bg--show');
        $('#admin-area').style.display = 'none';
      } else {
        toast(r.erro || 'Falha ao carregar', 'erro');
      }
    } catch (err) {
      toast('Erro: ' + err.message, 'erro');
    }
  }

  /* ━━━━━━━━━━━━ Render ━━━━━━━━━━━━ */
  function renderTudo() {
    if (!snapshot) return;
    renderConfig();
    renderCategoriasSelect();
    renderOrcamento();
    renderLancamentos();
    renderAvisos();
    renderCategoriasList();
  }

  function renderConfig() {
    const cfg = snapshot.config || {};
    $('#cfg-meta').value = cfg.meta || '';
    $('#cfg-nome').value = cfg.nome_turma || '';
    $('#cfg-data').value = cfg.data_formatura || '';
  }

  function renderCategoriasSelect() {
    const cats = snapshot.categorias || { entrada: [], saida: [] };
    const tipo = $('#l-tipo').value;
    const lista = tipo === 'Entrada' ? cats.entrada : cats.saida;
    const sel = $('#l-categoria');
    sel.innerHTML = lista.length === 0
      ? '<option value="">— nenhuma —</option>'
      : lista.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');

    // Categorias de Saida pro form de orçamento
    const selOrc = $('#orc-cat-form');
    if (selOrc) {
      const all = cats.saida.concat(cats.entrada).filter((v, i, a) => a.indexOf(v) === i);
      selOrc.innerHTML = all.length === 0
        ? '<option value="">— nenhuma —</option>'
        : all.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
    }
  }

  function renderOrcamento() {
    const orc = snapshot.orcamento || { itens: [] };
    const box = $('#orc-list');
    $('#orc-count').textContent = orc.itens.length + ' itens';
    if (orc.itens.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum item orçado ainda.</p>';
      return;
    }
    box.innerHTML = orc.itens.map(it => (
      '<div class="item-row" data-linha="' + it.linha + '">' +
        '<div class="item-row__info">' +
          '<div class="item-row__title">' + escapeHtml(it.item) +
            ' <span class="tag">' + escapeHtml(it.categoria) + '</span>' +
          '</div>' +
          '<div class="item-row__meta">' +
            '<span>Planejado: <strong>' + fmtBRL(it.planejado) + '</strong></span>' +
            '<span>Pago: <strong style="color:var(--verde-700)">' + fmtBRL(it.pago) + '</strong></span>' +
            '<span>Falta: <strong>' + fmtBRL(it.restante) + '</strong></span>' +
            '<span>(' + Math.round(it.progresso) + '%)</span>' +
            (it.observacao ? '<span style="color:var(--ink-400)">· ' + escapeHtml(it.observacao) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="item-row__actions">' +
          '<button class="btn btn--ghost btn--sm" data-act="edit-orc" data-linha="' + it.linha + '">editar</button>' +
          '<button class="btn btn--danger btn--sm" data-act="del-orc" data-linha="' + it.linha + '">apagar</button>' +
        '</div>' +
      '</div>'
    )).join('');
  }

  function renderLancamentos() {
    const lancs = (snapshot.lancamentos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#lanc-count').textContent = lancs.length + ' total';
    const box = $('#lanc-list');
    if (lancs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum lançamento ainda.</p>';
      return;
    }
    box.innerHTML = lancs.map(l => {
      const tagCls = l.tipo === 'Entrada' ? 'tag--entrada' : 'tag--saida';
      const sinal = l.tipo === 'Entrada' ? '+' : '−';
      const cor = l.tipo === 'Entrada' ? 'var(--verde-700)' : 'var(--vermelho-500)';
      return (
        '<div class="item-row" data-linha="' + l.linha + '">' +
          '<div class="item-row__info">' +
            '<div class="item-row__title">' + escapeHtml(l.descricao || '—') + '</div>' +
            '<div class="item-row__meta">' +
              '<span>' + escapeHtml(l.data) + '</span>' +
              '<span class="tag ' + tagCls + '">' + escapeHtml(l.tipo) + '</span>' +
              '<span>' + escapeHtml(l.categoria) + '</span>' +
              '<span style="color:' + cor + ';font-weight:700">' + sinal + ' ' + fmtBRL(l.valor) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="item-row__actions">' +
            '<button class="btn btn--ghost btn--sm" data-act="edit-lanc" data-linha="' + l.linha + '">editar</button>' +
            '<button class="btn btn--danger btn--sm" data-act="del-lanc" data-linha="' + l.linha + '">apagar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderAvisos() {
    const avs = snapshot.avisos || [];
    $('#aviso-count').textContent = avs.length + ' total';
    const box = $('#aviso-list');
    if (avs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum aviso ainda.</p>';
      return;
    }
    box.innerHTML = avs.map(a => (
      '<div class="item-row" data-linha="' + a.linha + '">' +
        '<div class="item-row__info">' +
          '<div class="item-row__title">' + escapeHtml(a.titulo) +
            (a.fixado ? ' <span class="tag tag--fixado">📌 fixado</span>' : '') +
          '</div>' +
          '<div class="item-row__meta">' +
            '<span>' + escapeHtml(a.data) + '</span>' +
            '<span style="color:var(--ink-500)">' + escapeHtml((a.mensagem || '').substring(0, 80)) + (a.mensagem.length > 80 ? '…' : '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="item-row__actions">' +
          '<button class="btn btn--ghost btn--sm" data-act="edit-aviso" data-linha="' + a.linha + '">editar</button>' +
          '<button class="btn btn--danger btn--sm" data-act="del-aviso" data-linha="' + a.linha + '">apagar</button>' +
        '</div>' +
      '</div>'
    )).join('');
  }

  function renderCategoriasList() {
    const cats = snapshot.categorias || { entrada: [], saida: [] };
    const box = $('#cat-list');
    const entradas = cats.entrada.map(c => ({ tipo: 'Entrada', cat: c }));
    const saidas   = cats.saida.map(c =>   ({ tipo: 'Saida',   cat: c }));
    const all = entradas.concat(saidas);
    if (all.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhuma categoria.</p>';
      return;
    }
    box.innerHTML = all.map(c => (
      '<div class="item-row">' +
        '<div class="item-row__info">' +
          '<div class="item-row__title">' + escapeHtml(c.cat) + '</div>' +
          '<div class="item-row__meta">' +
            '<span class="tag ' + (c.tipo === 'Entrada' ? 'tag--entrada' : 'tag--saida') + '">' + escapeHtml(c.tipo) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="item-row__actions">' +
          '<button class="btn btn--danger btn--sm" data-act="del-cat" data-tipo="' + escapeHtml(c.tipo) + '" data-nome="' + escapeHtml(c.cat) + '">apagar</button>' +
        '</div>' +
      '</div>'
    )).join('');
  }

  /* ━━━━━━━━━━━━ Handlers ━━━━━━━━━━━━ */
  async function callAndReload(action, body, msgOk) {
    try {
      const r = await API.post(action, Object.assign({ token }, body));
      if (r.ok) { toast(msgOk, 'sucesso'); await carregarSnapshot(); return true; }
      toast(r.erro || 'Erro', 'erro'); return false;
    } catch (err) {
      toast('Erro: ' + err.message, 'erro'); return false;
    }
  }

  function bindHandlers() {
    $('#btn-login').addEventListener('click', login);
    $('#login-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    $('#btn-logout').addEventListener('click', logout);

    // Config
    $('#btn-cfg-salvar').addEventListener('click', async () => {
      const updates = [
        ['meta',           parseFloat($('#cfg-meta').value) || 0],
        ['nome_turma',     $('#cfg-nome').value],
        ['data_formatura', $('#cfg-data').value]
      ];
      const btn = $('#btn-cfg-salvar');
      btn.disabled = true; btn.textContent = 'salvando…';
      let allOk = true;
      for (const [k, v] of updates) {
        try {
          const r = await API.post('setConfig', { token, chave: k, valor: v });
          if (!r.ok) { allOk = false; toast(r.erro || 'Erro em ' + k, 'erro'); }
        } catch (err) { allOk = false; toast('Erro: ' + err.message, 'erro'); }
      }
      btn.disabled = false; btn.textContent = 'Salvar configuração';
      if (allOk) toast('Configuração salva', 'sucesso');
      await carregarSnapshot();
    });

    // Lançamento
    $('#l-tipo').addEventListener('change', renderCategoriasSelect);
    $('#btn-lanc-add').addEventListener('click', async () => {
      const lanc = {
        data:      $('#l-data').value || hoje(),
        tipo:      $('#l-tipo').value,
        categoria: $('#l-categoria').value,
        descricao: $('#l-desc').value,
        valor:     parseFloat($('#l-valor').value)
      };
      if (!lanc.categoria) return toast('Escolha uma categoria', 'erro');
      if (!lanc.valor || lanc.valor <= 0) return toast('Valor inválido', 'erro');
      const btn = $('#btn-lanc-add');
      btn.disabled = true;
      const ok = await callAndReload('addLanc', { lanc }, 'Lançamento adicionado');
      btn.disabled = false;
      if (ok) { $('#l-desc').value = ''; $('#l-valor').value = ''; }
    });

    // Aviso
    $('#btn-aviso-add').addEventListener('click', async () => {
      const av = {
        data:     $('#a-data').value || hoje(),
        titulo:   $('#a-titulo').value.trim(),
        mensagem: $('#a-msg').value.trim(),
        fixado:   $('#a-fixado').checked
      };
      if (!av.titulo) return toast('Título obrigatório', 'erro');
      const btn = $('#btn-aviso-add');
      btn.disabled = true;
      const ok = await callAndReload('addAviso', { aviso: av }, 'Aviso publicado');
      btn.disabled = false;
      if (ok) { $('#a-titulo').value = ''; $('#a-msg').value = ''; $('#a-fixado').checked = false; }
    });

    // Categoria
    $('#btn-cat-add').addEventListener('click', async () => {
      const tipo = $('#c-tipo').value;
      const cat = $('#c-nome').value.trim();
      if (!cat) return toast('Nome obrigatório', 'erro');
      const btn = $('#btn-cat-add');
      btn.disabled = true;
      const ok = await callAndReload('addCat', { tipo, categoria: cat }, 'Categoria adicionada');
      btn.disabled = false;
      if (ok) $('#c-nome').value = '';
    });

    // Orçamento
    $('#btn-orc-add').addEventListener('click', async () => {
      const item = {
        item:       $('#orc-nome-form').value.trim(),
        categoria:  $('#orc-cat-form').value,
        planejado:  parseFloat($('#orc-valor-form').value),
        observacao: $('#orc-obs-form').value.trim()
      };
      if (!item.item) return toast('Nome obrigatório', 'erro');
      if (!item.categoria) return toast('Escolha uma categoria', 'erro');
      if (isNaN(item.planejado) || item.planejado < 0) return toast('Valor planejado inválido', 'erro');
      const btn = $('#btn-orc-add');
      btn.disabled = true;
      const ok = await callAndReload('addOrc', { item }, 'Item adicionado ao orçamento');
      btn.disabled = false;
      if (ok) { $('#orc-nome-form').value = ''; $('#orc-valor-form').value = ''; $('#orc-obs-form').value = ''; }
    });

    // Trocar senha
    $('#btn-trocar-senha').addEventListener('click', async () => {
      const atual = $('#s-atual').value;
      const nova  = $('#s-nova').value;
      if (!nova || nova.length < 6) return toast('Nova senha precisa de 6+ caracteres', 'erro');
      const btn = $('#btn-trocar-senha');
      btn.disabled = true; btn.textContent = 'trocando…';
      try {
        const r = await API.post('trocarSenha', { token, senhaAtual: atual, senhaNova: nova });
        if (r.ok) { $('#s-atual').value = ''; $('#s-nova').value = ''; toast('Senha trocada', 'sucesso'); }
        else toast(r.erro || 'Erro', 'erro');
      } catch (err) { toast('Erro: ' + err.message, 'erro'); }
      btn.disabled = false; btn.textContent = 'Trocar';
    });

    // Delete / edit delegation
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const linha = parseInt(btn.dataset.linha, 10);

      if (act === 'del-lanc') {
        if (!confirm('Apagar este lançamento?')) return;
        await callAndReload('delLanc', { linha }, 'Lançamento apagado');
      } else if (act === 'edit-lanc') {
        editarLancamento(linha);
      } else if (act === 'del-aviso') {
        if (!confirm('Apagar este aviso?')) return;
        await callAndReload('delAviso', { linha }, 'Aviso apagado');
      } else if (act === 'edit-aviso') {
        editarAviso(linha);
      } else if (act === 'del-orc') {
        if (!confirm('Apagar este item do orçamento?')) return;
        await callAndReload('delOrc', { linha }, 'Item apagado');
      } else if (act === 'edit-orc') {
        editarOrcamento(linha);
      } else if (act === 'del-cat') {
        const tipo = btn.dataset.tipo;
        const nome = btn.dataset.nome;
        if (!confirm('Apagar a categoria "' + nome + '"?')) return;
        await callAndReload('delCat', { tipo, categoria: nome }, 'Categoria apagada');
      }
    });
  }

  async function editarLancamento(linha) {
    const l = snapshot.lancamentos.find(x => x.linha === linha);
    if (!l) return;
    const novaDesc = prompt('Descrição:', l.descricao || '');
    if (novaDesc === null) return;
    const novoValor = prompt('Valor (R$):', l.valor);
    if (novoValor === null) return;
    const valNum = parseFloat(String(novoValor).replace(',', '.'));
    if (isNaN(valNum) || valNum <= 0) return toast('Valor inválido', 'erro');
    await callAndReload('editLanc', {
      linha,
      lanc: { data: l.data, tipo: l.tipo, categoria: l.categoria, descricao: novaDesc, valor: valNum }
    }, 'Editado');
  }

  async function editarAviso(linha) {
    const a = snapshot.avisos.find(x => x.linha === linha);
    if (!a) return;
    const novoTit = prompt('Título:', a.titulo);
    if (novoTit === null) return;
    const novaMsg = prompt('Mensagem:', a.mensagem);
    if (novaMsg === null) return;
    await callAndReload('editAviso', {
      linha,
      aviso: { data: a.data, titulo: novoTit, mensagem: novaMsg, fixado: a.fixado }
    }, 'Aviso editado');
  }

  async function editarOrcamento(linha) {
    const it = snapshot.orcamento.itens.find(x => x.linha === linha);
    if (!it) return;
    const novoNome = prompt('Item:', it.item);
    if (novoNome === null) return;
    const novoValor = prompt('Valor planejado (R$):', it.planejado);
    if (novoValor === null) return;
    const valNum = parseFloat(String(novoValor).replace(',', '.'));
    if (isNaN(valNum) || valNum < 0) return toast('Valor inválido', 'erro');
    const novaObs = prompt('Observação:', it.observacao);
    if (novaObs === null) return;
    await callAndReload('editOrc', {
      linha,
      item: { item: novoNome, categoria: it.categoria, planejado: valNum, observacao: novaObs }
    }, 'Item editado');
  }

  // Boot
  async function boot() {
    bindHandlers();
    if (token) {
      $('#login-modal').classList.remove('modal-bg--show');
      $('#admin-area').style.display = '';
      await carregarSnapshot();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
