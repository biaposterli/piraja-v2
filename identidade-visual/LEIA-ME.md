# Identidade visual Pirajá · arquivos SVG

Assinaturas do Pirajá (marca-mãe) e do módulo Pirajá · Entero, em SVG vetorial.

- `svg/piraja/` — Pirajá: horizontal, vertical, símbolo e logotipo
- `svg/piraja-entero/` — Pirajá · Entero: horizontal, vertical e símbolo
- `svg/favicon/` — ícone para telas pequenas (fundo mata e fundo papel)
- `piraja-entero-svg.zip` — todos os arquivos acima

Cada assinatura existe em quatro versões: `cor` (sobre fundos claros), `negativo` (sobre mata ou folha),
`preto` e `branco` (impressão de uma cor). Não redesenhe, gire, distorça nem altere os pontos do símbolo.

## Áreas de análise (Entero, Hemo, Bac, Virus, Fungi, Entomo)

Segue a regra do design system: **cada área mantém a população de 19 pontos e ganha um
desenho próprio para os 3 positivos**, sempre nas mesmas posições. O logotipo "Pirajá" não muda.
A forma, e não só a cor, diferencia as áreas — inclusive em impressão de uma cor.

| Área | Descritor | Positivos | Cor (fundo claro) | Cor (negativo) | Pictograma |
|---|---|---|---|---|---|
| Parasitos intestinais | ENTERO | ponto sólido | cobre `#9C4A2F` | `#D08A6A` | ovo de helminto |
| Hemoparasitos | HEMO | anel | vinho `#5B2A4A` | `#C99AB8` | hemácia com trofozoíto em anel |
| Bactérias | BAC | bastonete | ocre `#7A5812` | `#D8B562` | bacilo flagelado e cadeia de cocos |
| Vírus | VIRUS | vírion com espículas | ardósia `#35506A` | `#9FB6CD` | capsídeo com espículas |
| Fungos | FUNGI | levedura brotando | castanho `#6A4A2F` | `#CBA788` | conidióforo |
| Vetores e ectoparasitos | ENTOMO | artrópode de seis patas | anil `#3E3C6C` | `#ADAAD8` | carrapato |

Em preto e branco, o Entero usa anel (como no original) e o Hemo, anel com ponto central;
as outras formas ficam sólidas, porque a silhueta já as distingue dos negativos.

- `svg/piraja-<área>/` — horizontal, vertical e símbolo em cor, negativo, preto e branco
- `svg/favicon/piraja-<área>-favicon-{papel,mata}.svg` — ícone pequeno de cada área
- `svg/pictogramas/` — pictograma de cada área (cor e negativo), para cartões e menus
- `piraja-areas-svg.zip` — todos os arquivos das áreas

Os arquivos são gerados por `python3 tools/gerar_areas.py` a partir das assinaturas do
Entero. Para mudar uma cor, forma ou descritor, altere `AREAS` e `forma()` no script e rode de novo.
