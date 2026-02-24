# ShockHub ⚡

ShockHub is a sleek desktop shock-control hub built for speed, style, and chaos-on-command.

![ShockHub Installer Loading](assets/installer-loading.gif)

## Vibe Check

- **One dashboard, full control** — OpenShock + PiShock in one place
- **Snappy manual actions** — Shock, Vibrate, Sound, Stop, presets, shortcuts
- **Game-aware integrations** — VRChat, Arena Breakout Infinite, League live hooks
- **Clean dark UI** — minimal clutter, fast workflows, readable debug tooling

## Features

### Control System

- Combined controls with per-shocker targeting
- Intensity + duration sliders
- Quick presets (`Light`, `Medium`, `Heavy`)
- Instant emergency stop

### Provider Support

- **OpenShock**: token-based API access
- **PiShock**: username + API key + script name + share codes
- Provider-specific shocker discovery and routing

### Integrations

- **VRChat** via OSCQuery/OSC parameter mapping
- **Arena Breakout Infinite** vision integration
- **League of Legends** local live-client data (`https://127.0.0.1:2999`)

### Logs & Debug

- Action log filtering + export
- Debug console capture with duplicate compression (`xN`)

## Where Your Data Lives

Installed runtime files are stored in Electron `userData`:

- `%APPDATA%/ShockHub/config.json`
- `%APPDATA%/ShockHub/actions.log`

These files are user-local and are not bundled into the packaged app.

## Security

Config exports include API credentials. Treat exported files like secrets.

## Safety Disclaimer

By using ShockHub, you accept full responsibility for device usage and outcomes.

The author is not responsible for any unwanted shocks, injuries, damages, or other harm resulting from use or misuse of this software.

Always follow proper safety guidance for shock-collar devices, including manufacturer instructions and best practices. Do not place electrodes on the chest, head, neck, or spine.

## License

MIT — see [LICENSE](LICENSE).