/*
 * Buehne der Akademie-Videos.
 *
 *   V.load(timeline)  baut alle Szenen einmal auf - die Zeiten kommen aus
 *                     render.ts (Sprache bestimmt den Takt).
 *   V.seek(t)         stellt jedes Element so, wie es in Sekunde t aussieht.
 *                     Gibt { moving, key } zurueck: steht alles still, ist das
 *                     Bild dasselbe wie beim letzten Aufruf mit gleichem key -
 *                     der Renderer nimmt dann das letzte Bild noch einmal.
 *
 * Reine Funktion der Zeit: kein Zufall, keine Uhr.
 */
(function () {
  "use strict";

  var ENTER = 0.75; // Einblenden eines Teils
  var POP = 0.7; // Zeichen springen etwas laenger
  var EXIT = 0.45; // Ausblenden der Szene, ueberlappt den Beginn der naechsten
  var STAGGER = 0.1; // Abstand der Teile beim Einblenden
  var LEAD = 0.12; // erster Teil nach Szenenbeginn
  var EARLY = 0.2; // Teile zu einem Absatz erscheinen kurz vor dem ersten Wort
  var DIM = 0.5; // Abblenden, wenn das Naechste kommt

  var PATHS = {
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M4.75 20c.7-3.6 3.6-6 7.25-6s6.55 2.4 7.25 6"/>',
    chat: '<path d="M5 18.5 3.5 21l.7-4A8 8 0 1 1 7.5 19.3"/><path d="M8.5 11h7M8.5 14h4"/>',
    ban: '<circle cx="12" cy="12" r="8.75"/><path d="m5.8 5.8 12.4 12.4"/>',
    pencil: '<path d="M4 20h4.25L19.4 8.85a2.12 2.12 0 0 0-3-3L5.25 17v3"/><path d="m14.75 7.5 3 3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.65-8.65"/><path d="m16.5 6.5 2.5 2.5M14 9l2 2"/>',
    shield:
      '<path d="M12 3.25 5 6v5.5c0 4.3 2.95 7.85 7 9.25 4.05-1.4 7-4.95 7-9.25V6l-7-2.75Z"/><path d="m9 12 2.1 2.1L15 10.2"/>',
    graduation:
      '<path d="M12 4.75 2.75 9.25 12 13.75l9.25-4.5L12 4.75Z"/><path d="M6.5 11.4v4.35c0 1.55 2.45 2.9 5.5 2.9s5.5-1.35 5.5-2.9V11.4"/><path d="M21.25 9.25v5"/>',
    check: '<path d="m4.75 12.75 4.5 4.5L19.25 6.75"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    i: '<path d="M12 10.5v7"/><circle cx="12" cy="6.4" r="1.25" fill="currentColor" stroke="none"/>',
    door:
      '<path d="M5.5 21V4.75A1.75 1.75 0 0 1 7.25 3h9.5a1.75 1.75 0 0 1 1.75 1.75V21"/><path d="M3.5 21h17"/><circle cx="15" cy="12.5" r="1.1" fill="currentColor" stroke="none"/>',
  };

  var LOGO =
    '<svg viewBox="10 10 80 80" aria-hidden="true"><path fill="currentColor" d="M82.5 50C82.54 54.25 81.74 58.52 80.17 62.5C78.6 66.47 76.24 70.15 73.26 73.26C70.28 76.37 66.68 78.91 62.71 80.68C58.74 82.45 54.39 83.44 50 83.57C45.61 83.7 41.16 82.95 37 81.38C32.84 79.8 28.97 77.39 25.69 74.31C22.41 71.22 19.73 67.47 17.86 63.31C15.99 59.16 14.95 54.61 14.82 50C14.69 45.39 15.49 40.74 17.16 36.4C18.84 32.06 21.4 28.03 24.65 24.65C27.9 21.27 31.85 18.53 36.19 16.65C40.53 14.78 45.25 13.79 50 13.75A7.25 7.25 0 0 1 50 28.25C47.15 28.21 44.29 28.73 41.62 29.76C38.94 30.8 36.45 32.35 34.34 34.34C32.22 36.32 30.48 38.73 29.25 41.41C28.02 44.08 27.31 47.01 27.18 50C27.05 52.99 27.52 56.02 28.55 58.88C29.59 61.74 31.21 64.42 33.29 66.71C35.38 68.99 37.95 70.88 40.8 72.21C43.66 73.54 46.8 74.3 50 74.43C53.2 74.56 56.45 74.04 59.49 72.9C62.53 71.77 65.36 70.01 67.75 67.75C70.14 65.49 72.08 62.74 73.41 59.7C74.75 56.66 75.46 53.34 75.5 50A3.5 3.5 0 0 1 82.5 50Z"/><circle cx="71.2" cy="28.8" r="6.75" fill="currentColor"/></svg>';

  // Symboltoene aus src/app/brand.css, dazu Gruen (Marke) und Rot (rote Linien).
  var TONES = {
    blue: ["#4a8af0", "#1d5fd1"],
    indigo: ["#7c76ea", "#4a42c4"],
    purple: ["#a874e0", "#7c45bd"],
    magenta: ["#dc64a2", "#b0387a"],
    teal: ["#2a9fb2", "#0b7385"],
    slate: ["#8390a3", "#545f74"],
    brown: ["#b2865a", "#835a33"],
    green: ["#46e38e", "#17a852"],
    red: ["#ff7a70", "#c9302c"],
  };

  var RULE_MARK = {
    do: { icon: "check", label: "So machen wir’s" },
    dont: { icon: "x", label: "Niemals" },
    info: { icon: "i", label: "Gut zu wissen" },
  };

  function svg(name, width) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (width || 1.75) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      PATHS[name] +
      "</svg>"
    );
  }
  function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function tile(icon, tone) {
    var colors = TONES[tone] || TONES.green;
    return (
      '<div class="tile" data-part data-anim="pop" style="--hi:' +
      colors[0] +
      ";--lo:" +
      colors[1] +
      '">' +
      svg(icon, 1.6) +
      "</div>"
    );
  }
  function tags(list, law) {
    if (!list.length) return "";
    return (
      '<div class="tags" data-part>' +
      list
        .map(function (text) {
          return '<span class="tag' + (law ? " law" : "") + '">' + (law !== undefined ? '<span class="dot"></span>' : "") + esc(text) + "</span>";
        })
        .join("") +
      "</div>"
    );
  }
  function ruleTag(tag) {
    if (!tag) return "";
    return tags([tag], tag.indexOf("Gesetz") === 0);
  }

  var BUILD = {
    title: function (v, video) {
      return (
        '<div class="scene' + (video.mood === "red" ? " red" : "") + '"><div class="safe"><div class="center-col">' +
        tile(v.icon, v.tone) +
        '<div class="eyebrow" data-part>' + esc(v.eyebrow) + "</div>" +
        '<div class="h1" data-part data-fit="250,72">' + esc(v.title) + "</div>" +
        '<div class="lead" data-part data-beat="1" data-fit="120,30">' + esc(v.text) + "</div>" +
        tags(v.chips) +
        "</div></div></div>"
      );
    },
    lesson: function (v) {
      return (
        '<div class="scene"><div class="numeral" data-part data-anim="fade">' + String(v.number).padStart(2, "0") + "</div>" +
        '<div class="safe"><div class="lesson">' +
        '<div class="eyebrow" data-part>' + esc(v.eyebrow) + "</div>" +
        '<div class="h1" data-part data-fit="240,72">' + esc(v.title) + "</div>" +
        '<div class="lead" data-part data-beat="1" data-fit="260,30">' + esc(v.text) + "</div>" +
        "</div></div></div>"
      );
    },
    rule: function (v) {
      var mark = RULE_MARK[v.rule] || RULE_MARK.info;
      return (
        '<div class="scene"><div class="safe"><div class="rule">' +
        '<div class="mark ' + v.rule + '" data-part data-anim="pop"><div class="ring">' + svg(mark.icon, v.rule === "info" ? 2.2 : 2.4) + "</div>" +
        '<div class="label">' + esc(mark.label) + "</div></div>" +
        '<div class="rule-body">' +
        '<div class="eyebrow muted" data-part>' + esc(v.eyebrow) + "</div>" +
        '<div class="statement" data-part data-fit="440,44">' + esc(v.text) + "</div>" +
        ruleTag(v.tag) +
        "</div></div></div></div>"
      );
    },
    example: function (v) {
      return (
        '<div class="scene"><div class="safe"><div class="example">' +
        '<div class="eyebrow" data-part>Beispiel an der Tür</div>' +
        '<div class="situation" data-part data-fit="130,34">' + svg("door", 1.9) + "<span>" + esc(v.situation) + "</span></div>" +
        '<div class="cards">' +
        '<div class="card wrong" data-part data-beat="1" data-dim-beat="2"><div class="head"><i>' + svg("x", 2.6) + "</i>So nicht</div>" +
        '<div class="quote" data-fit="290,28">' + esc(v.wrong) + "</div></div>" +
        '<div class="card right" data-part data-beat="2"><div class="head"><i>' + svg("check", 2.6) + "</i>So geht’s</div>" +
        '<div class="quote" data-fit="290,28">' + esc(v.right) + "</div></div>" +
        "</div></div></div></div>"
      );
    },
    points: function (v) {
      return (
        '<div class="scene"><div class="safe"><div class="points">' +
        '<div class="eyebrow" data-part>' + esc(v.eyebrow) + "</div>" +
        '<div class="h2" data-part>' + esc(v.title) + "</div>" +
        '<div class="point-list" data-fit-list="470">' +
        v.points
          .map(function (point, index) {
            return (
              '<div class="point" data-part data-beat="' + (index + 1) + '"><i>' + svg("check", 2.6) + "</i><span>" + esc(point) + "</span></div>"
            );
          })
          .join("") +
        "</div></div></div></div>"
      );
    },
    redline: function (v) {
      return (
        '<div class="scene red"><div class="safe"><div class="rule">' +
        '<div class="mark" data-part data-anim="pop"><div class="number-ring">' + v.number + "</div></div>" +
        '<div class="rule-body">' +
        '<div class="eyebrow" data-part>Rote Linie ' + v.number + " von " + v.total + "</div>" +
        '<div class="statement" data-part data-fit="440,44">' + esc(v.text) + "</div>" +
        ruleTag(v.tag) +
        "</div></div></div></div>"
      );
    },
    outro: function (v, video) {
      return (
        '<div class="scene' + (video.mood === "red" ? " red" : "") + '"><div class="safe"><div class="center-col">' +
        tile(v.icon, video.mood === "red" ? "red" : "green") +
        '<div class="eyebrow" data-part>' + esc(v.eyebrow) + "</div>" +
        '<div class="h1" data-part data-fit="250,72">' + esc(v.title) + "</div>" +
        '<div class="lead" data-part data-beat="1" data-fit="130,30">' + esc(v.text) + "</div>" +
        tags(v.chips) +
        "</div></div></div>"
      );
    },
  };

  function clamp(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  function easeOut(p) {
    return 1 - Math.pow(1 - p, 3);
  }
  function easeIn(p) {
    return p * p * p;
  }
  function backOut(p) {
    var c1 = 1.35;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  var moving = false;
  function progress(t, start, duration) {
    var p = clamp((t - start) / duration);
    if (p > 0 && p < 1) moving = true;
    return p;
  }

  function node(html) {
    var wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }

  /** Schrift verkleinern, bis der Text in seine Hoehe passt. */
  function fit(el, maxHeight, minSize) {
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight > maxHeight && size > minSize) {
      size -= 2;
      el.style.fontSize = size + "px";
    }
  }

  /** Liste als Ganzes einpassen: alle Eintraege gleich gross. */
  function fitList(list, maxHeight) {
    var items = list.children;
    var size = parseFloat(getComputedStyle(items[0]).fontSize);
    while (list.scrollHeight > maxHeight && size > 30) {
      size -= 2;
      for (var i = 0; i < items.length; i++) items[i].style.fontSize = size + "px";
    }
  }

  var scenes = [];
  var chrome = null;

  function load(timeline) {
    var stage = document.getElementById("stage");
    stage.innerHTML = "";
    stage.appendChild(node('<div class="bg' + (timeline.mood === "red" ? " red" : "") + '"></div>'));
    stage.appendChild(node('<div class="grain"></div>'));

    scenes = timeline.scenes.map(function (scene) {
      var root = node(BUILD[scene.visual.kind](scene.visual, timeline));
      stage.appendChild(root);
      root.style.display = "block";
      root.querySelectorAll("[data-fit]").forEach(function (el) {
        var spec = el.getAttribute("data-fit").split(",").map(Number);
        fit(el, spec[0], spec[1]);
      });
      root.querySelectorAll("[data-fit-list]").forEach(function (el) {
        fitList(el, Number(el.getAttribute("data-fit-list")));
      });

      var order = 0;
      var parts = Array.prototype.map.call(root.querySelectorAll("[data-part]"), function (el) {
        var beat = el.hasAttribute("data-beat") ? scene.beats[Number(el.getAttribute("data-beat"))] : null;
        var dimBeat = el.hasAttribute("data-dim-beat") ? scene.beats[Number(el.getAttribute("data-dim-beat"))] : null;
        var at = beat ? Math.max(scene.start + LEAD, beat.start - EARLY) : scene.start + LEAD + order++ * STAGGER;
        return {
          el: el,
          at: at,
          anim: el.getAttribute("data-anim") || "rise",
          dimAt: dimBeat ? Math.max(at + ENTER, dimBeat.start - EARLY) : null,
        };
      });
      root.style.display = "none";

      var events = [scene.start, scene.end];
      parts.forEach(function (part) {
        events.push(part.at);
        if (part.dimAt !== null) events.push(part.dimAt);
      });
      events.sort(function (a, b) {
        return a - b;
      });
      return {
        start: scene.start,
        end: scene.end,
        root: root,
        parts: parts,
        events: events,
        chrome: scene.visual.kind !== "title" && scene.visual.kind !== "outro",
      };
    });

    chrome = node(
      '<div class="chrome"><div class="chip' + (timeline.chip.tone === "red" ? " red" : "") + '"><b>' + esc(timeline.chip.badge) + "</b><span>" + esc(timeline.chip.label) + "</span></div>" +
        '<div class="brand">' + LOGO + "<span>Akademie</span></div></div>",
    );
    stage.appendChild(chrome);
    window.V.duration = timeline.duration;
  }

  function applyPart(part, t) {
    var p = progress(t, part.at, part.anim === "pop" ? POP : ENTER);
    var style = part.el.style;
    var opacity;
    if (part.anim === "pop") {
      var b = backOut(p);
      opacity = clamp(p * 2.4);
      style.transform = p < 1 ? "scale(" + (0.55 + 0.45 * b).toFixed(4) + ")" : "";
    } else if (part.anim === "fade") {
      opacity = easeOut(p);
    } else {
      var e = easeOut(p);
      opacity = e;
      style.transform = p < 1 ? "translateY(" + ((1 - e) * 46).toFixed(2) + "px)" : "";
    }
    if (part.dimAt !== null) opacity *= 1 - 0.5 * easeOut(progress(t, part.dimAt, DIM));
    style.opacity = opacity.toFixed(4);
  }

  function seek(t) {
    moving = false;
    var active = -1;
    for (var i = 0; i < scenes.length; i++) if (t >= scenes[i].start) active = i;

    for (var j = 0; j < scenes.length; j++) {
      var scene = scenes[j];
      var last = j === scenes.length - 1;
      var visible = t >= scene.start && (last ? t <= scene.end + EXIT : t < scene.end + EXIT);
      scene.root.style.display = visible ? "block" : "none";
      if (!visible) continue;
      var out = last ? 0 : easeIn(progress(t, scene.end, EXIT));
      scene.root.style.opacity = (1 - out).toFixed(4);
      scene.root.style.transform = out > 0 ? "translateY(" + (-26 * out).toFixed(2) + "px)" : "";
      for (var k = 0; k < scene.parts.length; k++) applyPart(scene.parts[k], t);
    }

    // Kopfzeile: nicht auf Titel und Abspann; blendet nur beim Wechsel.
    var current = scenes[Math.max(0, active)];
    var before = active > 0 ? scenes[active - 1] : null;
    var shown;
    if (current.chrome) shown = before && before.chrome ? 1 : easeOut(progress(t, current.start + LEAD, ENTER));
    else shown = before && before.chrome ? 1 - easeOut(progress(t, current.start, EXIT)) : 0;
    chrome.style.opacity = shown.toFixed(4);

    var passed = 0;
    if (current) for (var n = 0; n < current.events.length; n++) if (current.events[n] <= t) passed++;
    return { moving: moving, key: Math.max(0, active) + ":" + passed };
  }

  window.V = { load: load, seek: seek, duration: 0 };
})();
