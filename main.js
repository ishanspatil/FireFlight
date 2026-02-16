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

function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderSummary(session) {
  if (!session) {
    imagingSummary.textContent = 'No imaging sessions yet.';
    return;
  }

  imagingSummary.innerHTML = [
    `<div>Start: <strong>${formatCoordinates(session.startCoords)}</strong></div>`,
    `<div>End: <strong>${formatCoordinates(session.endCoords)}</strong></div>`,
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
        <div>Start: ${formatCoordinates(entry.startCoords)}</div>
        <div>End: ${formatCoordinates(entry.endCoords)}</div>
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

function beginImagingSession() {
  const startCoords = getSubSatelliteCoordinates();
  activeImagingSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    startCoords,
    endCoords: startCoords,
    location: 'Resolving location...'
  };

  renderSummary(activeImagingSession);
}

function updateImagingSession() {
  if (!activeImagingSession) return;

  activeImagingSession.endCoords = getSubSatelliteCoordinates();
  renderSummary(activeImagingSession);
}

async function completeImagingSession() {
  if (!activeImagingSession) return;

  activeImagingSession.endedAt = new Date().toISOString();
  activeImagingSession.endCoords = getSubSatelliteCoordinates();

  const finalizedSession = { ...activeImagingSession };
  activeImagingSession = null;

  lastSession = finalizedSession;
  imagingHistory.push(finalizedSession);

  renderSummary(lastSession);
  renderHistory();

  const resolvedLocation = await resolveRoughLocation(finalizedSession.endCoords);
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

function setImagingState(nextImagingState) {
  if (isImaging === nextImagingState) return;
  isImaging = nextImagingState;

  if (isImaging) {
    beginImagingSession();
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
