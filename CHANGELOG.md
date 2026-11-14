# Cambios

## 2.1.0
- **IA local real:** `AtlasBrain.webllm()` ejecuta un modelo de lenguaje dentro del navegador (WebLLM + WebGPU). Se descarga una vez y después funciona sin internet ni claves.
- Con `llm` activo, el modelo razona y redacta con respuestas libres; el cerebro le aporta memoria relevante, historial, cálculos exactos, reloj y filtro de seguridad.
- `ask(texto, { onToken })` muestra la respuesta mientras se escribe.
- Si el modelo falla o no hay WebGPU, responde con reglas e informa el motivo en `error`.
- La demo incluye un panel para activar la IA local (3 modelos a elegir).

## 2.0.0
- **Razonamiento:** deduce encadenando lo que sabe (gato → mamífero → animal) y admite cuando no puede probar algo (no asume que sea falso).
- **Aprende de frases normales:** «el sol es una estrella», «la capital de Francia es París». Rechaza contradicciones y ciclos.
- **Seguimiento de contexto:** «¿Y España?» tras «¿Cuál es la capital de Francia?».
- **Explica su razonamiento:** `think()` devuelve `answer`, `source` y `trace`; «¿por qué?» repite el último razonamiento.
- **Calculadora segura** (sin `eval`): operaciones, porcentajes y raíces. Fecha y hora desde el dispositivo.
- **Filtro de seguridad** básico (apoyo ante mensajes de sufrimiento, bloqueo de temas peligrosos o para adultos).
- `ask()` asíncrono con `fallback` opcional (Wikipedia, una IA, tu servidor…) para cuando no sabe.
- Las relaciones se incluyen en exportar/importar; nuevas `listRelations()` y `explain()`.
- Cambio de comportamiento: `getStats()` incluye `relations`; las frases afirmativas ya se aprenden solas (desactivable con `autoLearn: false`).

## 1.1.0
- Coincidencia más robusta: tolera erratas y plurales/singulares.
- Sugerencia "¿Quizá te refieres a…?" cuando la coincidencia es parcial.
- Recuerda el nombre del usuario ("me llamo Ana").
- Nuevas funciones: `listFacts()`, `exportMemory()`, `importMemory()`.
- La demo permite ver, olvidar, exportar, importar y borrar la memoria.
- Tipos TypeScript (`atlas-brain.d.ts`) y CI con GitHub Actions.

## 1.0.1
- Corregido: la demo mostraba `\n` literal en el chat.
- Corregido: claves como `__proto__` o `constructor` rompían la memoria.
- Se descartan datos corruptos al cargar `localStorage`.

## 1.0.0
- Primera versión.
