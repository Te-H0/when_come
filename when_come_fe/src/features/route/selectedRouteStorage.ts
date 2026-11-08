export const SELECTED_ROUTE_KEY = import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true'
  ? 'when_come:local-demo:selectedRouteId'
  : 'when_come:selectedRouteId';
