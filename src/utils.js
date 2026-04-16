import * as THREE from 'three';
import { EARTH_RADIUS } from './constants.js';

export function formatCoordinates(coords) {
  if (!coords) return 'Unknown';
  const latSuffix = coords.lat >= 0 ? 'N' : 'S';
  const lonSuffix = coords.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.lat).toFixed(2)}°${latSuffix}, ${Math.abs(coords.lon).toFixed(2)}°${lonSuffix}`;
}

export function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function vectorToLatLon(vec) {
  const normal = vec.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(normal.z, normal.x)),
  };
}

export function latLonToSurfaceVector(coords, radius = EARTH_RADIUS) {
  const latRad = THREE.MathUtils.degToRad(coords.lat);
  const lonRad = THREE.MathUtils.degToRad(coords.lon);
  const cosLat = Math.cos(latRad);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    radius * cosLat * Math.sin(lonRad)
  );
}
