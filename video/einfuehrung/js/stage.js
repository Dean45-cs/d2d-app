/*
 * Die Buehne hinter und vor allen Szenen: Grund mit Polarlicht in der
 * Akzentfarbe, Lichtpartikel, Bodenraster, Vignette und Blitze.
 * Die Farbe folgt V.tintAt(t) - im Kapitel "Deine Farbe" wechselt sie mit.
 */
(function () {
  const V = window.V;
  const { el, set, clamp, E } = V;

  // Farbe der Buehne ueber die Zeit (Standard: Energie-Gruen). Szenen tragen
  // Bereiche ein: V.tints.push({ from, to, rgb, fade })
  V.tints = [];
  const GREEN = [48, 209, 88];
  V.tintAt = (t) => {
    let c = GREEN;
    for (const tint of V.tints) {
      if (t < tint.from - tint.fade || t > tint.to + tint.fade) continue;
      const k = Math.min(clamp((t - tint.from + tint.fade) / tint.fade), clamp((tint.to + tint.fade - t) / tint.fade));
      c = V.mix(c, tint.rgb, E.inOutSine(k));
    }
    return c;
  };

  // Blitze (weisses Licht beim Schnitt): V.flashes.push({ t, power })
  V.flashes = [];
  // Lichtstaerke der Buehne: V.dims.push({ from, to, level, fade })
  V.dims = [];
  const dimAt = (t) => {
    let level = 1;
    for (const d of V.dims) {
      if (t < d.from - d.fade || t > d.to + d.fade) continue;
      const k = Math.min(clamp((t - d.from + d.fade) / d.fade), clamp((d.to + d.fade - t) / d.fade));
      level = Math.min(level, V.lerp(1, d.level, E.inOutSine(k)));
    }
    return level;
  };
  // Bodenraster sichtbar: V.floors.push({ from, to })
  V.floors = [];

  V.layer({
    z: 0,
    build(root) {
      const base = el("div", "bg-base", root);
      const blobs = [
        { w: 1300, h: 900, x: -250, y: -380, k: 0.55, sp: 0.11, seed: 1 },
        { w: 1100, h: 800, x: 1100, y: 500, k: 0.42, sp: 0.09, seed: 2 },
        { w: 900, h: 700, x: 700, y: -100, k: 0.22, sp: 0.13, seed: 3 },
      ].map((b) => ({ ...b, node: el("div", "blob", root) }));
      blobs.forEach((b) => {
        b.node.style.width = `${b.w}px`;
        b.node.style.height = `${b.h}px`;
        b.node.style.left = `${b.x}px`;
        b.node.style.top = `${b.y}px`;
      });
      const floorWrap = el("div", "abs", root);
      floorWrap.style.cssText = "inset:0;perspective:900px;perspective-origin:50% 30%";
      const floor = el("div", "grid-floor", floorWrap);
      const canvas = el("canvas", "abs", root);
      canvas.width = V.W;
      canvas.height = V.H;
      canvas.style.cssText = "left:0;top:0;width:1920px;height:1080px";
      const rnd = V.rng(42);
      const dots = Array.from({ length: 140 }, () => ({
        x: rnd() * V.W,
        y: rnd() * V.H,
        r: 0.6 + Math.pow(rnd(), 3) * 5.5,
        vx: (rnd() - 0.5) * 14,
        vy: -6 - rnd() * 18,
        tw: rnd() * 6.28,
        a: 0.15 + rnd() * 0.55,
        depth: rnd(),
      }));
      return { base, blobs, floor, floorWrap, ctx: canvas.getContext("2d"), dots };
    },
    update(t, s) {
      const [r, g, b] = V.tintAt(t);
      const dim = dimAt(t);
      s.blobs.forEach((bl, i) => {
        const dx = Math.sin(t * bl.sp + bl.seed) * 140;
        const dy = Math.cos(t * bl.sp * 0.8 + bl.seed * 2) * 90;
        bl.node.style.background = `radial-gradient(closest-side, rgb(${r} ${g} ${b} / ${bl.k}), rgb(${r} ${g} ${b} / ${bl.k * 0.45}) 45%, rgb(${r} ${g} ${b} / ${bl.k * 0.12}) 75%, rgb(${r} ${g} ${b} / 0))`;
        set(bl.node, { x: dx, y: dy, s: 1 + Math.sin(t * 0.2 + i) * 0.08, o: dim });
      });
      s.base.style.background = `radial-gradient(120% 80% at 50% 110%, rgb(${r * 0.12} ${g * 0.2} ${b * 0.2}) 0%, rgb(${r * 0.04} ${g * 0.07} ${b * 0.07}) 40%, #010403 75%)`;

      // Bodenraster: faehrt langsam nach vorn
      let floorO = 0;
      for (const f of V.floors) {
        floorO = Math.max(floorO, Math.min(clamp((t - f.from) / 0.8), clamp((f.to - t) / 0.8)));
      }
      set(s.floorWrap, { o: floorO * dim });
      if (floorO > 0) {
        s.floor.style.transform = `rotateX(76deg) translateY(${((t * 60) % 80).toFixed(2)}px)`;
        s.floor.style.backgroundImage = `linear-gradient(rgb(${r} ${g} ${b} / 0.16) 1px, transparent 1px), linear-gradient(90deg, rgb(${r} ${g} ${b} / 0.16) 1px, transparent 1px)`;
      }

      // Lichtpartikel
      const ctx = s.ctx;
      ctx.clearRect(0, 0, V.W, V.H);
      ctx.globalCompositeOperation = "lighter";
      for (const d of s.dots) {
        const x = (((d.x + d.vx * t) % V.W) + V.W) % V.W;
        const y = (((d.y + d.vy * t * (0.5 + d.depth)) % V.H) + V.H) % V.H;
        const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + d.tw);
        const a = d.a * tw * dim;
        const rad = d.r * (1 + d.depth);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
        grad.addColorStop(0, `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 60)},${Math.min(255, b + 100)},${a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, rad * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });

  /* Vorderste Ebene: Vignette, Blitz, Kinobalken */
  V.layer({
    z: 1000,
    build(root) {
      el("div", "vignette", root);
      const flash = el("div", "flash", root);
      const top = el("div", "letterbox", root);
      top.style.top = "0";
      const bottom = el("div", "letterbox", root);
      bottom.style.bottom = "0";
      return { flash, top, bottom };
    },
    update(t, s) {
      let f = 0;
      for (const fl of V.flashes) {
        const lt = t - fl.t;
        if (lt < -0.06 || lt > 0.7) continue;
        const k = lt < 0 ? 1 + lt / 0.06 : Math.exp(-lt * 7);
        f = Math.max(f, k * (fl.power ?? 0.8));
      }
      s.flash.style.opacity = f.toFixed(3);
      s.flash.style.display = f > 0.002 ? "" : "none";
      // Kinobalken nur im Vorspann
      const lb = V.letterboxAt ? V.letterboxAt(t) : 0;
      s.top.style.height = s.bottom.style.height = `${(lb * 120).toFixed(1)}px`;
    },
  });
})();
