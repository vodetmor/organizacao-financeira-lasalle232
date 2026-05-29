/**
 * Caixa 232 — Admin (com multi-adição + multi-exclusão + senha persistente)
 */
(function () {
  'use strict';

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const hoje = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const TOKEN_KEY = 'caixa232_admin_token';
  const SENHA_KEY = 'caixa232_admin_senha';
  let token = sessionStorage.getItem(TOKEN_KEY) || null;
  let snapshot = null;

  // Multi-seleção: id por tipo. Cat usa "tipo|nome".
  const selecao = { lanc: new Set(), aviso: new Set(), orc: new Set(), cat: new Set() };
  const LABELS = {
    lanc:  { sing: 'lançamento', plur: 'lançamentos', gen: 'm' },
    aviso: { sing: 'aviso',      plur: 'avisos',      gen: 'm' },
    orc:   { sing: 'item',       plur: 'itens',       gen: 'm' },
    cat:   { sing: 'categoria',  plur: 'categorias',  gen: 'f' }
  };

  /* ━━━━━━━━━━━━ Toast ━━━━━━━━━━━━ */
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

  /* ━━━━━━━━━━━━ Modal de confirmação ━━━━━━━━━━━━ */
  function confirmAcao({ titulo, mensagem, nome, meta, okTxt, onConfirm }) {
    const modal = $('#confirm-modal');
    $('#confirm-title').textContent = titulo || 'Confirmar?';
    $('#confirm-msg').textContent = mensagem || '';
    $('#confirm-target-name').textContent = nome || '—';
    $('#confirm-target-meta').textContent = meta || '';
    $('#confirm-target-meta').style.display = meta ? '' : 'none';
    $('#confirm-ok-txt').textContent = okTxt || 'Apagar';
    const btnOk = $('#confirm-ok');
    const btnCancel = $('#confirm-cancel');

    function cleanup() {
      modal.classList.remove('modal-bg--show');
      btnOk.disabled = false;
      $('#confirm-ok-txt').textContent = okTxt || 'Apagar';
      btnOk.onclick = null;
      btnCancel.onclick = null;
      document.removeEventListener('keydown', escClose);
    }
    const escClose = (e) => { if (e.key === 'Escape') cleanup(); };
    document.addEventListener('keydown', escClose);
    btnCancel.onclick = cleanup;
    btnOk.onclick = async () => {
      btnOk.disabled = true;
      $('#confirm-ok-txt').textContent = (okTxt || 'Apagar').replace(/^Apagar/, 'apagando') + '…';
      try { await onConfirm(); } finally { cleanup(); }
    };
    modal.classList.add('modal-bg--show');
  }

  /* ━━━━━━━━━━━━ Auth ━━━━━━━━━━━━ */
  async function fazerLogin(senha, lembrar) {
    const r = await API.post('login', { senha });
    if (!r.ok) return { ok: false, erro: r.erro || 'Falha ao entrar' };
    token = r.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    if (lembrar) localStorage.setItem(SENHA_KEY, senha);
    return { ok: true };
  }

  async function login() {
    const senha = $('#login-senha').value;
    const lembrar = $('#login-lembrar').checked;
    const btn = $('#btn-login');
    const erroEl = $('#login-erro');
    btn.disabled = true; btn.textContent = 'entrando…';
    erroEl.style.display = 'none';
    try {
      const r = await fazerLogin(senha, lembrar);
      if (r.ok) {
        $('#login-modal').classList.remove('modal-bg--show');
        $('#admin-area').style.display = '';
        await carregarSnapshot();
      } else {
        erroEl.textContent = r.erro;
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
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SENHA_KEY);
    token = null;
    window.location.href = '/';
  }

  async function tentarAutoLogin() {
    const senha = localStorage.getItem(SENHA_KEY);
    if (!senha) return false;
    try { return (await fazerLogin(senha, true)).ok; } catch (e) { return false; }
  }

  async function carregarSnapshot() {
    try {
      const r = await API.post('snapshot', { token });
      if (r.ok) {
        snapshot = r.data;
        renderTudo();
      } else if (r.erro && r.erro.indexOf('Sess') === 0) {
        sessionStorage.removeItem(TOKEN_KEY);
        token = null;
        const reloggedIn = await tentarAutoLogin();
        if (reloggedIn) { await carregarSnapshot(); return; }
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

  /* ━━━━━━━━━━━━ Bulk selection helpers ━━━━━━━━━━━━ */
  function updateBulkBar(tipo) {
    const bar = $('#bulk-bar-' + tipo);
    if (!bar) return;
    const count = selecao[tipo].size;
    bar.classList.toggle('bulk-bar--show', count > 0);
    if (count === 0) return;
    const L = LABELS[tipo];
    const palavra = count === 1 ? L.sing : L.plur;
    const sufixo = L.gen === 'f' ? 'a' : 'o';
    $('#bulk-count-' + tipo).textContent = count + ' ' + palavra + ' selecionad' + sufixo + (count === 1 ? '' : 's');
    $('#bulk-del-' + tipo + '-txt').textContent = 'Apagar ' + count;
  }

  function clearSelecao(tipo) {
    selecao[tipo].clear();
    $$('input[data-bulk-check="' + tipo + '"]').forEach(cb => { cb.checked = false; });
    $$('.item-row[data-' + tipo + '-id]').forEach(r => r.classList.remove('item-row--selected'));
    updateBulkBar(tipo);
  }

  function bulkDelete(tipo) {
    const ids = Array.from(selecao[tipo]);
    if (ids.length === 0) return;
    const items = pegarItensSelecionados(tipo, ids);
    const nomes = items.slice(0, 3).map(i => i.label).join(' · ');
    const sufixoMais = items.length > 3 ? ' · e mais ' + (items.length - 3) : '';
    const L = LABELS[tipo];
    const palavra = ids.length === 1 ? L.sing : L.plur;

    confirmAcao({
      titulo: 'Apagar ' + ids.length + ' ' + palavra + '?',
      mensagem: 'As linhas saem da planilha de uma vez. Ação não pode ser desfeita pela UI.',
      nome: nomes + sufixoMais,
      meta: '',
      okTxt: 'Apagar ' + ids.length,
      onConfirm: async () => {
        const actionMap = { lanc: 'delLanc', aviso: 'delAviso', orc: 'delOrc' };
        let okCount = 0, errCount = 0, lastErr = '';

        if (tipo === 'cat') {
          // Cat usa tipo|nome
          for (const id of ids) {
            const [t, n] = id.split('|');
            try {
              const r = await API.post('delCat', { token, tipo: t, categoria: n });
              if (r.ok) okCount++; else { errCount++; lastErr = r.erro || ''; }
            } catch (e) { errCount++; lastErr = e.message; }
          }
        } else {
          for (const id of ids) {
            try {
              const r = await API.post(actionMap[tipo], { token, linha: parseInt(id, 10) });
              if (r.ok) okCount++; else { errCount++; lastErr = r.erro || ''; }
            } catch (e) { errCount++; lastErr = e.message; }
          }
        }

        selecao[tipo].clear();
        if (errCount === 0) {
          toast(okCount + ' ' + (okCount === 1 ? L.sing : L.plur) + ' apagado(s)', 'sucesso');
        } else {
          toast(okCount + ' de ' + ids.length + ' apagados. Erro: ' + lastErr, 'erro');
        }
        await carregarSnapshot();
      }
    });
  }

  function pegarItensSelecionados(tipo, ids) {
    if (tipo === 'lanc') {
      return ids.map(id => {
        const l = snapshot.lancamentos.find(x => x.linha === parseInt(id, 10));
        return l ? { label: (l.descricao || '(sem descrição)') + ' · ' + fmtBRL(l.valor) } : { label: '—' };
      });
    }
    if (tipo === 'aviso') {
      return ids.map(id => {
        const a = snapshot.avisos.find(x => x.linha === parseInt(id, 10));
        return a ? { label: a.titulo } : { label: '—' };
      });
    }
    if (tipo === 'orc') {
      return ids.map(id => {
        const it = snapshot.orcamento.itens.find(x => x.linha === parseInt(id, 10));
        return it ? { label: it.item + ' · ' + fmtBRL(it.planejado) } : { label: '—' };
      });
    }
    if (tipo === 'cat') {
      return ids.map(id => {
        const [t, n] = id.split('|');
        return { label: n + ' (' + t + ')' };
      });
    }
    return [];
  }

  /* ━━━━━━━━━━━━ Render principal ━━━━━━━━━━━━ */
  function renderTudo() {
    if (!snapshot) return;
    renderConfig();
    renderLancamentos();
    renderAvisos();
    renderOrcamento();
    renderCategoriasList();
    // garante 1 linha vazia em cada form bulk
    if ($('#lanc-bulk-form').children.length === 0) novaLancRow();
    else atualizarCategoriasNasLinhas('lanc');
    if ($('#orc-bulk-form').children.length === 0) novaOrcRow();
    else atualizarCategoriasNasLinhas('orc');
  }

  function renderConfig() {
    const cfg = snapshot.config || {};
    $('#cfg-meta').value = cfg.meta || '';
    $('#cfg-nome').value = cfg.nome_turma || '';
    $('#cfg-data').value = cfg.data_formatura || '';
  }

  function renderLancamentos() {
    const lancs = (snapshot.lancamentos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#lanc-count').textContent = lancs.length + ' total';
    const box = $('#lanc-list');
    if (lancs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum lançamento ainda.</p>';
      updateBulkBar('lanc');
      return;
    }
    box.innerHTML = lancs.map(l => {
      const tagCls = l.tipo === 'Entrada' ? 'tag--entrada' : 'tag--saida';
      const sinal = l.tipo === 'Entrada' ? '+' : '−';
      const cor = l.tipo === 'Entrada' ? 'var(--verde-700)' : 'var(--vermelho-500)';
      const isSel = selecao.lanc.has(String(l.linha));
      return (
        '<div class="item-row has-select' + (isSel ? ' item-row--selected' : '') + '" data-lanc-id="' + l.linha + '">' +
          '<div class="item-row__check"><input type="checkbox" data-bulk-check="lanc" data-id="' + l.linha + '"' + (isSel ? ' checked' : '') + '></div>' +
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
    updateBulkBar('lanc');
  }

  function renderAvisos() {
    const avs = snapshot.avisos || [];
    $('#aviso-count').textContent = avs.length + ' total';
    const box = $('#aviso-list');
    if (avs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum aviso ainda.</p>';
      updateBulkBar('aviso');
      return;
    }
    box.innerHTML = avs.map(a => {
      const isSel = selecao.aviso.has(String(a.linha));
      return (
        '<div class="item-row has-select' + (isSel ? ' item-row--selected' : '') + '" data-aviso-id="' + a.linha + '">' +
          '<div class="item-row__check"><input type="checkbox" data-bulk-check="aviso" data-id="' + a.linha + '"' + (isSel ? ' checked' : '') + '></div>' +
          '<div class="item-row__info">' +
            '<div class="item-row__title">' + escapeHtml(a.titulo) +
              (a.fixado ? ' <span class="tag tag--fixado">📌 fixado</span>' : '') + '</div>' +
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
      );
    }).join('');
    updateBulkBar('aviso');
  }

  function renderOrcamento() {
    const orc = snapshot.orcamento || { itens: [] };
    $('#orc-count').textContent = orc.itens.length + ' itens';
    const box = $('#orc-list');
    if (orc.itens.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhum item orçado ainda.</p>';
      updateBulkBar('orc');
      return;
    }
    box.innerHTML = orc.itens.map(it => {
      const isSel = selecao.orc.has(String(it.linha));
      const prazoColor = it.status === 'atrasado' ? 'var(--vermelho-500)'
                       : it.status === 'apertando' ? 'var(--ambar-700)'
                       : 'var(--ink-600)';
      return (
        '<div class="item-row has-select' + (isSel ? ' item-row--selected' : '') + '" data-orc-id="' + it.linha + '">' +
          '<div class="item-row__check"><input type="checkbox" data-bulk-check="orc" data-id="' + it.linha + '"' + (isSel ? ' checked' : '') + '></div>' +
          '<div class="item-row__info">' +
            '<div class="item-row__title">' + escapeHtml(it.item) +
              ' <span class="tag">' + escapeHtml(it.categoria) + '</span>' + '</div>' +
            '<div class="item-row__meta">' +
              '<span>Planejado: <strong>' + fmtBRL(it.planejado) + '</strong></span>' +
              '<span>Pago: <strong style="color:var(--verde-700)">' + fmtBRL(it.pago) + '</strong></span>' +
              '<span>Falta: <strong>' + fmtBRL(it.restante) + '</strong></span>' +
              '<span>(' + Math.round(it.progresso) + '%)</span>' +
              (it.prazo ? '<span style="color:' + prazoColor + '">📅 ' + escapeHtml(it.prazo) + '</span>' : '') +
              (it.observacao ? '<span style="color:var(--ink-400)">· ' + escapeHtml(it.observacao) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="item-row__actions">' +
            '<button class="btn btn--ghost btn--sm" data-act="edit-orc" data-linha="' + it.linha + '">editar</button>' +
            '<button class="btn btn--danger btn--sm" data-act="del-orc" data-linha="' + it.linha + '">apagar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    updateBulkBar('orc');
  }

  function renderCategoriasList() {
    const cats = snapshot.categorias || { entrada: [], saida: [] };
    const box = $('#cat-list');
    const entradas = cats.entrada.map(c => ({ tipo: 'Entrada', cat: c }));
    const saidas   = cats.saida.map(c =>   ({ tipo: 'Saida',   cat: c }));
    const all = entradas.concat(saidas);
    if (all.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">Nenhuma categoria.</p>';
      updateBulkBar('cat');
      return;
    }
    box.innerHTML = all.map(c => {
      const id = c.tipo + '|' + c.cat;
      const isSel = selecao.cat.has(id);
      return (
        '<div class="item-row has-select' + (isSel ? ' item-row--selected' : '') + '" data-cat-id="' + escapeHtml(id) + '">' +
          '<div class="item-row__check"><input type="checkbox" data-bulk-check="cat" data-id="' + escapeHtml(id) + '"' + (isSel ? ' checked' : '') + '></div>' +
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
      );
    }).join('');
    updateBulkBar('cat');
  }

  /* ━━━━━━━━━━━━ Multi-row forms (Lanc + Orc) ━━━━━━━━━━━━ */
  function novaLancRow() {
    const tpl = $('#lanc-row-template');
    const frag = tpl.content.cloneNode(true);
    const row = frag.querySelector('.bulk-form__row');
    row.querySelector('[data-field="data"]').value = hoje();
    $('#lanc-bulk-form').appendChild(row);
    popularCategoriasNaLinha(row, 'lanc');
    row.querySelector('[data-field="tipo"]').addEventListener('change', () => popularCategoriasNaLinha(row, 'lanc'));
    atualizarRemoveButtons('lanc');
    atualizarBtnSalvarTxt('lanc');
  }
  function novaOrcRow() {
    const tpl = $('#orc-row-template');
    const frag = tpl.content.cloneNode(true);
    const row = frag.querySelector('.bulk-form__row');
    $('#orc-bulk-form').appendChild(row);
    popularCategoriasNaLinha(row, 'orc');
    atualizarRemoveButtons('orc');
    atualizarBtnSalvarTxt('orc');
  }
  function popularCategoriasNaLinha(row, tipo) {
    const cats = (snapshot && snapshot.categorias) || { entrada: [], saida: [] };
    const sel = row.querySelector('[data-field="categoria"]');
    if (!sel) return;
    const valorAtual = sel.value;
    let lista;
    if (tipo === 'lanc') {
      const t = row.querySelector('[data-field="tipo"]').value;
      lista = t === 'Entrada' ? cats.entrada : cats.saida;
    } else {
      lista = cats.saida.concat(cats.entrada).filter((v, i, a) => a.indexOf(v) === i);
    }
    sel.innerHTML = lista.length === 0
      ? '<option value="">— nenhuma —</option>'
      : lista.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
    if (lista.indexOf(valorAtual) !== -1) sel.value = valorAtual;
  }
  function atualizarCategoriasNasLinhas(tipo) {
    $$('#' + tipo + '-bulk-form .bulk-form__row').forEach(r => popularCategoriasNaLinha(r, tipo));
  }
  function atualizarRemoveButtons(tipo) {
    const rows = $$('#' + tipo + '-bulk-form .bulk-form__row');
    rows.forEach(r => {
      const btn = r.querySelector('button[data-act^="remove"]');
      if (btn) btn.disabled = rows.length === 1;
    });
  }
  function atualizarBtnSalvarTxt(tipo) {
    const n = $$('#' + tipo + '-bulk-form .bulk-form__row').length;
    const palavra = tipo === 'lanc' ? 'lançamento' : 'item';
    const sufixo = n > 1 ? 's' : '';
    $('#btn-' + tipo + '-add-txt').textContent = 'Salvar ' + (n > 1 ? n + ' ' : '') + palavra + sufixo;
  }
  function resetForm(tipo) {
    $('#' + tipo + '-bulk-form').innerHTML = '';
    if (tipo === 'lanc') novaLancRow(); else novaOrcRow();
  }

  /* ━━━━━━━━━━━━ Salvar lote ━━━━━━━━━━━━ */
  async function salvarLancamentos() {
    const rows = $$('#lanc-bulk-form .bulk-form__row');
    const lancs = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const l = {
        data:      row.querySelector('[data-field="data"]').value || hoje(),
        tipo:      row.querySelector('[data-field="tipo"]').value,
        categoria: row.querySelector('[data-field="categoria"]').value,
        descricao: row.querySelector('[data-field="descricao"]').value,
        valor:     parseFloat(row.querySelector('[data-field="valor"]').value)
      };
      if (!l.categoria) return toast('Linha ' + (i + 1) + ': escolha uma categoria', 'erro');
      if (!l.valor || l.valor <= 0) return toast('Linha ' + (i + 1) + ': valor inválido', 'erro');
      lancs.push(l);
    }
    const btn = $('#btn-lanc-add');
    btn.disabled = true;
    $('#btn-lanc-add-txt').textContent = 'salvando ' + lancs.length + '…';
    try {
      const results = await Promise.all(lancs.map(l => API.post('addLanc', { token, lanc: l })));
      const ok = results.filter(r => r.ok).length;
      if (ok === lancs.length) {
        toast(ok + ' lançamento' + (ok > 1 ? 's' : '') + ' adicionado' + (ok > 1 ? 's' : ''), 'sucesso');
        resetForm('lanc');
      } else {
        const err = results.find(r => !r.ok);
        toast(ok + ' de ' + lancs.length + ' salvos. ' + (err && err.erro || ''), 'erro');
      }
      await carregarSnapshot();
    } finally {
      btn.disabled = false;
      atualizarBtnSalvarTxt('lanc');
    }
  }

  async function salvarOrcamentos() {
    const rows = $$('#orc-bulk-form .bulk-form__row');
    const itens = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const it = {
        item:       row.querySelector('[data-field="item"]').value.trim(),
        categoria:  row.querySelector('[data-field="categoria"]').value,
        planejado:  parseFloat(row.querySelector('[data-field="planejado"]').value),
        prazo:      row.querySelector('[data-field="prazo"]').value,
        observacao: row.querySelector('[data-field="observacao"]').value.trim()
      };
      if (!it.item) return toast('Linha ' + (i + 1) + ': nome obrigatório', 'erro');
      if (!it.categoria) return toast('Linha ' + (i + 1) + ': escolha categoria', 'erro');
      if (isNaN(it.planejado) || it.planejado < 0) return toast('Linha ' + (i + 1) + ': valor inválido', 'erro');
      itens.push(it);
    }
    const btn = $('#btn-orc-add');
    btn.disabled = true;
    $('#btn-orc-add-txt').textContent = 'salvando ' + itens.length + '…';
    try {
      const results = await Promise.all(itens.map(item => API.post('addOrc', { token, item })));
      const ok = results.filter(r => r.ok).length;
      if (ok === itens.length) {
        toast(ok + (ok > 1 ? ' itens adicionados' : ' item adicionado') + ' ao orçamento', 'sucesso');
        resetForm('orc');
      } else {
        const err = results.find(r => !r.ok);
        toast(ok + ' de ' + itens.length + ' salvos. ' + (err && err.erro || ''), 'erro');
      }
      await carregarSnapshot();
    } finally {
      btn.disabled = false;
      atualizarBtnSalvarTxt('orc');
    }
  }

  /* ━━━━━━━━━━━━ Single delete + edit ━━━━━━━━━━━━ */
  async function callAndReload(action, body, msgOk) {
    try {
      const r = await API.post(action, Object.assign({ token }, body));
      if (r.ok) { toast(msgOk, 'sucesso'); await carregarSnapshot(); return true; }
      toast(r.erro || 'Erro', 'erro'); return false;
    } catch (err) {
      toast('Erro: ' + err.message, 'erro'); return false;
    }
  }

  async function editarLancamento(linha) {
    const l = snapshot.lancamentos.find(x => x.linha === linha);
    if (!l) return;
    const novaDesc = prompt('Descrição:', l.descricao || ''); if (novaDesc === null) return;
    const novoValor = prompt('Valor (R$):', l.valor); if (novoValor === null) return;
    const valNum = parseFloat(String(novoValor).replace(',', '.'));
    if (isNaN(valNum) || valNum <= 0) return toast('Valor inválido', 'erro');
    await callAndReload('editLanc', {
      linha,
      lanc: { data: l.data, tipo: l.tipo, categoria: l.categoria, descricao: novaDesc, valor: valNum }
    }, 'Lançamento editado');
  }
  async function editarAviso(linha) {
    const a = snapshot.avisos.find(x => x.linha === linha);
    if (!a) return;
    const t = prompt('Título:', a.titulo); if (t === null) return;
    const m = prompt('Mensagem:', a.mensagem); if (m === null) return;
    await callAndReload('editAviso', {
      linha,
      aviso: { data: a.data, titulo: t, mensagem: m, fixado: a.fixado }
    }, 'Aviso editado');
  }
  async function editarOrcamento(linha) {
    const it = snapshot.orcamento.itens.find(x => x.linha === linha);
    if (!it) return;
    const nome = prompt('Item:', it.item); if (nome === null) return;
    const v = prompt('Valor planejado (R$):', it.planejado); if (v === null) return;
    const valNum = parseFloat(String(v).replace(',', '.'));
    if (isNaN(valNum) || valNum < 0) return toast('Valor inválido', 'erro');
    const pr = prompt('Prazo (AAAA-MM-DD, vazio = sem prazo):', it.prazo || ''); if (pr === null) return;
    const obs = prompt('Observação:', it.observacao); if (obs === null) return;
    await callAndReload('editOrc', {
      linha,
      item: { item: nome, categoria: it.categoria, planejado: valNum, prazo: pr.trim(), observacao: obs }
    }, 'Item editado');
  }

  /* ━━━━━━━━━━━━ Bindings ━━━━━━━━━━━━ */
  function bindHandlers() {
    // Login
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

    // Multi-row buttons
    $('#btn-lanc-mais').addEventListener('click', novaLancRow);
    $('#btn-orc-mais').addEventListener('click', novaOrcRow);
    $('#btn-lanc-add').addEventListener('click', salvarLancamentos);
    $('#btn-orc-add').addEventListener('click', salvarOrcamentos);

    // Categoria simples (form único, sem multi)
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

    // Aviso simples (form único)
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

    // ━━━ Delegated handlers (checkbox, bulk bar, edit, delete) ━━━
    document.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-bulk-check]');
      if (!cb) return;
      const tipo = cb.dataset.bulkCheck;
      const id = cb.dataset.id;
      if (cb.checked) selecao[tipo].add(id);
      else selecao[tipo].delete(id);
      const row = cb.closest('.item-row');
      if (row) row.classList.toggle('item-row--selected', cb.checked);
      updateBulkBar(tipo);
    });

    document.addEventListener('click', async (e) => {
      // Bulk bar
      const bulkBtn = e.target.closest('[data-bulk-action]');
      if (bulkBtn) {
        const tipo = bulkBtn.dataset.bulkType;
        if (bulkBtn.dataset.bulkAction === 'clear') clearSelecao(tipo);
        else if (bulkBtn.dataset.bulkAction === 'delete') bulkDelete(tipo);
        return;
      }

      // Remove row from multi-form
      const removeBtn = e.target.closest('button[data-act^="remove"]');
      if (removeBtn) {
        const tipo = removeBtn.dataset.act === 'remove-lanc-row' ? 'lanc' : 'orc';
        const row = removeBtn.closest('.bulk-form__row');
        if (row && $$('#' + tipo + '-bulk-form .bulk-form__row').length > 1) {
          row.remove();
          atualizarRemoveButtons(tipo);
          atualizarBtnSalvarTxt(tipo);
        }
        return;
      }

      // Single edit / delete
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const linha = parseInt(btn.dataset.linha, 10);

      if (act === 'edit-lanc')  return editarLancamento(linha);
      if (act === 'edit-aviso') return editarAviso(linha);
      if (act === 'edit-orc')   return editarOrcamento(linha);

      if (act === 'del-lanc') {
        const l = snapshot.lancamentos.find(x => x.linha === linha); if (!l) return;
        const sinal = l.tipo === 'Entrada' ? '+' : '−';
        confirmAcao({
          titulo: 'Apagar lançamento?',
          mensagem: 'O lançamento sai da planilha e do dashboard. Ação não pode ser desfeita pela UI.',
          nome: l.descricao || '(sem descrição)',
          meta: l.data + ' · ' + l.tipo + ' · ' + l.categoria + ' · ' + sinal + ' ' + fmtBRL(l.valor),
          onConfirm: () => callAndReload('delLanc', { linha }, 'Lançamento apagado')
        });
      } else if (act === 'del-aviso') {
        const a = snapshot.avisos.find(x => x.linha === linha); if (!a) return;
        confirmAcao({
          titulo: 'Apagar aviso?',
          mensagem: 'Esse recado some do topo do dashboard. Os alunos não vão ver mais.',
          nome: a.titulo,
          meta: a.data + (a.fixado ? ' · 📌 fixado' : ''),
          onConfirm: () => callAndReload('delAviso', { linha }, 'Aviso apagado')
        });
      } else if (act === 'del-orc') {
        const it = snapshot.orcamento.itens.find(x => x.linha === linha); if (!it) return;
        confirmAcao({
          titulo: 'Apagar item do orçamento?',
          mensagem: 'O item some da lista "Pra onde vai o dinheiro". Lançamentos antigos da categoria continuam.',
          nome: it.item,
          meta: it.categoria + ' · planejado ' + fmtBRL(it.planejado) + ' · pago ' + fmtBRL(it.pago) + (it.prazo ? ' · prazo ' + it.prazo : ''),
          onConfirm: () => callAndReload('delOrc', { linha }, 'Item apagado')
        });
      } else if (act === 'del-cat') {
        const tipo = btn.dataset.tipo;
        const nome = btn.dataset.nome;
        confirmAcao({
          titulo: 'Apagar categoria?',
          mensagem: 'A categoria some das listas suspensas. Lançamentos antigos que usam ela continuam intactos.',
          nome: nome,
          meta: tipo,
          onConfirm: () => callAndReload('delCat', { tipo, categoria: nome }, 'Categoria apagada')
        });
      }
    });
  }

  /* ━━━━━━━━━━━━ Boot ━━━━━━━━━━━━ */
  async function boot() {
    bindHandlers();
    if (token) {
      $('#login-modal').classList.remove('modal-bg--show');
      $('#admin-area').style.display = '';
      await carregarSnapshot();
      return;
    }
    if (localStorage.getItem(SENHA_KEY)) {
      const ok = await tentarAutoLogin();
      if (ok) {
        $('#login-modal').classList.remove('modal-bg--show');
        $('#admin-area').style.display = '';
        await carregarSnapshot();
        return;
      }
      localStorage.removeItem(SENHA_KEY);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
