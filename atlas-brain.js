/* ATLAS BRAIN v2 · cerebro independiente de ATLAS IA
   - Sin internet, sin librerías, sin depender del resto de la app.
   - Memoria propia (localStorage "atlas_brain_v2"), razonamiento por reglas y explicación de cada decisión.
   - Si no entiende algo devuelve null y la app sigue con su motor normal.
   Uso:  ATLAS_BRAIN.conectar({consultar, guardarNombre, nombre});  ATLAS_BRAIN.pensar("texto") */
(function (root) {
  'use strict';
  var KEY = 'atlas_brain_v2';
  var S = { facts: {}, gustos: [], nogustos: [], notas: [], stats: { turnos: 0, propias: 0, delegadas: 0, datos: 0, cambios: 0 }, nac: Date.now() };
  var ctx = { esp: null, why: '' };   // memoria de trabajo (no se guarda)
  var ext = {};                        // conexiones opcionales con la app
  var SENS = /(contrasena|password|clave|pin|tarjeta|cvv|dni|curp|cedula|pasaporte|token|codigo)/;
  var ALIAS = { cumple: 'cumpleaños', cumpleanos: 'cumpleaños', nacimiento: 'cumpleaños', 'fecha de nacimiento': 'cumpleaños', ciudad: 'ciudad', pais: 'pais', color: 'color favorito' };
  var MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var STOP = /^(que|como|cual|cuales|quien|donde|cuando|cuanto|cuantos|por)$/;

  function n(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function load() { try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.facts) { for (var k in d) S[k] = d[k]; } } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function key(k) { k = n(k).replace(/^(el|la|los|las) /, '').slice(0, 40); return ALIAS[k] || k; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dias(x) { return x + (x === 1 ? ' día' : ' días'); }

  /* ---------- memoria de hechos ---------- */
  function setFact(k, v) {
    k = key(k); v = String(v).trim().replace(/[.!]+$/, '').slice(0, 200);
    if (!k || !v) return null;
    if (SENS.test(k)) return { bloq: 1 };
    if (!(k in S.facts) && Object.keys(S.facts).length >= 300) return { lleno: 1 };
    var prev = S.facts[k]; S.facts[k] = v; S.stats.datos++;
    if (prev !== undefined && prev !== v) S.stats.cambios++;
    return { k: k, v: v, prev: prev };
  }
  function dato(res) {
    if (res.bloq) return { t: 'Eso es información sensible y no la guardo 🔒 (ni contraseñas, ni tarjetas, ni documentos).', why: 'La clave del dato coincide con una lista de temas sensibles.' };
    if (res.lleno) return { t: 'Mi memoria personal está llena 😅 Borra algo con «olvida mi …».', why: 'Límite de 300 datos.' };
    var t = 'Anotado: tu ' + res.k + ' es «' + res.v + '» 🧠';
    if (res.prev !== undefined && res.prev !== res.v) t = 'Ojo 👀 antes me habías dicho que tu ' + res.k + ' era «' + res.prev + '». Lo actualicé a «' + res.v + '».';
    return { t: t, why: res.prev !== undefined && res.prev !== res.v ? 'Detecté que el dato nuevo contradice el guardado y lo reemplacé avisándote.' : 'Frase con la forma «mi X es Y» → guardé X=Y.' };
  }
  function find(k) { k = key(k); if (k in S.facts) return k; for (var f in S.facts) if (f.indexOf(k) >= 0 || k.indexOf(f) >= 0) return f; return null; }
  function addLista(lista, otra, txt) {
    var x = txt.trim().replace(/[.!]+$/, '').slice(0, 60), nx = n(x); if (!nx) return;
    S[otra] = S[otra].filter(function (y) { return n(y) !== nx; });
    if (!S[lista].some(function (y) { return n(y) === nx; })) S[lista].push(x);
    S[lista] = S[lista].slice(-30);
  }

  /* ---------- fechas ---------- */
  function parseFecha(s) {
    var t = n(s), now = new Date(), hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate()), m, d;
    if (/navidad/.test(t)) d = [11, 25];
    else if (/ano nuevo|fin de ano/.test(t)) d = [0, 1];
    else if ((m = t.match(/(\d{1,2}) (?:de )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/))) d = [MES.indexOf(m[2]), +m[1]];
    if (!d) return null;
    var f = new Date(hoy.getFullYear(), d[0], d[1]);
    if (f.getMonth() !== d[0]) return null;
    if (f < hoy) f = new Date(hoy.getFullYear() + 1, d[0], d[1]);
    return { dias: Math.round((f - hoy) / 864e5), fecha: f };
  }

  /* ---------- habilidades (cada una devuelve {t, why} o null) ---------- */
  function cmd(raw) {
    var m = raw.match(/^\/cerebro(?:\s+(.+))?$/i); if (!m) return null;
    var a = n(m[1] || '');
    if (a === 'ver') {
      var f = Object.keys(S.facts).map(function (k) { return '• ' + k + ': ' + S.facts[k]; });
      return { t: '🧠 Lo que sé de ti:\n' + (f.length ? f.join('\n') : '(sin datos)') + (S.gustos.length ? '\n👍 Te gusta: ' + S.gustos.join(', ') : '') + (S.nogustos.length ? '\n👎 No te gusta: ' + S.nogustos.join(', ') : '') + (S.notas.length ? '\n📝 Notas: ' + S.notas.join(' | ') : ''), why: 'Comando /cerebro ver.' };
    }
    if (a === 'olvidar todo') { S.facts = {}; S.gustos = []; S.nogustos = []; S.notas = []; return { t: 'Listo, mi memoria personal quedó en blanco 🧹', why: 'Comando de borrado total.' }; }
    if (a === 'olvidar') return { t: 'Para borrar todo escribe: /cerebro olvidar todo', why: 'Pedí confirmación explícita.' };
    if (a === 'exportar') {
      try { var l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); l.download = 'atlas-brain-memoria.json'; document.body.appendChild(l); l.click(); l.remove(); return { t: '💾 Memoria del cerebro descargada.', why: 'Exportación local.' }; } catch (e) { return { t: 'No pude exportar 😕', why: 'Falló la descarga.' }; }
    }
    var st = S.stats, since = Math.max(1, Math.round((Date.now() - S.nac) / 864e5));
    return { t: '🧠 ATLAS BRAIN v2 · independiente y local\nDatos tuyos: ' + Object.keys(S.facts).length + ' · gustos: ' + (S.gustos.length + S.nogustos.length) + ' · notas: ' + S.notas.length +
      '\nMensajes vistos: ' + st.turnos + ' · resueltos por el cerebro: ' + st.propias + ' · pasados al motor base: ' + st.delegadas + ' · correcciones que detecté: ' + st.cambios +
      '\nActivo hace ' + dias(since) + '.\nComandos: /cerebro ver · /cerebro exportar · /cerebro olvidar todo', why: 'Estadísticas reales de uso guardadas en este dispositivo.' };
  }

  function esperando(raw) {
    if (!ctx.esp) return null;
    var e = ctx.esp; ctx.esp = null;
    if (raw[0] === '/' || /\?\s*$/.test(raw) || STOP.test(n(raw).split(' ')[0]) || raw.length > 120) return null;
    var r = setFact(e.k, raw); return r ? dato(r) : null;
  }

  function aprender(raw) {
    var m, t = n(raw), r;
    if (/\?\s*$/.test(raw)) return null;
    if ((m = raw.match(/^\s*(?:recuerda|recuerdame|anota|guarda)\s+que\s+(.+)$/i))) {
      var q = m[1].match(/^mi\s+(.{2,30}?)\s+(?:es|son|se llama|se llaman)\s+(.+)$/i);
      if (q) { r = setFact(q[1], q[2]); return r ? dato(r) : null; }
      S.notas.push(m[1].trim().slice(0, 150)); S.notas = S.notas.slice(-40); S.stats.datos++;
      return { t: 'Anotado 📝 «' + m[1].trim().slice(0, 150) + '»', why: 'Pediste recordar algo libre; lo guardé como nota.' };
    }
    if ((m = raw.match(/^\s*(?:me llamo|mi nombre es)\s+([\p{L}][\p{L} ]{0,28})[.!]?\s*$/u))) {
      var nom = cap(m[1].trim()); r = setFact('nombre', nom);
      if (ext.guardarNombre) { try { ext.guardarNombre(nom); } catch (e) {} }
      return r ? { t: '¡Mucho gusto, ' + nom + '! 😊 Lo recordaré.', why: 'Frase «me llamo X» → guardé tu nombre.' } : null;
    }
    if ((m = raw.match(/^\s*mi\s+(.{2,30}?)\s+(?:es|son|se llama|se llaman)\s+(.+?)\s*$/i))) { r = setFact(m[1], m[2]); return r ? dato(r) : null; }
    if ((m = t.match(/^tengo (\d{1,3}) anos$/))) { r = setFact('edad', m[1] + ' años'); return r ? dato(r) : null; }
    if ((m = raw.match(/^\s*vivo en\s+(.{2,40}?)[.!]?\s*$/i))) { r = setFact('ciudad', m[1]); return r ? dato(r) : null; }
    if ((m = raw.match(/^\s*no me gustan?\s+(.+)$/i))) { addLista('nogustos', 'gustos', m[1]); S.stats.datos++; return { t: 'Entendido 👎 no te gusta «' + m[1].trim() + '». Lo tendré en cuenta al recomendarte.', why: 'Preferencia negativa guardada; usa para decidir entre opciones.' }; }
    if ((m = raw.match(/^\s*me gustan?\s+(.+)$/i)) && !/^me gustar/i.test(raw)) { addLista('gustos', 'nogustos', m[1]); S.stats.datos++; return { t: 'Genial 👍 te gusta «' + m[1].trim() + '». Lo recordaré.', why: 'Preferencia positiva guardada; usa para decidir entre opciones.' }; }
    if ((m = t.match(/^olvida (?:que )?mi (.+)$/))) { var f = find(m[1]); if (f) { delete S.facts[f]; return { t: 'Olvidé tu ' + f + ' 🧹', why: 'Borrado a pedido tuyo.' }; } return { t: 'No tenía guardado eso 🙂', why: 'No existe ese dato.' }; }
    return null;
  }

  function recordar(raw) {
    var t = n(raw), m, f;
    if (/^(como me llamo|cual es mi nombre|quien soy yo|quien soy)$/.test(t)) {
      var nom = S.facts.nombre || (ext.nombre && ext.nombre());
      return nom ? { t: 'Te llamas ' + nom + ' 😊', why: 'Lo leí de mi memoria.' } : (ctx.esp = { k: 'nombre' }, { t: 'Aún no sé tu nombre. ¿Cómo te llamas?', why: 'No hay dato guardado; quedo esperando tu respuesta.' });
    }
    if (/^cuantos anos tengo$/.test(t)) t = 'cual es mi edad';
    if (/^donde vivo$/.test(t)) t = 'cual es mi ciudad';
    if ((m = t.match(/^(?:cual|como|que|quien)(?: es| son| se llama| se llaman)? mi (.+)$/))) {
      f = find(m[1]);
      if (f) return { t: 'Tu ' + f + ': ' + S.facts[f] + '.', why: 'Busqué «' + f + '» en mi memoria personal.' };
      ctx.esp = { k: m[1] };
      return { t: 'Aún no sé cuál es tu ' + key(m[1]) + ' 🤔 Dímelo y lo guardo (o escribe otra cosa).', why: 'No existe ese dato; quedo esperando tu respuesta para guardarlo.' };
    }
    if (/^que me gusta$|^que cosas me gustan$/.test(t)) return { t: S.gustos.length ? 'Me dijiste que te gusta: ' + S.gustos.join(', ') + '.' : 'Aún no me has contado qué te gusta. Prueba: «me gusta el fútbol».', why: 'Lista de gustos guardados.' };
    if (/^(que sabes de mi|que recuerdas de mi|que recuerdas|que sabes sobre mi)$/.test(t)) return cmd('/cerebro ver');
    return null;
  }

  function fechas(raw) {
    var t = n(raw), m, d, now = new Date();
    if (/^(que hora es|que hora tienes)$/.test(t)) return { t: '🕒 Son las ' + now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + '.', why: 'Leí el reloj de tu dispositivo.' };
    if (/^(que dia es hoy|que fecha es hoy|en que fecha estamos|a que fecha estamos|que dia es)$/.test(t)) return { t: '📅 Hoy es ' + now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.', why: 'Leí la fecha de tu dispositivo.' };
    if ((m = t.match(/^(?:cuantos dias|cuanto tiempo) (?:faltan|falta|quedan|queda) (?:para|hasta) (.+)$/))) {
      var obj = m[1], src = obj;
      if (/cumple/.test(obj) && S.facts['cumpleaños']) src = S.facts['cumpleaños'];
      d = parseFecha(src);
      if (!d) return /cumple/.test(obj) ? { t: 'Aún no sé tu cumpleaños 🎂 Dime: «mi cumpleaños es el 3 de mayo».', why: 'Falta el dato cumpleaños.' } : null;
      return { t: d.dias === 0 ? '🎉 ¡Es hoy!' : '⏳ Faltan ' + dias(d.dias) + ' (' + d.fecha.toLocaleDateString('es', { day: 'numeric', month: 'long' }) + ').', why: 'Calculé la diferencia entre hoy y la próxima fecha ' + (src !== obj ? '(tomada de tu cumpleaños guardado).' : 'indicada.') };
    }
    return null;
  }

  function palabras(s) { return n(s).split(' ').filter(function (w) { return w.length >= 5; }); }
  function sabe(x) {
    if (!ext.consultar) return null;
    var v = ['que es ' + x, 'que es un ' + x, 'que es una ' + x, 'que es el ' + x, 'que es la ' + x, x];
    for (var i = 0; i < v.length; i++) { var r; try { r = ext.consultar(v[i]); } catch (e) { r = null; } if (r) return r; }
    return null;
  }
  function comparar(raw) {
    var t = n(raw), m = t.match(/^(?:cual es la |cuales son las )?diferencias? entre (.+?) y (.+)$/) || t.match(/^compara(?:r|me)? (.+?) (?:con|y) (.+)$/) || t.match(/^en que se parecen (.+?) y (.+)$/);
    if (!m) return null;
    var a = sabe(m[1]), b = sabe(m[2]);
    if (!a && !b) return null;
    if (!a || !b) return { t: 'De «' + (a ? m[1] : m[2]) + '» sé: ' + (a || b) + '\nDe «' + (a ? m[2] : m[1]) + '» todavía no tengo información, así que no puedo compararlos bien. Enséñamela con /aprender 🧠', why: 'Solo encontré uno de los dos temas en la base de conocimiento.' };
    var pa = palabras(a), pb = palabras(b), comun = pa.filter(function (w, i) { return pb.indexOf(w) >= 0 && pa.indexOf(w) === i; }).slice(0, 5);
    var uno = function (s) { return s.split(/(?<=[.!?])\s/)[0]; };
    return { t: '⚖️ ' + cap(m[1]) + ' vs ' + m[2] + '\n\n🔹 ' + cap(m[1]) + ': ' + uno(a) + '\n🔸 ' + cap(m[2]) + ': ' + uno(b) + (comun.length ? '\n\n🤝 Ideas en común: ' + comun.join(', ') + '.' : '\n\n🤝 No encontré ideas en común en lo que sé.'), why: 'Busqué cada tema en la base de conocimiento, tomé la primera idea de cada uno y comparé sus palabras clave.' };
  }

  function decidir(raw) {
    var t = n(raw), m = t.match(/^(?:que prefieres|que elijo|que escojo|cual me recomiendas|que es mejor|cual es mejor|ayudame a elegir entre|elige entre|ayudame a decidir entre) (.+?) (?:o|y) (.+)$/);
    if (!m) return null;
    var op = [m[1], m[2]], pts = op.map(function (o) {
      var s = 0; S.gustos.forEach(function (g) { var x = n(g); if (x && (o.indexOf(x) >= 0 || x.indexOf(o) >= 0)) s++; });
      S.nogustos.forEach(function (g) { var x = n(g); if (x && (o.indexOf(x) >= 0 || x.indexOf(o) >= 0)) s--; }); return s; });
    if (pts[0] === pts[1]) return { t: 'No tengo datos tuyos para inclinar la balanza entre «' + op[0] + '» y «' + op[1] + '» 🤔 Cuéntame cuál te gusta más («me gusta …») y la próxima vez decido por ti.', why: 'Ninguna opción coincide con tus gustos guardados, así que prefiero no inventar.' };
    var w = pts[0] > pts[1] ? 0 : 1;
    return { t: '🎯 Yo elegiría «' + op[w] + '».\nMotivo: ' + (pts[w] > 0 ? 'me dijiste que te gusta' : 'me dijiste que no te gusta «' + op[1 - w] + '»') + '.', why: 'Puntué cada opción con tus gustos (+1) y disgustos (−1): ' + op[0] + '=' + pts[0] + ', ' + op[1] + '=' + pts[1] + '.' };
  }

  var ANIMO = { triste: 'Siento que estés triste 💙 Si quieres cuéntame qué pasó. Hablarlo con alguien de confianza también ayuda.', solo: 'Aquí estoy contigo 💙 Y piensa en alguien de confianza a quien escribirle hoy.', aburrido: '¿Aburrido/a? Te propongo: un chiste, un dibujo («dibuja un dragón») o un dato curioso 😄', cansado: 'Descansa un poco 😴 Tomar agua y estirarte unos minutos ayuda.', contento: '¡Me alegra mucho! 😄 ¿Qué pasó?', feliz: '¡Qué bueno! 🎉 Cuéntame.', estresado: 'Respira hondo: 4 segundos inhalando y 6 exhalando 🌬️ Una tarea a la vez.', nervioso: 'Es normal sentir nervios 💪 Respira lento y piensa en el primer paso pequeño.', enojado: 'Entiendo 😮‍💨 Date unos minutos antes de responder o decidir algo.', molesto: 'Entiendo 😮‍💨 Date unos minutos antes de responder o decidir algo.', emocionado: '¡Qué emoción! 🚀 ¿De qué se trata?' };
  function animo(raw) {
    var m = n(raw).match(/^(?:estoy|me siento|ando) (?:muy |bastante |un poco )?(triste|solo|sola|aburrid[oa]|cansad[oa]|content[oa]|feliz|estresad[oa]|nervios[oa]|enojad[oa]|molest[oa]|emocionad[oa])$/);
    if (!m) return null;
    var k = m[1].replace(/a$/, 'o').replace(/^sol[oa]$/, 'solo'); if (k === 'content' ) k = 'contento';
    return ANIMO[k] ? { t: ANIMO[k], why: 'Detecté la emoción «' + m[1] + '» y respondí con una reacción empática.' } : null;
  }

  function yo(raw) {
    var t = n(raw);
    if (/^(quien eres|que eres|presentate|como te llamas)$/.test(t)) return { t: 'Soy ATLAS IA 🤖 y mi cerebro (ATLAS BRAIN) es un módulo independiente: recuerda lo que me cuentas, compara temas, decide con tus gustos y te explica cómo llegó a cada respuesta. Todo funciona en tu dispositivo.', why: 'Pregunta de identidad.' };
    if (/^(tienes cerebro|piensas|piensas por ti mismo|piensas solo|puedes pensar|sabes pensar|que puede hacer tu cerebro|que sabe hacer tu cerebro)$/.test(t)) return { t: 'Te soy honesto 🧠: no soy una IA generativa. Mi cerebro razona con reglas y con lo que tengo guardado. Puedo:\n• Recordar tus datos y gustos («mi color favorito es azul»)\n• Detectar si te contradices\n• Comparar temas («diferencia entre gato y perro»)\n• Elegir por ti («qué prefieres, pizza o sushi»)\n• Calcular fechas («cuántos días faltan para navidad»)\n• Explicarte mi razonamiento: pregunta «¿por qué dijiste eso?»\nEscribe /cerebro para ver mi estado.', why: 'Pregunta sobre mis capacidades; respondí con las habilidades reales del módulo.' };
    if (/^(por que dijiste eso|por que me dijiste eso|por que respondiste eso|como llegaste a eso|explica tu razonamiento|como pensaste eso|por que)$/.test(t)) return { t: ctx.why ? '🔍 Mi razonamiento: ' + ctx.why : 'Aún no he razonado nada reciente que explicar 🙂', why: 'Expliqué mi último razonamiento.' };
    return null;
  }

  function plan(raw) {
    if (!/^(que hacemos|que hacemos hoy|que hago|que hago hoy|que hacer|que podemos hacer|que puedo hacer|que hacemos ahora|vamos a hacer algo)$/.test(n(raw))) return null;
    var ideas = ['🎨 Pídeme un dibujo: «dibuja un dragón»', '🧮 Ponme a prueba con una cuenta: «15% de 200»', '⚖️ Comparemos algo: «diferencia entre gato y perro»', '😄 «Cuéntame un chiste»', '🧠 Enséñame algo con /aprender pregunta | respuesta'];
    if (S.gustos.length) ideas.unshift('💬 Hablemos de «' + S.gustos[S.gustos.length - 1] + '», que me dijiste que te gusta');
    return { t: '¡Buena pregunta! Algunas ideas:\n' + ideas.slice(0, 4).join('\n') + '\n\n¿Cuál te late?', why: 'Pregunta abierta sobre qué hacer; propuse actividades' + (S.gustos.length ? ' y puse primero un tema que te gusta.' : '.') };
  }

  var SKILLS = [cmd, esperando, aprender, recordar, fechas, comparar, decidir, animo, plan, yo];
  function pensar(raw) {
    raw = String(raw || '').trim(); if (!raw || raw.length > 300) return null;
    S.stats.turnos++;
    var keep = ctx.why, r = null;
    try { for (var i = 0; i < SKILLS.length && !r; i++) r = SKILLS[i](raw); } catch (e) { r = null; }
    if (r) { S.stats.propias++; if (!/^por que|^como (llegaste|pensaste)|^explica tu/.test(n(raw))) ctx.why = r.why || ''; else ctx.why = keep; save(); return { texto: r.t, why: r.why }; }
    S.stats.delegadas++; save(); return null;
  }

  load();
  root.ATLAS_BRAIN = { version: '2.0', pensar: pensar, conectar: function (o) { ext = o || {}; }, estado: function () { return JSON.parse(JSON.stringify(S)); } };
})(typeof window !== 'undefined' ? window : globalThis);
