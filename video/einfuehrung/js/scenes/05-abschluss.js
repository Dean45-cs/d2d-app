/*
 * Kapitel 04 · Abschluss: Auftrag starten -> Tarifrechner mit Unterschrift ->
 * zurueck, Abschluss bestaetigen -> der grosse Moment (Drop) -> Level-Aufstieg
 * -> das Team sieht es im Feed und per Push.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  const PX = 1180;
  const PY = 150;
  const K = { start: 1.4, product: 2.6, sign: 4.9, send: 6.25, back: 6.8, confirm: 8.6, drop: 9.0, level: 10.7, team: 12.6, exit: 17.1 };

  // Unterschrift als Pfad (von Hand gesetzt)
  const SIGN =
    "M14 58 C22 30 34 22 40 36 C46 52 30 70 26 60 C22 48 52 30 60 40 C66 48 58 62 66 58 C76 52 80 36 88 44 C94 52 90 64 98 58 C108 48 112 36 120 46 C126 54 122 66 132 60 C146 50 150 40 162 46 C170 50 168 62 180 56 C196 48 214 42 232 48";

  V.scene({
    id: "abschluss",
    start: T.abschluss,
    dur: T.karte - T.abschluss,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:1400px 560px";
      const ph = V.phone(cam, { x: PX, y: PY, time: "18:07" });
      const scr = V.screens.klinken(ph.app);
      // Tuer 9 waehlen, in Sicht scrollen
      scr.scroll.style.transform = "translateY(-300px)";
      const row9 = scr.row("9");
      row9.classList.add("sel");
      row9.querySelector(".door-lead").classList.add("on");
      V.text(scr.k["tray-n"], "9");
      V.text(scr.k["tray-title"], "Bahnhofstraße 9");
      V.text(scr.k["tray-meta"], "Noch nicht besucht");
      const scrim = el("div", "scrim", ph.app);
      const sale = el(
        "div",
        "sheet",
        ph.app,
        `<div class="grabber"></div>
        <div style="padding:10px 16px 0"><div class="a-title3" style="font-weight:700">Auftrag starten</div><div class="a-foot muted">Bahnhofstraße 9</div></div>
        <div style="display:grid;gap:8px;padding:16px 16px 40px">
          ${["Strom", "Gas", "Strom + Gas"]
            .map(
              (l, i) =>
                `<div class="prod ${i === 0 ? "btn-primary" : ""}" data-i="${i}" style="height:56px;border-radius:999px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font-size:17px;font-weight:600;${i === 0 ? "" : "background:var(--fill)"}">${l}<span style="font-size:15px;font-weight:400;opacity:.8">Tarifrechner</span></div>`,
            )
            .join("")}
        </div>`,
      );
      // Tarifrechner im Browser
      const web = el(
        "div",
        "abs",
        ph.app,
        `<div style="position:absolute;inset:0;background:#f7f8fa;color:#14181f">
          <div style="padding:58px 14px 10px;background:#f7f8fa;border-bottom:1px solid #e3e6ea">
            <div style="height:38px;border-radius:12px;background:#e9ecef;display:flex;align-items:center;justify-content:center;gap:6px;font-size:15px;color:#3a4048">${V.ic("shield", 14)}portal-ep24.de</div>
          </div>
          <div style="padding:16px">
            <div style="font:800 24px Inter;letter-spacing:-.02em">Tarifrechner</div>
            <div style="font-size:13px;color:#69707a;margin-top:2px">Strom + Gas · Neukunde</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">
              ${[["PLZ", "44135", "plz"], ["Ort", "Dortmund", "ort"], ["Strom", "3.500 kWh", "kwh"], ["Gas", "15.000 kWh", "gas"]]
                .map(([l, v, k]) => `<div style="background:#fff;border:1px solid #dfe3e8;border-radius:10px;padding:7px 10px"><div style="font-size:11px;color:#69707a">${l}</div><div class="wf" data-v="${v}" data-k="${k}" style="font-size:15px;font-weight:600;min-height:20px"></div></div>`)
                .join("")}
            </div>
            <div class="tarif" style="margin-top:12px;border-radius:14px;padding:12px 14px;background:#fff;border:2px solid #1d6fd6;display:flex;align-items:center;gap:10px">
              <span style="width:34px;height:34px;border-radius:50%;background:#1d6fd6;color:#fff;display:flex;align-items:center;justify-content:center">${V.ic("check", 18)}</span>
              <div><div style="font-weight:700;font-size:15px">Tarif gewählt</div><div style="font-size:12px;color:#69707a">Kundendaten, Widerruf, Lieferbeginn</div></div>
            </div>
            <div style="margin-top:12px;font-size:12px;color:#69707a">Unterschrift Kunde</div>
            <div style="margin-top:4px;height:96px;border-radius:12px;background:#fff;border:1px dashed #b9c0c8;position:relative">
              <svg viewBox="0 0 250 90" width="330" height="96" style="position:absolute;left:8px;top:0"><path class="sig" d="${SIGN}" pathLength="1" fill="none" stroke="#1b2b6b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 1"/></svg>
            </div>
            <div class="send" style="margin-top:14px;height:50px;border-radius:12px;background:#1d6fd6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">Auftrag absenden</div>
          </div>
        </div>`,
      );
      web.style.cssText += "inset:0;z-index:75";
      const done = el(
        "div",
        "sheet",
        ph.app,
        `<div class="grabber"></div>
        <div style="padding:10px 16px 0"><div class="a-title3" style="font-weight:700">Auftrag abgeschlossen?</div><div class="a-foot muted">Bahnhofstraße 9 · Strom + Gas</div></div>
        <div style="display:grid;gap:8px;padding:16px 16px 40px">
          <div class="btn-primary ok" style="height:56px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600">Abschluss bestätigen</div>
          <div style="height:56px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:600;background:var(--fill)">Tarifrechner öffnen ${V.ic("external", 16)}</div>
          <div style="height:44px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:var(--danger)">Nicht zustande gekommen</div>
        </div>`,
      );
      const tapper = V.tapper(ph.screen);
      tapper.root.style.zIndex = "120";
      const pos = {
        start: V.posIn(scr.btn("sale"), ph.screen),
        prod: V.posIn(V.$$(sale, ".prod")[2], ph.screen),
        send: V.posIn(V.$(web, ".send"), ph.screen),
        ok: V.posIn(V.$(done, ".ok"), ph.screen),
      };

      // Zweites Telefon: Kollegin sieht es im Feed
      const ph2 = V.phone(cam, { x: 1260, y: 150, theme: "dark", time: "18:08" });
      const team = V.screens.team(ph2.app);
      const postH = team.newpost.offsetHeight;
      team.newpost.style.overflow = "visible";
      const push = V.pushBanner(ph2.screen, {
        title: "Jonas Carlsson hat einen Vertrag gemacht",
        body: "Strom + Gas · Innenstadt Nord · Abschluss Nr. 25 – jetzt gratulieren!",
        dark: true,
      });
      const hearts = Array.from({ length: 9 }, (_, i) => {
        const h = el("div", "abs", ph2.screen, `<span style="color:#ff5a7a;filter:drop-shadow(0 4px 10px rgb(255 90 122/.5))">${V.ic("heartFill", 26 + (i % 3) * 6)}</span>`);
        h.style.cssText += "left:120px;top:420px;z-index:90";
        return h;
      });

      // Buehne
      const chapter = V.chapter(root, "04", "Abschluss");
      const capA = V.caption(root, {
        x: 120, y: 290, w: 940,
        eyebrow: "Auftrag erfassen",
        title: ["Ein Tipp – und der", "Tarifrechner ist offen."],
        accentWords: ["Tarifrechner"],
        lede: "Kundendaten und Unterschrift gehören in den Tarifrechner des Partners, nicht doppelt in die App. Die App merkt sich den offenen Auftrag.",
      });
      const capB = V.caption(root, {
        x: 120, y: 330, w: 940,
        eyebrow: "Zurück in der App",
        title: ["Erst die Bestätigung", "zählt."],
        accentWords: ["zählt."],
        lede: "Offene Aufträge gehen nicht verloren – auch nicht ohne Netz.",
      });
      // Der grosse Moment
      const big = el("div", "abs", root);
      big.style.cssText = "left:0;top:0;width:1920px;height:1080px";
      const rays = el("div", "abs", big);
      rays.style.cssText =
        "left:-240px;top:-700px;width:2400px;height:2400px;background:repeating-conic-gradient(from 0deg at 50% 50%, rgb(70 227 142/.10) 0deg 5deg, transparent 5deg 14deg);-webkit-mask-image:radial-gradient(closest-side, #000 15%, transparent 70%);mask-image:radial-gradient(closest-side, #000 15%, transparent 70%)";
      const word = el("div", "abs display glow-text", big, "Abschluss.");
      word.style.cssText += "left:110px;top:330px;font-size:190px;font-weight:900;letter-spacing:-0.06em;padding-right:30px";
      const wordParts = V.split(word, "Abschluss.", "char");
      const xpBig = el("div", "xp-pop", big, "+100 XP");
      xpBig.style.cssText += "left:130px;top:580px;font-size:64px";
      const check = el(
        "div",
        "abs",
        big,
        `<span class="glyph-result" style="width:260px;height:260px;background:radial-gradient(circle at 35% 30%,#7dffb4,#2fd161 45%,#0f8a43);color:#fff;box-shadow:0 0 0 10px rgb(255 255 255/.12),0 0 120px rgb(48 209 88/.9),inset 0 4px 0 rgb(255 255 255/.45)">${V.ic("check", 150, "", 2.6)}</span>`,
      );
      check.style.cssText += `left:${PX + 216 - 130}px;top:${PY + 446 - 130}px`;
      const rings = [0, 1, 2].map(() => {
        const r = el("div", "abs", big);
        r.style.cssText = `left:${PX + 216 - 200}px;top:${PY + 446 - 200}px;width:400px;height:400px;border-radius:50%;border:4px solid rgb(120 255 180/.9);box-shadow:0 0 40px rgb(70 227 142/.6)`;
        return r;
      });
      const canvas = el("canvas", "abs", big);
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.style.cssText = "left:0;top:0";
      const confetti = V.confetti(99, 300, { x0: PX + 216, y0: PY + 470 });
      const confetti2 = V.confetti(7, 140, { x0: 520, y0: 1100, spread: 30, vMin: 1500, vMax: 2600 });
      const confetti3 = V.confetti(13, 140, { x0: 1880, y0: 1100, spread: 30, vMin: 1500, vMax: 2600 });

      // Level-Aufstieg
      const level = el(
        "div",
        "abs stage-glass",
        root,
        `<div style="display:flex;align-items:center;gap:30px;padding:30px 40px 30px 30px">
          <div style="position:relative;width:150px;height:150px">
            <svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="64" fill="none" stroke="rgb(255 255 255/.12)" stroke-width="12"/><circle class="lvring" cx="75" cy="75" r="64" fill="none" stroke="url(#lvg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="402" stroke-dashoffset="402" transform="rotate(-90 75 75)"/><defs><linearGradient id="lvg" x1="0" x2="1"><stop offset="0" stop-color="#b8ffd2"/><stop offset="1" stop-color="#2fd161"/></linearGradient></defs></svg>
            <span class="lvnum kpi" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;color:#fff">4</span>
          </div>
          <div>
            <div style="font:600 20px Inter;letter-spacing:.16em;text-transform:uppercase;color:#5cf09c">Level-Aufstieg</div>
            <div class="display lvtitle" style="font-size:64px;margin-top:6px">Level 4 · Einstieg</div>
            <div style="font:500 24px Inter;color:#a3aca7;margin-top:10px"><span class="lvxp">640</span> XP · <span class="lvnext">noch 60 bis Level 5</span></div>
          </div>
        </div>`,
      );
      level.style.cssText += "left:120px;top:380px;transform-origin:0 50%";
      const capC = V.caption(root, {
        x: 120, y: 300, w: 1000,
        eyebrow: "Team-Feed",
        title: ["Das Team", "feiert mit."],
        accentWords: ["feiert"],
        lede: "Jeder Abschluss erscheint von selbst im Feed – ohne Adresse, ohne Kundendaten. Wer dich abonniert hat, bekommt eine Push-Nachricht.",
      });
      return {
        cam, ph, scr, scrim, sale, prods: V.$$(sale, ".prod"), web, sig: V.$(web, ".sig"), wfs: V.$$(web, ".wf"), tarif: V.$(web, ".tarif"), sendBtn: V.$(web, ".send"),
        done, ok: V.$(done, ".ok"), tapper, pos, row9,
        ph2, team, postH, push, hearts,
        chapter, capA, capB, big, rays, wordParts, xpBig, check, rings, ctx: canvas.getContext("2d"), confetti, confetti2, confetti3,
        level, lvring: V.$(level, ".lvring"), lvnum: V.$(level, ".lvnum"), lvxp: V.$(level, ".lvxp"), lvtitle: V.$(level, ".lvtitle"), lvnext: V.$(level, ".lvnext"), capC,
      };
    },
    cues(start) {
      const c = (t, k, x) => V.cue(start + t, k, x);
      c(0, "whoosh-in");
      c(K.start, "tap"); c(K.start + 0.2, "sheet");
      c(K.product, "tap"); c(K.product + 0.2, "whoosh");
      for (let i = 0; i < 4; i++) c(3.3 + i * 0.35, "key");
      c(K.sign, "sign");
      c(K.send, "tap");
      c(K.back, "whoosh");
      c(K.confirm, "tap");
      c(K.drop - 2.0, "riser");
      c(K.drop, "drop");
      c(K.drop + 0.05, "confetti");
      c(K.level + 1.3, "levelup");
      c(K.team, "whoosh");
      c(K.team + 0.6, "push");
      for (let i = 0; i < 6; i++) c(K.team + 1.6 + i * 0.22, "like");
      c(K.exit + 0.5, "whoosh");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.2, E.outExpo);
      const toTeam = p(lt, K.team, 0.9, E.inOutCubic);
      set(s.ph.root, {
        x: lerp(400, 0, enter) - toTeam * 1400,
        y: Math.sin(lt * 0.7) * 6 + lerp(300, 0, enter),
        ry: lerp(-40, -12, enter) + Math.sin(lt * 0.5) * 2 + toTeam * 20,
        rx: lerp(20, 3, enter),
        s: 0.93,
        o: 1 - p(lt, K.team + 0.4, 0.4),
      });
      // Erschuetterung beim Drop
      const shake = lt > K.drop && lt < K.drop + 0.45 ? (1 - (lt - K.drop) / 0.45) * 14 : 0;
      const sx = Math.sin(lt * 91) * shake;
      const sy = Math.cos(lt * 77) * shake;
      set(s.cam, { x: sx, y: sy, s: 1 + p(lt, K.drop, 0.15) * 0.03 * (1 - p(lt, K.drop + 0.15, 0.8)), o: 1 - p(lt, K.exit + 0.4, 0.5), blur: p(lt, K.exit, 0.9, E.inCubic) * 10 });

      // Blatt: Produkt waehlen
      const saleK = p(lt, K.start + 0.15, 0.5, E.appSpring) * (1 - p(lt, K.product + 0.15, 0.3));
      s.sale.style.transform = `translateY(${((1 - saleK) * 400).toFixed(1)}px)`;
      s.prods.forEach((b, i) => {
        const on = lt >= K.product ? i === 2 : i === 0;
        b.classList.toggle("btn-primary", on);
        b.style.background = on ? "" : "var(--fill)";
      });
      // Tarifrechner
      const webK = p(lt, K.product + 0.15, 0.55, E.appSpring) * (1 - p(lt, K.back, 0.5, E.appSpring));
      s.web.style.transform = `translateX(${((1 - webK) * 400).toFixed(1)}px)`;
      set(s.web, { o: webK > 0.005 ? 1 : 0 });
      s.wfs.forEach((f, i) => {
        const v = f.dataset.v;
        V.text(f, v.slice(0, Math.floor(clamp((lt - 3.3 - i * 0.35) / 0.3) * v.length)));
      });
      set(s.tarif, { o: p(lt, 4.5, 0.3), y: (1 - p(lt, 4.5, 0.4, E.outBack)) * 10 });
      s.sig.setAttribute("stroke-dasharray", `${p(lt, K.sign, 1.1, E.inOutSine).toFixed(4)} 1`);
      const sent = lt > K.send + 0.1;
      V.text(s.sendBtn, sent ? "✓ Auftrag übermittelt" : "Auftrag absenden");
      s.sendBtn.style.background = sent ? "#13a35b" : "#1d6fd6";
      set(s.sendBtn, { s: lt > K.send - 0.02 && lt < K.send + 0.14 ? 0.96 : 1 });
      // Zurueck: Auftrag abgeschlossen?
      const doneK = p(lt, K.back + 0.35, 0.5, E.appSpring) * (1 - p(lt, K.drop - 0.05, 0.35, E.inCubic));
      s.done.style.transform = `translateY(${((1 - doneK) * 400).toFixed(1)}px)`;
      set(s.scrim, { o: Math.max(saleK, doneK) });
      set(s.ok, { s: lt > K.confirm - 0.02 && lt < K.confirm + 0.14 ? 0.96 : 1 });
      // Zeile wird zum Abschluss
      const won = lt >= K.drop;
      s.row9.classList.toggle("sale", won);
      V.text(s.row9.querySelector("b"), won ? "Abschluss am 27.10.2026" : "Noch nicht besucht");
      V.html(s.row9.lastElementChild, won ? `<span class="glyph-result" style="width:30px;height:30px">${V.ic("check", 18)}</span>` : "");
      V.text(s.scr.k["tray-meta"], won ? "Abschluss · Strom + Gas" : "Noch nicht besucht");

      s.tapper.update(lt, [
        { t: K.start, x: s.pos.start.cx, y: s.pos.start.cy },
        { t: K.product, x: s.pos.prod.cx, y: s.pos.prod.cy },
        { t: K.send, x: s.pos.send.cx, y: s.pos.send.cy },
        { t: K.confirm, x: s.pos.ok.cx, y: s.pos.ok.cy },
      ]);

      // Texte
      s.chapter.update(lt, K.exit + 0.6);
      s.capA.update(lt, { start: 0.4, out: K.back - 0.2 });
      s.capB.update(lt, { start: K.back + 0.1, out: K.drop - 0.2 });

      // Drop
      const d = lt - K.drop;
      const bigOn = d > -0.05 && lt < K.team + 0.3;
      set(s.big, { o: bigOn ? 1 - p(lt, K.team - 0.2, 0.5) : 0 });
      if (bigOn) {
        const ck = E.appPop(clamp(d / 0.55));
        set(s.check, { s: ck * (1 - p(lt, K.level - 0.3, 0.6, E.inCubic) * 0.6), rz: (1 - ck) * -40, o: clamp(d / 0.08) * (1 - p(lt, K.level - 0.2, 0.5)) });
        s.rings.forEach((r, i) => {
          const k = clamp((d - i * 0.12) / 1.0);
          set(r, { s: 0.4 + E.outCubic(k) * (2.6 + i * 0.8), o: d > i * 0.12 ? (1 - k) * 0.9 : 0 });
        });
        set(s.rays, { o: p(lt, K.drop, 0.3) * 0.9, rz: lt * 8, s: 0.9 + p(lt, K.drop, 1) * 0.2 });
        s.wordParts.forEach((c, i) => {
          const k = E.outBack(clamp((d - 0.05 - i * 0.035) / 0.5), 2);
          set(c, { y: (1 - k) * 120, s: lerp(1.6, 1, k), o: clamp((d - 0.05 - i * 0.035) / 0.1) * (1 - p(lt, K.level - 0.4, 0.4)), blur: (1 - k) * 10 });
        });
        const xk = E.outBack(clamp((d - 0.45) / 0.5), 2.5);
        set(s.xpBig, { s: 0.3 + xk * 0.7, o: clamp((d - 0.45) / 0.1) * (1 - p(lt, K.level - 0.4, 0.4)), y: (1 - xk) * 30 });
      }
      const ctx = s.ctx;
      ctx.clearRect(0, 0, 1920, 1080);
      if (d > 0 && d < 4.2) {
        s.confetti(ctx, d, 4.0);
        s.confetti2(ctx, d - 0.12, 3.6);
        s.confetti3(ctx, d - 0.2, 3.6);
      }

      // Level
      const lv = p(lt, K.level, 0.7, E.outExpo) * (1 - p(lt, K.team - 0.1, 0.5, E.inCubic));
      set(s.level, { y: (1 - lv) * 80, o: lv, s: (0.9 + lv * 0.1) * 1.18 });
      const fill = p(lt, K.level + 0.3, 1.0, E.inOutCubic);
      const up = lt > K.level + 1.3;
      s.lvring.setAttribute("stroke-dashoffset", (402 * (1 - (up ? p(lt, K.level + 1.3, 0.8, E.outCubic) * 0.15 : 0.6 + fill * 0.4))).toFixed(1));
      V.text(s.lvnum, up ? "5" : "4");
      set(s.lvnum, { s: up ? 1 + 0.35 * Math.max(0, 1 - (lt - K.level - 1.3) / 0.4) : 1 });
      V.text(s.lvxp, String(Math.round(640 + 100 * fill)));
      V.text(s.lvtitle, up ? "Level 5 · Türöffner" : "Level 4 · Einstieg");
      V.text(s.lvnext, up ? "noch 260 bis Level 6" : `noch ${Math.max(0, 60 - Math.round(100 * fill))} bis Level 5`);
      set(s.lvtitle, { s: up ? 1 + 0.08 * Math.max(0, 1 - (lt - K.level - 1.3) / 0.35) : 1 });
      s.lvtitle.style.transformOrigin = "0 50%";

      // Team: zweites Telefon mit Push und Feed
      const tin = p(lt, K.team + 0.1, 1.0, E.outExpo);
      const tout = p(lt, K.exit, 0.9, E.inExpo);
      set(s.ph2.root, {
        x: lerp(900, 0, tin) + tout * 600,
        y: Math.sin(lt * 0.7) * 6,
        ry: lerp(-50, -14, tin) + tout * 30,
        rx: 3,
        s: 0.93,
        o: tin > 0.001 ? 1 : 0,
      });
      const pk = p(lt, K.team + 0.6, 0.55, E.appSpring);
      s.push.style.transform = `translateY(${((1 - pk) * -140).toFixed(1)}px)`;
      set(s.push, { o: pk > 0.01 ? 1 - p(lt, K.team + 3.4, 0.4) : 0 });
      const grow = p(lt, K.team + 0.9, 0.5, E.inOutCubic);
      s.team.newpost.style.height = `${(grow * s.postH).toFixed(1)}px`;
      s.team.newpost.style.overflow = grow < 1 ? "hidden" : "visible";
      const np = p(lt, K.team + 1.0, 0.6, E.outBack);
      set(s.team.newpost.firstElementChild, { s: 0.9 + np * 0.1, o: np, y: (1 - np) * -20 });
      const likes = Math.min(7, Math.max(0, Math.floor((lt - K.team - 1.6) / 0.22) + 1));
      V.text(s.team.likes, String(lt > K.team + 1.6 ? likes : 0));
      V.text(s.team.comments, lt > K.team + 3.0 ? "2" : "0");
      s.team.like.style.color = lt > K.team + 1.6 ? "#ff5a7a" : "";
      V.text(s.team.week, lt > K.team + 1.0 ? "4" : "3");
      s.team.cheers.forEach((c, i) => {
        const on = lt > K.team + 2.6 + i * 0.4;
        c.classList.toggle("on", on);
      });
      s.hearts.forEach((h, i) => {
        const hk = lt - (K.team + 1.6 + i * 0.22);
        if (hk < 0 || hk > 1.4) return set(h, { o: 0 });
        set(h, { x: Math.sin(i * 2.1 + hk * 4) * 30 + (i % 3) * 20, y: -hk * 260, s: 0.6 + Math.min(1, hk * 3) * 0.6, o: 1 - clamp((hk - 0.9) / 0.5) });
      });
      s.capC.update(lt, { start: K.team + 0.3, out: K.exit });
    },
  });
  V.flashes.push({ t: T.abschluss + K.drop, power: 0.95 });
  V.flashes.push({ t: T.abschluss + K.level + 1.3, power: 0.3 });
})();
