/*
 * Vorspann: Tuer. Gespraech. Termin. Abschluss. -> Logo -> fuenf Bereiche.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  /* --------------------------- 1. Kaltstart ----------------------------- */

  const WORDS = [
    { word: "Tür.", icon: "door", beat: 0.5 },
    { word: "Gespräch.", icon: "chat", beat: 1.5 },
    { word: "Termin.", icon: "calendar", beat: 2.5 },
    { word: "Abschluss.", icon: "check", beat: 3.5, win: true },
  ];

  V.letterboxAt = (t) => Math.max(t < 4.2 ? 1 : 1 - p(t, 4.2, 0.6, E.inOutCubic), V.letterboxEnd ? V.letterboxEnd(t) : 0);

  V.scene({
    id: "open",
    start: T.open,
    dur: T.logo - T.open + 0.3,
    build(root) {
      const stack = el("div", "abs", root);
      stack.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:960px 540px";
      const lines = WORDS.map((w, i) => {
        const line = el("div", "abs", stack);
        line.style.cssText = `left:500px;top:${226 + i * 158}px;height:170px;display:flex;align-items:center;gap:44px`;
        const tile = el(
          "div",
          "abs",
          line,
          w.win
            ? `<span class="glyph-result" style="width:118px;height:118px;background:linear-gradient(180deg,#5cf09c,#17a852);color:#fff;box-shadow:0 0 60px rgb(48 209 88/.6), inset 0 2px 0 rgb(255 255 255/.4)">${V.ic("check", 64, "", 2.4)}</span>`
            : `<span class="stage-glass" style="width:118px;height:118px;display:flex;align-items:center;justify-content:center;border-radius:34px;color:#e6fff0">${V.ic(w.icon, 60, "", 1.6)}</span>`,
        );
        tile.style.cssText += "position:relative";
        const mask = el("div", "", line);
        mask.style.cssText = "overflow:hidden;height:180px;display:flex;align-items:center;padding-right:30px";
        const text = el("div", `display ${w.win ? "glow-text" : ""}`, mask, w.word);
        text.style.cssText = "font-size:156px;font-weight:900;letter-spacing:-0.055em;line-height:1";
        const streak = el("div", "abs", line);
        streak.style.cssText =
          "left:160px;top:70px;width:900px;height:30px;background:radial-gradient(closest-side, rgb(220 255 235/.9), transparent);filter:blur(6px);mix-blend-mode:screen";
        return { line, tile, text, streak, ...w };
      });
      const rays = el("div", "abs", root);
      rays.style.cssText =
        "left:-200px;top:-500px;width:2400px;height:2400px;background:repeating-conic-gradient(from 0deg at 50% 50%, rgb(70 227 142/.07) 0deg 4deg, transparent 4deg 12deg);mask-image:radial-gradient(closest-side, #000 20%, transparent 70%)";
      return { stack, lines, rays };
    },
    cues(start) {
      WORDS.forEach((w) => V.cue(start + w.beat, w.win ? "hit-big" : "hit", { word: w.word }));
      V.cue(start + 4.0, "whoosh-in");
    },
    update(t, s) {
      s.lines.forEach((l, i) => {
        const k = p(t, l.beat - 0.08, 0.55, E.outExpo);
        const next = s.lines[i + 1];
        const dimmed = next ? p(t, next.beat - 0.05, 0.4, E.outCubic) : 0;
        set(l.text, { y: (1 - k) * 190, sy: lerp(1.25, 1, k), o: 1 });
        set(l.tile, { s: E.outBack(clamp((t - l.beat) / 0.5), 2.4) * (1 - dimmed * 0.15), o: clamp((t - l.beat + 0.05) / 0.15), rz: (1 - k) * -12 });
        set(l.line, { o: 1 - dimmed * 0.7, x: dimmed * -20 });
        const sk = p(t, l.beat - 0.05, 0.45, E.outCubic);
        set(l.streak, { x: -300 + sk * 1200, o: sk > 0 && sk < 1 ? Math.sin(sk * Math.PI) : 0, sx: 1.4 });
      });
      // Abschluss: Strahlen hinter allem
      const win = p(t, 3.45, 0.6, E.outCubic);
      set(s.rays, { o: win * 0.9 * (1 - p(t, 4.0, 0.4)), rz: t * 6, s: 0.8 + win * 0.3 });
      // Kamera folgt der jeweils neuesten Zeile, am Ende steht die ganze Treppe
      const follow = V.kf(t, [[0.4, 229], [1.4, 229], [1.75, 150, E.outCubic], [2.4, 150], [2.75, 75, E.outCubic], [3.4, 75], [3.75, 0, E.outCubic]]);
      // Ab in die Kamera
      const fly = p(t, 4.0, 0.75, E.inExpo);
      set(s.stack, { y: follow, s: 1 + fly * 2.6 + t * 0.012, o: 1 - p(t, 4.2, 0.5, E.inCubic), blur: fly * 24 });
    },
  });
  V.flashes.push({ t: T.open + 3.5, power: 0.35 });

  /* ----------------------------- 2. Logo -------------------------------- */

  const ICON = 230;
  const CIRC = 2 * Math.PI * 29;

  V.scene({
    id: "logo",
    start: T.logo,
    dur: T.tabs - T.logo,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px";
      const lock = el("div", "abs", cam);
      lock.style.cssText = `left:${960 - ICON / 2}px;top:${470 - ICON / 2}px;width:${ICON}px;height:${ICON}px`;
      // App-Symbol (gruen) hinter der Marke
      const square = el("div", "abs", lock, V.logoMark(ICON, {}, true));
      square.style.cssText = "left:0;top:0;filter:drop-shadow(0 30px 60px rgb(23 168 82/.45))";
      const shine = el("div", "abs", lock);
      shine.style.cssText = `left:0;top:0;width:${ICON}px;height:${ICON}px;border-radius:${ICON * 0.224}px;overflow:hidden`;
      const band = el("div", "abs", shine);
      band.style.cssText = `left:-120px;top:-60px;width:90px;height:${ICON * 1.6}px;background:linear-gradient(90deg,transparent,rgb(255 255 255/.55),transparent);transform:rotate(20deg)`;
      // Die Marke, die sich zeichnet
      const mark = el(
        "div",
        "abs",
        lock,
        `<svg viewBox="0 0 100 100" width="${ICON}" height="${ICON}" style="overflow:visible">
  <defs>
    <mask id="ringmask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
      <circle class="sweep" cx="50" cy="50" r="29" fill="none" stroke="#fff" stroke-width="26" stroke-dasharray="0 400"/>
    </mask>
    <radialGradient id="sparkg"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#bdffd6" stop-opacity=".9"/><stop offset="1" stop-color="#46e38e" stop-opacity="0"/></radialGradient>
    <linearGradient id="ringg" x1=".1" y1=".1" x2=".9" y2=".9"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cff7de"/></linearGradient>
  </defs>
  <filter id="ringsh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
  <g class="ringshadow" fill="#00361a" opacity="0" filter="url(#ringsh)" transform="translate(0 2.2)"><path d="${V.MARK_RING}"/><circle cx="71.2" cy="28.8" r="6.75"/></g>
  <path class="ring" d="${V.MARK_RING}" fill="url(#ringg)" mask="url(#ringmask)"/>
  <circle class="halo" cx="71.2" cy="28.8" r="16" fill="url(#sparkg)"/>
  <circle class="dot" cx="71.2" cy="28.8" r="6.75" fill="#fff"/>
  <circle class="spark" cx="82.5" cy="50" r="9" fill="url(#sparkg)"/>
</svg>`,
      );
      mark.style.cssText = "left:0;top:0";
      const glowMark = el("div", "abs", lock);
      glowMark.style.cssText = `left:${-ICON}px;top:${-ICON}px;width:${ICON * 3}px;height:${ICON * 3}px;background:radial-gradient(closest-side, rgb(70 227 142/.35), transparent);`;
      lock.insertBefore(glowMark, lock.firstChild);
      // Schockwelle
      const wave = el("div", "abs", cam);
      wave.style.cssText = `left:${960 - 200}px;top:${470 - 200}px;width:400px;height:400px;border-radius:50%;border:3px solid rgb(120 255 180/.8);box-shadow:0 0 40px rgb(70 227 142/.6), inset 0 0 40px rgb(70 227 142/.4)`;
      // Funken
      const canvas = el("canvas", "abs", cam);
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.style.cssText = "left:0;top:0";
      const rnd = V.rng(11);
      const sparks = Array.from({ length: 110 }, () => {
        const a = rnd() * Math.PI * 2;
        const v = 300 + rnd() * 900;
        return { a, v, r: 1 + rnd() * 3.5, life: 0.6 + rnd() * 1.1, d0: 70 + rnd() * 30 };
      });
      // Schriftzug (Pfade aus public/logo.svg)
      const word = el("div", "abs", cam, V.wordmark("intro", 748));
      word.style.cssText = `left:${960 - 748 / 2 + 140}px;top:${470 - 55}px`;
      const tag = el("div", "lede abs", cam);
      tag.style.cssText = "left:0;width:1920px;top:640px;text-align:center;font-size:36px;color:rgb(225 240 232/.78)";
      const tagWords = V.split(tag, "Die Vertriebs-App für Strom & Gas an der Haustür.");
      tagWords.slice(-1)[0].classList.add("glow-text");
      const flood = el("div", "abs", root);
      flood.style.cssText =
        "left:0;top:0;width:1920px;height:1080px;background:radial-gradient(circle at 50% 50%, #f4fff8 0%, #9ff5c4 40%, #30d158 100%);opacity:0";
      return {
        cam,
        lock,
        square,
        band,
        mark,
        sweep: V.$(mark, ".sweep"),
        dot: V.$(mark, ".dot"),
        halo: V.$(mark, ".halo"),
        spark: V.$(mark, ".spark"),
        ring: V.$(mark, ".ring"),
        ringShadow: V.$(mark, ".ringshadow"),
        glowMark,
        wave,
        ctx: canvas.getContext("2d"),
        sparks,
        word,
        wm: V.$(word, ".wm"),
        tagWords,
        flood,
      };
    },
    cues(start) {
      V.cue(start + 0.15, "dot");
      V.cue(start + 0.5, "sweep");
      V.cue(start + 1.5, "impact");
      V.cue(start + 2.4, "shimmer");
      V.cue(start + 5.6, "riser-short");
      V.cue(start + 6.5, "whoosh-light");
    },
    update(lt, s) {
      // Punkt erscheint
      const dotIn = E.outBack(clamp((lt - 0.1) / 0.5), 3);
      s.dot.setAttribute("r", (6.75 * dotIn).toFixed(3));
      s.halo.setAttribute("r", (16 * dotIn * (1 + 0.25 * Math.sin(lt * 9) * (1 - p(lt, 1.5, 0.5)))).toFixed(3));
      // Ring laeuft von 3 Uhr im Uhrzeigersinn bis 12 Uhr
      const sw = p(lt, 0.5, 1.0, E.inOutCubic);
      s.sweep.setAttribute("stroke-dasharray", `${(sw * CIRC * 0.76).toFixed(2)} 400`);
      const ang = sw * Math.PI * 1.5;
      s.spark.setAttribute("cx", (50 + 29 * Math.cos(ang)).toFixed(2));
      s.spark.setAttribute("cy", (50 + 29 * Math.sin(ang)).toFixed(2));
      set(s.spark, { o: sw > 0 && sw < 1 ? 1 : 0 });

      // Aufschlag bei 1.5: gruenes Symbol waechst hinter der Marke
      const hit = lt - 1.5;
      const sq = E.outBack(clamp(hit / 0.6), 1.6);
      set(s.square, { s: sq, o: clamp(hit / 0.1) });
      s.ringShadow.setAttribute("opacity", (0.3 * p(lt, 1.7, 0.4)).toFixed(3));
      set(s.glowMark, { o: clamp(hit / 0.2) * (0.6 + 0.4 * Math.sin(lt * 2)), s: 0.8 + sq * 0.4 });
      // Marke auf dem Symbol etwas kleiner (wie im App-Symbol)
      const markS = lerp(1.25, 1, p(lt, 1.5, 0.6, E.outCubic));
      set(s.mark, { s: markS * (1 + Math.max(0, 0.06 * Math.sin(Math.min(hit, 0.5) * Math.PI * 2)) * (hit > 0 ? 1 : 0)) });
      s.band.style.transform = `translate(${(-120 + p(lt, 2.1, 0.9, E.inOutCubic) * (ICON + 300)).toFixed(1)}px, 0) rotate(20deg)`;
      // Schockwelle und Funken
      const wk = clamp(hit / 1.1);
      set(s.wave, { s: 0.3 + E.outCubic(wk) * 3.5, o: hit > 0 ? (1 - wk) * 0.9 : 0 });
      const ctx = s.ctx;
      ctx.clearRect(0, 0, 1920, 1080);
      if (hit > 0 && hit < 2.2) {
        ctx.globalCompositeOperation = "lighter";
        for (const sp of s.sparks) {
          const k = hit / sp.life;
          if (k >= 1) continue;
          const dist = sp.d0 + sp.v * (1 - Math.exp(-hit * 2.2)) * 0.45;
          const x = 960 + Math.cos(sp.a) * dist;
          const y = 470 + Math.sin(sp.a) * dist + hit * hit * 60;
          const a = (1 - k) * 0.95;
          ctx.fillStyle = `rgba(190,255,215,${a})`;
          ctx.beginPath();
          ctx.arc(x, y, sp.r * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Schriftzug: Symbol nach links, Wort wischt herein
      const slide = p(lt, 2.35, 0.9, E.inOutQuart);
      const lockX = -396 * slide;
      set(s.lock, { x: lockX });
      const wipe = p(lt, 2.55, 0.9, E.outCubic);
      s.wm.setAttribute("x", (110 - 360 + wipe * 360).toFixed(2));
      set(s.word, { x: -130 * (1 - slide) + 0, o: clamp((lt - 2.5) / 0.2), blur: (1 - wipe) * 6 });
      V.stagger(s.tagWords, lt, 3.35, { each: 0.05, dy: 26, blur: 10, dur: 0.8, out: 5.05 });

      // Kamera: sanftes Heranfahren, dann in den Punkt hinein
      const dive = p(lt, 5.25, 1.25, E.inExpo);
      const dotX = 960 - ICON / 2 + lockX + 0.712 * ICON;
      const dotY = 470 - ICON / 2 + 0.288 * ICON;
      s.cam.style.transformOrigin = `${dotX.toFixed(1)}px ${dotY.toFixed(1)}px`;
      set(s.cam, { s: (1 + lt * 0.015) * (1 + dive * 70), o: 1 });
      set(s.word, { o: clamp((lt - 2.5) / 0.2) * (1 - p(lt, 5.0, 0.4)) });
      set(s.flood, { o: p(lt, 6.0, 0.45, E.inCubic) });
    },
  });
  V.flashes.push({ t: T.logo + 1.5, power: 0.75 });

  /* --------------------------- 3. Fuenf Bereiche ------------------------- */

  const AREAS = [
    { icon: "chart", label: "Übersicht", desc: "Deine Zahlen auf einen Blick" },
    { icon: "door", label: "Klinken", desc: "Türen erfassen – mit einem Daumen" },
    { icon: "map", label: "Karte", desc: "Gebiete abstecken, Preise sehen" },
    { icon: "users", label: "Team", desc: "Feed, Rangliste und Erfolge" },
    { icon: "person", label: "Profil", desc: "Termine, Kunden, Einstellungen" },
  ];

  V.floors.push({ from: T.tabs + 0.3, to: T.gebiete - 0.2 });

  V.scene({
    id: "tabs",
    start: T.tabs,
    dur: T.gebiete - T.tabs,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:960px 540px";
      const cap = V.caption(cam, {
        x: 120,
        y: 300,
        w: 620,
        eyebrow: "So ist die App aufgebaut",
        title: ["Fünf Bereiche.", "Eine App."],
        accentWords: ["App"],
        lede: "Unten schwebt die Reiterleiste – alles mit dem Daumen erreichbar, auch mit der Mappe in der Hand.",
        size: "t-l",
      });
      const ph = V.phone(cam, { x: 735, y: 100 });
      const scr = V.screens.uebersicht(ph.app);
      const tabs = V.$$(ph.app, ".tab");
      const tiles = AREAS.map((a, i) => {
        const node = el(
          "div",
          "abs",
          cam,
          `<div style="display:flex;align-items:center;gap:26px">
            <span class="stage-glass" style="width:104px;height:104px;border-radius:30px;display:flex;align-items:center;justify-content:center;color:#eafff2;flex-shrink:0">${V.ic(a.icon, 50, "", 1.6)}</span>
            <span><span class="display" style="display:block;font-size:46px;font-weight:800">${a.label}</span><span class="lede" style="display:block;font-size:24px;margin-top:6px">${a.desc}</span></span>
          </div>`,
        );
        node.style.cssText = `left:1290px;top:${135 + i * 162}px;width:560px`;
        return node;
      });
      const light = el("div", "abs", root);
      light.style.cssText =
        "left:0;top:0;width:1920px;height:1080px;background:radial-gradient(circle at 50% 50%, #f4fff8 0%, #9ff5c4 40%, #30d158 100%)";
      return { cam, cap, ph, scr, tabs, tiles, light };
    },
    cues(start) {
      AREAS.forEach((_, i) => V.cue(start + 1.5 + i * 0.5, "pop", { n: i }));
      V.cue(start + 5.3, "whoosh");
    },
    update(lt, s) {
      set(s.light, { o: 1 - p(lt, 0, 0.7, E.outCubic) });
      // Telefon steigt auf und dreht sich ein
      const rise = p(lt, 0.0, 1.4, E.outExpo);
      set(s.ph.root, {
        y: (1 - rise) * 500,
        ry: lerp(-38, -14, rise) + Math.sin(lt * 0.7) * 2,
        rx: lerp(18, 4, rise),
        rz: lerp(-6, 0, rise),
        o: 1,
      });
      s.cap.update(lt, { start: 0.35, out: 5.25 });
      // Kacheln springen aus der Reiterleiste an ihren Platz
      s.tiles.forEach((tile, i) => {
        const t0 = 1.5 + i * 0.5;
        const k = p(lt, t0 - 0.25, 0.75, E.outExpo);
        const fromX = 735 + 20 + 52 + i * 74 - 1290 - 52;
        const fromY = 100 + 20 + 798 - (135 + i * 162) - 52;
        const arc = Math.sin(k * Math.PI) * -80;
        const out = p(lt, 5.15 + i * 0.05, 0.5, E.inExpo);
        set(tile, {
          x: lerp(fromX, 0, k) + out * 900,
          y: lerp(fromY, 0, k) + arc,
          s: lerp(0.25, 1, k),
          o: clamp((lt - t0 + 0.25) / 0.15) * (1 - out),
          blur: (1 - k) * 8 + out * 12,
        });
        // passender Reiter leuchtet kurz
        const on = lt > t0 - 0.25 && lt < t0 + 0.35;
        s.tabs[i].classList.toggle("on", on || (i === 0 && lt < 1.25));
      });
      // Zahlen der Kopfkarte zaehlen hoch
      const c = p(lt, 0.6, 1.6, E.outCubic);
      s.scr.k.sales.textContent = Math.round(12 * c);
      s.scr.k.doors.textContent = Math.round(248 * c);
      s.scr.k.met.textContent = Math.round(61 * c);
      s.scr.k.appts.textContent = Math.round(9 * c);
      s.scr.bars.forEach((b, i) => set(b, { sy: p(lt, 0.8 + i * 0.04, 0.6, E.outBack) }));
      // Abgang: Kamera faehrt ins Telefon
      const go = p(lt, 5.2, 0.8, E.inExpo);
      set(s.cam, { s: 1 + lt * 0.01 + go * 1.8, o: 1 - p(lt, 5.6, 0.4), blur: go * 10 });
    },
  });
})();
