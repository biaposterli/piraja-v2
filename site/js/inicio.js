// Página inicial do Pirajá (escolha da área de análise). Só desenha o ícone do
// cadeado e registra o service worker — a análise fica nas páginas de cada área.
import { icones } from "./ilustracoes.js";

for (const el of document.querySelectorAll('[data-icone="cadeado"]')) {
  el.insertAdjacentHTML("afterbegin", icones.cadeado("#F4F1EA", "#D08A6A"));
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready)
    .then(() => { const o = document.getElementById("offline"); if (o) o.hidden = false; })
    .catch((e) => console.warn("Service worker não registrado:", e));
}
