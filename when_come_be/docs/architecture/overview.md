# 백엔드 서비스 구조도

> 아키텍처 변경 시 자동 업데이트됨

## 레이어 구조
Request → Edge Function → _shared (auth/error/client) → Supabase DB / ODsay API

## 폴더 구조
```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── cors.ts          ← CORS 헤더
│   │   ├── auth.ts          ← JWT 검증
│   │   ├── error.ts         ← 에러 처리
│   │   └── odsayClient.ts   ← ODsay API 클라이언트
│   ├── search-stops/        ← 정류장 검색
│   ├── arrival-info/        ← 실시간 도착정보
│   ├── route-search/        ← 경로탐색
│   ├── stop-routes/         ← 정류장 노선 목록 (서울 버스 API)
│   └── routes/              ← 사용자 경로 CRUD
├── migrations/              ← DB 스키마
└── seed.sql
docs/
├── architecture/
│   └── overview.md
├── decisions/               ← ADR
├── tech-notes/
├── ideas/
└── collab-notes.md          ← 프론트와 협업 노트
```

## 도메인
| 도메인 | Function | 설명 |
|--------|----------|------|
| stops | search-stops | 정류장/역 검색 (ODsay) |
| stop-routes | stop-routes | 정류장 노선 목록 (서울 버스 API `getRouteByStation`) |
| arrival | arrival-info | 실시간 도착정보 (서울 버스/지하철 API, ODsay fallback) |
| route-search | route-search | 대중교통 경로탐색 (ODsay) |
| routes | routes | 사용자 저장 경로 CRUD |

## DB 테이블
| 테이블 | 설명 |
|--------|------|
| routes | 사용자 저장 출퇴근 경로 |
| route_stops | 경로 내 정류장/역 (순서 있음). 지하철 stop은 방향 컬럼 3개 보유: `direction_headsign` (예: `"장암행"`), `direction_updn` (`up`/`down`, CHECK), `direction_next_stop` (ODsay `endName`, 디버그용). 모두 nullable — legacy/버스 row는 NULL. |
| stop_routes | 정류장에서 탈 수 있는 노선 목록 |
