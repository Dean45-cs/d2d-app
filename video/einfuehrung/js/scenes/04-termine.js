/*
 * Kapitel 03 · Termine: Zeit waehlen, Name und Rufnummer -> Bestaetigung
 * per WhatsApp oder SMS -> Push-Erinnerung 15 Minuten vorher.
 */
(function () {
  const V = window.V;
  const { el, set, p, E, clamp, lerp, T } = V;

  const PX = 1330;
  const PY = 150;
  const MSG = [
    "Guten Tag Frau Müller,",
    "",
    "wie besprochen komme ich am Mittwoch, 28.10., um 18:00 Uhr wieder bei Ihnen vorbei – zur Beratung zu Strom und Gas.",
    "Passt es doch nicht? Dann antworten Sie einfach auf diese Nachricht.",
    "",
    "Viele Grüße",
    "Jonas Carlsson",
    "Carlsson Sales",
  ].join("\n");

  const K = { chip: 1.5, name: 2.0, phone: 3.0, save: 4.3, confirm: 5.6, push: 9.3, exit: 12.1 };

  const field = (label, value, key, w = "1fr") =>
    `<div style="flex:${w}"><div class="a-foot muted" style="font-weight:600;margin:0 2px 5px">${label}</div><div class="fld" data-k="${key}" style="height:44px;border-radius:12px;background:var(--fill);display:flex;align-items:center;padding:0 12px;font-size:16px">${value}</div></div>`;

  V.scene({
    id: "termine",
    start: T.termine,
    dur: T.abschluss - T.termine,
    build(root) {
      const cam = el("div", "abs", root);
      cam.style.cssText = "left:0;top:0;width:1920px;height:1080px;transform-origin:1545px 250px";
      const ph = V.phone(cam, { x: PX, y: PY, time: "17:52" });
      V.screens.klinken(ph.app, { tray: false });
      const row5 = ph.app.querySelector(".door-row:nth-child(5)");
      row5.classList.add("sel");
      row5.querySelector(".door-lead").classList.add("on");
      const scrim = el("div", "scrim", ph.app);
      set(scrim, { o: 1 });
      const sheet = el(
        "div",
        "sheet",
        ph.app,
        `<div class="grabber"></div>
        <div style="padding:10px 16px 0;display:flex;align-items:flex-start;justify-content:space-between">
          <div><div class="a-title3" style="font-weight:700">Termin</div><div class="a-foot muted">Bahnhofstraße 5</div></div>
          <span class="door-glyph" style="width:30px;height:30px">${V.ic("x", 14)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 16px 0">
          ${["Heute 18:00", "Heute 19:30", "Morgen 10:00", "Morgen 18:00"].map((c, i) => `<span class="pill chip" data-i="${i}" style="height:46px;justify-content:center;font-size:15px">${c}</span>`).join("")}
        </div>
        <div style="display:flex;gap:8px;padding:16px 16px 0">${field("Tag", "28.10.2026", "day")}${field("Uhrzeit", "18:00", "time", "0 0 110px")}</div>
        <div style="display:flex;gap:8px;padding:12px 16px 0">${field("Name", "", "name")}${field("Telefon", "", "tel", "0 0 150px")}</div>
        <div style="padding:12px 16px 0">${field("Notiz", '<span class="muted">z. B. Abrechnung bereitlegen</span>', "note")}</div>
        <div style="padding:18px 16px 34px"><div class="btn-primary save" style="height:56px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600">Speichern · Morgen 18:00</div></div>`,
      );
      sheet.style.top = "120px";
      const confirm = el(
        "div",
        "sheet",
        ph.app,
        `<div class="grabber"></div>
        <div style="padding:10px 16px 0;display:flex;align-items:flex-start;justify-content:space-between">
          <div><div class="a-title3" style="font-weight:700">Termin bestätigen</div><div class="a-foot muted">Frau Müller · Mi 28.10. um 18:00</div></div>
          <span class="door-glyph" style="width:30px;height:30px">${V.ic("x", 14)}</span>
        </div>
        <div style="padding:14px 16px 0"><div class="list" style="background:var(--surface-2)">
          <div class="cell icons wa"><span class="door-glyph" style="width:32px;height:32px;background:var(--fill)">${V.ic("chat", 16)}</span><span style="flex:1;font-weight:500">Per WhatsApp bestätigen</span><span class="muted">${V.ic("chevronRight", 16)}</span></div>
          <div class="cell icons"><span class="door-glyph" style="width:32px;height:32px;background:var(--fill)">${V.ic("comment", 16)}</span><span style="flex:1;font-weight:500">Per SMS bestätigen</span><span class="muted">${V.ic("chevronRight", 16)}</span></div>
        </div></div>
        <div class="list-label" style="padding-top:18px">Nachricht</div>
        <div style="padding:0 16px"><div style="background:var(--surface-2);border-radius:16px;padding:12px 14px;font-size:14px;line-height:19px;white-space:pre-line" class="ink2">${MSG}</div></div>
        <div style="padding:14px 16px 30px;text-align:center" class="acc a-head">Ohne Bestätigung weiter</div>`,
      );
      confirm.style.top = "150px";
      const push = V.pushBanner(ph.screen, { title: "Terminerinnerung", body: "Dein nächster Termin beginnt um 18:00 Uhr." });
      const tapper = V.tapper(ph.screen);
      tapper.root.style.zIndex = "120";
      const chips = V.$$(sheet, ".chip");
      const pos = {
        chip: V.posIn(chips[3], ph.screen),
        name: V.posIn(V.$(sheet, '[data-k="name"]'), ph.screen),
        tel: V.posIn(V.$(sheet, '[data-k="tel"]'), ph.screen),
        save: V.posIn(V.$(sheet, ".save"), ph.screen),
        wa: V.posIn(V.$(confirm, ".wa"), ph.screen),
      };

      // Buehne links
      const chapter = V.chapter(root, "03", "Termine");
      const capA = V.caption(root, {
        x: 120, y: 290, w: 1000,
        eyebrow: "Termin vereinbart",
        title: ["Termin mit Uhrzeit.", "Bestätigt in Sekunden."],
        accentWords: ["Sekunden."],
        lede: "Vorschläge für den Abend, Name und Rufnummer dazu – die Bestätigung geht per WhatsApp oder SMS raus, solange der Kunde noch an der Tür steht.",
      });
      const bubble = el(
        "div",
        "abs",
        root,
        `<div style="width:900px;border-radius:36px;overflow:hidden;background:linear-gradient(180deg,#0f1714,#0a100d);box-shadow:inset 0 0 0 1px rgb(255 255 255/.1),0 50px 100px -30px rgb(0 0 0/.9)">
          <div style="display:flex;align-items:center;gap:16px;padding:22px 28px;border-bottom:1px solid rgb(255 255 255/.08)">
            ${V.avatar("FM", "teal", 56)}
            <div><div style="font:700 26px Inter;color:#fff">Frau Müller</div><div style="font:500 19px Inter;color:#8fa79b">0171 2345678</div></div>
          </div>
          <div style="padding:30px 28px 34px;display:flex;justify-content:flex-end">
            <div style="max-width:720px;border-radius:28px 28px 8px 28px;padding:22px 26px 16px;background:linear-gradient(180deg,#1d8a4f,#126b3a);color:#fff;font:400 24px/1.42 Inter;box-shadow:0 20px 40px -14px rgb(22 136 74/.6)">
              <div class="typed" style="white-space:pre-line;min-height:20px"></div>
              <div class="preview" style="margin-top:16px;display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:rgb(0 0 0/.18)">
                ${V.avatar("JC", "purple", 52)}
                <div><div style="font:700 21px Inter">Jonas Carlsson</div><div style="font:500 17px Inter;opacity:.8">Beratung Strom &amp; Gas · Carlsson Sales</div></div>
              </div>
              <div style="text-align:right;font:500 16px Inter;opacity:.75;margin-top:8px">17:54 ✓✓</div>
            </div>
          </div>
        </div>`,
      );
      bubble.style.cssText += "left:150px;top:150px";
      const capB = V.caption(root, {
        x: 120, y: 300, w: 1000,
        eyebrow: "Erinnerung",
        title: ["Pünktlich da.", "Ohne daran zu denken."],
        accentWords: ["Pünktlich"],
        lede: "15 Minuten vorher kommt eine Push-Nachricht – ein Tipp öffnet den Termin mit Anruf und Route. Am Termintag steht er oben auf der Tour.",
      });
      const xp = V.xpPop(root, "+40 XP");
      return { row5, cam, ph, sheet, confirm, chips, push, tapper, pos, chapter, capA, bubble, typed: V.$(bubble, ".typed"), preview: V.$(bubble, ".preview"), capB, xp, name: V.$(sheet, '[data-k="name"]'), tel: V.$(sheet, '[data-k="tel"]'), save: V.$(sheet, ".save") };
    },
    cues(start) {
      const c = (t, k, x) => V.cue(start + t, k, x);
      c(0, "whoosh-in");
      c(K.chip, "tap");
      c(K.name, "tap");
      for (let i = 0; i < 11; i++) c(K.name + 0.12 + i * 0.065, "key");
      c(K.phone, "tap");
      for (let i = 0; i < 12; i++) c(K.phone + 0.12 + i * 0.06, "key");
      c(K.save, "tap"); c(K.save + 0.1, "xp");
      c(K.confirm, "tap"); c(K.confirm + 0.25, "whoosh");
      c(K.confirm + 2.6, "sent");
      c(K.push, "push");
      c(K.exit + 0.4, "whoosh");
    },
    update(lt, s) {
      const enter = p(lt, 0, 1.2, E.outExpo);
      const exit = p(lt, K.exit, 0.9, E.inExpo);
      set(s.ph.root, {
        x: lerp(500, 0, enter) + exit * 700,
        y: Math.sin(lt * 0.7) * 6,
        ry: lerp(-45, -14, enter) + Math.sin(lt * 0.5) * 2 + exit * 30,
        rx: 3,
        s: 0.93,
        o: 1,
      });
      set(s.cam, { s: 1 + p(lt, K.push + 0.05, 0.9, E.inOutCubic) * 0.32, o: 1 - p(lt, K.exit + 0.5, 0.4), blur: exit * 10 });

      // Termin-Blatt
      s.chips.forEach((c, i) => c.classList.toggle("on", i === 3 && lt >= K.chip));
      const typeIn = (txt, at, step) => txt.slice(0, Math.max(0, Math.floor((lt - at) / step)));
      const nm = typeIn("Frau Müller", K.name + 0.1, 0.065);
      const tl = typeIn("0171 2345678", K.phone + 0.1, 0.06);
      V.html(s.name, nm || '<span class="muted">Frau Müller</span>');
      V.html(s.tel, tl || '<span class="muted">optional</span>');
      const focus = lt >= K.name && lt < K.phone ? s.name : lt >= K.phone && lt < K.save ? s.tel : null;
      [s.name, s.tel].forEach((f) => (f.style.boxShadow = f === focus ? "inset 0 0 0 2px var(--accent)" : "none"));
      set(s.save, { s: lt > K.save - 0.02 && lt < K.save + 0.14 ? 0.96 : 1 });
      const swap = p(lt, K.save + 0.2, 0.5, E.appSpring);
      s.sheet.style.transform = `translateY(${(swap * 760).toFixed(1)}px)`;
      s.confirm.style.transform = `translateY(${((1 - swap) * 760 + p(lt, K.confirm + 0.4, 0.5, E.inCubic) * 760).toFixed(1)}px)`;
      s.ph.app.querySelector(".scrim").style.opacity = (1 - p(lt, K.confirm + 0.5, 0.4)).toFixed(3);
      V.$(s.confirm, ".wa").style.background = lt > K.confirm - 0.02 && lt < K.confirm + 0.3 ? "var(--fill)" : "";

      // Zeile 5 bekommt den Termin
      const booked = lt >= K.save + 0.1;
      V.text(s.row5.querySelector("b"), booked ? "Termin vereinbart" : "Noch nicht besucht");
      V.text(s.row5.querySelector(".door-txt span"), booked ? "Jonas · Mi 28.10. 18:00" : "");
      V.html(s.row5.lastElementChild, booked ? V.ic("calendar", 17) : "");
      s.row5.lastElementChild.className = booked ? "door-glyph" : "";
      // Push von oben
      const pk = p(lt, K.push, 0.55, E.appSpring) * (1 - p(lt, K.exit - 0.3, 0.4, E.inCubic));
      s.push.style.transform = `translateY(${((1 - pk) * -140).toFixed(1)}px) scale(${(0.94 + pk * 0.06).toFixed(3)})`;
      set(s.push, { o: pk > 0.01 ? 1 : 0 });

      s.tapper.update(lt, [
        { t: K.chip, x: s.pos.chip.cx, y: s.pos.chip.cy + 120 },
        { t: K.name, x: s.pos.name.cx, y: s.pos.name.cy + 120 },
        { t: K.phone, x: s.pos.tel.cx, y: s.pos.tel.cy + 120 },
        { t: K.save, x: s.pos.save.cx, y: s.pos.save.cy + 120 },
        { t: K.confirm, x: s.pos.wa.cx, y: s.pos.wa.cy + 150 },
      ]);

      // Buehne
      s.chapter.update(lt, K.exit + 0.6);
      s.capA.update(lt, { start: 0.4, out: K.confirm - 0.3 });
      const bin = p(lt, K.confirm + 0.2, 0.9, E.outExpo);
      const bout = p(lt, K.push - 0.5, 0.5, E.inCubic);
      set(s.bubble, {
        x: lerp(1000, 0, bin) - bout * 200,
        y: lerp(200, 0, bin),
        s: lerp(0.3, 1, bin),
        ry: (1 - bin) * -30,
        o: Math.min(1, bin * 3) * (1 - bout),
        blur: bout * 10,
      });
      const chars = Math.floor(clamp((lt - K.confirm - 0.7) / 2.0) * MSG.length);
      V.text(s.typed, MSG.slice(0, chars));
      const pv = p(lt, K.confirm + 2.6, 0.5, E.outBack);
      set(s.preview, { o: pv, y: (1 - pv) * 16 });
      s.capB.update(lt, { start: K.push + 0.1, out: K.exit });
      s.xp.update(lt, K.save + 0.1, { x: PX - 130, y: PY + 560 });
    },
  });
})();
