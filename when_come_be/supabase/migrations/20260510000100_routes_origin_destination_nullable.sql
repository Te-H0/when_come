-- routes 테이블의 origin_name / destination_name을 nullable로 변경.
-- 배경: 수동 등록 모드에서 출발지/도착지를 명시하지 않을 수 있음.
-- FE가 placeholder string ('출발지'/'도착지')을 그대로 보내던 버그 방어를 위해
-- FE는 null로 전송하고 BE는 null을 그대로 저장한다.

ALTER TABLE routes ALTER COLUMN origin_name DROP NOT NULL;
ALTER TABLE routes ALTER COLUMN destination_name DROP NOT NULL;

-- 기존 placeholder 데이터 정리:
-- FE의 placeholder fallback ('?? "출발지"') 로 저장된 row를 NULL로 초기화한다.
-- 안전조건: origin_coords IS NULL (PlacePicker 검색 시 좌표가 박히므로, 좌표 없는 placeholder
-- 만 정리해 사용자가 진짜로 "출발지"라고 명명한 경우와 분리).
UPDATE routes SET origin_name = NULL
  WHERE origin_name = '출발지' AND origin_coords IS NULL;
UPDATE routes SET destination_name = NULL
  WHERE destination_name = '도착지' AND destination_coords IS NULL;
