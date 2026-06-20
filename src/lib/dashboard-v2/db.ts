import { Client, createClient } from "@libsql/client";
import path from "path";

type CacheRecord = {
  expiresAt: number;
  value: unknown;
};

const globalForV2Db = globalThis as unknown as {
  dashboardV2Db?: Client;
  dashboardV2DbReady?: Promise<void>;
};

function assertIsolatedV2Database() {
  const v1Url = process.env.DATABASE_URL;
  const v2Url = process.env.V2_DATABASE_URL;

  if (v1Url && v2Url && v1Url === v2Url) {
    throw new Error("V2_DATABASE_URL must not be the same value as DATABASE_URL.");
  }

  return v2Url;
}

function resolveV2DatabaseUrl(url: string) {
  if (process.env.NODE_ENV === "production" && url.startsWith("file:./")) {
    return `file:/tmp/${path.basename(url.slice("file:./".length))}`;
  }

  return url;
}

export function getDashboardV2DatabaseStatus() {
  const v2Url = assertIsolatedV2Database();

  if (!v2Url) {
    return {
      configured: false,
      isolated: true,
      message: "v2 is running in API-only mode. Set V2_DATABASE_URL before adding v2 persistence.",
    };
  }

  return {
    configured: true,
    isolated: true,
    message: "v2 database is configured separately from v1.",
  };
}

function getV2DbClient() {
  const rawUrl = assertIsolatedV2Database();
  if (!rawUrl) return null;
  const url = resolveV2DatabaseUrl(rawUrl);

  if (!globalForV2Db.dashboardV2Db) {
    globalForV2Db.dashboardV2Db = createClient({
      url,
      authToken: process.env.V2_DATABASE_AUTH_TOKEN,
    });
  }

  return globalForV2Db.dashboardV2Db;
}

async function ensureV2CacheTable(client: Client) {
  if (!globalForV2Db.dashboardV2DbReady) {
    globalForV2Db.dashboardV2DbReady = client.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_v2_api_cache (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(() => undefined);
  }

  await globalForV2Db.dashboardV2DbReady;
}

export async function getDashboardV2ApiCache(cacheKey: string): Promise<CacheRecord | null> {
  const client = getV2DbClient();
  if (!client) return null;

  await ensureV2CacheTable(client);
  const result = await client.execute({
    sql: "SELECT value_json, expires_at FROM dashboard_v2_api_cache WHERE cache_key = ? LIMIT 1",
    args: [cacheKey],
  });
  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await client.execute({
      sql: "DELETE FROM dashboard_v2_api_cache WHERE cache_key = ?",
      args: [cacheKey],
    });
    return null;
  }

  return {
    expiresAt,
    value: JSON.parse(String(row.value_json)),
  };
}

export async function setDashboardV2ApiCache(cacheKey: string, record: CacheRecord) {
  const client = getV2DbClient();
  if (!client) return;

  await ensureV2CacheTable(client);
  await client.execute({
    sql: `
      INSERT INTO dashboard_v2_api_cache (cache_key, value_json, expires_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        value_json = excluded.value_json,
        expires_at = excluded.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [cacheKey, JSON.stringify(record.value), record.expiresAt],
  });
}
