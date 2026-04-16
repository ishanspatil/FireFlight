import * as THREE from 'three';
import { scene, sunLight } from './scene.js';
import { satellite, getSubSatelliteCoordinates } from './satellite.js';
import { latLonToSurfaceVector, vectorToLatLon } from './utils.js';
import { resolveImageAreaLocation } from './geocode.js';
import { renderSummary, renderHistory, updateStatusPill } from './ui.js';
import {
  EARTH_RADIUS,
  EARTH_MEAN_RADIUS_KM,
  HALF_SWATH_WIDTH_KM,
  HALF_SWATH_ANGLE_RAD,
  TRACE_FADE_DURATION_MS,
} from './constants.js';

// Shared reusable vectors (avoids GC pressure in animation loop)
const _satWorldPos = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _tempA = new THREE.Vector3();
const _tempB = new THREE.Vector3();
const _tempC = new THREE.Vector3();

// Module state
let earth = null;
let isImaging = false;
export let isSunFacing = false;

export const imagingHistory = [];
let activeImagingSession = null;
let lastSession = null;

// Light cone mesh
const lightConeMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ea6ff,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const lightConeMesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true), lightConeMaterial);
lightConeMesh.visible = false;
scene.add(lightConeMesh);

// Active trace mesh
const traceMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ea6ff,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const activeTraceMesh = new THREE.Mesh(new THREE.BufferGeometry(), traceMaterial.clone());
activeTraceMesh.visible = false;
scene.add(activeTraceMesh);

const fadingTraceMeshes = [];

export function setEarth(earthMesh) {
  earth = earthMesh;
}

function getImagingFootprint(startCoords, endCoords) {
  if (!startCoords || !endCoords) return null;

  const startNormal = latLonToSurfaceVector(startCoords, 1).normalize();
  const endNormal = latLonToSurfaceVector(endCoords, 1).normalize();
  const axis = _tempA.copy(startNormal).cross(endNormal);

  if (axis.lengthSq() < 1e-8) return null;
  axis.normalize();

  const startAlong = _tempB.copy(axis).cross(startNormal).normalize();
  const endAlong = _tempC.copy(axis).cross(endNormal).normalize();

  const startCross = new THREE.Vector3().copy(startAlong).cross(startNormal).normalize();
  const endCross = new THREE.Vector3().copy(endAlong).cross(endNormal).normalize();

  const cos = Math.cos(HALF_SWATH_ANGLE_RAD);
  const sin = Math.sin(HALF_SWATH_ANGLE_RAD);

  const startLeft = startNormal
    .clone()
    .multiplyScalar(cos)
    .addScaledVector(startCross, sin)
    .normalize();
  const startRight = startNormal
    .clone()
    .multiplyScalar(cos)
    .addScaledVector(startCross, -sin)
    .normalize();
  const endLeft = endNormal.clone().multiplyScalar(cos).addScaledVector(endCross, sin).normalize();
  const endRight = endNormal
    .clone()
    .multiplyScalar(cos)
    .addScaledVector(endCross, -sin)
    .normalize();

  const corners = [startLeft, startRight, endRight, endLeft].map((n) =>
    n.multiplyScalar(EARTH_RADIUS * 1.0015)
  );

  return {
    corners,
    centerStart: vectorToLatLon(startNormal),
    centerEnd: vectorToLatLon(endNormal),
  };
}

function updateTraceMesh(mesh, footprint) {
  if (!footprint) {
    mesh.visible = false;
    return;
  }
  const [a, b, c, d] = footprint.corners;
  const positions = new Float32Array([
    a.x,
    a.y,
    a.z,
    b.x,
    b.y,
    b.z,
    c.x,
    c.y,
    c.z,
    a.x,
    a.y,
    a.z,
    c.x,
    c.y,
    c.z,
    d.x,
    d.y,
    d.z,
  ]);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BufferGeometry();
  mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mesh.geometry.computeVertexNormals();
  mesh.visible = true;
}

function updateLightCone(targetCoords) {
  if (!isImaging || !targetCoords) {
    lightConeMesh.visible = false;
    return;
  }
  const targetWorld = latLonToSurfaceVector(targetCoords, EARTH_RADIUS);
  const satWorld = satellite.getWorldPosition(new THREE.Vector3());
  const axis = targetWorld.clone().sub(satWorld);
  const height = axis.length();

  if (height <= 1e-6) {
    lightConeMesh.visible = false;
    return;
  }

  const coneRadius = (HALF_SWATH_WIDTH_KM / EARTH_MEAN_RADIUS_KM) * EARTH_RADIUS;
  lightConeMesh.scale.set(coneRadius, height, coneRadius);
  lightConeMesh.position.copy(satWorld.clone().add(targetWorld).multiplyScalar(0.5));
  lightConeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  lightConeMesh.rotateX(Math.PI);
  lightConeMesh.visible = true;
}

function beginImagingSession() {
  const startCoords = getSubSatelliteCoordinates(earth);
  activeImagingSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    startCoords,
    endCoords: startCoords,
    location: 'Resolving location...',
    footprint: null,
  };
  renderSummary(activeImagingSession);
}

async function completeImagingSession() {
  if (!activeImagingSession) return;

  activeImagingSession.endedAt = new Date().toISOString();
  activeImagingSession.endCoords = getSubSatelliteCoordinates(earth);
  activeImagingSession.footprint = getImagingFootprint(
    activeImagingSession.startCoords,
    activeImagingSession.endCoords
  );

  const finalized = { ...activeImagingSession };
  activeImagingSession = null;

  if (finalized.footprint) {
    const fadedMesh = new THREE.Mesh(activeTraceMesh.geometry.clone(), traceMaterial.clone());
    fadedMesh.material.opacity = 0.3;
    scene.add(fadedMesh);
    fadingTraceMeshes.push({ mesh: fadedMesh, startedAtMs: performance.now() });
  }

  activeTraceMesh.visible = false;
  lightConeMesh.visible = false;

  lastSession = finalized;
  imagingHistory.push(finalized);
  renderSummary(lastSession);
  renderHistory(imagingHistory);

  const resolvedLocation = await resolveImageAreaLocation(finalized.footprint);
  finalized.location = resolvedLocation;

  if (lastSession?.id === finalized.id) renderSummary(finalized);
  renderHistory(imagingHistory);
}

export function setImagingState(nextState) {
  if (isImaging === nextState) return;
  isImaging = nextState;

  if (isImaging) {
    beginImagingSession();
    updateLightCone(activeImagingSession?.endCoords ?? null);
  } else {
    completeImagingSession();
  }

  updateSatelliteStatus();
}

export function updateSatelliteStatus() {
  satellite.getWorldPosition(_satWorldPos);
  _sunDir.copy(sunLight.position).normalize();
  isSunFacing = _satWorldPos.dot(_sunDir) > 0;
  updateStatusPill(isImaging && isSunFacing ? 'imaging' : isSunFacing ? 'charging' : 'eclipse');
}

export function tickImaging() {
  if (!activeImagingSession) return;
  activeImagingSession.endCoords = getSubSatelliteCoordinates(earth);
  activeImagingSession.footprint = getImagingFootprint(
    activeImagingSession.startCoords,
    activeImagingSession.endCoords
  );
  updateTraceMesh(activeTraceMesh, activeImagingSession.footprint);
  updateLightCone(activeImagingSession.endCoords);
  renderSummary(activeImagingSession);
}

export function tickFadingTraces() {
  const now = performance.now();
  for (let i = fadingTraceMeshes.length - 1; i >= 0; i--) {
    const trace = fadingTraceMeshes[i];
    const t = THREE.MathUtils.clamp((now - trace.startedAtMs) / TRACE_FADE_DURATION_MS, 0, 1);
    trace.mesh.material.opacity = 0.3 * (1 - t);
    if (t >= 1) {
      scene.remove(trace.mesh);
      trace.mesh.geometry.dispose();
      trace.mesh.material.dispose();
      fadingTraceMeshes.splice(i, 1);
    }
  }
}
