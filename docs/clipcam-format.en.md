# `.clipcam` File Format Specification

> 🇨🇳 [中文](clipcam-format.md)

`.clipcam` is a binary format that carries Clip Studio Paint camera and layer-transform animation data. All multi-byte numeric fields are **little-endian**.

---

## Header (66 bytes)

```
┌────────────────┬──────┬──────────────────────────────────┐
│ Magic          │ 8B   │ "CLIPCAM\0"                      │
│ Version        │ u16  │ 3                                │
│ FrameRate      │ f64  │ Frames per second (e.g. 24.0)    │
│ CanvasWidth    │ u32  │ Canvas width (pixels)            │
│ CanvasHeight   │ u32  │ Canvas height (pixels)           │
│ StartFrame     │ u32  │ First frame (1-based)            │
│ EndFrame       │ u32  │ Last frame (inclusive)           │
│ CropFrameW     │ f64  │ CropFrame width                  │
│ CropFrameH     │ f64  │ CropFrame height                 │
│ CropOffsetX    │ f64  │ CropFrame X offset               │
│ CropOffsetY    │ f64  │ CropFrame Y offset               │
└────────────────┴──────┴──────────────────────────────────┘
```

**CropFrame** represents CSP's camera frame (the "shooting frame") — the region of the canvas that becomes the final output. When the canvas is larger than the output, CropFrame stores the frame's size and its offset relative to the canvas center. If the source file has no camera frame, all four fields are `0`.

## Camera Section

```
┌───────────────┬──────┬──────────────────────┐
│ CameraCount   │ u16  │ Number of cameras    │
├───────────────┴──────┴──────────────────────┤
│ Block × CameraCount                         │
└─────────────────────────────────────────────┘
```

## Transform Section

```
┌───────────────┬──────┬─────────────────────────────┐
│ TransformCount│ u16  │ Number of transformed layers│
├───────────────┴──────┴─────────────────────────────┤
│ Block × TransformCount                             │
└────────────────────────────────────────────────────┘
```

---

## Block

Cameras and layer transforms share the same block structure:

```
┌──────────────┬──────┬──────────────────────┐
│ NameLen      │ u8   │ Name length in bytes │
│ Name         │ [u8] │ UTF-8 name           │
│ FCurveCount  │ u16  │ Number of fcurves    │
├──────────────┴──────┴──────────────────────┤
│ FCurve × FCurveCount                       │
└────────────────────────────────────────────┘
```

- For a **Camera Block**, `Name` is the camera layer's name in CSP (e.g. `"カメラ 1"`).
- For a **Transform Block**, `Name` is the animated layer's name (e.g. `"雕像5 の複製 2"`). The AE side uses this for layer matching.

---

## FCurve

```
┌──────────────┬──────┬───────────────────────────────────┐
│ LabelLen     │ u8   │ Label length in bytes             │
│ Label        │ [u8] │ UTF-8 label (e.g. "ImagePosition.X")│
│ DefaultValue │ f64  │ Default value                     │
│ KeyframeCount│ u32  │ Number of keyframes               │
├──────────────┴──────┴───────────────────────────────────┤
│ Keyframe × KeyframeCount                                │
└─────────────────────────────────────────────────────────┘
```

### Property labels

**Camera properties**

| Label             | Meaning                                |
|-------------------|----------------------------------------|
| `ImageCenter.X`   | Anchor X                               |
| `ImageCenter.Y`   | Anchor Y                               |
| `ImagePosition.X` | Position X                             |
| `ImagePosition.Y` | Position Y                             |
| `ImageRotation`   | Rotation (degrees)                     |
| `ImageScale`      | Scale (percent; 100 = original size)   |
| `Opacity`         | Opacity                                |

**Layer transform properties**

| Label                | Meaning             |
|----------------------|---------------------|
| `ImageAspectScale.X` | Scale X (percent)   |
| `ImageAspectScale.Y` | Scale Y (percent)   |
| `ImageCenter.X`      | Center X            |
| `ImageCenter.Y`      | Center Y            |
| `ImagePosition.X`    | Position X          |
| `ImagePosition.Y`    | Position Y          |
| `ImageRotation`      | Rotation (degrees)  |
| `Opacity`            | Opacity             |

Axis-bearing properties use `.` as a separator: `{PropertyName}.{Axis}`. Scalar properties contain no `.`.

---

## Keyframe

```
┌────────────────────┬──────┬────────────────────────────────┐
│ Frame              │ u32  │ Frame number (1-based)         │
│ Value              │ f64  │ Value                          │
│ LeftSlope          │ f64  │ Incoming tangent slope         │
│ RightSlope         │ f64  │ Outgoing tangent slope         │
│ LeftHandleWeight   │ f64  │ Incoming handle weight (frames)│
│ RightHandleWeight  │ f64  │ Outgoing handle weight (frames)│
│ InterpType         │ u8   │ Interpolation type             │
└────────────────────┴──────┴────────────────────────────────┘
```

Each keyframe is exactly **45 bytes**.

### Interpolation types

| Value | Name   | Meaning                                                           |
|-------|--------|-------------------------------------------------------------------|
| 0     | Smooth | Bezier interpolation; uses `Slope` and `HandleWeight` fields      |
| 1     | Linear | Straight-line interpolation                                       |
| 2     | Hold   | Value holds until the next keyframe                               |

### Bezier control points

```
Right control point (outgoing):
  frame_cp = keyframe.frame + rightHandleWeight
  value_cp = keyframe.value + rightSlope × rightHandleWeight

Left control point (incoming):
  frame_cp = keyframe.frame − leftHandleWeight
  value_cp = keyframe.value − leftSlope × leftHandleWeight
```

When `HandleWeight` is zero or very close to zero, readers should fall back to the default of one-third of the distance to the neighboring keyframe.

---

## Coordinate system

- **Frame numbers** are 1-based (the first frame is `1`, not `0`).
- **Positions** are in pixels, with the origin at the **top-left** corner of the canvas.
- **Rotation** is in degrees; clockwise is positive.
- **Scale** is a percentage (`100` = original size).

---

# clipcam-extractor

Reads a Clip Studio Paint `.clip` file and writes the extracted camera + layer transform animation data as a `.clipcam` file.

## Usage

```
clipcam-extractor <input.clip> [output.clipcam]
```

On success the output path is printed to `stdout`; on failure the error is written to `stderr`.

## Exit codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | Success                                          |
| 1    | File read / parse / write error                  |
| 2    | No camera or transform data found in the file    |
