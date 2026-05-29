/**
 * Caixa 232 — wrapper de chamadas ao back-end Apps Script.
 *
 * GET para leitura pública (dashboard).
 * POST com Content-Type text/plain (string JSON no body) pra
 * evitar preflight CORS — Apps Script aceita e parseia via
 * e.postData.contents no doPost.
 *
 * Para trocar a API URL: edite só esta constante. O resto do site
 * já consome via API.fetchData() / API.post().
 */

(function () {
  'use strict';

  // ⚙️ URL da Web App do Apps Script. Atualize após redeploy.
  const API_URL = 'https://script.google.com/macros/s/AKfycbxx3-lRkpiuGcUQgoTYMyYOGjMC-F0-89mYf45xJJVcWl4HOQXYaHZ-msllX0hP_d_07g/exec';

  async function fetchData() {
    const resp = await fetch(API_URL + '?action=data', {
      method: 'GET',
      redirect: 'follow'
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.erro || 'Falha ao carregar');
    return json.data;
  }

  async function post(action, body) {
    const payload = Object.assign({ action: action }, body || {});
    const resp = await fetch(API_URL, {
      method: 'POST',
      // text/plain evita preflight CORS — Apps Script lê via e.postData.contents
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  }

  window.API = { fetchData, post, URL: API_URL };
})();
