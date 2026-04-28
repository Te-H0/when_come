# 네이버 검색 API (Local Search)

**Base URL:** `https://openapi.naver.com`  
**발급처:** 네이버 개발자센터 (developers.naver.com) — 네이버 클라우드 플랫폼 아님  
**인증:** `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더  
**현재 사용 엔드포인트:** Local Search (장소 검색) — `when_come_be/supabase/functions/place-search/index.ts`

---

## Local Search — 장소 검색

```
GET https://openapi.naver.com/v1/search/local.json?query={query}&display=5
```

> 네이버 검색 API (오픈 API). 별도 클라이언트 ID/시크릿 필요.

**헤더:**
```
X-Naver-Client-Id: {NAVER_MAP_CLIENT_ID}
X-Naver-Client-Secret: {NAVER_MAP_CLIENT_SECRET}
```

**응답 (`items[]`):**
```json
{
  "title": "강남역",
  "address": "서울특별시 강남구 강남대로 지하396",
  "mapx": "1270275",
  "mapy": "374979"
}
```

| 필드 | 설명 |
|------|------|
| `title` | 장소명 (HTML 태그 포함될 수 있음 — strip 처리 필요) |
| `address` | 도로명/지번 주소 |
| `mapx` | 경도 × 10^4 (정수) |
| `mapy` | 위도 × 10^4 (정수) |

> `mapx`, `mapy` 변환: `Number(mapx) / 1e4` → WGS84 좌표

---

## 주의사항

- `title` 필드에 `<b>강남역</b>` 형태 HTML 태그 포함 가능 → `replace(/<[^>]*>/g, '')` 처리
- FE에서 직접 호출하면 CORS 이슈 가능 → BE `place-search` Edge Function을 통해 호출
- 일일 호출 한도 있음 (무료 플랜: 25,000회/일)

---

## 향후 검토

- **카카오맵 API**: 주소 검색 정확도 높음, 장소 DB 풍부
- **Google Places API**: 글로벌 커버리지, 유료
- **Tmap API**: SK텔레콤, 대중교통 특화 (ODsay 대체 검토 가능)
