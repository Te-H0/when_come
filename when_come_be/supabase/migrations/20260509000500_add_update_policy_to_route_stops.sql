-- route_stops: 본인 경로의 stop만 수정 가능 (alias 등)
create policy "route_stops: 본인 경로만 수정"
  on route_stops for update
  using (
    exists (
      select 1 from routes
      where routes.id = route_stops.route_id
        and routes.user_id = auth.uid()
    )
  );

-- stop_routes: 본인 경로의 stop_routes만 수정 가능
-- 현재 노선 변경은 DELETE+INSERT 패턴이지만 추후 단독 UPDATE를 위해 추가
create policy "stop_routes: 본인 경로만 수정"
  on stop_routes for update
  using (
    exists (
      select 1 from route_stops rs
      join routes r on r.id = rs.route_id
      where rs.id = stop_routes.stop_id
        and r.user_id = auth.uid()
    )
  );
