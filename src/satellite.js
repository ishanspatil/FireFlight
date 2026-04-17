import * as THREE from 'three';
import { scene } from './scene.js';
import { EARTH_RADIUS, ORBIT_RADIUS, ORBIT_INCLINATION_DEG } from './constants.js';

export const satellite = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.08),
  new THREE.MeshStandardMaterial({ color: 0xd8dde5, flatShading: true })
);

export const satelliteOrbit = new THREE.Group();
export const orbitGroup = new THREE.Group();

// Orbit path ring
const orbitPathPoints = [];
for (let i = 0; i < 256; i++) {
  const angle = (i / 256) * Math.PI * 2;
  orbitPathPoints.push(
    new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS)
  );
}
orbitGroup.add(
  new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(orbitPathPoints),
    new THREE.LineBasicMaterial({ color: 0xffb2ac, transparent: true, opacity: 0.42 })
  )
);

satellite.position.set(ORBIT_RADIUS, 0, 0);
satelliteOrbit.add(satellite);
orbitGroup.add(satelliteOrbit);
orbitGroup.rotation.x = THREE.MathUtils.degToRad(ORBIT_INCLINATION_DEG);
scene.add(orbitGroup);

const _worldPos = new THREE.Vector3();
const _localDir = new THREE.Vector3();

export function getSubSatelliteCoordinates(earth) {
  if (!earth) return null;

  satellite.getWorldPosition(_worldPos);
  _localDir.copy(_worldPos);
  earth.worldToLocal(_localDir);
  _localDir.normalize();

  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_localDir.y, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(-_localDir.z, _localDir.x)),
  };
}

// Keep EARTH_RADIUS accessible for orbit calculations that need it
export { EARTH_RADIUS };
