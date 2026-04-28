# Route Direction — Open Questions (QA 검증 노트)

- **작성일:** 2026-04-28
- **상태:** QA 미완 — 실측 후 결과 채울 것
- **관련:** `docs/decisions/ADR-001-subway-direction-model.md`, `docs/api/contracts/route-direction-design.md`, `docs/specs/route-direction/`

ADR-001에서 미해결로 남긴 항목들을 실호출·실등록으로 검증한다. 각 OQ는 (1) 무엇을 확인하는가, (2) 어떻게 확인하는가(재현 경로), (3) 결과 — 3 섹션으로 채운다.

검증 환경:
- 등록: FE `/setup`에서 좌표 검색 → `/route-search` 호출 → 경로 선택 → 저장
- 확인: Supabase Studio `route_stops` row의 `direction_*` 컬럼 + FE Home 카드의 도착 매칭 결과
- 도착 응답 raw 확인이 필요하면 브라우저 devtools Network 탭에서 `/arrival-info?type=subway&stationName=...` 응답 확인

---

## OQ1 — 7호선 분기(도봉산행 vs 장암행)에서 `subPath.way` 값

### 무엇을 확인하는가
ODsay `searchPubTransPathT`의 7호선 subPath에서 `way` 필드가 어떤 형태로 오는지. 분기점 이전 구간(예: 석남 → 부평구청)에서 `way`가 종점("장암")으로 일관되게 오는지, 아니면 분기 직전역까지의 직행 종점("도봉산")이 섞이는지 확인.

확인할 사항:
- `way` 값이 `"장암"`/`"도봉산"` 중 하나로 오는지, 아니면 다른 형태인지
- `wayCode`는 1/2 중 어느 값으로 오는지
- 헤드사인 합성(`${way}행`)이 서울 지하철 API `trainLineNm`(`"장암행 - 산곡방면"`)의 `startsWith` 매칭과 호환되는지

### 어떻게 확인하는가
1. FE `/setup`에서 출발 "석남(거북시장)", 도착 "강남" 또는 "부평구청"으로 검색
2. 7호선 경로 선택 → 저장
3. Supabase Studio에서 해당 `route_stops` row의 `direction_headsign`/`direction_updn`/`direction_next_stop` 값 기록
4. FE Home에서 도착 카드 확인 — 부평구청 방향 차량(또는 사용자가 의도한 방향)만 노출되는지
5. `arrival-info` 응답의 `trainLineNm` raw 값과 저장된 `direction_headsign`을 비교

### 결과
> _QA 후 채울 것_
>
> - `direction_headsign`: 
> - `direction_updn`: 
> - `direction_next_stop`: 
> - 매칭 결과: 
> - 이슈/특이사항: 

---

## OQ2 — 2호선 외선(시계반대) `wayCode` 매핑

### 무엇을 확인하는가
2호선 순환 구간에서 ODsay `wayCode`가 1/2 중 어느 값으로 오는지, 그리고 그 값이 서울 지하철 API `updnLine`("내선"/"외선")과 어떻게 대응하는지 확인. ADR-001의 기본 가정은 `1=상행/내선`, `2=하행/외선`이지만 2호선 quirky 케이스 검증 필요.

확인할 사항:
- 강남 → 신도림 방향(외선, 시계반대)에서 `wayCode` 값
- 강남 → 잠실 방향(내선, 시계방향)에서 `wayCode` 값
- 매칭 시 `mapsUpdnLineToCode("외선") === 'down'`이 ODsay `wayCode === 2`와 일치하는지
- 매핑이 어긋나면 fallback이 정상 동작하는지

### 어떻게 확인하는가
1. FE `/setup`에서 출발 "강남", 도착 "신도림"(외선 방향)으로 경로 등록
2. 같은 방식으로 출발 "강남", 도착 "잠실"(내선 방향) 경로 별개 등록
3. 두 경로의 `direction_updn` 값을 Supabase Studio에서 확인
4. FE Home에서 각각 외선/내선 차량만 노출되는지 확인
5. 매칭 0건이면 fallback이 동작하고 inline 안내가 노출되는지 확인

### 결과
> _QA 후 채울 것_
>
> - 외선 케이스 `direction_updn`: 
> - 내선 케이스 `direction_updn`: 
> - `wayCode`→`updn` 매핑 검증: 
> - 매칭 정확도: 
> - 이슈/특이사항: 

---

## OQ3 — 미커버 노선 fallback (GTX·신분당선 등 광역철도)

### 무엇을 확인하는가
GTX-A·신분당선처럼 서울 지하철 API의 `updnLine` 형태가 다를 가능성이 있는 광역철도에서, 저장된 `direction_*`이 어떻게 채워지고 매칭이 어떻게 동작하는지. 매칭 실패 시 fallback이 깨끗하게 동작해 사용자 경험이 망가지지 않는지 확인.

확인할 사항:
- ODsay `searchPubTransPathT`가 GTX/신분당선 subPath에 `way`/`wayCode`를 주는지 (누락 가능)
- 서울 지하철 API `realtimeStationArrival`의 `updnLine`이 `"상행"`/`"하행"`/`"내선"`/`"외선"` 외 값으로 오는지
- 매칭 0건 → 호선만 일치하는 전체 표시 + inline 안내 노출이 정상 동작하는지
- 기존 저장 경로(방향 NULL)도 동일하게 fallback이 동작하는지

### 어떻게 확인하는가
1. FE `/setup`에서 신분당선 경로(예: 강남 → 판교) 등록
2. GTX-A 경로(예: 수서 → 동탄) 등록
3. Supabase Studio에서 `direction_*` 값이 NULL/채워짐 중 어느 쪽인지 확인
4. FE Home에서 도착 카드 확인:
   - 매칭 성공 시: 해당 방향만 노출
   - 매칭 0건 시: 전체 노출 + 안내 메시지
5. 추가로 마이그레이션 이전에 등록된 기존 경로(방향 NULL)도 같은 카드 동작 확인

### 결과
> _QA 후 채울 것_
>
> - 신분당선 `direction_*` 저장 결과: 
> - GTX-A `direction_*` 저장 결과: 
> - `updnLine` raw 값(광역철도): 
> - fallback 동작 여부: 
> - inline 안내 노출 여부: 
> - 이슈/특이사항: 

---

## 후속 조치 (결과 채워진 뒤)

OQ1~OQ3 결과에 따라 다음을 결정:
- ODsay 응답에서 누락이 잦으면 매핑 보정 테이블(노선코드 → updn 기본값) 도입 검토
- `mapsUpdnLineToCode`에 추가 enum 값(예: 광역철도 특수 표기)이 필요하면 `arrival.ts`에 케이스 추가
- 매칭 정확도 떨어지는 노선이 발견되면 ADR-001 후속 ADR 또는 본 노트에 보강 결정 기록
