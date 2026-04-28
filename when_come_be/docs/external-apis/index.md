# 외부 API 목록

> when_come에서 사용 중인 외부 API 전체 목록.
> 상세 스펙은 각 파일 참고. 변경 시 해당 파일 업데이트.

| API | 용도 | 인증 방식 | 파일 |
|-----|------|-----------|------|
| ODsay | 경로탐색, 정류장 검색, 실시간 도착 | `apiKey` 쿼리 파라미터 | [odsay.md](odsay.md) |
| 서울 버스 API | 실시간 버스 도착, 정류장 노선 목록 | `serviceKey` 쿼리 파라미터 (공공데이터포털) | [seoul-bus.md](seoul-bus.md) |
| 서울 지하철 API | 실시간 지하철 도착 | URL 경로에 키 포함 | [seoul-subway.md](seoul-subway.md) |
| 네이버 검색 API | 장소 검색 (Local Search) | `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더 | [naver-maps.md](naver-maps.md) |

## 주의사항

- 서울 버스 API: HTTP (비암호화), 공공데이터포털에서 서비스별 **개별 승인** 필요
- ODsay: 커버리지 없는 정류장은 `-98`/`-99` 에러 → 서울 버스 API fallback
- 서울 지하철 API: `stationName` URL 인코딩 필수
