// Excel serial date origin: 1899-12-30
const EXCEL_EPOCH = new Date(1899, 11, 30).getTime();
const MS_PER_DAY = 86400000;

export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH + serial * MS_PER_DAY);
}

export function parseExcelDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;

  if (typeof raw === "number") {
    if (raw > 40000 && raw < 60000) {
      return excelSerialToDate(raw);
    }
    return null;
  }

  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;

    // Handle Korean date formats like "2026-06-01 09:00:00"
    const match = trimmed.match(
      /(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (match) {
      const [, y, mo, day, h = "0", mi = "0", s = "0"] = match;
      return new Date(
        parseInt(y),
        parseInt(mo) - 1,
        parseInt(day),
        parseInt(h),
        parseInt(mi),
        parseInt(s)
      );
    }
  }

  return null;
}

export function parseMonthString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{2,4})[.년\-/]?\s*(\d{1,2})/);
  if (!match) return null;
  let year = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}
