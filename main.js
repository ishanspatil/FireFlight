import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// Earth (low poly)
const earthRadius = 1;
const earthGeometry = new THREE.SphereGeometry(earthRadius, 16, 16);
const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x2266dd, flatShading: true });
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Satellite
const satelliteSize = 0.1;
const satelliteGeometry = new THREE.BoxGeometry(satelliteSize, satelliteSize, satelliteSize);
const satelliteMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);

// Orbit groups to handle rotation and tilt
const orbitRadius = earthRadius + 0.2; // Low Earth Orbit altitude
const orbitGroup = new THREE.Group(); // handles orbit plane orientation
const satelliteOrbit = new THREE.Group(); // handles satellite revolution

// Create a translucent line showing the orbit path
const orbitPathPoints = [];
const segments = 128;
for (let i = 0; i < segments; i++) {
  const angle = (i / segments) * Math.PI * 2;
  orbitPathPoints.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
}
const orbitPathGeometry = new THREE.BufferGeometry().setFromPoints(orbitPathPoints);
const orbitPathMaterial = new THREE.LineBasicMaterial({ color: 0xffaaaa, transparent: true, opacity: 0.4 });
const orbitPath = new THREE.LineLoop(orbitPathGeometry, orbitPathMaterial);
orbitGroup.add(orbitPath);

// Position satellite and add to revolution group
satellite.position.set(orbitRadius, 0, 0);
satelliteOrbit.add(satellite);
orbitGroup.add(satelliteOrbit);

// Tilt orbit to approximate sun-synchronous polar orbit (~98 degrees)
orbitGroup.rotation.x = THREE.MathUtils.degToRad(98);
scene.add(orbitGroup);

// Camera position
camera.position.z = 8;

// Animation parameters
const clock = new THREE.Clock();
const orbitPeriod = 10; // seconds per revolution
const earthRotationPeriod = 60; // slower spin

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Satellite orbit
  satelliteOrbit.rotation.y = (elapsed / orbitPeriod) * Math.PI * 2;

  // Earth rotation
  earth.rotation.y = (elapsed / earthRotationPeriod) * Math.PI * 2;

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Handle resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
