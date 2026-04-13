# Contributing to ClipCam-AE

Thanks for your interest! ClipCam-AE is a small hobby project, but clear contributions are always welcome.

## Reporting bugs

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- After Effects version (e.g. `AE 2024 24.0.3`)
- Clip Studio Paint version
- Sample `.clip` or `.clipcam` file (if possible — small repro beats a long description)
- Console output — open AE, then `Window → Extensions → ClipCamAE`, right-click the panel → Inspect → Console
- Screenshot / screen recording of the panel state

## Suggesting features

Open a [feature request issue](.github/ISSUE_TEMPLATE/feature_request.md). Keep it concrete: what are you trying to do, and how does the current workflow fail you?

## Development setup

1. Clone the repo
2. Run `powershell -ExecutionPolicy Bypass -File deploy.ps1` — this creates a junction at
   `%APPDATA%\Adobe\CEP\extensions\com.clipcam.ae` pointing back to your working copy, and enables `PlayerDebugMode` for CSXS 8–12
3. Restart After Effects → `Window → Extensions → ClipCamAE`
4. Edit files in place — refresh the panel (right-click → Reload) to see changes

### Debugging

- Chrome DevTools: with the panel open, visit `http://localhost:8870` (port configured in `.debug`)
- ExtendScript side (`jsx/hostscript.jsx`): use `$.writeln(...)` or AE's ExtendScript Toolkit / VS Code debugger

## Code style

No hard rules. Match what's already there:

- Plain ES5-ish JavaScript (CEP's Chromium is old — avoid modern syntax unless you've verified it works)
- 2-space indent, double quotes for strings, semicolons
- Keep comments short and focused on *why*, not *what*
- No build step — everything ships as-is

## Pull requests

- Branch off `master`, open a PR with a clear title and 1–3 bullet summary
- One logical change per PR — smaller PRs merge faster
- Don't bump `CSXS/manifest.xml` version in PRs; the maintainer handles releases
- By contributing, you agree that your code is licensed under Apache 2.0 (same as the project)

## About `bin/clipcam-extractor.exe`

This binary is built from a separate, closed-source Rust project. PRs touching the binary or proposing a replacement will not be merged — please open an issue to discuss instead.

## Questions

Not sure if something is a bug or intended behavior? Open an issue and ask — no question is too small.
