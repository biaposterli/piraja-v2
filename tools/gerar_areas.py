"""Gera as assinaturas das áreas do Pirajá (Hemo, Bac, Virus, Fungi) a partir das
assinaturas oficiais do Pirajá · Entero.

O símbolo (os 19 pontos) e o logotipo "Pirajá" ficam idênticos aos do Entero.
Cada área muda só duas coisas:
  - a cor de destaque (os pontos "positivos" do símbolo e o descritor);
  - o descritor (ENTERO -> HEMO, BAC, VIRUS, FUNGI), em Instrument Sans SemiBold,
    com o mesmo corpo, espaçamento e alinhamento do ENTERO.

Uso: python3 tools/gerar_areas.py   (precisa de fonttools e svgelements)
Saída:
  identidade-visual/svg/piraja-<area>/  horizontal, vertical e símbolo em cor, negativo, preto e branco
  identidade-visual/svg/favicon/piraja-<area>-favicon-{papel,mata}.svg
  site/brand/areas/                     arquivos usados pelo site
"""
import pathlib
import re
import shutil

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from svgelements import Matrix, Path

RAIZ = pathlib.Path(__file__).resolve().parent.parent
IV = RAIZ / "identidade-visual/svg"
SITE_AREAS = RAIZ / "site/brand/areas"
FONTE = TTFont(RAIZ / "site/brand/fonts/InstrumentSans-SemiBold.ttf")

COBRE, COBRE_CLARO = "#9C4A2F", "#D08A6A"

# cor de destaque sobre fundo claro / sobre a mata (negativo)
AREAS = {
    "entero": ("ENTERO", COBRE, COBRE_CLARO),
    "hemo": ("HEMO", "#A3243B", "#E8909C"),    # carmim — sangue
    "bac": ("BAC", "#8C6410", "#E0BC5C"),      # ocre — colônias em ágar
    "virus": ("VIRUS", "#2B5C8F", "#93B8DE"),  # anil
    "fungi": ("FUNGI", "#6E4580", "#C7A3D2"),  # ameixa
}

DESC_PATH = re.compile(r'<path d="[^"]*" fill="[^"]*"(?: transform="[^"]*")?></path>(?=</svg>)')


def caixa(svg_path):
    """bbox de um <path ...> (com transform, se houver)."""
    d = re.search(r'd="([^"]*)"', svg_path).group(1)
    p = Path(d)
    t = re.search(r'transform="([^"]*)"', svg_path)
    if t:
        p *= Matrix(t.group(1))
    return p.bbox()


def texto(txt, escala, tracking):
    """Contorno do texto em unidades do SVG, com a linha de base em y=0 e x começando em 0.
    Devolve (d, largura_desenhada, x_esquerdo_da_tinta)."""
    gs = FONTE.getGlyphSet()
    cmap = FONTE.getBestCmap()
    pen = SVGPathPen(gs)
    x = 0.0
    tinta = BoundsPen(gs)
    for i, ch in enumerate(txt):
        g = cmap[ord(ch)]
        m = (escala, 0, 0, -escala, x, 0)
        gs[g].draw(TransformPen(pen, m))
        gs[g].draw(TransformPen(tinta, m))
        x += gs[g].width * escala + (tracking if i < len(txt) - 1 else 0)
    x0, _, x1, _ = tinta.bounds
    return pen.getCommands(), x1 - x0, x0


def calibrar():
    """Acha escala e espaçamento que reproduzem o ENTERO oficial."""
    s = (IV / "piraja-entero/piraja-entero-horizontal-cor.svg").read_text()
    x0, y0, x1, y1 = caixa(DESC_PATH.search(s).group(0))
    # altura da letra E (sem overshoot) = altura de caixa alta da fonte
    alt_cap = FONTE["OS/2"].sCapHeight
    # a caixa do ENTERO inclui o overshoot do O; uso a altura do E medida no próprio SVG
    d = re.search(r'd="([^"]*)"', DESC_PATH.search(s).group(0)).group(1)
    e_sub = next(iter(Path(d).as_subpaths()))
    ey0, ey1 = Path(e_sub).bbox()[1], Path(e_sub).bbox()[3]
    escala = (ey1 - ey0) / alt_cap
    _, larg0, _ = texto("ENTERO", escala, 0)
    tracking = ((x1 - x0) - larg0) / 5
    return escala, tracking, ey1  # ey1 = linha de base do descritor (horizontal)


ESCALA, TRACK, _ = calibrar()


def novo_descritor(svg, rotulo, cor, alinhar):
    m = DESC_PATH.search(svg)
    x0, y0, x1, y1 = caixa(m.group(0))
    d_old = re.search(r'd="([^"]*)"', m.group(0)).group(1)
    t_old = re.search(r'transform="([^"]*)"', m.group(0))
    e = Path(next(iter(Path(d_old).as_subpaths())))
    if t_old:
        e *= Matrix(t_old.group(1))
    base = e.bbox()[3]
    d, larg, tx0 = texto(rotulo, ESCALA, TRACK)
    if alinhar == "esquerda":
        dx = x0 - tx0
    else:  # centro
        dx = (x0 + x1) / 2 - larg / 2 - tx0
    return svg[:m.start()] + f'<path d="{d}" fill="{cor}" transform="translate({dx:.2f} {base:.2f})"></path>' + svg[m.end():]


def gerar():
    SITE_AREAS.mkdir(parents=True, exist_ok=True)
    for area, (rotulo, cor, claro) in AREAS.items():
        dest = IV / f"piraja-{area}"
        dest.mkdir(exist_ok=True)
        for forma in ("horizontal", "vertical", "simbolo"):
            for var in ("cor", "negativo", "preto", "branco"):
                src = (IV / f"piraja-entero/piraja-entero-{forma}-{var}.svg").read_text()
                s = src
                if area != "entero":
                    if var == "cor":
                        s = s.replace(COBRE, cor)
                    elif var == "negativo":
                        s = s.replace(COBRE_CLARO, claro)
                    if forma != "simbolo":
                        fill = {"cor": cor, "negativo": claro, "preto": "#000000", "branco": "#FFFFFF"}[var]
                        s = novo_descritor(s, rotulo, fill, "esquerda" if forma == "horizontal" else "centro")
                    nome = {"simbolo": "símbolo"}.get(forma, forma)
                    s = re.sub(r"<title>.*?</title>", f"<title>Pirajá {rotulo.capitalize()} {nome} {var}</title>", s)
                    (dest / f"piraja-{area}-{forma}-{var}.svg").write_text(s)
                if var in ("cor", "negativo") and forma == "horizontal":
                    shutil.copy(dest / f"piraja-{area}-{forma}-{var}.svg", SITE_AREAS / f"piraja-{area}-{forma}-{var}.svg")
        # favicon: 7 pontos, o de cima à direita na cor da área
        for fundo in ("papel", "mata"):
            f = (IV / f"favicon/piraja-favicon-{fundo}.svg").read_text()
            if area != "entero":
                f = f.replace(COBRE, cor).replace(COBRE_CLARO, claro)
            out = IV / f"favicon/piraja-{area}-favicon-{fundo}.svg"
            out.write_text(f)
            if fundo == "papel":
                shutil.copy(out, SITE_AREAS / f"piraja-{area}-favicon.svg")
        print("ok", area)


MATA, PAPEL = "#11483D", "#F4F1EA"

# Pictogramas (grade de 48): traço na cor da mata, "positivos" em pontos na cor da área —
# a mesma lógica do símbolo, em que os pontos de cor são os achados.
# {t} = cor do traço, {a} = cor de destaque, {f} = cor de fundo (para "furar" um traço)
_T = 'fill="none" stroke="{t}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'


def _hex(cx, cy, r, rot=90):
    import math
    pts = [(cx + r * math.cos(math.radians(rot + 60 * i)), cy + r * math.sin(math.radians(rot + 60 * i))) for i in range(6)]
    return pts


def _pictogramas():
    import math
    p = {}
    # Entero — ovo de helminto: casca dupla e blastômeros
    p["entero"] = (f'<ellipse cx="24" cy="24" rx="13.5" ry="17" {_T}/>'
                   f'<ellipse cx="24" cy="24" rx="9" ry="12.2" {_T} stroke-opacity=".45"/>'
                   '<circle cx="21" cy="20.5" r="3.3" fill="{a}"/><circle cx="27.2" cy="22.5" r="3.3" fill="{a}"/>'
                   '<circle cx="22.6" cy="27.4" r="3.3" fill="{a}"/>')
    # Hemo — hemácia (halo central) com trofozoíto em anel
    p["hemo"] = (f'<circle cx="24" cy="24" r="17" {_T}/>'
                 f'<circle cx="24" cy="24" r="9.5" {_T} stroke-opacity=".38"/>'
                 '<circle cx="30" cy="18.5" r="4.6" fill="none" stroke="{a}" stroke-width="2.2"/>'
                 '<circle cx="33.3" cy="15.4" r="2.6" fill="{a}"/>')
    # Bac — bacilo flagelado e uma cadeia de cocos
    p["bac"] = (f'<rect x="12.5" y="10" width="23" height="11.5" rx="5.75" {_T} transform="rotate(-28 24 15.75)"/>'
                f'<path d="M34.4 10.3c2.6-1.4 3.1 1.8 5.4.6s2.2-3.6 4.6-3.4" {_T}/>'
                '<circle cx="11" cy="35.5" r="3.4" fill="{a}"/><circle cx="18.6" cy="36.8" r="3.4" fill="{a}"/>'
                '<circle cx="26.2" cy="35.5" r="3.4" fill="{a}"/><circle cx="33.8" cy="36.8" r="3.4" fill="{a}"/>')
    # Virus — capsídeo icosaédrico (perfil hexagonal) com espículas
    h = _hex(24, 24, 11.5)
    capsideo = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in h) + " Z"
    espiculas = ""
    for x, y in h:
        ux, uy = (x - 24) / 11.5, (y - 24) / 11.5
        espiculas += f'<path d="M{x:.2f} {y:.2f} L{24 + ux * 17.5:.2f} {24 + uy * 17.5:.2f}" {_T}/>'
        espiculas += f'<circle cx="{24 + ux * 19.8:.2f}" cy="{24 + uy * 19.8:.2f}" r="2.7" fill="{{a}}"/>'
    interno = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in _hex(24, 24, 5.6)) + " Z"
    p["virus"] = f'<path d="{capsideo}" {_T}/>{espiculas}<path d="{interno}" {_T} stroke-opacity=".45"/>'
    # Fungi — conidióforo (tipo Aspergillus): hifa, haste, vesícula e conídios
    conidios = ""
    for ang in range(180, 361, 30):
        x = 24 + 11.8 * math.cos(math.radians(ang))
        y = 20 + 11.8 * math.sin(math.radians(ang))
        conidios += f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.6" fill="{{a}}"/>'
    p["fungi"] = (f'<path d="M7 42.5h34" {_T}/>'
                  f'<path d="M24 42.5V25.6" {_T}/>'
                  f'<circle cx="24" cy="20" r="5.6" {_T}/>' + conidios)
    return p


def pictograma(area, traco=MATA, fundo=None):
    cor = AREAS[area][1] if traco == MATA else AREAS[area][2]
    corpo = _pictogramas()[area].replace("{t}", traco).replace("{a}", cor)
    bg = f'<rect width="48" height="48" rx="12" fill="{fundo}"/>' if fundo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
            f'<title>Pirajá {AREAS[area][0].capitalize()} · pictograma</title>{bg}{corpo}</svg>')


def gerar_pictogramas():
    dest = IV / "pictogramas"
    dest.mkdir(exist_ok=True)
    for area in AREAS:
        (dest / f"piraja-{area}-pictograma-cor.svg").write_text(pictograma(area))
        (dest / f"piraja-{area}-pictograma-negativo.svg").write_text(pictograma(area, traco=PAPEL))
        shutil.copy(dest / f"piraja-{area}-pictograma-cor.svg", SITE_AREAS / f"piraja-{area}-pictograma.svg")
    print("ok pictogramas")


if __name__ == "__main__":
    gerar()
    gerar_pictogramas()
