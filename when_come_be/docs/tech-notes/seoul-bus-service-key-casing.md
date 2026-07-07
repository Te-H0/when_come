# 서울 버스 API `serviceKey` 파라미터 소문자 전환 (2026-07-07)

## 증상

2026-07-07 오전~오후 종일 prod에서 버스 도착정보 전면 실패. `anomaly_logs` 39건 전부 동일:

```
seoul-bus getStationByUid HTTP 401
```

지하철은 정상, 경기 버스도 UX상 실패 (2026-05-12 정책으로 서울 bbox 내 경기 노선이 서울 BIS로 조회되도록 저장되어 있어, 서울 API가 죽으면 유저 눈엔 둘 다 죽어 보임).

## 원인

서울시가 `ws.bus.go.kr` API 스펙에서 쿼리 파라미터 이름의 대소문자 판정을 강화. 이전엔 `ServiceKey=...`로도 통했는데 이제 소문자 `serviceKey=...`만 허용. 서버 응답:

```json
{"error":"Unauthorized","message":"serviceKey 파라미터가 필요합니다.","status":401}
```

키 자체는 유효(공공데이터포털 활용신청 승인 상태, 만료 2028-02-18). 파라미터명이 인식되지 않아 인증키가 전달되지 않은 것으로 간주.

## 수정

BE 5곳 `ServiceKey=` → `serviceKey=` 소문자 변경:

- `_shared/arrivalProvider.ts:127` (SeoulBusProvider — getStationByUid)
- `arrival-info/index.ts:183` (legacy getArrInfoByRoute)
- `arrival-info/index.ts:231` (legacy getStationByUid)
- `search-stops/index.ts:33` (ARS→역명 조회)
- `stop-buses/index.ts:46` (getRouteByStation)

`stop-routes/index.ts`는 이미 소문자로 되어 있어 이 함수만 영향 없었음(우연).
`gbisClient.ts`는 GBIS(경기) 자체 서비스로 별개, 처음부터 소문자.

## 교훈

- 서울시가 공지 없이 파라미터 대소문자 판정을 조인 것으로 보임. 다른 공공 API도 유사 변경 가능성.
- `anomaly_logs`가 있어서 원인 파악까지 5분 걸림 — fire-and-forget 로깅 인프라의 실효성 재확인.
- 재발 방지: `_shared/`에 서울 버스 API 호출을 한 군데로 모으고 URL builder를 함수화하는 게 나음(현재 5곳 흩어짐). 백로그 후보.
- 배포 이슈: 첫 배포 트리거(sha c01c9ff)에서 `supabase/setup-cli@v1` 액션이 transient 실패. 재트리거로 복구.
