/* ATLAS BRAIN v2.0.0
 * Motor local de razonamiento simbólico para aplicaciones HTML + JavaScript.
 * No usa internet, APIs ni librerías externas.
 *
 * Qué hace: calcula, deduce (A es B, B es C → A es C), aprende de frases
 * normales ("el gato es un mamífero"), entiende seguimientos ("¿y España?")
 * y explica cómo llegó a cada respuesta.
 * Qué NO es: un modelo de lenguaje neuronal. Solo razona con lo que sabe
 * y lo que le enseñas; cuando no sabe, lo dice (o consulta tu `fallback`).
 */
(function (root) {
  "use strict";

  const VERSION = "2.0.0";

  const DEFAULTS = {
    storageKey: "atlas_brain_memory_v1",
    maxHistory: 12,
    maxFacts: 500,
    answerThreshold: 0.48,   // puntuación mínima para responder con un conocimiento
    suggestThreshold: 0.3,   // puntuación mínima para sugerir "¿Quizá te refieres a…?"
    autoLearn: true,         // aprender de frases como "el sol es una estrella"
    safety: true,            // filtro básico de seguridad
    fallback: null,          // función (texto, contexto) => string | Promise<string|null>
    now: null                // función que devuelve un Date (útil para tests)
  };

  const MAX_TEXT = 2000;
  const ART = "(?:un|una|unos|unas|el|la|los|las)";

  const STOP = new Set([
    "a","al","algo","algunos","ante","como","con","cual","cuando","de","del",
    "desde","donde","el","ella","ellas","ellos","en","era","es","esa","ese",
    "eso","esta","este","esto","fue","ha","hasta","hay","la","las",
    "le","les","lo","los","mas","me","mi","mis","mucho","muy","no",
    "o","para","pero","por","porque","que","se","si","sin","sobre",
    "su","sus","te","tu","tus","un","una","uno","unos","unas","y","ya"
  ]);

  // Palabras con las que una frase NO es un conocimiento general.
  const NOT_SUBJECT = new Set([
    "yo","tu","usted","nosotros","mi","mis","su","sus","este","esta","ese","esa",
    "esto","eso","aquello","ello","ella","ellos","ellas","que","quien","cual",
    "como","donde","cuando","cuanto","por"
  ]);

  const SAFETY = {
    support: /\b(me quiero (matar|morir|cortar)|quiero (morir|morirme|suicidarme)|me voy a (matar|suicidar)|no quiero (seguir viviendo|vivir mas|estar vivo|estar viva)|quiero hacerme dano|me estoy cortando)\b/,
    adult: /\b(porno\w*|pornografia|xxx|hentai|erotic\w*|desnud[oa]s?|nudes?|sexting)\b/,
    danger: /\b(como (hacer|fabricar|construir|armar) (una |un )?(bomba|explosivos?|arma casera|veneno)|bomba casera|fabricar (drogas?|metanfetamina)|hackear (cuentas?|a alguien)|robar (cuentas?|contrasenas?))\b/
  };

  /* ---------- utilidades de texto ---------- */

  function normalize(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!.,;:()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Singular/plural muy básico para que "planeta" y "planetas" coincidan.
  function stem(w) {
    if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
  }

  function words(value) {
    return normalize(value).split(" ").filter(w => w && !STOP.has(w)).map(stem);
  }

  // Minúsculas conservando tildes y ñ (para mostrar palabras tal como se escribieron).
  function lowerClean(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[¿?¡!.,;:()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function capitalize(s) {
    return s ? s.charAt(0).toLocaleUpperCase("es") + s.slice(1) : s;
  }

  function isQuestion(raw) {
    return /\?/.test(raw) || /^\s*¿/.test(raw) ||
      /^\s*(qu[eé]|qui[eé]nes?|cu[aá]les?|c[oó]mo|d[oó]nde|cu[aá]ndo|cu[aá]nt[oa]s?|por qu[eé]|es|son)\s/i.test(raw);
  }

  // Distancia de Levenshtein para tolerar erratas ("grabedad" ~ "gravedad").
  function distance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 3;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function sameWord(a, b) {
    if (a === b) return true;
    const min = Math.min(a.length, b.length);
    if (min < 5) return false;
    return distance(a, b) <= (min >= 9 ? 2 : 1);
  }

  function dict(source) {
    const out = Object.create(null);
    if (source && typeof source === "object") {
      for (const k of Object.keys(source)) out[k] = source[k];
    }
    return out;
  }

  /* ---------- almacenamiento ---------- */

  function safeLoad(key) {
    try {
      const raw = root.localStorage && root.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function safeSave(key, data) {
    try {
      if (root.localStorage) root.localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cleanFact(f) {
    if (!f || typeof f.answer !== "string" || !f.answer.trim()) return null;
    return {
      answer: f.answer.trim().slice(0, MAX_TEXT),
      tags: Array.isArray(f.tags) ? f.tags.map(normalize).filter(Boolean) : [],
      updatedAt: Number.isFinite(f.updatedAt) ? f.updatedAt : Date.now()
    };
  }

  function cleanRelation(r) {
    if (!r || typeof r.label !== "string" || !r.label) return null;
    return {
      label: r.label.slice(0, 80),
      is: Array.isArray(r.is) ? r.is.filter(x => typeof x === "string" && x).slice(0, 50) : []
    };
  }

  /* ---------- matemáticas seguras (sin eval) ---------- */

  function evalMath(src) {
    const s = src.replace(/\s+/g, "");
    const toks = s.match(/\d+(?:\.\d+)?|\*\*|[-+*\/%()]/g);
    if (!toks || toks.join("") !== s) return null;
    let i = 0;
    const peek = () => toks[i];
    const next = () => toks[i++];
    const chk = v => {
      if (!Number.isFinite(v) || Math.abs(v) > 1e15) throw new Error("range");
      return v;
    };
    const atom = () => {
      const t = next();
      if (t === undefined) throw new Error("syntax");
      if (t === "(") {
        const v = expr();
        if (next() !== ")") throw new Error("syntax");
        return v;
      }
      const n = Number(t);
      if (Number.isNaN(n)) throw new Error("syntax");
      return n;
    };
    const power = () => {
      const a = atom();
      if (peek() === "**") {
        next();
        const b = unary();
        if (Math.abs(b) > 100) throw new Error("range");
        return chk(Math.pow(a, b));
      }
      return a;
    };
    const unary = () => {
      if (peek() === "-") { next(); return -unary(); }
      if (peek() === "+") { next(); return unary(); }
      return power();
    };
    const term = () => {
      let a = unary();
      while (["*", "/", "%"].includes(peek())) {
        const o = next();
        const b = unary();
        if (o !== "*" && b === 0) throw new Error("div0");
        a = chk(o === "*" ? a * b : o === "/" ? a / b : a % b);
      }
      return a;
    };
    const expr = () => {
      let a = term();
      while (peek() === "+" || peek() === "-") {
        const o = next();
        const b = term();
        a = chk(o === "+" ? a + b : a - b);
      }
      return a;
    };
    const r = expr();
    if (i !== toks.length) throw new Error("syntax");
    return r;
  }

  const num = s => parseFloat(String(s).replace(",", "."));
  const fmt = n => String(Number.isInteger(n) ? n : parseFloat(n.toFixed(10))).replace(".", ",");

  // Devuelve { answer, trace } o null si el texto no es una operación.
  function solveMath(raw) {
    let t = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!=]/g, " ").replace(/\s+/g, " ").trim();
    let m;
    if ((m = t.match(/(-?\d+(?:[.,]\d+)?)\s*(?:%|por ciento)\s*de\s*(-?\d+(?:[.,]\d+)?)/))) {
      const a = num(m[1]), b = num(m[2]);
      return { answer: "El " + fmt(a) + "% de " + fmt(b) + " es " + fmt(a * b / 100) + ".",
               trace: "Calculé " + fmt(a) + " × " + fmt(b) + " ÷ 100." };
    }
    if ((m = t.match(/raiz(?: cuadrada)? de (-?\d+(?:[.,]\d+)?)/))) {
      const n = num(m[1]);
      if (n < 0) return { answer: "No existe una raíz cuadrada real de un número negativo.", trace: "Un cuadrado real nunca es negativo." };
      return { answer: "La raíz cuadrada de " + fmt(n) + " es " + fmt(Math.sqrt(n)) + ".",
               trace: "Calculé √" + fmt(n) + "." };
    }
    t = t.replace(/^(?:cuanto es|cuanto da|calcula|calculame|resuelve|resultado de)\s+/, "");
    t = t.replace(/ elevado a /g, " ** ").replace(/ dividido (?:por|entre) /g, " / ")
      .replace(/ mas /g, " + ").replace(/ menos /g, " - ").replace(/ por /g, " * ")
      .replace(/ entre /g, " / ").replace(/(\d)\s*[x×]\s*(\d)/g, "$1*$2")
      .replace(/÷/g, "/").replace(/\^/g, "**").replace(/(\d),(\d)/g, "$1.$2").trim();
    if (!t || t.length > 90 || !/^[\d.+\-*\/()% ]+$/.test(t)) return null;
    if (!/\d\s*[+\-*\/%]\s*[\d(]/.test(t) && !/\*\*/.test(t)) return null;
    if (/\d+\/\d+\/\d+/.test(t)) return null; // parece una fecha
    try {
      const v = evalMath(t);
      if (v == null) return null;
      return { answer: "El resultado es " + fmt(v) + ".", trace: "Resolví la operación «" + t.replace(/\s+/g, "") + "» respetando el orden de las operaciones." };
    } catch (e) {
      if (e.message === "div0") return { answer: "No se puede dividir entre cero.", trace: "La división entre cero no está definida." };
      if (e.message === "range") return { answer: "Ese número es demasiado grande para mí.", trace: "El resultado excede el límite de cálculo seguro." };
      return null;
    }
  }

  /* ---------- el cerebro ---------- */

  class AtlasBrain {
    constructor(options) {
      this.options = Object.assign({}, DEFAULTS, options || {});
      const saved = safeLoad(this.options.storageKey);
      const data = saved && typeof saved === "object" ? saved : {};
      this.state = {
        facts: dict(),
        history: Array.isArray(data.history) ? data.history.slice(-this.options.maxHistory) : [],
        profile: dict(),
        relations: dict()
      };
      const facts = dict(data.facts);
      for (const k of Object.keys(facts)) {
        const f = cleanFact(facts[k]);
        if (f && k) this.state.facts[k] = f;
      }
      const profile = dict(data.profile);
      for (const k of Object.keys(profile)) {
        if (typeof profile[k] === "string" && profile[k]) this.state.profile[k] = profile[k];
      }
      const rels = dict(data.relations);
      for (const k of Object.keys(rels)) {
        const r = cleanRelation(rels[k]);
        if (r && k) this.state.relations[k] = r;
      }
      this._ctx = null;        // contexto de la última pregunta (para "¿y ...?")
      this._lastTrace = "";    // cómo se pensó la última respuesta
    }

    _save() {
      return safeSave(this.options.storageKey, this.state);
    }

    _now() {
      return typeof this.options.now === "function" ? this.options.now() : new Date();
    }

    _trimFacts() {
      const keys = Object.keys(this.state.facts);
      if (keys.length > this.options.maxFacts) {
        keys.sort((x, y) => (this.state.facts[x].updatedAt || 0) - (this.state.facts[y].updatedAt || 0));
        for (const oldKey of keys.slice(0, keys.length - this.options.maxFacts)) delete this.state.facts[oldKey];
      }
    }

    /* ----- API de memoria ----- */

    // Enseña una relación pregunta/respuesta. Se guarda en el dispositivo.
    learn(question, answer, tags) {
      const q = normalize(question).slice(0, MAX_TEXT);
      const a = String(answer == null ? "" : answer).trim().slice(0, MAX_TEXT);
      if (!q || !a) return { ok: false, reason: "Escribe una pregunta y una respuesta." };

      this.state.facts[q] = {
        answer: a,
        tags: Array.isArray(tags) ? tags.map(normalize).filter(Boolean) : [],
        updatedAt: Date.now()
      };
      this._trimFacts();
      const saved = this._save();
      return {
        ok: true,
        persisted: saved,
        message: saved
          ? "Conocimiento guardado en este dispositivo."
          : "Conocimiento guardado solo en esta sesión (el navegador no permite almacenamiento local)."
      };
    }

    // Guarda datos personales no sensibles que la aplicación decida recordar.
    remember(key, value) {
      const k = normalize(key);
      if (!k || value == null || String(value).trim() === "") return false;
      this.state.profile[k] = String(value).trim().slice(0, MAX_TEXT);
      this._save();
      return true;
    }

    forget(key) {
      const k = normalize(key);
      const rk = stem(k);
      let removed = Boolean(this.state.facts[k] || this.state.profile[k] || this.state.relations[rk]);
      delete this.state.facts[k];
      delete this.state.profile[k];
      if (this.state.relations[rk]) {
        delete this.state.relations[rk];
        for (const r of Object.values(this.state.relations)) r.is = r.is.filter(x => x !== rk);
        removed = true;
      }
      this._save();
      return removed;
    }

    // Lista los conocimientos aprendidos, del más reciente al más antiguo.
    listFacts() {
      return Object.keys(this.state.facts)
        .map(q => ({ question: q, answer: this.state.facts[q].answer, tags: this.state.facts[q].tags.slice(), updatedAt: this.state.facts[q].updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // Lista las relaciones "X es Y" que sabe (de donde deduce cosas nuevas).
    listRelations() {
      const out = [];
      for (const [k, r] of Object.entries(this.state.relations)) {
        for (const p of r.is) {
          const parent = this.state.relations[p];
          if (parent) out.push({ key: k, subject: r.label, category: parent.label });
        }
      }
      return out;
    }

    // Exporta toda la memoria como texto JSON (para copia de seguridad).
    exportMemory() {
      return JSON.stringify({
        version: VERSION,
        facts: this.state.facts,
        profile: this.state.profile,
        relations: this.state.relations
      }, null, 2);
    }

    // Importa una copia de seguridad. Por defecto se combina con la memoria actual.
    importMemory(json, options) {
      const replace = Boolean(options && options.replace);
      let data;
      try {
        data = typeof json === "string" ? JSON.parse(json) : json;
      } catch (_) {
        return { ok: false, reason: "El archivo no es un JSON válido." };
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { ok: false, reason: "El formato de la memoria no es válido." };
      }
      const facts = dict(data.facts);
      const profile = dict(data.profile);
      const rels = dict(data.relations);
      const next = {
        facts: replace ? dict() : dict(this.state.facts),
        profile: replace ? dict() : dict(this.state.profile),
        relations: replace ? dict() : dict(this.state.relations)
      };
      let importedFacts = 0, importedItems = 0, importedRelations = 0;
      for (const k of Object.keys(facts)) {
        const q = normalize(k).slice(0, MAX_TEXT);
        const f = cleanFact(facts[k]);
        if (q && f) { next.facts[q] = f; importedFacts++; }
      }
      for (const k of Object.keys(profile)) {
        const key = normalize(k);
        if (key && typeof profile[k] === "string" && profile[k].trim()) {
          next.profile[key] = profile[k].trim().slice(0, MAX_TEXT);
          importedItems++;
        }
      }
      for (const k of Object.keys(rels)) {
        const r = cleanRelation(rels[k]);
        if (r && k) { next.relations[k] = r; importedRelations++; }
      }
      this.state.facts = next.facts;
      this.state.profile = next.profile;
      this.state.relations = next.relations;
      this._trimFacts();
      this._save();
      return { ok: true, importedFacts, importedItems, importedRelations };
    }

    /* ----- razonamiento ----- */

    _score(inputWords, question, fact) {
      const target = words(question + " " + (fact.tags || []).join(" "));
      if (!inputWords.length || !target.length) return 0;
      let overlap = 0;
      for (const w of inputWords) if (target.some(t => sameWord(w, t))) overlap++;
      const coverage = overlap / inputWords.length;
      const precision = overlap / target.length;
      return (coverage * 0.72) + (precision * 0.28);
    }

    _findFact(input) {
      const n = normalize(input);
      if (this.state.facts[n]) return { fact: this.state.facts[n], question: n, score: 1 };
      const inputWords = words(n);
      let best = null;
      for (const [question, fact] of Object.entries(this.state.facts)) {
        const score = this._score(inputWords, question, fact);
        if (!best || score > best.score) best = { fact, question, score };
      }
      return best;
    }

    _guard(n) {
      if (!this.options.safety) return null;
      if (SAFETY.support.test(n)) {
        return {
          answer: "Siento mucho que te sientas así. No estás solo/a. Cuéntale hoy mismo a una persona de confianza (familia, un amigo, un profesor) cómo te sientes. Si estás en peligro o piensas hacerte daño ahora, llama al número de emergencias de tu país o pide a alguien que se quede contigo. Soy un programa sencillo y no puedo reemplazar a una persona, pero aquí sigo si quieres hablar.",
          trace: "Detecté un mensaje que sugiere sufrimiento; priorizo tu seguridad."
        };
      }
      if (SAFETY.adult.test(n)) return { answer: "Eso no es algo con lo que pueda ayudar. Pregúntame otra cosa.", trace: "Tema bloqueado por el filtro de seguridad." };
      if (SAFETY.danger.test(n)) return { answer: "Eso podría ser peligroso, así que no puedo ayudar con eso.", trace: "Tema bloqueado por el filtro de seguridad." };
      return null;
    }

    _personal(raw, n) {
      const nameMatch = raw.match(/(?:me llamo|mi nombre es)\s+([\p{L}][\p{L}'-]{0,30})/iu);
      if (nameMatch) {
        const name = capitalize(nameMatch[1]);
        this.remember("nombre", name);
        return { answer: "Encantado, " + name + ". Lo recordaré en este dispositivo.", trace: "Guardé tu nombre en la memoria local." };
      }
      if (/\b(como me llamo|cual es mi nombre|sabes mi nombre)\b/.test(n)) {
        return this.state.profile.nombre
          ? { answer: "Te llamas " + this.state.profile.nombre + ".", trace: "Lo leí de mi memoria: me lo dijiste tú." }
          : { answer: "Todavía no me has dicho tu nombre. Puedes decir \"me llamo ...\".", trace: "No tengo tu nombre guardado." };
      }
      return null;
    }

    _clock(n) {
      const d = this._now();
      if (/\b(que dia es hoy|que fecha es hoy|a que fecha estamos|que dia es)\b/.test(n)) {
        return { answer: "Hoy es " + d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ".", trace: "Leí el reloj de tu dispositivo." };
      }
      if (/\b(que hora es|me dices la hora|dime la hora)\b/.test(n)) {
        return { answer: "Son las " + d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) + ".", trace: "Leí el reloj de tu dispositivo." };
      }
      return null;
    }

    // Camino más corto "sub → … → cat" en las relaciones "es un". Devuelve claves o null.
    _path(sub, cat) {
      const rel = this.state.relations;
      if (!rel[sub] || !rel[cat]) return null;
      const prev = new Map([[sub, null]]);
      const queue = [sub];
      while (queue.length && prev.size < 500) {
        const cur = queue.shift();
        if (cur === cat) {
          const path = [];
          for (let k = cur; k != null; k = prev.get(k)) path.unshift(k);
          return path;
        }
        for (const p of (rel[cur] ? rel[cur].is : [])) {
          if (!prev.has(p) && rel[p]) { prev.set(p, cur); queue.push(p); }
        }
      }
      return null;
    }

    _ancestors(sub) {
      const rel = this.state.relations;
      const out = [];
      const seen = new Set([sub]);
      const queue = [sub];
      while (queue.length && seen.size < 500) {
        const cur = queue.shift();
        for (const p of (rel[cur] ? rel[cur].is : [])) {
          if (!seen.has(p) && rel[p]) { seen.add(p); out.push(p); queue.push(p); }
        }
      }
      return out;
    }

    _label(k, fallback) {
      const r = this.state.relations[k];
      return "«" + (r ? r.label : (fallback || k)) + "»";
    }

    _chain(path) {
      const parts = [];
      for (let i = 0; i < path.length - 1; i++) parts.push(this._label(path[i]) + " es " + this._label(path[i + 1]));
      return parts.join(", y ");
    }

    // ¿X es Y? Responde Sí con la cadena de razonamiento; si no puede probarlo, lo admite.
    _askIsA(subWord, catWord) {
      const sub = stem(normalize(subWord)), cat = stem(normalize(catWord));
      if (!this.state.relations[sub]) return null;
      const path = this._path(sub, cat);
      this._ctx = { type: "isa", cat: catWord };
      if (path) {
        const direct = path.length === 2;
        return {
          answer: direct
            ? "Sí: " + this._chain(path) + " (me lo enseñaste)."
            : "Sí. " + this._chain(path) + ". Por lo tanto, " + this._label(sub) + " es " + this._label(cat) + ".",
          source: direct ? "memoria" : "deducción",
          trace: direct ? "Lo aprendiste tú directamente." : "Encadené " + (path.length - 1) + " relaciones que me enseñaste: " + this._chain(path) + "."
        };
      }
      const known = this._ancestors(sub).map(k => this._label(k));
      return {
        answer: "No puedo probarlo con lo que sé. " + (known.length
          ? "Sé que " + this._label(sub) + " es " + known.join(" y ") + ", pero no que sea " + this._label(cat) + "."
          : "No sé de qué tipo es " + this._label(sub) + ".") + " Si lo es, enséñamelo.",
        source: "deducción",
        trace: "Busqué un camino de " + this._label(sub) + " a " + this._label(cat, catWord) + " y no lo encontré. No asumo que sea falso: solo que no lo sé."
      };
    }

    _askWhatIs(subWord) {
      const sub = stem(normalize(subWord));
      if (!this.state.relations[sub]) return null;
      const anc = this._ancestors(sub);
      if (!anc.length) return null;
      const first = anc[0];
      const rest = anc.slice(1).map(k => this._label(k));
      return {
        answer: this._label(sub) + " es " + this._label(first) + (rest.length ? ". Por lo tanto, también es " + rest.join(", ") + "." : "."),
        source: anc.length > 1 ? "deducción" : "memoria",
        trace: "Recorrí las relaciones que conozco de " + this._label(sub) + "."
      };
    }

    _addRelation(subWord, catWord, text) {
      const sub = stem(normalize(subWord)), cat = stem(normalize(catWord));
      const rel = this.state.relations;
      if (!sub || !cat || sub === cat) return null;
      if (!rel[sub] && !rel[cat] && Object.keys(rel).length >= this.options.maxFacts * 2) return null;
      if (rel[sub] && rel[cat]) {
        if (this._path(sub, cat)) {
          return { answer: "Eso ya lo sabía: lo deduje de lo que me enseñaste antes (" + this._chain(this._path(sub, cat)) + ").", source: "deducción", trace: "La relación ya se podía deducir; no la guardé de nuevo." };
        }
        if (this._path(cat, sub)) {
          return { answer: "Eso se contradice con lo que sé (" + this._chain(this._path(cat, sub)) + "), así que no lo guardé.", source: "deducción", trace: "Guardarlo habría creado un círculo de definiciones." };
        }
      }
      if (!rel[sub]) rel[sub] = { label: subWord, is: [] };
      if (!rel[cat]) rel[cat] = { label: catWord, is: [] };
      rel[sub].is.push(cat);
      this._save();
      this._ctx = { type: "isa", cat: catWord };
      return { answer: "Entendido: " + this._label(sub) + " es " + this._label(cat) + ". Lo recordaré.", source: "aprendizaje", trace: "Aprendí de tu frase «" + text + "» y la guardé como relación." };
    }

    // Aprende de frases afirmativas normales ("el sol es una estrella").
    _learnStatement(raw) {
      if (!this.options.autoLearn || isQuestion(raw)) return null;
      const text = raw.trim().replace(/[.!\s]+$/, "");
      const rl = lowerClean(text);
      const count = rl.split(" ").length;
      if (count < 3 || count > 14) return null;
      if (/\b(no|nunca|tampoco|jamas|jamás)\b/.test(rl)) return null;
      const bad = w => NOT_SUBJECT.has(normalize(w));
      let m;

      m = rl.match(new RegExp("^(?:" + ART + " )?(\\S+) (?:es|son) " + ART + " (\\S+)$"))
        || rl.match(/^(?:(?:un|una|unos|unas|el|la|los|las) )?(\S+) son (\S+)$/);
      if (m && !bad(m[1])) return this._addRelation(m[1], m[2], text);

      m = rl.match(new RegExp("^(.+?) (?:es|son) " + ART + " (.+ de .+)$"));
      if (m && !bad(m[1].split(" ")[0]) && m[1].split(" ").length <= 4) {
        return this._storeStatement(m[2], text);
      }

      m = rl.match(new RegExp("^(?:" + ART + " )?(.+?) (?:es|son) (.+)$"));
      if (m && !bad(m[1].split(" ")[0]) && m[1].split(" ").length <= 5) {
        return this._storeStatement(m[1], text);
      }
      return null;
    }

    _storeStatement(key, text) {
      const sentence = capitalize(text) + ".";
      const res = this.learn(key, sentence);
      if (!res.ok) return null;
      return { answer: "Entendido. Lo guardé: «" + sentence + "»", source: "aprendizaje", trace: "Aprendí de tu frase y la guardé como conocimiento." };
    }

    // Preguntas sobre relaciones: "¿Un gato es un animal?", "¿Qué es un gato?"
    _askRelations(raw) {
      if (!isQuestion(raw)) return null;
      const rl = lowerClean(raw);
      let m = rl.match(new RegExp("^(?:qu[eé]|qui[eé]n|qui[eé]nes) (?:es|son) (?:" + ART + " )?(\\S+)$"));
      if (m) return this._askWhatIs(m[1]);
      m = rl.match(new RegExp("^(?:es|son) (?:" + ART + " )?(\\S+) (?:" + ART + " )?(\\S+)$"));
      if (m) return this._askIsA(m[1], m[2]);
      m = rl.match(new RegExp("^(?:" + ART + " )?(\\S+) (?:es|son) (?:" + ART + " )?(\\S+)$"));
      if (m && !NOT_SUBJECT.has(normalize(m[1]))) return this._askIsA(m[1], m[2]);
      return null;
    }

    // Seguimientos: "¿Y España?" tras "¿Cuál es la capital de Francia?"
    _followUp(raw) {
      const rl = lowerClean(raw);
      const m = rl.match(new RegExp("^y (?:de |del |en |con )?(?:" + ART + " )?(.+)$"));
      if (!m || !this._ctx) return null;
      const ctx = this._ctx;
      if (ctx.type === "isa") {
        const parts = m[1].split(" ");
        if (parts.length > 2) return null;
        const r = this._askIsA(parts[0], ctx.cat);
        if (r) r.trace = "Seguí el hilo de la conversación («y ...» se refiere a «" + ctx.cat + "»). " + r.trace;
        return r;
      }
      if (ctx.type === "fact") {
        const mm = ctx.q.match(/^(.*) de (.+)$/);
        if (!mm) return null;
        const candidate = mm[1] + " de " + normalize(m[1]);
        const hit = this._findFact(candidate);
        if (hit && hit.score >= this.options.answerThreshold) {
          this._ctx = { type: "fact", q: candidate };
          return { answer: hit.fact.answer, source: "memoria", trace: "Seguí el hilo: entendí «" + candidate + "» y lo encontré en lo que me enseñaste." };
        }
      }
      return null;
    }

    _builtin(input) {
      const n = normalize(input);
      if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)( atlas)?$/.test(n)) {
        return "¡Hola" + (this.state.profile.nombre ? ", " + this.state.profile.nombre : "") + "! Soy ATLAS. ¿Qué te gustaría hacer hoy?";
      }
      if (/\b(como te llamas|quien eres)\b/.test(n)) {
        return "Soy ATLAS, un asistente que razona con un motor local: calculo, deduzco a partir de lo que me enseñas y te explico cómo lo pensé.";
      }
      if (/\b(que puedes hacer|que sabes hacer)\b/.test(n)) {
        return "Puedo calcular, aprender de frases como «el gato es un mamífero», deducir cosas nuevas combinando lo que sé, seguir el hilo de la conversación y explicarte mi razonamiento con «¿por qué?».";
      }
      if (/\b(gracias|muchas gracias)\b/.test(n)) return "¡De nada! ¿En qué más puedo ayudarte?";
      if (/\b(adios|hasta luego|nos vemos)\b/.test(n)) return "¡Hasta luego! Aquí estaré cuando vuelvas.";
      if (/\b(no entiendo|no comprendo)\b/.test(n)) return "Podemos verlo paso a paso. ¿Qué parte te resulta confusa?";
      if (/\b(quien|que|como|cuando|donde|por que)\b/.test(n) && n.split(" ").length <= 3) {
        return "Puedo intentar ayudarte, pero necesito un poco más de contexto.";
      }
      return null;
    }

    // Piensa una respuesta SIN guardarla en el historial.
    _think(raw) {
      const input = String(raw == null ? "" : raw).trim().slice(0, MAX_TEXT);
      if (!input) return { input, answer: "Te estoy escuchando. Escribe algo para comenzar.", source: "sistema", trace: "", known: true };
      const n = normalize(input);
      const done = (r, known) => Object.assign({ input, known: known !== false }, r);

      const guard = this._guard(n);
      if (guard) return done(Object.assign({ source: "seguridad" }, guard));

      if (/^(por que|y por que|como lo sabes|por que lo dices|explicame)$/.test(n)) {
        return done(this._lastTrace
          ? { answer: "Lo pensé así: " + this._lastTrace, source: "explicación", trace: "Repetí mi último razonamiento." }
          : { answer: "Todavía no he razonado nada que explicar. Pregúntame algo primero.", source: "explicación", trace: "" });
      }

      const personal = this._personal(input, n);
      if (personal) return done(Object.assign({ source: "memoria" }, personal));

      const math = solveMath(input);
      if (math) return done(Object.assign({ source: "cálculo" }, math));

      const clock = this._clock(n);
      if (clock) return done(Object.assign({ source: "reloj" }, clock));

      const follow = this._followUp(input);
      if (follow) return done(follow);

      const learned = this._learnStatement(input);
      if (learned) return done(learned);

      const match = this._findFact(input);
      if (match && match.score === 1) {
        this._ctx = { type: "fact", q: n };
        return done({ answer: match.fact.answer, source: "memoria", trace: "Coincide exactamente con algo que me enseñaste: «" + match.question + "»." });
      }

      const rel = this._askRelations(input);
      if (rel) return done(rel);

      if (match && match.score >= this.options.answerThreshold) {
        this._ctx = { type: "fact", q: n };
        return done({
          answer: match.fact.answer,
          source: "memoria",
          trace: "Tu pregunta se parece (" + Math.round(match.score * 100) + "%) a «" + match.question + "», que me enseñaste."
        });
      }

      const builtin = this._builtin(input);
      if (builtin) return done({ answer: builtin, source: "sistema", trace: "Respuesta incorporada." });

      const recent = this.state.history.slice(-3);
      const repeated = recent.some(item => normalize(item.user) === n);
      let answer = repeated
        ? "Ya hablamos de algo parecido, pero todavía no tengo una respuesta suficientemente fiable. Puedes enseñarme con una frase como «el gato es un mamífero» o con learn(pregunta, respuesta)."
        : "Todavía no tengo información suficiente para responder con seguridad. Puedes enseñarme con una frase como «el gato es un mamífero» o con learn(pregunta, respuesta), y lo recordaré localmente.";
      if (match && match.score >= this.options.suggestThreshold) {
        answer += " ¿Quizá te refieres a \"" + match.question + "\"?";
      }
      return done({ answer, source: "desconocido", trace: "No encontré nada suficientemente parecido en lo que sé." }, false);
    }

    _record(result) {
      this._lastTrace = result.trace || this._lastTrace;
      this.state.history.push({ user: result.input, assistant: result.answer, at: Date.now() });
      this.state.history = this.state.history.slice(-this.options.maxHistory);
      this._save();
    }

    // Responde y devuelve el detalle: { answer, source, trace, known }.
    think(message) {
      const r = this._think(message);
      if (r.input) this._record(r);
      return { answer: r.answer, source: r.source, trace: r.trace, known: r.known };
    }

    respond(message) {
      return this.think(message).answer;
    }

    // Como think(), pero si no sabe consulta options.fallback (por ejemplo, Wikipedia o una IA).
    async ask(message) {
      const r = this._think(message);
      if (!r.input) return { answer: r.answer, source: r.source, trace: r.trace, known: r.known };
      let out = r;
      if (!r.known && typeof this.options.fallback === "function") {
        try {
          const ext = await this.options.fallback(r.input, { history: this.getHistory(), profile: Object.assign({}, this.state.profile) });
          if (typeof ext === "string" && ext.trim()) {
            out = { input: r.input, answer: ext.trim(), source: "externo", trace: "No lo sabía, así que consulté la fuente externa configurada.", known: true };
          }
        } catch (_) { /* si falla, se queda con la respuesta honesta de "no sé" */ }
      }
      this._record(out);
      return { answer: out.answer, source: out.source, trace: out.trace, known: out.known };
    }

    explain() {
      return this._lastTrace;
    }

    getHistory() {
      return this.state.history.slice();
    }

    getStats() {
      return {
        learnedFacts: Object.keys(this.state.facts).length,
        rememberedItems: Object.keys(this.state.profile).length,
        relations: this.listRelations().length,
        conversationTurns: this.state.history.length
      };
    }

    clearConversation() {
      this.state.history = [];
      this._ctx = null;
      this._lastTrace = "";
      this._save();
    }

    clearAll() {
      this.state = { facts: dict(), history: [], profile: dict(), relations: dict() };
      this._ctx = null;
      this._lastTrace = "";
      this._save();
    }
  }

  AtlasBrain.version = VERSION;

  root.AtlasBrain = AtlasBrain;
  if (typeof module !== "undefined" && module.exports) module.exports = AtlasBrain;
})(typeof window !== "undefined" ? window : globalThis);
