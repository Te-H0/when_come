# 서울 bbox 경기버스 도착정보 누락 버그 분석 및 수정

날짜: 2026-05-12

## 증상

"현대아파트.개봉중앙시장"(ARS 17209) 같은 서울 bbox 내 정류장에 경기버스(1번, 11번, 22번 등)만 등록돼 있으면 모든 노선이 "도착 정보 없음"으로 표시됨.

비교: 같은 상태(provider='seoul', gbis_station_id=NULL)인 "대원주유소"(ARS 17207)는 정상 작동. 이유는 거기에 마을버스와 일반버스가 함께 있어 Seoul BIS 호출이 트리거됨.

## 진짜 원인

### 저장 시점 버그

`stop_routes.provider`를 결정하는 `resolveStopRouteProviderOnSave`가 ODsay busType 6(경기버스)이면 stopProvider와 무관하게 무조건 `'gyeonggi'`를 반환했음.

서울 bbox 정류장(`gbis_station_id=NULL`)에 경기버스만 등록되면:
- 모든 stop_routes가 provider='gyeonggi'로 저장됨
- 도착 조회 시 GyeonggiBusProvider를 시도
- `canHandle(ctx)`: `gbisStationId=NULL` → `false` → 조용히 스킵
- 결과: 도착정보 0건 = "도착 정보 없음"

### 근본 오해

"경기버스이면 GBIS로 조회해야 한다"는 가정이 틀렸음. Seoul BIS `getStationByUid`는 해당 ARS 정류장을 지나는 **모든 버스의 도착정보**를 반환한다. 여기에는 경기버스도 포함된다. GBIS가 필요한 경우는 오직 **경기도 정류소**(gbis_station_id 있음)에 대해서만이다.

## 수정 내용

### 원칙 정립

`stop_routes.provider`는 "실제 호출될 API"를 정확히 반영해야 한다:

| stopProvider | 노선 종류 | stop_routes.provider |
|---|---|---|
| gyeonggi (GBIS 정류소 찾음) | 경기버스 | gyeonggi |
| seoul (서울 bbox, GBIS 없음) | 경기버스 | **seoul** (Seoul BIS가 처리) |
| odsay_fallback | 모든 버스 | odsay_fallback |

### 파일별 수정

1. **`routes/index.ts`** - `resolveStopRouteProviderOnSave`:
   - busType===6 무조건 'gyeonggi' → stopProvider='gyeonggi'인 경우만 'gyeonggi'
   - stopProvider='seoul'이면 경기버스도 'seoul'로 다운그레이드
   - busType===8(Seoul BIS 광역버스 타입) 추가

2. **`favorite-stops/index.ts`** - `routeIdToProvider` 함수를 `resolveStopRouteProviderOnSave`로 교체:
   - POST 시 resolved stopProvider 전달
   - PATCH 시 기존 row에서 provider 읽어 전달

3. **`_shared/regionMapper.ts`** - `hasGyeonggiRouteHint`에 busType===8 추가:
   - 수동 정류장 추가 경로에서 Seoul BIS API busRouteType 8로 오는 광역버스 hint 포함

4. **`arrival-info/index.ts`** - `resolveStopRouteProvider` 런타임 안전망:
   - `sr.provider='gyeonggi'` + `gbis_station_id=NULL` + `ars_id 있음` → 'seoul'로 강등
   - 저장 시 잘못 기록된 기존 데이터 + 마이그레이션 이후 엣지케이스 방어

5. **마이그레이션** `20260512000000_demote_gyeonggi_to_seoul_when_gbis_missing.sql`:
   - 기존 잘못 저장된 stop_routes, favorite_stop_routes 일괄 정정

## busType 8 추가 이유

Seoul BIS API의 `busRouteType` 필드는 8이 광역버스. `seoulBisTypeToOdsayBusType` 변환 후 ODsay busType 8로 도착하는 경우가 있음. 이전에 hint에서 빠져 있어 서울 bbox에서 GBIS 조회를 아예 시도하지 않는 케이스가 있었음. busType 8도 경기버스 힌트로 포함하여 GBIS 조회 시도 → 못 찾으면 seoul fallback으로 자연스럽게 처리됨.

## 테스트

- `routes_provider_fix_test.ts` 신규 6케이스 (저장 시점 3 + 런타임 안전망 2 + favorites 1)
- `routes_mapping_test.ts` 기존 2케이스 기대값 업데이트 (잘못된 동작을 기대하던 테스트)

## FE 영향

없음. BE 전용 수정.
