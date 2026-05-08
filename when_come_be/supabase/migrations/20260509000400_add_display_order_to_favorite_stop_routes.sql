alter table favorite_stop_routes
  add column display_order int not null default 0;

-- 기존 row가 있으면 created_at 순으로 0부터 채움 (favorite_stop_id 별)
with ordered as (
  select id, row_number() over (
    partition by favorite_stop_id order by created_at
  ) - 1 as rn
  from favorite_stop_routes
)
update favorite_stop_routes r
set display_order = ordered.rn
from ordered
where r.id = ordered.id;

create index favorite_stop_routes_order_idx
  on favorite_stop_routes(favorite_stop_id, display_order);
