import crypto from "crypto";
import * as XLSX from "xlsx";
import { classifySheet, SheetType } from "./classifySheets";

export interface ParsedSheet {
  sheetName: string;
  sheetType: SheetType;
  rows: Record<string, unknown>[];
  headers: string[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  totalRows: number;
}

export function parseExcelBuffer(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheets: ParsedSheet[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const sheetType = classifySheet(sheetName);

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      { defval: null, raw: true }
    );

    const headers = getHeaders(worksheet);

    sheets.push({
      sheetName,
      sheetType,
      rows: rawRows,
      headers,
    });
    totalRows += rawRows.length;
  }

  return { sheets, totalRows };
}

function getHeaders(worksheet: XLSX.WorkSheet): string[] {
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = worksheet[cellAddr];
    headers.push(cell?.v != null ? String(cell.v) : "");
  }
  return headers;
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
