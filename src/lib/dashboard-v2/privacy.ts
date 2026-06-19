export function maskName(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 1) return trimmed ? "*" : "";
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${"*".repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

export function maskContact(value?: string | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return value.replace(/\d/g, "*");
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function maskIp(value?: string | null) {
  if (!value) return "";
  const parts = value.split(".");
  if (parts.length !== 4) return value;
  return `${parts[0]}.${parts[1]}.***.***`;
}
