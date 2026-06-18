-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "center_scope" TEXT NOT NULL DEFAULT 'ALL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_login_at" DATETIME
);

-- CreateTable
CREATE TABLE "upload_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "original_filename" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" TEXT NOT NULL DEFAULT 'excel_upload',
    "target_month" TEXT,
    "detected_sheets_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "row_count_total" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upload_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "raw_excel_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upload_batch_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "raw_excel_rows_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "raw_visit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upload_batch_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "center_raw" TEXT,
    "name_raw" TEXT,
    "phone_raw" TEXT,
    "entry_datetime_raw" TEXT,
    "exit_datetime_raw" TEXT,
    "date_raw" TEXT,
    "entry_hour_raw" TEXT,
    "exit_hour_raw" TEXT,
    "visit_check_raw" TEXT,
    "year_raw" TEXT,
    "month_raw" TEXT,
    "raw_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "raw_visit_logs_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clean_visit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "raw_visit_id" TEXT NOT NULL,
    "center" TEXT NOT NULL,
    "visitor_name_masked" TEXT,
    "visitor_key" TEXT,
    "phone_hash" TEXT,
    "entry_datetime" DATETIME,
    "exit_datetime" DATETIME,
    "visit_date" DATETIME,
    "entry_hour" INTEGER,
    "exit_hour" INTEGER,
    "stay_minutes" REAL,
    "stay_hours" REAL,
    "year" INTEGER,
    "month" INTEGER,
    "weekday" INTEGER,
    "is_long_stay" BOOLEAN NOT NULL DEFAULT false,
    "is_invalid_stay" BOOLEAN NOT NULL DEFAULT false,
    "is_duplicate_suspected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "clean_visit_logs_raw_visit_id_fkey" FOREIGN KEY ("raw_visit_id") REFERENCES "raw_visit_logs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "education_attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upload_batch_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "center" TEXT,
    "category" TEXT,
    "program_name" TEXT,
    "education_date" DATETIME,
    "start_time" TEXT,
    "end_time" TEXT,
    "status_note" TEXT,
    "participant_name_masked" TEXT,
    "participant_key" TEXT,
    "phone_hash" TEXT,
    "email_hash" TEXT,
    "attendance_status" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "raw_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "education_attendance_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_center_summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "center" TEXT NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "unique_visitor_count" INTEGER NOT NULL DEFAULT 0,
    "new_visitor_count" INTEGER NOT NULL DEFAULT 0,
    "repeat_visitor_count" INTEGER NOT NULL DEFAULT 0,
    "avg_stay_minutes" REAL,
    "median_stay_minutes" REAL,
    "long_stay_count" INTEGER NOT NULL DEFAULT 0,
    "entry_9_count" INTEGER NOT NULL DEFAULT 0,
    "entry_10_count" INTEGER NOT NULL DEFAULT 0,
    "entry_11_count" INTEGER NOT NULL DEFAULT 0,
    "entry_12_count" INTEGER NOT NULL DEFAULT 0,
    "entry_13_count" INTEGER NOT NULL DEFAULT 0,
    "entry_14_count" INTEGER NOT NULL DEFAULT 0,
    "entry_15_count" INTEGER NOT NULL DEFAULT 0,
    "entry_16_count" INTEGER NOT NULL DEFAULT 0,
    "entry_17_count" INTEGER NOT NULL DEFAULT 0,
    "entry_18_count" INTEGER NOT NULL DEFAULT 0,
    "entry_19_count" INTEGER NOT NULL DEFAULT 0,
    "entry_20_count" INTEGER NOT NULL DEFAULT 0,
    "entry_21_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "monthly_center_summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "center" TEXT NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "unique_visitor_count" INTEGER NOT NULL DEFAULT 0,
    "avg_visits_per_visitor" REAL,
    "avg_daily_visit_count" REAL,
    "avg_stay_minutes" REAL,
    "long_stay_count" INTEGER NOT NULL DEFAULT 0,
    "education_attendance_count" INTEGER NOT NULL DEFAULT 0,
    "top_program_name" TEXT,
    "data_quality_score" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "data_quality_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upload_batch_id" TEXT NOT NULL,
    "issue_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sheet_name" TEXT,
    "row_number" INTEGER,
    "column_name" TEXT,
    "raw_value" TEXT,
    "normalized_value" TEXT,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_quality_logs_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clean_visit_logs_raw_visit_id_key" ON "clean_visit_logs"("raw_visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_center_summary_date_center_key" ON "daily_center_summary"("date", "center");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_center_summary_year_month_center_key" ON "monthly_center_summary"("year", "month", "center");
