import * as THREE from 'three';
import { scene, camera, renderer, controls } from './src/scene.js';
import { setupEarth } from './src/earth.js';
import { satelliteOrbit } from './src/satellite.js';
import {
  setEarth,
  setImagingState,
  updateSatelliteStatus,
  tickImaging,
  tickFadingTraces,
  isSunFacing,
  imagingHistory,
} from './src/imaging.js';
import {
  renderSummary,
  renderHistory,
  hideLoadingOverlay,
  showError,
  historyToggle,
  historyPanel,
  statusPill,
} from './src/ui.js';
import {
  ORBIT_PERIOD_S,
  EARTH_ROTATION_PERIOD_S,
  LONG_PRESS_DURATION_MS,
  LONG_PRESS_MOVE_TOLERANCE,
} from './src/constants.js';

if (!window.WebGLRenderingContext) {
  showError(
    'WebGL not supported',
    'Your browser or device does not support WebGL, which is required to run FireFlight.'
  );
  throw new Error('WebGL not supported');
}

// Status pill pulse cleanup
statusPill.addEventListener('animationend', () => statusPill.classList.remove('pulse'));

// Long-press / pointer tracking state
let longPressTimerId = null;
let activePointerId = null;
let pressStartPosition = null;

function startLongPress(pointerId) {
  clearLongPress();
  longPressTimerId = window.setTimeout(() => {
    if (activePointerId !== pointerId) return;
    if (isSunFacing) setImagingState(true);
  }, LONG_PRESS_DURATION_MS);
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
  const dx = event.clientX - pressStartPosition.x;
  const dy = event.clientY - pressStartPosition.y;
  if (dx * dx + dy * dy > LONG_PRESS_MOVE_TOLERANCE * LONG_PRESS_MOVE_TOLERANCE) {
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

// Keyboard: hold Space to image when satellite is sunlit
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !event.repeat && isSunFacing) {
    event.preventDefault();
    setImagingState(true);
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') setImagingState(false);
});

historyToggle.addEventListener('click', () => {
  const isOpen = historyPanel.classList.toggle('open');
  historyToggle.setAttribute('aria-expanded', String(isOpen));
  historyPanel.setAttribute('aria-hidden', String(!isOpen));
});

// Initial UI state
renderSummary(null);
renderHistory(imagingHistory);

// Animation loop
const clock = new THREE.Clock();
let earth = null;

renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime();
  satelliteOrbit.rotation.y = (elapsed / ORBIT_PERIOD_S) * Math.PI * 2;
  if (earth) earth.rotation.y = (elapsed / EARTH_ROTATION_PERIOD_S) * Math.PI * 2;
  updateSatelliteStatus();
  tickImaging();
  tickFadingTraces();
  controls.update();
  renderer.render(scene, camera);
});

setupEarth()
  .then((earthMesh) => {
    earth = earthMesh;
    setEarth(earthMesh);
    hideLoadingOverlay();
  })
  .catch((err) => {
    console.error('Failed to load Earth textures:', err);
    showError(
      'Failed to load Earth',
      'Could not fetch Earth textures. Check your connection and reload.'
    );
  });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => {
  renderer.setAnimationLoop(null);
  renderer.dispose();
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
});
