/*
 * Kleine Bewegungs-Engine fuer das Einfuehrungsvideo.
 *
 * Alles ist eine reine Funktion der Zeit: V.seek(t) stellt jedes Element so,
 * wie es in Sekunde t aussieht. Es gibt keine CSS-Uebergaenge und keinen
 * Zufall ohne Saat - so rendert render.mjs jedes Bild exakt gleich, egal in
 * welcher Reihenfolge oder auf wie vielen Prozessen.
 */
(function () {
  const V = (window.V = {});
  V.W = 1920;
  V.H = 1080;
  V.FPS = 60;
  V.BPM = 120;
  V.BEAT = 60 / V.BPM;

  /* ------------------------------ Mathe ---------------------------------- */

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  V.clamp = clamp;
  V.lerp = lerp;
  V.mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t));

  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inQuart: (t) => t * t * t * t,
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutQuint: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    // Feder: schwingt ueber und kommt zur Ruhe (wie --ease-pop der App, nur lebendiger)
    spring: (t, damping = 7, freq = 2.6) =>
      t >= 1 ? 1 : 1 - Math.exp(-damping * t) * Math.cos(freq * Math.PI * 2 * t * 0.5),
    // die Kurven der App (docs/DESIGN.md)
    appSpring: bezier(0.32, 0.72, 0, 1),
    appOut: bezier(0.22, 1, 0.36, 1),
    appPop: bezier(0.34, 1.4, 0.64, 1),
  };
  V.E = E;

  /** Kubische Bezier wie in CSS. */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= (sx(t) - x) / d;
      }
      t = clamp(t);
      return sy(t);
    };
  }
  V.bezier = bezier;

  /** Fortschritt 0..1 zwischen start und start+dur, mit Kurve. */
  V.p = (t, start, dur, ease = E.linear) => ease(clamp((t - start) / dur));

  /**
   * Schluesselbilder: [[zeit, wert, kurve?], ...]. Die Kurve gilt fuer den
   * Weg zu diesem Bild. Werte duerfen Zahlen oder Zahlenlisten sein.
   */
  V.kf = (t, frames) => {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1, ease = E.inOutCubic] = frames[i];
      const [t0, v0] = frames[i - 1];
      if (t <= t1) {
        const k = t1 === t0 ? 1 : ease((t - t0) / (t1 - t0));
        return V.mix(v0, v1, k);
      }
    }
    return frames[frames.length - 1][1];
  };

  /** Ein-/Ausblenden: 0 -> 1 -> 0 ueber die Lebenszeit eines Elements. */
  V.life = (t, start, end, inDur = 0.5, outDur = 0.4, inEase = E.outCubic, outEase = E.inCubic) => {
    if (t < start || t > end) return 0;
    const a = inDur > 0 ? inEase(clamp((t - start) / inDur)) : 1;
    const b = outDur > 0 ? 1 - outEase(clamp((t - (end - outDur)) / outDur)) : 1;
    return Math.min(a, b);
  };

  /** Deterministischer Zufall (mulberry32). */
  V.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Glattes Rauschen fuer Schwebebewegungen. */
  V.wave = (t, speed = 1, seed = 0) =>
    Math.sin(t * speed * 1.3 + seed * 1.7) * 0.6 + Math.sin(t * speed * 0.71 + seed * 3.1) * 0.4;

  /* ------------------------------- DOM ----------------------------------- */

  V.el = (tag, cls, parent, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    if (parent) parent.appendChild(node);
    return node;
  };
  V.$ = (root, sel) => root.querySelector(sel);
  V.$$ = (root, sel) => Array.from(root.querySelectorAll(sel));

  const r3 = (n) => Math.round(n * 1000) / 1000;

  /**
   * Stellt Lage, Groesse, Drehung, Deckkraft und Unschaerfe eines Elements.
   * Nur gesetzte Werte zaehlen; o <= 0 blendet ganz aus (visibility).
   */
  V.set = (node, s) => {
    if (!node) return;
    const st = node.style;
    if (s.o !== undefined) {
      const o = clamp(s.o);
      st.opacity = r3(o);
      st.visibility = o <= 0.001 ? "hidden" : "visible";
    }
    let tf = "";
    if (s.persp) tf += `perspective(${s.persp}px) `;
    if (s.x !== undefined || s.y !== undefined || s.z !== undefined)
      tf += `translate3d(${r3(s.x || 0)}px, ${r3(s.y || 0)}px, ${r3(s.z || 0)}px) `;
    if (s.rx) tf += `rotateX(${r3(s.rx)}deg) `;
    if (s.ry) tf += `rotateY(${r3(s.ry)}deg) `;
    if (s.rz) tf += `rotateZ(${r3(s.rz)}deg) `;
    if (s.s !== undefined) tf += `scale(${r3(s.s)}) `;
    if (s.sx !== undefined || s.sy !== undefined) tf += `scale(${r3(s.sx ?? 1)}, ${r3(s.sy ?? 1)}) `;
    if (tf) st.transform = tf.trim();
    if (s.blur !== undefined || s.bright !== undefined || s.sat !== undefined) {
      let f = "";
      if (s.blur > 0.05) f += `blur(${r3(s.blur)}px) `;
      if (s.bright !== undefined && s.bright !== 1) f += `brightness(${r3(s.bright)}) `;
      if (s.sat !== undefined && s.sat !== 1) f += `saturate(${r3(s.sat)}) `;
      st.filter = f.trim() || "none";
    }
    if (s.clip !== undefined) st.clipPath = s.clip;
  };

  /** Text in Woerter (und optional Zeichen) zerlegen - fuer gestaffeltes Einblenden. */
  V.split = (node, text, mode = "word") => {
    node.innerHTML = "";
    const parts = [];
    const words = text.split(" ");
    words.forEach((word, wi) => {
      const w = V.el("span", "w", node);
      if (mode === "char") {
        for (const ch of word) parts.push(V.el("span", "c", w, ch === " " ? "&nbsp;" : ch));
      } else {
        w.innerHTML = word;
        parts.push(w);
      }
      if (wi < words.length - 1) node.appendChild(document.createTextNode(" "));
    });
    return parts;
  };

  /**
   * Gestaffeltes Einblenden: jedes Teil kommt von unten, scharf aus der
   * Unschaerfe. Mit out > 0 verschwinden sie wieder nach oben.
   */
  V.stagger = (parts, t, start, opts = {}) => {
    const { each = 0.045, dur = 0.7, dy = 46, blur = 14, ease = E.outExpo, out = null, outDur = 0.35, rot = 0, sIn = 1 } = opts;
    parts.forEach((part, i) => {
      const k = ease(clamp((t - start - i * each) / dur));
      let o = k, y = (1 - k) * dy, b = (1 - k) * blur, r = (1 - k) * rot, s = lerp(sIn, 1, k);
      if (out !== null) {
        const q = E.inCubic(clamp((t - out - i * each * 0.5) / outDur));
        o *= 1 - q;
        y -= q * dy * 0.6;
        b += q * blur * 0.6;
      }
      V.set(part, { o, y, blur: b, rz: r, s });
    });
  };

  /** Zahl hochzaehlen, deutsch formatiert. */
  V.count = (value, decimals = 0) =>
    value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  /* ------------------------------ Szenen --------------------------------- */

  const scenes = [];
  const layers = [];

  /**
   * Eine Szene lebt von start bis start+dur; pre/post halten sie fuer
   * Ueberblendungen laenger sichtbar. update(lt, s, scene) bekommt die
   * Zeit relativ zum Start.
   */
  V.scene = (def) => {
    scenes.push({ pre: 0, post: 0, z: 10, ...def });
  };

  /** Ebenen, die immer laufen (Hintergrund, Koernung, Blitz). */
  V.layer = (def) => {
    layers.push({ z: 0, ...def });
  };

  V.cues = []; // Ton-Hinweise: { t, kind, ... } - liest audio/soundtrack.py
  V.cue = (t, kind, extra = {}) => V.cues.push({ t: Math.round(t * 1000) / 1000, kind, ...extra });

  V.duration = 0;

  V.build = () => {
    const stage = document.getElementById("stage");
    for (const layer of layers) {
      layer.root = V.el("div", `layer ${layer.cls || ""}`, stage);
      layer.root.style.zIndex = layer.z;
      layer.state = layer.build ? layer.build(layer.root) : {};
    }
    for (const scene of scenes) {
      scene.root = V.el("div", `scene ${scene.cls || ""}`, stage);
      scene.root.dataset.scene = scene.id;
      scene.root.style.zIndex = scene.z;
      scene.root.style.display = "none";
      scene.state = scene.build(scene.root, scene) || {};
      V.duration = Math.max(V.duration, scene.start + scene.dur);
      if (scene.cues) scene.cues(scene.start, scene);
    }
    V.cues.sort((a, b) => a.t - b.t);
  };

  V.active = (t) => scenes.filter((s) => t >= s.start - s.pre && t < s.start + s.dur + s.post);

  V.seek = (t) => {
    for (const layer of layers) if (layer.update) layer.update(t, layer.state, layer);
    for (const scene of scenes) {
      const on = t >= scene.start - scene.pre && t < scene.start + scene.dur + scene.post;
      if (on) {
        if (scene.root.style.display === "none") scene.root.style.display = "";
        scene.update(t - scene.start, scene.state, scene);
      } else if (scene.root.style.display !== "none") {
        scene.root.style.display = "none";
      }
    }
  };

  V.sceneList = () => scenes.map(({ id, start, dur }) => ({ id, start, dur }));
})();
