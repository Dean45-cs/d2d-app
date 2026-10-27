/*
 * Kapitel 07 · Zahlen: die Uebersicht mit Kopfkarte und Verlauf, dazu das
 * Profil als Netzdiagramm - sechs Achsen gegen den Zeitraum davor.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  // Reihenfolge wie PROFILE_AXES (src/lib/profile.ts), im Uhrzeigersinn ab oben
  const AXES = [
    ["Fleiß", 1.28, "54 / Tag"],
    ["Antreffen", 1.12, "25 %"],
    ["Termine", 1.45, "15 %"],
    ["Abschluss", 1.62, "20 %"],
    ["Kombi", 0.88, "38 %"],
    ["Nachfassen", 1.3, "83 %"],
  ];
  const R = 210; // Radius bei "doppelt so viel"
  const C = 290;
  const pt = (i, v) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return [C + Math.cos(a) * (v / 2) * R, C + Math.sin(a) * (v / 2) * R];
  };
  const poly = (vals) => "M" + vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(" ")).join(" L") + "Z";

  V.scene({
    id: "zahlen",
    start: T.zahlen,
    dur: T.team - T.zahlen,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px";
      const ph = V.phone(cam, { x: 770, y: 150 });
      const scr = V.screens.uebersicht(ph.app);
      const radar = el(
        "div",
        "abs",
        cam,
        `<svg width="580" height="580" viewBox="0 0 580 580" style="overflow:visible">
          <defs>
            <radialGradient id="rdg" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#46e38e" stop-opacity=".55"/><stop offset="1" stop-color="#17a852" stop-opacity=".25"/></radialGradient>
          </defs>
          <g class="grid">
            ${[0.5, 1, 1.5, 2].map((v) => `<path class="ring" d="${poly(Array(6).fill(v))}" fill="${v === 2 ? "rgb(255 255 255/.03)" : "none"}" stroke="rgb(255 255 255/${v === 1 ? 0 : 0.14})" stroke-width="1.5"/>`).join("")}
            ${AXES.map((_, i) => {
              const [x, y] = pt(i, 2);
              return `<line class="axis" x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgb(255 255 255/.14)" stroke-width="1.5"/>`;
            }).join("")}
          </g>
          <path class="before" d="${poly(Array(6).fill(1))}" fill="none" stroke="rgb(255 255 255/.75)" stroke-width="2.5" stroke-dasharray="8 8"/>
          <path class="now" d="${poly(Array(6).fill(1))}" fill="url(#rdg)" stroke="#5cf09c" stroke-width="4" stroke-linejoin="round" style="filter:drop-shadow(0 0 18px rgb(70 227 142/.7))"/>
          ${AXES.map(() => `<circle class="vtx" r="7" fill="#eafff2" stroke="#17a852" stroke-width="3"/>`).join("")}
          ${AXES.map(([label, , value], i) => {
            const [x, y] = pt(i, 2.42);
            return `<g class="lab" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><text text-anchor="middle" y="-4" font-family="Inter" font-size="22" font-weight="700" fill="#fff">${label}</text><text text-anchor="middle" y="22" font-family="Inter" font-size="19" font-weight="500" fill="#8fd6a9">${value}</text></g>`;
          }).join("")}
        </svg>`,
      );
      radar.style.cssText += "left:1270px;top:240px";
      const tip = el(
        "div",
        "abs stage-glass",
        cam,
        `<div style="padding:16px 22px;font:500 21px Inter;color:#d0d7d3;white-space:nowrap"><b style="color:#fff">Abschluss</b> · 20 % · 12 von 61 Gesprächen<div style="color:#5cf09c;font-weight:700;margin-top:4px">vorher 12 % · +8 Punkte</div></div>`,
      );
      tip.style.cssText += "left:1350px;top:900px";
      const legend = el(
        "div",
        "abs",
        cam,
        `<div style="display:flex;gap:22px;font:600 19px Inter;color:#a3aca7"><span style="display:flex;align-items:center;gap:8px"><i style="width:26px;border-top:3px dashed #fff;opacity:.8"></i>wie vorher</span><span style="display:flex;align-items:center;gap:8px"><i style="width:26px;height:12px;border-radius:3px;background:#2fd161"></i>jetzt</span></div>`,
      );
      legend.style.cssText += "left:1440px;top:190px";
      const chapter = V.chapter(root, "07", "Übersicht");
      const cap = V.caption(root, {
        x: 120, y: 280, w: 620,
        eyebrow: "Deine Zahlen",
        title: ["Ehrlich.", "Auf einen Blick."],
        accentWords: ["Blick."],
        lede: "Antreff- und Abschlussquoten je Person, Gebiet und Zeitraum. Das Profil zeigt in sechs Achsen, wo du gegenüber dem Zeitraum davor zugelegt hast.",
      });
      return { cam, ph, scr, radar, rings: V.$$(radar, ".ring"), axes: V.$$(radar, ".axis"), before: V.$(radar, ".before"), now: V.$(radar, ".now"), vtx: V.$$(radar, ".vtx"), labs: V.$$(radar, ".lab"), tip, legend, chapter, cap };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      V.cue(start + 0.6, "count");
      V.cue(start + 1.4, "build");
      V.cue(start + 3.1, "rise");
      V.cue(start + 5.0, "tap");
      V.cue(start + 8.4, "whoosh");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.2, E.outExpo);
      const exit = p(lt, 8.2, 0.8, E.inExpo);
      set(s.ph.root, { x: lerp(-500, 0, enter), y: Math.sin(lt * 0.8) * 5, ry: lerp(40, 16, enter) - exit * 20, rx: 4, s: 0.86, o: 1 });
      set(s.cam, { s: 1 + exit * 0.4, o: 1 - p(lt, 8.5, 0.45), blur: exit * 10 });
      const c = p(lt, 0.5, 1.8, E.outCubic);
      V.text(s.scr.k.sales, String(Math.round(12 * c)));
      V.text(s.scr.k.doors, String(Math.round(248 * c)));
      V.text(s.scr.k.met, String(Math.round(61 * c)));
      V.text(s.scr.k.appts, String(Math.round(9 * c)));
      V.text(s.scr.k.quote, String(Math.round(20 * c)));
      s.scr.bars.forEach((b, i) => set(b, { sy: p(lt, 0.7 + i * 0.05, 0.6, E.outBack) }));

      // Netz
      const rk = p(lt, 1.2, 1.0, E.outExpo);
      set(s.radar, { s: 0.85 + rk * 0.15, o: rk, rz: (1 - rk) * -20 });
      s.rings.forEach((r, i) => set(r, { o: p(lt, 1.3 + i * 0.12, 0.4) }));
      set(s.before, { o: p(lt, 2.2, 0.5) });
      const g = E.spring(clamp((lt - 3.1) / 1.6), 5, 2.2);
      const vals = AXES.map(([, v]) => lerp(1, v, lt < 3.1 ? 0 : g) * (lt < 2.6 ? p(lt, 2.0, 0.6, E.outCubic) : 1));
      s.now.setAttribute("d", poly(vals));
      set(s.now, { o: p(lt, 2.0, 0.4) });
      s.vtx.forEach((v, i) => {
        const [x, y] = pt(i, vals[i]);
        v.setAttribute("cx", x.toFixed(1));
        v.setAttribute("cy", y.toFixed(1));
        v.setAttribute("r", (i === 3 && lt > 5.0 ? 7 + 4 * Math.abs(Math.sin((lt - 5) * 4)) * (lt < 7.5 ? 1 : 0) : 7).toFixed(2));
        set(v, { o: p(lt, 2.2, 0.4) });
      });
      s.labs.forEach((l, i) => set(l, { o: p(lt, 1.6 + i * 0.08, 0.4) * (i === 3 || lt < 5 ? 1 : 0.55) }));
      const tk = p(lt, 5.1, 0.5, E.outBack) * (1 - exit);
      set(s.tip, { o: tk, y: (1 - tk) * 20 });
      set(s.legend, { o: p(lt, 2.4, 0.5) * (1 - exit) });
      s.chapter.update(lt, 8.7);
      s.cap.update(lt, { start: 0.3, out: 8.2 });
    },
  });
})();
