import { inflateRawSync } from "node:zlib";

/*
 * Excel-Dateien (.xlsx) lesen - nur so viel, wie eine Liste aus dem Portal
 * braucht: die Zellen des ersten Blatts als Text. Ohne zusaetzliche
 * Bibliothek: eine .xlsx ist ein ZIP-Archiv mit XML darin.
 *
 * Gegen praeparierte Dateien gedeckelt: Groesse der Datei, Zahl der
 * Eintraege und entpackte Groesse je Eintrag. Formeln werden nicht
 * berechnet - es zaehlt der zuletzt gespeicherte Wert.
 */

/** Groesste Datei, die angenommen wird - der Export hat rund 20 KB. */
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_CELLS = 200_000;

export class XlsxError extends Error {}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

/** Beginnt mit "PK\x03\x04" - ein ZIP-Archiv und damit vermutlich eine .xlsx. */
export function looksLikeXlsx(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

function readEntries(buffer: Buffer): Map<string, ZipEntry> {
  // Ende des Inhaltsverzeichnisses: in den letzten 64 KB (plus Kommentar) von hinten suchen.
  const min = Math.max(0, buffer.length - 65557);
  let end = -1;
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new XlsxError("Die Datei ist keine gültige Excel-Datei.");
  const count = buffer.readUInt16LE(end + 10);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES) throw new XlsxError("Die Excel-Datei ist zu umfangreich.");

  const entries = new Map<string, ZipEntry>();
  let pos = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50) {
      throw new XlsxError("Die Excel-Datei ist beschädigt.");
    }
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const size = buffer.readUInt32LE(pos + 24);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const offset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString("utf8", pos + 46, pos + 46 + nameLength);
    entries.set(name, { name, method, compressedSize, size, offset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  if (entry.size > MAX_ENTRY_BYTES || entry.compressedSize === 0xffffffff) {
    throw new XlsxError("Die Excel-Datei ist zu umfangreich.");
  }
  const local = entry.offset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) {
    throw new XlsxError("Die Excel-Datei ist beschädigt.");
  }
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method !== 8) throw new XlsxError("Die Excel-Datei ist in einem unbekannten Format gepackt.");
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8");
  } catch {
    throw new XlsxError("Die Excel-Datei ließ sich nicht entpacken.");
  }
}

/** XML-Entitaeten und die _xHHHH_-Zeichen von Excel. */
function decode(text: string): string {
  return text
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (all, code: string) => {
      const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
      if (named[code.toLowerCase()]) return named[code.toLowerCase()];
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : all;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Text aus <t>-Elementen, ohne Lautschrift (<rPh>) japanischer Dateien. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const match of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += match[1] ?? "";
  return decode(out);
}

function attribute(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? decode(match[1]) : undefined;
}

/** "AB12" -> 27 (Spalte, ab 0). */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function firstSheetPath(entries: Map<string, ZipEntry>, buffer: Buffer): string {
  const fallback = "xl/worksheets/sheet1.xml";
  const workbook = entries.get("xl/workbook.xml");
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return fallback;
  const sheet = readEntry(buffer, workbook).match(/<sheet\b([^>]*)\/?>/);
  const id = sheet ? attribute(sheet[1], "r:id") : undefined;
  if (!id) return fallback;
  for (const match of readEntry(buffer, rels).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    if (attribute(match[1], "Id") !== id) continue;
    const target = attribute(match[1], "Target") ?? "";
    if (!target) break;
    return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  return fallback;
}

/** Zahlen wie in Excel angezeigt, aber ohne Rundungsreste ("82.49999999999999" -> "82.5"). */
function numberText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Number(n.toPrecision(12)));
}

/**
 * Das erste Blatt einer .xlsx als Zeilen von Texten. Leere Zellen sind "",
 * fehlende Zeilen werden zu leeren Zeilen, damit Zeilennummern stimmen.
 */
export function readXlsx(input: Uint8Array): string[][] {
  if (input.length > MAX_XLSX_BYTES) throw new XlsxError("Die Datei ist zu groß.");
  const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!looksLikeXlsx(buffer)) throw new XlsxError("Die Datei ist keine Excel-Datei (.xlsx).");
  const entries = readEntries(buffer);

  const shared: string[] = [];
  const strings = entries.get("xl/sharedStrings.xml");
  if (strings) {
    for (const match of readEntry(buffer, strings).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
      shared.push(textOf(match[1] ?? ""));
    }
  }

  const sheet = entries.get(firstSheetPath(entries, buffer));
  if (!sheet) throw new XlsxError("Die Excel-Datei enthält kein Tabellenblatt.");
  const xml = readEntry(buffer, sheet);

  const rows: string[][] = [];
  let cells = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowMatch[1], "r")) || rows.length + 1;
    const row: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (++cells > MAX_CELLS) throw new XlsxError("Die Excel-Datei ist zu umfangreich.");
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attribute(attrs, "r");
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      if (index < 0 || index > 16383) continue;
      const type = attribute(attrs, "t");
      const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(inner.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (type === "str" || type === "e") value = decode(raw ?? "");
      else if (type === "b") value = raw === "1" ? "1" : "0";
      else if (raw !== undefined) value = numberText(decode(raw));
      while (row.length < index) row.push("");
      row[index] = value.trim();
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = row;
  }
  return rows;
}
