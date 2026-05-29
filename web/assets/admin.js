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
  const busca = { lanc: '', aviso: '', orc: '', cat: '' };
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

  // Refresh silencioso: pega snapshot novo em background, sem mostrar erro nem reset.
  // Usado depois de mutações pra ajustar métricas que dependem do server (orçamento status etc).
  function refreshSilent() {
    API.post('snapshot', { token }).then(r => {
      if (r && r.ok) { snapshot = r.data; renderTudo(); }
    }).catch(() => {});
  }

  // Recalcula resumo localmente sem precisar do server (otimista)
  function recalcularResumoLocal() {
    if (!snapshot) return;
    let arrec = 0, gasto = 0;
    for (const l of snapshot.lancamentos) {
      if (l.tipo === 'Entrada') arrec += Number(l.valor) || 0;
      else if (l.tipo === 'Saida') gasto += Number(l.valor) || 0;
    }
    const saldo = arrec - gasto;
    const m = Number(snapshot.meta) || 0;
    snapshot.resumo = {
      arrecadado: Math.round(arrec * 100) / 100,
      gasto: Math.round(gasto * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      falta: Math.round(Math.max(0, m - saldo) * 100) / 100,
      percentual: m > 0 ? Math.round((saldo / m) * 10000) / 100 : 0,
      meta: m
    };
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
    sincronizarSelectAll(tipo);
    updateBulkBar(tipo);
  }

  function sincronizarSelectAll(tipo) {
    const cb = document.querySelector('input[data-select-all="' + tipo + '"]');
    if (!cb) return;
    const visiveis = $$('input[data-bulk-check="' + tipo + '"]');
    if (visiveis.length === 0) {
      cb.checked = false; cb.indeterminate = false; return;
    }
    const marcados = visiveis.filter(c => c.checked).length;
    if (marcados === 0) { cb.checked = false; cb.indeterminate = false; }
    else if (marcados === visiveis.length) { cb.checked = true; cb.indeterminate = false; }
    else { cb.checked = false; cb.indeterminate = true; }
  }

  /* ━━━━━━━━━━━━ Busca + filtros ━━━━━━━━━━━━ */
  function filtrarLista(tipo, items) {
    const q = (busca[tipo] || '').trim().toLowerCase();
    if (!q) return items;
    const matchTxt = (txt) => String(txt || '').toLowerCase().includes(q);
    if (tipo === 'lanc') return items.filter(l => matchTxt(l.descricao) || matchTxt(l.categoria) || matchTxt(l.tipo) || matchTxt(l.data) || matchTxt(l.tag));
    if (tipo === 'aviso') return items.filter(a => matchTxt(a.titulo) || matchTxt(a.mensagem) || matchTxt(a.data));
    if (tipo === 'orc') return items.filter(it => matchTxt(it.item) || matchTxt(it.categoria) || matchTxt(it.observacao) || matchTxt(it.prazo));
    if (tipo === 'cat') return items.filter(c => matchTxt(c.cat) || matchTxt(c.tipo));
    return items;
  }

  function updateFiltroCount(tipo, total, visiveis) {
    const el = $('#count-' + tipo + '-filter');
    if (!el) return;
    el.textContent = (visiveis === total) ? '' : (visiveis + ' de ' + total);
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
        // OPTIMISTIC ANTES DA RESPONSE: remove local + re-render
        const linhasSet = new Set(ids);
        const backup = {};
        if (tipo === 'lanc') {
          backup.list = snapshot.lancamentos.slice();
          snapshot.lancamentos = snapshot.lancamentos.filter(l => !linhasSet.has(String(l.linha)));
          recalcularResumoLocal();
          renderLancamentos();
        } else if (tipo === 'aviso') {
          backup.list = snapshot.avisos.slice();
          snapshot.avisos = snapshot.avisos.filter(a => !linhasSet.has(String(a.linha)));
          renderAvisos();
        } else if (tipo === 'orc') {
          backup.list = snapshot.orcamento.itens.slice();
          snapshot.orcamento.itens = snapshot.orcamento.itens.filter(it => !linhasSet.has(String(it.linha)));
          renderOrcamento();
        } else if (tipo === 'cat') {
          backup.cats = { entrada: snapshot.categorias.entrada.slice(), saida: snapshot.categorias.saida.slice() };
          for (const id of ids) {
            const [t, n] = id.split('|');
            const lista = t === 'Entrada' ? 'entrada' : 'saida';
            snapshot.categorias[lista] = snapshot.categorias[lista].filter(c => c !== n);
          }
          renderCategoriasList();
        }
        selecao[tipo].clear();
        const palavraSing = L.sing, palavraPlur = L.plur;
        const sufixoGen = L.gen === 'f' ? 'a' : 'o';
        toast(ids.length + ' ' + (ids.length === 1 ? palavraSing : palavraPlur) + ' apagad' + sufixoGen + (ids.length === 1 ? '' : 's'), 'sucesso');

        // POST batch em background — se falhar, reverte
        let r;
        try {
          if (tipo === 'cat') {
            const catItens = ids.map(id => { const [t, n] = id.split('|'); return { tipo: t, categoria: n }; });
            r = await API.post('delCats', { token, itens: catItens });
          } else {
            const actionMap = { lanc: 'delLancs', aviso: 'delAvisos', orc: 'delOrcs' };
            r = await API.post(actionMap[tipo], { token, linhas: ids.map(id => parseInt(id, 10)) });
          }
        } catch (err) {
          r = { ok: false, erro: err.message };
        }

        if (!r.ok) {
          // reverter
          if (tipo === 'lanc')  { snapshot.lancamentos = backup.list; recalcularResumoLocal(); renderLancamentos(); }
          if (tipo === 'aviso') { snapshot.avisos = backup.list; renderAvisos(); }
          if (tipo === 'orc')   { snapshot.orcamento.itens = backup.list; renderOrcamento(); }
          if (tipo === 'cat')   { snapshot.categorias = backup.cats; renderCategoriasList(); }
          toast('Falha ao apagar — desfeito. ' + (r.erro || ''), 'erro');
          return;
        }
        refreshSilent();
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
    const todos = (snapshot.lancamentos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const lancs = filtrarLista('lanc', todos);
    $('#lanc-count').textContent = todos.length + ' total';
    updateFiltroCount('lanc', todos.length, lancs.length);
    const box = $('#lanc-list');
    if (lancs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">' +
        (todos.length === 0 ? 'Nenhum lançamento ainda.' : 'Nenhum resultado pra essa busca.') + '</p>';
      sincronizarSelectAll('lanc');
      updateBulkBar('lanc');
      return;
    }
    const compSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:middle"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    box.innerHTML = lancs.map(l => {
      const tagCls = l.tipo === 'Entrada' ? 'tag--entrada' : 'tag--saida';
      const sinal = l.tipo === 'Entrada' ? '+' : '−';
      const cor = l.tipo === 'Entrada' ? 'var(--verde-700)' : 'var(--vermelho-500)';
      const isSel = selecao.lanc.has(String(l.linha));
      const tagChip = l.tag ? '<span class="tag" style="background:var(--azul-100);color:var(--azul-700)">#' + escapeHtml(l.tag) + '</span>' : '';
      const compLink = l.comprovante ? '<a href="' + escapeHtml(l.comprovante) + '" target="_blank" rel="noopener" style="color:var(--ink-500);text-decoration:none" title="Ver comprovante">' + compSvg + ' comprovante</a>' : '';
      return (
        '<div class="item-row has-select' + (isSel ? ' item-row--selected' : '') + '" data-lanc-id="' + l.linha + '">' +
          '<div class="item-row__check"><input type="checkbox" data-bulk-check="lanc" data-id="' + l.linha + '"' + (isSel ? ' checked' : '') + '></div>' +
          '<div class="item-row__info">' +
            '<div class="item-row__title">' + escapeHtml(l.descricao || '—') + '</div>' +
            '<div class="item-row__meta">' +
              '<span>' + escapeHtml(l.data) + '</span>' +
              '<span class="tag ' + tagCls + '">' + escapeHtml(l.tipo) + '</span>' +
              '<span>' + escapeHtml(l.categoria) + '</span>' +
              tagChip +
              '<span style="color:' + cor + ';font-weight:700">' + sinal + ' ' + fmtBRL(l.valor) + '</span>' +
              (compLink ? ' · ' + compLink : '') +
            '</div>' +
          '</div>' +
          '<div class="item-row__actions">' +
            '<button class="btn btn--ghost btn--sm" data-act="dup-lanc" data-linha="' + l.linha + '" title="Duplicar como novo">duplicar</button>' +
            '<button class="btn btn--ghost btn--sm" data-act="edit-lanc" data-linha="' + l.linha + '">editar</button>' +
            '<button class="btn btn--danger btn--sm" data-act="del-lanc" data-linha="' + l.linha + '">apagar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    sincronizarSelectAll('lanc');
    updateBulkBar('lanc');
  }

  function renderAvisos() {
    const todos = snapshot.avisos || [];
    const avs = filtrarLista('aviso', todos);
    $('#aviso-count').textContent = todos.length + ' total';
    updateFiltroCount('aviso', todos.length, avs.length);
    const box = $('#aviso-list');
    if (avs.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">' +
        (todos.length === 0 ? 'Nenhum aviso ainda.' : 'Nenhum resultado pra essa busca.') + '</p>';
      sincronizarSelectAll('aviso');
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
    sincronizarSelectAll('aviso');
    updateBulkBar('aviso');
  }

  function renderOrcamento() {
    const orc = snapshot.orcamento || { itens: [] };
    const itens = filtrarLista('orc', orc.itens);
    $('#orc-count').textContent = orc.itens.length + ' itens';
    updateFiltroCount('orc', orc.itens.length, itens.length);
    const box = $('#orc-list');
    if (itens.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">' +
        (orc.itens.length === 0 ? 'Nenhum item orçado ainda.' : 'Nenhum resultado pra essa busca.') + '</p>';
      sincronizarSelectAll('orc');
      updateBulkBar('orc');
      return;
    }
    box.innerHTML = itens.map(it => {
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
            '<button class="btn btn--ghost btn--sm" data-act="dup-orc" data-linha="' + it.linha + '" title="Duplicar como novo">duplicar</button>' +
            '<button class="btn btn--ghost btn--sm" data-act="edit-orc" data-linha="' + it.linha + '">editar</button>' +
            '<button class="btn btn--danger btn--sm" data-act="del-orc" data-linha="' + it.linha + '">apagar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    sincronizarSelectAll('orc');
    updateBulkBar('orc');
  }

  function renderCategoriasList() {
    const cats = snapshot.categorias || { entrada: [], saida: [] };
    const box = $('#cat-list');
    const entradas = cats.entrada.map(c => ({ tipo: 'Entrada', cat: c }));
    const saidas   = cats.saida.map(c =>   ({ tipo: 'Saida',   cat: c }));
    const allTodos = entradas.concat(saidas);
    const all = filtrarLista('cat', allTodos);
    updateFiltroCount('cat', allTodos.length, all.length);
    if (all.length === 0) {
      box.innerHTML = '<p class="panel__sub" style="text-align:center;padding:20px 0;">' +
        (allTodos.length === 0 ? 'Nenhuma categoria.' : 'Nenhum resultado pra essa busca.') + '</p>';
      sincronizarSelectAll('cat');
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
    sincronizarSelectAll('cat');
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
      const tagInput = row.querySelector('[data-field="tag"]');
      const compInput = row.querySelector('[data-field="comprovante"]');
      const l = {
        data:      row.querySelector('[data-field="data"]').value || hoje(),
        tipo:      row.querySelector('[data-field="tipo"]').value,
        categoria: row.querySelector('[data-field="categoria"]').value,
        descricao: row.querySelector('[data-field="descricao"]').value,
        valor:     parseFloat(row.querySelector('[data-field="valor"]').value),
        tag:         tagInput  ? tagInput.value.trim()  : '',
        comprovante: compInput ? compInput.value.trim() : ''
      };
      if (!l.categoria) return toast('Linha ' + (i + 1) + ': escolha uma categoria', 'erro');
      if (!l.valor || l.valor <= 0) return toast('Linha ' + (i + 1) + ': valor inválido', 'erro');
      lancs.push(l);
    }
    const btn = $('#btn-lanc-add');
    btn.disabled = true;
    $('#btn-lanc-add-txt').textContent = 'salvando…';

    // OPTIMISTIC ANTES DA RESPONSE: aparece imediato com linha temporária
    const tempIds = [];
    lancs.forEach((l, i) => {
      const tid = 'tmp_' + Date.now() + '_' + i;
      tempIds.push(tid);
      snapshot.lancamentos.push({
        linha: tid, data: l.data, tipo: l.tipo, categoria: l.categoria,
        descricao: l.descricao || '', valor: Number(l.valor),
        tag: l.tag || '', comprovante: l.comprovante || ''
      });
    });
    recalcularResumoLocal();
    renderLancamentos();
    resetForm('lanc');
    toast(lancs.length + (lancs.length > 1 ? ' lançamentos adicionados' : ' lançamento adicionado'), 'sucesso');

    // POST em background — se falhar, reverte
    try {
      const r = await API.post('addLancs', { token, lancs });
      if (!r.ok) {
        snapshot.lancamentos = snapshot.lancamentos.filter(l => tempIds.indexOf(l.linha) === -1);
        recalcularResumoLocal();
        renderLancamentos();
        toast('Falha ao salvar — desfeito. ' + (r.erro || ''), 'erro');
        return;
      }
      // troca placeholder por linha real
      const startRow = r.startRow;
      let idx = 0;
      snapshot.lancamentos.forEach(l => {
        if (tempIds.indexOf(l.linha) !== -1) { l.linha = startRow + idx; idx++; }
      });
      refreshSilent();
    } catch (err) {
      snapshot.lancamentos = snapshot.lancamentos.filter(l => tempIds.indexOf(l.linha) === -1);
      recalcularResumoLocal();
      renderLancamentos();
      toast('Falha de rede — desfeito', 'erro');
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
    $('#btn-orc-add-txt').textContent = 'salvando…';

    // OPTIMISTIC ANTES DA RESPONSE
    const tempIds = [];
    itens.forEach((it, i) => {
      const tid = 'tmp_' + Date.now() + '_' + i;
      tempIds.push(tid);
      snapshot.orcamento.itens.push({
        linha: tid, item: it.item, categoria: it.categoria,
        planejado: Number(it.planejado), pago: 0, restante: Number(it.planejado),
        progresso: 0, prazo: it.prazo || '', observacao: it.observacao || '',
        status: it.prazo ? 'no-prazo' : 'sem-prazo', diasRestantes: null
      });
    });
    renderOrcamento();
    resetForm('orc');
    toast(itens.length + (itens.length > 1 ? ' itens adicionados' : ' item adicionado') + ' ao orçamento', 'sucesso');

    try {
      const r = await API.post('addOrcs', { token, itens });
      if (!r.ok) {
        snapshot.orcamento.itens = snapshot.orcamento.itens.filter(it => tempIds.indexOf(it.linha) === -1);
        renderOrcamento();
        toast('Falha ao salvar — desfeito. ' + (r.erro || ''), 'erro');
        return;
      }
      const startRow = r.startRow;
      let idx = 0;
      snapshot.orcamento.itens.forEach(it => {
        if (tempIds.indexOf(it.linha) !== -1) { it.linha = startRow + idx; idx++; }
      });
      refreshSilent();
    } catch (err) {
      snapshot.orcamento.itens = snapshot.orcamento.itens.filter(it => tempIds.indexOf(it.linha) === -1);
      renderOrcamento();
      toast('Falha de rede — desfeito', 'erro');
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

  // Otimista: aplica mutação local primeiro, re-render, depois chama API + refresh bg
  async function callOptimistic(action, body, msgOk, localMutator) {
    if (localMutator) { localMutator(); recalcularResumoLocal(); renderTudo(); }
    try {
      const r = await API.post(action, Object.assign({ token }, body));
      if (r.ok) {
        toast(msgOk, 'sucesso');
        refreshSilent();
        return true;
      }
      toast(r.erro || 'Erro', 'erro');
      await carregarSnapshot(); // reverte
      return false;
    } catch (err) {
      toast('Erro: ' + err.message, 'erro');
      await carregarSnapshot();
      return false;
    }
  }

  async function editarLancamento(linha) {
    const l = snapshot.lancamentos.find(x => x.linha === linha);
    if (!l) return;
    const novaDesc = prompt('Descrição:', l.descricao || ''); if (novaDesc === null) return;
    const novoValor = prompt('Valor (R$):', l.valor); if (novoValor === null) return;
    const valNum = parseFloat(String(novoValor).replace(',', '.'));
    if (isNaN(valNum) || valNum <= 0) return toast('Valor inválido', 'erro');
    const novaTag = prompt('Tag (opcional, vazio = sem tag):', l.tag || ''); if (novaTag === null) return;
    const novoComp = prompt('Link do comprovante (opcional):', l.comprovante || ''); if (novoComp === null) return;
    await callAndReload('editLanc', {
      linha,
      lanc: {
        data: l.data, tipo: l.tipo, categoria: l.categoria,
        descricao: novaDesc, valor: valNum,
        tag: novaTag.trim(), comprovante: novoComp.trim()
      }
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
  function duplicarLancamento(linha) {
    const l = snapshot.lancamentos.find(x => x.linha === linha); if (!l) return;
    novaLancRow();
    const rows = $$('#lanc-bulk-form .bulk-form__row');
    const row = rows[rows.length - 1];
    row.querySelector('[data-field="data"]').value = hoje();
    row.querySelector('[data-field="tipo"]').value = l.tipo;
    popularCategoriasNaLinha(row, 'lanc');
    row.querySelector('[data-field="categoria"]').value = l.categoria;
    row.querySelector('[data-field="descricao"]').value = l.descricao || '';
    row.querySelector('[data-field="valor"]').value = l.valor;
    const tagI = row.querySelector('[data-field="tag"]');
    const compI = row.querySelector('[data-field="comprovante"]');
    if (tagI)  tagI.value  = l.tag || '';
    if (compI) compI.value = ''; // comprovante NÃO copia (novo lançamento = comprovante diferente)
    atualizarBtnSalvarTxt('lanc');
    document.getElementById('lanc-bulk-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Lançamento duplicado no form. Ajuste e salve.', 'sucesso');
  }

  function duplicarOrcamento(linha) {
    const it = snapshot.orcamento.itens.find(x => x.linha === linha); if (!it) return;
    novaOrcRow();
    const rows = $$('#orc-bulk-form .bulk-form__row');
    const row = rows[rows.length - 1];
    row.querySelector('[data-field="item"]').value = it.item + ' (cópia)';
    row.querySelector('[data-field="categoria"]').value = it.categoria;
    row.querySelector('[data-field="planejado"]').value = it.planejado;
    row.querySelector('[data-field="prazo"]').value = it.prazo || '';
    row.querySelector('[data-field="observacao"]').value = it.observacao || '';
    atualizarBtnSalvarTxt('orc');
    document.getElementById('orc-bulk-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Item duplicado no form. Ajuste e salve.', 'sucesso');
  }

  function importarLancamentosCSV(texto) {
    // Remove BOM e separa linhas
    const sem_bom = texto.replace(/^﻿/, '');
    const linhas = sem_bom.split(/\r?\n/).filter(l => l.trim() !== '');
    if (linhas.length < 2) return toast('CSV vazio ou só cabeçalho', 'erro');

    // Detecta separador (;, ou ,)
    const sep = linhas[0].includes(';') ? ';' : ',';
    const parseLinha = (l) => {
      const out = [];
      let cur = '', inQ = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') {
          if (inQ && l[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };

    const headers = parseLinha(linhas[0]).map(h => h.trim().toLowerCase());
    const cData = headers.indexOf('data');
    const cTipo = headers.indexOf('tipo');
    const cCat  = headers.indexOf('categoria');
    const cDesc = headers.indexOf('descricao');
    const cVal  = headers.indexOf('valor');
    const cTag  = headers.indexOf('tag');
    const cComp = headers.indexOf('comprovante');
    if (cData < 0 || cTipo < 0 || cVal < 0) {
      return toast('CSV precisa ter as colunas: Data, Tipo, Categoria, Valor (mínimo)', 'erro');
    }

    const lancs = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = parseLinha(linhas[i]);
      const data = (cols[cData] || '').trim();
      const tipo = (cols[cTipo] || '').trim();
      // skip linhas de totais
      if (!data && /total|saldo/i.test(tipo + (cols[cDesc] || ''))) continue;
      if (!data) continue;
      const valStr = (cols[cVal] || '').trim().replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
      const valor = parseFloat(valStr);
      if (isNaN(valor) || valor <= 0) continue;
      lancs.push({
        data,
        tipo: tipo.toLowerCase() === 'entrada' ? 'Entrada' : 'Saida',
        categoria: cCat >= 0 ? (cols[cCat] || '').trim() : '',
        descricao: cDesc >= 0 ? (cols[cDesc] || '').trim() : '',
        valor,
        tag: cTag >= 0 ? (cols[cTag] || '').trim() : '',
        comprovante: cComp >= 0 ? (cols[cComp] || '').trim() : ''
      });
    }

    if (lancs.length === 0) return toast('Nenhuma linha válida no CSV', 'erro');

    confirmAcao({
      titulo: 'Importar ' + lancs.length + ' lançamento' + (lancs.length > 1 ? 's' : '') + '?',
      mensagem: 'Eles serão adicionados ao final da planilha. Você pode revisar antes pelo botão Cancelar.',
      nome: lancs.slice(0, 3).map(l => l.descricao || l.categoria || l.data).join(' · ') + (lancs.length > 3 ? ' · e mais ' + (lancs.length - 3) : ''),
      meta: 'do arquivo CSV',
      okTxt: 'Importar ' + lancs.length,
      onConfirm: async () => {
        const r = await API.post('addLancs', { token, lancs });
        if (!r.ok) { toast('Falha: ' + (r.erro || ''), 'erro'); return; }
        const startRow = r.startRow || (snapshot.lancamentos.length + 2);
        lancs.forEach((l, i) => {
          snapshot.lancamentos.push(Object.assign({ linha: startRow + i }, l));
        });
        recalcularResumoLocal();
        renderLancamentos();
        toast(lancs.length + ' lançamentos importados', 'sucesso');
        refreshSilent();
      }
    });
  }

  function exportarLancamentosCSV() {
    if (!snapshot || !snapshot.lancamentos || snapshot.lancamentos.length === 0) {
      return toast('Nada pra exportar', 'erro');
    }
    const lancs = snapshot.lancamentos.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const escapeCSV = (s) => {
      const str = String(s == null ? '' : s);
      return /[",\n;]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const linhas = [
      ['Data', 'Tipo', 'Categoria', 'Descricao', 'Valor', 'Tag', 'Comprovante'].join(';')
    ];
    let totalE = 0, totalS = 0;
    for (const l of lancs) {
      linhas.push([
        l.data, l.tipo, l.categoria,
        escapeCSV(l.descricao),
        Number(l.valor).toFixed(2).replace('.', ','),
        escapeCSV(l.tag || ''),
        escapeCSV(l.comprovante || '')
      ].join(';'));
      if (l.tipo === 'Entrada') totalE += l.valor; else totalS += l.valor;
    }
    linhas.push('');
    linhas.push(['', '', '', 'Total Entradas', totalE.toFixed(2).replace('.', ',')].join(';'));
    linhas.push(['', '', '', 'Total Saidas',   totalS.toFixed(2).replace('.', ',')].join(';'));
    linhas.push(['', '', '', 'Saldo',         (totalE - totalS).toFixed(2).replace('.', ',')].join(';'));

    const csv = '﻿' + linhas.join('\n'); // BOM pra Excel detectar UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = 'caixa-232-lancamentos-' + stamp + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('CSV baixado', 'sucesso');
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

    // Exportar CSV de lançamentos
    $('#btn-export-lanc').addEventListener('click', exportarLancamentosCSV);

    // Importar CSV
    $('#btn-import-csv').addEventListener('click', () => $('#input-import-csv').click());
    $('#input-import-csv').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { importarLancamentosCSV(ev.target.result); e.target.value = ''; };
      reader.readAsText(file, 'utf-8');
    });

    // Templates de avisos
    $('#templates-avisos').addEventListener('click', (e) => {
      const btn = e.target.closest('.template-btn');
      if (!btn) return;
      $('#a-titulo').value = btn.dataset.templateTitulo || '';
      $('#a-msg').value = btn.dataset.templateMsg || '';
      $('#a-data').value = $('#a-data').value || hoje();
      $('#a-titulo').focus();
    });

    // Busca (input em qualquer toolbar)
    document.addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-search]');
      if (!inp) return;
      const tipo = inp.dataset.search;
      busca[tipo] = inp.value;
      if (tipo === 'lanc')  renderLancamentos();
      if (tipo === 'aviso') renderAvisos();
      if (tipo === 'orc')   renderOrcamento();
      if (tipo === 'cat')   renderCategoriasList();
    });

    // Select-all em qualquer toolbar
    document.addEventListener('change', (e) => {
      const sa = e.target.closest('input[data-select-all]');
      if (sa) {
        const tipo = sa.dataset.selectAll;
        const visiveis = $$('input[data-bulk-check="' + tipo + '"]');
        visiveis.forEach(cb => {
          cb.checked = sa.checked;
          const id = cb.dataset.id;
          if (sa.checked) selecao[tipo].add(id); else selecao[tipo].delete(id);
          const row = cb.closest('.item-row');
          if (row) row.classList.toggle('item-row--selected', sa.checked);
        });
        sa.indeterminate = false;
        updateBulkBar(tipo);
        return;
      }
      const cb = e.target.closest('input[data-bulk-check]');
      if (!cb) return;
      const tipo = cb.dataset.bulkCheck;
      const id = cb.dataset.id;
      if (cb.checked) selecao[tipo].add(id);
      else selecao[tipo].delete(id);
      const row = cb.closest('.item-row');
      if (row) row.classList.toggle('item-row--selected', cb.checked);
      sincronizarSelectAll(tipo);
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
      if (act === 'dup-lanc')   return duplicarLancamento(linha);
      if (act === 'dup-orc')    return duplicarOrcamento(linha);

      if (act === 'del-lanc') {
        const l = snapshot.lancamentos.find(x => x.linha === linha); if (!l) return;
        const sinal = l.tipo === 'Entrada' ? '+' : '−';
        confirmAcao({
          titulo: 'Apagar lançamento?',
          mensagem: 'O lançamento sai da planilha e do dashboard. Ação não pode ser desfeita pela UI.',
          nome: l.descricao || '(sem descrição)',
          meta: l.data + ' · ' + l.tipo + ' · ' + l.categoria + ' · ' + sinal + ' ' + fmtBRL(l.valor),
          onConfirm: () => callOptimistic('delLanc', { linha }, 'Lançamento apagado',
            () => { snapshot.lancamentos = snapshot.lancamentos.filter(x => x.linha !== linha); })
        });
      } else if (act === 'del-aviso') {
        const a = snapshot.avisos.find(x => x.linha === linha); if (!a) return;
        confirmAcao({
          titulo: 'Apagar aviso?',
          mensagem: 'Esse recado some do topo do dashboard. Os alunos não vão ver mais.',
          nome: a.titulo,
          meta: a.data + (a.fixado ? ' · 📌 fixado' : ''),
          onConfirm: () => callOptimistic('delAviso', { linha }, 'Aviso apagado',
            () => { snapshot.avisos = snapshot.avisos.filter(x => x.linha !== linha); })
        });
      } else if (act === 'del-orc') {
        const it = snapshot.orcamento.itens.find(x => x.linha === linha); if (!it) return;
        confirmAcao({
          titulo: 'Apagar item do orçamento?',
          mensagem: 'O item some da lista "Pra onde vai o dinheiro". Lançamentos antigos da categoria continuam.',
          nome: it.item,
          meta: it.categoria + ' · planejado ' + fmtBRL(it.planejado) + ' · pago ' + fmtBRL(it.pago) + (it.prazo ? ' · prazo ' + it.prazo : ''),
          onConfirm: () => callOptimistic('delOrc', { linha }, 'Item apagado',
            () => { snapshot.orcamento.itens = snapshot.orcamento.itens.filter(x => x.linha !== linha); })
        });
      } else if (act === 'del-cat') {
        const tipo = btn.dataset.tipo;
        const nome = btn.dataset.nome;
        confirmAcao({
          titulo: 'Apagar categoria?',
          mensagem: 'A categoria some das listas suspensas. Lançamentos antigos que usam ela continuam intactos.',
          nome: nome,
          meta: tipo,
          onConfirm: () => callOptimistic('delCat', { tipo, categoria: nome }, 'Categoria apagada',
            () => {
              const lista = tipo === 'Entrada' ? 'entrada' : 'saida';
              snapshot.categorias[lista] = snapshot.categorias[lista].filter(c => c !== nome);
            })
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
