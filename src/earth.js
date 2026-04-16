import * as THREE from 'three';
import { scene, renderer } from './scene.js';
import { EARTH_RADIUS } from './constants.js';

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

export async function setupEarth() {
  const [diffuse, bump, roughness] = await Promise.all([
    loadTexture('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', {
      color: true,
    }),
    loadTexture('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'),
    loadTexture('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'),
  ]);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 128, 128),
    new THREE.MeshStandardMaterial({
      map: diffuse,
      bumpMap: bump,
      bumpScale: 0.03,
      roughnessMap: roughness,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  scene.add(earth);

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
    transparent: true,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 64, 64), atmosphereMat));

  return earth;
}
