# 외부 API 목록

> when_come에서 사용 중인 외부 API 전체 목록.
> 상세 스펙은 각 파일 참고. 변경 시 해당 파일 업데이트.

| API | 용도 | 인증 방식 | 환경변수 | 파일 |
|-----|------|-----------|----------|------|
| ODsay | 경로탐색, 정류장 검색, 실시간 도착(fallback) | `apiKey` 쿼리 | `ODSAY_API_KEY` | [odsay.md](odsay.md) |
| 서울 버스 API | 실시간 버스 도착(서울), 정류장 노선 목록 | `serviceKey` 쿼리 (공공데이터포털) | `SEOUL_BUS_API_KEY` | [seoul-bus.md](seoul-bus.md) |
| 경기 버스 API — busarrivalservice/v2 | 실시간 버스 도착(경기) | `serviceKey` 쿼리 (공공데이터포털) | `GYEONGGI_BUS_API_KEY` | [gyeonggi-bus.md §1](gyeonggi-bus.md#1-busarrivalservicev2--실시간-도착정보) |
| 경기 버스 API — busrouteservice/v2 | 노선조회 (ODsay→GBIS 매핑) | `serviceKey` 쿼리 (공공데이터포털, 데이터셋 15080662) | `GYEONGGI_BUS_API_KEY` (동일 키) | [gyeonggi-bus.md §2](gyeonggi-bus.md#2-busrouteservicev2--노선조회-확정-명세-2026-05-02) |
| **경기도 자체 OpenAPI — BusStation** | **정류소 현황 (자체 캐시 cron)** | **`KEY` 쿼리 (경기도 자체 발급)** | **`GYEONGGI_OPENAPI_KEY`** ⚠️ 별도 키 | [gyeonggi-bus.md §3](gyeonggi-bus.md#3-경기도-자체-openapi--정류소현황-확정-명세-2026-05-02) |
| 서울 지하철 API | 실시간 지하철 도착 | URL 경로에 키 포함 | `SEOUL_SUBWAY_API_KEY` | [seoul-subway.md](seoul-subway.md) |
| 네이버 검색 API | 장소 검색 (Local Search) | `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더 | `NAVER_*` | [naver-maps.md](naver-maps.md) |

## 시스템별 묶음

### 공공데이터포털 (`apis.data.go.kr`)
- 서울 버스 API
- 경기 버스 API (busarrivalservice/v2, busrouteservice/v2)
- 인증키 모델: `serviceKey` 쿼리 파라미터, 데이터셋 단위 활용 신청

### 경기도 자체 OpenAPI (`openapi.gg.go.kr`)
- BusStation (정류소 현황)
- 인증키 모델: `KEY` 쿼리 파라미터, **공공데이터포털과 별개의 시스템·키**

### ODsay (`api.odsay.com`)
- 경로탐색·정류장 검색·실시간 도착

### 서울교통공사 (`swopenapi.seoul.go.kr`)
- 실시간 지하철 도착

### 네이버 (`openapi.naver.com`)
- 장소 검색

---

## 주의사항

- 서울 버스 API: HTTP (비암호화), 공공데이터포털에서 서비스별 **개별 승인** 필요
- 경기 버스 API: 정류장/노선 식별자가 서울과 다름 (`stationId`/`routeId`/`staOrder`). ODsay → GBIS 매핑은 자체 캐시(`gbis_stations`) 기반 — ADR-003.
- **경기도 자체 OpenAPI는 검색 API가 아님** — 시군 단위 페이징 다운로드만 지원. 따라서 일 1회 cron(`sync-gbis-stations`)으로 자체 DB에 캐싱 후 사용.
- ODsay: 커버리지 없는 정류장은 `-98`/`-99` 에러 → 서울/경기 버스 API fallback
- 서울 지하철 API: `stationName` URL 인코딩 필수
- **두 경기 시스템의 인증키는 별도** — `.env`/`secrets.local.md`에 `GYEONGGI_BUS_API_KEY`(공공데이터포털)와 `GYEONGGI_OPENAPI_KEY`(자체 OpenAPI) 둘 다 등록 필수.

---

## 변경 이력

- 2026-05-02 — 경기도 자체 OpenAPI(BusStation, `GYEONGGI_OPENAPI_KEY`) 추가. busrouteservice/v2 명세 확정 항목 추가.
