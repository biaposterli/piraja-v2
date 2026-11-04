// Gráficos em SVG — os mesmos desenhos aparecem na tela (com dicas ao passar o
// mouse) e no relatório em PDF (vetoriais). Sem biblioteca externa.

import { esc } from "./util.js";

export const COR = {
  MATA: "#11483D", FOLHA: "#328567", COBRE: "#9C4A2F", COBRE_CLARO: "#D08A6A", PAPEL: "#F4F1EA",
  SUPERFICIE: "#FBF9F4", TINTA: "#1B2421", TINTA_SUAVE: "#4E5B55", TINTA_CLARA: "#7A857F",
  SALVIA: "#A9C3B8", LINHA: "#DCD6C8", GRADE: "#E9E5DC",
};
export const COR_CATEGORIA = { "Patogênico": COR.COBRE, "Comensal": COR.FOLHA, "Não classificado": COR.SALVIA };

// Nome da família: o 1º serve à tela (CSS), o 2º ao PDF (fonte registrada no pdfmake)
const FONTE = "Instrument Sans, InstrumentSans, sans-serif";

// ---------------------------------------------------------------------------
// medida de texto (canvas no navegador; estimativa fora dele)
// ---------------------------------------------------------------------------
let _ctx = null;
export function larguraTexto(txt, tam = 12, peso = 400) {
  if (typeof document !== "undefined") {
    if (!_ctx) _ctx = document.createElement("canvas").getContext("2d");
    _ctx.font = `${peso} ${tam}px "Instrument Sans", sans-serif`;
    return _ctx.measureText(String(txt)).width;
  }
  return String(txt).length * tam * 0.54;
}

function ticks(max, alvo = 5) {
  const bruto = max / alvo;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => max / p <= alvo + 0.5) || pot * 10;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += passo) out.push(+v.toFixed(6));
  return out;
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

/** Segmentos de hachura dentro de um retângulo (sem clipPath, para o PDF). */
function hachura(x, y, w, h, tipo, cor = "#FFFFFF", passo = 6) {
  const segs = [];
  // linhas paramétricas (x = c ∓ t, y = t), recortadas em 0 ≤ x ≤ w, 0 ≤ t ≤ h
  const diag = (sinal) => {
    for (let c = -h; c <= w + h; c += passo) {
      let t0, t1;
      if (sinal > 0) { t0 = Math.max(0, c - w); t1 = Math.min(h, c); } // "/"
      else { t0 = Math.max(0, -c); t1 = Math.min(h, w - c); } // "\"
      if (t1 - t0 < 0.4) continue;
      const px = (t) => (sinal > 0 ? c - t : c + t);
      segs.push([x + px(t0), y + t0, x + px(t1), y + t1]);
    }
  };
  if (tipo === "diag" || tipo === "cruz") diag(1);
  if (tipo === "cruz") diag(-1);
  return segs.map(([a, b, c, d]) => `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${cor}" stroke-width="1.1"/>`).join("");
}

function cabecalhoSvg(w, h, fundo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" font-family="${FONTE}" class="pj-grafico">` +
    (fundo ? `<rect x="0" y="0" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${fundo}"/>` : "");
}

function dicaAttr(dica) {
  return dica ? ` data-dica="${esc(dica)}"` : "";
}

function legendaHorizontal(itens, x, y, tam) {
  let cx = x, s = "";
  for (const it of itens) {
    s += `<rect x="${cx}" y="${y - tam + 2}" width="${tam}" height="${tam}" rx="2" fill="${it.cor}"/>`;
    if (it.hachura) s += hachura(cx, y - tam + 2, tam, tam, it.hachura, "#FFFFFF", 4);
    s += `<text x="${cx + tam + 5}" y="${y}" font-size="${tam}" fill="${COR.TINTA_SUAVE}">${esc(it.rotulo)}</text>`;
    cx += tam + 5 + larguraTexto(it.rotulo, tam) + 16;
  }
  return [s, cx - x];
}

// ---------------------------------------------------------------------------
// barras horizontais (prevalência por espécie)
// linhas: [{ rotulo, valor, cor, hachura?, texto, dica }] na ordem de cima para baixo
// ---------------------------------------------------------------------------
export function barrasH(linhas, o = {}) {
  linhas = [...linhas];
  const tam = o.fonte || 12;
  const W = o.largura || 560;
  const passo = o.passo || 34;
  const alt = o.alturaBarra || 22;
  const legenda = o.legenda || [];
  const topo = (legenda.length ? tam + 16 : 6) + (o.titulo ? tam + 12 : 0);
  // rótulos longos: diminui a fonte dos nomes (até 75%) em vez de cortá-los
  const maxRot = Math.max(...linhas.map((l) => larguraTexto(l.rotulo, tam)), 20);
  const capEsq = W * 0.5;
  const tamRot = maxRot + 12 > capEsq ? Math.max(tam * 0.75, tam * (capEsq - 12) / maxRot) : tam;
  const margemEsq = Math.min(capEsq, maxRot * tamRot / tam + 12);
  // textos à direita das barras: no máximo ~30% da largura (encurta com "…")
  const capDir = W * 0.3;
  linhas = linhas.map((l) => {
    let t = l.texto ?? "";
    if (larguraTexto(t, tam - 1) > capDir) {
      while (t.length > 4 && larguraTexto(t + "…", tam - 1) > capDir) t = t.slice(0, -1);
      t = t.trimEnd() + "…";
    }
    return { ...l, texto: t };
  });
  const maxTexto = Math.max(...linhas.map((l) => larguraTexto(l.texto, tam - 1)), 0);
  const margemDir = maxTexto + 14;
  const plotW = Math.max(60, W - margemEsq - margemDir);
  const H = topo + linhas.length * passo + 36;
  const xmax = o.xmax || Math.max(10, Math.max(...linhas.map((l) => l.valor)) * 1.15);
  const X = (v) => margemEsq + (v / xmax) * plotW;
  let s = cabecalhoSvg(W, H, o.fundo);
  let y0 = 4;
  if (o.titulo) {
    s += `<text x="0" y="${y0 + tam}" font-size="${tam + 1}" font-weight="bold" fill="${COR.MATA}">${esc(o.titulo)}</text>`;
    y0 += tam + 12;
  }
  if (legenda.length) s += legendaHorizontal(legenda, 0, y0 + tam, tam - 1)[0];
  const plotTop = topo, plotBot = topo + linhas.length * passo;
  for (const t of ticks(xmax)) {
    if (t > xmax + 1e-9) continue;
    s += `<line x1="${X(t).toFixed(1)}" y1="${plotTop}" x2="${X(t).toFixed(1)}" y2="${plotBot}" stroke="${COR.GRADE}" stroke-width="1"/>`;
    s += `<text x="${X(t).toFixed(1)}" y="${plotBot + tam + 4}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${fmt(t)}</text>`;
  }
  s += `<line x1="${margemEsq}" y1="${plotTop}" x2="${margemEsq}" y2="${plotBot}" stroke="${COR.LINHA}" stroke-width="1"/>`;
  linhas.forEach((l, i) => {
    const yc = plotTop + i * passo + passo / 2;
    const w = Math.max(0, X(l.valor) - margemEsq);
    s += `<g class="pj-marca"${dicaAttr(l.dica)}>`;
    s += `<rect x="${margemEsq}" y="${(yc - alt / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${alt}" fill="${l.cor}" rx="2"/>`;
    if (l.hachura && w > 1) s += hachura(margemEsq, yc - alt / 2, w, alt, l.hachura);
    s += `<rect x="0" y="${(yc - passo / 2).toFixed(1)}" width="${W}" height="${passo}" fill="transparent"/>`;
    s += `</g>`;
    s += `<text x="${margemEsq - 8}" y="${(yc + tamRot * 0.35).toFixed(1)}" font-size="${tamRot.toFixed(1)}" fill="${COR.TINTA}" text-anchor="end">${esc(l.rotulo)}</text>`;
    if (l.texto) s += `<text x="${(X(l.valor) + 5).toFixed(1)}" y="${(yc + tam * 0.35).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}">${esc(l.texto)}</text>`;
  });
  if (o.tituloX) {
    s += `<text x="${(margemEsq + plotW / 2).toFixed(1)}" y="${plotBot + 2 * tam + 10}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloX)}</text>`;
  }
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// colunas (comparação de métodos — painéis por tipo de amostra; nº de potes)
// paineis: [{ titulo, cor, barras: [{ rotulo, valor, texto, dica }] }]
// ---------------------------------------------------------------------------
export function colunas(paineis, o = {}) {
  const tam = o.fonte || 12;
  const W = o.largura || 560;
  const H = o.altura || 320;
  const ymax = o.ymax || Math.max(10, ...paineis.flatMap((p) => p.barras.map((b) => b.valor))) * 1.15;
  const rot = o.rotacionar ?? paineis.some((p) => p.barras.some((b) => larguraTexto(b.rotulo, tam - 1) > (W / Math.max(1, paineis.reduce((a, q) => a + q.barras.length, 0))) * 0.9));
  const margemEsq = 44, topo = paineis.some((p) => p.titulo) ? tam + 16 : 12;
  const base = H - (rot ? 70 : 38) - (o.tituloX ? tam + 6 : 0);
  const totalBarras = paineis.reduce((a, p) => a + p.barras.length, 0);
  const gap = paineis.length > 1 ? 24 : 0;
  const plotW = W - margemEsq - 8 - gap * (paineis.length - 1);
  const Y = (v) => base - (v / ymax) * (base - topo);
  let s = cabecalhoSvg(W, H, o.fundo);
  for (const t of ticks(ymax)) {
    if (t > ymax + 1e-9) continue;
    s += `<line x1="${margemEsq}" y1="${Y(t).toFixed(1)}" x2="${W - 8}" y2="${Y(t).toFixed(1)}" stroke="${COR.GRADE}" stroke-width="1"/>`;
    s += `<text x="${margemEsq - 6}" y="${(Y(t) + tam * 0.35).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="end">${fmt(t)}</text>`;
  }
  if (o.tituloY) {
    s += `<text transform="translate(12 ${((topo + base) / 2).toFixed(1)}) rotate(-90)" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloY)}</text>`;
  }
  let x = margemEsq;
  for (const p of paineis) {
    const pw = plotW * (p.barras.length / Math.max(1, totalBarras));
    const slot = pw / Math.max(1, p.barras.length);
    const bw = Math.min(o.barraMax || 40, slot * 0.6);
    if (p.titulo) s += `<text x="${(x + pw / 2).toFixed(1)}" y="${tam + 2}" font-size="${tam}" font-weight="bold" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(p.titulo)}</text>`;
    s += `<line x1="${x}" y1="${base}" x2="${(x + pw).toFixed(1)}" y2="${base}" stroke="${COR.LINHA}" stroke-width="1"/>`;
    p.barras.forEach((b, i) => {
      const cx = x + slot * i + slot / 2;
      const h = base - Y(b.valor);
      s += `<g class="pj-marca"${dicaAttr(b.dica)}><rect x="${(cx - bw / 2).toFixed(1)}" y="${Y(b.valor).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${b.cor || p.cor}" rx="2"/>` +
        `<rect x="${(cx - slot / 2).toFixed(1)}" y="${topo}" width="${slot.toFixed(1)}" height="${base - topo}" fill="transparent"/></g>`;
      if (b.texto) s += `<text x="${cx.toFixed(1)}" y="${(Y(b.valor) - 5).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(b.texto)}</text>`;
      if (rot) {
        s += `<text transform="translate(${cx.toFixed(1)} ${base + 12}) rotate(-28)" font-size="${tam - 1}" fill="${COR.TINTA}" text-anchor="end">${esc(b.rotulo)}</text>`;
      } else {
        const linhas = String(b.rotulo).split("\n");
        linhas.forEach((ln, k) => {
          s += `<text x="${cx.toFixed(1)}" y="${base + tam + 6 + k * (tam + 2)}" font-size="${tam - 1}" fill="${COR.TINTA}" text-anchor="middle">${esc(ln)}</text>`;
        });
      }
    });
    x += pw + gap;
  }
  if (o.tituloX) s += `<text x="${(margemEsq + plotW / 2).toFixed(1)}" y="${H - 6}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloX)}</text>`;
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// rosca (mono x poliparasitismo)
// ---------------------------------------------------------------------------
export function rosca(fatias, o = {}) {
  const tam = o.fonte || 12;
  const W = o.largura || 420, H = o.altura || 260;
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  const r = Math.min(H - 20, W * 0.55) / 2, r0 = r * (o.furo ?? 0.45);
  const cx = r + 10, cy = H / 2;
  let s = cabecalhoSvg(W, H, o.fundo);
  if (!total) return s + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="${tam}" fill="${COR.TINTA_SUAVE}">Sem dados</text></svg>`;
  let a0 = -Math.PI / 2;
  const pt = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  for (const f of fatias) {
    if (!f.valor) continue;
    const frac = f.valor / total;
    const a1 = a0 + frac * 2 * Math.PI;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    let d;
    if (frac >= 0.9999) {
      d = `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` + (r0 ? `M${cx - r0} ${cy}a${r0} ${r0} 0 1 1 ${2 * r0} 0a${r0} ${r0} 0 1 1 ${-2 * r0} 0` : "");
    } else {
      const [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r), [x3, y3] = pt(a1, r0), [x4, y4] = pt(a0, r0);
      d = `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}` +
        (r0 ? `L${x3.toFixed(2)} ${y3.toFixed(2)}A${r0} ${r0} 0 ${grande} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z` : `L${cx} ${cy}Z`);
    }
    s += `<path class="pj-marca" d="${d}" fill="${f.cor}" stroke="#FFFFFF" stroke-width="1.5" fill-rule="evenodd"${dicaAttr(`${f.rotulo}: ${f.valor} (${(100 * frac).toFixed(1)}%)`)}/>`;
    if (frac >= 0.04) {
      const am = (a0 + a1) / 2, [tx, ty] = pt(am, (r + r0) / 2);
      s += `<text x="${tx.toFixed(1)}" y="${(ty + tam * 0.35).toFixed(1)}" font-size="${tam - 1}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${(100 * frac).toFixed(0)}%</text>`;
    }
    a0 = a1;
  }
  let ly = cy - (fatias.length * (tam + 10)) / 2 + tam;
  const lx = cx + r + 22;
  for (const f of fatias) {
    s += `<rect x="${lx}" y="${ly - tam + 2}" width="${tam}" height="${tam}" rx="2" fill="${f.cor}"/>`;
    s += `<text x="${lx + tam + 6}" y="${ly}" font-size="${tam}" fill="${COR.TINTA}">${esc(f.rotulo)} <tspan fill="${COR.TINTA_CLARA}">(${f.valor})</tspan></text>`;
    ly += tam + 10;
  }
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// linha com marcadores (curva cumulativa)
// pontos: [{ x, y, texto?, dica? }]
// ---------------------------------------------------------------------------
export function linha(pontos, o = {}) {
  const tam = o.fonte || 12;
  const W = o.largura || 560, H = o.altura || 300;
  const margemEsq = 46, topo = 18, base = H - 40 - (o.tituloX ? tam + 4 : 0);
  const xs = pontos.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ymax = o.ymax || Math.max(10, ...pontos.map((p) => p.y)) * 1.15;
  const pad = 30;
  const X = (v) => (x1 === x0 ? (margemEsq + W - 10) / 2 : margemEsq + pad + ((v - x0) / (x1 - x0)) * (W - margemEsq - 10 - 2 * pad));
  const Y = (v) => base - (v / ymax) * (base - topo);
  let s = cabecalhoSvg(W, H, o.fundo);
  for (const t of ticks(ymax)) {
    if (t > ymax + 1e-9) continue;
    s += `<line x1="${margemEsq}" y1="${Y(t).toFixed(1)}" x2="${W - 10}" y2="${Y(t).toFixed(1)}" stroke="${COR.GRADE}" stroke-width="1"/>`;
    s += `<text x="${margemEsq - 6}" y="${(Y(t) + tam * 0.35).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="end">${fmt(t)}</text>`;
  }
  s += `<line x1="${margemEsq}" y1="${base}" x2="${W - 10}" y2="${base}" stroke="${COR.LINHA}" stroke-width="1"/>`;
  for (const p of pontos) {
    s += `<text x="${X(p.x).toFixed(1)}" y="${base + tam + 6}" font-size="${tam - 1}" fill="${COR.TINTA}" text-anchor="middle">${fmt(p.x)}</text>`;
  }
  s += `<polyline points="${pontos.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")}" fill="none" stroke="${o.cor || COR.MATA}" stroke-width="2.2"/>`;
  for (const p of pontos) {
    s += `<g class="pj-marca"${dicaAttr(p.dica)}><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="5" fill="${o.corPonto || COR.COBRE}" stroke="#FFFFFF" stroke-width="1.5"/>` +
      `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="14" fill="transparent"/></g>`;
    if (p.texto) s += `<text x="${X(p.x).toFixed(1)}" y="${(Y(p.y) - 10).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(p.texto)}</text>`;
  }
  if (o.tituloY) s += `<text transform="translate(12 ${((topo + base) / 2).toFixed(1)}) rotate(-90)" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloY)}</text>`;
  if (o.tituloX) s += `<text x="${((margemEsq + W) / 2).toFixed(1)}" y="${H - 6}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloX)}</text>`;
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// atalhos usados no relatório
// ---------------------------------------------------------------------------
const hachuraDominio = (d) => (d === "Fecal" ? "" : d === "Fecal + Lâmina" ? "cruz" : "diag");

/** Barras de prevalência por espécie (tabela especies_resumo ou similar). */
export function graficoEspecies(esp, o = {}) {
  const d = [...esp].sort((a, b) => b.prevalencia - a.prevalencia);
  const vmax = Math.max(...d.map((r) => r.prevalencia), 0);
  const cats = [...new Set(d.map((r) => r.categoria))];
  const ordemCat = ["Patogênico", "Comensal", "Não classificado"].filter((c) => cats.includes(c));
  return barrasH(d.map((r) => ({
    rotulo: r.especie, valor: r.prevalencia, cor: COR_CATEGORIA[r.categoria] || COR.SALVIA,
    texto: `${Number(r.prevalencia).toFixed(1)}%`,
    dica: `${r.especie}\n${r.categoria}\nPrevalência: ${Number(r.prevalencia).toFixed(1)}%\nn = ${r.n}` +
      (r.ic95_inf !== null && r.ic95_inf !== undefined ? `\nIC 95%: ${r.ic95_inf.toFixed(1)}–${r.ic95_sup.toFixed(1)}%` : ""),
  })), {
    xmax: Math.max(10, Math.min(115, vmax * 1.3)), tituloX: "Prevalência (%)",
    legenda: o.semLegenda ? [] : ordemCat.map((c) => ({ cor: COR_CATEGORIA[c], rotulo: c })), ...o,
  });
}

/** Gráfico unificado (fezes + lâmina): cor = categoria, hachura = tipo de amostra. */
export function graficoTodos(todos, o = {}) {
  const d = [...todos].sort((a, b) => b.prevalencia - a.prevalencia);
  const vmax = Math.max(...d.map((r) => r.prevalencia), 0);
  const cats = ["Patogênico", "Comensal", "Não classificado"].filter((c) => d.some((r) => r.categoria === c));
  const doms = [...new Set(d.map((r) => (r.dominio === "Fecal" ? "Fecal" : r.dominio === "Fecal + Lâmina" ? "Fecal + Lâmina" : "Lâmina")))];
  const leg = cats.map((c) => ({ cor: COR_CATEGORIA[c], rotulo: c }));
  if (doms.length > 1 || doms[0] !== "Fecal") {
    for (const dm of ["Fecal", "Lâmina", "Fecal + Lâmina"]) {
      if (doms.includes(dm)) leg.push({ cor: COR.TINTA_CLARA, hachura: dm === "Fecal" ? "" : dm === "Lâmina" ? "diag" : "cruz", rotulo: dm });
    }
  }
  return barrasH(d.map((r) => ({
    rotulo: r.especie, valor: r.prevalencia, cor: COR_CATEGORIA[r.categoria] || COR.SALVIA, hachura: hachuraDominio(r.dominio),
    texto: o.comMetodos ? `${Number(r.prevalencia).toFixed(1)}% · ${r.metodos}` : `${Number(r.prevalencia).toFixed(1)}%`,
    dica: `${r.especie}\n${r.categoria} · ${r.dominio}\nPrevalência: ${Number(r.prevalencia).toFixed(1)}% (${r.n} de ${r.base_n})\nMétodo(s): ${r.metodos}`,
  })), { xmax: Math.max(10, Math.min(115, vmax * 1.3)), tituloX: "Prevalência (%)", legenda: leg, ...o });
}

// ---------------------------------------------------------------------------
// funil (padrões territoriais): pontos = municípios, x = nº de pacientes,
// y = % positivos; faixa de 95% sombreada, limites de 99,8% em linha fina.
// pontos: [{ nome, n, prev (0–100), f95, f998, dica }] · limite(n, q) -> 0–1
// ---------------------------------------------------------------------------
export function funil(pontos, p0, limite, o = {}) {
  const tam = o.fonte || 12;
  const W = o.largura || 640, H = o.altura || 340;
  const legenda = [
    { cor: COR.COBRE, rotulo: "Acima da faixa" }, { cor: COR.MATA, rotulo: "Abaixo da faixa" },
    { cor: COR.SALVIA, rotulo: "Dentro do esperado" }, { cor: "#E3EEE8", rotulo: "Faixa de 95%" },
  ];
  // legenda quebra em linhas quando não cabe (celular)
  const linhasLeg = [[]];
  let larg = 0;
  for (const it of legenda) {
    const w = (tam - 1) + 5 + larguraTexto(it.rotulo, tam - 1) + 16;
    if (larg + w > W && linhasLeg[linhasLeg.length - 1].length) { linhasLeg.push([]); larg = 0; }
    linhasLeg[linhasLeg.length - 1].push(it); larg += w;
  }
  const topo = linhasLeg.length * (tam + 6) + 16, margemEsq = 44, margemDir = 14;
  const base = H - 40 - (o.tituloX ? tam + 4 : 0);
  const nMax = Math.max(...pontos.map((p) => p.n));
  const xmax = nMax * 1.06, xmin = 0;
  const nMin = Math.max(2, Math.min(...pontos.map((p) => p.n)));
  const curva = (q) => {
    const out = [];
    for (let i = 0; i <= 60; i++) {
      const n = Math.round(nMin + (xmax - nMin) * (i / 60) ** 1.6);
      if (!out.length || out[out.length - 1][0] !== n) out.push([n, 100 * limite(n, q)]);
    }
    return out;
  };
  const sup95 = curva(0.975), inf95 = curva(0.025), sup998 = curva(0.999), inf998 = curva(0.001);
  const ymax = Math.min(100, Math.max(10, ...pontos.map((p) => p.prev), ...sup998.filter(([n]) => n >= nMin * 2).map(([, v]) => v)) * 1.1);
  const X = (n) => margemEsq + ((n - xmin) / (xmax - xmin)) * (W - margemEsq - margemDir);
  const Y = (v) => base - (Math.min(v, ymax) / ymax) * (base - topo);
  let s = cabecalhoSvg(W, H, o.fundo);
  linhasLeg.forEach((l, i) => { s += legendaHorizontal(l, 0, tam + 2 + i * (tam + 6), tam - 1)[0]; });
  for (const t of ticks(ymax)) {
    if (t > ymax + 1e-9) continue;
    s += `<line x1="${margemEsq}" y1="${Y(t).toFixed(1)}" x2="${W - margemDir}" y2="${Y(t).toFixed(1)}" stroke="${COR.GRADE}" stroke-width="1"/>`;
    s += `<text x="${margemEsq - 6}" y="${(Y(t) + tam * 0.35).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="end">${fmt(t)}</text>`;
  }
  for (const t of ticks(xmax, 6)) {
    if (t > xmax) continue;
    s += `<text x="${X(t).toFixed(1)}" y="${base + tam + 6}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${fmt(t)}</text>`;
  }
  s += `<line x1="${margemEsq}" y1="${base}" x2="${W - margemDir}" y2="${base}" stroke="${COR.LINHA}" stroke-width="1"/>`;
  const caminho = (pts) => pts.map(([n, v], i) => `${i ? "L" : "M"}${X(n).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  s += `<path d="${caminho(sup95)}${caminho([...inf95].reverse()).replace(/^M/, "L")}Z" fill="#E3EEE8"/>`;
  for (const c of [sup998.filter(([, v]) => v <= ymax), inf998]) if (c.length > 1) s += `<path d="${caminho(c)}" fill="none" stroke="${COR.SALVIA}" stroke-width="1.2"/>`;
  s += `<line x1="${X(nMin).toFixed(1)}" y1="${Y(p0).toFixed(1)}" x2="${(W - margemDir).toFixed(1)}" y2="${Y(p0).toFixed(1)}" stroke="${COR.MATA}" stroke-width="1"/>`;
  s += `<text x="${(W - margemDir).toFixed(1)}" y="${(Y(p0) - 5).toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="end">média ${p0.toFixed(1)}%</text>`;
  const cor = (p) => (p.f95 === "acima" ? COR.COBRE : p.f95 === "abaixo" ? COR.MATA : COR.SALVIA);
  const ord = [...pontos].sort((a, b) => (a.f95 ? 1 : 0) - (b.f95 ? 1 : 0));
  for (const p of ord) {
    const cx = X(p.n), cy = Y(p.prev);
    s += `<g class="pj-marca"${dicaAttr(p.dica)}><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${p.f95 ? 5 : 4}" fill="${cor(p)}" stroke="${o.fundo || COR.SUPERFICIE}" stroke-width="2"/>` +
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="transparent"/></g>`;
  }
  // rótulos só para quem ficou fora da faixa de 95%: à direita do ponto, ou à
  // esquerda se colidir; se ainda colidir, fica só na dica e na tabela
  const caixas = pontos.map((p) => ({ x0: X(p.n) - 5, x1: X(p.n) + 5, y0: Y(p.prev) - 5, y1: Y(p.prev) + 5 }));
  const colide = (b) => caixas.some((c) => b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0);
  for (const p of [...pontos].filter((q) => q.f95).sort((a, b) => b.n - a.n)) {
    const cx = X(p.n), cy = Y(p.prev), w = larguraTexto(p.nome, tam - 1);
    const ty = Math.min(cy + tam * 0.35, base - 6);
    const opcoes = [{ x0: cx + 8, x1: cx + 8 + w, anc: "start", tx: cx + 8 }, { x0: cx - 8 - w, x1: cx - 8, anc: "end", tx: cx - 8 }]
      .map((b) => ({ ...b, y0: ty - tam, y1: ty + 2 }))
      .filter((b) => b.x0 >= margemEsq && b.x1 <= W - margemDir);
    const ok = opcoes.find((b) => !colide(b));
    if (!ok) continue;
    caixas.push(ok);
    s += `<text x="${ok.tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${tam - 1}" fill="${COR.TINTA}" text-anchor="${ok.anc}">${esc(p.nome)}</text>`;
  }
  if (o.tituloY) s += `<text transform="translate(12 ${((topo + base) / 2).toFixed(1)}) rotate(-90)" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloY)}</text>`;
  if (o.tituloX) s += `<text x="${((margemEsq + W) / 2).toFixed(1)}" y="${H - 6}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloX)}</text>`;
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// pontos com IC95% (faixa etária): uma linha por grupo, até 2 séries
// grupos: [{ rotulo, valores: [{ v, inf, sup, dica } | null por série] }]
// series: [{ rotulo, cor }]
// ---------------------------------------------------------------------------
export function pontosIC(grupos, series, o = {}) {
  const tam = o.fonte || 12;
  const W = o.largura || 600;
  const passo = 40;
  const topo = series.length > 1 ? tam + 18 : 8;
  const maxRot = Math.max(...grupos.map((g) => larguraTexto(g.rotulo, tam)), 20);
  const margemEsq = Math.min(W * 0.4, maxRot + 14), margemDir = 16;
  const plotBot = topo + grupos.length * passo;
  const H = plotBot + 36 + (o.tituloX ? tam + 4 : 0);
  const vmax = Math.max(10, ...grupos.flatMap((g) => g.valores.filter(Boolean).map((x) => x.sup ?? x.v)));
  const xmax = Math.min(100, vmax * 1.08);
  const X = (v) => margemEsq + (Math.min(v, xmax) / xmax) * (W - margemEsq - margemDir);
  let s = cabecalhoSvg(W, H, o.fundo);
  if (series.length > 1) {
    let cx = 0;
    for (const se of series) {
      s += `<line x1="${cx}" y1="${tam - 2}" x2="${cx + 14}" y2="${tam - 2}" stroke="${se.cor}" stroke-width="2"/><circle cx="${cx + 7}" cy="${tam - 2}" r="4" fill="${se.cor}"/>`;
      s += `<text x="${cx + 20}" y="${tam + 2}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}">${esc(se.rotulo)}</text>`;
      cx += 20 + larguraTexto(se.rotulo, tam - 1) + 18;
    }
  }
  for (const t of ticks(xmax)) {
    if (t > xmax + 1e-9) continue;
    s += `<line x1="${X(t).toFixed(1)}" y1="${topo}" x2="${X(t).toFixed(1)}" y2="${plotBot}" stroke="${COR.GRADE}" stroke-width="1"/>`;
    s += `<text x="${X(t).toFixed(1)}" y="${plotBot + tam + 4}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${fmt(t)}</text>`;
  }
  s += `<line x1="${margemEsq}" y1="${plotBot}" x2="${W - margemDir}" y2="${plotBot}" stroke="${COR.LINHA}" stroke-width="1"/>`;
  grupos.forEach((g, i) => {
    const yc = topo + i * passo + passo / 2;
    s += `<text x="${margemEsq - 10}" y="${(yc + tam * 0.35).toFixed(1)}" font-size="${tam}" fill="${COR.TINTA}" text-anchor="end">${esc(g.rotulo)}</text>`;
    g.valores.forEach((x, k) => {
      if (!x) return;
      const y = yc + (series.length > 1 ? (k === 0 ? -6 : 6) : 0);
      const cor = series[k].cor;
      s += `<g class="pj-marca"${dicaAttr(x.dica)}>`;
      if (x.inf !== null && x.inf !== undefined) s += `<line x1="${X(x.inf).toFixed(1)}" y1="${y}" x2="${X(x.sup).toFixed(1)}" y2="${y}" stroke="${cor}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>`;
      s += `<circle cx="${X(x.v).toFixed(1)}" cy="${y}" r="4.5" fill="${cor}" stroke="${o.fundo || COR.SUPERFICIE}" stroke-width="2"/>`;
      s += `<rect x="${margemEsq}" y="${(y - 6).toFixed(1)}" width="${W - margemEsq - margemDir}" height="12" fill="transparent"/></g>`;
    });
  });
  if (o.tituloX) s += `<text x="${((margemEsq + W) / 2).toFixed(1)}" y="${H - 6}" font-size="${tam - 1}" fill="${COR.TINTA_SUAVE}" text-anchor="middle">${esc(o.tituloX)}</text>`;
  return s + "</svg>";
}
