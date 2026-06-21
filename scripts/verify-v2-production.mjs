const baseUrl = process.env.V2_PRODUCTION_URL || "https://didongpul-dashboard.vercel.app";

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  const text = await response.text();
  return { response, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const login = await fetchText("/login");
assert(login.response.ok, `/login 응답 실패: ${login.response.status}`);
assert(login.text.includes('label for="email"'), "로그인 아이디 라벨을 찾지 못했습니다.");
assert(login.text.includes(">아이디<"), "로그인 라벨이 '아이디'가 아닙니다.");
assert(login.text.includes('type="text"'), "로그인 입력칸이 text 타입이 아닙니다.");
assert(!login.text.includes('type="email"'), "로그인 입력칸에 email 타입이 남아 있습니다.");
assert(login.text.includes("noValidate") || login.text.includes("novalidate"), "로그인 폼에 noValidate가 없습니다.");

const apiPath = "/api/v2/dashboard/members?start_date=2026-06-14&end_date=2026-06-20&center=ALL";
const api = await fetchText(apiPath);
assert(api.response.status === 401, `비로그인 v2 API 응답이 401이 아닙니다: ${api.response.status}`);

let apiJson;
try {
  apiJson = JSON.parse(api.text);
} catch {
  throw new Error("v2 API가 JSON이 아닌 응답을 반환했습니다.");
}

assert(apiJson?.error === "인증이 필요합니다.", "v2 API 인증 오류 메시지가 예상과 다릅니다.");

console.log(`v2 production verification passed: ${baseUrl}`);
