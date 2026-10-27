/*
 * Bildschirme der App als HTML - nachgebaut nach den echten Seiten
 * (src/app/(app)/...). Zahlen und Zeilen tragen data-Merkmale, damit die
 * Szenen sie animieren koennen.
 */
(function () {
  const V = window.V;
  const S = (V.screens = {});

  /* ------------------------------ Uebersicht ------------------------------ */

  S.uebersicht = (app, { tabs = true } = {}) => {
    const bars = [14, 9, 0, 17, 19, 21, 16, 12, 0, 10, 6, 10, 22, 18];
    const sales = [1, 0, 0, 1, 1, 2, 0, 1, 0, 0, 0, 0, 2, 1];
    app.innerHTML = `
<div class="scroll pad" style="padding-top:66px">
  <div class="a-large" style="font-size:32px">Guten Abend, Jonas</div>
  <div class="a-sub muted" style="margin-top:2px">Freitag, 23. Oktober</div>
  <div class="seg" style="margin-top:16px"><span>Heute</span><span class="on">7 Tage</span><span>30 Tage</span><span>Gesamt</span></div>
  <div class="hero" style="margin-top:14px;padding:18px 18px 16px">
    <svg viewBox="0 0 100 100" width="190" height="190" style="position:absolute;right:-46px;top:-40px;opacity:.12"><path d="${V.MARK_RING}" fill="#fff"/><circle cx="71.2" cy="28.8" r="6.75" fill="#fff"/></svg>
    <div class="a-sub" style="opacity:.85;font-weight:600">Abschlüsse</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:2px">
      <span class="kpi" data-k="sales" style="font-size:64px;line-height:68px">12</span>
      <span class="a-sub" style="border-radius:999px;padding:4px 12px;background:rgb(255 255 255 / .14);box-shadow:inset 0 0 0 1px rgb(255 255 255/.2);font-weight:600"><span data-k="quote">20</span> % Quote</span>
    </div>
    <div style="height:1px;background:rgb(255 255 255/.16);margin:12px 0"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
      <div><div class="a-foot" style="opacity:.85;font-weight:600">Türen</div><div class="kpi" data-k="doors" style="font-size:30px;line-height:36px">248</div><div class="a-cap" style="opacity:.8">171 nicht da</div></div>
      <div style="border-left:1px solid rgb(255 255 255/.16);padding-left:12px"><div class="a-foot" style="opacity:.85;font-weight:600">Gespräche</div><div class="kpi" data-k="met" style="font-size:30px;line-height:36px">61</div><div class="a-cap" style="opacity:.8">25 % angetroffen</div></div>
      <div style="border-left:1px solid rgb(255 255 255/.16);padding-left:12px"><div class="a-foot" style="opacity:.85;font-weight:600">Termine</div><div class="kpi" data-k="appts" style="font-size:30px;line-height:36px">9</div><div class="a-cap" style="opacity:.8">15 % der Gespräche</div></div>
    </div>
  </div>
  <div class="a-title2" style="margin:22px 4px 10px">Verlauf</div>
  <div class="surface" style="padding:16px 14px 12px">
    <div style="display:flex;align-items:flex-end;gap:7px;height:150px;border-bottom:1px solid var(--sep)">
      ${bars
        .map(
          (b, i) => `<div class="bar" data-i="${i}" style="flex:1;height:${Math.max(4, (b / 22) * 140)}px;border-radius:7px;background:var(--fill-strong);position:relative;transform-origin:50% 100%">
        ${sales[i] ? `<div style="position:absolute;left:0;right:0;bottom:0;height:${8 + sales[i] * 7}px;border-radius:7px;background:var(--accent)"></div>` : ""}</div>`,
        )
        .join("")}
    </div>
    <div class="a-cap muted" style="display:flex;gap:14px;margin-top:10px"><span>● Türen</span><span class="acc">● Abschlüsse</span></div>
  </div>
</div>
${tabs ? V.tabbar(V.TABS, 0) : ""}`;
    return {
      bars: V.$$(app, ".bar"),
      k: Object.fromEntries(V.$$(app, "[data-k]").map((n) => [n.dataset.k, n])),
    };
  };

  /* -------------------------------- Klinken -------------------------------- */

  /** Zeilen der Bahnhofstrasse wie in docs/screenshots/klinken-iphone-hell.png */
  S.DOORS = [
    { n: "1", st: "Nicht angetroffen · 2×", who: "Alex · 19.10. 12:19", g: "door" },
    { n: "2", st: "Kein Interesse", who: "Sina · 19.10. 17:26", g: "hand" },
    { n: "3", st: "Noch nicht besucht", who: "", g: null },
    { n: "4", st: "Abschluss am 12.10.2026", who: "Alex · 12.10. 18:40", g: "check", sale: true },
    { n: "5", st: "Termin vereinbart", who: "Jonas · Do 18:30", g: "calendar" },
    { n: "6", st: "Nicht angetroffen · 1×", who: "Alex · 18.10. 16:02", g: "door" },
    { n: "7", st: "Noch nicht besucht", who: "", g: null },
    { n: "8", st: "Vertrag läuft noch", who: "Sina · 17.10. 19:12", g: "contract" },
    { n: "9", st: "Noch nicht besucht", who: "", g: null },
    { n: "10", st: "Abschluss am 03.10.2026", who: "Jonas · 03.10. 17:55", g: "check", sale: true },
    { n: "11", st: "Nicht angetroffen · 3×", who: "Alex · 19.10. 12:31", g: "door" },
    { n: "12", st: "Mehrfamilienhaus · 6 Klingeln", who: "2 von 6 offen", g: "building" },
  ];

  S.doorRow = (d) => `
<div class="door-row ${d.sale ? "sale" : ""}" data-n="${d.n}">
  <span class="door-lead">${d.n}</span>
  <span class="door-txt"><b>${d.st}</b>${d.who ? `<span>${d.who}</span>` : ""}</span>
  ${
    d.g === "check"
      ? `<span class="glyph-result" style="width:30px;height:30px">${V.ic("check", 18)}</span>`
      : d.g
        ? `<span class="door-glyph">${V.ic(d.g, 17)}</span>`
        : `<span style="width:30px"></span>`
  }
</div>`;

  S.klinken = (app, { tabs = true, tray = true, doors = S.DOORS } = {}) => {
    app.innerHTML = `
<div class="scroll pad" style="padding-top:60px">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <span style="display:flex;align-items:center;gap:8px" class="a-sub">
      <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="none" stroke="var(--fill-strong)" stroke-width="3.5"/><circle class="ring-goal" cx="11" cy="11" r="9" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="56.5" stroke-dashoffset="40" transform="rotate(-90 11 11)"/></svg>
      <b data-k="today">7</b>&nbsp;Türen heute</span>
    <span style="display:flex;gap:10px;color:var(--ink)">
      <span class="door-glyph" style="width:36px;height:36px;background:var(--fill)">${V.ic("qr", 19)}</span>
      <span class="door-glyph" style="width:36px;height:36px;background:var(--fill);position:relative">${V.ic("calendar", 19)}<b style="position:absolute;right:-4px;top:-4px;background:var(--ink);color:var(--bg);font-size:11px;border-radius:9px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center">2</b></span>
    </span>
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:10px"><span class="a-large">Bahnhofstraße</span><span class="acc">${V.ic("chevronDown", 20)}</span></div>
  <div class="a-sub ink2">Innenstadt Nord · 44135 Dortmund</div>
  <div style="margin-top:10px;display:grid;gap:6px">
    <div style="display:flex;align-items:center;gap:8px" class="a-foot"><span class="ink2">${V.ic("bolt", 16)}</span><b>Strom</b><span class="muted">· 42,9 ct/kWh · DEW21</span><span class="badge" style="margin-left:auto">sehr teuer</span></div>
    <div style="display:flex;align-items:center;gap:8px" class="a-foot"><span class="ink2">${V.ic("flame", 16)}</span><b>Gas</b><span class="muted">· 13,1 ct/kWh · DEW21</span><span class="badge" style="margin-left:auto">teuer</span></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:14px">
    <div style="flex:1;height:44px;border-radius:12px;background:var(--fill);display:flex;align-items:center;gap:8px;padding:0 12px" class="muted">${V.ic("search", 18)}<span>Nr. filtern</span></div>
    <div class="door-glyph" style="width:44px;height:44px;background:var(--fill);color:var(--ink)">${V.ic("crosshair", 20)}</div>
    <div class="pill" style="height:44px">Nur offene</div>
  </div>
  <div class="surface door-table" style="margin-top:12px">
    <div class="door-head"><span style="width:78px;text-align:center">Nr.</span><span style="flex:1">Stand</span><span style="text-transform:none;letter-spacing:0" data-k="open">12 von 24 offen</span></div>
    <div class="door-rows">${doors.map(S.doorRow).join("")}</div>
  </div>
</div>
${
  tray
    ? `<div class="tray glass-strong" style="bottom:100px">
  <div class="tray-target"><span class="door-lead on" style="margin:0" data-k="tray-n">3</span>
    <span style="flex:1;min-width:0"><b class="a-sub" style="display:block;font-weight:600" data-k="tray-title">Bahnhofstraße 3</b><span class="a-foot ink2" data-k="tray-meta">Noch nicht besucht</span></span>
    <span class="ink2">${V.ic("info", 20)}</span></div>
  <div class="tray-grid">
    <div class="tray-btn" data-b="nothome">${V.ic("door", 24)}<span>Nicht da</span></div>
    <div class="tray-btn" data-b="met">${V.ic("chat", 24)}<span>Ohne Abschluss</span></div>
    <div class="tray-btn" data-b="appt">${V.ic("calendar", 24)}<span>Termin</span></div>
    <div class="tray-btn primary" data-b="sale">${V.ic("external", 24)}<span>Auftrag starten</span></div>
  </div>
</div>`
    : ""
}
${tabs ? V.tabbar([["Klinken", "door"], ["Karte", "map"], ["Team", "users"], ["Profil", "avatar"]], 0) : ""}`;
    const rows = V.$$(app, ".door-row");
    return {
      rows,
      row: (n) => rows.find((r) => r.dataset.n === String(n)),
      tray: V.$(app, ".tray"),
      btn: (b) => V.$(app, `[data-b="${b}"]`),
      k: Object.fromEntries(V.$$(app, "[data-k]").map((n) => [n.dataset.k, n])),
      scroll: V.$(app, ".scroll"),
    };
  };

  /* --------------------------------- Team ---------------------------------- */

  S.feedPost = ({ name = "Jonas Carlsson", initials = "JC", tone = "purple", when = "gerade eben", product = "Strom + Gas", where = "Innenstadt Nord · Dortmund", nr = 25, likes = 0, comments = 0 } = {}) => `
<div class="surface post" style="padding:16px">
  <div style="display:flex;align-items:center;gap:12px">${V.avatar(initials, tone, 44)}<div style="flex:1"><div class="a-head">${name}</div><div class="a-foot muted">${when}</div></div><span class="muted">${V.ic("more", 20)}</span></div>
  <div style="display:flex;align-items:center;gap:14px;margin-top:14px">
    <span class="glyph-result" style="width:48px;height:48px">${V.ic("check", 26)}</span>
    <div style="flex:1"><div class="a-head" style="font-size:18px">Abschluss · ${product}</div><div class="a-foot muted">${where}</div></div>
    <span class="badge nr" style="font-size:14px;padding:4px 10px">Nr. ${nr}</span>
  </div>
  <div style="display:flex;gap:22px;margin-top:14px;padding-top:12px;border-top:.5px solid var(--sep)" class="ink2">
    <span style="display:flex;align-items:center;gap:6px">${V.ic("comment", 20)}<b data-k="comments" style="font-weight:500">${comments}</b></span>
    <span class="like" style="display:flex;align-items:center;gap:6px">${V.ic("heart", 20)}<b data-k="likes" style="font-weight:500">${likes}</b></span>
  </div>
  <div class="cheers" style="display:flex;gap:8px;margin-top:12px">
    <span class="pill" style="height:32px;font-size:14px">Glückwunsch!</span><span class="pill" style="height:32px;font-size:14px">Gut gemacht!</span>
  </div>
</div>`;

  S.team = (app, { tab = 0 } = {}) => {
    app.innerHTML = `
<div class="scroll pad" style="padding-top:62px">
  <div style="display:flex;justify-content:flex-end" class="ink2">${V.ic("users", 24)}</div>
  <div class="a-large">Team</div>
  <div class="a-sub muted" style="margin-top:2px"><span data-k="week">3</span> Abschlüsse im Team diese Woche</div>
  <div class="seg" style="margin-top:14px"><span class="${tab === 0 ? "on" : ""}">Feed</span><span class="${tab === 1 ? "on" : ""}">Rangliste</span><span class="${tab === 2 ? "on" : ""}">Erfolge</span></div>
  <div style="display:flex;gap:8px;margin-top:12px"><span class="pill on">Alle</span><span class="pill">Abonniert</span></div>
  <div class="feed" style="display:grid;gap:12px;margin-top:12px">
    <div class="newpost">${S.feedPost()}</div>
    ${S.feedPost({ name: "Sina Krause", initials: "SK", tone: "blue", when: "vor 2 Std.", product: "Strom", where: "Südviertel · Dortmund", nr: 18, likes: 6, comments: 2 })}
  </div>
</div>
${V.tabbar(V.TABS, 3)}`;
    return {
      newpost: V.$(app, ".newpost"),
      likes: V.$(app, '.newpost [data-k="likes"]'),
      comments: V.$(app, '.newpost [data-k="comments"]'),
      like: V.$(app, ".newpost .like"),
      cheers: V.$$(app, ".newpost .cheers .pill"),
      week: V.$(app, '[data-k="week"]'),
    };
  };
})();
