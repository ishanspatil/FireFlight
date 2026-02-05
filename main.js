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

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

// Lighting
scene.add(new THREE.AmbientLight(0x8ea0c8, 0.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
keyLight.position.set(7, 4, 7);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8ab0ff, 0.35);
fillLight.position.set(-5, -2, -3);
scene.add(fillLight);

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

function buildOutlineTextureFromDiffuse(diffuseTexture) {
  const source = diffuseTexture.image;
  const w = source.width;
  const h = source.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(source, 0, 0, w, h);
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  const outImage = outCtx.createImageData(w, h);

  const landMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];

      // Ocean tends to be blue dominant in satellite Earth maps.
      const isOcean = b > g + 8 && b > r + 18;
      landMask[y * w + x] = isOcean ? 0 : 1;
    }
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const here = landMask[idx];
      if (!here) continue;

      const edge =
        landMask[idx - 1] === 0 ||
        landMask[idx + 1] === 0 ||
        landMask[idx - w] === 0 ||
        landMask[idx + w] === 0;

      if (edge) {
        const o = idx * 4;
        outImage.data[o] = 236;
        outImage.data[o + 1] = 244;
        outImage.data[o + 2] = 255;
        outImage.data[o + 3] = 200;
      }
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  const texture = new THREE.CanvasTexture(outCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const earthRadius = 1;
let earth;
let outlines;

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

  const outlineTexture = buildOutlineTextureFromDiffuse(diffuse);
  const outlineGeometry = new THREE.SphereGeometry(earthRadius + 0.0075, 128, 128);
  const outlineMaterial = new THREE.MeshBasicMaterial({
    map: outlineTexture,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  outlines = new THREE.Mesh(outlineGeometry, outlineMaterial);
  scene.add(outlines);
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
    if (outlines) outlines.rotation.y = earth.rotation.y;
  }

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
