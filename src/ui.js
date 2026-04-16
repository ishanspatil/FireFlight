import { formatCoordinates, formatDateTime } from './utils.js';

const loadingOverlay = document.getElementById('loading-overlay');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
export const statusPill = document.getElementById('status-pill');
export const imagingSummary = document.getElementById('imaging-summary');
export const historyToggle = document.getElementById('history-toggle');
export const historyPanel = document.getElementById('history-panel');
export const historyList = document.getElementById('history-list');

export function showError(title, message) {
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  if (errorTitle) errorTitle.textContent = title;
  if (errorMessage) errorMessage.textContent = message;
  if (errorOverlay) errorOverlay.classList.add('visible');
}

export function hideLoadingOverlay() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add('hidden');
  loadingOverlay.addEventListener('transitionend', () => loadingOverlay.remove(), { once: true });
}

let currentStatus = 'charging';

export function updateStatusPill(nextStatus) {
  if (nextStatus === currentStatus) return;
  currentStatus = nextStatus;

  const labels = { imaging: 'Imaging 🌎', charging: 'Charging ☀️', eclipse: 'Eclipse 🌑' };
  statusPill.textContent = labels[nextStatus] ?? labels.charging;

  statusPill.classList.remove('pulse');
  void statusPill.offsetWidth;
  statusPill.className = `${nextStatus} pulse`;
}

function createLabeledRow(label, value) {
  const div = document.createElement('div');
  div.append(`${label}: `);
  const strong = document.createElement('strong');
  strong.textContent = value;
  div.appendChild(strong);
  return div;
}

export function renderSummary(session) {
  if (!session) {
    imagingSummary.textContent = 'No imaging sessions yet.';
    return;
  }
  imagingSummary.textContent = '';
  imagingSummary.appendChild(createLabeledRow('Start CenterPoint', formatCoordinates(session.startCoords)));
  imagingSummary.appendChild(createLabeledRow('End CenterPoint', formatCoordinates(session.endCoords)));
  imagingSummary.appendChild(createLabeledRow('Area', session.location || 'Resolving location...'));
}

export function renderHistory(imagingHistory) {
  historyList.textContent = '';

  if (imagingHistory.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No history yet.';
    historyList.appendChild(li);
    return;
  }

  for (const entry of [...imagingHistory].reverse()) {
    const li = document.createElement('li');

    const header = document.createElement('div');
    const timeStrong = document.createElement('strong');
    timeStrong.textContent = formatDateTime(entry.startedAt);
    header.appendChild(timeStrong);
    header.append(` — ${entry.location || 'Resolving location...'}`);
    li.appendChild(header);

    const startDiv = document.createElement('div');
    startDiv.textContent = `Start CenterPoint: ${formatCoordinates(entry.startCoords)}`;
    li.appendChild(startDiv);

    const endDiv = document.createElement('div');
    endDiv.textContent = `End CenterPoint: ${formatCoordinates(entry.endCoords)}`;
    li.appendChild(endDiv);

    historyList.appendChild(li);
  }
}
