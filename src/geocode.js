import { vectorToLatLon } from './utils.js';

const USER_AGENT = 'FireFlight-OrbitDemo/1.0 (https://github.com/ishanspatil/FireFlight)';
const TIMEOUT_MS = 5000;

export async function resolveRoughLocation(coords) {
  if (!coords) return 'Unknown region, Unknown country';

  try {
    const query = new URLSearchParams({
      lat: coords.lat.toFixed(6),
      lon: coords.lon.toFixed(6),
      format: 'jsonv2',
      zoom: '5',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Location lookup failed with status ${response.status}`);
    }

    const data = await response.json();
    const address = data.address || {};
    const region =
      address.state || address.region || address.county || address.province || 'Unknown region';
    const country = address.country || 'Unknown country';
    return `${region}, ${country}`;
  } catch (error) {
    console.warn('Could not resolve rough location:', error);
    return 'Open ocean, International Waters';
  }
}

export async function resolveImageAreaLocation(footprint) {
  if (!footprint) return 'Unknown imaged region';

  const coordsToCheck = [
    footprint.centerStart,
    footprint.centerEnd,
    ...footprint.corners.map((corner) => vectorToLatLon(corner)),
  ];

  const samples = await Promise.all(coordsToCheck.map((c) => resolveRoughLocation(c)));
  const uniqueRegions = [...new Set(samples.filter(Boolean))];

  if (uniqueRegions.length === 0) return 'Open ocean, International Waters';
  if (uniqueRegions.length === 1) return uniqueRegions[0];

  const shown = uniqueRegions.slice(0, 3).join(' · ');
  const extra = uniqueRegions.length > 3 ? ` · +${uniqueRegions.length - 3} more` : '';
  return shown + extra;
}
