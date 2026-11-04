// Análise por faixa etária — Pirajá · Entero
//
// Colunas opcionais da planilha (a 1ª que existir é usada):
//   idade            idade em anos completos (aceita "4", "4,5", "4 anos",
//                    "18 meses", "18m", "1a6m", "1 ano e 6 meses")
//   idade_meses      idade em meses
//   data_nascimento  + data_coleta: idade na data da coleta
// A idade de cada paciente é a da primeira coleta com idade preenchida.
//
// As faixas são definidas pelos limites inferiores, em anos: [0, 2, 4, 6] vira
// 0–1, 2–3, 4–5 e 6 anos ou mais. Nada aqui altera as prevalências gerais: é
// uma leitura a mais, com os mesmos denominadores (pacientes com resultado
// conclusivo em cada tipo de amostra) e IC95% de Wilson.

import { normText, semAcento } from "./util.js";
import { wilsonCi, cochranArmitageTrend } from "./engine.js";

export const SHEET_IDADE = "Config_Idade";
export const COLUNAS_IDADE = ["idade", "idade_anos", "idade_meses", "data_nascimento", "data_coleta"];

export const PRESETS = [
  { id: "preescolar", nome: "Pré-escolar (creches e CMEIs)", cortes: [0, 2, 4, 6] },
  { id: "quinquenal", nome: "Faixas de 5 anos", cortes: [0, 5, 10, 15, 20, 60] },
  { id: "ciclos", nome: "Ciclos de vida (ECA e Estatuto da Pessoa Idosa)", cortes: [0, 12, 18, 60],
    nomes: ["Criança (0–11)", "Adolescente (12–17)", "Adulto (18–59)", "Pessoa idosa (60+)"] },
];

// ---------------------------------------------------------------- leitura
const MES = 1 / 12;

/** Texto/número de idade -> anos (número) ou null. emMeses: a coluna é em meses. */
export function paraAnos(v, emMeses = false) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? (emMeses ? v * MES : v) : null;
  const t = semAcento(String(v).toLowerCase()).replace(",", ".").trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * (emMeses ? MES : 1);
  const a = /(\d+(?:\.\d+)?)\s*(?:anos|ano|a)(?![a-z])/.exec(t);
  const m = /(\d+(?:\.\d+)?)\s*(?:meses|mes|m)(?![a-z])/.exec(t);
  if (!a && !m) return null;
  return (a ? Number(a[1]) : 0) + (m ? Number(m[1]) * MES : 0);
}

/** Date ou texto dd/mm/aaaa (ou aaaa-mm-dd) -> Date, ou null. */
export function paraData(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && v > 1000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000); // nº de série do Excel
  const t = normText(v);
  if (!t) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1])));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

const anosEntre = (d0, d1) => (d1 - d0) / (365.2425 * 86400000);

/**
 * df (normalizeColumns) -> null (planilha sem idade) ou
 * { porId: Map(id -> anos), fonte, nComIdade, nSemIdade, invalidos, inconsistentes, min, max }
 */
export function lerIdades(df) {
  const tem = (c) => df.columns.includes(c);
  let fonte = null;
  if (tem("idade")) fonte = "idade";
  else if (tem("idade_anos")) fonte = "idade_anos";
  else if (tem("idade_meses")) fonte = "idade_meses";
  else if (tem("data_nascimento")) fonte = "data_nascimento";
  if (!fonte) return null;
  const semColetaData = fonte === "data_nascimento" && !tem("data_coleta");
  const valores = new Map(); // id -> [anos...] na ordem das linhas
  const ids = new Set();
  let invalidos = 0;
  const ordem = (r) => { const m = /^P(\d+)$/i.exec(String(r.coleta ?? "").replace(/\s+/g, "")); return m ? Number(m[1]) : 999; };
  const linhas = [...df.rows].sort((a, b) => ordem(a) - ordem(b) || a._idx - b._idx);
  for (const r of linhas) {
    const id = normText(r.id_paciente);
    if (id === null) continue;
    ids.add(id);
    let anos = null, preenchido = false;
    if (fonte === "data_nascimento") {
      const dn = paraData(r.data_nascimento), dc = semColetaData ? null : paraData(r.data_coleta);
      preenchido = normText(r.data_nascimento) !== null || r.data_nascimento instanceof Date;
      if (dn && dc) anos = anosEntre(dn, dc);
    } else {
      preenchido = r[fonte] !== null && r[fonte] !== undefined && String(r[fonte]).trim() !== "";
      anos = paraAnos(r[fonte], fonte === "idade_meses");
    }
    if (anos !== null && (anos < 0 || anos > 120)) anos = null;
    if (anos === null) { if (preenchido && !semColetaData) invalidos++; continue; }
    if (!valores.has(id)) valores.set(id, []);
    valores.get(id).push(anos);
  }
  const porId = new Map();
  let inconsistentes = 0;
  for (const [id, vs] of valores) {
    porId.set(id, vs[0]);
    if (Math.max(...vs) - Math.min(...vs) > 1.5) inconsistentes++;
  }
  const todas = [...porId.values()];
  return {
    porId, fonte, semColetaData, invalidos, inconsistentes,
    nComIdade: porId.size, nSemIdade: ids.size - porId.size,
    min: todas.length ? Math.min(...todas) : null, max: todas.length ? Math.max(...todas) : null,
  };
}

// ---------------------------------------------------------------- faixas
export function presetAutomatico(info) {
  if (!info || info.max === null) return PRESETS[0];
  return info.max < 7 ? PRESETS[0] : PRESETS[1];
}

/** "0, 2, 4, 6" -> [0, 2, 4, 6] (ordenado, sem repetidos) ou null se inválido. */
export function lerCortes(txt) {
  const nums = String(txt ?? "").split(/[;,\s]+/).filter(Boolean).map((x) => Number(x.replace(",", ".")));
  if (!nums.length || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 120)) return null;
  const c = [...new Set(nums)].sort((a, b) => a - b);
  if (c[0] !== 0) c.unshift(0);
  return c.length >= 2 ? c : null;
}

const fmtAno = (x) => (Number.isInteger(x) ? String(x) : String(x).replace(".", ","));
const sAnos = (x) => (x === 1 ? "ano" : "anos");

/** cortes -> [{ ini, fim (exclusivo ou Infinity), rotulo }] */
export function faixas(cortes, nomes = null) {
  return cortes.map((ini, i) => {
    const fim = i + 1 < cortes.length ? cortes[i + 1] : Infinity;
    let rotulo;
    if (nomes && nomes[i]) rotulo = nomes[i];
    else if (fim === Infinity) rotulo = `${fmtAno(ini)} ${sAnos(ini)} ou mais`;
    else if (Number.isInteger(ini) && Number.isInteger(fim)) {
      rotulo = ini === 0 && fim === 1 ? "Menos de 1 ano" : fim - 1 === ini ? `${ini} ${sAnos(ini)}` : `${ini}–${fim - 1} ${sAnos(fim - 1)}`;
    } else rotulo = `${fmtAno(ini)} a < ${fmtAno(fim)} anos`;
    return { ini, fim, rotulo };
  });
}

export function nomesDoPreset(cortes) {
  const p = PRESETS.find((x) => x.cortes.join() === cortes.join());
  return p && p.nomes ? p.nomes : null;
}

const faixaDe = (fx, anos) => fx.findIndex((f) => anos >= f.ini && anos < f.fim);

// ---------------------------------------------------------------- análise
function porDominio(rows, idades, fx, campoPos, campoPat) {
  const grupos = fx.map(() => []);
  for (const r of rows) {
    const a = idades.porId.get(r.id_paciente);
    if (a === undefined) continue;
    const i = faixaDe(fx, a);
    if (i >= 0) grupos[i].push(r);
  }
  const linhas = fx.map((f, i) => {
    const g = grupos[i], n = g.length;
    const k = g.filter((r) => r[campoPos]).length, kp = g.filter((r) => r[campoPat]).length;
    const [inf, sup] = wilsonCi(k, n), [pinf, psup] = wilsonCi(kp, n);
    return { faixa: f.rotulo, n, k, prev: n ? 100 * k / n : null, ic95_inf: n ? inf : null, ic95_sup: n ? sup : null,
      k_pat: kp, prev_pat: n ? 100 * kp / n : null, pat_ic95_inf: n ? pinf : null, pat_ic95_sup: n ? psup : null, pacientes: g };
  });
  // corta faixas vazias nas pontas (ex.: "60 anos ou mais" num estudo de creche)
  let a = 0, b = linhas.length - 1;
  while (a <= b && !linhas[a].n) a++;
  while (b >= a && !linhas[b].n) b--;
  const uteis = linhas.slice(a, b + 1);
  const tendencia = (campo) => cochranArmitageTrend(uteis.filter((l) => l.n).map((l, i) => ({
    n_potes_entregues: i + 1, n_pacientes: l.n, n_positivos: l[campo] })));
  return { linhas: uteis, nTotal: uteis.reduce((t, l) => t + l.n, 0), tendencia: tendencia("k"), tendenciaPat: tendencia("k_pat") };
}

/** metrics + idades (lerIdades) + cortes -> { fezes, lamina, especies } */
export function analisarIdade(m, idades, cortes) {
  const fx = faixas(cortes, nomesDoPreset(cortes));
  const fezes = porDominio(m.fecal_conclusivo || [], idades, fx, "positivo_fecal", "positivo_fecal_patogenico");
  const lamina = porDominio(m.lamina_conclusivo || [], idades, fx, "positivo_lamina", "positivo_lamina_patogenico");
  const especies = (m.especies_resumo || []).map((e) => ({
    especie: e.especie, categoria: e.categoria,
    valores: fezes.linhas.map((l) => (l.n ? 100 * l.pacientes.filter((r) => (r.especies_fecais || []).includes(e.especie)).length / l.n : null)),
  }));
  return { faixas: fx, fezes, lamina, especies };
}

// ---------------------------------------------------------------- configuração na planilha
export function abaConfigIdade(cortes) {
  return [["Parâmetro", "Valor", "Observação"],
    ["Faixas etárias (limites inferiores, em anos)", cortes.join(", "),
      "Ex.: 0, 2, 4, 6 = 0–1, 2–3, 4–5 e 6 anos ou mais. Usado na aba 'Faixa etária' do relatório."]];
}

/** planilha lida -> cortes ou null */
export function lerConfigIdade(planilha) {
  const nome = planilha.nomes.find((s) => semAcento(s.trim().toLowerCase()) === SHEET_IDADE.toLowerCase());
  if (!nome) return null;
  const mat = planilha.abas[nome] || [];
  for (const l of mat.slice(1)) {
    if (l && /faixa/i.test(String(l[0] ?? ""))) return lerCortes(l[1]);
  }
  return null;
}
