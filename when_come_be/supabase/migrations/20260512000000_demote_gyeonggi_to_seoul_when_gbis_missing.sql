-- 서울 bbox 정류장(gbis_station_id IS NULL + ars_id IS NOT NULL)에 등록된
-- 경기버스 노선의 provider를 'gyeonggi' → 'seoul'로 다운그레이드.
--
-- 이유: GBIS(경기 버스 정보 시스템)는 경기도 정류소만 관리한다.
-- gbis_station_id가 없는 서울 bbox 정류장에서 경기버스가 경유하더라도
-- Seoul BIS(getStationByUid)가 해당 정류장의 모든 버스(경기버스 포함) 도착정보를 반환한다.
-- 기존에 'gyeonggi'로 잘못 저장된 stop_routes는 GyeonggiBusProvider.canHandle(ctx)가
-- gbis_station_id=null 조건에서 false를 반환해 조용히 스킵됨 → 도착 정보 없음 버그.

-- stop_routes: route_stops 기반
UPDATE stop_routes sr
SET provider = 'seoul'
FROM route_stops rs
WHERE sr.stop_id = rs.id
  AND sr.provider = 'gyeonggi'
  AND rs.gbis_station_id IS NULL
  AND rs.ars_id IS NOT NULL;

-- favorite_stop_routes: favorite_stops 기반
UPDATE favorite_stop_routes fsr
SET provider = 'seoul'
FROM favorite_stops fs
WHERE fsr.favorite_stop_id = fs.id
  AND fsr.provider = 'gyeonggi'
  AND fs.gbis_station_id IS NULL
  AND fs.ars_id IS NOT NULL;
