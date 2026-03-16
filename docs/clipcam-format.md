# .clipcam 文件格式规范

`.clipcam` 是用于存储 Clip Studio Paint 摄像机动画数据的二进制格式。所有多字节数值采用**小端序（Little-Endian）**。

## 版本

| 版本 | 说明 |
|------|------|
| 1 | 单摄像机，无摄像机名称 |
| 2 | 多摄像机，每个摄像机有独立名称和参数 |

---

## Version 1

```
┌─────────────────────────────────────────┐
│ Header                                  │
├──────────────┬──────┬───────────────────┤
│ Magic        │ 8B   │ "CLIPCAM\0"       │
│ Version      │ u16  │ 1                 │
│ FrameRate    │ f64  │ 帧率（如 24.0）    │
│ CanvasWidth  │ u32  │ 画布宽度（像素）    │
│ CanvasHeight │ u32  │ 画布高度（像素）    │
│ StartFrame   │ u32  │ 起始帧（1-based）  │
│ EndFrame     │ u32  │ 结束帧            │
│ PropCount    │ u16  │ 属性曲线数量       │
├──────────────┴──────┴───────────────────┤
│ Properties × PropCount                  │
│ （见下方 Property 结构）                  │
└─────────────────────────────────────────┘
```

## Version 2

```
┌─────────────────────────────────────────┐
│ Header                                  │
├──────────────┬──────┬───────────────────┤
│ Magic        │ 8B   │ "CLIPCAM\0"       │
│ Version      │ u16  │ 2                 │
│ CameraCount  │ u16  │ 摄像机数量         │
├──────────────┴──────┴───────────────────┤
│ Camera × CameraCount                    │
│                                         │
│  ┌────────────┬──────┬────────────────┐ │
│  │ NameLen    │ u8   │ 名称字节长度    │ │
│  │ Name       │ [u8] │ UTF-8 编码名称  │ │
│  │ FrameRate  │ f64  │ 帧率           │ │
│  │ CanvasW    │ u32  │ 画布宽度       │ │
│  │ CanvasH    │ u32  │ 画布高度       │ │
│  │ StartFrame │ u32  │ 起始帧         │ │
│  │ EndFrame   │ u32  │ 结束帧         │ │
│  │ PropCount  │ u16  │ 属性曲线数量    │ │
│  ├────────────┴──────┴────────────────┤ │
│  │ Properties × PropCount             │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Property（属性曲线）

```
┌──────────────┬──────┬─────────────────────────┐
│ LabelLen     │ u8   │ 标签字节长度             │
│ Label        │ [u8] │ UTF-8（如 "ImagePosition.X"）│
│ DefaultValue │ f64  │ 默认值                   │
│ KeyframeCount│ u32  │ 关键帧数量               │
├──────────────┴──────┴─────────────────────────┤
│ Keyframes × KeyframeCount                     │
└───────────────────────────────────────────────┘
```

### 标签命名

| Label | 说明 |
|-------|------|
| `ImageCenter.X` | 锚点 X |
| `ImageCenter.Y` | 锚点 Y |
| `ImagePosition.X` | 位置 X |
| `ImagePosition.Y` | 位置 Y |
| `ImageRotation` | 旋转（度） |
| `ImageScale` | 缩放（百分比，100 = 原始大小） |
| `Opacity` | 不透明度 |

带轴的属性用 `.` 分隔：`{PropertyName}.{Axis}`。无轴属性（如 `ImageRotation`）不含 `.`。

---

## Keyframe（关键帧）

```
┌────────────────────┬──────┬──────────────────────┐
│ Frame              │ u32  │ 帧号（1-based）        │
│ Value              │ f64  │ 值                     │
│ LeftSlope          │ f64  │ 入方向斜率              │
│ RightSlope         │ f64  │ 出方向斜率              │
│ LeftHandleWeight   │ f64  │ 入方向手柄权重（帧距离） │
│ RightHandleWeight  │ f64  │ 出方向手柄权重（帧距离） │
│ AutoSmooth         │ f64  │ 自动平滑值              │
│ InterpType         │ u8   │ 插值类型                │
└────────────────────┴──────┴──────────────────────┘
```

每个关键帧固定 **53 字节**。

### 插值类型

| 值 | 名称 | 说明 |
|----|------|------|
| 0 | Smooth | 贝塞尔平滑插值，使用 Slope 和 HandleWeight |
| 1 | Linear | 线性插值 |
| 2 | Hold | 保持，值不变直到下一个关键帧 |

### 贝塞尔控制点

对于 Smooth 类型的关键帧，贝塞尔控制点位置由斜率和权重决定：

```
右控制点（出方向）:
  frame_cp = keyframe.frame + rightHandleWeight
  value_cp = keyframe.value + rightSlope × rightHandleWeight

左控制点（入方向）:
  frame_cp = keyframe.frame - leftHandleWeight
  value_cp = keyframe.value - leftSlope × leftHandleWeight
```

当 `HandleWeight` 为 0 或接近 0 时，使用默认值（相邻关键帧间距的 1/3）。

---

## 坐标系

- **帧号**：1-based（第 1 帧 = 1）
- **位置**：像素坐标，原点在画布左上角
- **旋转**：角度，顺时针为正
- **缩放**：百分比（100 = 原始大小，50 = 放大 2 倍显示区域）

---

# clipcam-conv

从 Clip Studio Paint `.clip` 文件提取摄像机动画数据并输出 `.clipcam` 格式的命令行工具。

## 用法

```
clipcam-conv <input.clip> [output.clipcam]
```

- `input.clip`：CSP 项目文件路径
- `output.clipcam`：输出路径（可选，默认替换扩展名为 `.clipcam`）

成功时输出文件路径到 stdout，失败时输出错误到 stderr。

## 退出码

| 码 | 说明 |
|----|------|
| 0 | 成功 |
| 1 | 文件读取/解析/写入错误 |
| 2 | 文件中没有摄像机数据 |

## 示例

```bash
# 指定输出路径
clipcam-conv animation.clip camera_data.clipcam

# 自动命名（animation.clip → animation.clipcam）
clipcam-conv animation.clip

# 多摄像机文件会将所有摄像机写入同一个 .clipcam
clipcam-conv multi_cam_project.clip
```

## 集成

ClipCam-AE 面板在检测到 `.clip` 文件时自动调用此工具：

```javascript
var execFile = require("child_process").execFile;
execFile("bin/clipcam-conv.exe", [clipPath, tmpOutput], function(err, stdout) {
    // stdout = 输出文件路径
});
```
