-- subway_code 컬럼 추가: 지하철 노선 매칭 키
-- 서울 지하철 API lineName 형식 ("1001"~"1031"), bus row는 NULL

ALTER TABLE stop_routes
  ADD COLUMN subway_code text NULL;

COMMENT ON COLUMN stop_routes.subway_code IS
  'ODsay subwayCode = 서울 지하철 API lineName 형식 ("1001"~"1031"). bus row는 NULL.';

ALTER TABLE favorite_stop_routes
  ADD COLUMN subway_code text NULL;

COMMENT ON COLUMN favorite_stop_routes.subway_code IS
  'ODsay subwayCode = 서울 지하철 API lineName 형식 ("1001"~"1031"). bus row는 NULL.';
