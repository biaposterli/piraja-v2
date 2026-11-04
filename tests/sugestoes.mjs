// Teste das sugestões de grafia (site/js/sugestoes.js).
// Uso: node tests/sugestoes.mjs
// Termina com código 1 se algum caso obrigatório falhar.

const { sugerirEspecie } = await import("../site/js/sugestoes.js");
const { PARASITE_MAP } = await import("../site/js/engine.js");

let falhas = 0;
const confere = (nome, esperado) => {
  const r = sugerirEspecie(nome);
  const ok = r.sugestao === esperado;
  if (!ok) { falhas++; console.log(`FALHOU  "${nome}" -> ${r.sugestao} (${r.tipo}: ${r.motivo}); esperado ${esperado}`); }
};

// 1. Casos obrigatórios: devem virar a espécie indicada
const devemAgrupar = {
  "b coli": "Balantidium coli", "B.coli": "Balantidium coli", "b. coli": "Balantidium coli",
  "h nana": "Hymenolepis nana", "H.nana": "Hymenolepis nana", "e nana": "Endolimax nana",
  "e coli": "Entamoeba coli", "E. hartmani": "Entamoeba hartmanni", "e. histolytica": "Entamoeba histolytica/dispar",
  "Entamoeba histolytica": "Entamoeba histolytica/dispar", "Entamoeba dispar": "Entamoeba histolytica/dispar",
  "Giardia": "Giardia lamblia", "giardia sp.": "Giardia lamblia", "Giárdia lamblia": "Giardia lamblia",
  "cistos de Giardia lamblia": "Giardia lamblia", "ovos de Ascaris lumbricoides": "Ascaris lumbricoides",
  "larvas de Strongyloides stercoralis": "Strongyloides stercoralis",
  "Ascaris lumbricoide": "Ascaris lumbricoides", "ascaris": "Ascaris lumbricoides", "Tricuris trichiura": "Trichuris trichiura",
  "trichuris trichiuria": "Trichuris trichiura", "estrongiloides": "Strongyloides stercoralis",
  "Strongiloides stercoralis": "Strongyloides stercoralis", "Enterobius vermiculares": "Enterobius vermicularis",
  "oxiúros": "Enterobius vermicularis", "Ancylostoma duodenale": "Ancilostomídeos", "Necator americanus": "Ancilostomídeos",
  "ancilostomo": "Ancilostomídeos", "Ancilostomideo": "Ancilostomídeos",
  "Taenia solium": "Taenia sp.", "Taenia saginata": "Taenia sp.", "tênia": "Taenia sp.",
  "Iodamoeba bütschlii": "Iodamoeba butschlii", "Iodamoeba buetschlii": "Iodamoeba butschlii",
  "Chilomastix mesnilli": "Chilomastix mesnili", "Endolimax nanna": "Endolimax nana",
  "Hymenolepis nanna": "Hymenolepis nana", "Schistossoma mansoni": "Schistosoma mansoni",
  "blastocistis hominis": "Blastocystis sp.", "Balantidium colli": "Balantidium coli",
  "Entamoeba colli": "Entamoeba coli", "Neobalantidium coli": "Balantidium coli",
};
for (const [n, e] of Object.entries(devemAgrupar)) confere(n, e);

// 2. Casos obrigatórios: NÃO podem ser agrupados (outra espécie ou fora da lista)
const naoPodem = [
  "Hymenolepis diminuta", "H. diminuta", "Entamoeba polecki", "Entamoeba gingivalis", "Entamoeba", "Hymenolepis",
  "Dientamoeba fragilis", "Cryptosporidium sp.", "Cyclospora cayetanensis", "Cystoisospora belli", "Isospora belli",
  "Trichomonas hominis", "Pentatrichomonas hominis", "Fasciola hepatica", "Toxocara canis", "Capillaria hepatica",
  "Diphyllobothrium latum", "Strongyloides fuelleborni", "Schistosoma haematobium", "Trichostrongylus sp.",
  "Enteromonas hominis", "Retortamonas intestinalis", "Sarcocystis sp.",
];
for (const n of naoPodem) confere(n, null);

// 3. Erros de digitação aleatórios nas grafias aceitas (taxa de acerto)
let semente = 7;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const escolhe = (a) => a[Math.floor(rnd() * a.length)];
const estraga = (s) => {
  const c = [...s]; const i = Math.floor(rnd() * c.length);
  switch (escolhe(["troca", "tira", "dobra", "vizinho", "semPonto", "maiusc"])) {
    case "troca": if (i < c.length - 1 && c[i] !== " " && c[i + 1] !== " ") [c[i], c[i + 1]] = [c[i + 1], c[i]]; break;
    case "tira": if (c[i] !== "." && c[i] !== " ") c.splice(i, 1); break;
    case "dobra": if (/[a-z]/.test(c[i])) c.splice(i, 0, c[i]); break;
    case "vizinho": if (/[a-z]/.test(c[i]) && i > 0) c[i] = escolhe([..."aeiourstln"]); break;
    case "semPonto": return s.replace(".", "");
    case "maiusc": return s.toUpperCase();
  }
  return c.join("");
};
const grafias = Object.entries(PARASITE_MAP).filter(([k]) => !k.includes("+++"));
let ok = 0, nenhuma = 0, errada = 0, total = 0; const erros = [], semSug = [];
for (const [g, esp] of grafias) {
  for (let k = 0; k < 25; k++) {
    const t = estraga(g); total++;
    const r = sugerirEspecie(t);
    if (r.sugestao === esp) ok++;
    else if (r.sugestao === null) { nenhuma++; semSug.push(t); }
    else { errada++; erros.push(`${t} -> ${r.sugestao} (era ${esp})`); }
  }
}
console.log(`Erros de digitação: ${total} casos · certas ${(100 * ok / total).toFixed(1)}% · sem sugestão ${(100 * nenhuma / total).toFixed(1)}% · erradas ${(100 * errada / total).toFixed(1)}%`);
if (process.env.VER) for (const t of semSug.slice(0, 40)) console.log("   sem sugestão:", t);
for (const e of erros.slice(0, 20)) console.log("   sugestão errada:", e);

console.log(`Casos obrigatórios: ${Object.keys(devemAgrupar).length + naoPodem.length - falhas} de ${Object.keys(devemAgrupar).length + naoPodem.length} corretos`);
if (errada / total > 0.01) { console.log("FALHOU: mais de 1% de sugestões erradas"); falhas++; }
if (falhas) { console.log(`${falhas} FALHA(S)`); process.exit(1); }
console.log("TODAS AS VERIFICAÇÕES DAS SUGESTÕES PASSARAM");
