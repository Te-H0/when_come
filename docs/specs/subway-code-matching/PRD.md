# PRD: 지하철 노선 매칭 — 라벨 기반 → 숫자 코드 기반 전환

- 작성일: 2026-05-09
- 상태: 합의됨 (요약본)

## 문제

FE `matchSubwayItems`가 서울 지하철 API의 `lineName`("1002")을 `subwayApiCodeToLineName`으로 라벨("1호선")로 풀어낸 뒤, stop의 저장 라벨("수도권 1호선")과 비교하다 매칭 0건이 자주 발생 → "도착 정보 없음" 오표시. 정규화 fallback 패치는 들어가 있으나 문자열 파싱 의존이라 fragile.

## 해결

ODsay `search-stops` 응답에 이미 들어 있는 `subwayCode`("1001"~"1031", 서울 지하철 API `lineName`과 동일 형식)를 영속화하고, FE가 코드끼리 직접 비교한다.

## 성공 기준

- 모든 신규/기존 지하철 stop의 `stop_routes.subway_code` / `favorite_stop_routes.subway_code`가 채워진다.
- FE는 코드 비교 단일 경로로 매칭한다 (라벨 fallback은 한 사이클 안전망).
- 즐겨찾기/경로 화면 지하철 도착 카드에서 매칭 0건 케이스 소거.

## 비목표

- 새로운 사용자 기능 추가 없음. 매칭 정확도 인프라 작업.
- ODsay subway type → 서울 API 코드 매핑 자체는 이미 `odsaySubwayTypeToSubwayCode`에 존재 — 변경하지 않음.
