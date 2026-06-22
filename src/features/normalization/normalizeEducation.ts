export function normalizeAttendanceStatus(
  raw: string | null | undefined
): "참석" | "불참" | "미상" {
  if (!raw) return "미상";
  const v = raw.trim().toLowerCase();
  if (["o", "O", "출석", "참석", "y", "yes", "1"].includes(v.toUpperCase()) || v === "o") {
    return "참석";
  }
  if (["x", "결석", "불참", "n", "no", "0"].includes(v.toUpperCase()) || v === "x") {
    return "불참";
  }
  if (v === "o" || v === "출석" || v === "참석") return "참석";
  if (v === "x" || v === "결석" || v === "불참") return "불참";
  return "미상";
}
