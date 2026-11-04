// Pirajá · Entero — versão web (roda inteiramente no navegador).
// Controla os passos 01–04: modelo, envio da planilha, configuração e relatório.

import { esc, sortedStr, normText } from "./util.js";
import { TODAS, criteriosAtivos, coletasDuplicadas, coletasNaoReconhecidas, REQUIRED_COLUMNS, CATEGORIAS_VALIDAS, categoriaDe } from "./engine.js";
import { sugerirEspecie, ehEspeciePadrao } from "./sugestoes.js";
import { SECOES_PDF, RESUMIDO, salvarOpcoesPdf } from "./opcoes-pdf.js";
import { COLUNAS_IDADE, PRESETS, lerIdades, presetAutomatico, lerCortes, lerConfigIdade, faixas, nomesDoPreset } from "./idade.js";
import { AMOSTRAS_VALIDAS, atualizarContagens, construirConfig } from "./config.js";
import { lerPlanilha } from "./tabela.js";
import { prepararPlanilha, estadoInicialConfig, analisar } from "./pipeline.js";
import { renderRelatorio, desenharGraficos } from "./relatorio.js";
import { ligarOrdenacao } from "./tabelas.js";
import * as I from "./ilustracoes.js";

const PAPEL = "#F4F1EA";

// colunas da planilha que nunca são método (não aparecem como opção no passo 03)
const COLUNAS_NAO_METODO = new Set([...REQUIRED_COLUMNS, "nome_crianca", "nome_responsavel", "status_amostra",
  "status_lamina", "observacoes", "observacao", "bairro", "municipio", "uf", ...COLUNAS_IDADE]);

const S = {
  arquivo: null, planilha: null, df: null, cfgPlanilha: null,
  idades: null, // idade de cada paciente (lerIdades), quando a planilha tem idade
  cfg: null, // configuração aplicada: { par, met, n, max, crit, avisos, origem }
  rascunho: null, // edições ainda não aplicadas
  pendente: false,
  resultado: null,
  mapa: null, // { titulo, png (Uint8Array), largura, altura } quando o mapa foi gerado
  abaCfg: "cfg-par",
  abaRel: "rel-geral",
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);

// ===================================================================== navegação (app)
const SECOES = [
  { id: "inicio", nome: "Início", icone: () => I.icones.visao(PAPEL, "#D08A6A") },
  { id: "planilha", nome: "Planilha", icone: () => I.icones.upload(PAPEL, "#D08A6A") },
  { id: "configurar", nome: "Configurar", icone: () => I.icones.criterios(PAPEL, "#D08A6A"), precisaDados: true },
  { id: "relatorio", nome: "Relatório", icone: () => I.icones.parasito(PAPEL, "#D08A6A"), precisaDados: true },
  { id: "ajuda", nome: "Ajuda", icone: () => I.icones.paciente(PAPEL, "#D08A6A") },
];
const TITULOS = { inicio: "Painel de análise epidemiológica", planilha: "Enviar planilha", configurar: "Configurar a análise",
  relatorio: "Relatório", ajuda: "Ajuda" };
let secaoAtual = "inicio";

function montarNav() {
  const botoes = (movel) => SECOES.map((s) => `<button type="button" data-ir="${s.id}"${movel ? "" : ` title="${s.nome}"`}${s.precisaDados ? " data-precisa-dados" : ""}>` +
    `${movel ? "" : s.icone()}<span>${s.nome}</span></button>` + (!movel && s.id === "relatorio" ? `<div class="pj-subnav" id="subnav" hidden></div>` : "")).join("");
  $("#nav").innerHTML = botoes(false);
  $("#mnav").innerHTML = botoes(true);
  atualizarNav();
}

function atualizarNav() {
  const temDados = Boolean(S.df && S.resultado && !S.resultado.erros?.length);
  for (const b of document.querySelectorAll("[data-ir]")) {
    if (b.closest(".pj-nav, .pj-mnav")) b.setAttribute("aria-current", b.dataset.ir === secaoAtual ? "page" : "false");
    if (b.hasAttribute("data-precisa-dados")) b.classList.toggle("sem-dados", !temDados);
  }
  const sub = $("#subnav");
  if (sub) sub.hidden = !(temDados && secaoAtual === "relatorio");
  const chip = $("#arquivo-atual");
  if (chip) {
    chip.hidden = !S.arquivo;
    if (S.arquivo) chip.innerHTML = `<span>Planilha</span><b title="${esc(S.arquivo.nome)}">${esc(S.arquivo.nome)}</b>`;
  }
}

/** Sub-itens do Relatório no menu lateral (as abas do relatório). */
function montarSubnav() {
  const sub = $("#subnav");
  if (!sub) return;
  const abas = [...document.querySelectorAll('#relatorio .pj-abas[data-grupo="rel"] .pj-aba')];
  sub.innerHTML = abas.map((a) => `<button type="button" data-sub="${a.dataset.aba}" aria-current="${a.dataset.aba === S.abaRel ? "true" : "false"}">${esc(a.textContent.trim())}</button>`).join("");
}

function ir(id, { rolar = true, historico = true } = {}) {
  const s = SECOES.find((x) => x.id === id) || SECOES[0];
  if (s.precisaDados && !(S.df && S.resultado)) {
    if (historico) toast("Envie uma planilha primeiro.");
    return ir("planilha", { rolar, historico });
  }
  secaoAtual = s.id;
  for (const v of document.querySelectorAll("[data-view]")) v.hidden = v.dataset.view !== s.id;
  $("#titulo-secao").textContent = TITULOS[s.id];
  document.title = s.id === "inicio" ? "Pirajá · Painel de análise epidemiológica" : `${TITULOS[s.id]} · Pirajá`;
  if (historico && location.hash !== `#${s.id}`) history.pushState(null, "", `#${s.id}`);
  atualizarNav();
  if (s.id === "relatorio") { montarSubnav(); desenharGraficos(); }
  if (rolar) scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

// ===================================================================== barra lateral recolhível
const lerPref = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

function recolherBarra(recolher, salvar = true) {
  document.body.classList.toggle("barra-recolhida", recolher);
  const b = $('[data-acao="recolher-barra"]');
  if (b) {
    b.setAttribute("aria-expanded", String(!recolher));
    const t = recolher ? "Expandir a barra lateral" : "Recolher a barra lateral";
    b.setAttribute("aria-label", t); b.title = t;
  }
  if (salvar) gravarPref("piraja.barraRecolhida", recolher ? "1" : "0");
  setTimeout(() => desenharGraficos(), 220); // gráficos acompanham a nova largura
}

// ===================================================================== planilha de teste e uso sem internet
const PLANILHA_TESTE = "exemplos/Planilha_Teste_Piraja.xlsx";

async function abrirTeste() {
  const d = $("#aviso-offline");
  if (d?.open) d.close();
  try {
    const r = await fetch(PLANILHA_TESTE);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arq = new File([await r.blob()], "Planilha_Teste_Piraja.xlsx", { type: XLSX_MIME });
    ir("planilha");
    await carregarArquivo(arq, { teste: true });
  } catch (e) {
    toast(`Não consegui abrir a planilha de teste (${e.message || e}). Confira a conexão.`);
  }
}

function mostrarAvisoOffline(forcar = false) {
  const d = $("#aviso-offline");
  if (!d || typeof d.showModal !== "function") return;
  if (!forcar && (lerPref("piraja.avisoOffline") === "nunca" || lerPref("piraja.offlinePronto") === "1")) return;
  if (!d.open) d.showModal();
}

function ligarAvisoOffline() {
  const d = $("#aviso-offline");
  if (!d) return;
  d.addEventListener("close", () => { if ($("#aviso-offline-nunca")?.checked) gravarPref("piraja.avisoOffline", "nunca"); });
  // fecha ao clicar fora da caixa
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  setTimeout(() => mostrarAvisoOffline(), 600);
}

/** Baixa e guarda (pelo service worker) as malhas de todos os estados para mapas sem internet. */
async function baixarMapas(botao) {
  const st = $("#mapas-status");
  try {
    // geo/arquivos.json lista as malhas que existem; a malha "detalhe" (51 MB, usada só
    // no recorte de um município) fica de fora e é guardada quando for usada
    const lista = await (await fetch("geo/arquivos.json")).json();
    const urls = ["geo/arquivos.json", "geo/ufs_2025.geojson.gz", "geo/municipios_indice.json.gz",
      "vendor/shp.min.js", "vendor/proj4.js", "vendor/polylabel.js",
      ...lista.filter((f) => !f.startsWith("malha_municipal_detalhe/")).map((f) => `geo/${f}`)];
    let feitos = 0, ok = 0;
    if (botao) botao.disabled = true;
    const fila = [...urls];
    const trabalhar = async () => {
      while (fila.length) {
        const u = fila.shift();
        try { const r = await fetch(u); if (r.ok) { await r.arrayBuffer(); ok++; } } catch { /* arquivo que não existe para a UF */ }
        feitos++;
        if (st) st.textContent = `Baixando os mapas… ${Math.round(100 * feitos / urls.length)}%`;
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
    if (st) st.textContent = `Pronto: ${ok} arquivos de mapa guardados neste aparelho.`;
    toast("Mapas de todos os estados guardados para uso sem internet.");
  } catch (e) {
    if (st) st.textContent = `Não foi possível baixar os mapas agora (${e.message || e}). Confira a conexão.`;
  } finally {
    if (botao) botao.disabled = false;
  }
}

// ===================================================================== app instalável
let pedidoInstalacao = null;

function ligarApp() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) { const el = $("#instalado"); if (el) el.hidden = false; }
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedidoInstalacao = e;
    for (const b of document.querySelectorAll('[data-acao="instalar"]')) b.hidden = false;
  });
  addEventListener("appinstalled", () => {
    pedidoInstalacao = null;
    for (const b of document.querySelectorAll('[data-acao="instalar"]')) b.hidden = true;
    toast("Pirajá instalado. Ele abre como app e funciona sem internet.");
  });
  // iPhone/iPad: não há aviso de instalação; o botão leva às instruções
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && !standalone) for (const b of document.querySelectorAll('[data-acao="instalar"]')) b.hidden = false;

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready)
      .then(() => { const o = $("#offline"); if (o) o.hidden = false; })
      .catch((e) => console.warn("Service worker não registrado:", e));
  }
  // abrir uma planilha direto pelo sistema ("Abrir com > Pirajá", no app instalado)
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (p) => {
      if (p.files && p.files.length) { ir("planilha"); carregarArquivo(await p.files[0].getFile()); }
    });
  }
}

async function instalar() {
  if (pedidoInstalacao) {
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice.catch(() => null);
    pedidoInstalacao = null;
    return;
  }
  ir("ajuda");
  $("#como-instalar")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===================================================================== início
function iniciar() {
  $("#hero").insertAdjacentHTML("beforeend", I.microscopio());
  $("#etapas").innerHTML = I.ETAPAS.map(([k, t, d, fn]) =>
    `<div class="pj-etapa">${fn()}<div class="k">${esc(k)}</div><div class="t">${esc(t)}</div><p>${esc(d)}</p></div>`).join("");
  for (const el of document.querySelectorAll("[data-icone]")) {
    const nome = el.dataset.icone;
    const svg = nome === "baixar-claro" ? I.icones.baixar() : nome === "baixar" ? I.icones.baixar(PAPEL, PAPEL)
      : nome === "upload" ? I.icones.upload() : nome === "cadeado" ? I.icones.cadeado(PAPEL, "#D08A6A") : "";
    el.insertAdjacentHTML("afterbegin", svg);
  }
  ligarOrdenacao();
  ligarDicas();
  let tempoResize = 0;
  addEventListener("resize", () => { clearTimeout(tempoResize); tempoResize = setTimeout(() => desenharGraficos(), 150); });
  document.addEventListener("toggle", () => desenharGraficos(), true); // <details> aberto
  document.addEventListener("click", aoClicar);
  document.addEventListener("change", aoMudar);
  document.addEventListener("input", aoDigitar);

  const input = $("#arquivo"), drop = $("#drop");
  input.addEventListener("change", () => input.files[0] && carregarArquivo(input.files[0]));
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("sobre"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("sobre"); });
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) carregarArquivo(f); });

  montarNav();
  if (lerPref("piraja.barraRecolhida") === "1") recolherBarra(true, false);
  ligarAvisoOffline();
  addEventListener("popstate", () => ir(location.hash.slice(1) || "inicio", { historico: false }));
  ir(location.hash.slice(1) || "inicio", { rolar: false, historico: false });
  ligarApp();
}

// ===================================================================== utilidades de interface
function alerta(tipo, txt) {
  return `<div class="pj-alerta ${tipo}">${txt}</div>`;
}

export function toast(msg, ms = 3800) {
  const t = document.createElement("div");
  t.className = "pj-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function baixar(dados, nome, tipo) {
  const blob = dados instanceof Blob ? dados : new Blob([dados], { type: tipo || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function comBotao(btn, fn) {
  const txt = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Gerando…"; }
  try { await fn(); } catch (e) {
    console.error(e);
    toast("Não foi possível gerar o arquivo: " + (e.message || e));
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
}

function ligarDicas() {
  const dica = $("#dica");
  const mostrar = (el, x, y) => {
    dica.textContent = el.dataset.dica;
    dica.hidden = false;
    const r = dica.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    dica.style.left = `${Math.max(8, left)}px`;
    dica.style.top = `${Math.max(8, top)}px`;
  };
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest?.("[data-dica]");
    if (el) mostrar(el, e.clientX, e.clientY); else dica.hidden = true;
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest?.("[data-dica]");
    if (el) { const r = el.getBoundingClientRect(); mostrar(el, r.left, r.bottom); }
  });
  document.addEventListener("focusout", () => { dica.hidden = true; });
  document.addEventListener("scroll", () => { dica.hidden = true; }, { passive: true });
}

function trocarAba(btn) {
  const grupo = btn.closest("[data-grupo]").dataset.grupo;
  const alvo = btn.dataset.aba;
  for (const b of btn.parentElement.querySelectorAll(".pj-aba")) b.setAttribute("aria-selected", String(b === btn));
  for (const p of document.querySelectorAll(`[data-painel][data-grupo="${grupo}"]`)) p.hidden = p.dataset.painel !== alvo;
  if (grupo === "cfg") S.abaCfg = alvo;
  if (grupo === "rel") {
    S.abaRel = alvo;
    for (const b of document.querySelectorAll("#subnav [data-sub]")) b.setAttribute("aria-current", String(b.dataset.sub === alvo));
  }
  desenharGraficos();
}

// ===================================================================== eventos
async function aoClicar(e) {
  const aba = e.target.closest(".pj-aba");
  if (aba) { trocarAba(aba); return; }
  const destino = e.target.closest("[data-ir]");
  if (destino) { ir(destino.dataset.ir); return; }
  const sub = e.target.closest("[data-sub]");
  if (sub) {
    const alvo = document.querySelector(`#relatorio .pj-aba[data-aba="${sub.dataset.sub}"]`);
    if (alvo) { trocarAba(alvo); $("#relatorio")?.scrollIntoView({ block: "start" }); }
    return;
  }
  const el = e.target.closest("[data-acao]");
  if (!el) {
    if (document.body.classList.contains("menu-aberto") && !e.target.closest("#barra")) fecharMenu();
    return;
  }
  const acao = el.dataset.acao;
  if (el.tagName === "A") e.preventDefault();
  if (acao === "instalar") instalar();
  else if (acao === "recolher-barra") recolherBarra(!document.body.classList.contains("barra-recolhida"));
  else if (acao === "abrir-teste") abrirTeste();
  else if (acao === "baixar-mapas") baixarMapas(el);
  else if (acao === "menu") {
    const aberto = document.body.classList.toggle("menu-aberto");
    el.setAttribute("aria-expanded", String(aberto));
    el.textContent = aberto ? "✕ Fechar" : "☰ Menu";
  } else if (acao === "baixar-modelo") {
    await comBotao(el, async () => {
      const { gerarModelo } = await import("./planilhas.js");
      baixar(await gerarModelo(), "Modelo_Levantamento_Parasitoses.xlsx", XLSX_MIME);
    });
  } else if (acao === "trocar-arquivo") { ir("planilha"); $("#arquivo").click(); }
  else if (acao === "aplicar") aplicarConfig();
  else if (acao === "pdf-sel") {
    const sel = el.dataset.sel;
    for (const cb of document.querySelectorAll("[data-pdf]")) cb.checked = sel === "tudo" || (sel === "resumido" && RESUMIDO.has(cb.dataset.pdf));
    salvarOpcoesPdf(opcoesPdfDoDom());
  } else if (acao === "usar-sugestao" || acao === "usar-todas-sugestoes") {
    lerRascunhoDoDom();
    const idx = acao === "usar-sugestao" ? [Number(el.dataset.i)] : S.rascunho.par.map((_, i) => i);
    const n = idx.reduce((t, i) => t + usarSugestao(i), 0);
    if (n) { marcarPendente(); renderConfig(); toast(`${n} sugestão(ões) usada(s). Clique em Aplicar para atualizar o relatório.`); }
  } else if (acao === "descartar") { S.rascunho = clonarCfg(S.cfg); S.pendente = false; renderConfig(); }
  else if (acao === "add-metodo") {
    lerRascunhoDoDom();
    S.rascunho.met.push({ Incluir: true, Coluna: null, "Método": "", Amostra: AMOSTRAS_VALIDAS[0] });
    marcarPendente();
    renderConfig();
  } else if (acao === "rem-metodo") {
    lerRascunhoDoDom();
    S.rascunho.met.splice(Number(el.dataset.i), 1);
    marcarPendente();
    renderConfig();
  } else if (acao === "baixar-config") {
    await comBotao(el, async () => {
      const { configXlsx } = await import("./planilhas.js");
      baixar(await configXlsx(S.cfg.par, S.cfg.met, S.cfg.n, S.cfg.crit, S.cfg.idade?.cortes), `Configuracao_${baseNome()}.xlsx`, XLSX_MIME);
    });
  } else if (acao === "baixar-planilha-config") {
    await comBotao(el, async () => {
      const { planilhaComConfig } = await import("./planilhas.js");
      const b = await planilhaComConfig(S.arquivo.buffer, S.arquivo.nome, S.planilha, S.cfg.par, S.cfg.met, S.cfg.n, S.cfg.crit, S.cfg.idade?.cortes);
      baixar(b, `${baseNome()}_com_configuracao.xlsx`, XLSX_MIME);
    });
  } else if (acao === "baixar-excel") {
    await comBotao(el, async () => {
      const { relatorioExcel } = await import("./planilhas.js");
      baixar(await relatorioExcel(S.resultado.metrics, S.cfg, idadeRel()), "Relatorio_Analise_Epidemiologica.xlsx", XLSX_MIME);
    });
  } else if (acao === "baixar-pdf") {
    await comBotao(el, async () => {
      const { gerarPdf } = await import("./pdf.js");
      const opcoes = opcoesPdfDoDom();
      if (!Object.values(opcoes.secoes).some(Boolean)) toast("Nenhuma seção marcada: o PDF terá só o resumo e a nota metodológica.");
      baixar(await gerarPdf(S.resultado.metrics, { mapa: S.mapa, idade: idadeRel(), opcoes }), "Relatorio_Analise_Epidemiologica.pdf", "application/pdf");
    });
  }
}

function fecharMenu() {
  document.body.classList.remove("menu-aberto");
  const btn = $(".pj-menu");
  if (btn) { btn.setAttribute("aria-expanded", "false"); btn.textContent = "☰ Menu"; }
}

/** Seções marcadas na aba Exportar (as que não aparecem ali ficam como estavam). */
function opcoesPdfDoDom() {
  const secoes = Object.fromEntries(SECOES_PDF.map((s) => [s.id, true]));
  for (const cb of document.querySelectorAll("[data-pdf]")) secoes[cb.dataset.pdf] = cb.checked;
  const b = Number(document.querySelector("[data-pdf-bairro]")?.value);
  return { secoes, bairroMin: Number.isFinite(b) && b >= 1 ? Math.trunc(b) : 1 };
}

function aoMudar(e) {
  const t = e.target;
  if (t.matches("[data-pdf], [data-pdf-bairro]")) { salvarOpcoesPdf(opcoesPdfDoDom()); return; }
  if (t.dataset.campo === "idade_preset" || t.dataset.campo === "idade_cortes") {
    lerRascunhoDoDom();
    if (t.dataset.campo === "idade_preset" && t.value) S.rascunho.idade.texto = PRESETS.find((p) => p.id === t.value).cortes.join(", ");
    marcarPendente();
    renderConfig();
    return;
  }
  if (t.closest("#passo-3") && t.dataset.campo) { lerRascunhoDoDom(); marcarPendente(); }
  if (t.closest("#passo-3") && t.dataset.campo === "Incluir") t.closest("tr")?.classList.toggle("fora", !t.checked);
  if (t.id === "mapa-on") alternarMapa(t.checked);
}

function aoDigitar(e) {
  if (e.target.closest("#passo-3") && e.target.dataset.campo) marcarPendente();
}

function marcarPendente() {
  S.pendente = true;
  const m = $("#cfg-pendente");
  if (m) m.hidden = false;
}

// ===================================================================== passo 02 — arquivo
async function carregarArquivo(file, { teste = false } = {}) {
  const msgs = $("#msgs-arquivo");
  const info = $("#arquivo-info");
  msgs.innerHTML = `<div class="pj-carregando">Lendo a planilha…</div>`;
  for (const id of ["#passo-3", "#msgs-relatorio", "#relatorio"]) $(id).innerHTML = "";
  S.mapa = null;
  S.df = null; S.resultado = null;
  atualizarNav();
  try {
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("envie um arquivo .xlsx ou .xls");
    const buffer = await file.arrayBuffer();
    const planilha = await lerPlanilha(buffer, file.name);
    S.arquivo = { nome: file.name, buffer, teste };
    S.planilha = planilha;
    info.hidden = false;
    info.innerHTML = `<b>${esc(file.name)}</b> · ${(file.size / 1024).toFixed(0)} KB ` +
      `<button class="pj-btn sec peq" type="button" data-acao="trocar-arquivo">Trocar arquivo</button>`;
    const prep = prepararPlanilha(planilha);
    if (prep.erros.length) {
      msgs.innerHTML = prep.erros.map((x) => alerta("erro", esc(x))).join("");
      return;
    }
    msgs.innerHTML = "";
    S.df = prep.df;
    S.cfgPlanilha = prep.cfgPlanilha;
    S.cfg = estadoInicialConfig(prep.df, prep.cfgPlanilha);
    S.idades = lerIdades(prep.df);
    if (S.idades) {
      const daPlanilha = lerConfigIdade(planilha);
      S.cfg.idade = { cortes: daPlanilha || presetAutomatico(S.idades).cortes, daPlanilha: Boolean(daPlanilha) };
    }
    S.rascunho = clonarCfg(S.cfg);
    S.pendente = false;
    S.abaCfg = "cfg-par";
    S.abaRel = "rel-geral";
    renderTudo();
    // com nomes a conferir (sugestões de grafia) ou erro, abre Configurar; senão, o relatório
    const conferir = S.cfg.par.some((r) => sugestaoLinha(r)?.sugestao);
    ir(S.resultado && !S.resultado.erros.length && !conferir ? "relatorio" : "configurar");
    if (conferir) toast("Alguns nomes de parasitos parecem grafias diferentes. Confira as sugestões antes de ler o relatório.", 5000);
  } catch (e) {
    console.error(e);
    S.df = null;
    msgs.innerHTML = alerta("erro", `Não consegui ler esse arquivo. Confira se é um .xlsx válido, exportado a partir do modelo. (${esc(e.message || e)})`);
  }
}

const baseNome = () => S.arquivo.nome.replace(/\.[^.]+$/, "");

function clonarCfg(c) {
  return {
    ...c, par: c.par.map((r) => ({ ...r })), met: c.met.map((r) => ({ ...r })), crit: { ...c.crit },
    idade: c.idade ? { ...c.idade, texto: c.idade.cortes.join(", ") } : null,
  };
}

// ===================================================================== passo 03 — configuração
function opcoesColunas() {
  return S.df.columns.filter((c) => !COLUNAS_NAO_METODO.has(c));
}

function optionList(opcoes, atual, rotulo = (v) => v) {
  return opcoes.map((v) => `<option value="${esc(v)}"${String(v) === String(atual) ? " selected" : ""}>${esc(rotulo(v))}</option>`).join("");
}

// Sugestão de grafia para um parasito da tabela do passo 03 (só para nomes fora
// da lista e ainda não agrupados). Nunca é aplicada sem o clique de quem usa.
function sugestaoLinha(r) {
  if (ehEspeciePadrao(r.Parasito) || String(r["Agrupar como"] ?? "").trim()) return null;
  return sugerirEspecie(r.Parasito);
}

function celulaParasito(r, i) {
  const s = sugestaoLinha(r);
  let extra = "";
  if (s && s.sugestao) {
    extra = `<div class="pj-sugestao"><span>Você quis dizer <i>${esc(s.sugestao)}</i>?</span>` +
      `<button class="pj-btn sec peq" type="button" data-acao="usar-sugestao" data-i="${i}" data-dica="${esc(`Preenche 'Agrupar como' com ${s.sugestao} (${s.motivo}). Depois, clique em Aplicar.`)}">Usar</button></div>`;
  } else if (s && r["Classificação"] === "Não classificado") {
    extra = `<div class="pj-sugestao nada">Não reconhecido: ${esc(s.motivo)}. Classifique à mão.</div>`;
  }
  return `<td>${esc(r.Parasito)}${extra}</td>`;
}

function usarSugestao(i) {
  const r = S.rascunho.par[i];
  const s = sugestaoLinha(r);
  if (!s || !s.sugestao) return 0;
  r["Agrupar como"] = s.sugestao;
  const alvo = S.rascunho.par.find((x) => x.Parasito === s.sugestao);
  r["Classificação"] = alvo ? alvo["Classificação"] : categoriaDe(s.sugestao);
  return 1;
}

function editorParasitos(par) {
  const linhas = par.map((r, i) => `<tr class="${r.Incluir ? "" : "fora"}" data-i="${i}">` +
    `<td><input type="checkbox" data-campo="Incluir" data-tab="par" data-i="${i}"${r.Incluir ? " checked" : ""} aria-label="Incluir ${esc(r.Parasito)}"></td>` +
    celulaParasito(r, i) +
    `<td><select data-campo="Classificação" data-tab="par" data-i="${i}">${optionList(CATEGORIAS_VALIDAS, r["Classificação"])}</select></td>` +
    `<td><input type="text" data-campo="Agrupar como" data-tab="par" data-i="${i}" value="${esc(r["Agrupar como"] ?? "")}" aria-label="Agrupar ${esc(r.Parasito)} como"></td>` +
    `<td>${esc(r["Encontrado em"] ?? "")}</td><td class="num">${r["Ocorrências"] ?? 0}</td></tr>`).join("");
  return `<div class="pj-tabela-wrap" style="max-height:440px"><table class="pj-tabela pj-editor"><thead><tr>` +
    `<th>Incluir</th><th>Parasito</th><th>Classificação</th><th data-dica="Opcional. Nome final da espécie no relatório.">Agrupar como</th>` +
    `<th>Encontrado em</th><th class="num" data-dica="Nº de células de resultado com esse parasito.">Ocorrências</th></tr></thead>` +
    `<tbody>${linhas || `<tr><td colspan="6" class="pj-vazio">Nenhum parasito encontrado nos resultados.</td></tr>`}</tbody></table></div>`;
}

function editorMetodos(met) {
  const opc = opcoesColunas();
  const linhas = met.map((r, i) => {
    const ops = r.Coluna && !opc.includes(r.Coluna) ? [r.Coluna, ...opc] : opc;
    return `<tr class="${r.Incluir ? "" : "fora"}">` +
      `<td><input type="checkbox" data-campo="Incluir" data-tab="met" data-i="${i}"${r.Incluir ? " checked" : ""}></td>` +
      `<td><select data-campo="Coluna" data-tab="met" data-i="${i}"><option value=""${r.Coluna ? "" : " selected"}>— escolha —</option>${optionList(ops, r.Coluna)}</select></td>` +
      `<td><input type="text" data-campo="Método" data-tab="met" data-i="${i}" value="${esc(r["Método"] ?? "")}"></td>` +
      `<td><select data-campo="Amostra" data-tab="met" data-i="${i}">${optionList(AMOSTRAS_VALIDAS, r.Amostra || AMOSTRAS_VALIDAS[0])}</select></td>` +
      `<td><button class="pj-btn sec peq" type="button" data-acao="rem-metodo" data-i="${i}" aria-label="Remover linha">✕</button></td></tr>`;
  }).join("");
  return `<div class="pj-tabela-wrap" style="max-height:440px"><table class="pj-tabela pj-editor"><thead><tr>` +
    `<th>Incluir</th><th>Coluna na planilha</th><th>Nome do método</th><th>Tipo de amostra</th><th></th></tr></thead>` +
    `<tbody>${linhas}</tbody></table></div>` +
    `<button class="pj-btn sec peq" type="button" data-acao="add-metodo" style="margin-top:8px">+ Adicionar método</button>`;
}

function lerRascunhoDoDom() {
  const R = S.rascunho;
  for (const el of document.querySelectorAll("#passo-3 [data-campo]")) {
    const campo = el.dataset.campo;
    const v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.tab === "par") R.par[Number(el.dataset.i)][campo] = v;
    else if (el.dataset.tab === "met") R.met[Number(el.dataset.i)][campo] = campo === "Coluna" ? (v || null) : v;
    else if (campo === "n") R.n = Number(v);
    else if (campo === "min_fezes" || campo === "min_lamina") R.crit[campo] = Number(v);
    else if (campo === "excluir_inconclusivos" || campo === "exigir_todos_metodos") R.crit[campo] = Boolean(v);
    else if (campo === "idade_cortes" && R.idade) R.idade.texto = v;
  }
}

function avisoSugestoes(par) {
  const n = par.filter((r) => sugestaoLinha(r)?.sugestao).length;
  if (!n) return "";
  return alerta("info", `${n === 1 ? "Um nome parece" : `${n} nomes parecem`} grafia diferente de uma espécie da lista. ` +
    `Confira a sugestão em cada linha e clique em <b>Usar</b>, ou ` +
    `<a href="#" data-acao="usar-todas-sugestoes">usar todas as sugestões</a>. Nada é agrupado sem a sua confirmação; depois, clique em <b>Aplicar</b>.`);
}

function renderConfig() {
  const C = S.cfg, R = S.rascunho;
  const cont = $("#passo-3");
  const partes = { parasitos: "parasitos", metodos: "métodos", n_amostras: "nº de amostras", criterios: "critérios de inclusão" };
  let h = `<div class="pj-step"><div class="badge">3</div><h2>Configure a análise</h2></div>`;
  h += C.origem.length
    ? alerta("ok", `Configuração lida da própria planilha (${C.origem.map((k) => partes[k]).join(", ")}). Revise abaixo; se mudar algo, clique em <b>Aplicar</b>.`)
    : alerta("info", "Esta planilha não tem abas de configuração, então a lista abaixo foi montada com o que aparece nos resultados. Marque os parasitos e métodos que entram na análise, classifique cada parasito e defina a quantidade de amostras. Depois, baixe a configuração para não precisar repetir.");
  for (const a of C.avisos) h += alerta("aviso", esc(a));

  const abas = [["cfg-par", "Parasitos", I.icones.parasito()], ["cfg-met", "Métodos", I.icones.microscopio()],
    ["cfg-amo", "Amostras", I.icones.pote()], ["cfg-cri", "Critérios de inclusão", I.icones.criterios()]];
  if (R.idade) abas.push(["cfg-ida", "Faixa etária", I.icones.paciente()]);
  h += `<div class="pj-abas" role="tablist" data-grupo="cfg">` + abas.map(([id, t, ic]) =>
    `<button class="pj-aba" type="button" role="tab" aria-selected="${S.abaCfg === id}" data-aba="${id}">${ic}${t}</button>`).join("") + `</div>`;

  // parasitos
  h += `<div data-painel="cfg-par" data-grupo="cfg"${S.abaCfg === "cfg-par" ? "" : " hidden"}>` +
    `<div class="pj-legenda">Desmarque <b>Incluir</b> para deixar um parasito fora da análise (uma amostra que só tinha parasitos excluídos passa a contar como negativa). A <b>Classificação</b> define o que entra nos gráficos de patogênicos. Use <b>Agrupar como</b> para juntar nomes diferentes da mesma espécie — escreva o nome final nas linhas a juntar.</div>` +
    avisoSugestoes(R.par) + editorParasitos(R.par) + `</div>`;
  // métodos
  h += `<div data-painel="cfg-met" data-grupo="cfg"${S.abaCfg === "cfg-met" ? "" : " hidden"}>` +
    `<div class="pj-legenda">Marque os métodos que entram na análise e indique o tipo de amostra: métodos de <b>Fezes</b> e de <b>Lâmina (Graham)</b> são sempre analisados separadamente. Para usar um método fora do catálogo, adicione uma linha e escolha a coluna da planilha.</div>` +
    editorMetodos(R.met) + `</div>`;
  // amostras
  const mx = C.max || 0;
  const limite = Math.max(mx, C.n, 1);
  h += `<div data-painel="cfg-amo" data-grupo="cfg"${S.abaCfg === "cfg-amo" ? "" : " hidden"}>` +
    `<label class="pj-campo"><span>Quantidade de amostras (coletas) por paciente</span>` +
    `<input type="number" data-campo="n" min="1" max="${limite}" step="1" value="${Math.min(R.n, limite)}"` +
    ` data-dica="Coletas P1..Pn consideradas. Coletas acima desse número são ignoradas."></label>` +
    `<div class="pj-legenda">${mx ? `A planilha tem coletas até <b>P${mx}</b>. ` : "Nenhum rótulo P1, P2... reconhecido. "}Reduzir o número permite, por exemplo, ver o resultado com só 1 ou 2 amostras por paciente.</div></div>`;
  // critérios (opções seguem a quantidade de amostras aplicada, como no app original)
  const nRef = C.n;
  const opcoesMin = [0, ...Array.from({ length: Math.max(0, nRef - 1) }, (_, i) => i + 1), TODAS];
  const rotMin = (v) => (v === 0 ? "Sem exigência" : v === TODAS ? `Todas as coletas (P1–P${nRef})` : `Pelo menos ${v}`);
  const atual = (v) => (v === TODAS || opcoesMin.includes(v) ? v : (v >= nRef ? TODAS : 0));
  h += `<div data-painel="cfg-cri" data-grupo="cfg"${S.abaCfg === "cfg-cri" ? "" : " hidden"}>` +
    `<div class="pj-legenda">Defina quais pacientes entram na análise. Quem não atender a algum critério fica <b>fora de todas as contas</b> (numeradores e denominadores) e aparece no relatório na lista de excluídos, com o motivo. Com tudo desligado, todos os pacientes entram.</div>` +
    `<div class="pj-cols c2"><label class="pj-campo"><span>Coletas com pote de fezes entregue</span><select data-campo="min_fezes" data-dica="Nº mínimo de coletas (P1..Pn) em que o paciente entregou o pote de fezes.">` +
    optionList(opcoesMin, atual(R.crit.min_fezes), rotMin) + `</select></label>` +
    `<label class="pj-campo"><span>Coletas com lâmina entregue</span><select data-campo="min_lamina" data-dica="Nº mínimo de coletas (P1..Pn) em que o paciente entregou a lâmina.">` +
    optionList(opcoesMin, atual(R.crit.min_lamina), rotMin) + `</select></label></div>` +
    `<label class="pj-check"><input type="checkbox" data-campo="excluir_inconclusivos"${R.crit.excluir_inconclusivos ? " checked" : ""}>` +
    `<span>Excluir paciente com alguma amostra sem resultado <span class="pj-ajuda" data-dica="Amostra entregue com 'Amostra insuficiente' ou célula vazia em algum método incluído.">?</span></span></label>` +
    `<label class="pj-check"><input type="checkbox" data-campo="exigir_todos_metodos"${R.crit.exigir_todos_metodos ? " checked" : ""}>` +
    `<span>Excluir paciente com algum método não realizado <span class="pj-ajuda" data-dica="Algum método incluído marcado 'Não realizado' em amostra entregue.">?</span></span></label>` +
    `<div class="pj-legenda">Exemplo: para considerar só quem entregou e teve analisadas <b>todas</b> as amostras, escolha <i>Todas as coletas</i> para fezes (e lâmina, se for o caso) e marque as duas opções. A quantidade de coletas segue a aba <b>Amostras</b>.</div></div>`;

  if (R.idade) h += painelIdade(R);
  h += `<div class="pj-pendente"><button class="pj-btn" type="button" data-acao="aplicar">Aplicar configuração e atualizar relatório</button>` +
    `<span class="marcador" id="cfg-pendente"${S.pendente ? "" : " hidden"}>Há alterações ainda não aplicadas · ` +
    `<a href="#" data-acao="descartar">descartar</a></span></div>`;

  // configuração em uso
  const { cfg, avisos } = construirConfig(C.par, C.met, C.n, C.crit);
  for (const a of avisos) h += alerta("aviso", esc(a));
  const fezes = cfg.metodos.filter((m) => m[3] === "fecal").map((m) => m[1]);
  const lamina = cfg.metodos.filter((m) => m[3] === "lamina").map((m) => m[1]);
  const cats = [...cfg.categorias.values()];
  h += `<div class="pj-legenda" style="margin-top:12px"><b>Em uso:</b> ${cfg.categorias.size} parasito(s) — ${cats.filter((c) => c === "Patogênico").length} patogênico(s), ` +
    `${cats.filter((c) => c === "Comensal").length} comensal(is)${cfg.excluidos.size ? `, ${cfg.excluidos.size} excluído(s)` : ""} · fezes: ${esc(fezes.join(", ") || "—")} · ` +
    `lâmina: ${esc(lamina.join(", ") || "—")} · até P${cfg.n_amostras} por paciente${criteriosAtivos(cfg.criterios) ? " · critérios de inclusão ligados." : "."}</div>`;
  h += `<div class="pj-btns"><button class="pj-btn" type="button" data-acao="baixar-config">${I.icones.baixar(PAPEL, PAPEL)} Baixar só a configuração (.xlsx)</button>` +
    `<button class="pj-btn" type="button" data-acao="baixar-planilha-config" data-dica="A mesma planilha enviada, com as abas Config_* anexadas. Da próxima vez, é só enviar este arquivo.">${I.icones.baixar(PAPEL, PAPEL)} Baixar minha planilha com a configuração</button></div>`;
  cont.innerHTML = h;
}

function painelIdade(R) {
  const I2 = S.idades;
  const cortes = lerCortes(R.idade.texto);
  const atual = PRESETS.find((p) => cortes && p.cortes.join() === cortes.join());
  const fonte = { idade: "coluna idade", idade_anos: "coluna idade_anos", idade_meses: "coluna idade_meses",
    data_nascimento: "data_nascimento e data_coleta" }[I2.fonte];
  const fmt = (x) => (x < 2 ? `${Math.round(x * 12)} meses` : `${x.toFixed(1).replace(".", ",")} anos`);
  let prev = "";
  if (cortes) {
    const fx = faixas(cortes, nomesDoPreset(cortes));
    const cont = fx.map(() => 0);
    for (const a of I2.porId.values()) { const i = fx.findIndex((f) => a >= f.ini && a < f.fim); if (i >= 0) cont[i]++; }
    prev = `<div class="pj-faixa pj-faixa-idade" style="grid-template-columns:repeat(${fx.length}, minmax(0, 1fr))">` +
      fx.map((f, i) => `<div><span class="v">${cont[i]}</span><span class="r">${esc(f.rotulo)}</span></div>`).join("") + `</div>`;
  }
  const avisos = [];
  if (I2.nSemIdade) avisos.push(`${I2.nSemIdade} paciente(s) sem idade ficam fora da análise por faixa etária`);
  if (I2.invalidos) avisos.push(`${I2.invalidos} célula(s) de idade não reconhecida(s)`);
  if (I2.inconsistentes) avisos.push(`${I2.inconsistentes} paciente(s) com idades diferentes entre as coletas (foi usada a da 1ª coleta)`);
  if (I2.semColetaData) avisos.push("há data_nascimento mas falta a coluna data_coleta, então a idade não pôde ser calculada");
  return `<div data-painel="cfg-ida" data-grupo="cfg"${S.abaCfg === "cfg-ida" ? "" : " hidden"}>` +
    `<div class="pj-legenda">Idade lida da ${fonte}: ${I2.nComIdade} paciente(s), de ${fmt(I2.min ?? 0)} a ${fmt(I2.max ?? 0)}. ` +
    `Escolha faixas padrão ou escreva os limites inferiores, em anos (ex.: <b>0, 2, 4, 6</b> = 0–1, 2–3, 4–5 e 6 anos ou mais).</div>` +
    `<div class="pj-cols c2"><label class="pj-campo"><span>Faixas padrão</span><select data-campo="idade_preset">` +
    `<option value=""${atual ? "" : " selected"}>Personalizadas</option>` +
    PRESETS.map((p) => `<option value="${p.id}"${atual === p ? " selected" : ""}>${esc(p.nome)} — ${p.cortes.join(", ")}</option>`).join("") +
    `</select></label><label class="pj-campo"><span>Limites inferiores das faixas (anos)</span>` +
    `<input type="text" data-campo="idade_cortes" value="${esc(R.idade.texto)}" inputmode="decimal" data-dica="Números separados por vírgula. Cada número começa uma faixa; a última vai até o fim."></label></div>` +
    (cortes ? `<div class="pj-secao-sub" style="margin-top:6px">Pacientes por faixa</div>${prev}` : alerta("aviso", "Limites inválidos: use números de 0 a 120 separados por vírgula.")) +
    (avisos.length ? `<div class="pj-legenda" style="margin-top:8px">Atenção: ${esc(avisos.join("; "))}.</div>` : "") + `</div>`;
}

function aplicarConfig() {
  lerRascunhoDoDom();
  const R = S.rascunho;
  let idade = S.cfg.idade;
  if (R.idade) {
    const c = lerCortes(R.idade.texto);
    if (!c) { toast("Faixas etárias inválidas: use números separados por vírgula (ex.: 0, 2, 4, 6)."); return; }
    idade = { ...S.cfg.idade, cortes: c };
  }
  const met = R.met.filter((r) => r.Coluna && String(r.Coluna).trim() !== "").map((r) => ({
    Incluir: r.Incluir ?? true, Coluna: r.Coluna,
    "Método": typeof r["Método"] === "string" && r["Método"].trim() ? r["Método"] : r.Coluna,
    Amostra: r.Amostra || AMOSTRAS_VALIDAS[0],
  }));
  const par = R.par.map((r) => ({ ...r, Incluir: r.Incluir ?? true, "Agrupar como": r["Agrupar como"] ?? "" }));
  const limite = Math.max(S.cfg.max || 0, S.cfg.n, 1);
  const n = Math.min(Math.max(1, Math.trunc(R.n) || 1), limite);
  S.cfg = {
    ...S.cfg, met, par: atualizarContagens(par, S.df, met), n,
    crit: { min_fezes: R.crit.min_fezes, min_lamina: R.crit.min_lamina,
      excluir_inconclusivos: Boolean(R.crit.excluir_inconclusivos), exigir_todos_metodos: Boolean(R.crit.exigir_todos_metodos) },
    avisos: [], idade,
  };
  S.rascunho = clonarCfg(S.cfg);
  S.pendente = false;
  S.mapa = null;
  renderTudo();
  ir("relatorio");
  toast("Configuração aplicada — relatório atualizado.");
}

// idade dos pacientes + faixas escolhidas (null se a planilha não tem idade)
const idadeRel = () => (S.idades && S.cfg.idade ? { idades: S.idades, cortes: S.cfg.idade.cortes } : null);

// ===================================================================== passo 04 — relatório
function renderTudo() {
  $("#relatorio").innerHTML = "";
  renderConfig();
  const r = analisar(S.df, S.cfg);
  S.resultado = r;
  atualizarNav();
  const msgs = $("#msgs-relatorio");
  if (r.erros.length) {
    msgs.innerHTML = r.erros.map((x) => alerta("erro", esc(x))).join("");
    return;
  }
  const m = r.metrics;
  if (m.total === 0 && m.total_antes_criterios) {
    msgs.innerHTML = alerta("erro", `Nenhum dos ${m.total_antes_criterios} pacientes atende aos critérios de inclusão definidos no passo 03. Revise a aba <b>Critérios de inclusão</b>.`);
    return;
  }
  if (m.total === 0) {
    msgs.innerHTML = alerta("erro", "Nenhum paciente identificado. Confira se a coluna <b>id_paciente</b> está preenchida.");
    return;
  }
  const nColetas = S.df.rows.filter((x) => normText(x.id_paciente) !== null).length;
  let h = alerta("ok", `Planilha processada: ${m.total_antes_criterios || m.total} pacientes, ${nColetas} coletas. ` +
    `Métodos detectados: ${esc(m.metodos_ativos_nomes.join(", "))}. Relatório gerado abaixo.`);
  const dups = coletasDuplicadas(S.df);
  if (dups.length) {
    const lista = dups.slice(0, 15).map((d) => `${esc(d.id_paciente)} (${esc(d.coleta)}, ${d.n_linhas} linhas)`).join(", ");
    h += alerta("aviso", `<b>Coletas repetidas na planilha:</b> ${lista}${dups.length > 15 ? ` e mais ${dups.length - 15}` : ""}. Cada coleta repetida foi ` +
      "contada como UM pote/lâmina só; os resultados das linhas repetidas foram somados (positivo em qualquer uma = positivo). Confira se não é erro de digitação ou linha copiada.");
  }
  const ruins = coletasNaoReconhecidas(S.df);
  if (ruins.length) {
    h += alerta("aviso", "<b>Rótulos de coleta não reconhecidos:</b> " + ruins.slice(0, 15).map((x) => `'${esc(x)}'`).join(", ") +
      ". Use P1, P2, P3... Essas linhas entram nas prevalências, mas ficam de fora da curva cumulativa.");
  }
  msgs.innerHTML = h;
  $("#relatorio").innerHTML = renderRelatorio(m, idadeRel());
  const aba = document.querySelector(`#relatorio .pj-aba[data-aba="${S.abaRel}"]`);
  if (aba) trocarAba(aba);
  montarSubnav();
  atualizarNav();
  desenharGraficos();
}

// ===================================================================== mapa (opcional)
async function alternarMapa(ligado) {
  const painel = $("#painel-mapa");
  if (!ligado) { painel.innerHTML = ""; S.mapa = null; atualizarNotaMapa(); return; }
  painel.innerHTML = `<div class="pj-carregando">Carregando o módulo de mapas…</div>`;
  try {
    const { montarPainelMapa } = await import("./mapa-painel.js");
    await montarPainelMapa(painel, S.resultado.metrics, (fig) => {
      S.mapa = fig; atualizarNotaMapa();
      if (fig && S.arquivo?.teste) {
        gravarPref("piraja.offlinePronto", "1");
        toast("Pronto: o Pirajá já pode ser usado sem internet neste aparelho.", 5000);
      }
    });
  } catch (e) {
    console.error(e);
    painel.innerHTML = alerta("erro", `Não foi possível abrir os mapas (${esc(e.message || e)}).`);
  }
}

function atualizarNotaMapa() {
  const n = $("#nota-mapa-pdf");
  if (n) n.textContent = S.mapa ? `Mapa pronto para o PDF: “${S.mapa.titulo}”.` : "";
  const nm = $("#pdf-mapa-nota");
  if (nm) nm.textContent = S.mapa ? `mapa gerado: “${S.mapa.titulo}”` : "gere o mapa na aba Visão geral para incluí-lo";
}

export { S as estado, sortedStr };

iniciar();
