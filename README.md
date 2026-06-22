# 서울디지털동행플라자 통계 대시보드

Next.js 기반 관리자 대시보드입니다.

## 구성

- `v1`: `/dashboard/*` 엑셀 업로드 및 기존 API 동기화 기반 대시보드
- `v3`: `/dashboard-v3/*` 외부 API 데이터를 v3 전용 DB에 누적 저장한 뒤 조회하는 운영 의사결정 대시보드

v3 대상 센터는 기존 운영 범위와 동일하게 강동센터, 도봉센터, 동대문센터입니다.

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
DATABASE_URL=file:./dev-v1-placeholder.db
V3_DATABASE_URL=file:./didong-v3-local-warehouse.db
V3_DATABASE_AUTH_TOKEN=required-when-using-turso
V3_SYNC_SECRET=replace-with-v3-sync-secret
```

`DIDONG_API_KEY`는 서버에서만 사용하며 `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` 같은 브라우저 공개 prefix를 붙이면 안 됩니다.

`DATABASE_URL`은 기존 계정/인증 DB와의 호환용입니다. v3 원천 데이터, 동기화 로그, 일별/월별 집계는 반드시 `V3_DATABASE_URL`만 사용해야 하며, `DATABASE_URL`과 같은 값을 넣으면 안 됩니다.

운영 v3 DB는 Turso/libSQL을 기준으로 합니다. 운영 환경에서는 `V3_DATABASE_URL`을 `libsql://...` 형식으로 설정하고 `V3_DATABASE_AUTH_TOKEN`을 함께 등록해야 합니다. 자세한 절차는 [v3 Turso 설정 문서](docs/v3-turso-setup.md)를 확인하세요.

## v3 누적 동기화

v3는 외부 API를 매 화면마다 반복 조회하는 방식에서 벗어나, 아래 흐름으로 고도화합니다.

```text
Didong 외부 API -> dashboard_v3_raw_records 누적 저장 -> 일별/월별 요약 테이블 -> 대시보드 조회
```

로컬에서 특정 기간을 v3 DB에 적재하려면 다음 명령을 사용합니다.

```bash
npm run sync:v3 -- --start=2026-06-01 --end=2026-06-01 --center=ALL
```

v3 누적 DB 테이블을 초기화하려면 다음 명령을 사용합니다.

```bash
npm run db:v3:init
```

동기화 API는 `/api/v3/sync`이며, 운영 자동화에서는 `x-v3-sync-secret` 헤더에 `V3_SYNC_SECRET` 값을 넣어 호출합니다.

## v3 주요 경로

- `/dashboard-v3/overview`: 종합 현황
- `/dashboard-v3/centers`: 센터 비교
- `/dashboard-v3/visitors`: 방문자 분석
- `/dashboard-v3/programs`: 프로그램 분석
- `/dashboard-v3/satisfaction`: 만족도 분석
- `/dashboard-v3/marketing`: 홍보/웹 유입
- `/dashboard-v3/operations`: 운영 점검

프론트엔드는 `/api/v3/dashboard/*` 내부 API를 호출합니다. v3의 목표 구조는 외부 Didong API 원천 데이터를 먼저 v3 DB에 누적한 뒤, 저장된 원천/요약 데이터를 재사용하는 방식입니다.

## 검증

```bash
npm run lint
npm run test:v3-turso-config
npm run test:v3-warehouse-cache
npm run build
```
