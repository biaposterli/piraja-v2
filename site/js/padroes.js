// Padrões territoriais (exploratório) — Pirajá · Entero
//
// Duas análises sobre os municípios de moradia, calculadas no navegador a partir
// da mesma base da prevalência por território (pacientes com resultado
// conclusivo):
//
// 1. Municípios acima (ou abaixo) do esperado: a proporção de pacientes com
//    parasito patogênico em cada município é comparada com a do conjunto todo
//    (teste binomial exato, bilateral) e os valores-p são corrigidos para
//    múltiplas comparações (Benjamini-Hochberg, "q").
// 2. Agrupamento por perfil parasitológico (aprendizado de máquina não
//    supervisionado): k-médias sobre as prevalências por espécie de cada
//    município, suavizadas para que municípios com poucos pacientes não fiquem
//    com perfis extremos. O número de grupos é escolhido pela silhueta, e a
//    própria silhueta diz se os grupos são bem separados ou se os dados formam
//    um gradiente contínuo.
//
// Nada aqui altera as prevalências do relatório: é uma camada de leitura.

import { chaveTerritorio } from "./engine.js";

export const N_MIN_MUNICIPIO = 10; // municípios com menos pacientes ficam de fora
const PSEUDO = 5; // suavização: equivale a somar 5 pacientes com o perfil geral

// ---------------------------------------------------------------- estatística
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
/** Teste binomial exato bilateral (mesma regra do scipy: soma das prob. ≤ a observada). */
export function binomialBilateral(k, n, p) {
  const pk = binomPmf(k, n, p);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const pi = binomPmf(i, n, p);
    if (pi <= pk * (1 + 1e-7)) s += pi;
  }
  return Math.min(1, s);
}
/** Benjamini-Hochberg: valores q na mesma ordem dos valores p. */
export function benjaminiHochberg(ps) {
  const m = ps.length;
  const ordem = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = Array(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [p, i] = ordem[r];
    min = Math.min(min, (p * m) / (r + 1));
    q[i] = min;
  }
  return q;
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

// ---------------------------------------------------------------- k-médias
function rngSemente(s) {
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}
const dist2 = (a, b) => a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0);

function kmedias(X, k, rnd, iter = 100) {
  // inicialização k-means++
  const c = [X[Math.floor(rnd() * X.length)]];
  while (c.length < k) {
    const d = X.map((x) => Math.min(...c.map((ci) => dist2(x, ci))));
    const tot = d.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, i = 0;
    while (i < d.length - 1 && (r -= d[i]) > 0) i++;
    c.push(X[i]);
  }
  let rot = Array(X.length).fill(-1);
  for (let it = 0; it < iter; it++) {
    const novo = X.map((x) => { let m = 0; for (let j = 1; j < k; j++) if (dist2(x, c[j]) < dist2(x, c[m])) m = j; return m; });
    const mudou = novo.some((v, i) => v !== rot[i]);
    rot = novo;
    for (let j = 0; j < k; j++) {
      const mem = X.filter((_, i) => rot[i] === j);
      if (mem.length) c[j] = mem[0].map((_, d) => mem.reduce((t, x) => t + x[d], 0) / mem.length);
    }
    if (!mudou) break;
  }
  const inercia = X.reduce((t, x, i) => t + dist2(x, c[rot[i]]), 0);
  return { rot, inercia };
}

function silhueta(X, rot) {
  const k = Math.max(...rot) + 1;
  const D = X.map((a) => X.map((b) => Math.sqrt(dist2(a, b))));
  let soma = 0;
  X.forEach((_, i) => {
    const media = (j) => { const idx = rot.map((r, t) => (r === j && t !== i ? t : -1)).filter((t) => t >= 0); return idx.length ? idx.reduce((s, t) => s + D[i][t], 0) / idx.length : 0; };
    const nProprio = rot.filter((r) => r === rot[i]).length;
    if (nProprio <= 1) return; // silhueta 0
    const a = media(rot[i]);
    let b = Infinity;
    for (let j = 0; j < k; j++) if (j !== rot[i] && rot.includes(j)) b = Math.min(b, media(j));
    soma += (b - a) / Math.max(a, b);
  });
  return soma / X.length;
}

// ---------------------------------------------------------------- análise
/**
 * metrics (computeMetrics) -> { suficiente, motivo, municipios, testes, grupos, k, silhueta, leitura, especies }.
 * catDe(especie) devolve a categoria clínica configurada.
 */
export function analisarPadroes(metrics, catDe) {
  const base = metrics.combinada_base || [];
  const todos = porMunicipio(base);
  const munis = todos.filter((g) => g.pacientes.length >= N_MIN_MUNICIPIO);
  const fora = todos.length - munis.length;
  const res = { suficiente: false, motivo: "", nMunicipios: todos.length, fora, testes: [], grupos: [] };
  if (munis.length < 3) {
    res.motivo = `São necessários pelo menos 3 municípios com ${N_MIN_MUNICIPIO} ou mais pacientes com resultado conclusivo (há ${munis.length}).`;
    return res;
  }
  res.suficiente = true;
  const temPat = (r) => r.positivo_fecal_patogenico || r.positivo_lamina_patogenico;

  // 1. acima / abaixo do esperado (patogênicos)
  const nTot = munis.reduce((t, g) => t + g.pacientes.length, 0);
  const posTot = munis.reduce((t, g) => t + g.pacientes.filter(temPat).length, 0);
  const p0 = posTot / nTot;
  const testes = munis.map((g) => {
    const n = g.pacientes.length, k = g.pacientes.filter(temPat).length;
    return { municipio: g.municipio, uf: g.uf, n, k, prev: (100 * k) / n, p: binomialBilateral(k, n, p0) };
  });
  const q = benjaminiHochberg(testes.map((t) => t.p));
  testes.forEach((t, i) => {
    t.q = q[i];
    const lado = t.prev / 100 > p0 ? "acima" : "abaixo";
    t.situacao = t.q < 0.05 ? `${lado} do esperado` : t.q < 0.10 ? `indício: ${lado}` : "dentro do esperado";
  });
  res.p0 = 100 * p0;
  res.testes = testes.sort((a, b) => a.q - b.q || b.prev - a.prev);

  // 2. agrupamento por perfil de espécies
  const especies = [...new Set(munis.flatMap((g) => g.pacientes.flatMap((r) => r.especies)))].sort();
  if (munis.length < 6 || especies.length < 2) {
    res.motivoGrupos = `O agrupamento precisa de pelo menos 6 municípios com ${N_MIN_MUNICIPIO}+ pacientes e 2 espécies (há ${munis.length} e ${especies.length}).`;
    return res;
  }
  const geral = especies.map((e) => base.filter((r) => r.especies.includes(e)).length / base.length);
  const prev = munis.map((g) => especies.map((e, j) => {
    const c = g.pacientes.filter((r) => r.especies.includes(e)).length;
    return (c + PSEUDO * geral[j]) / (g.pacientes.length + PSEUDO);
  }));
  // raiz quadrada (estabiliza a variância de proporções) e padronização por espécie
  const R = prev.map((l) => l.map(Math.sqrt));
  const med = especies.map((_, j) => R.reduce((t, l) => t + l[j], 0) / R.length);
  const dp = especies.map((_, j) => Math.sqrt(R.reduce((t, l) => t + (l[j] - med[j]) ** 2, 0) / R.length) || 1);
  const X = R.map((l) => l.map((v, j) => (v - med[j]) / dp[j]));

  let melhor = null;
  const kMax = Math.min(5, munis.length - 1);
  for (let k = 2; k <= kMax; k++) {
    const rnd = rngSemente(20261104 + k);
    let best = null;
    for (let t = 0; t < 25; t++) { const r = kmedias(X, k, rnd); if (!best || r.inercia < best.inercia) best = r; }
    const s = silhueta(X, best.rot);
    if (!melhor || s > melhor.s + 1e-9) melhor = { k, s, rot: best.rot };
  }
  res.k = melhor.k;
  res.silhueta = melhor.s;
  res.leitura = melhor.s >= 0.5 ? "forte" : melhor.s >= 0.25 ? "moderada" : "fraca";
  const grupos = [];
  for (let j = 0; j < melhor.k; j++) {
    const idx = melhor.rot.map((r, i) => (r === j ? i : -1)).filter((i) => i >= 0);
    const nPac = idx.reduce((t, i) => t + munis[i].pacientes.length, 0);
    // prevalência bruta do grupo e razão em relação à geral
    const perfil = especies.map((e, c) => {
      const pos = idx.reduce((t, i) => t + munis[i].pacientes.filter((r) => r.especies.includes(e)).length, 0);
      const pg = pos / nPac;
      return { especie: e, categoria: catDe(e), prev: 100 * pg, razao: geral[c] ? pg / geral[c] : 0, pos };
    });
    const destaques = perfil.filter((x) => x.pos >= 3 && x.razao >= 1.25).sort((a, b) => b.razao - a.razao).slice(0, 4);
    const patPos = idx.reduce((t, i) => t + munis[i].pacientes.filter(temPat).length, 0);
    grupos.push({
      municipios: idx.map((i) => munis[i]).sort((a, b) => b.pacientes.length - a.pacientes.length).map((g) => `${g.municipio}${g.uf ? `/${g.uf}` : ""}`),
      nPac, prevPat: (100 * patPos) / nPac, destaques,
    });
  }
  res.grupos = grupos.sort((a, b) => b.prevPat - a.prevPat).map((g, i) => ({ ...g, nome: `Grupo ${String.fromCharCode(65 + i)}` }));
  return res;
}
