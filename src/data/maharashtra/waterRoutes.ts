import type { GeoPoint, WaterRoute } from './types';

/**
 * Ferry, speedboat and cruise routes. DATA NOTE — routes are approximate, simplified interpretations drawn over open
 * water (±500 m); the cruise loop and the speedboat course are fictional in-game routes.
 */
export const WATER_ROUTES_DATA_NOTE = 'Water routes are approximate simplified lines over open water; the cruise loop and the speedboat course are fictional in-game routes.';

const p = (lat: number, lon: number): GeoPoint => ({ lat, lon });

export const WATER_ROUTES: WaterRoute[] = [
  {
    id: 'gateway-mandwa', name: 'Gateway of India ↔ Mandwa ferry', from: 'gateway-jetty', to: 'mandwa', vessel: 'ferry', dataNote: WATER_ROUTES_DATA_NOTE,
    path: [p(18.9225, 72.8352), p(18.917, 72.842), p(18.905, 72.851), p(18.88, 72.862), p(18.85, 72.872), p(18.825, 72.879), p(18.803, 72.883)],
  },
  {
    id: 'ferry-wharf-rewas', name: 'Ferry Wharf ↔ Rewas', from: 'ferry-wharf', to: 'rewas', vessel: 'ferry', dataNote: WATER_ROUTES_DATA_NOTE,
    path: [p(18.953, 72.848), p(18.945, 72.86), p(18.93, 72.88), p(18.91, 72.9), p(18.89, 72.916), p(18.876, 72.926)],
  },
  {
    id: 'konkan-cruise', name: 'Mumbai Konkan-coast cruise loop', from: 'ballard-pier', to: 'ballard-pier', vessel: 'cruise', dataNote: WATER_ROUTES_DATA_NOTE,
    path: [p(18.944, 72.842), p(18.93, 72.855), p(18.9, 72.86), p(18.86, 72.84), p(18.8, 72.8), p(18.65, 72.76), p(18.45, 72.78), p(18.3, 72.82), p(18.05, 72.9), p(17.8, 72.98), p(17.5, 73.05), p(17.2, 73.12), p(17.0, 73.18), p(16.7, 73.22), p(16.4, 73.3), p(16.06, 73.38), p(16.2, 73.2), p(16.6, 73.1), p(17.1, 73.0), p(17.6, 72.85), p(18.1, 72.75), p(18.6, 72.7), p(18.85, 72.78), p(18.9, 72.855), p(18.93, 72.855), p(18.944, 72.842)],
  },
  {
    id: 'alibaug-speedboat', name: 'Alibaug speedboat checkpoint course', from: 'mandwa', to: 'mandwa', vessel: 'speedboat', dataNote: WATER_ROUTES_DATA_NOTE,
    path: [p(18.803, 72.883), p(18.812, 72.874), p(18.822, 72.862), p(18.815, 72.85), p(18.802, 72.846), p(18.79, 72.855), p(18.788, 72.868), p(18.795, 72.878), p(18.803, 72.883)],
  },
];

const BY_ID = new Map(WATER_ROUTES.map((r) => [r.id, r]));

export function waterRouteById(id: string): WaterRoute | undefined {
  return BY_ID.get(id);
}
