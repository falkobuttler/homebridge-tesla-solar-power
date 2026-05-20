# homebridge-tesla-solar-power

A [Homebridge](https://homebridge.io) plugin that exposes your Tesla solar production, Powerwall state, and grid import/export to Apple Home.

Three accessories are added:

- **Solar** — current production in watts.
- **Grid** — current import (positive) or export (negative) in watts.
- **Powerwall** — current charge/discharge flow in watts, plus battery percentage and charging state.

In the **Apple Home** app, each accessory appears as a Temperature Sensor tile where the displayed value (in `°`) is actually **kilowatts**. We use Temperature Sensor because Apple Home renders Light Sensors as a status line buried inside a room — they never appear as a tile on the Home view. In the **Eve** app, the same accessories also surface a live `Current Consumption` (W) characteristic with the proper sign, so you can tell import from export at a glance.

## Requirements

- Homebridge **v2.0+**
- Node.js **22 or 24**
- A Tesla account with at least one energy site (solar / Powerwall / Solar Roof)

## Installation

```sh
npm install -g homebridge-tesla-solar-power
```

Or install via the Homebridge UI by searching for "Tesla Solar".

## Configuration

The plugin uses Tesla's unofficial Owner API. You only need a refresh token — no app registration, no domain.

### 1. Get a refresh token

The simplest way is [tesla_auth](https://github.com/adriankumpf/tesla_auth). It runs locally, opens Tesla's official sign-in page in a webview, and prints a refresh token when you finish logging in. Copy the `refresh_token` value.

> Treat the refresh token like a password — it can access your Tesla account.

### 2. Add the platform to your Homebridge config

```json
{
  "platforms": [
    {
      "platform": "TeslaSolarPower",
      "name": "Tesla Solar & Powerwall",
      "refreshToken": "PASTE_YOUR_REFRESH_TOKEN_HERE",
      "pollIntervalSeconds": 300
    }
  ]
}
```

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `refreshToken` | yes | — | Tesla OAuth refresh token. |
| `siteId` | no | auto-detect | Energy site ID. Leave blank if you have a single site on your account. |
| `pollIntervalSeconds` | no | `300` | How often to poll the API. Minimum 60s. |

The plugin rotates the refresh token automatically and persists it to `tesla-solar-power-token.json` inside your Homebridge storage path. Once running, the value in `config.json` becomes a starting point and is replaced on each rotation.

## How readings are mapped

| Source field | Apple Home | Eve |
| --- | --- | --- |
| `solar_power` | Temperature Sensor tile, value = kW (≥ 0, shown as `°`) | Current Consumption = signed watts |
| `grid_power` | Temperature Sensor tile, signed kW (`+` import / `-` export) | Current Consumption = signed watts |
| `battery_power` | Temperature Sensor tile, signed kW (`+` discharging / `-` charging) | Current Consumption = signed watts |
| `percentage_charged` | Battery service on Powerwall: level + low-battery flag | Same |
| `battery_power < -50W` | Battery service on Powerwall: ChargingState = CHARGING | Same |

The unit symbol in Apple Home reads as `°` because the only HomeKit service Apple Home renders as a tile with a numeric value is Temperature Sensor. The number itself is **kilowatts**, not degrees. If you don't like the deception, the Eve app reads the same accessory as a proper power meter (in watts).

If readings appear inverted in your Home app, flip the sign in `src/teslaOwnerApi.ts` (look for the `// Sign convention assumed` comment) and rebuild.

## Caveats

- The Owner API is **not officially supported** by Tesla. It can change or be restricted at any time. Most community Tesla integrations rely on the same API.
- The plugin reports kW via the HomeKit Temperature characteristic so values are visible on the Home view as tiles. The displayed unit (`°`) is therefore misleading — see the mapping table.
- The plugin polls at most once per minute. The default of 5 minutes is well within Tesla's apparent shared rate limit and matches the cadence of the official Tesla mobile app.

## Development

```sh
npm install
npm run build
```

The plugin is ESM-only (Homebridge 2.x requirement). Make sure relative imports include the `.js` extension.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
