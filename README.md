# ATLAS BRAIN v2.0

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

## Cómo "piensa"
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
