# 서울디지털동행플라자 통계 대시보드

Next.js 기반 관리자 대시보드입니다.

## 구성

- `v1`: `/dashboard/*` 엑셀 업로드 및 기존 API 동기화 기반 대시보드
- `v2`: `/dashboard-v2/*` 외부 API 직접 조회 기반 운영 의사결정 대시보드

v2 대상 센터는 기존 운영 범위와 동일하게 강동센터, 도봉센터, 동대문센터입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속하면 로그인 화면으로 이동합니다.

## 환경변수

`.env.example`을 참고해 서버 환경변수를 설정합니다.

```bash
DIDONG_API_BASE_URL=https://api.didong.kr/api
DIDONG_API_KEY=replace-with-server-side-api-key
SESSION_SECRET=replace-with-long-random-secret
DATABASE_URL=file:./dev.db
```

`DIDONG_API_KEY`는 서버에서만 사용하며 `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` 같은 브라우저 공개 prefix를 붙이면 안 됩니다.

## v2 주요 경로

- `/dashboard-v2/overview`: 종합 현황
- `/dashboard-v2/centers`: 센터 비교
- `/dashboard-v2/visitors`: 방문자 분석
- `/dashboard-v2/programs`: 프로그램 분석
- `/dashboard-v2/satisfaction`: 만족도 분석
- `/dashboard-v2/marketing`: 홍보/웹 유입
- `/dashboard-v2/operations`: 운영 점검

프론트엔드는 `/api/v2/dashboard/*` 내부 API만 호출하고, 외부 Didong API 호출 및 개인정보 마스킹은 서버에서 처리합니다.

## 검증

```bash
npm run lint
npm run build
```
