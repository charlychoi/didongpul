"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncLog {
  id: string;
  center: string;
  syncType: string;
  syncedFrom: string;
  syncedTo: string;
  recordsFetched: number;
  recordsInserted: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface Props {
  lastSyncLogs: SyncLog[];
}

export default function ApiSyncPanel({ lastSyncLogs }: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    // 마지막 성공 동기화의 syncedTo 날짜부터 이어서 시작 (데이터 공백 방지)
    const successLogs = lastSyncLogs.filter((l) => l.status === "success");
    if (successLogs.length > 0) {
      const latestSyncedTo = successLogs.map((l) => l.syncedTo).sort().at(-1);
      if (latestSyncedTo) return latestSyncedTo; // 마지막 동기화 종료일부터 재시작 (당일 신규 데이터 포함)
    }
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const CENTERS = [
    { code: 2, name: "강동센터" },
    { code: 3, name: "도봉센터" },
    { code: 4, name: "동대문센터" },
  ];

  // 날짜 범위를 최대 7일 청크로 분할 (Vercel Hobby 함수 시간 제한 대응)
  function getDateChunks(from: string, to: string) {
    const chunks: { from: string; to: string }[] = [];
    let cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(chunkEnd.getDate() + 6); // 7일 창
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      chunks.push({ from: cursor.toISOString().slice(0, 10), to: chunkEnd.toISOString().slice(0, 10) });
      cursor = new Date(chunkEnd);
      cursor.setDate(cursor.getDate() + 1);
    }
    return chunks;
  }

  const handleSync = async () => {
    setSyncing(true);
    setLastResult(null);
    let totalInserted = 0;
    const errors: string[] = [];
    const chunks = getDateChunks(fromDate, toDate);

    try {
      for (const chunk of chunks) {
        for (const center of CENTERS) {
          try {
            const res = await fetch("/api/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fromDate: chunk.from, toDate: chunk.to, centerCode: center.code }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              errors.push(`${center.name} (${chunk.from}~${chunk.to}): ${data?.error ?? res.status}`);
            } else {
              const r = data.result;
              totalInserted += (r?.visits?.inserted ?? 0) + (r?.surveys?.inserted ?? 0) + (r?.waitings?.inserted ?? 0);
            }
          } catch {
            errors.push(`${center.name} (${chunk.from}~${chunk.to}): 네트워크 오류`);
          }
        }
      }
      if (errors.length === 0) {
        setLastResult(`완료 — ${totalInserted.toLocaleString()}건 추가됨 (${fromDate} ~ ${toDate})`);
      } else {
        setLastResult(`완료(${totalInserted.toLocaleString()}건) / 일부 오류: ${errors.slice(0,2).join(", ")}${errors.length > 2 ? "…" : ""}`);
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">API 자동 동기화</h3>
          <p className="text-xs text-gray-500">디동 플랫폼에서 직접 데이터를 가져옵니다 · 마지막 동기화 이후 날짜 자동 추천</p>
        </div>
      </div>

      {/* 수동 동기화 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">시작일</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            disabled={syncing}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">종료일</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            disabled={syncing}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {syncing && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {syncing ? "동기화 중..." : "지금 동기화"}
        </button>
      </div>

      {lastResult && (
        <div className={`text-xs px-3 py-2 rounded-md mb-4 ${
          lastResult.startsWith("오류") || lastResult.startsWith("네트워크")
            ? "bg-red-50 text-red-700"
            : "bg-green-50 text-green-700"
        }`}>
          {lastResult}
        </div>
      )}

      {syncing && (
        <div className="text-xs text-gray-500 mb-4 bg-indigo-50 px-3 py-2 rounded-md">
          강동·도봉·동대문 3개 센터의 방문·설문·교육 데이터를 가져오고 있습니다.
          데이터 양에 따라 1~5분 소요될 수 있습니다.
        </div>
      )}

      {/* 동기화 이력 */}
      {lastSyncLogs.length > 0 && (
        <>
          <div className="text-xs font-medium text-gray-500 mb-2">센터별 마지막 동기화</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {lastSyncLogs.map((log) => (
              <div
                key={log.id}
                className={`rounded-md border px-3 py-2 text-xs ${
                  log.status === "success"
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="font-medium text-gray-700 mb-0.5">{log.center}</div>
                <div className="text-gray-500">
                  {new Date(log.createdAt).toLocaleString("ko-KR")}
                </div>
                {log.status === "success" ? (
                  <div className="text-green-700 mt-0.5">
                    +{log.recordsInserted.toLocaleString()}건 추가
                  </div>
                ) : (
                  <div className="text-red-600 mt-0.5">실패: {log.errorMessage?.slice(0, 40)}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
