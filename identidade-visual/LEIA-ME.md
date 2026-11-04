# Identidade visual Pirajá · arquivos SVG

Assinaturas do Pirajá (marca-mãe) e do módulo Pirajá · Entero, em SVG vetorial.

- `svg/piraja/` — Pirajá: horizontal, vertical, símbolo e logotipo
- `svg/piraja-entero/` — Pirajá · Entero: horizontal, vertical e símbolo
- `svg/favicon/` — ícone para telas pequenas (fundo mata e fundo papel)
- `piraja-entero-svg.zip` — todos os arquivos acima

Cada assinatura existe em quatro versões: `cor` (sobre fundos claros), `negativo` (sobre mata ou folha),
`preto` e `branco` (impressão de uma cor). Não redesenhe, gire, distorça nem altere os pontos do símbolo.

## Áreas de análise (Entero, Hemo, Bac, Virus, Fungi)

Todas as áreas usam o mesmo símbolo e o mesmo logotipo "Pirajá". Cada uma muda só a
**cor de destaque** (os pontos de cor do símbolo e o descritor) e o **descritor**:

| Área | Descritor | Cor (fundo claro) | Cor (negativo, sobre a mata) | Pictograma |
|---|---|---|---|---|
| Parasitos intestinais | ENTERO | cobre `#9C4A2F` | `#D08A6A` | ovo de helminto |
| Hemoparasitos | HEMO | carmim `#A3243B` | `#E8909C` | hemácia com trofozoíto em anel |
| Bactérias | BAC | ocre `#8C6410` | `#E0BC5C` | bacilo flagelado e cadeia de cocos |
| Vírus | VIRUS | anil `#2B5C8F` | `#93B8DE` | capsídeo icosaédrico com espículas |
| Fungos | FUNGI | ameixa `#6E4580` | `#C7A3D2` | conidióforo |

- `svg/piraja-<área>/` — horizontal, vertical e símbolo em cor, negativo, preto e branco
- `svg/favicon/piraja-<área>-favicon-{papel,mata}.svg` — ícone pequeno de cada área
- `svg/pictogramas/` — pictograma de cada área (cor e negativo), para cartões e menus
- `piraja-areas-svg.zip` — todos os arquivos das áreas

Os arquivos são gerados por `python3 tools/gerar_areas.py` a partir das assinaturas do
Entero. Para mudar uma cor ou um descritor, altere a tabela `AREAS` no script e rode de novo.
