import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020615);

// Star field
const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 60 + Math.random() * 140;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.15,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.85
});
scene.add(new THREE.Points(starGeometry, starMaterial));

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const statusPill = document.getElementById('status-pill');
const imagingSummary = document.getElementById('imaging-summary');
const historyToggle = document.getElementById('history-toggle');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

// Lighting
scene.add(new THREE.AmbientLight(0x1d304f, 0.1));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
sunLight.position.set(10, 2, 3);
scene.add(sunLight);

function loadTexture(url, { color = false } = {}) {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (color) texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

const earthRadius = 1;
let earth;

async function setupEarth() {
  // Real satellite textures (actual space-view pixel colors)
  const [diffuse, bump, roughness] = await Promise.all([
    loadTexture('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', { color: true }),
    loadTexture('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'),
    loadTexture('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg')
  ]);

  const earthGeometry = new THREE.SphereGeometry(earthRadius, 128, 128);
  const earthMaterial = new THREE.MeshStandardMaterial({
    map: diffuse,
    bumpMap: bump,
    bumpScale: 0.03,
    roughnessMap: roughness,
    roughness: 0.88,
    metalness: 0.02
  });

  earth = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earth);

  // Atmosphere glow
  const atmosphereGeo = new THREE.SphereGeometry(earthRadius * 1.12, 64, 64);
  const atmosphereMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true
  });
  scene.add(new THREE.Mesh(atmosphereGeo, atmosphereMat));
}

// Satellite
const satelliteSize = 0.08;
const satelliteGeometry = new THREE.BoxGeometry(satelliteSize, satelliteSize, satelliteSize);
const satelliteMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde5, flatShading: true });
const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);

// Orbit groups
const orbitRadius = earthRadius + 0.2;
const orbitGroup = new THREE.Group();
const satelliteOrbit = new THREE.Group();

const orbitPathPoints = [];
const segments = 256;
for (let i = 0; i < segments; i++) {
  const angle = (i / segments) * Math.PI * 2;
  orbitPathPoints.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
}
const orbitPathGeometry = new THREE.BufferGeometry().setFromPoints(orbitPathPoints);
const orbitPathMaterial = new THREE.LineBasicMaterial({ color: 0xffb2ac, transparent: true, opacity: 0.42 });
const orbitPath = new THREE.LineLoop(orbitPathGeometry, orbitPathMaterial);
orbitGroup.add(orbitPath);

satellite.position.set(orbitRadius, 0, 0);
satelliteOrbit.add(satellite);
orbitGroup.add(satelliteOrbit);
orbitGroup.rotation.x = THREE.MathUtils.degToRad(98);
scene.add(orbitGroup);

camera.position.set(0, 1.2, 4.8);

const satelliteWorldPosition = new THREE.Vector3();
const satelliteEarthLocalDirection = new THREE.Vector3();
const sunDirection = new THREE.Vector3();
const tempVectorA = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempVectorC = new THREE.Vector3();
let currentStatus = 'charging';
let isImaging = false;
let isSunFacing = false;
const longPressDurationMs = 300;
const longPressMoveTolerance = 8;
let longPressTimerId = null;
let activePointerId = null;
let pressStartPosition = null;
let activeImagingSession = null;
let lastSession = null;
const imagingHistory = [];
const earthMeanRadiusKm = 6371;
const halfSwathWidthKm = 50;
const halfSwathAngleRad = halfSwathWidthKm / earthMeanRadiusKm;

const lightConeMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ea6ff,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false
});
const lightConeGeometry = new THREE.ConeGeometry(1, 1, 48, 1, true);
const lightConeMesh = new THREE.Mesh(lightConeGeometry, lightConeMaterial);
lightConeMesh.visible = false;
scene.add(lightConeMesh);

const traceMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ea6ff,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1
});
const activeTraceMesh = new THREE.Mesh(new THREE.BufferGeometry(), traceMaterial.clone());
activeTraceMesh.visible = false;
scene.add(activeTraceMesh);

const fadingTraceMeshes = [];
const traceFadeDurationMs = 10000;

statusPill.addEventListener('animationend', () => {
  statusPill.classList.remove('pulse');
});

function updateStatusPill(nextStatus) {
  if (nextStatus === currentStatus) return;

  currentStatus = nextStatus;

  if (nextStatus === 'imaging') {
    statusPill.textContent = 'Imaging 🌎';
  } else if (nextStatus === 'charging') {
    statusPill.textContent = 'Charging ☀️';
  } else {
    statusPill.textContent = 'Eclipse 🌑';
  }

  // Apply state class and trigger pulse animation
  statusPill.classList.remove('pulse');
  void statusPill.offsetWidth;
  statusPill.className = nextStatus + ' pulse';
}

function getSubSatelliteCoordinates() {
  if (!earth) return null;

  satellite.getWorldPosition(satelliteWorldPosition);
  satelliteEarthLocalDirection.copy(satelliteWorldPosition);
  earth.worldToLocal(satelliteEarthLocalDirection);
  satelliteEarthLocalDirection.normalize();

  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(satelliteEarthLocalDirection.y, -1, 1)));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(satelliteEarthLocalDirection.z, satelliteEarthLocalDirection.x));

  return { lat, lon };
}

function formatCoordinates(coords) {
  if (!coords) return 'Unknown';
  const latSuffix = coords.lat >= 0 ? 'N' : 'S';
  const lonSuffix = coords.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.lat).toFixed(2)}°${latSuffix}, ${Math.abs(coords.lon).toFixed(2)}°${lonSuffix}`;
}

function vectorToLatLon(vec) {
  const normal = vec.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(normal.z, normal.x))
  };
}

function latLonToSurfaceVector(coords, radius = earthRadius) {
  const latRad = THREE.MathUtils.degToRad(coords.lat);
  const lonRad = THREE.MathUtils.degToRad(coords.lon);
  const cosLat = Math.cos(latRad);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    radius * cosLat * Math.sin(lonRad)
  );
}

function getImagingFootprint(startCoords, endCoords) {
  if (!startCoords || !endCoords) return null;

  const startNormal = latLonToSurfaceVector(startCoords, 1).normalize();
  const endNormal = latLonToSurfaceVector(endCoords, 1).normalize();
  const greatCircleAxis = tempVectorA.copy(startNormal).cross(endNormal);

  if (greatCircleAxis.lengthSq() < 1e-8) {
    return null;
  }

  greatCircleAxis.normalize();

  const startAlongTrack = tempVectorB.copy(greatCircleAxis).cross(startNormal).normalize();
  const endAlongTrack = tempVectorC.copy(greatCircleAxis).cross(endNormal).normalize();

  const startCrossTrack = new THREE.Vector3().copy(startAlongTrack).cross(startNormal).normalize();
  const endCrossTrack = new THREE.Vector3().copy(endAlongTrack).cross(endNormal).normalize();

  const startLeft = startNormal.clone().multiplyScalar(Math.cos(halfSwathAngleRad)).addScaledVector(startCrossTrack, Math.sin(halfSwathAngleRad)).normalize();
  const startRight = startNormal.clone().multiplyScalar(Math.cos(halfSwathAngleRad)).addScaledVector(startCrossTrack, -Math.sin(halfSwathAngleRad)).normalize();
  const endLeft = endNormal.clone().multiplyScalar(Math.cos(halfSwathAngleRad)).addScaledVector(endCrossTrack, Math.sin(halfSwathAngleRad)).normalize();
  const endRight = endNormal.clone().multiplyScalar(Math.cos(halfSwathAngleRad)).addScaledVector(endCrossTrack, -Math.sin(halfSwathAngleRad)).normalize();

  const corners = [startLeft, startRight, endRight, endLeft].map((normal) => normal.multiplyScalar(earthRadius * 1.0015));

  return {
    corners,
    centerStart: vectorToLatLon(startNormal),
    centerEnd: vectorToLatLon(endNormal)
  };
}

function updateTraceMesh(mesh, footprint) {
  if (!footprint) {
    mesh.visible = false;
    return;
  }

  const [a, b, c, d] = footprint.corners;
  const positions = new Float32Array([
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z,
    a.x, a.y, a.z,
    c.x, c.y, c.z,
    d.x, d.y, d.z
  ]);

  const geometry = mesh.geometry;
  geometry.dispose();
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

  const targetWorld = latLonToSurfaceVector(targetCoords, earthRadius);
  const satWorld = satellite.getWorldPosition(new THREE.Vector3());
  const axis = targetWorld.clone().sub(satWorld);
  const height = axis.length();

  if (height <= 1e-6) {
    lightConeMesh.visible = false;
    return;
  }

  const coneRadius = (halfSwathWidthKm / earthMeanRadiusKm) * earthRadius;
  lightConeMesh.scale.set(coneRadius, height, coneRadius);

  const midpoint = satWorld.clone().add(targetWorld).multiplyScalar(0.5);
  lightConeMesh.position.copy(midpoint);

  const up = new THREE.Vector3(0, 1, 0);
  lightConeMesh.quaternion.setFromUnitVectors(up, axis.clone().normalize());
  lightConeMesh.rotateX(Math.PI);

  lightConeMesh.visible = true;
}

function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderSummary(session) {
  if (!session) {
    imagingSummary.textContent = 'No imaging sessions yet.';
    return;
  }

  imagingSummary.innerHTML = [
    `<div>Start CenterPoint: <strong>${formatCoordinates(session.startCoords)}</strong></div>`,
    `<div>End CenterPoint: <strong>${formatCoordinates(session.endCoords)}</strong></div>`,
    `<div>Area: <strong>${session.location || 'Resolving location...'}</strong></div>`
  ].join('');
}

function renderHistory() {
  if (imagingHistory.length === 0) {
    historyList.innerHTML = '<li>No history yet.</li>';
    return;
  }

  historyList.innerHTML = imagingHistory
    .slice()
    .reverse()
    .map((entry) => `
      <li>
        <div><strong>${formatDateTime(entry.startedAt)}</strong> — ${entry.location || 'Resolving location...'}</div>
        <div>Start CenterPoint: ${formatCoordinates(entry.startCoords)}</div>
        <div>End CenterPoint: ${formatCoordinates(entry.endCoords)}</div>
      </li>
    `)
    .join('');
}

async function resolveRoughLocation(coords) {
  if (!coords) return 'Unknown region, Unknown country';

  try {
    const query = new URLSearchParams({
      lat: coords.lat.toFixed(6),
      lon: coords.lon.toFixed(6),
      format: 'jsonv2',
      zoom: '5'
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query.toString()}`, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Location lookup failed with status ${response.status}`);
    }

    const data = await response.json();
    const address = data.address || {};
    const region = address.state || address.region || address.county || address.province || 'Unknown region';
    const country = address.country || 'Unknown country';

    return `${region}, ${country}`;
  } catch (error) {
    console.warn('Could not resolve rough location:', error);
    return 'Open ocean, International Waters';
  }
}

async function resolveImageAreaLocation(footprint) {
  if (!footprint) return 'Unknown imaged region';

  const coordsToCheck = [
    footprint.centerStart,
    footprint.centerEnd,
    ...footprint.corners.map((corner) => vectorToLatLon(corner))
  ];

  const samples = await Promise.all(coordsToCheck.map((coords) => resolveRoughLocation(coords)));
  const uniqueRegions = [...new Set(samples.filter(Boolean))];

  if (uniqueRegions.length === 0) return 'Open ocean, International Waters';
  if (uniqueRegions.length === 1) return uniqueRegions[0];

  return `${uniqueRegions.slice(0, 3).join(' · ')}${uniqueRegions.length > 3 ? ' · +' + (uniqueRegions.length - 3) + ' more' : ''}`;
}

function beginImagingSession() {
  const startCoords = getSubSatelliteCoordinates();
  activeImagingSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    startCoords,
    endCoords: startCoords,
    location: 'Resolving location...',
    footprint: null
  };

  renderSummary(activeImagingSession);
}

function updateImagingSession() {
  if (!activeImagingSession) return;

  activeImagingSession.endCoords = getSubSatelliteCoordinates();
  activeImagingSession.footprint = getImagingFootprint(activeImagingSession.startCoords, activeImagingSession.endCoords);
  updateTraceMesh(activeTraceMesh, activeImagingSession.footprint);
  updateLightCone(activeImagingSession.endCoords);
  renderSummary(activeImagingSession);
}

async function completeImagingSession() {
  if (!activeImagingSession) return;

  activeImagingSession.endedAt = new Date().toISOString();
  activeImagingSession.endCoords = getSubSatelliteCoordinates();
  activeImagingSession.footprint = getImagingFootprint(activeImagingSession.startCoords, activeImagingSession.endCoords);

  const finalizedSession = { ...activeImagingSession };
  activeImagingSession = null;

  if (finalizedSession.footprint) {
    const fadedMesh = new THREE.Mesh(activeTraceMesh.geometry.clone(), traceMaterial.clone());
    fadedMesh.material.opacity = 0.3;
    scene.add(fadedMesh);
    fadingTraceMeshes.push({ mesh: fadedMesh, startedAtMs: performance.now() });
  }

  activeTraceMesh.visible = false;
  lightConeMesh.visible = false;

  lastSession = finalizedSession;
  imagingHistory.push(finalizedSession);

  renderSummary(lastSession);
  renderHistory();

  const resolvedLocation = await resolveImageAreaLocation(finalizedSession.footprint);
  finalizedSession.location = resolvedLocation;

  if (lastSession && lastSession.id === finalizedSession.id) {
    renderSummary(finalizedSession);
  }

  renderHistory();
}

function updateSatelliteStatus() {
  satellite.getWorldPosition(satelliteWorldPosition);
  sunDirection.copy(sunLight.position).normalize();

  isSunFacing = satelliteWorldPosition.dot(sunDirection) > 0;

  if (isImaging && isSunFacing) {
    updateStatusPill('imaging');
    return;
  }

  updateStatusPill(isSunFacing ? 'charging' : 'eclipse');
}

function updateFadingTraces() {
  const now = performance.now();

  for (let i = fadingTraceMeshes.length - 1; i >= 0; i--) {
    const trace = fadingTraceMeshes[i];
    const elapsed = now - trace.startedAtMs;
    const t = THREE.MathUtils.clamp(elapsed / traceFadeDurationMs, 0, 1);
    trace.mesh.material.opacity = 0.3 * (1 - t);

    if (t >= 1) {
      scene.remove(trace.mesh);
      trace.mesh.geometry.dispose();
      trace.mesh.material.dispose();
      fadingTraceMeshes.splice(i, 1);
    }
  }
}

function setImagingState(nextImagingState) {
  if (isImaging === nextImagingState) return;
  isImaging = nextImagingState;

  if (isImaging) {
    beginImagingSession();
    updateLightCone(activeImagingSession?.endCoords || null);
  } else {
    completeImagingSession();
  }

  updateSatelliteStatus();
}

function startLongPress(pointerId) {
  clearLongPress();

  longPressTimerId = window.setTimeout(() => {
    if (activePointerId !== pointerId) return;

    if (isSunFacing) {
      setImagingState(true);
    }
  }, longPressDurationMs);
}

function clearLongPress() {
  if (longPressTimerId !== null) {
    window.clearTimeout(longPressTimerId);
    longPressTimerId = null;
  }
}

function clearPointerTracking() {
  activePointerId = null;
  pressStartPosition = null;
}

function onHoldStart(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  activePointerId = event.pointerId;
  pressStartPosition = { x: event.clientX, y: event.clientY };
  startLongPress(event.pointerId);
}

function onHoldEnd(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (event.pointerId !== activePointerId) return;

  clearLongPress();
  clearPointerTracking();

  setImagingState(false);
}

function onHoldMove(event) {
  if (event.pointerId !== activePointerId || !pressStartPosition) return;

  const deltaX = event.clientX - pressStartPosition.x;
  const deltaY = event.clientY - pressStartPosition.y;
  if ((deltaX * deltaX) + (deltaY * deltaY) > longPressMoveTolerance * longPressMoveTolerance) {
    clearLongPress();
  }
}

renderer.domElement.addEventListener('pointerdown', onHoldStart);
window.addEventListener('pointermove', onHoldMove);
window.addEventListener('pointerup', onHoldEnd);
window.addEventListener('pointercancel', onHoldEnd);
window.addEventListener('blur', () => {
  clearLongPress();
  clearPointerTracking();
  setImagingState(false);
});

historyToggle.addEventListener('click', () => {
  historyPanel.classList.toggle('open');
});

renderSummary(null);
renderHistory();

// Animation
const clock = new THREE.Clock();
const orbitPeriod = 20;
const earthRotationPeriod = 110;

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  satelliteOrbit.rotation.y = (elapsed / orbitPeriod) * Math.PI * 2;
  if (earth) {
    earth.rotation.y = (elapsed / earthRotationPeriod) * Math.PI * 2;
  }

  updateSatelliteStatus();
  updateImagingSession();
  updateFadingTraces();
  controls.update();
  renderer.render(scene, camera);
}

setupEarth().catch((err) => {
  console.error('Failed to load Earth textures:', err);
});

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
