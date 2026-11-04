// Seções do relatório em PDF que quem usa pode marcar ou desmarcar (aba
// Exportar). As escolhas ficam guardadas neste navegador; o resumo inicial e a
// nota metodológica saem sempre.

export const SECOES_PDF = [
  { id: "fezes", nome: "Fezes — todos os parasitos x só patogênicos", grupo: "Parasitos" },
  { id: "lamina", nome: "Lâmina — todos os parasitos x só patogênicos", grupo: "Parasitos" },
  { id: "todos", nome: "Todos os parasitos num só gráfico (fezes e lâmina)", grupo: "Parasitos" },
  { id: "especies_fecais", nome: "Espécies dos métodos fecais (gráfico grande e tabela)", grupo: "Parasitos" },
  { id: "poli", nome: "Mono x poliparasitismo e combinações", grupo: "Parasitos" },
  { id: "amostragem", nome: "Material entregue por paciente", grupo: "Pacientes" },
  { id: "idade", nome: "Faixa etária", grupo: "Pacientes", requer: "idade" },
  { id: "municipio", nome: "Prevalência por município", grupo: "Território", requer: "territorio" },
  { id: "bairro", nome: "Prevalência por bairro", grupo: "Território", requer: "territorio" },
  { id: "mapa", nome: "Mapa", grupo: "Território", requer: "mapa" },
  { id: "metodos", nome: "Comparação entre métodos e teste de McNemar", grupo: "Métodos" },
  { id: "metodo_especie", nome: "Prevalência por método e espécie", grupo: "Métodos" },
  { id: "metodo_especie_ic", nome: "Tabela de IC 95% de cada método e espécie (longa)", grupo: "Métodos" },
  { id: "potes", nome: "Efeito do nº de potes e curva cumulativa", grupo: "Métodos" },
  { id: "base", nome: "Amostra da base por paciente (30 primeiras linhas)", grupo: "Anexos" },
];

/** Seleção "Resumido": o essencial para um relatório curto. */
export const RESUMIDO = new Set(["fezes", "lamina", "amostragem", "idade", "municipio", "mapa", "metodos"]);

export const BAIRRO_MIN_PADRAO = 1;
const CHAVE = "piraja.opcoesPdf";

/** { secoes: { id: bool }, bairroMin } — padrão: tudo marcado, todos os bairros. */
export function lerOpcoesPdf() {
  const padrao = { secoes: Object.fromEntries(SECOES_PDF.map((s) => [s.id, true])), bairroMin: BAIRRO_MIN_PADRAO };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (salvo && typeof salvo === "object") {
      return { secoes: { ...padrao.secoes, ...(salvo.secoes || {}) }, bairroMin: Number(salvo.bairroMin) >= 1 ? Math.trunc(salvo.bairroMin) : padrao.bairroMin };
    }
  } catch { /* navegador sem armazenamento: usa o padrão */ }
  return padrao;
}

export function salvarOpcoesPdf(op) {
  try { localStorage.setItem(CHAVE, JSON.stringify(op)); } catch { /* ignora */ }
}
