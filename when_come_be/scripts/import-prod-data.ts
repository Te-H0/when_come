#!/usr/bin/env -S deno run -A
/**
 * import-prod-data.ts
 *
 * 운영 Supabase에서 사용자 데이터를 추출해 supabase/seed.sql을 갱신한다.
 * 1회성 유틸리티. 운영 service_role_key가 필요하므로 .env.local에서 로드한다.
 *
 * 실행: cd when_come_be && deno run -A scripts/import-prod-data.ts
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse as parseDotenv } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 0. 경로 상수
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const BE_ROOT = join(SCRIPT_DIR, "..");
const ENV_PATH = join(BE_ROOT, ".env.local");
const SEED_PATH = join(BE_ROOT, "supabase", "seed.sql");

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─────────────────────────────────────────────────────────────────────────────
// 1. 환경변수 로드
// ─────────────────────────────────────────────────────────────────────────────

async function loadEnv(): Promise<{ url: string; serviceRoleKey: string }> {
  let envText: string;
  try {
    envText = await Deno.readTextFile(ENV_PATH);
  } catch {
    console.error(`[ERROR] .env.local 파일을 읽을 수 없습니다: ${ENV_PATH}`);
    console.error("  → when_come_be 디렉토리에서 실행했는지 확인하세요.");
    Deno.exit(1);
  }

  const env = parseDotenv(envText);

  const url = env["SUPABASE_URL"];
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url) {
    console.error("[ERROR] .env.local에 SUPABASE_URL이 없습니다.");
    Deno.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "[ERROR] .env.local에 SUPABASE_SERVICE_ROLE_KEY가 없습니다."
    );
    Deno.exit(1);
  }

  return { url, serviceRoleKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Supabase REST 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function makeHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function fetchRows<T>(
  url: string,
  serviceRoleKey: string,
  table: string,
  query = ""
): Promise<T[]> {
  const endpoint = `${url}/rest/v1/${table}?${query}`;
  const res = await fetch(endpoint, {
    headers: makeHeaders(serviceRoleKey),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    console.error(
      `[ERROR] ${table} 조회 실패 (HTTP ${res.status}): ${body}`
    );
    Deno.exit(1);
  }

  return res.json() as Promise<T[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 사용자 자동 탐지
// ─────────────────────────────────────────────────────────────────────────────

interface RouteRow {
  id: string;
  user_id: string;
  name: string;
  origin_name: string | null;
  destination_name: string | null;
  origin_coords: Record<string, unknown> | null;
  destination_coords: Record<string, unknown> | null;
  is_active: boolean | null;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

async function detectUser(
  url: string,
  serviceRoleKey: string
): Promise<string> {
  const routes = await fetchRows<RouteRow>(
    url,
    serviceRoleKey,
    "routes",
    "select=id,user_id,created_at&order=created_at.asc"
  );

  if (routes.length === 0) {
    console.error(
      "[ERROR] routes 테이블이 비어있습니다. 운영 데이터가 없습니다."
    );
    Deno.exit(1);
  }

  // user_id별 건수 집계
  const countByUser = new Map<string, { count: number; firstCreatedAt: string }>();
  for (const row of routes) {
    const existing = countByUser.get(row.user_id);
    if (!existing) {
      countByUser.set(row.user_id, {
        count: 1,
        firstCreatedAt: row.created_at,
      });
    } else {
      existing.count += 1;
      if (row.created_at < existing.firstCreatedAt) {
        existing.firstCreatedAt = row.created_at;
      }
    }
  }

  // 건수 내림차순, 동률이면 created_at 오름차순 정렬
  const sorted = [...countByUser.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[1].firstCreatedAt < b[1].firstCreatedAt ? -1 : 1;
  });

  const [primaryUserId, primaryMeta] = sorted[0];

  if (sorted.length > 1) {
    console.warn("[WARN] routes 테이블에 여러 사용자가 있습니다:");
    for (const [uid, meta] of sorted) {
      // user_id는 short hash로 마스킹
      const masked = uid.slice(0, 8) + "****";
      const marker = uid === primaryUserId ? " ← 선택됨" : "";
      console.warn(`  ${masked}  routes=${meta.count}건${marker}`);
    }
    console.warn(
      "  → 가장 많은 routes를 보유한 사용자로 진행합니다. 다른 사용자 데이터는 추출하지 않습니다."
    );
  } else {
    console.log(
      `[INFO] 사용자 탐지 완료: ${primaryUserId.slice(0, 8)}**** (routes ${primaryMeta.count}건)`
    );
  }

  return primaryUserId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 데이터 추출
// ─────────────────────────────────────────────────────────────────────────────

interface RouteStopRow {
  id: string;
  route_id: string;
  odsay_stop_id: string | null;
  stop_name: string;
  stop_type: string;
  sequence: number;
  step_group: number | null;
  ars_id: string | null;
  provider: string | null;
  gbis_station_id: string | null;
  direction_headsign: string | null;
  direction_updn: string | null;
  direction_next_stop: string | null;
  alias: string | null;
  created_at: string;
  updated_at: string | null;
  provider_fallback_reason: string | null;
}

interface StopRouteRow {
  id: string;
  stop_id: string;
  odsay_route_id: string | null;
  route_name: string | null;
  bus_type: number | null;
  st_id: string | null;
  bus_route_id: string | null;
  station_ord: number | null;
  station_name: string | null;
  gbis_route_id: string | null;
  gbis_sta_order: number | null;
  provider: string | null;
  subway_code: string | null;
  created_at: string;
}

interface FavoriteStopRow {
  id: string;
  user_id: string;
  odsay_stop_id: string | null;
  stop_name: string;
  stop_type: string;
  ars_id: string | null;
  lat: number | null;
  lng: number | null;
  direction_headsign: string | null;
  direction_updn: string | null;
  direction_next_stop: string | null;
  provider: string;
  gbis_station_id: string | null;
  alias: string | null;
  display_order: number;
  created_at: string;
  updated_at: string | null;
}

interface FavoriteStopRouteRow {
  id: string;
  favorite_stop_id: string;
  odsay_route_id: string | null;
  route_name: string | null;
  bus_type: number | null;
  st_id: string | null;
  bus_route_id: string | null;
  station_ord: number | null;
  station_name: string | null;
  gbis_route_id: string | null;
  gbis_sta_order: number | null;
  provider: string | null;
  subway_code: string | null;
  display_order: number | null;
  created_at: string;
}

interface UserData {
  routes: RouteRow[];
  routeStops: RouteStopRow[];
  stopRoutes: StopRouteRow[];
  favoriteStops: FavoriteStopRow[];
  favoriteStopRoutes: FavoriteStopRouteRow[];
}

async function fetchUserData(
  url: string,
  serviceRoleKey: string,
  userId: string
): Promise<UserData> {
  console.log("[INFO] 운영 데이터 추출 중...");

  // routes
  const routes = await fetchRows<RouteRow>(
    url,
    serviceRoleKey,
    "routes",
    `select=*&user_id=eq.${userId}&order=display_order.asc,created_at.asc`
  );
  console.log(`  routes: ${routes.length}건`);

  // route_stops
  let routeStops: RouteStopRow[] = [];
  if (routes.length > 0) {
    const routeIds = routes.map((r) => r.id).join(",");
    routeStops = await fetchRows<RouteStopRow>(
      url,
      serviceRoleKey,
      "route_stops",
      `select=*&route_id=in.(${routeIds})&order=sequence.asc`
    );
  }
  console.log(`  route_stops: ${routeStops.length}건`);

  // stop_routes
  let stopRoutes: StopRouteRow[] = [];
  if (routeStops.length > 0) {
    const stopIds = routeStops.map((s) => s.id).join(",");
    stopRoutes = await fetchRows<StopRouteRow>(
      url,
      serviceRoleKey,
      "stop_routes",
      `select=*&stop_id=in.(${stopIds})`
    );
  }
  console.log(`  stop_routes: ${stopRoutes.length}건`);

  // favorite_stops
  const favoriteStops = await fetchRows<FavoriteStopRow>(
    url,
    serviceRoleKey,
    "favorite_stops",
    `select=*&user_id=eq.${userId}&order=display_order.asc`
  );
  console.log(`  favorite_stops: ${favoriteStops.length}건`);

  // favorite_stop_routes
  let favoriteStopRoutes: FavoriteStopRouteRow[] = [];
  if (favoriteStops.length > 0) {
    const favIds = favoriteStops.map((f) => f.id).join(",");
    favoriteStopRoutes = await fetchRows<FavoriteStopRouteRow>(
      url,
      serviceRoleKey,
      "favorite_stop_routes",
      `select=*&favorite_stop_id=in.(${favIds})`
    );
  }
  console.log(`  favorite_stop_routes: ${favoriteStopRoutes.length}건`);

  return { routes, routeStops, stopRoutes, favoriteStops, favoriteStopRoutes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SQL 생성 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function esc(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function escNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return String(value);
}

function escBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return value ? "true" : "false";
}

function escJson(value: Record<string, unknown> | null | undefined): string {
  if (value === null || value === undefined) return "null";
  const json = JSON.stringify(value).replace(/'/g, "''");
  return `'${json}'::jsonb`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SQL 빌드
// ─────────────────────────────────────────────────────────────────────────────

function buildSeedSql(data: UserData, prodUserId: string): string {
  const lines: string[] = [];

  const banner = (title: string) =>
    `-- ${"─".repeat(77)}\n-- ${title}\n-- ${"─".repeat(77)}`;

  // ── routes ──────────────────────────────────────────────────────────────────
  lines.push(banner("2. routes — 운영 데이터 (user_id → dev UUID로 치환됨)"));
  lines.push(
    "insert into routes (\n" +
      "  id, user_id, name, origin_name, destination_name,\n" +
      "  origin_coords, destination_coords,\n" +
      "  is_active, display_order, active,\n" +
      "  created_at\n" +
      ")\nvalues"
  );

  const routeRows = data.routes.map((r) => {
    return (
      "  (\n" +
      `    ${esc(r.id)},\n` +
      `    '${DEV_USER_ID}',\n` + // user_id 치환
      `    ${esc(r.name)},\n` +
      `    ${esc(r.origin_name)},\n` +
      `    ${esc(r.destination_name)},\n` +
      `    ${escJson(r.origin_coords)},\n` +
      `    ${escJson(r.destination_coords)},\n` +
      `    ${escBool(r.is_active)}, ${escNum(r.display_order)}, ${escBool(r.active)},\n` +
      `    now()\n` +
      "  )"
    );
  });
  lines.push(routeRows.join(",\n"));
  lines.push("on conflict (id) do nothing;\n");

  // ── route_stops ──────────────────────────────────────────────────────────────
  lines.push(banner("3. route_stops"));
  lines.push(
    "insert into route_stops (\n" +
      "  id, route_id,\n" +
      "  odsay_stop_id, stop_name, stop_type, sequence, step_group,\n" +
      "  ars_id, provider, gbis_station_id,\n" +
      "  direction_headsign, direction_updn, direction_next_stop,\n" +
      "  alias,\n" +
      "  created_at\n" +
      ")\nvalues"
  );

  const rsRows = data.routeStops.map((s) => {
    return (
      "  (\n" +
      `    ${esc(s.id)},\n` +
      `    ${esc(s.route_id)},\n` +
      `    ${esc(s.odsay_stop_id)}, ${esc(s.stop_name)}, ${esc(s.stop_type)}, ${escNum(s.sequence)}, ${escNum(s.step_group)},\n` +
      `    ${esc(s.ars_id)}, ${esc(s.provider)}, ${esc(s.gbis_station_id)},\n` +
      `    ${esc(s.direction_headsign)}, ${esc(s.direction_updn)}, ${esc(s.direction_next_stop)},\n` +
      `    ${esc(s.alias)},\n` +
      `    now()\n` +
      "  )"
    );
  });
  lines.push(rsRows.join(",\n"));
  lines.push("on conflict (id) do nothing;\n");

  // ── stop_routes ──────────────────────────────────────────────────────────────
  lines.push(banner("4. stop_routes — 각 정류장의 탑승 노선"));
  lines.push(
    "insert into stop_routes (\n" +
      "  id, stop_id,\n" +
      "  odsay_route_id, route_name, bus_type,\n" +
      "  st_id, bus_route_id, station_ord, station_name,\n" +
      "  gbis_route_id, gbis_sta_order,\n" +
      "  provider, subway_code,\n" +
      "  created_at\n" +
      ")\nvalues"
  );

  const srRows = data.stopRoutes.map((r) => {
    return (
      "  (\n" +
      `    ${esc(r.id)},\n` +
      `    ${esc(r.stop_id)},\n` +
      `    ${esc(r.odsay_route_id)}, ${esc(r.route_name)}, ${escNum(r.bus_type)},\n` +
      `    ${esc(r.st_id)}, ${esc(r.bus_route_id)}, ${escNum(r.station_ord)}, ${esc(r.station_name)},\n` +
      `    ${esc(r.gbis_route_id)}, ${escNum(r.gbis_sta_order)},\n` +
      `    ${esc(r.provider)}, ${esc(r.subway_code)},\n` +
      `    now()\n` +
      "  )"
    );
  });
  lines.push(srRows.join(",\n"));
  lines.push("on conflict (id) do nothing;\n");

  // ── favorite_stops ──────────────────────────────────────────────────────────
  lines.push(banner("5. favorite_stops — 즐겨찾기"));
  lines.push(
    "insert into favorite_stops (\n" +
      "  id, user_id,\n" +
      "  odsay_stop_id, stop_name, stop_type,\n" +
      "  ars_id, lat, lng,\n" +
      "  direction_headsign, direction_updn, direction_next_stop,\n" +
      "  provider, gbis_station_id,\n" +
      "  alias, display_order,\n" +
      "  created_at\n" +
      ")\nvalues"
  );

  if (data.favoriteStops.length === 0) {
    // 값이 없으면 INSERT 자체를 skip (values 없이 넣으면 SQL 에러)
    lines[lines.length - 1] =
      "-- favorite_stops: 운영 데이터 없음 (스킵)\n";
  } else {
    const fsRows = data.favoriteStops.map((f) => {
      return (
        "  (\n" +
        `    ${esc(f.id)},\n` +
        `    '${DEV_USER_ID}',\n` + // user_id 치환
        `    ${esc(f.odsay_stop_id)}, ${esc(f.stop_name)}, ${esc(f.stop_type)},\n` +
        `    ${esc(f.ars_id)}, ${escNum(f.lat)}, ${escNum(f.lng)},\n` +
        `    ${esc(f.direction_headsign)}, ${esc(f.direction_updn)}, ${esc(f.direction_next_stop)},\n` +
        `    ${esc(f.provider)}, ${esc(f.gbis_station_id)},\n` +
        `    ${esc(f.alias)}, ${escNum(f.display_order)},\n` +
        `    now()\n` +
        "  )"
      );
    });
    lines.push(fsRows.join(",\n"));
    lines.push("on conflict (id) do nothing;\n");
  }

  // ── favorite_stop_routes ─────────────────────────────────────────────────────
  lines.push(banner("6. favorite_stop_routes — 즐겨찾기 정류장의 노선"));
  lines.push(
    "insert into favorite_stop_routes (\n" +
      "  id, favorite_stop_id,\n" +
      "  odsay_route_id, route_name, bus_type,\n" +
      "  st_id, bus_route_id, station_ord, station_name,\n" +
      "  gbis_route_id, gbis_sta_order,\n" +
      "  provider, subway_code,\n" +
      "  display_order,\n" +
      "  created_at\n" +
      ")\nvalues"
  );

  if (data.favoriteStopRoutes.length === 0) {
    lines[lines.length - 1] =
      "-- favorite_stop_routes: 운영 데이터 없음 (스킵)\n";
  } else {
    const fsrRows = data.favoriteStopRoutes.map((r) => {
      return (
        "  (\n" +
        `    ${esc(r.id)},\n` +
        `    ${esc(r.favorite_stop_id)},\n` +
        `    ${esc(r.odsay_route_id)}, ${esc(r.route_name)}, ${escNum(r.bus_type)},\n` +
        `    ${esc(r.st_id)}, ${esc(r.bus_route_id)}, ${escNum(r.station_ord)}, ${esc(r.station_name)},\n` +
        `    ${esc(r.gbis_route_id)}, ${escNum(r.gbis_sta_order)},\n` +
        `    ${esc(r.provider)}, ${esc(r.subway_code)},\n` +
        `    ${escNum(r.display_order)},\n` +
        `    now()\n` +
        "  )"
      );
    });
    lines.push(fsrRows.join(",\n"));
    lines.push("on conflict (id) do nothing;\n");
  }

  void prodUserId; // 치환 완료. 로그에 노출 안 함.
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. seed.sql 파일 쓰기 (헤더 보존 + 데이터 교체)
// ─────────────────────────────────────────────────────────────────────────────

async function writeSeedFile(dataSql: string): Promise<void> {
  const existing = await Deno.readTextFile(SEED_PATH);

  // 헤더 구분 마커: "-- 2. routes" 이전까지를 헤더로 간주
  // seed.sql의 섹션 2번이 시작되는 지점을 기준으로 분리
  const markerPatterns = [
    /^-- -{3,}\n-- 2\./m,
    /^-- ─{3,}\n-- 2\./m,
  ];

  let headerEnd = -1;
  for (const pattern of markerPatterns) {
    const match = pattern.exec(existing);
    if (match && match.index !== undefined) {
      headerEnd = match.index;
      break;
    }
  }

  let header: string;
  if (headerEnd === -1) {
    // 마커 못 찾으면 auth.identities INSERT 블록 끝 다음을 헤더로 사용
    const identitiesEnd = existing.indexOf("on conflict (id) do nothing;", existing.indexOf("auth.identities"));
    if (identitiesEnd !== -1) {
      headerEnd = identitiesEnd + "on conflict (id) do nothing;".length;
      header = existing.slice(0, headerEnd).trimEnd() + "\n\n";
    } else {
      console.error("[ERROR] seed.sql에서 헤더 구분 위치를 찾을 수 없습니다.");
      console.error("  → auth.users/identities INSERT 블록이 유지됐는지 확인하세요.");
      Deno.exit(1);
    }
  } else {
    header = existing.slice(0, headerEnd).trimEnd() + "\n\n";
  }

  const newContent = header + dataSql + "\n";
  await Deno.writeTextFile(SEED_PATH, newContent);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. 메인
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== import-prod-data: 운영 → seed.sql 변환 시작 ===\n");

  const { url, serviceRoleKey } = await loadEnv();

  // 보안: URL만 표시, key는 절대 출력 안 함
  console.log(`[INFO] Supabase URL: ${url}`);

  const prodUserId = await detectUser(url, serviceRoleKey);
  const data = await fetchUserData(url, serviceRoleKey, prodUserId);

  console.log("\n[INFO] SQL 생성 중...");
  const dataSql = buildSeedSql(data, prodUserId);

  console.log("[INFO] seed.sql 쓰기 중...");
  await writeSeedFile(dataSql);

  console.log("\n=== 완료 ===");
  console.log(`  routes:               ${data.routes.length}건`);
  console.log(`  route_stops:          ${data.routeStops.length}건`);
  console.log(`  stop_routes:          ${data.stopRoutes.length}건`);
  console.log(`  favorite_stops:       ${data.favoriteStops.length}건`);
  console.log(`  favorite_stop_routes: ${data.favoriteStopRoutes.length}건`);
  console.log(`\n  user_id 치환: 운영 UUID → ${DEV_USER_ID}`);
  console.log(`  파일: ${SEED_PATH}`);

  console.log("\n다음 단계:");
  console.log("  supabase db reset");
  console.log("  → 로컬 DB에 운영 데이터가 dev user_id로 적재됩니다.\n");

  console.warn(
    "주의: 운영 데이터가 seed.sql에 박혔습니다. git 커밋 시 다른 개발자가 본인 운영 라벨/즐겨찾기를 볼 수 있습니다. 협업 환경이라면 .gitignore에 seed.sql 추가 또는 seed.sql.example로 분리 검토."
  );
}

main();
