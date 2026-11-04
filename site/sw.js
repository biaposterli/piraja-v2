// Service worker do Pirajá — permite instalar o site como app e usá-lo sem
// internet. Nenhum dado de planilha passa por aqui: só os arquivos do próprio
// site (HTML, CSS, JavaScript, fontes, ícones e malhas do mapa) são guardados.
//
// Estratégias:
//   páginas, CSS e JS  -> rede primeiro (sempre a versão mais nova quando há
//                         internet), com a cópia guardada como reserva;
//   bibliotecas, fontes, marca e malhas do mapa -> cópia guardada primeiro,
//                         atualizada em segundo plano.
// Ao publicar uma versão com arquivos novos no núcleo, aumente VERSAO.

const VERSAO = "piraja-v2-2";
const NUCLEO = `${VERSAO}-nucleo`;
const EXTRAS = `${VERSAO}-extras`;

const ARQUIVOS_NUCLEO = [
  "./", "./index.html", "./404.html", "./manifest.webmanifest", "./css/piraja.css",
  "./js/app.js", "./js/config.js", "./js/engine.js", "./js/graficos.js", "./js/idade.js", "./js/ilustracoes.js",
  "./js/mapa-dados.js", "./js/mapa-desenho.js", "./js/mapa-painel.js", "./js/opcoes-pdf.js", "./js/padroes.js",
  "./js/pdf.js", "./js/pipeline.js", "./js/planilhas.js", "./js/relatorio.js", "./js/sugestoes.js", "./js/tabela.js",
  "./js/tabelas.js", "./js/util.js",
  "./vendor/exceljs.min.js", "./vendor/xlsx.full.min.js", "./vendor/pdfmake.min.js",
  "./brand/piraja-entero-negativo.svg", "./brand/piraja-entero-cor.png", "./brand/piraja-favicon.svg", "./brand/piraja-favicon.png",
  "./brand/parceiros/lapahv.png", "./brand/parceiros/ufrn.png", "./brand/app/icone-192.png", "./brand/app/icone-512.png",
  "./brand/fonts/Fraunces-Regular.ttf", "./brand/fonts/Fraunces-SemiBold.ttf",
  "./brand/fonts/InstrumentSans-Regular.ttf", "./brand/fonts/InstrumentSans-SemiBold.ttf",
  "./exemplos/Planilha_Teste_Piraja.xlsx",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(NUCLEO);
    // um arquivo que falhar não impede a instalação (ele entra depois, no uso)
    await Promise.all(ARQUIVOS_NUCLEO.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSAO)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const ehExtra = (url) => /\/(vendor|geo|brand)\//.test(url.pathname);

async function redePrimeiro(req) {
  const c = await caches.open(NUCLEO);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? await c.match("./index.html") : undefined) ||
      new Response("Sem conexão e sem cópia guardada deste arquivo.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function guardadoPrimeiro(req, ev) {
  const guardado = (await caches.match(req, { ignoreSearch: true }));
  const atualizar = fetch(req).then(async (r) => {
    if (r.ok) (await caches.open(EXTRAS)).put(req, r.clone());
    return r;
  }).catch(() => null);
  if (guardado) { ev.waitUntil(atualizar); return guardado; }
  return (await atualizar) || new Response("", { status: 503 });
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith(ehExtra(url) ? guardadoPrimeiro(req, ev) : redePrimeiro(req));
});
