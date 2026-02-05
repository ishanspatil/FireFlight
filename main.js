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
renderer.toneMappingExposure = 1.1;
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
controls.update();

// Lighting
const ambientLight = new THREE.AmbientLight(0x8ea0c8, 0.3);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(6, 4, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8ab0ff, 0.35);
fillLight.position.set(-5, -1, -4);
scene.add(fillLight);

function normalizeLonDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function continentField(lon, lat) {
  const blobs = [
    { lon: -105, lat: 46, sx: 38, sy: 24, w: 1.2 }, // North America
    { lon: -62, lat: -16, sx: 20, sy: 32, w: 1.1 }, // South America
    { lon: 15, lat: 8, sx: 30, sy: 34, w: 1.25 }, // Africa
    { lon: 65, lat: 47, sx: 68, sy: 26, w: 1.35 }, // Eurasia
    { lon: 135, lat: -24, sx: 16, sy: 12, w: 0.95 }, // Australia
    { lon: -41, lat: 72, sx: 13, sy: 9, w: 0.45 }, // Greenland
    { lon: 48, lat: -20, sx: 6, sy: 9, w: 0.4 }, // Madagascar
    { lon: 170, lat: -42, sx: 8, sy: 6, w: 0.3 } // New Zealand
  ];

  let v = 0;
  for (const blob of blobs) {
    const dx = normalizeLonDiff(lon, blob.lon) / blob.sx;
    const dy = (lat - blob.lat) / blob.sy;
    v += blob.w * Math.exp(-(dx * dx + dy * dy));
  }

  // Antarctic continent band
  if (lat < -62) {
    v += THREE.MathUtils.smoothstep(-58, -80, lat) * 1.4;
  }

  // Carve oceans and shape coastlines for realism
  const oceanCut =
    0.32 * Math.sin(THREE.MathUtils.degToRad(lon * 2.2 + lat * 0.9)) +
    0.2 * Math.cos(THREE.MathUtils.degToRad(lon * 1.1 - lat * 3.1)) +
    0.13 * Math.sin(THREE.MathUtils.degToRad((lon - 40) * 4.3 + lat * 2.0));

  return v + oceanCut;
}

function buildEarthTextures(size = 2048) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size / 2;
  const colorCtx = colorCanvas.getContext('2d');
  const colorImage = colorCtx.createImageData(colorCanvas.width, colorCanvas.height);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size / 2;
  const bumpCtx = bumpCanvas.getContext('2d');
  const bumpImage = bumpCtx.createImageData(bumpCanvas.width, bumpCanvas.height);

  const specCanvas = document.createElement('canvas');
  specCanvas.width = size;
  specCanvas.height = size / 2;
  const specCtx = specCanvas.getContext('2d');
  const specImage = specCtx.createImageData(specCanvas.width, specCanvas.height);

  for (let y = 0; y < colorCanvas.height; y++) {
    const v = y / (colorCanvas.height - 1);
    const lat = (0.5 - v) * 180;
    const absLat = Math.abs(lat);

    for (let x = 0; x < colorCanvas.width; x++) {
      const u = x / (colorCanvas.width - 1);
      const lon = u * 360 - 180;
      const idx = (y * colorCanvas.width + x) * 4;

      const cField = continentField(lon, lat);
      const landMask = THREE.MathUtils.smoothstep(0.48, 0.6, cField);
      const coastMask = THREE.MathUtils.smoothstep(0.45, 0.52, cField) - THREE.MathUtils.smoothstep(0.52, 0.59, cField);

      const largeNoise =
        Math.sin(THREE.MathUtils.degToRad(lon * 4 + lat * 3.2)) * 0.35 +
        Math.cos(THREE.MathUtils.degToRad(lon * 1.5 - lat * 6.6)) * 0.25;
      const fineNoise =
        Math.sin(THREE.MathUtils.degToRad(lon * 19.0 + lat * 17.3)) * 0.12 +
        Math.cos(THREE.MathUtils.degToRad(lon * 25.4 - lat * 22.9)) * 0.09;

      // Ocean colors, darker in deep equatorial waters and richer cyan near coasts
      const depthTone = 0.38 + 0.32 * Math.cos(THREE.MathUtils.degToRad(lat * 1.35));
      const oceanR = 10 + depthTone * 14;
      const oceanG = 46 + depthTone * 54;
      const oceanB = 92 + depthTone * 100;

      // Land colors tuned to look like satellite imagery
      const arid = THREE.MathUtils.smoothstep(12, 34, absLat) * (0.6 + 0.4 * Math.max(0, largeNoise));
      const vegetation = (1 - arid) * (0.6 + 0.4 * Math.max(0, -largeNoise));

      let landR = 70 + vegetation * 24 + arid * 48 + fineNoise * 22;
      let landG = 86 + vegetation * 70 + arid * 32 + fineNoise * 18;
      let landB = 50 + vegetation * 18 + arid * 8 + fineNoise * 10;

      // Mountain tints
      const mountain = Math.max(0, fineNoise + largeNoise * 0.7);
      landR += mountain * 38;
      landG += mountain * 30;
      landB += mountain * 20;

      // Polar ice and snow caps
      const polarMask = THREE.MathUtils.smoothstep(58, 84, absLat);
      const iceTexture = 0.85 + Math.max(0, fineNoise) * 0.2;
      const iceR = 220 * iceTexture;
      const iceG = 232 * iceTexture;
      const iceB = 244 * iceTexture;

      // Blend land/ocean and apply coast brightness
      let r = oceanR * (1 - landMask) + landR * landMask;
      let g = oceanG * (1 - landMask) + landG * landMask;
      let b = oceanB * (1 - landMask) + landB * landMask;

      const coastBoost = coastMask * 18;
      r += coastBoost;
      g += coastBoost;
      b += coastBoost * 0.7;

      // Ice overlays on poles and Greenland/Antarctica
      const iceOnLand = polarMask * (0.4 + 0.6 * landMask);
      r = r * (1 - iceOnLand) + iceR * iceOnLand;
      g = g * (1 - iceOnLand) + iceG * iceOnLand;
      b = b * (1 - iceOnLand) + iceB * iceOnLand;

      colorImage.data[idx] = THREE.MathUtils.clamp(r, 0, 255);
      colorImage.data[idx + 1] = THREE.MathUtils.clamp(g, 0, 255);
      colorImage.data[idx + 2] = THREE.MathUtils.clamp(b, 0, 255);
      colorImage.data[idx + 3] = 255;

      const bumpOcean = 78 + Math.max(0, largeNoise) * 18;
      const bumpLand = 130 + mountain * 86 + fineNoise * 20;
      const bumpPolar = 168 + polarMask * 42;
      const bump = bumpOcean * (1 - landMask) + bumpLand * landMask;
      const bumpMix = bump * (1 - polarMask * 0.35) + bumpPolar * (polarMask * 0.35);
      bumpImage.data[idx] = bumpImage.data[idx + 1] = bumpImage.data[idx + 2] = THREE.MathUtils.clamp(bumpMix, 0, 255);
      bumpImage.data[idx + 3] = 255;

      const specular = 210 * (1 - landMask) + 28 * landMask;
      specImage.data[idx] = specImage.data[idx + 1] = specImage.data[idx + 2] = THREE.MathUtils.clamp(specular, 0, 255);
      specImage.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);
  specCtx.putImageData(specImage, 0, 0);

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  const roughnessTexture = new THREE.CanvasTexture(specCanvas);

  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  for (const texture of [colorTexture, bumpTexture, roughnessTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }

  return { colorTexture, bumpTexture, roughnessTexture };
}

function buildContinentalOutlines() {
  const outlineCanvas = document.createElement('canvas');
  outlineCanvas.width = 2048;
  outlineCanvas.height = 1024;
  const ctx = outlineCanvas.getContext('2d');
  const image = ctx.createImageData(outlineCanvas.width, outlineCanvas.height);

  for (let y = 0; y < outlineCanvas.height; y++) {
    const v = y / (outlineCanvas.height - 1);
    const lat = (0.5 - v) * 180;

    for (let x = 0; x < outlineCanvas.width; x++) {
      const u = x / (outlineCanvas.width - 1);
      const lon = u * 360 - 180;
      const idx = (y * outlineCanvas.width + x) * 4;

      const center = continentField(lon, lat);
      const right = continentField(lon + 0.22, lat);
      const left = continentField(lon - 0.22, lat);
      const up = continentField(lon, lat + 0.22);
      const down = continentField(lon, lat - 0.22);

      const grad = Math.abs(right - left) + Math.abs(up - down);
      const edge = THREE.MathUtils.smoothstep(0.028, 0.065, grad) * (1 - THREE.MathUtils.smoothstep(0.33, 0.55, Math.abs(center - 0.54)));

      if (edge > 0.22) {
        image.data[idx] = 240;
        image.data[idx + 1] = 248;
        image.data[idx + 2] = 255;
        image.data[idx + 3] = THREE.MathUtils.clamp(edge * 255, 0, 255);
      }
    }
  }

  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(outlineCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Earth (higher quality and shaded)
const earthRadius = 1;
const { colorTexture, bumpTexture, roughnessTexture } = buildEarthTextures();

const earthGeometry = new THREE.SphereGeometry(earthRadius, 96, 96);
const earthMaterial = new THREE.MeshStandardMaterial({
  map: colorTexture,
  bumpMap: bumpTexture,
  bumpScale: 0.03,
  metalness: 0.03,
  roughnessMap: roughnessTexture,
  roughness: 0.85
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Slightly elevated continental outline overlay
const outlineGeometry = new THREE.SphereGeometry(earthRadius + 0.008, 96, 96);
const outlineMaterial = new THREE.MeshBasicMaterial({
  map: buildContinentalOutlines(),
  transparent: true,
  opacity: 0.65,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const outlines = new THREE.Mesh(outlineGeometry, outlineMaterial);
scene.add(outlines);

// Satellite
const satelliteSize = 0.08;
const satelliteGeometry = new THREE.BoxGeometry(satelliteSize, satelliteSize, satelliteSize);
const satelliteMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde5, flatShading: true });
const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);

// Orbit groups to handle rotation and tilt
const orbitRadius = earthRadius + 0.2; // Low Earth Orbit altitude
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

// Animation parameters
const clock = new THREE.Clock();
const orbitPeriod = 10;
const earthRotationPeriod = 50;

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  satelliteOrbit.rotation.y = (elapsed / orbitPeriod) * Math.PI * 2;
  earth.rotation.y = (elapsed / earthRotationPeriod) * Math.PI * 2;
  outlines.rotation.y = earth.rotation.y;

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
