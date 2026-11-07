import { requirePermission } from "@/lib/permissions";
import { handle, ValidationError } from "@/lib/api";
import { splitTable } from "@/lib/energy/table";
import { datesFromLabel, labelFromFileName, readCommissionTable } from "@/lib/commissions/table";
import { looksLikeXlsx, MAX_XLSX_BYTES, readXlsx, XlsxError } from "@/lib/commissions/xlsx";
import { previewCommissionImport } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

const MAX_TEXT = 2_000_000;

/** Excel speichert CSV unter Windows oft als ANSI - dann stimmen die Umlaute nicht. */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

/**
 * Liste lesen und zeigen, was sich aendern wuerde - gespeichert wird nichts.
 * Nimmt die Excel-Datei aus dem Portal (.xlsx), eine CSV-Datei oder aus
 * Excel kopierten Text.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("commissions.manage");
    const form = await request.formData();
    const file = form.get("file");
    let cells: string[][];
    let label = "";
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_XLSX_BYTES) throw new ValidationError("Die Datei ist zu groß (höchstens 10 MB).");
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        cells = looksLikeXlsx(bytes) ? readXlsx(bytes) : splitTable(decodeText(bytes));
      } catch (error) {
        if (error instanceof XlsxError) throw new ValidationError(error.message);
        throw error;
      }
      label = labelFromFileName(file.name);
    } else {
      const text = String(form.get("text") ?? "");
      if (!text.trim()) throw new ValidationError("Bitte eine Datei wählen oder die Tabelle einfügen.");
      if (text.length > MAX_TEXT) throw new ValidationError("Der eingefügte Text ist zu lang.");
      cells = splitTable(text);
    }
    const result = readCommissionTable(cells);
    if (result.error) throw new ValidationError(result.error);
    if (result.rows.length === 0) throw new ValidationError("In der Liste steht keine lesbare Zeile.");
    return {
      rows: result.rows,
      skipped: result.skipped.slice(0, 50),
      skippedCount: result.skipped.length,
      preview: previewCommissionImport(leader.team_id, result.rows),
      meta: { label, ...datesFromLabel(label) },
    };
  });
}
