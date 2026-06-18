export type SheetType =
  | "master_visit_db"
  | "monthly_time_visit_detail"
  | "education_attendance_db"
  | "education_detail"
  | "manual_summary_reference"
  | "manual_education_summary_reference"
  | "survey_results"
  | "unknown";

export function classifySheet(sheetName: string): SheetType {
  const n = sheetName.trim();

  // 입퇴장/입장 내역 — 실제 파일에서 "입퇴장 내역", "입장내역" 등 다양한 표기 사용
  if (
    n.includes("입퇴장내역") ||
    n.includes("입퇴장 내역") ||
    n.includes("입장내역") ||
    n.includes("입장 내역")
  ) {
    return "master_visit_db";
  }
  if (n.includes("시간대별 방문자") || n.includes("시간대별방문자")) {
    return "monthly_time_visit_detail";
  }
  if (n.includes("신규소교육인원") || n.includes("교육인원 DB") || n.includes("교육인원DB")) {
    return "education_attendance_db";
  }
  if (
    n.includes("세부정보") ||
    n.includes("프로그램 이용") ||
    n.includes("프로그램 체험")
  ) {
    return "education_detail";
  }
  // 종합내역 — 입장/퇴장 포함 방문 종합 데이터
  if (n.includes("종합내역")) {
    return "master_visit_db";
  }
  if (n.includes("방문자수 관리") || n.includes("방문자수관리")) {
    return "manual_summary_reference";
  }
  if (n.includes("교육 참석인원") || n.includes("교육참석인원")) {
    return "manual_education_summary_reference";
  }
  if (n.includes("설문")) {
    return "survey_results";
  }
  return "unknown";
}

export const SHEET_TYPE_LABELS: Record<SheetType, string> = {
  master_visit_db: "입퇴장 원천 DB",
  monthly_time_visit_detail: "월별 시간대 방문 세부",
  education_attendance_db: "교육 참석 원천 DB",
  education_detail: "교육 세부 정보",
  manual_summary_reference: "수작업 요약 참고",
  manual_education_summary_reference: "수작업 교육 요약 참고",
  survey_results: "설문 결과",
  unknown: "알 수 없는 시트",
};
