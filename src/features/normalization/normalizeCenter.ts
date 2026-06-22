export const CENTERS = ["강동센터", "도봉센터", "동대문센터"] as const;
export type Center = (typeof CENTERS)[number];

const CENTER_MAP: Record<string, Center> = {
  강동: "강동센터",
  강동센터: "강동센터",
  도봉: "도봉센터",
  도봉센터: "도봉센터",
  동대문: "동대문센터",
  동대문센터: "동대문센터",
};

export function normalizeCenter(raw: string | null | undefined): Center | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return CENTER_MAP[trimmed] ?? null;
}
