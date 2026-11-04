// Página inicial do Pirajá (escolha da área de análise): ícone do cadeado,
// botão de instalar o app e service worker. A análise fica nas páginas de cada área.
import { icones } from "./ilustracoes.js";

for (const el of document.querySelectorAll('[data-icone="cadeado"]')) {
  el.insertAdjacentHTML("afterbegin", icones.cadeado("#F4F1EA", "#D08A6A"));
}

// ------------------------------------------------------------ instalar o app
const botoes = () => document.querySelectorAll('[data-acao="instalar"]');
const mostrar = (sim) => { for (const b of botoes()) b.hidden = !sim; };
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let pedido = null;

addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; mostrar(true); });
addEventListener("appinstalled", () => { pedido = null; mostrar(false); });
// iPhone/iPad não têm aviso de instalação: o botão abre as instruções
if (ios && !standalone) mostrar(true);

for (const b of botoes()) {
  b.addEventListener("click", async () => {
    if (pedido) {
      pedido.prompt();
      await pedido.userChoice.catch(() => null);
      pedido = null;
      mostrar(false);
      return;
    }
    const d = document.getElementById("como-instalar");
    document.getElementById("como-instalar-outros").hidden = ios;
    if (d && typeof d.showModal === "function") d.showModal();
  });
}

// ------------------------------------------------------------ service worker
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready)
    .then(() => { const o = document.getElementById("offline"); if (o) o.hidden = false; })
    .catch((e) => console.warn("Service worker não registrado:", e));
}
