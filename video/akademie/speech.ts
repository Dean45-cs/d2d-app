/**
 * Text fuer die Sprachausgabe (Piper, deutsche Stimme "Thorsten").
 *
 * Die Untertitel zeigen den Text, wie er in der App steht. Gesprochen wird
 * eine aufbereitete Fassung: Abkuerzungen und Zeichen ausgeschrieben,
 * Fremdwoerter in Lautschrift ([[ ... ]] reicht Piper die Laute direkt
 * durch). Steht nach einem solchen Wort ein Satzzeichen, gehoert es mit in
 * die Klammer - sonst verschluckt Piper die Pause.
 */

/** Woerter, die die deutsche Stimme sonst falsch ausspricht. */
const LEXICON: Array<[RegExp, string]> = [
  [/Carlsson Sales([,.;:!?]?)/g, "[[kˈaɾlsɔn sˈeɪls$1]]"],
  [/WhatsApp([,.;:!?]?)/g, "[[vˈɔtsɛp$1]]"],
  [/\bApp\b/g, "Äpp"],
  [/\bFlyer\b/g, "Flaier"],
  [/\bTablet\b/g, "Täblet"],
  [/\bPINs\b/g, "Pins"],
  [/\bTANs\b/g, "Tans"],
];

/** Abkuerzungen, an denen kein Satz endet. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bz\. ?B\./g, "zum Beispiel"],
  [/\bu\. ?a\./g, "unter anderem"],
  [/\bd\. ?h\./g, "das heißt"],
  [/\bggf\./g, "gegebenenfalls"],
  [/\bbzw\./g, "beziehungsweise"],
  [/\bca\./g, "circa"],
];

/** Was die Stimme sprechen soll - aus dem Text, wie er angezeigt wird. */
export function speakable(text: string): string {
  let s = text;
  for (const [pattern, replacement] of ABBREVIATIONS) s = s.replace(pattern, replacement);
  s = s.replace(/&/g, " und ");
  s = s.replace(/\bMo\s*[–-]\s*Sa\b/g, "Montag bis Samstag");
  s = s.replace(/(\d)\s*[–-]\s*(\d)/g, "$1 bis $2");
  // 1.180 € -> 1180 Euro (sonst liest die Stimme den Punkt mit)
  s = s.replace(/(\d)\.(\d{3})\b/g, "$1$2");
  s = s.replace(/(\d)\s*%/g, "$1 Prozent");
  s = s.replace(/(\d)\s*€/g, "$1 Euro");
  // Notrufnummern sagt man Ziffer fuer Ziffer.
  s = s.replace(/\b112\b/g, "eins eins zwei").replace(/\b110\b/g, "eins eins null");
  s = s.replace(/§§/g, "Paragrafen").replace(/§/g, "Paragraf");
  s = s.replace(/\bkWh\b/g, "Kilowattstunde");
  // Anfuehrungszeichen spricht man nicht; Gedankenstrich und Klammer sind eine kurze Pause.
  s = s.replace(/[„“”"»«]/g, "");
  s = s.replace(/\s*[–—]\s*/g, ", ");
  s = s.replace(/\s*\(\s*/g, ", ").replace(/\s*\)/g, ",");
  s = s.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])(?:\s*[,;:])+/g, "$1");
  // Erst jetzt die Lautschrift: ein Satzzeichen dahinter wandert mit in die Klammer.
  for (const [pattern, replacement] of LEXICON) s = s.replace(pattern, replacement);
  return s.trim();
}

/**
 * Text in Saetze teilen - je Satz eine Aufnahme und ein Untertitel. Endet
 * ein Satz mitten in einem Zitat, schliesst er es und der naechste oeffnet
 * es wieder, damit jeder Untertitel fuer sich stimmt.
 */
export function sentences(text: string): string[] {
  // Abkuerzungen schuetzen, damit "z. B." keinen Satz beendet.
  const guarded = ABBREVIATIONS.reduce(
    (acc, [pattern]) => acc.replace(pattern, (match) => match.replace(/\./g, "\u0001")),
    text,
  );
  const parts = guarded
    .split(/(?<=[.!?][“"]?)\s+(?=[„"A-ZÄÖÜ0-9])/u)
    .map((part) => part.replace(/\u0001/g, ".").trim())
    .filter(Boolean);
  const result: string[] = [];
  let open = false;
  for (const part of parts) {
    let piece: string = open && !part.startsWith("„") ? `„${part}` : part;
    const opens: number = (piece.match(/„/g) ?? []).length;
    const closes: number = (piece.match(/“/g) ?? []).length;
    open = opens > closes;
    if (open) piece = `${piece}“`;
    result.push(piece);
  }
  return result;
}

/**
 * Untertitel hoechstens zweizeilig: lange Saetze teilen - moeglichst nah
 * an der Mitte und lieber an einem Komma oder vor einem Gedankenstrich als
 * mitten im Satzglied.
 */
export function captionChunks(sentence: string, max = 84): string[] {
  if (sentence.length <= max) return [sentence];
  const middle = sentence.length / 2;
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sentence.length - 1; i++) {
    if (sentence[i] !== " ") continue;
    const afterPunctuation = /[,;:]/.test(sentence[i - 1]);
    const beforeDash = sentence[i + 1] === "–";
    const score = Math.abs(i - middle) + (afterPunctuation || beforeDash ? 0 : 16);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best === -1) return [sentence];
  return [...captionChunks(sentence.slice(0, best).trim(), max), ...captionChunks(sentence.slice(best + 1).trim(), max)];
}
