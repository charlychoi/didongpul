const databaseUrl = process.env.V3_DATABASE_URL;
const authToken = process.env.V3_DATABASE_AUTH_TOKEN;
const nodeEnv = process.env.NODE_ENV || "development";

const errors = [];

if (!databaseUrl) {
  errors.push("V3_DATABASE_URL is missing.");
} else if (nodeEnv === "production" && !databaseUrl.startsWith("libsql://")) {
  errors.push("Production V3_DATABASE_URL must use a Turso/libSQL URL that starts with libsql://.");
}

if (databaseUrl?.startsWith("libsql://") && !authToken) {
  errors.push("V3_DATABASE_AUTH_TOKEN is required for Turso/libSQL.");
}

if (process.env.DATABASE_URL && databaseUrl && process.env.DATABASE_URL === databaseUrl) {
  errors.push("V3_DATABASE_URL must not be the same as DATABASE_URL.");
}

if (errors.length) {
  console.error("v3 Turso config check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("v3 Turso config check passed.");
