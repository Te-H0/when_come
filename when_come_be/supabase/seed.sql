-- ─────────────────────────────────────────────────────────────────────────────
-- when_come 로컬 개발 시드
-- `supabase db reset` 시 자동 실행됨.
-- 멱등: 여러 번 실행해도 결과 동일 (ON CONFLICT DO NOTHING).
-- 실제 ODsay/서울 버스 ID가 아니므로 arrival-info 호출 시 외부 API 에러 발생.
-- 실제 데이터가 필요하면 Supabase Studio에서 수동 추가하거나 seed.sql에 직접 추가.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. pgcrypto (crypt/gen_salt 필요)
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dev 유저 생성
-- UUID: 00000000-0000-0000-0000-000000000001
-- email: dev@when-come.local / password: devpassword123
-- ─────────────────────────────────────────────────────────────────────────────
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev@when-come.local',
  crypt('devpassword123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- auth.identities: Supabase는 identities 없으면 로그인 거부
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'dev@when-come.local',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"dev@when-come.local","email_verified":true}',
  'email',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. routes — 운영 데이터 (user_id → dev UUID로 치환됨)
-- ─────────────────────────────────────────────────────────────────────────────
insert into routes (
  id, user_id, name, origin_name, destination_name,
  origin_coords, destination_coords,
  is_active, display_order, active,
  created_at
)
values
  (
    '68df16e7-cffe-4eb9-b40b-db5169a9ffc3',
    '00000000-0000-0000-0000-000000000001',
    '회사',
    '출발지',
    '도착지',
    null,
    null,
    true, 0, true,
    now()
  ),
  (
    '0f696c23-4b0a-4a46-b4c4-c27feae44a47',
    '00000000-0000-0000-0000-000000000001',
    '집',
    '출발지',
    '도착지',
    null,
    null,
    true, 1, true,
    now()
  ),
  (
    '6641ff70-3bd4-4547-83c6-69732cf68790',
    '00000000-0000-0000-0000-000000000001',
    'test',
    '출발지',
    '도착지',
    null,
    null,
    true, 2, true,
    now()
  ),
  (
    'd0b2af6d-eb8f-47ee-8628-69c32fa3e249',
    '00000000-0000-0000-0000-000000000001',
    'test2',
    'HD현대오일뱅크 대원셀프주유소',
    '쌍문역 4호선',
    '{"lat":37.486201,"lng":126.8562456}'::jsonb,
    '{"lat":37.6486101,"lng":127.034689}'::jsonb,
    true, 3, true,
    now()
  ),
  (
    '122ec9fd-aa67-4b8b-a0da-b7aebb4110ac',
    '00000000-0000-0000-0000-000000000001',
    'test3',
    '강동역 5호선',
    '가산디지털단지역 1호선',
    '{"lat":37.5359577,"lng":127.1321605}'::jsonb,
    '{"lat":37.4816317,"lng":126.8825603}'::jsonb,
    true, 4, true,
    now()
  ),
  (
    '5fbd8993-d851-493e-b85f-2c55468af188',
    '00000000-0000-0000-0000-000000000001',
    '흠',
    '가산디지털단지역 1호선',
    '강동역 5호선',
    '{"lat":37.4816317,"lng":126.8825603}'::jsonb,
    '{"lat":37.5359577,"lng":127.1321605}'::jsonb,
    true, 5, true,
    now()
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. route_stops
-- ─────────────────────────────────────────────────────────────────────────────
insert into route_stops (
  id, route_id,
  odsay_stop_id, stop_name, stop_type, sequence, step_group,
  ars_id, provider, gbis_station_id,
  direction_headsign, direction_updn, direction_next_stop,
  alias,
  created_at
)
values
  (
    '4b76e3e1-9e5b-4c52-981a-aa1fc3143543',
    '5fbd8993-d851-493e-b85f-2c55468af188',
    '544', '군자', 'subway', 1, 2,
    null, 'seoul', null,
    '강동행', 'down', '강동',
    null,
    now()
  ),
  (
    'c309a080-223c-4b4b-ab85-ff8999bd7cc3',
    '5fbd8993-d851-493e-b85f-2c55468af188',
    '746', '가산디지털단지', 'subway', 1, 1,
    null, 'seoul', null,
    '군자행', 'up', '군자',
    null,
    now()
  ),
  (
    '04fd4a37-59f2-4f63-ab32-e2e4a69172fe',
    '68df16e7-cffe-4eb9-b40b-db5169a9ffc3',
    '125297', '개봉전화국', 'bus', 1, 1,
    '17494', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    'dee2c48b-6054-489a-a2db-a80f493d7ffd',
    '68df16e7-cffe-4eb9-b40b-db5169a9ffc3',
    '101390', '개봉역', 'bus', 1, 2,
    '17234', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    '80e112fa-f197-41b4-bcdd-cc7086d1f7a5',
    '0f696c23-4b0a-4a46-b4c4-c27feae44a47',
    '5009054', '가리봉파출소', 'bus', 1, 1,
    '17249', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '6641ff70-3bd4-4547-83c6-69732cf68790',
    '101360', '대원주유소', 'bus', 1, 1,
    '17207', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    'fa564e97-992f-4579-b93e-0d23eb660dfa',
    'd0b2af6d-eb8f-47ee-8628-69c32fa3e249',
    '17494', '개봉전화국', 'bus', 1, 1,
    '17494', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    '9438970a-003f-425a-b57a-339cd358d626',
    'd0b2af6d-eb8f-47ee-8628-69c32fa3e249',
    '143', '개봉', 'subway', 1, 2,
    null, 'seoul', null,
    '서울역행', 'up', '서울역',
    null,
    now()
  ),
  (
    '31ae28ce-42d6-4b6d-9725-c14724953a90',
    'd0b2af6d-eb8f-47ee-8628-69c32fa3e249',
    '426', '서울역', 'subway', 1, 3,
    null, 'seoul', null,
    '쌍문행', 'up', '쌍문',
    null,
    now()
  ),
  (
    'cacb9b93-8c94-4464-8858-7c76b52026af',
    '122ec9fd-aa67-4b8b-a0da-b7aebb4110ac',
    '548', '강동', 'subway', 1, 1,
    null, 'seoul', null,
    '군자행', 'up', '군자',
    null,
    now()
  ),
  (
    '02d2d02f-4440-478e-a2df-ce2c7bb62753',
    '122ec9fd-aa67-4b8b-a0da-b7aebb4110ac',
    '725', '군자', 'subway', 1, 2,
    null, 'seoul', null,
    '가산디지털단지행', 'down', '가산디지털단지',
    null,
    now()
  ),
  (
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '68df16e7-cffe-4eb9-b40b-db5169a9ffc3',
    '101360', '대원주유소', 'bus', 2, 1,
    '17207', 'seoul', null,
    null, null, null,
    null,
    now()
  ),
  (
    'ca7a53a4-e646-4d5b-89c3-9ce3c7519599',
    '0f696c23-4b0a-4a46-b4c4-c27feae44a47',
    '102015', '디지털단지오거리', 'bus', 2, 1,
    '17389', 'seoul', null,
    null, null, null,
    null,
    now()
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. stop_routes — 각 정류장의 탑승 노선
-- ─────────────────────────────────────────────────────────────────────────────
insert into stop_routes (
  id, stop_id,
  odsay_route_id, route_name, bus_type,
  st_id, bus_route_id, station_ord, station_name,
  gbis_route_id, gbis_sta_order,
  provider, subway_code,
  created_at
)
values
  (
    '0354604c-9f85-4ca7-85bb-a9dd1621c5a6',
    '04fd4a37-59f2-4f63-ab32-e2e4a69172fe',
    '116900010', '구로03', 3,
    null, '116900010', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '8606ed02-2a2b-4f4b-b295-765821258beb',
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '116900004', '구로11', 3,
    null, '116900004', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'ee45fe7f-1bc8-4962-8c2f-7b4c0dd3cfb5',
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '213000008', '11', 8,
    null, '213000008', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'd7070d6c-9a13-42e4-a8fc-f50c629cda37',
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '213000006', '1', 8,
    null, '213000006', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    '5092a116-baf4-443c-a8d3-96fda5e34298',
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '213000010', '22', 8,
    null, '213000010', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'a1a37a38-71fa-4e39-a10a-c455dd50c252',
    'd6faaf58-0f8e-4435-b699-6be8d0551980',
    '213000009', '39', 8,
    null, '213000009', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'e520878a-efdb-4982-92b2-adc0687e58e6',
    'dee2c48b-6054-489a-a2db-a80f493d7ffd',
    '100100096', '643', 11,
    null, '100100096', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '8e09e16b-c0c5-4dd6-a817-bb1d4bf5959d',
    'dee2c48b-6054-489a-a2db-a80f493d7ffd',
    '100100098', '651', 11,
    null, '100100098', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '616c6ca8-2234-4f19-b9e4-ce4d4a4d90cb',
    'dee2c48b-6054-489a-a2db-a80f493d7ffd',
    '232000067', '388', 8,
    null, '232000067', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    '874abe4c-05c1-4822-9595-c1dedb2503e0',
    '80e112fa-f197-41b4-bcdd-cc7086d1f7a5',
    '100100096', '643', 11,
    null, '100100096', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '6166085e-fcdb-4081-9a06-f663e0942749',
    '80e112fa-f197-41b4-bcdd-cc7086d1f7a5',
    '100100098', '651', 11,
    null, '100100098', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '7cb40b18-78a7-41b0-92f4-d50b53f2a071',
    'ca7a53a4-e646-4d5b-89c3-9ce3c7519599',
    '100100096', '643', 11,
    null, '100100096', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'f308490c-486c-4a4d-97b9-3e856bdc8fc5',
    'ca7a53a4-e646-4d5b-89c3-9ce3c7519599',
    '100100098', '651', 11,
    null, '100100098', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '2adad2ad-3937-4933-a97a-1d5d47228922',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '116900010', '구로03', 3,
    null, '116900010', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '1a11cf40-e093-4ebe-943b-93c3656d44b9',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '116900011', '구로04', 3,
    null, '116900011', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'd0a025ca-cafc-4a37-aee1-7cbf8af6a067',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '116900004', '구로11', 3,
    null, '116900004', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'd38d04ab-708f-4828-89a4-0503a44b2928',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '100100298', '6616', 12,
    null, '100100298', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'c7181084-f128-42ef-84b1-19fe97ff8c69',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '100100312', '6637', 12,
    null, '100100312', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '40b784e3-42b1-44b6-b2f8-d9578be99c08',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '100100313', '6638', 12,
    null, '100100313', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    'ecfd346e-b878-4439-b771-a2d1d2564773',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '213000008', '11', 8,
    null, '213000008', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    '9e77fc0a-805d-4113-8d9c-f7d7f7753945',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '213000006', '1', 8,
    null, '213000006', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'd0704812-ba6c-4201-9739-95b9d57ebf47',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '213000010', '22', 8,
    null, '213000010', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'a29f95c6-5b2c-40a1-a550-bbeda552c16a',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '213000009', '39', 8,
    null, '213000009', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    'b9112323-eb5e-4c6b-b01a-08f49d825110',
    '5cdeff93-757c-47b4-836d-b21f60ecb3e7',
    '224000029', '530', 8,
    null, '224000029', null, null,
    null, null,
    'gyeonggi', null,
    now()
  ),
  (
    '998286e2-8a06-4e22-b13a-f3a6b98db20e',
    'fa564e97-992f-4579-b93e-0d23eb660dfa',
    '116900010', '구로03', 3,
    null, '116900010', null, null,
    null, null,
    'seoul', null,
    now()
  ),
  (
    '485e3f99-9026-49f9-a2ac-e172ff31567e',
    '9438970a-003f-425a-b57a-339cd358d626',
    '143', '1호선', null,
    null, null, null, '개봉',
    null, null,
    'seoul', '1001',
    now()
  ),
  (
    '70bf174e-723c-4218-8a12-0c72a1834c09',
    '31ae28ce-42d6-4b6d-9725-c14724953a90',
    '426', '4호선', null,
    null, null, null, '서울역',
    null, null,
    'odsay_fallback', '1004',
    now()
  ),
  (
    'fe163e59-9f3e-48cc-826f-094ba1750a8f',
    'cacb9b93-8c94-4464-8858-7c76b52026af',
    '548', '5호선', null,
    null, null, null, '강동',
    null, null,
    'odsay_fallback', '1005',
    now()
  ),
  (
    '082830a7-a524-4c9b-bd31-5ea928b45e45',
    '02d2d02f-4440-478e-a2df-ce2c7bb62753',
    '725', '7호선', null,
    null, null, null, '군자',
    null, null,
    'odsay_fallback', '1007',
    now()
  ),
  (
    '78c81551-8a03-43fe-a014-09746d5368f7',
    'c309a080-223c-4b4b-ab85-ff8999bd7cc3',
    '746', '7호선', null,
    null, null, null, '가산디지털단지',
    null, null,
    'odsay_fallback', '1007',
    now()
  ),
  (
    'b11842c4-5bc0-45b4-a2c8-1d584c971128',
    '4b76e3e1-9e5b-4c52-981a-aa1fc3143543',
    '544', '5호선', null,
    null, null, null, '군자',
    null, null,
    'odsay_fallback', '1005',
    now()
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. favorite_stops — 즐겨찾기
-- ─────────────────────────────────────────────────────────────────────────────
insert into favorite_stops (
  id, user_id,
  odsay_stop_id, stop_name, stop_type,
  ars_id, lat, lng,
  direction_headsign, direction_updn, direction_next_stop,
  provider, gbis_station_id,
  alias, display_order,
  created_at
)
values
  (
    '013eebab-8a5f-4218-9e54-382edb2fb2d2',
    '00000000-0000-0000-0000-000000000001',
    '143', '개봉', 'subway',
    null, 37.494546, 126.859157,
    null, null, null,
    'seoul', null,
    null, 0,
    now()
  ),
  (
    'c8d31043-f6ea-433a-9e65-9cd2596ed571',
    '00000000-0000-0000-0000-000000000001',
    '748', '광명사거리', 'subway',
    null, 37.479286, 126.854892,
    null, null, null,
    'seoul', null,
    null, 2,
    now()
  ),
  (
    '62241d3f-c1ef-4eab-a5a6-d3d63a2ab212',
    '00000000-0000-0000-0000-000000000001',
    '125297', '개봉전화국', 'bus',
    '17494', 37.486368, 126.856065,
    null, null, null,
    'seoul', null,
    null, 3,
    now()
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. favorite_stop_routes — 즐겨찾기 정류장의 노선
-- ─────────────────────────────────────────────────────────────────────────────
insert into favorite_stop_routes (
  id, favorite_stop_id,
  odsay_route_id, route_name, bus_type,
  st_id, bus_route_id, station_ord, station_name,
  gbis_route_id, gbis_sta_order,
  provider, subway_code,
  display_order,
  created_at
)
values
  (
    'd0901bc6-cfe9-4099-b8aa-87ec3ee5e104',
    '013eebab-8a5f-4218-9e54-382edb2fb2d2',
    '143', '수도권 1호선', null,
    null, null, null, null,
    null, null,
    'seoul', '1001',
    0,
    now()
  ),
  (
    '3acfe19d-3c38-4967-b160-e1f9e62c38ca',
    'c8d31043-f6ea-433a-9e65-9cd2596ed571',
    '748', '수도권 7호선', null,
    null, null, null, null,
    null, null,
    'odsay_fallback', '1007',
    0,
    now()
  ),
  (
    'f0e75d33-621b-4d84-93d6-ef532607a797',
    '62241d3f-c1ef-4eab-a5a6-d3d63a2ab212',
    '116900010', '구로03', 3,
    null, '116900010', null, '개봉전화국',
    null, null,
    'seoul', null,
    0,
    now()
  )
on conflict (id) do nothing;

