/*
 * Kapitel 05 · Visitenkarte (QR-Code an der Tuer) und
 * Kapitel 06 · Preise (Energiekarte: wo der Grundversorger teuer ist).
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  /* ------------------------------ QR-Code ------------------------------- */

  /** Ein QR-Muster (29 x 29) mit Suchmustern und Taktlinien, feste Saat. */
  function qrModules(n = 29) {
    const rnd = V.rng(4711);
    const grid = Array.from({ length: n }, () => Array(n).fill(0));
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++)
        for (let c = -1; c <= 7; c++) {
          const rr = r0 + r, cc = c0 + c;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr][cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (edge || core) ? 2 : -1;
        }
    };
    finder(0, 0);
    finder(0, n - 7);
    finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) {
      grid[6][i] = i % 2 === 0 ? 1 : -1;
      grid[i][6] = i % 2 === 0 ? 1 : -1;
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === 0) grid[r][c] = rnd() < 0.48 ? 1 : -1;
    // kleines Ausrichtungsmuster
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) grid[n - 9 + r][n - 9 + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1 ? 1 : -1;
    const out = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] > 0) out.push({ r, c, f: grid[r][c] === 2 });
    return out;
  }

  const qrSvg = (size, cls = "") => {
    const n = 29;
    const mods = qrModules(n);
    const u = size / (n + 2);
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${u * 1.5}" fill="#fff"/>${mods
      .map((m) => `<rect class="qm" data-d="${Math.hypot(m.r - 14, m.c - 14).toFixed(2)}" x="${((m.c + 1) * u).toFixed(2)}" y="${((m.r + 1) * u).toFixed(2)}" width="${(u + 0.4).toFixed(2)}" height="${(u + 0.4).toFixed(2)}" rx="${m.f ? 0.5 : u * 0.3}" fill="#0b1510"/>`)
      .join("")}</svg>`;
  };

  V.scene({
    id: "visitenkarte",
    start: T.karte,
    dur: T.preise - T.karte,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:1300px 560px";
      // Telefon des Verkaeufers: Visitenkarte zum Vorzeigen
      const a = V.phone(cam, { x: 840, y: 150, time: "18:12" });
      a.app.innerHTML = `
<div class="scroll pad" style="padding-top:64px;text-align:center">
  <div style="display:flex;justify-content:space-between;align-items:center"><span class="a-title3" style="font-weight:700">Visitenkarte</span><span class="door-glyph" style="width:30px;height:30px">${V.ic("x", 14)}</span></div>
  <div class="a-foot muted" style="text-align:left;margin-top:2px">Zum Scannen mit der Kamera</div>
  <div class="surface" style="margin:22px auto 0;width:320px;padding:16px;border-radius:28px">${qrSvg(288, "qr")}</div>
  <div style="margin-top:22px">${V.avatar("JC", "purple", 72)}</div>
  <div class="a-title2" style="margin-top:10px">Jonas Carlsson</div>
  <div class="a-sub ink2">Beratung Strom &amp; Gas</div>
  <div class="a-foot muted">Carlsson Sales</div>
</div>`;
      // Telefon der Kundin: erst Kamera, dann die Seite
      const b = V.phone(cam, { x: 1370, y: 150, time: "18:12" });
      b.app.innerHTML = `
<div class="cam" style="position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,#3a3f3c,#0d0f0e 70%)">
  <div style="position:absolute;left:50%;top:44%;width:230px;height:230px;margin:-115px 0 0 -115px;transform:perspective(500px) rotateY(18deg) rotateZ(-4deg);filter:blur(.3px) brightness(.92)">${qrSvg(230)}</div>
  <div class="frame" style="position:absolute;left:50%;top:44%;width:270px;height:270px;margin:-135px 0 0 -135px;border-radius:26px;box-shadow:0 0 0 3px #ffd60a;clip-path:polygon(0 0,22% 0,22% 3%,3% 3%,3% 22%,0 22%,0 78%,3% 78%,3% 97%,22% 97%,22% 100%,78% 100%,78% 97%,97% 97%,97% 78%,100% 78%,100% 22%,97% 22%,97% 3%,78% 3%,78% 0,100% 0,100% 100%,0 100%)"></div>
  <div class="scanline" style="position:absolute;left:50%;top:44%;width:260px;height:4px;margin-left:-130px;background:linear-gradient(90deg,transparent,#ffd60a,transparent);box-shadow:0 0 18px #ffd60a"></div>
  <div class="linkpill" style="position:absolute;left:50%;top:70%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;background:#ffd60a;color:#111;font-weight:600;font-size:15px;white-space:nowrap">${V.ic("qr", 18)}carlsson-sales.de öffnen</div>
  <div style="position:absolute;left:0;right:0;bottom:40px;display:flex;justify-content:center"><span style="width:70px;height:70px;border-radius:50%;border:5px solid #fff"></span></div>
</div>
<div class="page" style="position:absolute;inset:0;background:var(--bg)">
  <div style="padding:58px 14px 8px;border-bottom:.5px solid var(--sep)"><div style="height:36px;border-radius:12px;background:var(--fill);display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px" class="ink2">${V.ic("shield", 13)}carlsson-sales.de</div></div>
  <div class="pad" style="text-align:center;padding-top:24px">
    <div class="pg">${V.avatar("JC", "purple", 104)}</div>
    <div class="pg a-large" style="font-size:28px;margin-top:12px">Jonas Carlsson</div>
    <div class="pg ink2">Beratung Strom &amp; Gas</div>
    <div class="pg a-sub muted">Carlsson Sales</div>
    <div class="pg" style="margin-top:14px"><span class="badge live" style="padding:6px 14px;font-size:14px">${V.ic("check", 14)}Aktiv im Team</span></div>
    <div class="pg a-foot muted" style="margin-top:6px">Stand heute, 18:12 Uhr</div>
    <div class="pg list" style="margin-top:16px;text-align:left">
      <div class="cell"><span style="flex:1">Ausweis-Nr.</span><b style="font-weight:500">CS-0425</b></div>
      <div class="cell"><span style="flex:1">Dabei seit</span><span class="muted">März 2025</span></div>
    </div>
    <div class="pg btn-primary" style="margin-top:14px;height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600">${V.ic("phone", 18)}0171 9876543</div>
    <div class="pg save" style="margin-top:8px;height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:600;background:var(--fill)">Kontakt speichern</div>
  </div>
</div>`;
      const beam = el("div", "abs", cam);
      beam.style.cssText =
        "left:1230px;top:470px;width:220px;height:6px;border-radius:3px;background:linear-gradient(90deg,rgb(255 214 10/0),#ffe766,rgb(255 214 10/0));box-shadow:0 0 30px #ffd60a;transform-origin:0 50%";
      const tapper = V.tapper(b.screen);
      tapper.root.style.zIndex = "120";
      const chapter = V.chapter(root, "05", "Visitenkarte");
      const cap = V.caption(root, {
        x: 120, y: 280, w: 700,
        eyebrow: "Vertrauen an der Tür",
        title: ["„Wer sind Sie", "überhaupt?“"],
        accentWords: ["überhaupt?“"],
        lede: "QR-Code zeigen – die Kundin scannt und sieht Bild, Name, Team und Ausweisnummer. Live vom Server, mit Uhrzeit des Abrufs: Ein Bildschirmfoto taugt nicht als Nachweis.",
      });
      const callout = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="display:flex;align-items:center;gap:14px;padding:16px 22px"><span style="width:14px;height:14px;border-radius:50%;background:#30d158;box-shadow:0 0 0 6px rgb(48 209 88/.25)"></span><span style="font:600 22px Inter;color:#fff">Live – mit Uhrzeit des Abrufs</span></div>`,
      );
      callout.style.cssText += "left:120px;top:770px";
      return {
        cam, a, b, qm: V.$$(a.app, ".qm"), camv: V.$(b.app, ".cam"), scan: V.$(b.app, ".scanline"), frame: V.$(b.app, ".frame"),
        pill: V.$(b.app, ".linkpill"), page: V.$(b.app, ".page"), pg: V.$$(b.app, ".pg"), live: V.$(b.app, ".live"), beam, tapper,
        pillPos: V.posIn(V.$(b.app, ".linkpill"), b.screen), chapter, cap, callout,
      };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      V.cue(start + 0.7, "build");
      V.cue(start + 1.9, "scan");
      V.cue(start + 2.7, "pop");
      V.cue(start + 3.0, "tap");
      V.cue(start + 3.2, "chime");
      V.cue(start + 7.4, "whoosh");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.1, E.outExpo);
      const enter2 = p(lt, 0.2, 1.1, E.outExpo);
      const exit = p(lt, 7.3, 0.8, E.inExpo);
      set(s.a.root, { y: lerp(700, 0, enter) + Math.sin(lt * 0.8) * 5 - exit * 900, ry: lerp(30, 14, enter), rx: 4, s: 0.86, o: 1 });
      set(s.b.root, { y: lerp(800, 0, enter2) + Math.sin(lt * 0.8 + 1) * 5 + exit * 900, ry: lerp(-30, -16, enter2), rx: 4, rz: -2, s: 0.86, o: 1 });
      set(s.cam, { o: 1 - p(lt, 7.65, 0.35) });
      // QR baut sich von innen nach aussen auf
      s.qm.forEach((m) => {
        const k = p(lt, 0.6 + Number(m.dataset.d) * 0.05, 0.3, E.outBack);
        m.style.opacity = k.toFixed(2);
        m.style.transformOrigin = `${m.getAttribute("x")}px ${m.getAttribute("y")}px`;
      });
      // Scannen
      const sc = p(lt, 1.8, 0.8, E.inOutSine);
      s.scan.style.transform = `translateY(${(-120 + sc * 240).toFixed(1)}px)`;
      set(s.scan, { o: lt > 1.7 && lt < 2.7 ? 1 : 0 });
      const found = lt > 2.6;
      s.frame.style.boxShadow = found ? "0 0 0 4px #ffd60a, 0 0 30px #ffd60a" : "0 0 0 3px #ffd60a";
      const pk = p(lt, 2.6, 0.4, E.outBack);
      s.pill.style.transform = `translateX(-50%) scale(${(0.6 + pk * 0.4).toFixed(3)})`;
      set(s.pill, { o: pk });
      const bk = p(lt, 1.7, 0.4) * (1 - p(lt, 2.8, 0.3));
      set(s.beam, { o: bk * (0.7 + 0.3 * Math.sin(lt * 30)), sx: 0.3 + bk * 0.7 });
      // Seite laedt
      const pg = p(lt, 3.15, 0.5, E.appSpring);
      s.page.style.transform = `translateY(${((1 - pg) * 860).toFixed(1)}px)`;
      s.pg.forEach((n, i) => {
        const k = p(lt, 3.4 + i * 0.07, 0.5, E.outCubic);
        set(n, { o: k, y: (1 - k) * 16 });
      });
      const live = lt > 4.3 ? 1 + 0.08 * Math.max(0, Math.sin((lt - 4.3) * 5)) * (lt < 6 ? 1 : 0) : 1;
      set(s.live, { s: live });
      s.tapper.update(lt, [{ t: 3.0, x: s.pillPos.cx, y: s.pillPos.cy }]);
      s.chapter.update(lt, 7.6);
      s.cap.update(lt, { start: 0.3, out: 7.2 });
      const co = p(lt, 4.4, 0.6, E.outBack) * (1 - p(lt, 7.1, 0.3));
      set(s.callout, { o: co, y: (1 - co) * 30 });
    },
  });

  /* ------------------------------ Energiekarte ---------------------------- */

  const SCHNITT = 1471;
  const CITIES = [
    ["Münster", 400, 160, 1512, 2298],
    ["Bielefeld", 600, 150, 1498, 2350],
    ["Hamm", 500, 255, 1533, 2410],
    ["Paderborn", 640, 290, 1455, 2205],
    ["Gelsenkirchen", 335, 262, 1602, 2390],
    ["Dortmund", 430, 300, 1688, 2455],
    ["Essen", 300, 312, 1745, 2510],
    ["Bochum", 375, 318, 1414, 2260],
    ["Duisburg", 225, 300, 1579, 2330],
    ["Hagen", 420, 372, 1625, 2420],
    ["Wuppertal", 330, 392, 1661, 2380],
    ["Düsseldorf", 220, 400, 1389, 2190],
    ["Mönchengladbach", 130, 425, 1356, 2140],
    ["Köln", 250, 505, 1437, 2240],
    ["Aachen", 70, 520, 1502, 2280],
    ["Bonn", 295, 580, 1401, 2175],
    ["Siegen", 505, 525, 1588, 2400],
  ];
  const LEVEL = ["#4a4f4c", "#3f6b4e", "#2e8f52", "#2bb45e", "#3be077"];
  const level = (v, avg) => {
    const d = v - avg;
    return d < -50 ? 0 : d < 0 ? 1 : d < 90 ? 2 : d < 180 ? 3 : 4;
  };

  V.scene({
    id: "preise",
    start: T.preise,
    dur: T.zahlen - T.preise,
    build(root) {
      const outline =
        "M60 250 Q90 190 150 170 Q220 150 260 120 Q320 80 420 62 Q480 55 530 88 Q580 70 640 82 Q700 110 722 180 Q735 250 700 320 Q745 380 720 440 Q680 480 600 505 Q560 560 520 600 Q460 650 380 690 Q320 680 270 640 Q210 600 150 575 Q100 545 60 500 Q35 450 70 400 Q40 350 45 300 Z";
      const map = el(
        "div",
        "abs",
        root,
        `<svg width="780" height="720" viewBox="0 0 780 720" style="overflow:visible">
          <defs><radialGradient id="landg" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#14231b"/><stop offset="1" stop-color="#0b130f"/></radialGradient></defs>
          <path d="${outline}" fill="url(#landg)" stroke="rgb(120 255 180/.35)" stroke-width="2.5"/>
          <path d="M170 160 Q200 300 225 360 Q250 450 250 520 Q270 600 300 690" fill="none" stroke="#0e2c38" stroke-width="10" stroke-linecap="round"/>
          <path class="land" d="${outline}" fill="none" stroke="#46e38e" stroke-width="3" pathLength="1" stroke-dasharray="0 1" style="filter:drop-shadow(0 0 10px #46e38e)"/>
          ${CITIES.map(
            ([name, x, y], i) => `<g class="city" data-i="${i}" transform="translate(${x} ${y})">
              <circle class="halo" r="34" fill="#3be077" opacity="0"/>
              <circle class="dot" r="16" fill="#4a4f4c" stroke="#06100b" stroke-width="3"/>
              <text class="lbl" y="${name === "Bochum" ? 38 : -26}" text-anchor="middle" font-family="Inter" font-size="16" font-weight="600" fill="#cfe3d8">${name}</text>
            </g>`,
          ).join("")}
        </svg>`,
      );
      map.style.cssText += "left:780px;top:220px";
      const legend = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="padding:14px 20px"><div style="display:flex;gap:4px">${LEVEL.map((c) => `<i style="width:46px;height:10px;border-radius:5px;background:${c}"></i>`).join("")}</div>
          <div style="display:flex;justify-content:space-between;font:600 17px Inter;color:#a3aca7;margin-top:8px"><span>sehr günstig</span><span>sehr teuer</span></div></div>`,
      );
      legend.style.cssText += "left:820px;top:930px";
      const toggle = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;padding:5px;border-radius:999px;background:rgb(255 255 255/.08);box-shadow:inset 0 0 0 1px rgb(255 255 255/.12)">
          <span class="tg" style="padding:12px 30px;border-radius:999px;font:600 22px Inter;color:#fff;display:flex;gap:8px;align-items:center">${V.ic("bolt", 22)}Strom</span>
          <span class="tg" style="padding:12px 30px;border-radius:999px;font:600 22px Inter;color:#fff;display:flex;gap:8px;align-items:center">${V.ic("flame", 22)}Gas</span>
        </div>`,
      );
      toggle.style.cssText += "left:830px;top:150px";
      const list = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="padding:22px 24px">
          <div style="display:flex;gap:26px;padding-bottom:16px;border-bottom:1px solid rgb(255 255 255/.1)">
            <div><div style="font:600 15px Inter;letter-spacing:.12em;text-transform:uppercase;color:#8fa79b">Bundesschnitt</div><div class="kpi avg" style="font-size:44px;color:#fff">1.471 €</div><div style="font:500 16px Inter;color:#8fa79b">pro Jahr · <span class="hh">3.500 kWh</span></div></div>
          </div>
          <div style="font:600 15px Inter;letter-spacing:.12em;text-transform:uppercase;color:#8fa79b;margin:16px 0 8px">Teuerste Orte</div>
          <div class="rows"></div>
        </div>`,
      );
      list.style.cssText += "left:1500px;top:250px;width:360px";
      const cap = V.caption(root, {
        x: 120, y: 280, w: 640,
        eyebrow: "Energiekarte",
        title: ["Wo sich", "Wechseln lohnt."],
        accentWords: ["lohnt."],
        lede: "Je Ort die Jahreskosten beim Grundversorger, gemessen am Bundesschnitt. Kräftiges Grün = teuer = dein stärkstes Argument an der Tür.",
      });
      const entry = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="padding:20px 24px;width:560px">
          <div style="font:600 15px Inter;letter-spacing:.12em;text-transform:uppercase;color:#8fa79b">Preis eintragen · Arbeitspreis</div>
          <div style="display:flex;align-items:center;gap:14px;margin-top:10px">
            <div class="typing" style="flex:1;height:58px;border-radius:14px;background:rgb(255 255 255/.08);box-shadow:inset 0 0 0 2px rgb(70 227 142/.6);display:flex;align-items:center;padding:0 18px;font:600 30px Inter;color:#fff">38,5</div>
            <span style="font:600 22px Inter;color:#a3aca7">ct/kWh</span>
          </div>
          <div class="rating" style="margin-top:14px;display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;background:rgb(59 224 119/.18);color:#5cf09c;font:700 21px Inter">sehr teuer · +157 € ggü. Bundesschnitt</div>
        </div>`,
      );
      entry.style.cssText += "left:120px;top:700px";
      const chapter = V.chapter(root, "06", "Preise");
      return {
        map, land: V.$(map, ".land"), cities: V.$$(map, ".city"), legend, toggle, tgs: V.$$(toggle, ".tg"), list, rows: V.$(list, ".rows"),
        avg: V.$(list, ".avg"), hh: V.$(list, ".hh"), cap, entry, typing: V.$(entry, ".typing"), rating: V.$(entry, ".rating"), chapter,
      };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      CITIES.forEach((_, i) => i % 3 === 0 && V.cue(start + 0.9 + i * 0.07, "tick"));
      V.cue(start + 4.6, "tap");
      V.cue(start + 4.7, "switch");
      V.cue(start + 6.0, "key");
      V.cue(start + 6.6, "pop");
      V.cue(start + 8.4, "whoosh");
    },
    update(lt, s) {
      const gas = lt > 4.7;
      const mk = p(lt, 0, 1.0, E.outExpo);
      const exit = p(lt, 8.3, 0.7, E.inExpo);
      set(s.map, { y: (1 - mk) * 140 - exit * 60, rx: (1 - mk) * 40 + 10, s: 0.95 + mk * 0.05 + exit * 0.3, o: mk * (1 - exit), blur: exit * 10 });
      s.land.setAttribute("stroke-dasharray", `${p(lt, 0.2, 1.4, E.inOutCubic).toFixed(4)} 1`);
      const avg = gas ? 2300 : SCHNITT;
      // fuer die Liste: teuerste drei
      const ranked = CITIES.map((c) => ({ name: c[0], v: gas ? c[4] : c[3] })).sort((a, b) => b.v - a.v).slice(0, 4);
      s.cities.forEach((g, i) => {
        const c = CITIES[i];
        const v = gas ? c[4] : c[3];
        const lv = level(v, avg);
        const at = 0.9 + i * 0.07 + (gas ? 4.0 : 0);
        const k = E.outBack(clamp((lt - (gas ? 4.75 + i * 0.04 : at)) / 0.45), 2.5);
        const dot = g.querySelector(".dot");
        const r = (10 + lv * 4) * (gas ? 0.6 + 0.4 * k : k);
        dot.setAttribute("r", Math.max(0, r).toFixed(2));
        dot.setAttribute("fill", LEVEL[lv]);
        const top = ranked[0].name === c[0];
        const halo = g.querySelector(".halo");
        halo.setAttribute("opacity", (lv >= 4 ? 0.18 + 0.12 * Math.sin(lt * 5 + i) : 0).toFixed(3));
        halo.setAttribute("r", (24 + lv * 6).toFixed(1));
        const lbl = g.querySelector(".lbl");
        lbl.setAttribute("opacity", (clamp((lt - at - 0.2) / 0.3) * (lv >= 3 || top ? 1 : 0.55)).toFixed(2));
      });
      V.text(s.avg, gas ? "2.300 €" : "1.471 €");
      V.text(s.hh, gas ? "15.000 kWh" : "3.500 kWh");
      V.html(
        s.rows,
        ranked
          .map(
            (r, i) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
            <span style="width:30px;height:30px;border-radius:50%;background:rgb(255 255 255/.08);display:flex;align-items:center;justify-content:center;font:700 16px Inter;color:#fff">${i + 1}</span>
            <span style="flex:1;font:600 22px Inter;color:#fff">${r.name}</span>
            <span style="font:700 22px Inter;color:#5cf09c">${V.count(r.v)} €</span></div>`,
          )
          .join(""),
      );
      const lk = p(lt, 1.6, 0.7, E.outExpo) * (1 - exit);
      set(s.list, { x: (1 - lk) * 120, o: lk });
      const gk = p(lt, 1.2, 0.6, E.outBack) * (1 - exit);
      set(s.legend, { o: gk, y: (1 - gk) * 20 });
      set(s.toggle, { o: p(lt, 1.0, 0.5) * (1 - exit), y: (1 - p(lt, 1.0, 0.6, E.outBack)) * -20 });
      s.tgs.forEach((t, i) => {
        const on = gas ? i === 1 : i === 0;
        t.style.background = on ? "linear-gradient(180deg,#16884a,#0d6634)" : "transparent";
        t.style.boxShadow = on ? "0 6px 20px rgb(22 136 74/.5)" : "none";
      });
      s.cap.update(lt, { start: 0.3, out: 8.2 });
      const ek = p(lt, 5.6, 0.6, E.outBack) * (1 - exit);
      set(s.entry, { o: ek, y: (1 - ek) * 40 });
      V.text(s.typing, "38,5".slice(0, Math.floor(clamp((lt - 5.9) / 0.5) * 4)));
      const rk = p(lt, 6.6, 0.5, E.outBack);
      set(s.rating, { o: rk, s: 0.85 + rk * 0.15 });
      s.chapter.update(lt, 8.6);
    },
  });
})();
