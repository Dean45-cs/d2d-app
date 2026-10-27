/*
 * Kapitel 02 · Klinken: Haus antippen -> vier Ergebnisse -> "Nicht da" im
 * Takt -> Ablehnungsgrund mit einem Tipp -> Mehrfamilienhaus -> In meiner Naehe.
 * Eine durchgehende Szene mit einem Telefon, damit nichts springt.
 */
(function () {
  const V = window.V;
  const { el, set, p, kf, E, clamp, lerp, T } = V;

  const PX = 300;
  const PY = 166;

  const REASONS = [
    ["Zufrieden mit Anbieter", "smile", "teal"],
    ["Kein Interesse", "hand", "slate"],
    ["Keine Zeit", "stopwatch", "indigo"],
    ["Muss mit Partner sprechen", "couple", "purple"],
    ["Vertrag läuft noch", "contract", "blue"],
    ["Gerade gewechselt", "switch", "teal"],
    ["Sieht keine Ersparnis", "euro", "brown"],
    ["Keine Haustürgeschäfte", "door-slash", "slate"],
    ["Unterlagen fehlen", "document", "blue"],
    ["Mieter / entscheidet nicht", "key", "brown"],
    ["Schlechte Erfahrung", "frown", "magenta"],
    ["Sprachbarriere", "speech", "indigo"],
    ["Sonstiges", "pencil", "slate"],
  ];
  const PICK = 4; // Vertrag laeuft noch

  const OUTCOMES = [
    { icon: "door", label: "Nicht da", xp: 5, desc: "Sofort gespeichert. Jeder Versuch zählt – „3×“." },
    { icon: "chat", label: "Ohne Abschluss", xp: 15, desc: "Gesprochen, kein Vertrag: Grund mit einem Tipp." },
    { icon: "calendar", label: "Termin", xp: 40, desc: "Uhrzeit, Name, Rufnummer – morgen oben auf der Tour." },
    { icon: "external", label: "Auftrag starten", xp: 100, desc: "Öffnet den Tarifrechner des Partners.", primary: true },
  ];

  const BELLS = [
    ["Müller", "EG"],
    ["Kaya", "EG"],
    ["Schmidt", "1. OG"],
    ["Becker", "1. OG"],
    ["Weber", "2. OG"],
    ["Wagner", "2. OG"],
  ];

  // Zeitpunkte (relativ zum Szenenstart)
  const K = {
    selRow3: 1.8,
    cards: 3.5,
    cardsBack: 7.5,
    notHome3: 8.8,
    selRow1: 9.8,
    notHome1: 10.3,
    scroll1: 11.6,
    selRow7: 12.6,
    met: 13.2,
    tilesOut: 14.2,
    pick: 16.4,
    picked: 17.4,
    scroll2: 18.4,
    selRow12: 19.4,
    selBell: 21.4,
    notHomeBell: 22.0,
    back: 24.0,
    nearby: 25.6,
    exit: 31.9,
  };

  V.scene({
    id: "klinken",
    start: T.klinken,
    dur: T.termine - T.klinken,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:700px 540px";
      const ph = V.phone(cam, { x: PX, y: PY });
      const scr = V.screens.klinken(ph.app);
      const app = ph.app;
      const screen = ph.screen;

      // Ergaenzungen im Telefon: Toast, Blatt mit Gruenden, Mehrfamilienhaus, Naehe-Hinweis
      const toast = el(
        "div",
        "toast glass-strong",
        app,
        `<span class="glyph-result" style="width:28px;height:28px">${V.ic("check", 16)}</span><span data-k="toast">Gespeichert</span><span class="acc" style="margin-left:6px">Rückgängig</span>`,
      );
      toast.style.top = "62px";
      toast.style.transform = "translateX(-50%)";
      const scrim = el("div", "scrim", app);
      const sheet = el(
        "div",
        "sheet",
        app,
        `<div class="grabber"></div>
        <div style="padding:10px 16px 0;display:flex;align-items:flex-start;justify-content:space-between">
          <div><div class="a-title3" style="font-weight:700">Gespräch ohne Abschluss</div><div class="a-foot muted">Bahnhofstraße 7</div></div>
          <span class="door-glyph" style="width:30px;height:30px">${V.ic("x", 14)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 12px 30px">
          ${REASONS.map(
            ([label, icon, tone], i) =>
              `<div class="surface reason" data-i="${i}" style="display:flex;align-items:center;gap:9px;min-height:52px;padding:6px 10px;border-radius:14px;font-size:14px;font-weight:600;line-height:17px">${V.reasonTile(icon, tone, 32)}<span>${label}</span></div>`,
          ).join("")}
        </div>`,
      );
      const mfh = el(
        "div",
        "abs",
        app,
        `<div class="pad" style="padding-top:60px">
          <div style="display:flex;justify-content:space-between;align-items:center" class="acc a-head"><span style="display:flex;align-items:center;gap:2px">${V.ic("chevronLeft", 20)}Bahnhofstraße</span><span style="display:flex;align-items:center;gap:6px">${V.ic("pencil", 18)}Bearbeiten</span></div>
          <div class="a-large" style="margin-top:12px">Nr. 12</div>
          <div class="a-sub ink2">Mehrfamilienhaus · 6 Klingeln</div>
          <div class="surface door-table" style="margin-top:14px">
            <div class="door-head"><span style="width:78px;text-align:center">Nr.</span><span style="flex:1">Klingel</span><span style="text-transform:none;letter-spacing:0" data-k="bellopen">6 von 6 offen</span></div>
            ${BELLS.map(
              ([name, floor], i) => `<div class="door-row bell" data-i="${i}"><span class="door-lead">${i + 1}</span><span class="door-txt"><b>${name} · ${floor}</b><span data-k="bst">Noch nicht besucht</span></span><span class="bglyph" style="width:30px"></span></div>`,
            ).join("")}
          </div>
        </div>`,
      );
      mfh.style.cssText = "left:0;top:0;right:0;bottom:0;background:var(--bg);z-index:50";
      const near = el(
        "div",
        "abs glass-strong",
        app,
        `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <span class="glyph-result" style="width:34px;height:34px">${V.ic("crosshair", 19)}</span>
          <span style="flex:1"><b class="a-sub" style="display:block;font-weight:600">Nächste offene Tür · 80 m</b><span class="a-foot ink2">Lindenweg 14 · Innenstadt Nord</span></span>
          <span class="pill" style="height:32px;font-size:14px;background:color-mix(in srgb,var(--accent-vivid) 16%,transparent);color:var(--accent-ink)">${V.ic("navigate", 15)}Route</span>
        </div>`,
      );
      near.style.cssText += "left:10px;right:10px;top:232px;border-radius:20px;z-index:52";

      // Lindenweg: wohin "In meiner Naehe" springt
      const rowsBox = V.$(app, ".door-rows");
      const linden = el(
        "div",
        "door-rows",
        rowsBox.parentNode,
        [
          { n: "8", st: "Nicht angetroffen · 1×", who: "Sina · 20.10. 17:40", g: "door" },
          { n: "10", st: "Kein Interesse", who: "Alex · 18.10. 18:02", g: "hand" },
          { n: "12", st: "Termin vereinbart", who: "Sina · Fr 19:30", g: "calendar" },
          { n: "14", st: "Noch nicht besucht", who: "", g: null },
          { n: "16", st: "Noch nicht besucht", who: "", g: null },
          { n: "18", st: "Abschluss am 02.10.2026", who: "Jonas · 02.10. 18:15", g: "check", sale: true },
        ]
          .map(V.screens.doorRow)
          .join(""),
      );
      linden.style.cssText = "position:absolute;left:0;right:0;top:40px;background:var(--surface)";
      const title = V.$(app, ".a-large");

      const tapper = V.tapper(screen);
      tapper.root.style.zIndex = "120";

      // Lagen im Telefon (vor jeder Bewegung gemessen)
      const rowPos = Object.fromEntries(scr.rows.map((r) => [r.dataset.n, V.posIn(r, screen)]));
      const btnPos = Object.fromEntries(["nothome", "met", "appt", "sale"].map((b) => [b, V.posIn(scr.btn(b), screen)]));
      const reasonPos = V.$$(sheet, ".reason").map((r) => V.posIn(r, screen));
      const bellRows = V.$$(mfh, ".bell");
      const bellPos = bellRows.map((r) => V.posIn(r, screen));
      const crossPos = V.posIn(V.$$(app, ".door-glyph")[3], screen);

      /* ------------------------- Buehne rechts ------------------------- */
      const chapter = V.chapter(root, "02", "Klinken");
      const capA = V.caption(root, {
        x: 900, y: 330, w: 900,
        eyebrow: "An der Tür",
        title: ["Haus antippen.", "Ergebnis tippen."],
        accentWords: ["Ergebnis"],
        lede: "Die Häuser der Straße stehen als Liste – mit Stand, wer zuletzt da war und wann. Eine Hand reicht.",
      });
      const head = V.caption(root, {
        x: 900, y: 120, w: 900, size: "t-m",
        eyebrow: "Die vier Ergebnisse",
        title: ["Ein Daumen. Vier Tasten."],
        accentWords: ["Daumen."],
      });
      const cards = OUTCOMES.map((o, i) => {
        const c = el(
          "div",
          "abs stage-glass",
          root,
          `<div style="padding:26px 28px;height:100%;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="width:72px;height:72px;border-radius:22px;display:flex;align-items:center;justify-content:center;color:#fff;${o.primary ? "background:linear-gradient(180deg,#16884a,#0d6634);box-shadow:0 10px 30px rgb(22 136 74/.6)" : "background:rgb(255 255 255/.1)"}">${V.ic(o.icon, 36)}</span>
              <span style="font:800 24px Inter;color:#062611;background:linear-gradient(180deg,#5cf09c,#2fd161);padding:6px 14px;border-radius:999px">+${o.xp} XP</span>
            </div>
            <div class="display" style="font-size:40px;margin-top:20px">${o.label}</div>
            <div class="lede" style="font-size:22px;line-height:1.35;margin-top:8px">${o.desc}</div>
          </div>`,
        );
        c.style.cssText += `left:${900 + (i % 2) * 465}px;top:${300 + Math.floor(i / 2) * 290}px;width:440px;height:265px`;
        return c;
      });
      const capC = V.caption(root, {
        x: 900, y: 300, w: 900,
        eyebrow: "Nicht angetroffen",
        title: ["Tippen. Fertig.", "Nichts springt."],
        accentWords: ["Fertig."],
        lede: "Die Tür bleibt gewählt, die Zeile zeigt sofort den neuen Stand. Vertippt? Rückgängig – bis 15 Minuten.",
      });
      const offline = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="display:flex;align-items:center;gap:18px;padding:18px 26px 18px 18px">
          <span style="width:56px;height:56px;border-radius:18px;background:rgb(255 255 255/.1);display:flex;align-items:center;justify-content:center;color:#fff">${V.ic("offline", 30)}</span>
          <span><b style="display:block;font:700 26px Inter;color:#fff">Kein Empfang im Treppenhaus?</b><span style="font:500 21px Inter;color:#a3aca7">Wird gespeichert und später nachgereicht.</span></span>
        </div>`,
      );
      offline.style.cssText += "left:900px;top:760px";
      const capD = V.caption(root, {
        x: 900, y: 110, w: 920, size: "t-m",
        eyebrow: "Ohne Abschluss",
        title: ["Ablehnungsgrund? Ein Tipp."],
        accentWords: ["Tipp."],
        lede: "Kacheln statt Freitext – welche Gründe es gibt, legt die Teamleitung fest.",
      });
      const tiles = REASONS.map(([label, icon, tone], i) => {
        const t = el(
          "div",
          "abs stage-glass",
          root,
          `<div style="display:flex;align-items:center;gap:16px;padding:0 18px;height:100%">${V.reasonTile(icon, tone, 52)}<span style="font:600 22px Inter;line-height:1.2;color:#f3f6f4">${label}</span></div>`,
        );
        t.style.cssText += `left:${900 + (i % 3) * 312}px;top:${370 + Math.floor(i / 3) * 106}px;width:296px;height:92px;border-radius:24px`;
        return t;
      });
      const capE = V.caption(root, {
        x: 900, y: 300, w: 560, size: "t-m",
        eyebrow: "Mehrfamilienhaus",
        title: ["Jede Klingel", "zählt."],
        accentWords: ["zählt."],
        lede: "Klingelschilder einmal abtippen – oder „6 Klingeln ohne Namen“. Das Haus öffnet sich wie ein Ordner.",
      });
      const panel = el(
        "div",
        "abs",
        root,
        `<div style="width:380px;padding:30px 28px 34px;border-radius:26px;background:linear-gradient(135deg,#d9dedb 0%,#9aa39e 30%,#c7ccc9 55%,#7d8681 100%);box-shadow:inset 0 2px 1px rgb(255 255 255/.7),inset 0 -3px 6px rgb(0 0 0/.25),0 40px 80px -20px rgb(0 0 0/.8)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><span style="font:800 46px Inter;color:#2b322e;text-shadow:0 1px 0 rgb(255 255 255/.6)">12</span><span style="width:54px;height:40px;border-radius:8px;background:repeating-linear-gradient(90deg,#4a524e 0 3px,#8a938e 3px 6px);opacity:.7"></span></div>
          ${BELLS.map(
            ([name, floor]) => `<div class="plate" style="display:flex;align-items:center;gap:14px;margin-top:12px">
              <span style="flex:1;height:50px;border-radius:8px;background:linear-gradient(180deg,#fbfbf7,#e6e6df);box-shadow:inset 0 1px 3px rgb(0 0 0/.35);display:flex;align-items:center;padding:0 16px;font:600 22px Inter;color:#262b28">${name}<span style="margin-left:auto;font:500 16px Inter;color:#6a716d">${floor}</span></span>
              <span class="bellbtn" style="width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f4f6f5,#9aa29e 70%);box-shadow:inset 0 -2px 4px rgb(0 0 0/.3),0 2px 4px rgb(0 0 0/.3)"></span></div>`,
          ).join("")}
        </div>`,
      );
      panel.style.cssText += "left:1440px;top:150px";
      const capF = V.caption(root, {
        x: 900, y: 110, w: 920, size: "t-m",
        eyebrow: "In meiner Nähe",
        title: ["Wo geht’s weiter?"],
        lede: "Ein Tipp aufs Fadenkreuz wählt die nächste offene Tür – über alle deine Gebiete, mit Entfernung und Fußweg. Gerechnet auf dem Gerät.",
      });
      // kleine Karte mit Standort
      const mini = el(
        "div",
        "abs",
        root,
        `<div style="width:640px;height:520px;border-radius:40px;overflow:hidden;position:relative;background:radial-gradient(circle at 40% 55%,#14241c,#070d0a);box-shadow:inset 0 0 0 1px rgb(255 255 255/.12),0 40px 90px -30px rgb(0 0 0/.9)">
          <svg width="640" height="520" viewBox="0 0 640 520" style="position:absolute;inset:0">
            <g stroke="#2b3b33" stroke-width="14" fill="none" stroke-linecap="round">
              <path d="M-20 140 C200 120 420 160 660 120"/><path d="M-20 330 C220 300 420 350 660 320"/>
              <path d="M150 -20 C170 200 140 360 170 540"/><path d="M420 -20 C400 180 450 360 430 540"/>
            </g>
            <g font-family="Inter" font-size="15" font-weight="600" fill="#7f958a"><text x="470" y="108">Lindenweg</text><text x="40" y="318">Bahnhofstraße</text></g>
            <path class="mroute" d="M240 330 L300 318 L360 312 L420 300 L428 230 L432 150" pathLength="1" fill="none" stroke="#46e38e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 1" style="filter:drop-shadow(0 0 8px #46e38e)"/>
            ${[[90, 150], [210, 128], [300, 140], [520, 118], [580, 128], [60, 340], [120, 345], [330, 340], [520, 330], [600, 318], [180, 250], [190, 420], [410, 420], [455, 470]]
              .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#0b1510" stroke="#cfd8d3" stroke-width="3"/>`)
              .join("")}
            <circle class="target" cx="432" cy="150" r="13" fill="#30d158" stroke="#eafff2" stroke-width="3"/>
            <circle class="acc" cx="240" cy="330" r="60" fill="rgb(70 150 255/.15)" stroke="rgb(120 180 255/.5)" stroke-width="2"/>
            <circle class="pulse" cx="240" cy="330" r="16" fill="none" stroke="#6fb2ff" stroke-width="3"/>
            <circle cx="240" cy="330" r="11" fill="#2f86ff" stroke="#fff" stroke-width="4"/>
          </svg>
          <div class="mlabel" style="position:absolute;left:300px;top:70px;padding:10px 18px;border-radius:999px;background:rgb(8 14 11/.85);box-shadow:inset 0 0 0 1.5px #46e38e;font:700 22px Inter;color:#fff;white-space:nowrap">Lindenweg 14 · <span style="color:#5cf09c">80 m</span></div>
        </div>`,
      );
      mini.style.cssText += "left:1000px;top:400px";

      const xps = [V.xpPop(root, "+5 XP"), V.xpPop(root, "+5 XP"), V.xpPop(root, "+15 XP"), V.xpPop(root, "+5 XP")];

      return {
        cam, ph, scr, app, screen, toast, toastTxt: V.$(toast, '[data-k="toast"]'), scrim, sheet,
        reasons: V.$$(sheet, ".reason"), mfh, linden, lindenRows: V.$$(linden, ".door-row"), title, bellRows, bellOpen: V.$(mfh, '[data-k="bellopen"]'), near, tapper,
        rowPos, btnPos, reasonPos, bellPos, crossPos,
        chapter, capA, head, cards, capC, offline, capD, tiles, capE, panel, plates: V.$$(panel, ".plate"), bellBtns: V.$$(panel, ".bellbtn"),
        capF, mini, mroute: V.$(mini, ".mroute"), pulse: V.$(mini, ".pulse"), mlabel: V.$(mini, ".mlabel"), target: V.$(mini, ".target"),
        xps,
      };
    },
    cues(start) {
      const c = (t, k, x) => V.cue(start + t, k, x);
      c(0.0, "whoosh-in");
      c(K.selRow3, "tap");
      OUTCOMES.forEach((_, i) => c(K.cards + i * 0.4, "pop", { n: i }));
      c(K.cardsBack, "swoosh-back");
      c(K.notHome3, "tap"); c(K.notHome3 + 0.08, "xp");
      c(K.selRow1, "tap");
      c(K.notHome1, "tap"); c(K.notHome1 + 0.08, "xp");
      c(K.selRow7, "tap");
      c(K.met, "tap"); c(K.met + 0.2, "sheet");
      REASONS.forEach((_, i) => i % 3 === 0 && c(K.tilesOut + i * 0.06, "tick"));
      c(K.pick, "tap"); c(K.picked, "xp");
      c(K.selRow12, "tap"); c(K.selRow12 + 0.15, "folder");
      c(K.selBell, "tap"); c(K.notHomeBell, "tap"); c(K.notHomeBell + 0.08, "xp");
      c(K.back, "tap");
      c(K.nearby, "tap"); c(K.nearby + 0.2, "locate");
      c(K.exit + 0.6, "whoosh");
    },
    update(lt, s) {
      const ph = s.ph;
      /* ------------------------------ Telefon ------------------------------ */
      const enter = p(lt, 0, 1.3, E.outExpo);
      const exit = p(lt, K.exit, 1.2, E.inExpo);
      set(ph.root, {
        x: lerp(-300, 0, enter) - exit * 900,
        y: Math.sin(lt * 0.8) * 6,
        z: lerp(-600, 0, enter),
        ry: lerp(40, 12, enter) + Math.sin(lt * 0.5) * 2.5 - exit * 30,
        rx: 3 + Math.sin(lt * 0.6) * 1.5,
        s: 0.93,
        o: 1,
      });
      set(s.cam, { s: 1 + lt * 0.003, blur: exit * 12, o: 1 - p(lt, K.exit + 0.6, 0.5) });

      // Liste verschieben (Scrollen)
      const scroll = -kf(lt, [[0, 0], [K.scroll1, 0], [K.scroll1 + 0.6, 180, E.inOutCubic], [K.scroll2, 180], [K.scroll2 + 0.7, 470, E.inOutCubic], [K.back + 0.4, 470], [K.back + 1.1, 0, E.inOutCubic]]);
      s.scr.scroll.style.transform = `translateY(${scroll.toFixed(1)}px)`;

      // Gewaehlte Tuer
      const sel = lt < K.selRow3 ? null : lt < K.selRow1 ? "3" : lt < K.selRow7 ? "1" : lt < K.selRow12 ? "7" : "12";
      s.scr.rows.forEach((r) => {
        const on = r.dataset.n === sel;
        r.classList.toggle("sel", on);
        r.querySelector(".door-lead").classList.toggle("on", on);
      });
      // Stand der Zeilen
      const row = (n) => s.scr.row(n);
      const setRow = (n, st, who, glyph) => {
        const r = row(n);
        V.text(r.querySelector("b"), st);
        const sp = r.querySelector(".door-txt span");
        if (sp) V.text(sp, who);
        V.html(r.lastElementChild, glyph);
        r.lastElementChild.className = glyph ? "door-glyph" : "";
      };
      const now = "Jonas · gerade eben";
      if (lt >= K.notHome3) setRow("3", "Nicht angetroffen · 1×", now, V.ic("door", 17));
      else setRow("3", "Noch nicht besucht", "", "");
      if (lt >= K.notHome1) setRow("1", "Nicht angetroffen · 3×", now, V.ic("door", 17));
      else setRow("1", "Nicht angetroffen · 2×", "Alex · 19.10. 12:19", V.ic("door", 17));
      if (lt >= K.picked) setRow("7", "Vertrag läuft noch", now, V.ic("contract", 17));
      else setRow("7", "Noch nicht besucht", "", "");
      // jede geaenderte Zeile blitzt kurz gruen
      [["3", K.notHome3], ["1", K.notHome1], ["7", K.picked]].forEach(([n, at]) => {
        const k = lt - at;
        const r = row(n);
        r.style.boxShadow = k > 0 && k < 0.6 ? `inset 0 0 0 999px rgb(48 209 88/${(0.35 * (1 - k / 0.6)).toFixed(3)})` : "";
      });
      // Tuerzaehler und Tagesziel
      const doors = 7 + (lt >= K.notHome3) + (lt >= K.notHome1) + (lt >= K.picked) + (lt >= K.notHomeBell);
      V.text(s.scr.k.today, String(doors));
      V.$(s.app, ".ring-goal").setAttribute("stroke-dashoffset", (56.5 * (1 - doors / 20)).toFixed(2));
      V.text(s.scr.k.open, `${12 - (lt >= K.notHome3) - (lt >= K.picked)} von 24 offen`);

      // Ergebnisleiste: worauf sie sich bezieht
      let tray = ["3", "Bahnhofstraße 3", "Noch nicht besucht"];
      if (lt >= K.selRow3) tray = ["3", "Bahnhofstraße 3", lt >= K.notHome3 ? "Nicht angetroffen · 1×" : "Noch nicht besucht"];
      if (lt >= K.selRow1) tray = ["1", "Bahnhofstraße 1", lt >= K.notHome1 ? "Nicht angetroffen · 3×" : "Nicht angetroffen · 2×"];
      if (lt >= K.selRow7) tray = ["7", "Bahnhofstraße 7", lt >= K.picked ? "Vertrag läuft noch" : "Noch nicht besucht"];
      if (lt >= K.selRow12) tray = ["12", "Bahnhofstraße 12", "Mehrfamilienhaus · Klingel wählen"];
      if (lt >= K.selBell) tray = ["2", "Kaya · EG", lt >= K.notHomeBell ? "Nr. 12 · Nicht angetroffen · 1×" : "Nr. 12 · Noch nicht besucht"];
      if (lt >= K.back + 0.2) tray = ["12", "Bahnhofstraße 12", "Mehrfamilienhaus · 5 von 6 offen"];
      if (lt >= K.nearby) tray = ["14", "Lindenweg 14", "Noch nicht besucht · 80 m entfernt"];
      V.text(s.scr.k["tray-n"], tray[0]);
      V.text(s.scr.k["tray-title"], tray[1]);
      V.text(s.scr.k["tray-meta"], tray[2]);
      const trayVisible = lt < K.selRow3 - 0.2 ? 0 : 1;
      set(s.scr.tray, { y: (1 - p(lt, K.selRow3 - 0.1, 0.5, E.appSpring)) * 260, o: trayVisible || p(lt, K.selRow3 - 0.1, 0.2) });

      // Knopfdruck sichtbar machen
      const pressed = [["nothome", K.notHome3], ["nothome", K.notHome1], ["met", K.met], ["nothome", K.notHomeBell]];
      ["nothome", "met", "appt", "sale"].forEach((b) => {
        const hit = pressed.some(([bb, at]) => bb === b && lt > at - 0.02 && lt < at + 0.14);
        set(s.scr.btn(b), { s: hit ? 0.95 : 1 });
      });
      // Karten fliegen aus der Leiste: Knopf leuchtet
      ["nothome", "met", "appt", "sale"].forEach((b, i) => {
        const at = K.cards + i * 0.4;
        const k = lt - at;
        s.scr.btn(b).style.outline = k > -0.15 && k < 0.4 ? "3px solid rgb(48 209 88/.8)" : "none";
      });

      // Toast
      const toasts = [[K.notHome3, "Nicht da · Nr. 3"], [K.notHome1, "Nicht da · Nr. 1"], [K.picked, "Vertrag läuft noch · Nr. 7"], [K.notHomeBell, "Nicht da · Kaya"]];
      let tk = 0;
      let tt = "";
      for (const [at, txt] of toasts) {
        const k = lt - at;
        if (k >= 0 && k < 1.5) {
          tk = Math.min(p(k, 0, 0.3, E.outBack), 1 - p(k, 1.2, 0.3));
          tt = txt;
        }
      }
      V.text(s.toastTxt, tt);
      s.toast.style.transform = `translateX(-50%) translateY(${((1 - tk) * 20).toFixed(1)}px) scale(${(0.9 + tk * 0.1).toFixed(3)})`;
      set(s.toast, { o: tk });

      // Blatt mit Gruenden
      const sh = p(lt, K.met + 0.15, 0.5, E.appSpring) * (1 - p(lt, K.picked - 0.3, 0.45, E.inCubic));
      s.sheet.style.transform = `translateY(${((1 - sh) * 700).toFixed(1)}px)`;
      set(s.scrim, { o: sh });
      s.reasons.forEach((r, i) => {
        const away = p(lt, K.tilesOut + i * 0.06, 0.25);
        const on = i === PICK && lt > K.pick + 0.6;
        r.style.outline = on ? "3px solid var(--accent)" : "none";
        set(r, { o: on ? 1 : 1 - away * 0.85 });
      });

      // Mehrfamilienhaus oeffnet sich wie ein Ordner
      const open = p(lt, K.selRow12 + 0.1, 0.55, E.appSpring) * (1 - p(lt, K.back + 0.05, 0.5, E.appSpring));
      s.mfh.style.transform = `translateX(${((1 - open) * 393).toFixed(1)}px)`;
      set(s.mfh, { o: open > 0.001 ? 1 : 0 });
      s.scr.scroll.style.opacity = (1 - open * 0.6).toFixed(3);
      s.bellRows.forEach((r, i) => {
        const k = p(lt, K.selRow12 + 0.35 + i * 0.12, 0.4, E.outCubic);
        set(r, { o: k, x: (1 - k) * 30 });
        const on = i === 1 && lt >= K.selBell;
        r.classList.toggle("sel", on);
        r.querySelector(".door-lead").classList.toggle("on", on);
        if (i === 1) {
          V.text(r.querySelector('[data-k="bst"]'), lt >= K.notHomeBell ? "Nicht angetroffen · gerade eben" : "Noch nicht besucht");
          V.html(r.querySelector(".bglyph"), lt >= K.notHomeBell ? `<span class="door-glyph">${V.ic("door", 17)}</span>` : "");
        }
      });
      V.text(s.bellOpen, lt >= K.notHomeBell ? "5 von 6 offen" : "6 von 6 offen");

      // In meiner Naehe: Strasse wechselt zum Lindenweg, Nr. 14 gewaehlt
      const sw = p(lt, K.nearby + 0.25, 0.45, E.outCubic);
      V.text(s.title, lt >= K.nearby + 0.25 ? "Lindenweg" : "Bahnhofstraße");
      set(s.linden, { o: sw, x: (1 - sw) * 40 });
      s.lindenRows.forEach((r) => {
        const on = r.dataset.n === "14" && lt >= K.nearby + 0.25;
        r.classList.toggle("sel", on);
        r.querySelector(".door-lead").classList.toggle("on", on);
      });
      // Naehe-Hinweis
      const nk = p(lt, K.nearby + 0.2, 0.5, E.outBack) * (1 - p(lt, K.exit, 0.3));
      set(s.near, { y: (1 - nk) * -30, o: nk, s: 0.95 + nk * 0.05 });

      /* ----------------------------- Fingertipps ---------------------------- */
      const rp = (n) => ({ x: s.rowPos[n].x + 40, y: s.rowPos[n].cy + scroll });
      const bp = (b) => ({ x: s.btnPos[b].cx, y: s.btnPos[b].cy });
      s.tapper.update(lt, [
        { t: K.selRow3, ...rp("3") },
        { t: K.notHome3, ...bp("nothome") },
        { t: K.selRow1, ...rp("1") },
        { t: K.notHome1, ...bp("nothome") },
        { t: K.selRow7, ...rp("7") },
        { t: K.met, ...bp("met") },
        { t: K.selRow12, ...rp("12") },
        { t: K.selBell, x: s.bellPos[1].x + 40, y: s.bellPos[1].cy },
        { t: K.notHomeBell, ...bp("nothome") },
        { t: K.back, x: 70, y: 72 },
        { t: K.nearby, x: s.crossPos.cx, y: s.crossPos.cy },
      ]);

      /* ------------------------------- Buehne ------------------------------- */
      s.chapter.update(lt, K.exit + 0.6);
      s.capA.update(lt, { start: 0.5, out: 3.0 });
      s.head.update(lt, { start: 3.25, out: 7.3 });
      s.cards.forEach((c, i) => {
        const at = K.cards + i * 0.4;
        const k = p(lt, at - 0.1, 0.8, E.outExpo);
        const back = p(lt, K.cardsBack + (3 - i) * 0.07, 0.55, E.inExpo);
        const b = ["nothome", "met", "appt", "sale"][i];
        // Ausgangspunkt: der Knopf im Telefon (Buehnenkoordinaten, ungefaehr)
        const fromX = PX + 20 + s.btnPos[b].cx - (900 + (i % 2) * 465) - 220;
        const fromY = PY + 20 + s.btnPos[b].cy - (300 + Math.floor(i / 2) * 290) - 132;
        const m = Math.max(0, k - back);
        set(c, {
          x: lerp(fromX, 0, m),
          y: lerp(fromY, 0, m) + Math.sin(lt * 1.3 + i) * 4 * m,
          s: lerp(0.18, 1, m),
          ry: (1 - m) * -25,
          o: clamp((lt - at + 0.1) / 0.12) * (m > 0.02 ? 1 : 0),
          blur: (1 - m) * 6,
        });
      });
      s.capC.update(lt, { start: K.notHome3 - 0.6, out: K.met - 0.25 });
      const off = p(lt, K.notHome1 + 0.4, 0.6, E.outBack) * (1 - p(lt, K.met - 0.25, 0.35));
      set(s.offline, { y: (1 - off) * 40, o: off });
      s.capD.update(lt, { start: K.met + 0.1, out: K.scroll2 - 0.4 });
      s.tiles.forEach((t, i) => {
        const at = K.tilesOut + i * 0.06;
        const k = p(lt, at, 0.75, E.outExpo);
        const rpos = s.reasonPos[i];
        const fromX = PX + 20 + rpos.cx - (900 + (i % 3) * 312) - 148;
        const fromY = PY + 20 + rpos.cy - (370 + Math.floor(i / 3) * 106) - 46;
        const picked = i === PICK;
        const dim = lt > K.pick + 0.1 && !picked ? p(lt, K.pick + 0.1, 0.4) : 0;
        const fly = picked ? p(lt, K.pick + 0.45, 0.55, E.inExpo) : 0;
        const out = picked ? 0 : p(lt, K.picked - 0.2, 0.4, E.inCubic);
        const pop = picked ? 1 + 0.12 * Math.sin(Math.PI * clamp((lt - K.pick) / 0.35)) : 1;
        set(t, {
          x: lerp(fromX, 0, k) + fly * (fromX - 0),
          y: lerp(fromY, 0, k) + fly * fromY,
          s: lerp(0.3, 1, k) * pop * (1 - fly * 0.7),
          o: clamp((lt - at) / 0.1) * (1 - dim * 0.75) * (1 - out) * (1 - p(fly, 0.85, 0.15)),
          blur: (1 - k) * 5,
        });
        if (picked) {
          const glow = clamp((lt - K.pick) / 0.2) * (1 - fly);
          t.style.boxShadow = glow > 0 ? `0 0 0 3px rgb(70 227 142/${glow.toFixed(2)}), 0 0 60px rgb(48 209 88/${(glow * 0.6).toFixed(2)})` : "";
        }
      });
      s.capE.update(lt, { start: K.scroll2 + 0.1, out: K.back - 0.2 });
      const pk = p(lt, K.scroll2 + 0.3, 0.9, E.outExpo) * (1 - p(lt, K.back - 0.1, 0.5, E.inCubic));
      set(s.panel, { x: (1 - pk) * 300, ry: (1 - pk) * -40 - 8, o: pk });
      s.plates.forEach((pl, i) => {
        const lit = lt > K.selRow12 + 0.35 + i * 0.12 && lt < K.selRow12 + 0.75 + i * 0.12;
        pl.style.filter = lit ? "drop-shadow(0 0 14px rgb(70 227 142/.9))" : "none";
      });
      s.bellBtns.forEach((b, i) => {
        const ring = i === 1 && lt > K.selBell && lt < K.notHomeBell + 0.6;
        b.style.boxShadow = ring
          ? "inset 0 -2px 4px rgb(0 0 0/.3), 0 0 0 4px #46e38e, 0 0 30px #46e38e"
          : "inset 0 -2px 4px rgb(0 0 0/.3),0 2px 4px rgb(0 0 0/.3)";
      });
      s.capF.update(lt, { start: K.back + 0.2, out: K.exit });
      const mk = p(lt, K.back + 0.5, 0.9, E.outExpo) * (1 - p(lt, K.exit, 0.5, E.inCubic));
      set(s.mini, { y: (1 - mk) * 120, rx: (1 - mk) * 30 + 8, o: mk });
      s.mroute.setAttribute("stroke-dasharray", `${p(lt, K.nearby + 0.3, 1.2, E.inOutCubic).toFixed(4)} 1`);
      const pul = ((lt * 1.2) % 1);
      s.pulse.setAttribute("r", (16 + pul * 40).toFixed(1));
      s.pulse.setAttribute("opacity", (1 - pul).toFixed(2));
      const lab = p(lt, K.nearby + 1.2, 0.5, E.outBack);
      set(s.mlabel, { o: lab, s: 0.8 + lab * 0.2, y: (1 - lab) * 10 });
      s.target.setAttribute("r", (13 + (lt > K.nearby + 1.2 ? 3 * Math.sin(lt * 6) : 0)).toFixed(2));

      // XP fliegen aus dem Telefon
      const xpAt = [K.notHome3, K.notHome1, K.picked, K.notHomeBell];
      s.xps.forEach((x, i) => x.update(lt, xpAt[i] + 0.05, { x: PX + 330, y: PY + 420 }));
    },
  });
})();
