/**
 * Profilbilder fuer die Mitarbeiter.
 *
 * Das Bild wird im Browser auf ein kleines Quadrat gerechnet und als
 * Data-URL gespeichert. So braucht die App keinen Dateispeicher, und das
 * Bild faehrt mit den Teamdaten mit - auch dorthin, wo an der Tuer kein
 * Netz ist.
 */

/** Kantenlaenge des gespeicherten Bildes. Mehr braucht eine Liste nicht. */
export const AVATAR_SIZE = 192;

/**
 * Bilddatei in ein quadratisches, kleines JPEG umrechnen.
 *
 * Aus der Mitte beschnitten: Portraetfotos vom Handy sind hochkant, und der
 * Kopf sitzt dort fast immer mittig.
 */
export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte eine Bilddatei auswählen.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await load(url);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("Das Bild konnte nicht gelesen werden.");

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Das Bild konnte nicht verarbeitet werden.");

    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Dieses Bildformat kennt der Browser nicht. Bitte JPEG oder PNG."));
    image.src = url;
  });
}
