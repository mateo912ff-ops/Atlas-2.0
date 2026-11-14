# ATLAS BRAIN v2.1

Módulo independiente para proyectos HTML + JavaScript. No modifica los archivos actuales de ATLAS.

## Contenido
- `atlas-brain.js`: motor local.
- `demo.html`: demostración para probarlo.
- `atlas-memory-example.json`: ejemplo vacío de estructura de memoria.

## Probarlo
1. Extrae el ZIP.
2. Abre `demo.html` en un navegador moderno.
3. Escribe un mensaje.
4. En "Enseñarle un conocimiento", introduce una pregunta y su respuesta.
5. Vuelve a preguntar usando palabras parecidas.

## Integrarlo en ATLAS
Copia `atlas-brain.js` a la carpeta de tu aplicación y carga el archivo antes del script principal:

```html
<script src="atlas-brain.js"></script>
<script src="script.js"></script>
```

En el JavaScript de ATLAS:

```javascript
const atlasBrain = new AtlasBrain();

// Para obtener una respuesta:
const respuesta = atlasBrain.respond("¿Qué es la gravedad?");

// Para enseñarle algo:
atlasBrain.learn(
  "¿Qué es la gravedad?",
  "Es la interacción que atrae los objetos con masa."
);
```

Conecta `respuesta` a la interfaz y al sistema de voz que ya utiliza ATLAS. No hace falta cambiar el lector de voz.

## Funciones disponibles
- `respond(texto)`: devuelve la respuesta (texto).
- `think(texto)`: devuelve `{ answer, source, trace, known }` para ver cómo se razonó.
- `ask(texto)`: como `think`, pero asíncrono y con `fallback` externo opcional.
- `explain()`: último razonamiento.
- `listRelations()`: relaciones "X es Y" aprendidas.
- `learn(pregunta, respuesta, etiquetasOpcionales)`: guarda un conocimiento.
- `remember(clave, valor)`: guarda un dato local.
- `listFacts()`: lista lo aprendido.
- `exportMemory()` / `importMemory(json, {replace})`: copia de seguridad de la memoria.
- `forget(clave)`: elimina un conocimiento o dato guardado.
- `getHistory()`: devuelve el historial reciente.
- `getStats()`: devuelve estadísticas de memoria.
- `clearConversation()`: borra el historial de conversación.
- `clearAll()`: borra toda la memoria del módulo.

## IA local dentro del navegador (opcional)
Sin modelo de lenguaje, ATLAS BRAIN solo puede razonar con reglas y suena "programado". Con `AtlasBrain.webllm()` conversa de forma libre usando una IA que **corre en tu propio dispositivo**:

```javascript
const llm = AtlasBrain.webllm({
  model: "Llama-3.2-1B-Instruct-q4f16_1-MLC",      // ~700 MB
  onProgress: p => console.log(p.text)
});
await llm.load();                                    // la primera vez descarga el modelo; luego queda en caché
const brain = new AtlasBrain({ llm });
const r = await brain.ask("Explícame por qué el cielo es azul", { onToken: t => mostrar(t) });
```
- El modelo redacta y razona; el cerebro le da tu memoria (lo que le enseñaste y lo que deduce), el historial, cálculos exactos, la hora y el filtro de seguridad.
- Modelos probados en la lista de WebLLM: `SmolLM2-360M-Instruct-q4f16_1-MLC` (~250 MB, español básico), `Llama-3.2-1B-Instruct-q4f16_1-MLC` (~700 MB), `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (~1,1 GB, mejor calidad).
- Requisitos: navegador con **WebGPU** (Chrome/Edge recientes y Safari reciente) y memoria suficiente. La primera carga necesita internet y espacio; después funciona sin conexión.
- Los modelos pequeños se equivocan e inventan más que una IA en la nube. El cerebro les pasa tus datos y les pide que no inventen, pero conviene revisar lo importante.
- Si no hay WebGPU o el modelo falla, responde con reglas y lo indica en `error`.

## Cómo "piensa" (motor de reglas)
ATLAS BRAIN razona de forma **simbólica**: combina lo que sabe con reglas lógicas y te enseña cómo llegó a cada respuesta.

```javascript
const brain = new AtlasBrain();
brain.respond("el gato es un mamífero");     // aprende de la frase
brain.respond("un mamífero es un animal");
brain.think("¿Un gato es un animal?");
// { answer: "Sí. «gato» es «mamífero», y «mamífero» es «animal». Por lo tanto…",
//   source: "deducción", trace: "Encadené 2 relaciones…", known: true }
brain.respond("¿por qué?");                  // explica el último razonamiento
brain.respond("cuánto es 12 + 3 * 2");       // "El resultado es 18."
```

Cuando no sabe, lo dice. Para que consulte una fuente externa (Wikipedia, una IA, tu servidor) usa `ask()` con un `fallback`:

```javascript
const brain = new AtlasBrain({
  fallback: async (texto) => miFuenteExterna(texto) // devuelve string o null
});
const { answer, source } = await brain.ask("¿Quién escribió el Quijote?");
```
El `fallback` es opcional y está desactivado por defecto: sin él, el módulo nunca sale a internet.

## Novedades
- Deduce, aprende de frases, sigue el hilo, calcula y explica su razonamiento.
- Tolera erratas ("grabedad") y plurales, y sugiere la pregunta más parecida.
- Filtro de seguridad básico (`safety: false` para desactivarlo).
- Ver [CHANGELOG.md](CHANGELOG.md).

## Tests
```bash
npm test
```
Requiere Node.js 18 o superior (solo para los tests; el módulo no tiene dependencias).

## Licencia
MIT. Consulta `LICENSE`.

## Importante
Este módulo razona con reglas sobre lo que sabe y lo que le enseñas. No es un modelo neuronal ni tiene conocimiento general ilimitado: no entiende negaciones ni frases complejas, y su filtro de seguridad es básico (no sustituye a la supervisión de un adulto si lo usan menores). No inventa una respuesta cuando no encuentra información suficiente: indica que necesita aprender. Los datos se guardan en `localStorage` del navegador y permanecen en ese navegador/origen; borrar sus datos del sitio puede eliminarlos.

Prueba primero la demostración y luego intégralo en una copia de ATLAS, sin reemplazar el proyecto original.
