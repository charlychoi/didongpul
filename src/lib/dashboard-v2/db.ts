export function getDashboardV2DatabaseStatus() {
  const v1Url = process.env.DATABASE_URL;
  const v2Url = process.env.V2_DATABASE_URL;

  if (!v2Url) {
    return {
      configured: false,
      isolated: true,
      message: "v2 is running in API-only mode. Set V2_DATABASE_URL before adding v2 persistence.",
    };
  }

  if (v1Url && v1Url === v2Url) {
    throw new Error("V2_DATABASE_URL must not be the same value as DATABASE_URL.");
  }

  return {
    configured: true,
    isolated: true,
    message: "v2 database is configured separately from v1.",
  };
}
