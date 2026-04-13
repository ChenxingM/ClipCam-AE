# Changelog

All notable changes to ClipCam-AE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta] - 2026-04-13

First public beta release. Core features are implemented and internally verified, but real-world coverage is limited — please test and report issues before a stable 1.0.0.

### Added

- Direct `.clip` file reading via bundled `clipcam-extractor.exe`
- `.clipcam` v3 binary intermediate format (66-byte header with CropFrame fields)
- Multi-camera support with dropdown picker
- Layer transform import with automatic CSP → AE layer name matching
- Interactive curve editor with draggable bezier handles
- Keyframe interpolation preservation (Smooth / Linear / Hold)
- Two import modes:
  - **Camera Frame** — creates a camera frame layer inside LO comp
  - **LO Comp Layer** — controls the LO layer inside CAM comp with inverted coordinates
- CropFrame offset support — aligns LO layer positioning when the canvas differs from the camera frame
- Per-property keyframe selection (only apply the curves you want)
- Embedded Inter variable font with OpenType features (tnum, calt, cv02–04, cv09)
- Lucide SVG icon set in the toolbar
- Animated tab indicator
- User preference persistence (last used mode, LO size, etc.)
- `.zxp` installer + portable `.zip` dual release (Windows x86-64)

### Supported environments

- After Effects 2020 (17.0) through current
- Windows 10 / 11 (x86-64)

### Known limitations

- macOS is not supported yet — the `clipcam-extractor` binary is Windows-only
- `.clip` files containing only static layers (no animation) will report "no camera or transform data"
