create table anomaly_logs (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  source     text        not null,
  category   text        not null,
  detail     jsonb       not null,
  user_id    uuid        references auth.users on delete set null
);

create index on anomaly_logs (category, created_at desc);
create index on anomaly_logs (source,   created_at desc);

-- RLS: anon/authenticated 은 read/write 모두 막음, service role 만 접근 가능
-- (정책을 생성하지 않으면 RLS 활성화 상태에서 anon은 자동 차단됨)
alter table anomaly_logs enable row level security;
