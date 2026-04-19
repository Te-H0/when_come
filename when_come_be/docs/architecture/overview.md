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
| arrival | arrival-info | 실시간 도착정보 (ODsay) |
| route-search | route-search | 대중교통 경로탐색 (ODsay) |
| routes | routes | 사용자 저장 경로 CRUD |

## DB 테이블 (설계 예정)
- users (Supabase Auth 관리)
- routes (저장 경로)
- stops (경로 내 정류장)
