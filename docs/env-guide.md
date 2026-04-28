# 환경변수 가이드

> 실제 값은 절대 이 파일에 작성하지 않는다. `.env.local` (gitignore됨)에만.

## FE 환경변수 (when_come_fe/.env.local)

| 변수 | 용도 | 발급처 |
|------|------|--------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 > Settings > API |
| `VITE_SUPABASE_ANON_KEY` | Supabase 공개 키 | Supabase 대시보드 > Settings > API |
| `VITE_NAVER_MAP_CLIENT_ID` | 네이버 지도 클라이언트 ID | [네이버 클라우드](https://console.ncloud.com/) |

## BE 환경변수 (when_come_be/.env.local)

| 변수 | 용도 | 발급처 | 주의 |
|------|------|--------|------|
| `ODSAY_API_KEY` | ODsay API 인증 | [ODsay Lab](https://lab.odsay.com/) | |
| `SEOUL_BUS_API_KEY` | 서울 버스 API 인증 | [공공데이터포털](https://data.go.kr) | 서비스별 개별 승인 필요 |
| `SEOUL_SUBWAY_API_KEY` | 서울 지하철 API 인증 | [서울 열린데이터광장](https://data.seoul.go.kr) | |
| `NAVER_MAP_CLIENT_ID` | 네이버 지도 클라이언트 ID | 네이버 클라우드 | |
| `NAVER_MAP_CLIENT_SECRET` | 네이버 지도 시크릿 | 네이버 클라우드 | BE에서만 사용 |
| `SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 | |
| `SUPABASE_ANON_KEY` | Supabase 공개 키 | Supabase 대시보드 | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 키 | Supabase 대시보드 | ⚠️ Edge Function 내부 전용. 절대 FE 노출 금지. RLS 우회하므로 일반 라우트에 사용 금지 |

## 로컬 vs 프로덕션

Supabase는 로컬 (`supabase start`)과 원격 두 개를 운영한다.

| 환경 | URL | 용도 |
|------|-----|------|
| 로컬 | `http://127.0.0.1:54321` | 개발/테스트 |
| 원격 | `https://kifxccvqofsdyonbhmnc.supabase.co` | 프로덕션 |

로컬 키는 `supabase start` 출력에서 확인. 원격 키는 Supabase 대시보드 > Settings > API.
