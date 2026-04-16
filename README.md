# FireFlight

An interactive 3D Earth-imaging minigame. Pilot a satellite in a sun-synchronous orbit, trigger imaging sessions while in sunlight, and watch your footprint get tagged with real-world location data.

Built with [Three.js](https://threejs.org/) — no build step required.

---

## Features

- **3D Earth** rendered with real satellite textures (albedo, normal, specular maps)
- **Atmospheric glow** shader layer
- **Sun-synchronous orbit** at 98° inclination — satellite charges in sunlight, eclipses in shadow
- **Hold-to-image** interaction: long-press (or hold Space) when the satellite is sunlit to start an imaging session
- **Swath footprint** visualisation with a light-cone and fading trace on the globe
- **Location tagging** via OpenStreetMap Nominatim reverse geocoding
- **Session history** panel with per-session telemetry
- Responsive layout — works on desktop and mobile

---

## Getting Started

### Option A — open directly in a browser

```bash
# Clone the repo
git clone https://github.com/ishanspatil/FireFlight.git
cd FireFlight

# Open in your default browser (macOS)
open index.html

# Or serve it locally to avoid CORS issues with module imports
npx serve .
```

> **Note:** Because `main.js` uses ES modules, some browsers block local `file://` imports. Serving via `npx serve .` (or any static server) avoids this.

### Option B — npm scripts

```bash
npm install          # install dev tools (ESLint, Prettier)
npm run lint         # run ESLint
npm run format       # auto-format with Prettier
npm run format:check # CI-style format check
```

---

## Controls

| Action | Input |
|--------|-------|
| Rotate view | Left-click drag / single-finger drag |
| Zoom | Scroll wheel / two-finger pinch |
| Start imaging | Long-press (300 ms) on canvas **or** hold `Space` |
| Stop imaging | Release press / release `Space` |
| Toggle history | Click the clock icon in the telemetry panel |

Imaging only activates when the satellite is in sunlight (status pill shows **Charging**).

---

## Project Structure

```
FireFlight/
├── index.html          # App shell, CSS, importmap
├── main.js             # All application logic
├── eslint.config.js    # ESLint flat config
├── .prettierrc         # Prettier config
├── .editorconfig       # Editor normalisation
├── package.json
├── LICENSE
└── .github/
    └── workflows/
        └── ci.yml      # Lint + format-check on push/PR
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D rendering | [Three.js](https://threejs.org/) 0.184 |
| Camera controls | OrbitControls (Three.js addon) |
| Geocoding | [OpenStreetMap Nominatim](https://nominatim.org/) |
| Module loading | Native ES module importmap (no bundler) |
| Linting | ESLint 9 (flat config) |
| Formatting | Prettier 3 |
| CI | GitHub Actions |

---

## Contributing

1. Fork the repo and create a branch: `git checkout -b feature/my-change`
2. Make your changes; run `npm run lint` and `npm run format:check` before pushing
3. Open a pull request against `main`

---

## License

[MIT](LICENSE)
