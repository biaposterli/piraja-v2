"""Gera os ícones do app (PWA) a partir do símbolo do Pirajá.

Uso: python3 tools/gerar_icones.py   (precisa do Playwright com Chromium)
Saída: site/brand/app/icone-{180,192,512}.png e icone-maskable-512.png
"""
import pathlib
import re
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SIMBOLO = (RAIZ / "site/brand/piraja-simbolo-cor.svg").read_text(encoding="utf-8")
PAPEL = "#F4F1EA"
interno = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", SIMBOLO.strip())


def icone(lado, escala):
    # símbolo centralizado sobre o papel; escala = fração do lado ocupada pelo símbolo
    s = lado * escala
    off = (lado - s) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{lado}" height="{lado}" viewBox="0 0 {lado} {lado}">'
            f'<rect width="{lado}" height="{lado}" fill="{PAPEL}"/>'
            f'<g transform="translate({off} {off}) scale({s / 79.68})">{interno}</g></svg>')


SAIDAS = [("icone-180.png", 180, 0.74), ("icone-192.png", 192, 0.74), ("icone-512.png", 512, 0.74),
          ("icone-maskable-512.png", 512, 0.58)]  # maskable: o símbolo fica dentro da zona segura (80%)

with sync_playwright() as p:
    nav = p.chromium.launch()
    pag = nav.new_page(device_scale_factor=1)
    for nome, lado, esc in SAIDAS:
        pag.set_viewport_size({"width": lado, "height": lado})
        pag.set_content(f'<html><body style="margin:0">{icone(lado, esc)}</body></html>')
        pag.screenshot(path=str(RAIZ / "site/brand/app" / nome), clip={"x": 0, "y": 0, "width": lado, "height": lado})
        print("ok", nome)
    nav.close()
