-- API sync 추적 테이블
CREATE TABLE "api_sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "center" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL DEFAULT 'visits',
    "synced_from" TEXT NOT NULL,
    "synced_to" TEXT NOT NULL,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_inserted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- raw_visit_logs에 외부 ID 추가 (중복 방지)
ALTER TABLE "raw_visit_logs" ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "raw_visit_logs_external_id_key" ON "raw_visit_logs"("external_id") WHERE "external_id" IS NOT NULL;

-- survey_responses에 외부 ID 추가
ALTER TABLE "survey_responses" ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "survey_responses_external_id_key" ON "survey_responses"("external_id") WHERE "external_id" IS NOT NULL;

-- education_attendance에 외부 ID 추가
ALTER TABLE "education_attendance" ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "education_attendance_external_id_key" ON "education_attendance"("external_id") WHERE "external_id" IS NOT NULL;
