// Padrões territoriais (exploratório) — Pirajá · Entero
//
// Leituras dos municípios de moradia, calculadas no navegador. Fezes e lâmina
// ficam SEMPRE separadas, como no resto do Pirajá, e nada aqui altera as
// prevalências do relatório.
//
// 1. Gráfico de funil (Spiegelhalter, 2005): cada município é um ponto (nº de
//    pacientes × % com parasito patogênico). As faixas mostram até onde a
//    proporção pode variar só por acaso, dado o tamanho da amostra, em torno da
//    média do levantamento — limites binomiais exatos de 95% e 99,8%. A média
//    de amostras entregues por paciente acompanha cada município, porque mais
//    coletas aumentam a chance de encontrar parasitos.
// 2. Mapa de calor município × espécie (fezes): a prevalência de cada espécie
//    em cada município; a cor compara os municípios dentro de cada espécie.

import { chaveTerritorio } from "./engine.js";

export const N_MIN_FUNIL = 5;    // municípios menores ficam fora do funil
export const N_MIN_CALOR = 10;   // e do mapa de calor

// ---------------------------------------------------------------- binomial
function lnGama(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const ci of c) s += ci / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function binomPmf(k, n, p) {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lnGama(n + 1) - lnGama(k + 1) - lnGama(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
/**
 * Limite do funil para a probabilidade acumulada q (ex.: 0,975 ou 0,025), com a
 * interpolação de Spiegelhalter para a variável discreta. Devolve proporção 0–1.
 */
export function limiteFunil(n, p0, q) {
  let F = 0, r = 0, Fant = 0;
  for (; r <= n; r++) {
    Fant = F;
    F += binomPmf(r, n, p0);
    if (F >= q) break;
  }
  r = Math.min(r, n);
  const pr = F - Fant;
  const alfa = pr > 0 ? (F - q) / pr : 0;
  return Math.max(0, Math.min(1, (r - alfa) / n));
}

// ---------------------------------------------------------------- base por município
function porMunicipio(base) {
  const ufs = new Map();
  for (const r of base) {
    const k = chaveTerritorio(r.municipio), u = String(r.uf ?? "").trim().toUpperCase();
    if (!k || !u) continue;
    if (!ufs.has(k)) ufs.set(k, new Set());
    ufs.get(k).add(u);
  }
  const grupos = new Map();
  for (const r of base) {
    const k = chaveTerritorio(r.municipio);
    if (!k) continue;
    let u = String(r.uf ?? "").trim().toUpperCase();
    if (!u) { const s = ufs.get(k); u = s && s.size === 1 ? [...s][0] : ""; }
    const chave = `${k}|${u}`;
    if (!grupos.has(chave)) grupos.set(chave, { municipio: String(r.municipio).trim(), uf: u, pacientes: [] });
    grupos.get(chave).pacientes.push(r);
  }
  return [...grupos.values()];
}

const REGIAO = {
  AC: 1, AM: 1, AP: 1, PA: 1, RO: 1, RR: 1, TO: 1,
  AL: 2, BA: 2, CE: 2, MA: 2, PB: 2, PE: 2, PI: 2, RN: 2, SE: 2,
  DF: 3, GO: 3, MS: 3, MT: 3, ES: 4, MG: 4, RJ: 4, SP: 4, PR: 5, RS: 5, SC: 5,
};
const nomeMun = (g) => `${g.municipio}${g.uf ? `/${g.uf}` : ""}`;

// ---------------------------------------------------------------- funil
function funil(rows, campoPos, campoEsforco) {
  const todos = porMunicipio(rows);
  const munis = todos.filter((g) => g.pacientes.length >= N_MIN_FUNIL);
  if (munis.length < 3) return { suficiente: false, nMunicipios: todos.length, nOk: munis.length };
  const nTot = munis.reduce((t, g) => t + g.pacientes.length, 0);
  const posTot = munis.reduce((t, g) => t + g.pacientes.filter((r) => r[campoPos]).length, 0);
  const p0 = posTot / nTot;
  const pontos = munis.map((g) => {
    const n = g.pacientes.length, k = g.pacientes.filter((r) => r[campoPos]).length;
    const prev = k / n;
    const esforco = g.pacientes.reduce((t, r) => t + (Number(r[campoEsforco]) || 0), 0) / n;
    const fora = (q1, q2) => prev > limiteFunil(n, p0, q2) ? "acima" : prev < limiteFunil(n, p0, q1) ? "abaixo" : "";
    const f998 = fora(0.001, 0.999), f95 = fora(0.025, 0.975);
    const situacao = f998 ? `${f998} da faixa de 99,8%` : f95 ? `${f95} da faixa de 95%` : "dentro do esperado";
    return { nome: nomeMun(g), municipio: g.municipio, uf: g.uf, n, k, prev: 100 * prev, esforco, f95, f998, situacao };
  }).sort((a, b) => b.n - a.n);
  const esf = pontos.map((p) => p.esforco);
  return {
    suficiente: true, p0: 100 * p0, pontos, nMunicipios: todos.length, foraFunil: todos.length - munis.length,
    esforcoMin: Math.min(...esf), esforcoMax: Math.max(...esf),
  };
}

// ---------------------------------------------------------------- mapa de calor
function calor(rows, especiesOrdem) {
  const munis = porMunicipio(rows).filter((g) => g.pacientes.length >= N_MIN_CALOR);
  if (munis.length < 2 || !especiesOrdem.length) return null;
  const linhas = munis.map((g) => ({
    nome: nomeMun(g), n: g.pacientes.length, regiao: REGIAO[g.uf] || 9,
    valores: especiesOrdem.map((e) => 100 * g.pacientes.filter((r) => (r.especies_fecais || []).includes(e)).length / g.pacientes.length),
  })).sort((a, b) => a.regiao - b.regiao || a.nome.localeCompare(b.nome, "pt-BR"));
  const maxCol = especiesOrdem.map((_, j) => Math.max(...linhas.map((l) => l.valores[j]), 0));
  return { linhas, maxCol, foraCalor: porMunicipio(rows).length - munis.length };
}

/** metrics (computeMetrics) -> { fezes, lamina, calor } */
export function analisarPadroes(m) {
  const fezes = funil(m.fecal_conclusivo || [], "positivo_fecal_patogenico", "n_coletas_pote_entregue");
  const lamina = funil(m.lamina_conclusivo || [], "positivo_lamina_patogenico", "n_coletas_lamina_entregue");
  const especies = (m.especies_resumo || []).map((r) => ({ especie: r.especie, categoria: r.categoria }));
  const c = calor(m.fecal_conclusivo || [], especies.map((e) => e.especie));
  return { fezes, lamina, calor: c && { ...c, especies } };
}
