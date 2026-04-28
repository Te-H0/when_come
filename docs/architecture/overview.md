# when_come 시스템 구조도

> 아키텍처 변경 시 업데이트

## 전체 레이어

```
[FE: React/Vite]
    └─ Supabase Client (Auth + DB)
    └─ Edge Functions (API 프록시)
            └─ ODsay API
            └─ 서울 버스 API (ws.bus.go.kr)
            └─ 서울 지하철 API (swopenapi)
            └─ 네이버 지도 API

[BE: Supabase Edge Functions]
    └─ _shared/ (auth, cors, error, odsayClient)
    └─ Functions: search-stops, arrival-info, route-search, routes, stop-buses, place-search
    └─ PostgreSQL DB (RLS 적용)
```

## FE 폴더 구조

```
when_come_fe/src/
├── features/
│   ├── home/     — 활성 경로 대시보드
│   ├── setup/    — 경로 생성/편집
│   └── route/    — 저장된 경로 관리
├── components/ui/ — shadcn/ui 컴포넌트
├── lib/           — API 클라이언트, supabase, mock 데이터
├── utils/         — transitColors 등
└── styles/        — Tailwind v4 테마
```

## BE 폴더 구조

```
when_come_be/supabase/
├── functions/
│   ├── _shared/   — cors, auth, error, odsayClient
│   ├── _tests/    — 전체 테스트
│   ├── search-stops/
│   ├── arrival-info/
│   ├── route-search/
│   ├── routes/
│   ├── stop-buses/
│   └── place-search/
└── migrations/    — DB 스키마 이력
```

## DB 테이블

| 테이블 | 설명 |
|--------|------|
| `routes` | 사용자 저장 경로 (RLS: user_id) |
| `route_stops` | 경로 내 정류장/역 (sequence 순서) |
| `stop_routes` | 정류장 노선 목록 (캐시) |

## 상태 관리

| 상태 종류 | 도구 | 비고 |
|-----------|------|------|
| 서버 상태 | TanStack Query | API 연동 후 적용 (현재 mock) |
| 클라이언트 전역 | Zustand | 필요 시 도입 |
| 지역 UI | useState | 현재 전체 상태 |
