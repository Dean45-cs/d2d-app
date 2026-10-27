/*
 * Bausteine, die mehrere Szenen teilen: Telefon, Fingertipp, Kapitelmarke,
 * Bildunterschrift, XP-Plakette, Medaille.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp } = V;

  /* ------------------------------- Telefon --------------------------------- */

  V.statusbar = (time = "9:41") =>
    `<div class="statusbar"><span>${time}</span><span class="sb-icons">
      <span class="sb-bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:9px"></i><i style="height:12px"></i></span>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.6c2.3 0 4.4.9 6 2.4l1.1-1.2A10.3 10.3 0 0 0 8.5 1 10.3 10.3 0 0 0 1.4 3.8L2.5 5a8.6 8.6 0 0 1 6-2.4Zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.1-1.2a6.8 6.8 0 0 0-9.4 0l1.1 1.2c1-.9 2.2-1.4 3.6-1.4Zm0 3.3c.5 0 1 .2 1.3.5L8.5 11 7.2 9.7c.3-.3.8-.5 1.3-.5Z"/></svg>
      <span class="sb-batt"><i></i></span></span></div>`;

  /**
   * Ein iPhone mit Bildschirm 393 x 852. Inhalt kommt in .app (hell oder
   * dunkel). Rueckgabe: { root, screen, app }.
   */
  V.phone = (parent, { theme = "light", x = 0, y = 0, time = "9:41", cls = "" } = {}) => {
    const root = el("div", `phone ${cls}`, parent);
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    el("div", "phone-shadow", root);
    const body = el("div", "phone-body", root);
    const btns = [
      ["left:-3px;top:170px;height:34px"],
      ["left:-3px;top:230px;height:62px"],
      ["left:-3px;top:306px;height:62px"],
      ["right:-3px;top:250px;height:96px"],
    ];
    btns.forEach(([css]) => (el("div", "phone-btn", root).style.cssText = css));
    const screen = el("div", "phone-screen", body);
    const app = el("div", `app ${theme}`, screen);
    // Hinter der Statusleiste: Inhalt laeuft darunter weg wie in iOS
    const sbBg = el("div", "abs", screen);
    sbBg.style.cssText = `left:0;right:0;top:0;height:58px;z-index:79;background:linear-gradient(${theme === "dark" ? "#000" : "#f2f4f3"} 72%, transparent)`;
    screen.insertAdjacentHTML("beforeend", V.statusbar(time).replace('class="statusbar"', `class="statusbar ${theme}"`));
    el("div", "phone-island", screen);
    el("div", "phone-glare", root);
    // Statusleiste liest die Farben der App
    const sb = screen.querySelector(".statusbar");
    sb.style.color = theme === "dark" ? "#f3f6f4" : "#0b1510";
    sb.querySelectorAll(".sb-bars i, .sb-batt i").forEach((i) => (i.style.background = "currentColor"));
    return { root, screen, app, statusbar: sb };
  };

  /** Reiterleiste: [["Klinken","door"], ...], aktiv = Index. */
  V.tabbar = (items, active = 0) =>
    `<div class="tabbar glass">${items
      .map(
        ([label, icon], i) =>
          `<div class="tab ${i === active ? "on" : ""}" data-i="${i}">${
            icon === "avatar"
              ? `<span class="avatar tone-purple" style="width:28px;height:28px;font-size:11px">JC</span>`
              : V.ic(i === active ? `${icon}Fill` : icon, 24)
          }<span>${label}</span></div>`,
      )
      .join("")}</div>`;

  V.TABS = [
    ["Übersicht", "chart"],
    ["Klinken", "door"],
    ["Karte", "map"],
    ["Team", "users"],
    ["Profil", "avatar"],
  ];

  /** Lage eines Elements relativ zu einem Vorfahren (ohne Transformationen). */
  V.posIn = (node, root) => {
    let x = 0, y = 0, n = node;
    while (n && n !== root) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent;
    }
    return { x, y, w: node.offsetWidth, h: node.offsetHeight, cx: x + node.offsetWidth / 2, cy: y + node.offsetHeight / 2 };
  };

  /** Text/HTML nur setzen, wenn er sich aendert (spart Arbeit je Bild). */
  V.text = (node, value) => {
    if (node && node.__t !== value) {
      node.textContent = value;
      node.__t = value;
    }
  };
  V.html = (node, value) => {
    if (node && node.__h !== value) {
      node.innerHTML = value;
      node.__h = value;
    }
  };

  /* ------------------------------ Fingertipp ------------------------------- */

  /**
   * Ein Finger, der antippt: kommt angeflogen, drueckt (Punkt schrumpft,
   * Ring laeuft nach aussen), verschwindet. taps = [{t, x, y}] in Koordinaten
   * des Elternelements.
   */
  V.tapper = (parent) => {
    const root = el("div", "tap", parent);
    const ring = el("div", "tap-ring", root);
    const dot = el("div", "tap-dot", root);
    return {
      root,
      update(t, taps) {
        let shown = false;
        for (const tap of taps) {
          const lt = t - tap.t;
          if (lt < -0.45 || lt > 0.55) continue;
          shown = true;
          // Anflug von der vorigen Stelle (oder von unten rechts)
          const appear = p(lt, -0.45, 0.35, E.outCubic);
          const press = lt >= 0 ? 1 - p(lt, 0, 0.12, E.outQuad) * 0.25 + p(lt, 0.12, 0.2, E.outQuad) * 0.25 : 1;
          const leave = p(lt, 0.25, 0.3, E.inQuad);
          const fx = tap.x + (1 - appear) * 40;
          const fy = tap.y + (1 - appear) * 60;
          set(root, { x: fx, y: fy, o: 1 });
          set(dot, { s: (0.6 + appear * 0.4) * press * (1 - leave * 0.3), o: appear * (1 - leave) * 0.9 });
          const rk = clamp(lt / 0.5);
          set(ring, { s: 0.4 + E.outCubic(rk) * 1.4, o: lt >= 0 ? (1 - rk) * 0.85 : 0 });
        }
        if (!shown) set(root, { o: 0 });
      },
    };
  };

  /* ----------------------------- Kapitelmarke ------------------------------ */

  /**
   * Kapitel oben links: Nummer in der Pille, Name, feine Linie. Kommt mit
   * dem Schnitt, geht am Ende der Szene.
   */
  V.chapter = (parent, num, name) => {
    const root = el("div", "chapter", parent);
    const n = el("div", "chapter-num", root, num);
    const label = el("div", "chapter-name", root, name);
    const line = el("div", "chapter-line", root);
    return {
      root,
      update(t, end) {
        const a = p(t, 0.1, 0.6, E.outExpo);
        const out = end ? p(t, end - 0.35, 0.35, E.inCubic) : 0;
        set(n, { s: 0.6 + a * 0.4, o: a * (1 - out) });
        set(label, { x: (1 - a) * -30, o: a * (1 - out), blur: (1 - a) * 8 });
        set(line, { sx: p(t, 0.3, 0.9, E.outExpo), o: 1 - out });
      },
    };
  };

  /**
   * Bildunterschrift: Kicker, Titel (zwei Zeilen), Lesetext. Woerter kommen
   * gestaffelt. lines: [{eyebrow, title:[...], lede}]
   */
  V.caption = (parent, { x, y, w = 640, eyebrow, title, lede, align = "left", size = "t-l", accentWords = [] }) => {
    const root = el("div", "abs", parent);
    root.style.cssText += `left:${x}px;top:${y}px;width:${w}px;text-align:${align}`;
    const parts = {};
    if (eyebrow) {
      const e = el("div", "eyebrow", root);
      e.style.marginBottom = "22px";
      parts.eyebrow = V.split(e, eyebrow, "word");
    }
    parts.title = [];
    title.forEach((line) => {
      const l = el("div", `display ${size}`, root);
      l.style.paddingBottom = "6px";
      const ws = V.split(l, line, "word");
      ws.forEach((w) => {
        if (accentWords.some((a) => w.textContent.replace(/[.,!?]/g, "") === a)) w.classList.add("glow-text");
      });
      parts.title.push(...ws);
    });
    if (lede) {
      const d = el("div", "lede", root);
      d.style.marginTop = "26px";
      parts.lede = V.split(d, lede, "word");
    }
    return {
      root,
      update(t, { start = 0, out = null } = {}) {
        if (parts.eyebrow) V.stagger(parts.eyebrow, t, start, { each: 0.03, dy: 20, blur: 6, out });
        V.stagger(parts.title, t, start + 0.08, { each: 0.06, dy: 70, blur: 18, dur: 0.9, out });
        if (parts.lede) V.stagger(parts.lede, t, start + 0.35, { each: 0.018, dy: 24, blur: 8, dur: 0.7, out });
      },
    };
  };

  /** Push-Nachricht wie auf dem iPhone (oben im Bildschirm). */
  V.pushBanner = (parent, { title, body, when = "jetzt", dark = false }) => {
    const node = el(
      "div",
      "abs",
      parent,
      `<div style="display:flex;gap:12px;padding:12px 14px;border-radius:22px;background:${dark ? "rgb(40 44 42/.82)" : "rgb(245 247 246/.86)"};backdrop-filter:blur(24px) saturate(180%);box-shadow:0 12px 32px rgb(0 0 0/.28), inset 0 0 0 .5px rgb(255 255 255/.5);color:${dark ? "#f3f6f4" : "#0b1510"}">
        <span style="flex-shrink:0;border-radius:9px;overflow:hidden;width:38px;height:38px">${V.logoMark(38)}</span>
        <span style="flex:1;min-width:0;font-size:14px;line-height:18px"><span style="display:flex;justify-content:space-between"><b style="font-weight:600">${title}</b><span style="opacity:.55;font-size:13px">${when}</span></span><span style="display:block;opacity:.85">${body}</span></span>
      </div>`,
    );
    node.style.cssText += "left:9px;right:9px;top:8px;z-index:100";
    return node;
  };

  /**
   * Konfetti: deterministisch aus Saat und Zeit seit dem Ausbruch. Zeichnet
   * in einen 2D-Kontext; Teilchen fliegen mit Luftwiderstand und flattern.
   */
  V.confetti = (seed, count, { x0, y0, spread = 75, vMin = 900, vMax = 2300, colors } = {}) => {
    const rnd = V.rng(seed);
    const palette = colors || ["#30d158", "#46e38e", "#b8ffd2", "#ffffff", "#3987e5", "#eda100", "#e87ba4", "#f1c44d"];
    const parts = Array.from({ length: count }, () => {
      const a = ((-90 + (rnd() * 2 - 1) * spread) * Math.PI) / 180;
      const v = vMin + rnd() * (vMax - vMin);
      return {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        k: 1.8 + rnd() * 1.4,
        w: 8 + rnd() * 10,
        h: 12 + rnd() * 16,
        spin: (rnd() * 2 - 1) * 9,
        flip: 4 + rnd() * 8,
        ph: rnd() * 6.28,
        c: palette[Math.floor(rnd() * palette.length)],
        round: rnd() < 0.25,
      };
    });
    return (ctx, t, life = 3.6) => {
      if (t <= 0 || t > life) return;
      const g = 1700;
      for (const q of parts) {
        const e = 1 - Math.exp(-q.k * t);
        const x = x0 + (q.vx / q.k) * e + Math.sin(t * 3 + q.ph) * 26 * Math.min(1, t);
        const y = y0 + (g / q.k) * t + ((q.vy - g / q.k) / q.k) * e;
        const fade = 1 - V.clamp((t - (life - 0.8)) / 0.8);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(x, y);
        ctx.rotate(q.ph + q.spin * t);
        ctx.scale(1, Math.cos(q.ph + q.flip * t));
        ctx.fillStyle = q.c;
        if (q.round) {
          ctx.beginPath();
          ctx.arc(0, 0, q.w * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        ctx.restore();
      }
    };
  };

  /* ------------------------------ Plaketten ------------------------------- */

  V.xpPop = (parent, text) => {
    const node = el("div", "xp-pop", parent, text);
    return {
      node,
      update(t, start, { x, y, dur = 1.4 }) {
        const lt = t - start;
        if (lt < 0 || lt > dur) return set(node, { o: 0 });
        const a = E.outBack(clamp(lt / 0.45), 2.2);
        const out = p(lt, dur - 0.3, 0.3, E.inCubic);
        set(node, { x: x, y: y - lt * 40 - out * 40, s: 0.3 + a * 0.7, o: Math.min(1, lt / 0.12) * (1 - out) });
      },
    };
  };

  const METALS = {
    bronze: { light: "#f3c79d", base: "#c27a45", deep: "#7f4520", ink: "#4f260c" },
    silver: { light: "#ffffff", base: "#c9ced6", deep: "#7e8796", ink: "#3b414b" },
    gold: { light: "#fff3bf", base: "#f1c44d", deep: "#a8760a", ink: "#5c3d00" },
    platinum: { light: "#f4f2ff", base: "#b4b4dc", deep: "#5d5f96", ink: "#25264f" },
    diamond: { light: "#effcff", base: "#8fdcf2", deep: "#2f8fbf", ink: "#0a3d5c" },
  };
  V.METALS = METALS;
  let medalId = 0;
  /** Medaille wie src/components/levels/Medal.tsx. */
  V.medal = (tier, size, icon) => {
    const m = METALS[tier];
    const id = `md${medalId++}`;
    const beaded = ["gold", "platinum", "diamond"].includes(tier);
    return `<span class="medal" style="width:${size}px;height:${size}px;color:${m.ink}">
<svg class="face" viewBox="0 0 100 100" width="${size}" height="${size}"><defs>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.light}"/><stop offset=".5" stop-color="${m.base}"/><stop offset="1" stop-color="${m.deep}"/></linearGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.deep}"/><stop offset="1" stop-color="${m.light}"/></linearGradient>
<radialGradient id="${id}f" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="${m.light}"/><stop offset=".55" stop-color="${m.base}"/><stop offset="1" stop-color="${m.deep}"/></radialGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset=".1" stop-color="#fff" stop-opacity=".55"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<circle cx="50" cy="50" r="48" fill="url(#${id}r)"/>
${beaded ? '<circle cx="50" cy="50" r="44.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0 6.99"/>' : ""}
<circle cx="50" cy="50" r="41" fill="url(#${id}b)"/><circle cx="50" cy="50" r="38.5" fill="url(#${id}f)"/>
${tier === "diamond" ? '<g stroke="#fff" stroke-opacity=".28" stroke-width=".8"><path d="M50 11.5v77M11.5 50h77M22.8 22.8l54.4 54.4M77.2 22.8 22.8 77.2"/><circle cx="50" cy="50" r="24" fill="none"/></g>' : ""}
<circle cx="50" cy="50" r="38.5" fill="url(#${id}s)"/>
${tier === "diamond" ? '<path d="M80 9.5c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5Z" fill="#fff"/>' : ""}
</svg>${icon ? V.ic(icon, Math.round(size * 0.4), "", 2) : ""}</span>`;
  };

  V.avatar = (initials, tone, size = 40) =>
    `<span class="avatar tone-${tone}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${initials}</span>`;

  /** Zeichen eines Ablehnungsgrunds auf seiner Kachel (ReasonTile). */
  V.reasonTile = (icon, tone, size = 48) =>
    `<span class="tile tone-${tone}" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.27)}px">${V.ic(icon, Math.round(size * 0.58))}</span>`;
})();
