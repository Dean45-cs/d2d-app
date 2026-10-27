/*
 * Kapitel 08 · Team: Rangliste als Treppchen, Tagesziele als Ringe, Abzeichen
 * von Bronze bis Diamant. Kapitel 09 · Kunden: Vertragsende im Blick, faellig
 * zum Umberaten.
 */
(function () {
  const V = window.V;
  const { el, set, p, kf, E, clamp, lerp, T } = V;

  /** Ein Block mit Front, Deckel und Seite (CSS-3D). */
  const box = (parent, { w, h, d, front, top, side, html = "" }) => {
    const b = el("div", "abs", parent);
    b.style.cssText = `width:${w}px;height:${h}px;transform-style:preserve-3d;transform-origin:50% 100%`;
    const f = el("div", "abs", b, html);
    f.style.cssText = `left:0;top:0;width:${w}px;height:${h}px;background:${front};transform:translateZ(${d / 2}px);border-radius:6px 6px 0 0;box-shadow:inset 0 1px 0 rgb(255 255 255/.35)`;
    const t = el("div", "abs", b);
    t.style.cssText = `left:0;top:0;width:${w}px;height:${d}px;background:${top};transform-origin:50% 0;transform:translateZ(${d / 2}px) rotateX(90deg)`;
    const sd = el("div", "abs", b);
    sd.style.cssText = `left:${w}px;top:0;width:${d}px;height:${h}px;background:${side};transform-origin:0 50%;transform:translateZ(${d / 2}px) rotateY(90deg)`;
    return b;
  };

  const PEOPLE = [
    { place: 2, name: "Sina Krause", initials: "SK", tone: "blue", value: 11, h: 270, x: 0 },
    { place: 1, name: "Mia Wolf", initials: "MW", tone: "magenta", value: 14, h: 370, x: 250 },
    { place: 3, name: "Jonas Carlsson", initials: "JC", tone: "purple", value: 9, h: 190, x: 500, me: true },
  ];
  const MEDALS = [
    ["bronze", "Bronze", "Erster Abschluss", "check"],
    ["silver", "Silber", "Hundert Türen", "door"],
    ["gold", "Gold", "Dreierpack", "sparkles"],
    ["platinum", "Platin", "Volle Leistung", "bolt"],
    ["diamond", "Diamant", "Vertriebslegende", "trophy"],
  ];

  V.scene({
    id: "team",
    start: T.team,
    dur: T.kunden - T.team,
    build(root) {
      // Treppchen
      const pod = el("div", "abs", root);
      pod.style.cssText = "left:930px;top:250px;width:740px;height:640px;transform-style:preserve-3d";
      const blocks = PEOPLE.map((q) => {
        const wrap = el("div", "abs", pod);
        wrap.style.cssText = `left:${q.x}px;top:${640 - q.h}px;width:220px;height:${q.h}px;transform-style:preserve-3d`;
        const b = box(wrap, {
          w: 220,
          h: q.h,
          d: 160,
          front: q.place === 1 ? "linear-gradient(180deg,#2fd161,#0f6f39)" : q.me ? "linear-gradient(180deg,#1e7a49,#0b3f23)" : "linear-gradient(180deg,#2c3a33,#141c18)",
          top: q.place === 1 ? "#7af2ac" : q.me ? "#3aa86b" : "#4a5a52",
          side: q.place === 1 ? "#0b5a2d" : "#0c1511",
          html: `<div style="position:absolute;left:0;right:0;top:22px;text-align:center;font:900 110px 'Inter Display';letter-spacing:-.06em;color:rgb(255 255 255/.92)">${q.place}</div>`,
        });
        b.style.left = "0";
        b.style.top = "0";
        const head = el(
          "div",
          "abs",
          wrap,
          `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:260px">
            <div style="position:relative">${V.avatar(q.initials, q.tone, 92)}${q.place === 1 ? `<span style="position:absolute;right:-12px;top:-14px;color:#f1c44d;filter:drop-shadow(0 4px 10px rgb(241 196 77/.6))">${V.ic("trophy", 40, "", 2)}</span>` : ""}</div>
            <div style="font:700 26px Inter;color:#fff;white-space:nowrap">${q.name}${q.me ? ' <span style="font:700 16px Inter;color:#062611;background:#5cf09c;padding:3px 9px;border-radius:999px;vertical-align:4px">Du</span>' : ""}</div>
            <div class="kpi" style="font-size:44px;color:${q.place === 1 ? "#5cf09c" : "#fff"}"><span class="val">0</span> <span style="font:600 20px Inter;color:#a3aca7">Abschlüsse</span></div>
          </div>`,
        );
        head.style.cssText += "left:-20px;top:-230px;transform:translateZ(80px)";
        return { wrap, b, head, val: V.$(head, ".val"), q };
      });
      const metrics = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;gap:10px">${["Abschlüsse", "Termine", "Türen", "Abschlussquote", "Antreffquote"]
          .map((m, i) => `<span style="padding:10px 18px;border-radius:999px;font:600 19px Inter;color:#fff;${i === 0 ? "background:linear-gradient(180deg,#16884a,#0d6634)" : "background:rgb(255 255 255/.08)"}">${m}</span>`)
          .join("")}</div>`,
      );
      metrics.style.cssText += "left:930px;top:120px";
      const me = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="padding:24px 28px;width:640px">
          <div style="display:flex;align-items:center;gap:14px"><span class="kpi" style="font-size:58px;color:#fff">3.</span><span style="font:600 22px Inter;color:#a3aca7">Dein Platz · 30 Tage</span>
            <span style="margin-left:auto;display:flex;align-items:center;gap:6px;font:700 20px Inter;color:#5cf09c">${V.ic("trendUp", 20)}2 Plätze</span></div>
          <div style="font:600 27px/1.3 Inter;color:#fff;margin-top:10px">Noch 3 Abschlüsse und du überholst <span style="color:#5cf09c">Sina</span> (Platz 2).</div>
        </div>`,
      );
      me.style.cssText += "left:120px;top:680px";
      const capA = V.caption(root, {
        x: 120, y: 250, w: 760,
        eyebrow: "Rangliste",
        title: ["Wer liegt vorn?"],
        accentWords: ["vorn?"],
        lede: "Je Kennzahl dein Platz, der Abstand zum Nächsten und der Team-Schnitt. Fair bleibt es auch: Quoten zählen erst ab genug Gesprächen.",
      });

      // Erfolge: Ringe und Medaillen
      const rings = el(
        "div",
        "abs",
        root,
        `<div style="display:flex;align-items:center;gap:44px">
          <svg width="380" height="380" viewBox="0 0 380 380">
            ${[
              [168, "#8e9a94", 0],
              [126, "#d0d7d3", 1],
              [84, "#30d158", 2],
            ]
              .map(
                ([r, c, i]) => `<circle cx="190" cy="190" r="${r}" fill="none" stroke="${c}" stroke-opacity=".13" stroke-width="30"/>
              <circle class="ar" data-i="${i}" cx="190" cy="190" r="${r}" fill="none" stroke="${c}" stroke-width="30" stroke-linecap="round" pathLength="1" stroke-dasharray="0 1" transform="rotate(-90 190 190)" style="filter:drop-shadow(0 0 12px ${c}88)"/>`,
              )
              .join("")}
          </svg>
          <div style="display:grid;gap:22px">
            ${[
              ["Türen", "#8e9a94", 20],
              ["Gespräche", "#d0d7d3", 5],
              ["Abschluss", "#30d158", 1],
            ]
              .map(
                ([l, c, goal], i) => `<div><div style="display:flex;align-items:center;gap:10px;font:600 22px Inter;color:#a3aca7"><i style="width:14px;height:14px;border-radius:50%;background:${c}"></i>${l}</div>
                <div class="kpi" style="font-size:52px;color:#fff"><span class="gv" data-i="${i}">0</span><span style="color:#6e7a73">/${goal}</span></div></div>`,
              )
              .join("")}
          </div>
        </div>`,
      );
      rings.style.cssText += "left:120px;top:470px";
      const goalsDone = el("div", "abs", root, `<span style="display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border-radius:999px;background:linear-gradient(180deg,#5cf09c,#2fd161);color:#062611;font:800 24px Inter">${V.ic("check", 22, "", 2.4)}3 von 3 Zielen erreicht</span>`);
      goalsDone.style.cssText += "left:150px;top:900px";
      const medals = MEDALS.map(([tier, label, title, icon], i) => {
        const m = el(
          "div",
          "abs",
          root,
          `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:170px;text-align:center">
            ${V.medal(tier, 150, icon)}
            <div style="font:600 17px Inter;letter-spacing:.14em;text-transform:uppercase;color:${V.METALS[tier].base}">${label}</div>
            <div style="font:700 22px Inter;color:#fff;line-height:1.2">${title}</div>
          </div>`,
        );
        m.style.cssText += `left:${980 + i * 176}px;top:${520 + (i % 2) * 40}px`;
        return m;
      });
      const capB = V.caption(root, {
        x: 120, y: 200, w: 1500, size: "t-m",
        eyebrow: "Erfolge",
        title: ["Tagesziele, Level und 50 Abzeichen."],
        accentWords: ["Abzeichen."],
        lede: "Ringe wie bei der Fitness-Uhr, sieben Rangtitel – und Medaillen von Bronze bis Diamant.",
      });
      const chapter = V.chapter(root, "08", "Team");
      const ctxC = el("canvas", "abs", root);
      ctxC.width = 1920;
      ctxC.height = 1080;
      ctxC.style.cssText = "left:0;top:0";
      const burst = V.confetti(31, 120, { x0: 310, y0: 660, spread: 80, vMin: 600, vMax: 1500 });
      return {
        pod, blocks, metrics, me, capA, rings, ar: V.$$(rings, ".ar"), gv: V.$$(rings, ".gv"), goalsDone, medals, capB, chapter,
        ctx: ctxC.getContext("2d"), burst,
      };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      [0.5, 0.95, 1.4].forEach((t, i) => V.cue(start + t, "rise", { n: i }));
      V.cue(start + 3.6, "pop");
      V.cue(start + 5.7, "whoosh");
      [6.6, 7.0, 7.4].forEach((t) => V.cue(start + t, "ring"));
      V.cue(start + 7.9, "levelup");
      MEDALS.forEach((_, i) => V.cue(start + 8.2 + i * 0.3, "medal", { n: i }));
      V.cue(start + 11.4, "whoosh");
    },
    update(lt, s) {
      // Phase A: Treppchen
      const outA = p(lt, 5.6, 0.7, E.inExpo);
      set(s.pod, { ry: -14 + Math.sin(lt * 0.4) * 4 + outA * -40, rx: -5, x: -outA * 600, o: 1 - outA, s: 0.95 });
      const order = { 3: 0.5, 2: 0.95, 1: 1.4 };
      s.blocks.forEach((b) => {
        const at = order[b.q.place];
        const k = E.spring(clamp((lt - at) / 0.9), 6, 2.4);
        b.b.style.transform = `scaleY(${Math.max(0.001, k).toFixed(4)})`;
        set(b.wrap, { o: clamp(k * 6) });
        const hk = p(lt, at + 0.35, 0.5, E.outBack);
        set(b.head, { o: hk, y: (1 - hk) * 40, z: 80 });
        V.text(b.val, String(Math.round(b.q.value * p(lt, at + 0.2, 0.9, E.outCubic))));
      });
      set(s.metrics, { o: p(lt, 0.3, 0.5) * (1 - outA), y: (1 - p(lt, 0.3, 0.6, E.outBack)) * -20 });
      const mk = p(lt, 3.6, 0.7, E.outBack) * (1 - outA);
      set(s.me, { o: mk, y: (1 - mk) * 50 });
      s.capA.update(lt, { start: 0.3, out: 5.5 });

      // Phase B: Ringe und Medaillen
      const inB = p(lt, 6.0, 0.7, E.outExpo);
      const outB = p(lt, 11.2, 0.6, E.inExpo);
      set(s.rings, { o: inB * (1 - outB), x: (1 - inB) * -200 - outB * 300, s: 0.95 + inB * 0.05 });
      const goals = [20, 5, 1];
      s.ar.forEach((r, i) => {
        const k = p(lt, 6.4 + i * 0.4, 0.8, E.inOutCubic);
        r.setAttribute("stroke-dasharray", `${(k * 0.999).toFixed(4)} 1`);
        V.text(s.gv[i], String(Math.round(goals[i] * k)));
      });
      const gd = p(lt, 7.9, 0.5, E.outBack) * (1 - outB);
      set(s.goalsDone, { o: gd, s: 0.8 + gd * 0.2 });
      s.medals.forEach((m, i) => {
        const at = 8.2 + i * 0.3;
        const k = p(lt, at, 0.9, E.outCubic);
        set(m, {
          o: clamp((lt - at) / 0.15) * (1 - outB),
          y: (1 - E.outBack(clamp((lt - at) / 0.6), 2)) * -260 + Math.sin(lt * 1.5 + i) * 6 * k,
          ry: (1 - k) * 540,
          s: 0.7 + k * 0.3,
        });
      });
      s.capB.update(lt, { start: 6.0, out: 11.2 });
      s.chapter.update(lt, 11.8);
      const ctx = s.ctx;
      ctx.clearRect(0, 0, 1920, 1080);
      s.burst(ctx, lt - 7.85, 2.6);
    },
  });

  /* -------------------------------- Kunden -------------------------------- */

  const CUSTOMERS = [
    { name: "Herr Okafor", addr: "Lindenweg 3 · Strom", end: "abgelaufen 20.10.", tone: "danger" },
    { name: "Familie Schmidt", addr: "Kampstraße 12 · Gas", end: "endet 14.11. · in 18 Tagen", tone: "warn", pick: true },
    { name: "Frau Becker", addr: "Bahnhofstraße 21 · Strom + Gas", end: "endet 02.12. · in 36 Tagen", tone: "warn" },
    { name: "Herr Yilmaz", addr: "Schillerstraße 8 · Strom", end: "endet 19.12. · in 53 Tagen", tone: "warn" },
  ];

  V.scene({
    id: "kunden",
    start: T.kunden,
    dur: T.farben - T.kunden,
    build(root) {
      const ph = V.phone(root, { x: 1330, y: 150 });
      ph.app.innerHTML = `
<div class="scroll pad" style="padding-top:64px">
  <div class="a-large">Kunden</div>
  <div class="a-sub muted">Verträge, die bald enden</div>
  <div class="seg" style="margin-top:14px"><span class="on">Fällig · 4</span><span>Ohne Kunde</span><span>Alle</span></div>
  <div class="list" style="margin-top:14px">
    ${CUSTOMERS.map(
      (c, i) => `<div class="cell crow" data-i="${i}" style="min-height:76px;align-items:center">
        ${V.avatar(c.name.split(" ").map((w) => w[0]).join("").slice(0, 2), ["teal", "indigo", "brown", "slate"][i], 40)}
        <span style="flex:1;min-width:0"><b style="display:block;font-weight:600">${c.name}</b><span class="a-foot muted" style="display:block">${c.addr}</span>
          <span class="a-foot" style="font-weight:600;color:var(--${c.tone})">${c.end}</span></span>
        <span class="door-glyph" style="width:36px;height:36px;color:var(--accent-ink);background:color-mix(in srgb,var(--accent-vivid) 16%,transparent)">${V.ic("phone", 18)}</span>
        <span class="umb door-glyph" style="width:36px;height:36px;background:var(--fill);color:var(--ink-2)">${V.ic("check", 18)}</span>
      </div>`,
    ).join("")}
  </div>
</div>
${V.tabbar(V.TABS, 4)}`;
      const toast = el("div", "toast glass-strong", ph.app, `<span class="glyph-result" style="width:28px;height:28px">${V.ic("check", 16)}</span>Umberaten · Familie Schmidt<span class="acc" style="margin-left:6px">Rückgängig</span>`);
      toast.style.top = "700px";
      const tapper = V.tapper(ph.screen);
      tapper.root.style.zIndex = "120";
      const rows = V.$$(ph.app, ".crow");
      const umb = V.posIn(V.$$(ph.app, ".umb")[1], ph.screen);

      const timeline = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="padding:30px 34px;width:1060px">
          <div style="display:flex;align-items:center;gap:14px">${V.avatar("FS", "indigo", 54)}<div><div style="font:700 28px Inter;color:#fff">Familie Schmidt · Gas</div><div style="font:500 20px Inter;color:#a3aca7">Lieferbeginn 15.11.2025 · 12 Monate · Vertragsende 14.11.2026</div></div></div>
          <div style="position:relative;height:120px;margin-top:26px">
            <div style="position:absolute;left:0;right:0;top:46px;height:20px;border-radius:10px;background:rgb(255 255 255/.08)"></div>
            <div class="tl-fill" style="position:absolute;left:0;top:46px;height:20px;border-radius:10px;background:linear-gradient(90deg,#16884a,#2fd161);width:0"></div>
            <div style="position:absolute;right:0;top:40px;width:16.4%;height:32px;border-radius:10px;background:repeating-linear-gradient(135deg,rgb(255 181 71/.55) 0 8px,rgb(255 181 71/.25) 8px 16px);box-shadow:inset 0 0 0 2px #ffb547"></div>
            <div style="position:absolute;right:0;top:86px;width:16.4%;text-align:center;font:700 18px Inter;color:#ffb547">Fällig · 60 Tage</div>
            <div class="today" style="position:absolute;top:30px;width:4px;height:52px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 16px #fff"></div>
            <div class="todaylbl" style="position:absolute;top:0;font:700 18px Inter;color:#fff;transform:translateX(-50%);white-space:nowrap">heute · noch 18 Tage</div>
            <div style="position:absolute;left:0;top:86px;font:500 18px Inter;color:#a3aca7">Lieferbeginn</div>
          </div>
        </div>`,
      );
      timeline.style.cssText += "left:120px;top:620px";
      const cap = V.caption(root, {
        x: 120, y: 200, w: 1100,
        eyebrow: "Kundenliste",
        title: ["Kunden behalten.", "Nicht nur gewinnen."],
        accentWords: ["behalten."],
        lede: "Die Teamleitung ordnet jedem Auftrag den Kunden zu. 60 Tage vor Vertragsende steht er unter „Fällig“ – anrufen, besuchen, umberaten.",
      });
      const chapter = V.chapter(root, "09", "Kunden");
      return { ph, rows, toast, tapper, umb, timeline, fill: V.$(timeline, ".tl-fill"), today: V.$(timeline, ".today"), todayLbl: V.$(timeline, ".todaylbl"), cap, chapter };
    },
    cues(start) {
      V.cue(start, "whoosh-in");
      V.cue(start + 1.2, "rise");
      V.cue(start + 4.2, "tap");
      V.cue(start + 4.3, "xp");
      V.cue(start + 6.4, "whoosh");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.1, E.outExpo);
      const exit = p(lt, 6.2, 0.8, E.inExpo);
      set(s.ph.root, { x: lerp(500, 0, enter) + exit * 600, y: Math.sin(lt * 0.8) * 5, ry: lerp(-40, -14, enter) + exit * 20, rx: 4, s: 0.9, o: 1 });
      s.rows.forEach((r, i) => {
        const k = p(lt, 0.6 + i * 0.12, 0.5, E.outCubic);
        const done = i === 1 && lt > 4.25;
        set(r, { o: k * (done ? 1 - p(lt, 4.9, 0.4) * 0.6 : 1), x: (1 - k) * 30 });
        if (i === 1) {
          const u = r.querySelector(".umb");
          u.style.background = done ? "linear-gradient(180deg,var(--primary-top),var(--primary-bottom))" : "var(--fill)";
          u.style.color = done ? "#fff" : "";
          set(u, { s: done ? 1 + 0.25 * Math.max(0, 1 - (lt - 4.25) / 0.3) : 1 });
        }
      });
      const tk = p(lt, 4.35, 0.35, E.outBack) * (1 - p(lt, 5.8, 0.3));
      s.toast.style.transform = `translateX(-50%) translateY(${((1 - tk) * -20).toFixed(1)}px)`;
      set(s.toast, { o: tk });
      s.tapper.update(lt, [{ t: 4.2, x: s.umb.cx, y: s.umb.cy }]);
      const tl = p(lt, 1.0, 0.7, E.outExpo) * (1 - exit);
      set(s.timeline, { o: tl, y: (1 - tl) * 60 });
      const pos = kf(lt, [[1.2, 0], [3.2, 95, E.inOutCubic]]);
      s.fill.style.width = `${pos.toFixed(2)}%`;
      s.today.style.left = `${pos.toFixed(2)}%`;
      s.todayLbl.style.left = `${pos.toFixed(2)}%`;
      V.text(s.todayLbl, lt > 3.2 ? "heute · noch 18 Tage" : "heute");
      s.todayLbl.style.transform = `translateX(${pos > 70 ? -92 : -50}%)`;
      s.cap.update(lt, { start: 0.3, out: 6.2 });
      s.chapter.update(lt, 6.6);
    },
  });
})();
