import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020615);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const statusPill = document.getElementById('status-pill');

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
const sunDirection = new THREE.Vector3();
let currentStatus = '';
let isImaging = false;
let isSunFacing = false;
const longPressDurationMs = 500;
const longPressMoveTolerance = 8;
let longPressTimerId = null;
let activePointerId = null;
let pressStartPosition = null;

function updateStatusPill(nextStatus) {
  if (nextStatus === currentStatus) return;

  currentStatus = nextStatus;

  if (nextStatus === 'imaging') {
    statusPill.textContent = 'Imaging 🌎';
    statusPill.className = 'imaging';
  } else if (nextStatus === 'charging') {
    statusPill.textContent = 'Charging ☀️';
    statusPill.className = 'charging';
  } else {
    statusPill.textContent = 'Eclipse 🌑';
    statusPill.className = 'eclipse';
  }
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

// Animation
const clock = new THREE.Clock();
const orbitPeriod = 10;
const earthRotationPeriod = 55;

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  satelliteOrbit.rotation.y = (elapsed / orbitPeriod) * Math.PI * 2;
  if (earth) {
    earth.rotation.y = (elapsed / earthRotationPeriod) * Math.PI * 2;
  }

  updateSatelliteStatus();
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
