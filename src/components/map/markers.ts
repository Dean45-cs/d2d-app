/**
 * Die Marker der App - als DOM-Elemente, damit sie auf Apple Karten und auf
 * dem OpenStreetMap-Rueckfall gleich aussehen. Gestaltet in globals.css
 * (Abschnitt "Karten").
 */

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Rundes Nummernschild - Farbe allein soll nie die Kennzeichnung sein. */
export function badgeMarker(color: string, label: string, size = 28) {
  return {
    size: [size, size] as [number, number],
    element: () => {
      const node = el("span", "map-badge", label);
      node.style.background = color;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      if (label.length > 2) node.style.fontSize = "10px";
      return node;
    },
  };
}

/** Griff zum Ziehen (Mittelpunkt des Umkreises, Ecken einer Flaeche). */
export function handleMarker(color: string, size = 18) {
  return {
    size: [size + 12, size + 12] as [number, number],
    element: () => {
      // Groessere unsichtbare Flaeche drumherum: leichter mit dem Daumen zu treffen.
      const hit = el("span", "map-handle-hit");
      hit.style.width = `${size + 12}px`;
      hit.style.height = `${size + 12}px`;
      const dot = el("span", "map-handle");
      dot.style.background = color;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      hit.appendChild(dot);
      return hit;
    },
  };
}

/** Schriftzug auf einer Flaeche, z. B. "Vergeben: Nordstadt". */
export function labelMarker(text: string, width = 140) {
  return {
    size: [width, 22] as [number, number],
    element: () => {
      const wrap = el("span", "map-label-wrap");
      wrap.style.width = `${width}px`;
      wrap.appendChild(el("span", "map-label", text));
      return wrap;
    },
  };
}

/**
 * Preis-Pin der Energiekarte: Farbe = Preisstufe, Groesse = Abstand zum
 * Bundesschnitt. `open`: Ort ohne Preis - gestrichelt, zum Antippen und Eintragen.
 */
export function priceMarker(color: string, diameter: number, selected: boolean, open = false) {
  const box = Math.round(diameter + 8);
  return {
    size: [box, box] as [number, number],
    element: () => {
      const wrap = el("span", "map-price-wrap");
      wrap.style.width = `${box}px`;
      wrap.style.height = `${box}px`;
      const dot = el("span", `map-price${selected ? " is-selected" : ""}${open ? " is-open" : ""}`);
      dot.style.background = color;
      dot.style.width = `${diameter}px`;
      dot.style.height = `${diameter}px`;
      wrap.appendChild(dot);
      return wrap;
    },
  };
}

/** Der eigene Standort: blauer Punkt mit weissem Rand und sanftem Puls. */
export function userMarker() {
  return {
    size: [22, 22] as [number, number],
    element: () => {
      const wrap = el("span", "map-me");
      wrap.appendChild(el("span", "map-me-dot"));
      return wrap;
    },
  };
}
