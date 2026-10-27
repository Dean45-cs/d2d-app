/*
 * Kapitel 10 · Deine App: zehn Akzentfarben im Takt, Hell -> Dunkel,
 * installierbar auf iPhone und iPad, auch ohne Netz.
 * Farbwerte aus src/app/themes.css (hell), Buehnenlicht aus --t-logo-2.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  // [Name, accent, accent-ink, vivid, primary-top, primary-bottom, brand-deep, brand-deeper, Buehnenlicht]
  const ACCENTS = [
    ["Grün", "#15904a", "#0c6a34", "#2fd161", "#16884a", "#0d6634", "#0f4d2a", "#0a361e", "#30d158"],
    ["Petrol", "#008993", "#00646f", "#00c8cd", "#00808a", "#00606a", "#004953", "#00343c", "#00a0a8"],
    ["Blau", "#1475e5", "#1854ac", "#72b4ff", "#1d6fd6", "#1a51a4", "#1a3d7a", "#142b56", "#238bff"],
    ["Indigo", "#6262ed", "#4846b1", "#9ba8ff", "#5d5edd", "#4644a9", "#36357d", "#262558", "#737aff"],
    ["Violett", "#914fda", "#6a39a4", "#c595ff", "#884dcc", "#66389c", "#4c2d75", "#341f52", "#ab5aff"],
    ["Pink", "#d22674", "#9d1752", "#ff7fb2", "#c52a6e", "#971a4f", "#71193a", "#501227", "#f6248b"],
    ["Rot", "#dc1e2e", "#a41122", "#ff887d", "#ce252f", "#9d1523", "#76171e", "#531115", "#ff2734"],
    ["Orange", "#bd5700", "#903b00", "#ff8f33", "#b45100", "#8b3800", "#6d2700", "#4e1b04", "#d96900"],
    ["Gold", "#a16d00", "#7a4d00", "#dea600", "#996600", "#774a00", "#5d3600", "#442400", "#b88100"],
    ["Graphit", "#4e5c6f", "#384352", "#9cb2cf", "#414e5f", "#2a3441", "#272e38", "#181d24", "#7d8ea6"],
  ];
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const CYCLE = 1.0; // Beginn des Farbwechsels (relativ)
  const STEP = 0.5; // ein Schlag je Farbe

  // Buehnenlicht folgt der Farbe
  ACCENTS.forEach((a, i) => {
    if (i === 0) return;
    const from = T.farben + CYCLE + i * STEP;
    V.tints.push({ from, to: from + STEP, rgb: hexRgb(a[8]), fade: 0.12 });
  });

  const applyAccent = (app, a) => {
    const st = app.style;
    st.setProperty("--accent", a[1]);
    st.setProperty("--accent-ink", a[2]);
    st.setProperty("--accent-vivid", a[3]);
    st.setProperty("--primary-top", a[4]);
    st.setProperty("--primary-bottom", a[5]);
    st.setProperty("--brand-deep", a[6]);
    st.setProperty("--brand-deeper", a[7]);
  };

  V.scene({
    id: "farben",
    start: T.farben,
    dur: T.outro - T.farben,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px";
      const ph = V.phone(cam, { x: 900, y: 150 });
      V.screens.uebersicht(ph.app);
      // dunkle Fassung, die per Kreis aufgedeckt wird
      const darkApp = el("div", "app dark", ph.screen);
      V.screens.uebersicht(darkApp);
      darkApp.style.zIndex = "85";
      const sbDark = el("div", "abs", ph.screen, V.statusbar("9:41"));
      sbDark.style.cssText += "inset:0;z-index:86;pointer-events:none";
      sbDark.firstElementChild.style.color = "#f3f6f4";
      sbDark.querySelectorAll(".sb-bars i, .sb-batt i").forEach((i) => (i.style.background = "currentColor"));

      const swatches = ACCENTS.map((a, i) => {
        const s = el(
          "div",
          "abs",
          root,
          `<div style="display:flex;align-items:center;gap:20px">
            <span class="sw" style="width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%, ${a[3]}, ${a[1]} 55%, ${a[6]});box-shadow:inset 0 2px 0 rgb(255 255 255/.35)"></span>
            <span class="nm" style="font:600 28px Inter;color:#cfd8d3">${a[0]}</span>
          </div>`,
        );
        s.style.cssText += `left:1470px;top:${150 + i * 78}px`;
        return { node: s, sw: V.$(s, ".sw"), nm: V.$(s, ".nm") };
      });
      const big = el("div", "abs display", root, "Grün");
      big.style.cssText += "left:120px;top:690px;font-size:150px;font-weight:900;letter-spacing:-.05em";
      const mode = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;padding:6px;border-radius:999px;background:rgb(255 255 255/.08);box-shadow:inset 0 0 0 1px rgb(255 255 255/.14)">
          <span class="md" style="padding:12px 26px;border-radius:999px;display:flex;gap:10px;align-items:center;font:600 24px Inter;color:#fff">${V.ic("sun", 26)}Hell</span>
          <span class="md" style="padding:12px 26px;border-radius:999px;display:flex;gap:10px;align-items:center;font:600 24px Inter;color:#fff">${V.ic("moon", 26)}Dunkel</span>
        </div>`,
      );
      mode.style.cssText += "left:120px;top:740px";
      // iPad mit echtem Bildschirmfoto der App
      const ipad = el(
        "div",
        "abs",
        cam,
        `<div style="padding:20px;border-radius:46px;background:linear-gradient(145deg,#5d625f,#1c1f1d 30%,#141615 70%,#4c514e);box-shadow:inset 0 0 0 1.5px rgb(255 255 255/.2),inset 0 0 0 8px #0b0d0c,0 60px 120px -30px rgb(0 0 0/.9)">
          <img src="../../docs/screenshots/klinken-ipad-quer-dunkel.png" width="767" height="533" style="display:block;border-radius:24px"/>
        </div>`,
      );
      ipad.style.cssText += "left:1000px;top:250px";
      const badges = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;gap:14px;flex-wrap:wrap;width:760px">${[
          ["iphone", "iPhone"],
          ["ipad", "iPad"],
          ["offline", "Ohne Netz"],
          ["bell", "Push"],
          ["download", "Als App installieren"],
        ]
          .map(([ic, l]) => `<span class="bdg stage-glass" style="border-radius:999px;display:flex;align-items:center;gap:10px;padding:12px 22px;font:600 22px Inter;color:#fff">${ic === "download" ? V.ic("share", 22) : V.ic(ic, 22)}${l}</span>`)
          .join("")}</div>`,
      );
      badges.style.cssText += "left:120px;top:700px";
      const capA = V.caption(root, {
        x: 120, y: 250, w: 700,
        eyebrow: "Einstellungen",
        title: ["Deine App.", "Deine Farbe."],
        accentWords: ["Farbe."],
        lede: "Zehn Akzentfarben – als wäre die App in dieser Farbe erschienen. Hell oder Dunkel, Textgröße, und fast jede Funktion lässt sich ein- und ausschalten.",
      });
      const capB = V.caption(root, {
        x: 120, y: 250, w: 760,
        eyebrow: "Überall dabei",
        title: ["iPhone und iPad.", "Auch im Funkloch."],
        accentWords: ["Funkloch."],
        lede: "Als App installieren: eigenes Symbol, Vollbild, Push. Erfasst wird auch ohne Empfang – nachgereicht wird von selbst.",
      });
      const chapter = V.chapter(root, "10", "Deine App");
      return { cam, ph, darkApp, sbDark, swatches, big, mode, mds: V.$$(mode, ".md"), ipad, badges, bdgs: V.$$(badges, ".bdg"), capA, capB, chapter, apps: [ph.app, darkApp] };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      ACCENTS.forEach((_, i) => i > 0 && V.cue(start + CYCLE + i * STEP, "color", { n: i }));
      V.cue(start + CYCLE + 10 * STEP, "color", { n: 0 });
      V.cue(start + 6.3, "switch");
      V.cue(start + 6.4, "whoosh");
      V.cue(start + 7.6, "whoosh");
      V.cue(start + 9.5, "riser-short");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.1, E.outExpo);
      // aktuelle Farbe (nach dem Durchlauf zurueck zu Gruen)
      let idx = Math.floor((lt - CYCLE) / STEP);
      if (lt < CYCLE || idx >= ACCENTS.length) idx = 0;
      const a = ACCENTS[idx];
      s.apps.forEach((app) => applyAccent(app, a));
      const beat = lt >= CYCLE && lt < CYCLE + 10 * STEP + 0.4 ? 1 - clamp(((lt - CYCLE) % STEP) / 0.25) : 0;
      const toIpad = p(lt, 7.4, 1.0, E.inOutCubic);
      set(s.ph.root, {
        x: lerp(500, 0, enter) + toIpad * 40,
        y: Math.sin(lt * 0.8) * 5 + toIpad * 110,
        ry: lerp(-40, -10, enter) + toIpad * 14,
        rx: 4,
        s: (0.9 + beat * 0.025) * (1 - toIpad * 0.16),
        o: 1,
      });
      s.ph.root.style.zIndex = "5";
      // Kreis deckt Dunkel auf
      const dk = p(lt, 6.3, 0.9, E.inOutCubic);
      s.darkApp.style.clipPath = `circle(${(dk * 1000).toFixed(1)}px at 330px 60px)`;
      s.sbDark.style.clipPath = s.darkApp.style.clipPath;
      s.mds.forEach((m, i) => {
        const on = dk > 0.5 ? i === 1 : i === 0;
        m.style.background = on ? `linear-gradient(180deg, ${a[4]}, ${a[5]})` : "transparent";
      });
      set(s.mode, { o: p(lt, 5.9, 0.4) * (1 - p(lt, 7.3, 0.3)), y: (1 - p(lt, 5.9, 0.5, E.outBack)) * 30 });

      s.swatches.forEach((w, i) => {
        const k = p(lt, 0.4 + i * 0.06, 0.5, E.outBack);
        const on = i === idx && lt >= CYCLE - 0.1 && lt < 6.2;
        set(w.node, { o: k * (1 - p(lt, 6.0, 0.5)), x: (1 - k) * 60 + (on ? -16 : 0) });
        set(w.sw, { s: on ? 1.22 : 1 });
        w.sw.style.boxShadow = on ? `0 0 0 4px #fff, 0 0 40px ${ACCENTS[i][3]}` : "inset 0 2px 0 rgb(255 255 255/.35)";
        w.nm.style.color = on ? "#fff" : "#9fb0a7";
        w.nm.style.fontWeight = on ? "800" : "600";
      });
      V.text(s.big, a[0]);
      s.big.style.color = a[3];
      s.big.style.textShadow = `0 0 60px ${a[3]}66`;
      set(s.big, { o: p(lt, 0.9, 0.3) * (1 - p(lt, 5.9, 0.3)), s: 1 + beat * 0.04, y: (1 - p(lt, 0.9, 0.5, E.outBack)) * 40 });
      s.big.style.transformOrigin = "0 50%";

      const ik = p(lt, 7.5, 1.0, E.outExpo);
      set(s.ipad, { x: (1 - ik) * 900, ry: -16 + (1 - ik) * -30, rx: 5, o: ik > 0.001 ? 1 : 0, s: 0.98 });
      s.bdgs.forEach((b, i) => {
        const k = p(lt, 8.2 + i * 0.1, 0.5, E.outBack);
        set(b, { o: k * (1 - p(lt, 9.7, 0.3)), y: (1 - k) * 30 });
      });
      s.capA.update(lt, { start: 0.3, out: 7.2 });
      s.capB.update(lt, { start: 7.5, out: 9.7 });
      s.chapter.update(lt, 9.9);
      // Abgang: alles zieht sich ins Logo zusammen
      const go = p(lt, 9.4, 0.6, E.inExpo);
      set(s.cam, { s: 1 - go * 0.6, o: 1 - go, blur: go * 8 });
    },
  });
})();
