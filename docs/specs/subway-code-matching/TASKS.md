# TASKS: 지하철 노선 매칭 — subway_code 영속화

관련: `./PRD.md`, `./SDD.md`

## DB

- [x] T1. 마이그레이션 작성 — `stop_routes.subway_code text NULL`, `favorite_stop_routes.subway_code text NULL` (다음 sequential 번호) (완료일: 2026-05-09)
- [ ] T2. 로컬 `supabase db push`로 적용 + 컬럼 확인

## BE

- [x] T3. `routes/index.ts` `StopRouteInput`에 `subwayCode?: string | null` 추가 (완료일: 2026-05-09)
- [x] T4. `routes/index.ts` POST + PATCH(stops 교체) INSERT payload에 `subway_code` 매핑 (완료일: 2026-05-09)
- [x] T5. `routes/index.ts` GET SELECT 절에 `subway_code` 컬럼 추가 (완료일: 2026-05-09)
- [x] T6. `favorite-stops/index.ts` `FavoriteStopRouteInput`에 `subwayCode` 추가 (완료일: 2026-05-09)
- [x] T7. `favorite-stops/index.ts` POST + PATCH(routes 교체) INSERT payload에 `subway_code` 매핑 (완료일: 2026-05-09)
- [x] T8. `favorite-stops/index.ts` GET/fetchFavoriteStop SELECT 절에 `subway_code` 추가 (완료일: 2026-05-09)
- [x] T9. `_tests/routes_test.ts` — subwayCode 정상 저장 / null 입력 / 누락 케이스 추가 (완료일: 2026-05-09)
- [x] T10. `_tests/favorite-stops_test.ts` — 동일 커버리지 추가 (완료일: 2026-05-09)

## FE

- [x] T11. `lib/api.ts` (또는 mockData) `StopRoute` 타입에 `subwayCode?: string | null` 추가 (완료일: 2026-05-09)
- [x] T12. `search-stops` 결과에서 stop 단위 `subwayCode`를 stopRoute로 복사하는 빌더 수정 (Setup, Favorites) (완료일: 2026-05-09)
- [x] T13. POST 페이로드에 `subwayCode` 동봉 (완료일: 2026-05-09)
- [x] T14. `matchSubwayItems`에 subwayCode 1차 비교 분기 추가 (normalize fallback 유지) (완료일: 2026-05-09)
- [ ] T15. 즐겨찾기/경로 화면 dev 서버 수동 검증

## 백필

- [x] T16. `when_come_be/scripts/backfill-subway-code.ts` 작성 (Deno, ODsay 호출 + UPDATE 문 출력) (완료일: 2026-05-09)
- [x] T17. `when_come_be/docs/tech-notes/subway-code-backfill.md` 가이드 작성 (완료일: 2026-05-09)
- [ ] T18. 운영 DB dry-run (`BEGIN; ... ROLLBACK;`)
- [ ] T19. 운영 DB 본 실행 + 잔여 NULL 카운트 0 확인
- [ ] T20. 매핑 실패 row 운영자 인계 리포트

## 후속 (별도 PR)

- [ ] T21. FE matchSubwayItems legacy normalize fallback 제거 (1주일 모니터링 후)
- [ ] T22. `when_come_fe/docs/architecture/overview.md` 매칭 규칙 섹션 업데이트
- [ ] T23. `docs/collab-notes.md` 변경 요약 기록
