// Teste da leitura de idade e das faixas etárias (site/js/idade.js).
// Uso: node tests/idade.mjs  — termina com código 1 se algo falhar.
const { paraAnos, paraData, lerCortes, faixas, lerIdades, PRESETS } = await import("../site/js/idade.js");
let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log("FALHOU:", msg); } };
const perto = (a, b) => a !== null && Math.abs(a - b) < 0.01;

ok(perto(paraAnos(4), 4), "4");
ok(perto(paraAnos("4,5"), 4.5), "4,5");
ok(perto(paraAnos("4 anos"), 4), "4 anos");
ok(perto(paraAnos("18 meses"), 1.5), "18 meses");
ok(perto(paraAnos("18m"), 1.5), "18m");
ok(perto(paraAnos("1a6m"), 1.5), "1a6m");
ok(perto(paraAnos("2 anos e 6 meses"), 2.5), "2 anos e 6 meses");
ok(perto(paraAnos("1 ano"), 1), "1 ano");
ok(perto(paraAnos(30, true), 2.5), "30 (coluna em meses)");
ok(paraAnos("não sabe") === null, "texto sem número");
ok(paraAnos("") === null, "vazio");
ok(paraData("05/03/2021").getUTCMonth() === 2, "dd/mm/aaaa");
ok(paraData("2021-03-05").getUTCDate() === 5, "aaaa-mm-dd");

ok(JSON.stringify(lerCortes("0, 2, 4, 6")) === "[0,2,4,6]", "cortes simples");
ok(JSON.stringify(lerCortes("6;2 4")) === "[0,2,4,6]", "cortes fora de ordem, sem 0");
ok(lerCortes("a, b") === null, "cortes inválidos");
ok(lerCortes("0, 200") === null, "corte acima de 120");
const f = faixas([0, 2, 4, 6]).map((x) => x.rotulo).join(" | ");
ok(f === "0–1 ano | 2–3 anos | 4–5 anos | 6 anos ou mais", "rótulos pré-escolar: " + f);
const g = faixas([0, 5, 10]).map((x) => x.rotulo).join(" | ");
ok(g === "0–4 anos | 5–9 anos | 10 anos ou mais", "rótulos 5 anos: " + g);
const h = faixas([0, 1, 2]).map((x) => x.rotulo).join(" | ");
ok(h === "Menos de 1 ano | 1 ano | 2 anos ou mais", "faixas de 1 ano: " + h);
const k = faixas([0, 1.5, 3]).map((x) => x.rotulo).join(" | ");
ok(k === "0 a < 1,5 anos | 1,5 a < 3 anos | 3 anos ou mais", "faixas fracionadas: " + k);
ok(PRESETS.length === 3, "3 conjuntos padrão");

// leitura por paciente: 1ª coleta com idade; idade só na P2; inconsistência; inválida
const df = { columns: ["id_paciente", "coleta", "idade"], rows: [
  { _idx: 0, id_paciente: "A", coleta: "P2", idade: 5 }, { _idx: 1, id_paciente: "A", coleta: "P1", idade: "4 anos" },
  { _idx: 2, id_paciente: "B", coleta: "P1", idade: null }, { _idx: 3, id_paciente: "B", coleta: "P2", idade: "30 meses" },
  { _idx: 4, id_paciente: "C", coleta: "P1", idade: "?" }, { _idx: 5, id_paciente: "D", coleta: "P1", idade: 2 },
  { _idx: 6, id_paciente: "D", coleta: "P2", idade: 6 }] };
const r = lerIdades(df);
ok(perto(r.porId.get("A"), 4), "A usa a P1 (4)");
ok(perto(r.porId.get("B"), 2.5), "B usa a P2 (30 meses)");
ok(!r.porId.has("C") && r.nSemIdade === 1 && r.invalidos === 1, "C sem idade válida");
ok(r.inconsistentes === 1, "D inconsistente (2 e 6)");
const df2 = { columns: ["id_paciente", "coleta", "data_nascimento", "data_coleta"], rows: [
  { _idx: 0, id_paciente: "E", coleta: "P1", data_nascimento: "10/05/2020", data_coleta: new Date(Date.UTC(2024, 4, 9)) }] };
ok(perto(Math.floor(lerIdades(df2).porId.get("E")), 3), "data de nascimento: 3 anos (um dia antes do aniversário)");
ok(lerIdades({ columns: ["id_paciente"], rows: [] }) === null, "sem coluna de idade");

if (falhas) { console.log(`${falhas} FALHA(S)`); process.exit(1); }
console.log("TODAS AS VERIFICAÇÕES DE IDADE PASSARAM");
