/**
 * Caixa 232 — Dashboard público
 */
(function () {
  'use strict';

  const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const PALETA_ENTRADA = ['#15803D', '#22C55E', '#4ADE80', '#16A34A', '#86EFAC', '#14532D'];
  const PALETA_SAIDA   = ['#EF4444', '#F87171', '#DC2626', '#FCA5A5', '#B91C1C', '#FECACA'];

  let chartEntradas = null;
  let chartSaidas = null;
  let filtroAtual = 'todos';
  let dadosAtuais = null;

  function countUp(el, finalValue, duration, isPct) {
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = finalValue * eased;
      el.textContent = isPct ? Math.round(v) + '%' : fmtBRL(v);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

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

  function renderWarnings(warnings, erro) {
    const box = $('#warnings');
    box.innerHTML = '';
    if (erro) {
      box.innerHTML = '<div class="banner banner--erro">' +
        '<span>⚠ ' + escapeHtml(erro) + '</span>' +
        '<button class="banner__close" onclick="this.parentElement.remove()" aria-label="Fechar">&times;</button>' +
        '</div>';
      return;
    }
    if (!warnings || warnings.length === 0) return;
    box.innerHTML = '<div class="banner">' +
      '<span>⚠ ' + warnings.map(escapeHtml).join(' · ') + '</span>' +
      '<button class="banner__close" onclick="this.parentElement.remove()" aria-label="Fechar">&times;</button>' +
      '</div>';
  }

  function renderMeta(resumo) {
    countUp($('#meta-saldo'), resumo.saldo, 900);
    $('#meta-valor').textContent = fmtBRL(resumo.meta);

    const pctClamped = Math.max(0, Math.min(100, resumo.percentual));
    setTimeout(() => { $('#meta-fill').style.width = pctClamped + '%'; }, 120);

    const pctEl = $('#meta-pct');
    countUp(pctEl, Math.round(resumo.percentual), 900, true);
    pctEl.classList.toggle('meta__pct--alerta', resumo.saldo < 0);

    $('#meta-falta').innerHTML = resumo.falta > 0
      ? 'Faltam <strong>' + escapeHtml(fmtBRL(resumo.falta)) + '</strong>'
      : '<strong>🎉 Meta atingida</strong>';
  }

  function renderCards(resumo) {
    countUp($('#card-arrecadado'), resumo.arrecadado, 900);
    countUp($('#card-gasto'),       resumo.gasto,       900);
    countUp($('#card-saldo'),       resumo.saldo,       900);
    countUp($('#card-falta'),       resumo.falta,       900);
  }

  // ━━━━━━━━━━━ ORÇAMENTO ("Pra onde vai o dinheiro") ━━━━━━━━━━━
  function renderOrcamento(orc) {
    if (!orc || !orc.itens || orc.itens.length === 0) {
      $('#sec-orcamento').style.display = 'none';
      return;
    }
    $('#sec-orcamento').style.display = '';

    // Sumário
    countUp($('#orc-planejado'), orc.totalPlanejado, 800);
    countUp($('#orc-pago'),      orc.totalPago,      800);
    countUp($('#orc-restante'),  orc.totalRestante,  800);
    const progEl = $('#orc-prog');
    countUp(progEl, Math.round(orc.progressoMedio), 800, true);

    // Itens
    const lista = $('#orc-lista');
    lista.innerHTML = orc.itens.map(it => {
      let statusClass, statusTxt, barClass;
      if (it.progresso >= 100) {
        statusClass = 'quitado'; statusTxt = 'Quitado'; barClass = 'orc-bar__fill--quitado';
      } else if (it.progresso > 0) {
        statusClass = 'progresso'; statusTxt = 'Em andamento'; barClass = 'orc-bar__fill--progresso';
      } else {
        statusClass = 'pendente'; statusTxt = 'A pagar'; barClass = 'orc-bar__fill--pendente';
      }
      return (
        '<div class="orc-item">' +
          '<div class="orc-item__top">' +
            '<div>' +
              '<div class="orc-item__nome">' +
                escapeHtml(it.item) +
                '<span class="orc-item__cat">' + escapeHtml(it.categoria) + '</span>' +
              '</div>' +
              (it.observacao ? '<p class="orc-item__obs">' + escapeHtml(it.observacao) + '</p>' : '') +
            '</div>' +
            '<div class="orc-item__valores">' +
              '<span class="orc-item__pago">' + fmtBRL(it.pago) + '</span>' +
              '<span class="orc-item__planejado">de <strong>' + fmtBRL(it.planejado) + '</strong></span>' +
            '</div>' +
          '</div>' +
          '<div class="orc-bar"><div class="orc-bar__fill ' + barClass + '" style="width: ' + Math.min(100, it.progresso) + '%"></div></div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; font-variant-numeric: tabular-nums;">' +
            '<span class="orc-item__status orc-item__status--' + statusClass + '">' + statusTxt + '</span>' +
            '<span style="font-size:12px;color:var(--ink-500)">' +
              Math.round(it.progresso) + '% pago' +
              (it.restante > 0 ? ' · Faltam <strong style="color:var(--ink-800)">' + fmtBRL(it.restante) + '</strong>' : '') +
            '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderCharts(entradas, saidas) {
    renderChart('chart-entradas', 'wrap-entradas', entradas, PALETA_ENTRADA, chartEntradas, (c) => { chartEntradas = c; });
    renderChart('chart-saidas',   'wrap-saidas',   saidas,   PALETA_SAIDA,   chartSaidas,   (c) => { chartSaidas = c; });
  }

  function renderChart(canvasId, wrapId, dados, paleta, existente, setRef) {
    const wrap = $('#' + wrapId);
    if (!dados || dados.length === 0) {
      wrap.innerHTML = '<div class="chart-vazio">Nenhum lançamento ainda.</div>';
      return;
    }
    if (!wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="' + canvasId + '"></canvas>';
    }
    if (existente) existente.destroy();
    const ctx = $('#' + canvasId).getContext('2d');
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: dados.map(d => d.categoria),
        datasets: [{
          data: dados.map(d => d.total),
          backgroundColor: dados.map((_, i) => paleta[i % paleta.length]),
          borderWidth: 0,
          hoverOffset: 10,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 14,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { family: 'Inter', size: 12, weight: '500' },
              color: '#475569'
            }
          },
          tooltip: {
            callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + fmtBRL(ctx.parsed) },
            backgroundColor: '#0F172A',
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: 'Inter', weight: '700' },
            bodyFont:  { family: 'Inter', weight: '500', size: 13 },
            displayColors: false
          }
        }
      }
    });
    setRef(chart);
  }

  function renderAvisos(avisos) {
    const box = $('#avisos-list');
    const sec = $('#sec-avisos');
    if (!avisos || avisos.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    const pinSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px"><path d="M12 17v5"/><path d="M5 17h14l-1.5-3v-7h1V5H5.5v2h1v7L5 17z"/></svg>';
    box.innerHTML = avisos.map(a => (
      '<div class="aviso' + (a.fixado ? ' aviso--fixado' : '') + '">' +
        '<div class="aviso__head">' +
          '<h3 class="aviso__titulo">' + escapeHtml(a.titulo) + '</h3>' +
          (a.fixado ? '<span class="aviso__pin">' + pinSvg + 'Fixado</span>' : '') +
          '<span class="aviso__data">' + escapeHtml(a.data) + '</span>' +
        '</div>' +
        (a.mensagem ? '<p class="aviso__msg">' + escapeHtml(a.mensagem) + '</p>' : '') +
      '</div>'
    )).join('');
  }

  function renderExtrato(lancamentos) {
    const box = $('#extrato');
    const filtrados = filtroAtual === 'todos'
      ? lancamentos
      : lancamentos.filter(l => l.tipo === filtroAtual);
    if (filtrados.length === 0) {
      box.innerHTML = '<div class="extrato__vazio">' +
        (filtroAtual === 'todos' ? 'Nenhum lançamento registrado ainda.' : 'Nenhum lançamento desse tipo.') +
        '</div>';
      return;
    }
    const sorted = filtrados.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    box.innerHTML = sorted.map(l => {
      const sinal = l.tipo === 'Entrada' ? '+' : '−';
      const cls = l.tipo === 'Entrada' ? 'extrato__valor--entrada' : 'extrato__valor--saida';
      return (
        '<div class="extrato__linha">' +
          '<span class="extrato__data">' + escapeHtml(l.data) + '</span>' +
          '<span class="extrato__desc">' +
            '<span class="extrato__cat">' + escapeHtml(l.categoria) + '</span>' +
            '<span class="extrato__txt">' + escapeHtml(l.descricao || '—') + '</span>' +
          '</span>' +
          '<span class="extrato__valor ' + cls + '">' + sinal + ' ' + fmtBRL(l.valor) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderAll(data) {
    dadosAtuais = data;
    renderWarnings(data.warnings);
    if (data.config && data.config.nome_turma) {
      $('#badge-turma').textContent = data.config.nome_turma;
    }
    renderMeta(data.resumo);
    renderCards(data.resumo);
    renderOrcamento(data.orcamento);
    renderCharts(data.porCategoriaEntrada, data.porCategoriaSaida);
    renderAvisos(data.avisos);
    renderExtrato(data.lancamentos);
    atualizarHorario(data.ultimaLeitura);
  }

  function atualizarHorario(iso) {
    const d = iso ? new Date(iso) : new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    $('#ultima-leitura').textContent = hh + ':' + mm;
  }

  function bindFiltros() {
    $$('.pill[data-filtro]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.pill[data-filtro]').forEach(b => b.classList.remove('pill--active'));
        btn.classList.add('pill--active');
        filtroAtual = btn.dataset.filtro;
        if (dadosAtuais) renderExtrato(dadosAtuais.lancamentos);
      });
    });
  }

  function bindRefresh() {
    const btn = $('#btn-refresh');
    const txt = $('#btn-refresh-txt');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      txt.textContent = 'atualizando…';
      try {
        const data = await API.fetchData();
        renderAll(data);
        const hh = new Date().toLocaleTimeString('pt-BR').slice(0, 5);
        toast('Atualizado às ' + hh, 'sucesso');
      } catch (err) {
        toast('Falha ao atualizar: ' + err.message, 'erro');
      } finally {
        btn.disabled = false;
        txt.textContent = 'Atualizar';
      }
    });
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

  // Boot
  async function boot() {
    bindFiltros();
    bindRefresh();
    try {
      const data = await API.fetchData();
      renderAll(data);
    } catch (err) {
      renderWarnings(null, 'Não consegui carregar os dados. ' + err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
