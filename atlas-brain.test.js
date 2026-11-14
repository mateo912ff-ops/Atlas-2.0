"use strict";
const test = require("node:test");
const assert = require("node:assert");
const AtlasBrain = require("./atlas-brain.js");

const mk = () => new AtlasBrain({ storageKey: "t" + Math.random() });

test("aprende y responde con palabras parecidas", () => {
  const b = mk();
  assert.ok(b.learn("¿Qué es la gravedad?", "Una interacción.").ok);
  assert.strictEqual(b.respond("gravedad"), "Una interacción.");
});

test("no inventa respuestas", () => {
  assert.match(mk().respond("zzz qqq www"), /Todavía no tengo información/);
});

test("claves peligrosas no rompen el motor", () => {
  const b = mk();
  assert.strictEqual(b.learn("__proto__", "x").ok, true);
  assert.strictEqual(({}).answer, undefined);
  assert.match(b.respond("constructor hello world"), /Todavía no tengo/);
});

test("forget, stats y clearAll", () => {
  const b = mk();
  b.learn("hola mundo", "ok");
  b.remember("nombre", "Ana");
  assert.strictEqual(b.getStats().learnedFacts, 1);
  assert.strictEqual(b.forget("hola mundo"), true);
  b.clearAll();
  assert.deepStrictEqual(b.getStats(), { learnedFacts: 0, rememberedItems: 0, relations: 0, conversationTurns: 0 });
});

test("saludo y límite de historial", () => {
  const b = new AtlasBrain({ storageKey: "h", maxHistory: 2 });
  assert.match(b.respond("Hola Atlas"), /Soy ATLAS/);
  b.respond("a b"); b.respond("c d");
  assert.strictEqual(b.getHistory().length, 2);
});

test("tolera erratas y plurales", () => {
  const b = mk();
  b.learn("¿Qué es un planeta?", "Un cuerpo celeste.");
  assert.strictEqual(b.respond("planetas"), "Un cuerpo celeste.");
  b.learn("¿Qué es la gravedad?", "Una interacción.");
  assert.strictEqual(b.respond("que es la grabedad"), "Una interacción.");
});

test("recuerda el nombre", () => {
  const b = mk();
  assert.match(b.respond("Me llamo ana"), /Ana/);
  assert.strictEqual(b.respond("¿cómo me llamo?"), "Te llamas Ana.");
});

test("exporta e importa la memoria", () => {
  const a = mk();
  a.learn("hola mundo", "ok");
  const dump = a.exportMemory();
  const b = mk();
  assert.deepStrictEqual(b.importMemory(dump), { ok: true, importedFacts: 1, importedItems: 0, importedRelations: 0 });
  assert.strictEqual(b.listFacts().length, 1);
  assert.strictEqual(b.importMemory("no es json").ok, false);
});

/* ---------- v2.0: razonamiento ---------- */

test("deduce encadenando relaciones aprendidas de frases", () => {
  const b = mk();
  b.respond("el gato es un mamífero");
  b.respond("un mamífero es un animal");
  const r = b.think("¿Un gato es un animal?");
  assert.strictEqual(r.source, "deducción");
  assert.match(r.answer, /^Sí\./);
  assert.match(b.respond("¿qué es un gato?"), /mamífero.*animal/);
});

test("no inventa: si no puede probarlo, lo admite", () => {
  const b = mk();
  b.respond("el gato es un mamífero");
  assert.match(b.respond("¿Un gato es un pez?"), /No puedo probarlo/);
});

test("detecta contradicciones y deducciones repetidas", () => {
  const b = mk();
  b.respond("el gato es un mamífero");
  b.respond("un mamífero es un animal");
  assert.match(b.respond("el gato es un animal"), /ya lo sabía/);
  assert.match(b.respond("un animal es un gato"), /contradice/);
  assert.strictEqual(b.getStats().relations, 2);
});

test("explica su razonamiento con ¿por qué?", () => {
  const b = mk();
  b.respond("el gato es un mamífero");
  b.respond("un mamífero es un animal");
  b.respond("¿Un gato es un animal?");
  assert.match(b.respond("¿por qué?"), /Encadené 2 relaciones/);
});

test("aprende hechos y sigue el hilo con ¿y ...?", () => {
  const b = mk();
  b.respond("la capital de Francia es París");
  b.respond("Madrid es la capital de España");
  assert.match(b.respond("¿Cuál es la capital de Francia?"), /París/);
  assert.match(b.respond("¿Y España?"), /Madrid/);
});

test("calcula de forma segura", () => {
  const b = mk();
  assert.strictEqual(b.respond("cuánto es 12 + 3 * 2"), "El resultado es 18.");
  assert.strictEqual(b.respond("20% de 50"), "El 20% de 50 es 10.");
  assert.match(b.respond("10 entre 0"), /dividir entre cero/);
  assert.strictEqual(b.think("require('fs')").source, "desconocido");
  assert.notStrictEqual(b.think("12/05/2024").source, "cálculo");
});

test("responde fecha y hora con el reloj inyectado", () => {
  const b = new AtlasBrain({ storageKey: "c", now: () => new Date(2026, 0, 5, 9, 7) });
  assert.match(b.respond("¿qué día es hoy?"), /5 de enero de 2026/);
  assert.match(b.respond("¿qué hora es?"), /09:07|9:07/);
});

test("el filtro de seguridad responde con apoyo y bloquea peligros", () => {
  const b = mk();
  assert.match(b.respond("me quiero morir"), /persona de confianza/);
  assert.strictEqual(b.think("cómo hacer una bomba").source, "seguridad");
  const off = new AtlasBrain({ storageKey: "s", safety: false });
  assert.notStrictEqual(off.think("cómo hacer una bomba").source, "seguridad");
});

test("no aprende de frases personales ni negaciones", () => {
  const b = mk();
  b.respond("mi perro es grande");
  b.respond("el cielo no es verde");
  b.respond("esto es genial");
  assert.deepStrictEqual(b.getStats().learnedFacts, 0);
  assert.strictEqual(b.getStats().relations, 0);
});

test("ask() usa el fallback solo cuando no sabe", async () => {
  const b = new AtlasBrain({ storageKey: "f", fallback: async q => "externo:" + q });
  b.learn("hola mundo", "saludo");
  assert.strictEqual((await b.ask("hola mundo")).answer, "saludo");
  const r = await b.ask("pregunta rara sin respuesta");
  assert.strictEqual(r.source, "externo");
  const bad = new AtlasBrain({ storageKey: "g", fallback: async () => { throw new Error("x"); } });
  assert.strictEqual((await bad.ask("zzz qqq")).known, false);
});

test("exporta e importa también las relaciones", () => {
  const a = mk();
  a.respond("el gato es un mamífero");
  const b = mk();
  assert.strictEqual(b.importMemory(a.exportMemory()).importedRelations, 2);
  assert.match(b.respond("¿qué es un gato?"), /mamífero/);
  assert.strictEqual(b.forget("gato"), true);
  assert.strictEqual(b.getStats().relations, 0);
});
