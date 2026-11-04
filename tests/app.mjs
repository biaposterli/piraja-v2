// Confere a parte "app" (PWA): manifesto, ícones e a lista de arquivos que o
// service worker guarda para funcionar sem internet.
// Uso: node tests/app.mjs — termina com código 1 se algo falhar.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const SITE = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "site");
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHOU:", m); } };

const man = JSON.parse(readFileSync(path.join(SITE, "manifest.webmanifest"), "utf8"));
ok(man.name && man.short_name && man.start_url && man.display === "standalone", "manifesto com nome, início e display");
for (const ic of man.icons) ok(existsSync(path.join(SITE, ic.src)), `ícone existe: ${ic.src}`);
ok(man.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), "ícone maskable 512");
ok(man.icons.some((i) => i.sizes === "192x192"), "ícone 192");

const sw = readFileSync(path.join(SITE, "sw.js"), "utf8");
const lista = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
for (const f of lista) ok(f === "" || existsSync(path.join(SITE, f)), `arquivo do núcleo existe: ${f}`);
for (const js of readdirSync(path.join(SITE, "js")).filter((f) => f.endsWith(".js"))) {
  ok(lista.includes(`js/${js}`), `sw.js guarda js/${js} (acrescente em ARQUIVOS_NUCLEO e aumente VERSAO)`);
}
const html = readFileSync(path.join(SITE, "index.html"), "utf8");
ok(html.includes('rel="manifest"') && html.includes("apple-touch-icon"), "index.html aponta manifesto e ícone do iPhone");

if (falhas) { console.log(`${falhas} FALHA(S)`); process.exit(1); }
console.log("TODAS AS VERIFICAÇÕES DO APP PASSARAM");
