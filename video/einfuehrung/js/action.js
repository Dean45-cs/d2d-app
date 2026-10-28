/*
 * Action-Schnitt: dieselben Szenen, schneller geschnitten und mit mehr Druck.
 *
 * Zeit: Ausgabezeit tau -> Szenenzeit t. Grundtempo 1,25x (120 -> 150 BPM);
 * ruhige Stellen laufen zusaetzlich schneller durch. Jede Raffung spart
 * ganze Schlaege, darum bleibt alles danach im Takt der neuen Musik.
 *
 * Kamera: alle Szenen haengen in einer Kamera-Ebene. Sie punscht auf jeden
 * Takt und jeden Treffer, ruckt bei Einschlaegen und reisst an jedem
 * Kapitelschnitt durch. Der Hintergrund bewegt sich nur halb so stark mit.
 */
(function () {
  const V = window.V;
  const { el, clamp, p, E } = V;

  const SPEED = 1.25;
  const BPM = V.BPM * SPEED;
  const BEAT = 60 / BPM;
  const BEAT_SRC = V.BEAT;

  // [von, bis, Schlaege] in Szenenzeit: dort laufen so viele Schlaege weniger
  const RAMPS = [
    [14.9, 16.1, 1], // fuenf Bereiche stehen
    [35.0, 36.4, 1], // Klinken: Liste
    [38.0, 40.3, 2], // vier Tasten stehen
    [43.9, 45.5, 1], // Nicht da
    [50.6, 52.3, 1], // Ablehnungsgrund
    [52.7, 54.3, 1], // Mehrfamilienhaus
    [55.3, 56.9, 1],
    [59.6, 65.3, 6], // In meiner Naehe: Route steht
    [76.8, 78.3, 1], // Erinnerung
    [94.4, 96.5, 2], // Team-Feed
    [101.6, 104.2, 2], // Visitenkarte steht
    [107.2, 109.4, 2], // Energiekarte
    [111.8, 113.2, 1],
    [119.7, 122.2, 2], // Netzdiagramm
    [125.2, 126.4, 1], // Treppchen
    [127.0, 128.5, 1],
    [132.7, 134.2, 1], // Medaillen
    [139.6, 141.2, 1], // Kunden
    [158.6, 160.0, 1], // Abspann
  ];
  const EDGE = 0.2; // weiche Uebergaenge in die Raffung

  /** Wie viel Ausgabezeit eine Szenensekunde bei t kostet (relativ zum Grundtempo). */
  function slowness(t) {
    for (const [a, b, beats] of RAMPS) {
      if (t <= a || t >= b) continue;
      // Ersparnis = (1 - w0) * (b - a - EDGE), genau beats * BEAT_SRC
      const w0 = 1 - (beats * BEAT_SRC) / (b - a - EDGE);
      const e = Math.min(clamp((t - a) / EDGE), clamp((b - t) / EDGE));
      return 1 - (1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * e));
    }
    return 1;
  }

  // Tabelle Szenenzeit -> Ausgabezeit (Mittelpunktregel, 0,5 ms Raster)
  const DT = 0.0005;
  const MAX = 200;
  const table = new Float64Array(Math.ceil(MAX / DT) + 1);
  for (let i = 1; i < table.length; i++) table[i] = table[i - 1] + (slowness((i - 0.5) * DT) * DT) / SPEED;

  const toOut = (t) => {
    const x = clamp(t / DT, 0, table.length - 1);
    const i = Math.floor(x);
    return i >= table.length - 1 ? table[i] : table[i] + (table[i + 1] - table[i]) * (x - i);
  };
  const toSrc = (tau) => {
    let lo = 0;
    let hi = table.length - 1;
    if (tau <= 0) return 0;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid] < tau) lo = mid;
      else hi = mid;
    }
    return (lo + (tau - table[lo]) / (table[hi] - table[lo])) * DT;
  };
  V.cut = { name: "action", speed: SPEED, bpm: BPM, toOut, toSrc };

  /* ------------------------------ Kamera --------------------------------- */

  // Treffer: [Punch (Zoom-Anteil), Ruck (px)]
  const HITS = {
    tap: [0.006, 0],
    key: [0.002, 0],
    xp: [0.012, 0],
    pop: [0.01, 0],
    tick: [0.004, 0],
    split: [0.02, 4],
    switch: [0.01, 0],
    color: [0.016, 0],
    medal: [0.012, 2],
    ring: [0.008, 0],
    push: [0.018, 0],
    sent: [0.012, 0],
    close: [0.014, 0],
    folder: [0.01, 0],
    sheet: [0.006, 0],
    build: [0.01, 0],
    hit: [0.035, 12],
    "hit-big": [0.05, 18],
    impact: [0.06, 22],
    levelup: [0.03, 10],
    drop: [0.07, 28],
  };

  const pulse = (dt, decay) => (dt < 0 ? 0 : dt < 0.025 ? dt / 0.025 : Math.exp(-(dt - 0.025) * decay));
  const jitter = (t, seed) =>
    Math.sin(t * 2 * Math.PI * 10.7 + seed) * 0.55 + Math.sin(t * 2 * Math.PI * 6.3 + seed * 2.3) * 0.45;
  // Mindestzoom, damit verschobene/gedrehte Ebenen nie ihre Kanten zeigen
  const cover = (dx, dy, rot) => {
    const r = (rot * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    let need = 1;
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // Bildecke in Ebenen-Koordinaten (ohne Zoom) muss in der Ebene liegen
      const qx = (cx * V.W) / 2 - dx;
      const qy = (cy * V.H) / 2 - dy;
      need = Math.max(need, (2 * Math.abs(qx * c + qy * s)) / V.W, (2 * Math.abs(-qx * s + qy * c)) / V.H);
    }
    return need + 0.002;
  };

  let cam, bg, events, cuts, beatFrom, beatTo, dropAt;

  function setupCamera() {
    const stage = document.getElementById("stage");
    cam = el("div", "layer cam", stage);
    cam.style.cssText = "z-index:1;overflow:visible;transform-origin:960px 540px";
    for (const node of Array.from(stage.children)) {
      if (node === cam) continue;
      const z = Number(node.style.zIndex || 0);
      if (z === 0) bg = node;
      else if (z < 900) cam.appendChild(node);
    }
    bg.style.transformOrigin = "960px 540px";
    events = V.cues.filter((c) => HITS[c.kind]).map((c) => ({ t: c.t, punch: HITS[c.kind][0], shake: HITS[c.kind][1] }));
    cuts = V.CUTS.map(toOut);
    beatFrom = toOut(V.T.tabs);
    beatTo = toOut(V.T.outro + 3.3);
    dropAt = toOut(88);
  }

  function camera(tau) {
    // Handkamera: leben, auch wenn alles steht
    let dx = 6 * V.wave(tau, 0.9, 1);
    let dy = 4 * V.wave(tau, 0.75, 2);
    let rot = 0.16 * V.wave(tau, 0.6, 3);
    let zoom = 1;
    let bgZoom = 1;

    // Takt: jeder erste Schlag punscht, im Drop jeder Schlag
    if (tau > beatFrom && tau < beatTo) {
      const n = Math.floor(tau / BEAT);
      const dt = tau - n * BEAT;
      const inDrop = tau > dropAt && tau < cuts[4];
      const amp = n % 4 === 0 ? 0.012 : inDrop ? 0.006 : 0;
      zoom += amp * pulse(dt, 9);
      bgZoom += (n % 4 === 0 ? 0.03 : inDrop ? 0.015 : 0) * pulse(dt, 6);
    }

    // Treffer
    for (const ev of events) {
      const dt = tau - ev.t;
      if (dt < 0 || dt > 1.2) continue;
      zoom += ev.punch * pulse(dt, 11);
      if (ev.shake) {
        const env = Math.exp(-dt * 8);
        dx += ev.shake * env * jitter(tau, ev.t * 7);
        dy += ev.shake * 0.7 * env * jitter(tau, ev.t * 13 + 1);
        rot += ev.shake * 0.03 * env * jitter(tau, ev.t * 3 + 2);
      }
    }

    // Kapitelschnitt: reinziehen, durchreissen, auf der anderen Seite abfangen
    cuts.forEach((c, i) => {
      const dir = i % 2 ? 1 : -1;
      const a = p(tau, c - 0.3, 0.3, E.inQuad);
      const b = tau >= c ? 1 - p(tau, c, 0.55, E.outCubic) : 0;
      if (a <= 0 && b <= 0) return;
      const pre = tau < c ? a : 0;
      zoom *= 1 + 0.08 * pre + 0.07 * b;
      rot += dir * (1.1 * pre - 0.9 * b);
      dx += dir * (-70 * pre + 70 * b);
    });

    const s = Math.max(zoom, cover(dx, dy, rot));
    cam.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${s.toFixed(4)})`;
    // Hintergrund halb so stark: Tiefe
    const bdx = dx * 0.45;
    const bdy = dy * 0.45;
    const brot = rot * 0.45;
    const bs = Math.max(1 + (zoom - 1) * 0.5, cover(bdx, bdy, brot)) * bgZoom;
    bg.style.transform = `translate(${bdx.toFixed(2)}px, ${bdy.toFixed(2)}px) rotate(${brot.toFixed(3)}deg) scale(${bs.toFixed(4)})`;
  }

  /* --------------------------- Einhaengen -------------------------------- */

  const build = V.build;
  V.build = () => {
    build();
    V.cues.forEach((c) => (c.t = Math.round(toOut(c.t) * 1000) / 1000));
    const list = V.sceneList;
    V.sceneList = () =>
      list().map((s) => ({ ...s, start: toOut(s.start), dur: toOut(s.start + s.dur) - toOut(s.start) }));
    V.duration = toOut(V.duration);
    setupCamera();
  };

  const seek = V.seek;
  V.seek = (tau) => {
    seek(toSrc(tau));
    camera(tau);
  };
})();
