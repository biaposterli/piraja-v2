// Sugestão de grafia para parasitos não reconhecidos — Pirajá · Entero
//
// Quando uma célula traz um nome que não está na lista de espécies (erro de
// digitação, abreviação sem ponto, nome antigo ou popular), o passo 03 mostra
// "Você quis dizer …?". A sugestão NUNCA é aplicada sozinha: quem usa confirma.
// Tudo roda no navegador, sem servidor e sem enviar dados.
//
// O reconhecimento compara GÊNERO e EPÍTETO separadamente, com regras fixas de
// nomenclatura que a similaridade de texto sozinha não respeita:
//   1. Abreviação ("b. coli", "h nana"): a inicial precisa ser a do gênero —
//      "b. coli" só pode ser Balantidium coli, nunca Entamoeba coli.
//   2. Mesmo gênero, epíteto diferente (Hymenolepis diminuta, Entamoeba
//      polecki): NÃO é agrupado — é outra espécie.
//   3. Gênero sozinho só vira sugestão quando a lista tem uma única espécie
//      possível daquele gênero ("Giardia", "Ascaris"); "Entamoeba" e
//      "Hymenolepis" sozinhos ficam sem sugestão.
//   4. Gêneros fora da lista (Cryptosporidium, Dientamoeba…) ficam sem
//      sugestão: são espécies novas, para classificar à mão.

import { PARASITE_MAP } from "./engine.js";

// Sinônimos e nomes antigos/populares (sem acento, minúsculas). Agrupamentos
// que seguem a prática do laboratório: ovos de Ancylostoma e Necator e de
// Taenia solium e T. saginata não se distinguem ao microscópio.
const SINONIMOS = {
  "oxiuro": "Enterobius vermicularis", "oxiuros": "Enterobius vermicularis", "oxiurus": "Enterobius vermicularis",
  "oxyuris vermicularis": "Enterobius vermicularis", "enterobius": "Enterobius vermicularis",
  "ancylostoma duodenale": "Ancilostomídeos", "necator americanus": "Ancilostomídeos",
  "a. duodenale": "Ancilostomídeos", "n. americanus": "Ancilostomídeos",
  "ancylostoma": "Ancilostomídeos", "necator": "Ancilostomídeos", "ancilostoma": "Ancilostomídeos",
  "ancylostomidae": "Ancilostomídeos", "ancilostomatideo": "Ancilostomídeos", "ancilostomatideos": "Ancilostomídeos",
  "ancilostomose": "Ancilostomídeos", "amarelao": "Ancilostomídeos",
  "taenia solium": "Taenia sp.", "taenia saginata": "Taenia sp.", "t. solium": "Taenia sp.", "t. saginata": "Taenia sp.",
  "tenia": "Taenia sp.", "taenia": "Taenia sp.", "taenia spp": "Taenia sp.",
  "entamoeba histolytica": "Entamoeba histolytica/dispar", "entamoeba dispar": "Entamoeba histolytica/dispar",
  "e. histolytica": "Entamoeba histolytica/dispar", "e. dispar": "Entamoeba histolytica/dispar",
  "e. histolytica/e. dispar": "Entamoeba histolytica/dispar", "e. histolytica / dispar": "Entamoeba histolytica/dispar",
  "neobalantidium coli": "Balantidium coli", "g. intestinalis": "Giardia lamblia",
  "lombriga": "Ascaris lumbricoides", "ascaris": "Ascaris lumbricoides",
  "trichuris": "Trichuris trichiura", "tricocefalo": "Trichuris trichiura",
  "strongyloides": "Strongyloides stercoralis", "estrongiloides": "Strongyloides stercoralis",
  "schistosoma": "Schistosoma mansoni", "esquistossomo": "Schistosoma mansoni",
  "giardia": "Giardia lamblia", "endolimax": "Endolimax nana", "chilomastix": "Chilomastix mesnili",
  "balantidium": "Balantidium coli",
};

// gêneros com mais de uma espécie possível: sozinhos, não viram sugestão
const GENEROS_AMBIGUOS = new Set(["entamoeba", "hymenolepis"]);

// prefixos de forma evolutiva ("cistos de Giardia", "ovos de Ascaris")
const FORMAS_RE = /^(ovos?|cistos?|larvas?|trofozoitos?|oocistos?|proglotes?|vermes?|formas?)\s+(de|da|do)\s+/u;

export function normNome(t) {
  let s = String(t ?? "").normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase();
  s = s.replace(/\(\s*\++\s*\)|\+{2,}/gu, " ").replace(/\s*\.\s*/gu, ". ").replace(/\s*\/\s*/gu, "/");
  s = s.replace(/\s+/gu, " ").trim().replace(/\.$/u, "").trim();
  s = s.replace(FORMAS_RE, "");
  s = s.replace(/\s+(sp|spp|sp\.|spp\.)$/u, "").replace(/\.$/u, "").trim();
  // "h nana" -> "h. nana" (letra solta no início é abreviação do gênero)
  s = s.replace(/^([a-z])\s+(?=[a-z])/u, "$1. ");
  s = s.replace(/^([a-z])\1\.\s/u, "$1. "); // inicial digitada duas vezes ("gg. lamblia")
  return s;
}

/** Distância de Damerau-Levenshtein (versão OSA) convertida em semelhança 0–1. */
export function semelhanca(a, b) {
  if (a === b) return 1;
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  const d = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return 1 - d[n][m] / Math.max(n, m);
}

// ---------------------------------------------------------------- dicionário
let _dic = null;
function dicionario() {
  if (_dic) return _dic;
  const exato = new Map();
  for (const [k, v] of Object.entries(PARASITE_MAP)) exato.set(normNome(k), v);
  for (const v of new Set(Object.values(PARASITE_MAP))) exato.set(normNome(v), v);
  for (const [k, v] of Object.entries(SINONIMOS)) exato.set(normNome(k), v);
  // espécies binomiais: gênero + epíteto(s) aceitos
  const binomios = [];
  const add = (genero, epitetos, canon) => binomios.push({ genero, epitetos, canon });
  for (const canon of new Set(Object.values(PARASITE_MAP))) {
    const n = normNome(canon);
    const [g, ...resto] = n.split(" ");
    if (!resto.length) continue; // Ancilostomídeos, Blastocystis (sem epíteto)
    const ep = resto.join(" ");
    add(g, ep.includes("/") ? [ep, ...ep.split("/")] : [ep], canon);
  }
  // epítetos das grafias aceitas (ex.: "g. duodenalis" -> Giardia, epíteto duodenalis)
  for (const [k, canon] of Object.entries(PARASITE_MAP)) {
    const [g, ...resto] = normNome(k).split(" ");
    const gc = normNome(canon).split(" ")[0];
    if (!resto.length || /\+/u.test(k)) continue;
    if (g === gc || (g.length === 2 && g.endsWith(".") && gc.startsWith(g[0]))) add(gc, [resto.join(" ")], canon);
  }
  add("ancylostoma", ["duodenale"], "Ancilostomídeos");
  add("necator", ["americanus"], "Ancilostomídeos");
  add("taenia", ["solium", "saginata"], "Taenia sp.");
  add("oxyuris", ["vermicularis"], "Enterobius vermicularis");
  add("blastocystis", ["hominis"], "Blastocystis sp.");
  // palavras únicas que podem ser comparadas por semelhança
  const unicos = [...exato].filter(([k]) => !k.includes(" ") && !/^[a-z]\.$/u.test(k));
  const generos = new Set(binomios.map((b) => b.genero));
  _dic = { exato, binomios, unicos, generos };
  return _dic;
}

const LIM_GENERO = 0.75, LIM_EPITETO = 0.75, LIM_UNICO = 0.8, MARGEM = 0.08;

function melhor(cands) {
  cands.sort((a, b) => b.s - a.s);
  const [a, b] = cands;
  if (!a) return null;
  // empate entre espécies diferentes = ambíguo
  if (b && b.canon !== a.canon && a.s - b.s < MARGEM) return { ...a, ambiguo: [a.canon, b.canon] };
  return a;
}

/**
 * Sugere a espécie padronizada para um nome não reconhecido.
 * Devolve { sugestao, tipo, confianca, motivo }. tipo: "sinonimo" | "abreviacao"
 * | "grafia" | "ambiguo" | "outra_especie" | "nenhuma". sugestao é null nos três últimos.
 */
export function sugerirEspecie(nome) {
  const D = dicionario();
  const n = normNome(nome);
  const sem = (tipo, motivo) => ({ sugestao: null, tipo, confianca: 0, motivo });
  if (!n) return sem("nenhuma", "");
  if (D.exato.has(n)) {
    return { sugestao: D.exato.get(n), tipo: "sinonimo", confianca: 1, motivo: "nome equivalente na lista de espécies" };
  }
  const partes = n.split(" ");

  // 1. abreviação: inicial do gênero + epíteto
  const abr = /^([a-z])\.$/u.exec(partes[0]);
  if (abr && partes.length >= 2) {
    const ini = abr[1], ep = partes.slice(1).join(" ");
    const cands = [];
    for (const b of D.binomios) {
      if (b.genero[0] !== ini) continue;
      for (const e of b.epitetos) cands.push({ canon: b.canon, s: semelhanca(ep, e) });
    }
    const m = melhor(cands.filter((c) => c.s >= LIM_EPITETO));
    if (!m) return sem("nenhuma", `nenhuma espécie da lista com gênero iniciado em "${ini.toUpperCase()}." e epíteto parecido`);
    if (m.ambiguo) return sem("ambiguo", `pode ser ${m.ambiguo.join(" ou ")}`);
    return { sugestao: m.canon, tipo: "abreviacao", confianca: m.s, motivo: `abreviação: gênero com "${ini.toUpperCase()}"` };
  }

  // 2. gênero + epíteto por extenso
  if (partes.length >= 2) {
    const g = partes[0], ep = partes.slice(1).join(" ");
    const cands = [];
    let generoParecido = null;
    for (const b of D.binomios) {
      const sg = semelhanca(g, b.genero);
      if (sg < LIM_GENERO) continue;
      if (!generoParecido || sg > generoParecido.s) generoParecido = { genero: b.genero, s: sg };
      for (const e of b.epitetos) {
        const se = semelhanca(ep, e);
        if (se >= LIM_EPITETO) cands.push({ canon: b.canon, s: (sg + se) / 2 });
      }
    }
    const m = melhor(cands);
    if (m && m.ambiguo) return sem("ambiguo", `pode ser ${m.ambiguo.join(" ou ")}`);
    if (m) return { sugestao: m.canon, tipo: "grafia", confianca: m.s, motivo: "grafia parecida (gênero e espécie)" };
    if (generoParecido) {
      const G = generoParecido.genero[0].toUpperCase() + generoParecido.genero.slice(1);
      return sem("outra_especie", `mesmo gênero (${G}), mas outra espécie — não foi agrupada`);
    }
    return sem("nenhuma", "gênero fora da lista de espécies reconhecidas");
  }

  // 3. uma palavra só (gênero sozinho, nome popular, grupo)
  const p = partes[0];
  for (const g of GENEROS_AMBIGUOS) {
    if (semelhanca(p, g) >= LIM_UNICO) return sem("ambiguo", "gênero com mais de uma espécie — informe a espécie");
  }
  const cands = D.unicos.map(([k, canon]) => ({ canon, s: semelhanca(p, k) })).filter((c) => c.s >= LIM_UNICO);
  const m = melhor(cands);
  if (m && m.ambiguo) return sem("ambiguo", `pode ser ${m.ambiguo.join(" ou ")}`);
  if (m) return { sugestao: m.canon, tipo: "grafia", confianca: m.s, motivo: "grafia parecida" };
  return sem("nenhuma", "fora da lista de espécies reconhecidas");
}

/** O nome já é uma espécie padronizada da lista? */
export function ehEspeciePadrao(nome) {
  return new Set(Object.values(PARASITE_MAP)).has(nome);
}
