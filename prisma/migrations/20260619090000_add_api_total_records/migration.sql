CREATE TABLE "api_total_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upload_batch_id" TEXT NOT NULL,
    "external_id" TEXT,
    "row_number" INTEGER NOT NULL,
    "center" TEXT,
    "visitor_name_masked" TEXT,
    "visitor_key" TEXT,
    "phone_hash" TEXT,
    "gender" TEXT,
    "age_group" INTEGER,
    "residence" TEXT,
    "entry_datetime" DATETIME,
    "exit_datetime" DATETIME,
    "visit_date" DATETIME,
    "way_to_come" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "raw_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_total_records_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "api_total_records_external_id_key" ON "api_total_records"("external_id");
