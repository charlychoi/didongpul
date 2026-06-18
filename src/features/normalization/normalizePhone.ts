import crypto from "crypto";

export function hashPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.length < 8) return null;
  return crypto.createHash("sha256").update(cleaned).digest("hex").slice(0, 16);
}

export function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-***-${cleaned.slice(7)}`;
  }
  return "***-****-****";
}

export function maskName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length === 1) return "*";
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${"*".repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

export function makeVisitorKey(
  name: string | null | undefined,
  phone: string | null | undefined
): string | null {
  const p = phone?.replace(/\D/g, "");
  if (!p || p.length < 8) return null;
  const key = `${name?.trim() ?? ""}|${p}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 20);
}
