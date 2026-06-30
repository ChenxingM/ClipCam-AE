<p align="center">
  <img src="img/clipcam_ae_logo.svg" alt="ClipCam for AE" width="540">
</p>

<p align="center">
  <strong>A CEP panel that brings Clip Studio Paint cameras into After Effects</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/After%20Effects-2020%2B-9999FF?logo=adobeaftereffects&logoColor=white" alt="AE">
  <img src="https://img.shields.io/badge/Clip%20Studio%20Paint-.clip-FF6B9D" alt="CSP">
  <img src="https://img.shields.io/badge/CEP-panel-4A154B" alt="CEP">
</p>

---

> 🇨🇳 [中文](README.md) · 🇯🇵 [日本語](README.ja.md)

> 🧪 **Public Beta — v1.0.0-beta**
>
> This is the first public beta of ClipCam-AE. Core features are implemented and validated internally, but haven't been battle-tested across a wide range of real projects yet. **Requires Windows + After Effects 2020 or later.** This release is published specifically to gather early feedback and real-world bug reports — please try it and report anything you hit at [Issues](https://github.com/ChenxingM/ClipCam-AE/issues). A stable 1.0.0 will follow once enough feedback is collected.

## Features

- Reads `.clip` files directly or the intermediate `.clipcam` format
- Multi-camera support (auto-detects, shows a picker)
- Layer transform import (auto-matches CSP layers to AE layers by name)
- Interactive curve editor with bezier handle dragging
- Two import modes: **Camera Frame** / **LO Comp Layer**
- Preserves keyframe interpolation types (Smooth / Linear / Hold)

> 📦 **About the `.clipcam` format**
>
> Clip Studio Paint currently offers **no way to export raw camera or layer transform data** — it can only output finished video, image sequences, or TimeSheet data (CSP's exposure-sheet view), none of which contain the raw animation data needed to reconstruct camera curves. To carry CSP's internal keyframes and curves over to After Effects intact, this project defines the `.clipcam` binary intermediate format.
>
> - **`.clipcam` format spec** is fully open: [docs/clipcam-format.en.md](docs/clipcam-format.en.md)
> - **`.clipcam` parser** (`js/clipcam.js`) ships with the panel under Apache 2.0
> - **`.clip → .clipcam` generator** — currently only the closed-source `bin/clipcam-extractor.exe` (maintained by me, free to use, reverse engineering prohibited)
>
> `clipcam-extractor` is a closed-source `.clip` file parser I maintain. Because **CSP's `.clip` format has no public spec**, I had to reverse-engineer the `.clip` file structure myself. My reverse-engineering notes on `.clip` are not public yet — they're still at an early draft stage, and I may clean them up and release them in the future.
>
> The `.clipcam` format itself stays fully open: anyone can write their own `.clipcam` reader against the spec, or emit `.clipcam` files from other (non-CSP) data sources, and the panel will read them.

## Demo video

A full walkthrough video is in production and will be linked here once it's published.

## Installation

### Option A — `.zxp` installer (recommended)

1. Download the latest `ClipCam-AE-v*.zxp` from [Releases](https://github.com/ChenxingM/ClipCam-AE/releases)
2. Install [aescripts ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Drag the `.zxp` into the ZXP Installer window and wait for it to finish
4. Restart After Effects → **Window** → **Extensions** → **ClipCamAE**

### Option B — portable zip (developers)

1. Download `ClipCam-AE-v*.zip` from [Releases](https://github.com/ChenxingM/ClipCam-AE/releases) and extract to:
   ```
   C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions\ClipCam-AE
   ```
2. Enable unsigned extensions — add string value `PlayerDebugMode = 1` under `HKCU\SOFTWARE\Adobe\CSXS.11`
   (or run the bundled `deploy.ps1` which does this automatically)
3. Restart After Effects → **Window** → **Extensions** → **ClipCamAE**

### Running from source

```powershell
git clone https://github.com/ChenxingM/ClipCam-AE.git
cd ClipCam-AE
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

`deploy.ps1` auto-fetches `clipcam-extractor.exe` from GitHub Releases (see the `bin/` section below) and creates a junction into the CEP extensions directory.

## Usage

### Camera Tab

1. Drag a `.clip` or `.clipcam` file onto the panel (or click **Open**)
2. `.clip` files are automatically processed by the bundled extractor
3. Multi-camera files show a dropdown at the top
4. Preview and tweak keyframes in the curve editor
5. Pick an import mode and target layer, click **Apply**

### Layer Tab

1. Load a file containing layer transform data
2. Click **Refresh** to pull the current AE comp's layers
3. The panel auto-matches CSP → AE layer names
4. Adjust the mapping manually (dropdowns) if needed
5. Click **Apply All** to batch-write every matched layer, or click the **Apply** button on a row to write just that layer

> ⚠️ **Single-axis Scale import limitation**
>
> AE's Scale is a 2D property and can't be split per axis. If you import only one axis (e.g., uncheck `Scale Y` and keep `Scale X`), the other axis is pinned to the target layer's current Scale value at import time (whatever AE reads as the initial value) — any existing keyframe animation on that axis will be flattened to that constant. To preserve the Y axis animation intact, import both axes together.

### Import Modes

A typical 2D animation project uses a nested composition structure — an outer **Camera comp** with a nested **Layout (LO) precomp** inside:

```
Camera                ← Camera comp
 └─ Layout (LO)       ← LO precomp; animate its transform to create the camera move
     ├─ Frame         ← Camera frame layer; some project templates drive the Camera comp's camera move from this layer via a camera rig expression
     ├─ C
     ├─ B
     └─ A
```

Two apply modes are currently implemented, matching two different workflows:

| Mode | Where you operate | What it drives | Data direction |
|------|-------------------|----------------|----------------|
| **Camera Frame** | Inside the **LO comp** | Position / Scale / Rotation of the camera frame layer | Maps directly from CSP |
| **LO Comp Layer** | Inside the **Camera comp** | Transform of the LO precomp layer | Inverted (camera pans right → LO layer pans left) |

- **Camera Frame** — The camera frame layer lives inside the LO comp; CSP's camera data is burned onto it 1:1.
- **LO Comp Layer** — The outer camera layer stays still; the *inverted* transform is written onto the LO precomp layer. Visually equivalent to a camera move. Use this mode when your project uses a camera rig expression on the Frame layer.

### LO Size

Used for coordinate conversion. Click **CSP** to auto-fill from the `.clip` canvas size, or **Comp** to pull the current comp's dimensions.

## Curve Editor

| Action | Function |
|--------|----------|
| Drag keyframe | Move frame position and value |
| Drag handle | Adjust slope and weight (bezier control points) |
| Right-click keyframe | Toggle interpolation type (Smooth / Linear / Hold) |
| Scroll wheel | Zoom |
| Alt+drag / middle-drag | Pan |
| Double-click | Fit view |
| Ctrl+Z | Undo |

## Project Layout

```
ClipCam-AE/
├── bin/
│   ├── extractor.lock.json      # Pinned extractor version + SHA256 + download URL
│   ├── fetch-extractor.ps1      # Fetches and verifies the extractor binary
│   └── clipcam-extractor.exe    # Fetched on demand (not in the repo); closed-source binary
├── css/
│   └── style.css
├── js/
│   ├── CSInterface.js           # Adobe CEP SDK
│   ├── clipcam.js               # .clipcam format parser
│   ├── curve-canvas.js          # Curve editor canvas
│   └── main.js                  # Main UI logic
├── jsx/
│   └── hostscript.jsx           # AE ExtendScript
├── CSXS/
│   └── manifest.xml             # CEP extension manifest
├── docs/
│   └── clipcam-format.md        # .clipcam binary format spec
├── deploy.ps1                   # Local dev deploy script (creates CEP junction)
├── build.ps1                    # Release packaging script (produces .zip / .zxp)
└── index.html
```

## System Requirements

- After Effects 2020 (17.0) or later
- Windows (macOS is not supported yet)

## About `clipcam-extractor.exe`

This project depends on a precompiled binary `clipcam-extractor.exe` that extracts camera + layer transform data from `.clip` files and emits the `.clipcam` format.

**The binary is not stored in the Git repository.** It is built from a separate, closed-source Rust project and published as a standalone asset on GitHub Releases. The repo only ships `bin/extractor.lock.json` (pinned version + hash + URL) and `bin/fetch-extractor.ps1` (downloader + verifier).

**Developer workflow**:

```powershell
# First clone: run deploy.ps1 (auto-fetches), or fetch manually:
powershell -ExecutionPolicy Bypass -File bin/fetch-extractor.ps1
```

The script reads `bin/extractor.lock.json`, downloads the binary, verifies its SHA-256, and cleans up on failure.

**Currently pinned version** (excerpt from `bin/extractor.lock.json`):

| Field | Value |
|---|---|
| Version | v1.0.0 |
| Platform | Windows x86-64 (PE32+) |
| Size | 1,331,200 bytes |
| SHA-256 | `209EE43D5941B1C1A391B065D09DE83C52A044CFCE8D4B31DF1E4638916CB469` |

**Terms of use**:

- Free for personal and commercial use
- Redistributable only as part of this panel
- Reverse engineering, decompilation, and disassembly are prohibited
- No warranty of any kind (AS-IS)

Please open an [Issue](https://github.com/ChenxingM/ClipCam-AE/issues) for bugs or platform support requests.

## Use and credit

The panel code in this repository is permanently free and open-source. It will never be monetized in any form.

> 🇯🇵 [日本語](README.ja.md) · 🇨🇳 [中文](README.md)

This tool is licensed under Apache License 2.0. There are **no additional restrictions** on any usage, including video production (animation, TV episodes, music videos, commercials, game cinematics, or other commercial work).

If you can include me in the end credits of your work, I would be very happy:

```
Technical Support
Sengoku Mayoi (千石まよひ)
```

The title "Technical Support" is flexible — feel free to replace it with whatever fits your project.

This is a **request, not an obligation** — Apache 2.0 already grants you full rights, and omitting the credit is completely fine. If crediting isn't feasible, a **GitHub star** or a **note in Issues** is equally welcome.

See the [NOTICE](NOTICE) file for the full text.

## License

- **Panel code** (`js/`, `jsx/`, `css/`, `index.html`, `CSXS/`): [Apache License 2.0](LICENSE)
- **`clipcam-extractor.exe`**: Proprietary freeware — see section above
- **Third-party assets** (Adobe CEP SDK, Lucide icons, Inter font): see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)
- **Credit** (optional, for commercial work): see [NOTICE](NOTICE)
