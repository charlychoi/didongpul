import { Client, createClient } from "@libsql/client";
import path from "path";

type CacheRecord = {
  expiresAt: number;
  value: unknown;
};

type V3DatabaseMode = "not_configured" | "local_file" | "turso";

const globalForV3Db = globalThis as unknown as {
  dashboardV3Db?: Client;
  dashboardV3DbReady?: Promise<void>;
};

function assertIsolatedV3Database() {
  const v1Url = process.env.DATABASE_URL;
  const v3Url = process.env.V3_DATABASE_URL;

  if (v1Url && v3Url && v1Url === v3Url) {
    throw new Error("V3_DATABASE_URL must not be the same value as DATABASE_URL.");
  }

  return v3Url;
}

function resolveV3DatabaseUrl(url: string) {
  if (process.env.NODE_ENV === "production" && url.startsWith("file:./")) {
    return `file:/tmp/${path.basename(url.slice("file:./".length))}`;
  }

  return url;
}

function getV3DatabaseMode(url?: string): V3DatabaseMode {
  if (!url) return "not_configured";
  if (url.startsWith("libsql://")) return "turso";
  return "local_file";
}

export function getDashboardV3DatabaseStatus() {
  const v3Url = assertIsolatedV3Database();
  const mode = getV3DatabaseMode(v3Url);

  if (!v3Url) {
    return {
      configured: false,
      isolated: true,
      mode,
      message: "v3 is running in API-only mode. Set V3_DATABASE_URL before adding v3 persistence.",
    };
  }

  if (mode === "turso" && !process.env.V3_DATABASE_AUTH_TOKEN) {
    throw new Error("V3_DATABASE_AUTH_TOKEN is required when V3_DATABASE_URL starts with libsql://.");
  }

  return {
    configured: true,
    isolated: true,
    mode,
    message:
      mode === "turso"
        ? "v3 warehouse is configured for Turso/libSQL."
        : "v3 warehouse is using a local file database.",
  };
}

export function getDashboardV3DbClient() {
  const rawUrl = assertIsolatedV3Database();
  if (!rawUrl) return null;
  const mode = getV3DatabaseMode(rawUrl);
  if (mode === "turso" && !process.env.V3_DATABASE_AUTH_TOKEN) {
    throw new Error("V3_DATABASE_AUTH_TOKEN is required when V3_DATABASE_URL starts with libsql://.");
  }
  const url = resolveV3DatabaseUrl(rawUrl);

  if (!globalForV3Db.dashboardV3Db) {
    globalForV3Db.dashboardV3Db = createClient({
      url,
      authToken: process.env.V3_DATABASE_AUTH_TOKEN,
    });
  }

  return globalForV3Db.dashboardV3Db;
}

async function ensureV3CacheTable(client: Client) {
  if (!globalForV3Db.dashboardV3DbReady) {
    globalForV3Db.dashboardV3DbReady = client.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_v3_api_cache (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(() => undefined);
  }

  await globalForV3Db.dashboardV3DbReady;
}

export async function getDashboardV3ApiCache(cacheKey: string): Promise<CacheRecord | null> {
  const client = getDashboardV3DbClient();
  if (!client) return null;

  await ensureV3CacheTable(client);
  const result = await client.execute({
    sql: "SELECT value_json, expires_at FROM dashboard_v3_api_cache WHERE cache_key = ? LIMIT 1",
    args: [cacheKey],
  });
  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await client.execute({
      sql: "DELETE FROM dashboard_v3_api_cache WHERE cache_key = ?",
      args: [cacheKey],
    });
    return null;
  }

  return {
    expiresAt,
    value: JSON.parse(String(row.value_json)),
  };
}

export async function setDashboardV3ApiCache(cacheKey: string, record: CacheRecord) {
  const client = getDashboardV3DbClient();
  if (!client) return;

  await ensureV3CacheTable(client);
  await client.execute({
    sql: `
      INSERT INTO dashboard_v3_api_cache (cache_key, value_json, expires_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        value_json = excluded.value_json,
        expires_at = excluded.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [cacheKey, JSON.stringify(record.value), record.expiresAt],
  });
}
