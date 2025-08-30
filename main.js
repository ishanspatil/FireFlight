import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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

// Orbit group to handle rotation
const orbitRadius = 3;
const orbitGroup = new THREE.Group();
satellite.position.set(orbitRadius, 0, 0);
orbitGroup.add(satellite);

// Tilt orbit to approximate sun-synchronous polar orbit (~98 degrees)
orbitGroup.rotation.z = THREE.MathUtils.degToRad(98);
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
  orbitGroup.rotation.y = (elapsed / orbitPeriod) * Math.PI * 2;

  // Earth rotation
  earth.rotation.y = (elapsed / earthRotationPeriod) * Math.PI * 2;

  renderer.render(scene, camera);
}

animate();

// Handle resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
