import { isMapCoordinates, stopKey } from '../types/map';
import type { MapCoordinates, MappableStop } from '../types/map';
import type { NaverMapsSdk } from './naverMapsTypes';

export interface StopMapView {
  setStops: (stops: readonly MappableStop[], onSelect: (keys: string[]) => void) => void;
  setSelectedKey: (key: string | null) => void;
  fitStops: (stops: readonly MappableStop[]) => void;
  resize: () => void;
  destroy: () => void;
}
export interface StopMapAdapter {
  create: (container: HTMLElement, center: MapCoordinates) => StopMapView;
}

function markerContent(stop: MappableStop, selected: boolean): HTMLElement {
  const element = document.createElement('span');
  element.className = selected
    ? 'block max-w-48 break-words rounded-control border-2 border-primary bg-primary p-3 text-button text-primary-foreground shadow-card'
    : 'block max-w-48 break-words rounded-control border border-border-default bg-surface-card p-3 text-label text-text-primary shadow-card';
  // Never interpolate provider names into HTML.
  element.textContent = `${selected ? '선택 · ' : ''}${stop.name}${stop.laneName ? ` · ${stop.laneName}` : ''}`;
  return element;
}

function trySdkCleanup(cleanup: () => void) {
  try { cleanup(); } catch {
    // Authentication can invalidate the SDK before its instances are detached.
  }
}

export function createNaverMapsAdapter(sdk: NaverMapsSdk): StopMapAdapter {
  return {
    create(container, center) {
      if (!isMapCoordinates(center)) throw new Error('Invalid map coordinates');
      const map = new sdk.Map(container, { center: new sdk.LatLng(center.lat, center.lng), zoom: 16 });
      let selectedKey: string | null = null;
      let destroyed = false;
      interface MapMarker {
        stop: MappableStop;
        marker: InstanceType<NaverMapsSdk['Marker']>;
        listener?: unknown;
      }
      let markers: MapMarker[] = [];
      function clearMarkers() {
        const previousMarkers = markers;
        markers = [];
        previousMarkers.forEach(({ marker, listener }) => {
          if (listener != null) trySdkCleanup(() => sdk.Event.removeListener(listener));
          trySdkCleanup(() => sdk.Event.clearInstanceListeners(marker));
          trySdkCleanup(() => marker.setMap(null));
        });
      }
      return {
        setStops(stops, onSelect) {
          if (destroyed) return;
          clearMarkers();
          const currentMarkers = markers;
          const validStops = stops.filter(isMapCoordinates);
          try {
            validStops.forEach(stop => {
              const marker = new sdk.Marker({
                position: new sdk.LatLng(stop.lat, stop.lng), map,
                icon: { content: markerContent(stop, stopKey(stop) === selectedKey) }, title: stop.name,
              });
              const entry: MapMarker = { stop, marker };
              currentMarkers.push(entry);
              entry.listener = sdk.Event.addListener(marker, 'click', () => {
                if (destroyed || markers !== currentMarkers) return;
                onSelect(validStops.filter(other => other.lat === stop.lat && other.lng === stop.lng).map(stopKey));
              });
            });
          } catch (error) {
            clearMarkers();
            throw error;
          }
        },
        setSelectedKey(key) {
          if (destroyed) return;
          const changed = key !== selectedKey;
          selectedKey = key;
          markers.forEach(({ stop, marker }) => {
            const selected = stopKey(stop) === key;
            marker.setIcon({ content: markerContent(stop, selected) });
            marker.setZIndex(selected ? 10 : 0);
            if (selected && changed) map.setCenter(new sdk.LatLng(stop.lat, stop.lng));
          });
        },
        fitStops(stops) {
          if (destroyed || stops.length === 0) return;
          const positions = stops.filter(isMapCoordinates).map(stop => new sdk.LatLng(stop.lat, stop.lng));
          if (positions.length > 0) {
            map.fitBounds(positions, { maxZoom: 16, top: 48, right: 48, bottom: 48, left: 48 });
          }
        },
        resize() { if (!destroyed) map.autoResize(); },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          clearMarkers();
          trySdkCleanup(() => sdk.Event.clearInstanceListeners(map));
          trySdkCleanup(() => map.destroy());
        },
      };
    },
  };
}
