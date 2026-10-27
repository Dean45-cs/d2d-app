/*
 * Kapitel 01 · Gebiete: Flaeche einkreisen -> Strassen und Hausnummern aus
 * OpenStreetMap -> auf drei Leute aufteilen -> Arbeitskarte mit Laufroute.
 */
(function () {
  const V = window.V;
  const { el, set, p, kf, E, clamp, lerp, T } = V;

  const MW = 2400;
  const MH = 1600;
  const PLOT = ["#3987e5", "#eda100", "#e87ba4"];

  /* ---------------------- Stadtplan (feste Saat) ------------------------ */

  function buildCity() {
    const rnd = V.rng(2024);
    const streets = [];
    // waagerechte Strassen mit leichtem Schwung
    let y = 60;
    while (y < MH) {
      const amp = 8 + rnd() * 22;
      const ph = rnd() * 6;
      const pts = [];
      for (let x = -40; x <= MW + 40; x += 60) pts.push([x, y + Math.sin(x / 420 + ph) * amp]);
      streets.push({ pts, main: rnd() < 0.18 });
      y += 120 + rnd() * 80;
    }
    let x = 80;
    while (x < MW) {
      const amp = 6 + rnd() * 16;
      const ph = rnd() * 6;
      const pts = [];
      for (let yy = -40; yy <= MH + 40; yy += 60) pts.push([x + Math.sin(yy / 380 + ph) * amp, yy]);
      streets.push({ pts, main: rnd() < 0.15, v: true });
      x += 140 + rnd() * 110;
    }
    // zwei Ausfallstrassen schraeg
    streets.push({ pts: [[-40, 1250], [700, 900], [1500, 640], [2440, 300]], main: true, diag: true });
    streets.push({ pts: [[300, -40], [820, 700], [1100, 1100], [1300, 1640]], main: true, diag: true });
    // Fluss
    const river = [];
    for (let xx = -60; xx <= MW + 60; xx += 40) river.push([xx, 1420 + Math.sin(xx / 300) * 60 + Math.sin(xx / 130) * 14]);
    return { streets, river };
  }

  const toD = (pts) => "M" + pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" L");

  function pointIn(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Die gezeichnete Flaeche (5 Ecken), in Kartenkoordinaten
  const POLY = [
    [860, 380],
    [1500, 330],
    [1720, 760],
    [1380, 1120],
    [820, 990],
  ];

  function housesAlong(streets) {
    const rnd = V.rng(77);
    const houses = [];
    for (const st of streets) {
      if (st.diag) continue;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [x0, y0] = st.pts[i];
        const [x1, y1] = st.pts[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        for (let d = 8; d < len; d += 21) {
          if (rnd() < 0.18) continue;
          const k = d / len;
          const px = x0 + (x1 - x0) * k;
          const py = y0 + (y1 - y0) * k;
          for (const side of [-1, 1]) {
            if (rnd() < 0.12) continue;
            const off = (st.main ? 20 : 15) + rnd() * 3;
            houses.push({ x: px + nx * off * side, y: py + ny * off * side, r: rnd() });
          }
        }
      }
    }
    // nicht zu nah an Kreuzungen: Haeuser, die zu dicht an einer anderen Strasse liegen, raus
    return houses;
  }

  V.scene({
    id: "gebiete",
    start: T.gebiete,
    dur: T.klinken - T.gebiete,
    pre: 0.35,
    post: 0.2,
    build(root) {
      const city = buildCity();
      // Haeuser nur im Gebiet, und nicht mitten auf einer Querstrasse
      const all = housesAlong(city.streets).filter((h) => pointIn(POLY, h.x, h.y));
      const houses = all.filter((h) => {
        for (const st of city.streets) {
          if (st.diag) continue;
          for (let i = 0; i < st.pts.length - 1; i++) {
            const [x0, y0] = st.pts[i];
            const [x1, y1] = st.pts[i + 1];
            const dx = x1 - x0, dy = y1 - y0;
            const k = clamp(((h.x - x0) * dx + (h.y - y0) * dy) / (dx * dx + dy * dy));
            const d = Math.hypot(h.x - (x0 + dx * k), h.y - (y0 + dy * k));
            if (d < (st.main ? 15 : 11)) return false;
          }
        }
        return true;
      });
      const xs = houses.map((h) => h.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      // drei Pakete: nach x sortiert in gleich viele Tueren geteilt
      const sorted = [...houses].sort((a, b) => a.x - b.x);
      const cut1 = sorted[Math.floor(sorted.length / 3)].x;
      const cut2 = sorted[Math.floor((sorted.length * 2) / 3)].x;
      houses.forEach((h) => (h.g = h.x < cut1 ? 0 : h.x < cut2 ? 1 : 2));
      const groups = [0, 1, 2].map((g) => {
        const hs = houses.filter((h) => h.g === g);
        return { n: hs.length, cx: hs.reduce((a, h) => a + h.x, 0) / hs.length, cy: hs.reduce((a, h) => a + h.y, 0) / hs.length };
      });
      // Tuerstand in Paket 2 (fuer die Arbeitskarte)
      const rnd = V.rng(5);
      houses.forEach((h) => {
        const r = rnd();
        h.state = r < 0.56 ? "open" : r < 0.76 ? "again" : r < 0.86 ? "appt" : r < 0.95 ? "sale" : "done";
      });
      // Laufroute: naechster Nachbar durch die offenen Tueren von Paket 2
      const open = houses.filter((h) => h.g === 1 && h.state === "open");
      const route = [];
      let cur = open.reduce((a, h) => (h.y > a.y ? h : a), open[0]);
      const left = new Set(open);
      while (cur) {
        route.push(cur);
        left.delete(cur);
        let best = null;
        let bd = Infinity;
        for (const h of left) {
          const d = Math.hypot(h.x - cur.x, h.y - cur.y);
          if (d < bd) {
            bd = d;
            best = h;
          }
        }
        cur = best;
      }

      const view = el("div", "abs", root);
      view.style.cssText = "left:0;top:0;width:1920px;height:1080px;perspective:1700px;perspective-origin:62% 40%";
      const plane = el("div", "abs", view);
      plane.style.cssText = `left:0;top:0;width:${MW}px;height:${MH}px;transform-origin:0 0;transform-style:preserve-3d;-webkit-mask-image:radial-gradient(ellipse closest-side at 50% 50%, #000 62%, transparent 100%);mask-image:radial-gradient(ellipse closest-side at 50% 50%, #000 62%, transparent 100%)`;

      const streetPaths = city.streets
        .map((st, i) => {
          const d = toD(st.pts);
          return st.main
            ? `<path class="st" data-i="${i}" d="${d}" pathLength="1" stroke="#1b2a23" stroke-width="26" fill="none" stroke-linecap="round"/><path class="st" data-i="${i}" d="${d}" pathLength="1" stroke="#4d6158" stroke-width="15" fill="none" stroke-linecap="round"/>`
            : `<path class="st" data-i="${i}" d="${d}" pathLength="1" stroke="#1a2620" stroke-width="15" fill="none" stroke-linecap="round"/><path class="st" data-i="${i}" d="${d}" pathLength="1" stroke="#33443c" stroke-width="8" fill="none" stroke-linecap="round"/>`;
        })
        .join("");
      const lit = city.streets
        .filter((st) => !st.diag)
        .map((st) => `<path d="${toD(st.pts)}" stroke="#9ff0c0" stroke-width="${st.main ? 9 : 5}" fill="none" stroke-linecap="round"/>`)
        .join("");
      const polyD = `M${POLY.map((q) => q.join(" ")).join(" L")}Z`;
      const svg = `<svg width="${MW}" height="${MH}" viewBox="0 0 ${MW} ${MH}" style="position:absolute;left:0;top:0">
<defs>
  <radialGradient id="mg" cx=".55" cy=".45" r=".7"><stop offset="0" stop-color="#13211b"/><stop offset="1" stop-color="#070d0a"/></radialGradient>
  <clipPath id="polyclip"><path d="${polyD}"/></clipPath>
  <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="#46e38e" stop-opacity="0"/><stop offset=".85" stop-color="#46e38e" stop-opacity=".35"/><stop offset="1" stop-color="#e8fff1" stop-opacity=".9"/></linearGradient>
</defs>
<rect width="${MW}" height="${MH}" fill="url(#mg)"/>
<path d="M1620 1080 Q1780 980 1960 1040 Q2100 1100 2040 1240 Q1900 1320 1720 1260 Q1580 1180 1620 1080Z" fill="#0f2419"/>
<path d="M200 160 Q420 110 560 200 Q600 340 430 380 Q240 360 200 160Z" fill="#0f2419"/>
<path d="${toD(city.river)}" stroke="#0b2530" stroke-width="70" fill="none"/>
<g class="streets">${streetPaths}</g>
<g class="lit" clip-path="url(#polyclip)" opacity="0">${lit}</g>
<g font-family="Inter" font-size="19" font-weight="500" fill="#7f958a" letter-spacing=".5">
  <text x="1010" y="${city.streets[3].pts[17][1] - 14}">Bahnhofstraße</text>
  <text x="1500" y="${city.streets[6].pts[26][1] - 14}">Lindenweg</text>
  <text x="380" y="${city.streets[2].pts[7][1] - 14}">Kampstraße</text>
  <text x="1880" y="${city.streets[4].pts[32][1] - 14}">Schillerstraße</text>
</g>
<path class="polyfill" d="${polyD}" fill="#30d158" fill-opacity="0"/>
<g clip-path="url(#polyclip)"><rect class="scanbar" x="0" y="0" width="260" height="${MH}" fill="url(#scan)" opacity="0"/></g>
<g class="cuts" clip-path="url(#polyclip)" stroke="#fff" stroke-width="5" stroke-dasharray="14 12" opacity="0">
  <path class="cut" d="M${cut1} 0 L${cut1} ${MH}" pathLength="1"/>
  <path class="cut" d="M${cut2} 0 L${cut2} ${MH}" pathLength="1"/>
</g>
<path class="polyline" d="" fill="none" stroke="#46e38e" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
<path class="polyedge" d="${polyD}" fill="none" stroke="#46e38e" stroke-width="7" stroke-linejoin="round" opacity="0" style="filter:drop-shadow(0 0 14px rgb(70 227 142/.9))"/>
<path class="routepath" d="${toD(route.map((h) => [h.x, h.y]))}" pathLength="1" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 1" opacity="0" style="filter:drop-shadow(0 0 8px rgb(255 255 255/.6))"/>
<g class="houses">${houses
        .map((h) => `<circle cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="0" fill="#30d158" stroke="#0a1a12" stroke-width="2"/>`)
        .join("")}</g>
<g class="verts">${POLY.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="0" fill="#fff" stroke="#46e38e" stroke-width="6"/>`).join("")}</g>
<circle class="walker" r="12" fill="#fff" opacity="0" style="filter:drop-shadow(0 0 12px #fff)"/>
</svg>`;
      el("div", "", plane, svg);
      // Paketkennzeichen (Zahl im Kreis + Person)
      const people = [
        ["AB", "blue", "Alex"],
        ["SK", "magenta", "Sina"],
        ["JC", "purple", "Jonas"],
      ];
      const badges = groups.map((g, i) => {
        const b = el(
          "div",
          "abs",
          plane,
          `<div style="display:flex;align-items:center;gap:12px;padding:10px 20px 10px 10px;border-radius:999px;background:rgb(10 16 13/.88);box-shadow:inset 0 0 0 2px ${PLOT[i]},0 14px 30px rgb(0 0 0/.5);white-space:nowrap">
            <span style="width:46px;height:46px;border-radius:50%;background:${PLOT[i]};color:#fff;font:800 26px Inter;display:flex;align-items:center;justify-content:center">${i + 1}</span>
            ${V.avatar(people[i][0], people[i][1], 46)}
            <span style="font:600 24px Inter;color:#fff">${people[i][2]}<span style="display:block;font:500 18px Inter;color:#a3aca7">${g.n} Türen</span></span></div>`,
        );
        b.style.cssText += `left:${g.cx - 120}px;top:${g.cy - 40 + [-150, 120, -40][i]}px`;
        return b;
      });
      const tapper = V.tapper(plane);
      tapper.root.style.transform = "scale(2)";

      // Lesbarkeit links
      const shade = el("div", "abs", root);
      shade.style.cssText =
        "left:0;top:0;width:1920px;height:1080px;background:linear-gradient(90deg, rgb(1 4 3/.97) 0%, rgb(1 4 3/.85) 27%, rgb(1 4 3/.2) 50%, transparent 62%), linear-gradient(0deg, rgb(1 4 3/.6), transparent 25%)";

      const chapter = V.chapter(root, "01", "Gebiete");
      const caps = [
        V.caption(root, {
          x: 120, y: 300, w: 780,
          title: ["Gebiet abstecken.", "In Sekunden."],
          accentWords: ["Sekunden"],
          lede: "Fläche auf der Karte einkreisen – Straßen und jede einzelne Hausnummer holt die App selbst aus OpenStreetMap.",
        }),
        V.caption(root, {
          x: 120, y: 300, w: 780,
          title: ["Fair aufteilen.", "Mit einem Tipp."],
          accentWords: ["Tipp"],
          lede: "Bis zu vier Leute: räumlich gruppiert, nach Türen ausgeglichen – niemand läuft quer durchs Viertel.",
        }),
        V.caption(root, {
          x: 120, y: 300, w: 780,
          title: ["Jede Tür im Blick.", "Route inklusive."],
          accentWords: ["Route"],
          lede: "Offen, nochmal, Termin, Abschluss: Die Arbeitskarte zeigt, was zu tun ist – die Laufroute plant die App auf dem Gerät.",
        }),
      ];

      // Knopf und Zaehler (Bildschirmebene)
      const loadBtn = el(
        "div",
        "abs",
        root,
        `<div class="app" style="position:relative;background:none"><div class="btn-primary" style="display:flex;align-items:center;gap:12px;height:68px;padding:0 34px;border-radius:999px;font:600 26px Inter">${V.ic("map", 28)}Straßen im Gebiet laden</div></div>`,
      );
      loadBtn.style.cssText = "left:1040px;top:930px";
      const splitBar = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:999px" class="stage-glass">
          <span style="font:600 22px Inter;color:#d0d7d3;padding:0 10px 0 14px">Aufteilen auf</span>
          ${[1, 2, 3, 4].map((n) => `<span class="sp" data-n="${n}" style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 24px Inter;color:#fff;background:rgb(255 255 255/.1)">${n}</span>`).join("")}
        </div>`,
      );
      splitBar.style.cssText = "left:1080px;top:930px";
      const stats = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="display:flex;gap:34px;padding:22px 30px">
          ${[["Straßen", "streets"], ["Hausnummern", "houses"], ["Türen", "doors"]]
            .map(([l, k]) => `<div><div style="font:600 17px Inter;letter-spacing:.12em;text-transform:uppercase;color:#8fa79b">${l}</div><div class="kpi" data-k="${k}" style="font-size:52px;color:#fff;margin-top:4px">0</div></div>`)
            .join("")}
        </div>`,
      );
      stats.style.cssText += "left:1340px;top:110px";
      const routeCard = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="display:flex;align-items:center;gap:22px;padding:20px 28px">
          <span style="width:64px;height:64px;border-radius:20px;background:linear-gradient(180deg,#16884a,#0d6634);display:flex;align-items:center;justify-content:center;color:#fff">${V.ic("navigate", 32)}</span>
          <div><div style="font:700 30px Inter;color:#fff">Laufroute</div><div style="font:500 22px Inter;color:#a3aca7;margin-top:2px"><span data-k="km">0,0</span> km · <span data-k="min">0</span> Min · ${route.length} offene Türen</div></div>
        </div>`,
      );
      routeCard.style.cssText += "left:1260px;top:110px";
      const legend = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;gap:12px">${[
          ["Offen", "transparent", "#fff"],
          ["Nochmal", "#8a978f", "#8a978f"],
          ["Termin", "#0b1510", "#e8efe9"],
          ["Abschluss", "#30d158", "#30d158"],
        ]
          .map(
            ([l, f, s]) =>
              `<span class="stage-glass" style="border-radius:999px;display:flex;align-items:center;gap:10px;padding:10px 18px;font:600 20px Inter;color:#e6efe9"><i style="width:16px;height:16px;border-radius:50%;background:${f};box-shadow:inset 0 0 0 3px ${s}"></i>${l}</span>`,
          )
          .join("")}</div>`,
      );
      legend.style.cssText = "left:960px;top:950px";

      return {
        view,
        plane,
        svg: V.$(plane, "svg"),
        streets: V.$$(plane, ".st"),
        lit: V.$(plane, ".lit"),
        polyline: V.$(plane, ".polyline"),
        polyedge: V.$(plane, ".polyedge"),
        polyfill: V.$(plane, ".polyfill"),
        verts: V.$$(plane, ".verts circle"),
        scanbar: V.$(plane, ".scanbar"),
        cutsG: V.$(plane, ".cuts"),
        cuts: V.$$(plane, ".cut"),
        routepath: V.$(plane, ".routepath"),
        walker: V.$(plane, ".walker"),
        dots: V.$$(plane, ".houses circle"),
        houses,
        minX,
        maxX,
        route,
        badges,
        tapper,
        chapter,
        caps,
        loadBtn,
        splitBar,
        splitNums: V.$$(splitBar, ".sp"),
        stats,
        statK: Object.fromEntries(V.$$(stats, "[data-k]").map((n) => [n.dataset.k, n])),
        routeCard,
        routeK: Object.fromEntries(V.$$(routeCard, "[data-k]").map((n) => [n.dataset.k, n])),
        legend: V.$$(legend, ".stage-glass"),
        streetCount: city.streets.length,
      };
    },
    cues(start) {
      [2.2, 2.7, 3.2, 3.7, 4.2].forEach((t) => V.cue(start + t, "tap"));
      V.cue(start + 4.45, "close");
      V.cue(start + 5.3, "tap");
      V.cue(start + 5.5, "scan");
      V.cue(start + 9.0, "tap");
      V.cue(start + 9.4, "split");
      [9.8, 9.95, 10.1].forEach((t, i) => V.cue(start + t, "pop", { n: i }));
      V.cue(start + 12.0, "route");
      V.cue(start + 15.2, "whoosh");
    },
    update(lt, s) {
      // Kamera: Fokuspunkt auf der Karte, Neigung, Zoom
      const fx = kf(lt, [[0, 1250], [2, 1290], [8.0, 1290], [9.2, 1190, E.inOutCubic], [10.8, 1180], [12.2, 1300, E.inOutCubic], [16, 1270]]);
      const fy = kf(lt, [[0, 760], [8.6, 740], [11.6, 760], [16, 760]]);
      const zoom = kf(lt, [[0, 0.62], [2, 0.74, E.outCubic], [8.6, 0.78], [11.6, 1.18, E.inOutCubic], [14.6, 1.3], [16, 2.6, E.inExpo]]);
      const tilt = kf(lt, [[0, 58], [2, 34, E.outCubic], [8.6, 30], [11.6, 42, E.inOutCubic], [16, 48]]);
      const rot = kf(lt, [[0, -18], [2, -8, E.outCubic], [11.6, -4], [16, 6]]);
      s.plane.style.transform = `translate(1240px, 560px) rotateX(${tilt.toFixed(2)}deg) rotateZ(${rot.toFixed(2)}deg) scale(${zoom.toFixed(4)}) translate(${-fx}px, ${-fy}px)`;
      set(s.view, { o: p(lt, -0.3, 0.5) * (1 - p(lt, 15.5, 0.5)), blur: p(lt, 15.2, 0.8, E.inCubic) * 14 });

      // Strassen zeichnen sich
      s.streets.forEach((path, i) => {
        const k = p(lt, -0.3 + (i % 17) * 0.035, 1.0, E.outCubic);
        path.style.strokeDasharray = `${k.toFixed(4)} 1`;
      });

      // Ecken antippen, Linie zieht nach
      const taps = [2.2, 2.7, 3.2, 3.7, 4.2];
      s.verts.forEach((v, i) => v.setAttribute("r", (13 * E.outBack(clamp((lt - taps[i]) / 0.35), 2.5)).toFixed(2)));
      const placed = taps.filter((tt) => lt >= tt).length;
      let d = "";
      if (placed > 0) {
        const pts = POLY.slice(0, placed).map((q) => [...q]);
        // die Linie folgt dem Finger zur naechsten Ecke
        if (placed < 5) {
          const k = p(lt, taps[placed - 1] + 0.05, 0.45, E.inOutCubic);
          const a = POLY[placed - 1];
          const b = POLY[placed];
          pts.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k)]);
        } else {
          const k = p(lt, 4.25, 0.25, E.inOutCubic);
          pts.push([lerp(POLY[4][0], POLY[0][0], k), lerp(POLY[4][1], POLY[0][1], k)]);
        }
        d = "M" + pts.map((q) => q.join(" ")).join(" L");
      }
      s.polyline.setAttribute("d", d);
      s.polyline.style.strokeDasharray = lt < 4.5 ? "18 12" : "none";
      const closed = p(lt, 4.45, 0.5, E.outCubic);
      s.polyedge.setAttribute("opacity", closed.toFixed(3));
      set(s.polyline, { o: 1 - closed });
      s.polyfill.setAttribute("fill-opacity", (closed * 0.13 * (1 - p(lt, 9.3, 0.8) * 0.5)).toFixed(3));
      s.tapper.update(lt, [
        ...taps.map((tt, i) => ({ t: tt, x: POLY[i][0], y: POLY[i][1] })),
      ]);

      // Laden: Knopf, Scan, Haeuser
      const btnIn = p(lt, 4.7, 0.5, E.outBack);
      const btnOut = p(lt, 5.45, 0.35, E.inCubic);
      const press = lt > 5.3 && lt < 5.45 ? 0.94 : 1;
      set(s.loadBtn, { y: (1 - btnIn) * 60, o: Math.min(btnIn, 1 - btnOut), s: press * (1 - btnOut * 0.1) });
      const scan = p(lt, 5.5, 2.2, E.inOutSine);
      s.scanbar.setAttribute("x", (lerp(s.minX - 280, s.maxX + 40, scan)).toFixed(1));
      s.scanbar.setAttribute("opacity", (lt > 5.5 && lt < 7.8 ? 1 : 0).toString());
      s.lit.setAttribute("opacity", (p(lt, 5.6, 1.6) * 0.55 * (1 - p(lt, 9.3, 0.6) * 0.6)).toFixed(3));
      const route = lt > 11.4;
      let shown = 0;
      s.dots.forEach((dot, i) => {
        const h = s.houses[i];
        const at = 5.6 + ((h.x - s.minX) / (s.maxX - s.minX)) * 2.0 + h.r * 0.25;
        const k = E.outBack(clamp((lt - at) / 0.35), 3);
        if (lt >= at) shown++;
        let r = 8.5 * k;
        let fill = "#30d158";
        let stroke = "#04140b";
        let sw = 1.5;
        // Aufteilen: Farbe der Pakete
        const splitAt = 9.4 + h.g * 0.15 + h.r * 0.3;
        if (lt > splitAt) fill = PLOT[h.g];
        // Arbeitskarte: Stand je Tuer, Rest tritt zurueck
        if (route) {
          const fade = p(lt, 11.4, 0.6);
          if (h.g !== 1) {
            r = 6.5 * (1 - fade * 0.4);
            dot.setAttribute("opacity", (1 - fade * 0.7).toFixed(2));
          } else {
            dot.setAttribute("opacity", "1");
            const st = h.state;
            if (fade > 0.5) {
              if (st === "open") { fill = "#0b1510"; stroke = "#ffffff"; sw = 3.5; r = 8; }
              else if (st === "again") { fill = "#8a978f"; stroke = "#0a1a12"; r = 7; }
              else if (st === "appt") { fill = "#0b1510"; stroke = "#e8efe9"; sw = 2; r = 7; }
              else if (st === "sale") { fill = "#30d158"; stroke = "#eafff2"; sw = 2; r = 8.5; }
              else { fill = "#4a5a52"; stroke = "none"; r = 4; }
            }
          }
        } else dot.setAttribute("opacity", "1");
        dot.setAttribute("r", r.toFixed(2));
        dot.setAttribute("fill", fill);
        dot.setAttribute("stroke", stroke);
        dot.setAttribute("stroke-width", sw);
      });

      // Zaehler
      const statsIn = p(lt, 5.5, 0.6, E.outExpo);
      const statsOut = p(lt, 11.2, 0.4, E.inCubic);
      set(s.stats, { y: (1 - statsIn) * -40, o: statsIn * (1 - statsOut) });
      const kk = p(lt, 5.6, 2.3, E.outCubic);
      s.statK.streets.textContent = Math.round(kk * 24);
      s.statK.houses.textContent = V.count(shown);
      s.statK.doors.textContent = V.count(Math.round(shown * 1.26));

      // Aufteilen
      const barIn = p(lt, 8.2, 0.5, E.outBack);
      const barOut = p(lt, 11.0, 0.4, E.inCubic);
      set(s.splitBar, { y: (1 - barIn) * 60, o: barIn * (1 - barOut) });
      s.splitNums.forEach((n, i) => {
        const on = i === 2 && lt > 9.05;
        n.style.background = on ? "linear-gradient(180deg,#16884a,#0d6634)" : "rgb(255 255 255/.1)";
        n.style.boxShadow = on ? "0 0 30px rgb(48 209 88/.6)" : "none";
        set(n, { s: i === 2 && lt > 8.95 && lt < 9.12 ? 0.9 : 1 });
      });
      s.tapper.update(lt, [
        ...taps.map((tt, i) => ({ t: tt, x: POLY[i][0], y: POLY[i][1] })),
      ]);
      const cutsK = p(lt, 9.4, 0.7, E.outCubic);
      s.cutsG.setAttribute("opacity", (cutsK * (1 - p(lt, 11.4, 0.5) * 0.7)).toFixed(3));
      s.cuts.forEach((c) => (c.style.strokeDashoffset = "0"));
      s.cuts.forEach((c) => c.setAttribute("stroke-dasharray", `${(cutsK * 1).toFixed(3)} 1`));
      s.badges.forEach((b, i) => {
        const k = E.outBack(clamp((lt - (9.8 + i * 0.15)) / 0.5), 2);
        const out = p(lt, 11.3, 0.4, E.inCubic);
        set(b, { s: k * (1 - out * 0.3) * 1.3, o: clamp((lt - 9.8 - i * 0.15) / 0.1) * (1 - out), rx: -30 });
      });

      // Arbeitskarte: Legende, Route, Laeufer
      s.legend.forEach((l, i) => {
        const k = p(lt, 11.7 + i * 0.1, 0.5, E.outBack);
        set(l, { y: (1 - k) * 40, o: k * (1 - p(lt, 15.0, 0.4)) });
      });
      const rk = p(lt, 12.0, 2.4, E.inOutSine);
      s.routepath.setAttribute("stroke-dasharray", `${rk.toFixed(4)} 1`);
      s.routepath.setAttribute("opacity", (p(lt, 11.9, 0.2) * (1 - p(lt, 15.1, 0.4))).toFixed(3));
      const idx = Math.min(s.route.length - 1, Math.floor(rk * (s.route.length - 1)));
      const hw = s.route[idx];
      if (hw) {
        s.walker.setAttribute("cx", hw.x.toFixed(1));
        s.walker.setAttribute("cy", hw.y.toFixed(1));
      }
      s.walker.setAttribute("opacity", (lt > 12.0 && lt < 15.2 ? 1 : 0).toString());
      const rcIn = p(lt, 12.0, 0.6, E.outExpo);
      set(s.routeCard, { y: (1 - rcIn) * -40, o: rcIn * (1 - p(lt, 15.0, 0.4)) });
      s.routeK.km.textContent = V.count(rk * 2.1, 1);
      s.routeK.min.textContent = Math.round(rk * 48);

      // Texte
      s.chapter.update(lt, 15.6);
      s.caps[0].update(lt, { start: 0.5, out: 8.0 });
      s.caps[1].update(lt, { start: 8.45, out: 11.25 });
      s.caps[2].update(lt, { start: 11.55, out: 15.1 });
    },
  });
  V.flashes.push({ t: T.gebiete + 4.48, power: 0.18 });
})();
