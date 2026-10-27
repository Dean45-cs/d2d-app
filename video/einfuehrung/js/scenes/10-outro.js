/*
 * Finale: alles noch einmal im Takt -> zieht sich in den Punkt der Marke
 * zusammen -> Logo, Satz, drei Schritte zum Loslegen -> Schwarz.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, T } = V;

  const FEATURES = [
    ["polygon", "Gebiete"],
    ["door", "Klinken"],
    ["hand", "Gründe"],
    ["building", "Mehrfamilienhaus"],
    ["crosshair", "In meiner Nähe"],
    ["calendar", "Termine"],
    ["check", "Abschluss"],
    ["qr", "Visitenkarte"],
    ["bolt", "Preise"],
    ["chart", "Übersicht"],
    ["trophy", "Team & Erfolge"],
    ["contacts", "Kunden"],
  ];
  const ICON = 200;

  V.letterboxEnd = (t) => p(t, T.outro + 8.0, 0.9, E.inOutCubic);

  V.scene({
    id: "outro",
    start: T.outro,
    dur: T.end - T.outro,
    post: 0.5,
    build(root) {
      const title = el("div", "abs display", root);
      title.style.cssText += "left:0;width:1920px;top:150px;text-align:center;font-size:96px";
      const tw = V.split(title, "Alles in einer App.");
      tw.slice(-1)[0].classList.add("glow-text");
      const tiles = FEATURES.map(([icon, label], i) => {
        const t = el(
          "div",
          "abs stage-glass",
          root,
          `<div style="width:240px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
            <span style="width:80px;height:80px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:#fff;background:${i === 6 ? "linear-gradient(180deg,#2fd161,#0f8a43)" : "rgb(255 255 255/.1)"}">${V.ic(icon, 42, "", 1.7)}</span>
            <span style="font:700 24px Inter;color:#f3f6f4">${label}</span>
          </div>`,
        );
        const col = i % 6;
        const row = Math.floor(i / 6);
        t.style.cssText += `left:${960 - 3 * 262 + col * 262 + 11}px;top:${360 + row * 230}px;border-radius:30px`;
        return t;
      });
      const lock = el("div", "abs", root);
      lock.style.cssText = `left:${960 - 506}px;top:${420 - ICON / 2}px;width:1012px;height:${ICON}px`;
      const mark = el("div", "abs", lock, V.logoMark(ICON));
      mark.style.cssText += "left:0;top:0;filter:drop-shadow(0 30px 70px rgb(23 168 82/.55))";
      const word = el("div", "abs", lock, V.wordmark("outro", 748));
      word.style.cssText += `left:264px;top:${ICON / 2 - 55}px`;
      const tag = el("div", "abs lede", root);
      tag.style.cssText += "left:0;width:1920px;top:600px;text-align:center;font-size:38px;color:rgb(225 240 232/.8)";
      const tagW = V.split(tag, "Mehr Türen. Mehr Gespräche. Mehr Abschlüsse.");
      tagW.slice(-2).forEach((w) => w.classList.add("glow-text"));
      const steps = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;justify-content:center;gap:18px">${[
          ["person", "Einloggen"],
          ["map", "Gebiet wählen"],
          ["door", "Los geht’s"],
        ]
          .map(
            ([ic, l], i) => `<span class="st stage-glass" style="border-radius:999px;display:flex;align-items:center;gap:12px;padding:14px 26px 14px 16px;font:600 26px Inter;color:#fff">
              <span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 20px Inter;color:#062611;background:linear-gradient(180deg,#5cf09c,#2fd161)">${i + 1}</span>${V.ic(ic, 26)}${l}</span>`,
          )
          .join("")}</div>`,
      );
      steps.style.cssText += "left:0;width:1920px;top:760px";
      const dot = el("div", "abs", root);
      dot.style.cssText = "left:950px;top:530px;width:20px;height:20px;border-radius:50%;background:#eafff2;box-shadow:0 0 40px 16px rgb(70 227 142/.8)";
      const black = el("div", "abs", root);
      black.style.cssText = "left:0;top:0;width:1920px;height:1080px;background:#000";
      return { title, tw, tiles, lock, mark, word, wm: V.$(word, ".wm"), tagW, steps, sts: V.$$(steps, ".st"), dot, black };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      FEATURES.forEach((_, i) => V.cue(start + 0.3 + i * 0.12, "tick"));
      V.cue(start + 2.6, "riser-short");
      V.cue(start + 3.3, "impact");
      V.cue(start + 3.9, "shimmer");
      V.cue(start + 6.0, "pop");
      V.cue(start + 8.1, "outro");
    },
    update(lt, s) {
      V.stagger(s.tw, lt, 0.1, { each: 0.07, dy: 60, blur: 14, out: 2.5 });
      s.tiles.forEach((t, i) => {
        const at = 0.3 + i * 0.12;
        const k = E.outBack(clamp((lt - at) / 0.5), 1.8);
        // zusammenziehen in die Mitte
        const col = i % 6;
        const row = Math.floor(i / 6);
        const cx = 960 - 3 * 262 + col * 262 + 11 + 120;
        const cy = 360 + row * 230 + 100;
        const g = p(lt, 2.6 + (i % 6) * 0.03, 0.6, E.inExpo);
        set(t, {
          x: (960 - cx) * g,
          y: (540 - cy) * g + Math.sin(lt * 2 + i) * 4,
          s: (0.6 + k * 0.4) * (1 - g * 0.9),
          o: clamp((lt - at) / 0.12) * (1 - p(lt, 3.05, 0.2)),
          rz: (1 - k) * (i % 2 ? 8 : -8) + g * 30,
          blur: g * 6,
        });
      });
      // Punkt blitzt, daraus waechst das Logo
      const dk = p(lt, 3.0, 0.3, E.outCubic) * (1 - p(lt, 3.35, 0.25));
      set(s.dot, { s: 0.5 + dk * 2.5, o: dk });
      const lk = E.spring(clamp((lt - 3.3) / 1.0), 6, 2.2);
      const slide = p(lt, 3.9, 0.9, E.inOutQuart);
      set(s.mark, { s: Math.max(0, lk), x: (1 - slide) * 396, o: clamp((lt - 3.3) / 0.1) });
      s.wm.setAttribute("x", (110 - 360 + p(lt, 4.1, 0.9, E.outCubic) * 360).toFixed(2));
      set(s.word, { o: clamp((lt - 4.05) / 0.2), x: (1 - slide) * 130 });
      V.stagger(s.tagW, lt, 5.0, { each: 0.06, dy: 30, blur: 10, dur: 0.8 });
      s.sts.forEach((st, i) => {
        const k = p(lt, 6.0 + i * 0.18, 0.6, E.outBack);
        set(st, { o: k, y: (1 - k) * 30, s: 0.9 + k * 0.1 });
      });
      set(s.lock, { s: 1 + p(lt, 4, 5) * 0.03 });
      // Abblende
      set(s.black, { o: p(lt, 8.2, 0.8, E.inCubic) });
    },
  });
  V.flashes.push({ t: T.outro + 3.3, power: 0.8 });
})();
