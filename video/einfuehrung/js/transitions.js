/*
 * Kapitelwechsel: ein Lichtstreif wischt ueber den Schnitt, dahinter steht
 * die Kapitelnummer riesig und nur als Kontur - sie zieht langsam mit, waehrend
 * das Kapitel laeuft (Tiefe ohne Inhalt zu verdecken).
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, T } = V;

  const CHAPTERS = [
    ["01", T.gebiete, T.klinken, { x: 1180, y: 540 }],
    ["02", T.klinken, T.termine, { x: 1180, y: 600 }],
    ["03", T.termine, T.abschluss, { x: 520, y: 640 }],
    ["04", T.abschluss, T.karte, { x: 560, y: 640 }],
    ["05", T.karte, T.preise, { x: 700, y: 620 }],
    ["06", T.preise, T.zahlen, { x: 1200, y: 560 }],
    ["07", T.zahlen, T.team, { x: 1300, y: 600 }],
    ["08", T.team, T.kunden, { x: 1250, y: 560 }],
    ["09", T.kunden, T.farben, { x: 700, y: 640 }],
    ["10", T.farben, T.outro, { x: 1240, y: 580 }],
  ];
  V.CUTS = [T.gebiete, T.klinken, T.termine, T.abschluss, T.karte, T.preise, T.zahlen, T.team, T.kunden, T.farben, T.outro];

  /* Riesige Konturziffer hinter den Szenen */
  V.layer({
    z: 5,
    build(root) {
      return {
        nums: CHAPTERS.map(([num, from, to, pos]) => {
          const n = el("div", "ghost-num", root, num);
          n.style.left = `${pos.x - 420}px`;
          n.style.top = `${pos.y - 430}px`;
          return { n, from, to, pos };
        }),
      };
    },
    update(t, s) {
      s.nums.forEach(({ n, from, to }) => {
        if (t < from - 0.3 || t > to + 0.3) return set(n, { o: 0 });
        const k = (t - from) / (to - from);
        const inK = p(t, from - 0.1, 0.9, E.outExpo);
        const out = p(t, to - 0.5, 0.5, E.inCubic);
        set(n, { o: inK * (1 - out), x: -60 * k + (1 - inK) * 160, s: 1.12 - 0.1 * k + (1 - inK) * 0.25, blur: (1 - inK) * 12 });
      });
    },
  });

  /* Lichtwisch ueber jeden Kapitelschnitt */
  V.layer({
    z: 900,
    build(root) {
      const band = el("div", "abs", root);
      band.style.cssText =
        "left:0;top:-200px;width:700px;height:1480px;background:linear-gradient(90deg, rgb(70 227 142/0) 0%, rgb(70 227 142/.25) 30%, rgb(220 255 235/.85) 50%, rgb(70 227 142/.25) 70%, rgb(70 227 142/0) 100%);opacity:0";
      const streaks = Array.from({ length: 9 }, (_, i) => {
        const s = el("div", "abs", root);
        const h = 2 + (i % 3) * 2;
        s.style.cssText = `left:0;top:${80 + i * 110 + ((i * 37) % 60)}px;width:${500 + (i % 4) * 220}px;height:${h}px;border-radius:${h}px;background:linear-gradient(90deg, transparent, rgb(200 255 225/.9), transparent);opacity:0`;
        return s;
      });
      return { band, streaks };
    },
    update(t, s) {
      let active = null;
      for (const c of V.CUTS) if (t > c - 0.4 && t < c + 0.4) active = c;
      if (active === null) {
        set(s.band, { o: 0 });
        s.streaks.forEach((st) => set(st, { o: 0 }));
        return;
      }
      const k = clamp((t - (active - 0.4)) / 0.8);
      const x = -900 + E.inOutCubic(k) * 3400;
      s.band.style.transform = `translateX(${x.toFixed(1)}px) skewX(-18deg)`;
      set(s.band, { o: Math.sin(Math.PI * k) * 0.9 });
      s.streaks.forEach((st, i) => {
        const kk = clamp((t - (active - 0.35 + i * 0.015)) / 0.6);
        const sx = -1200 + E.inOutQuad(kk) * 3600;
        st.style.transform = `translateX(${sx.toFixed(1)}px)`;
        set(st, { o: Math.sin(Math.PI * kk) * 0.8 });
      });
    },
  });

  V.CUTS.forEach((c) => {
    V.flashes.push({ t: c, power: 0.22 });
  });
  // Ton: ein Wisch je Schnitt (soundtrack.py daempft andere Whooshes daneben)
  const addCues = () => V.CUTS.forEach((c) => V.cue(c, "cut"));
  addCues();
})();
