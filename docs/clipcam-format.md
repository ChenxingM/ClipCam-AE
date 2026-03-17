# .clipcam v3 文件格式规范

`.clipcam` 是用于存储 Clip Studio Paint 摄像机 + 图层变形动画数据的二进制格式。所有多字节数值采用**小端序（Little-Endian）**。

---

## 文件头（34 字节）

```
┌──────────────┬──────┬─────────────────────┐
│ Magic        │ 8B   │ "CLIPCAM\0"         │
│ Version      │ u16  │ 3                   │
│ FrameRate    │ f64  │ 帧率（如 24.0）      │
│ CanvasWidth  │ u32  │ 画布宽度（像素）      │
│ CanvasHeight │ u32  │ 画布高度（像素）      │
│ StartFrame   │ u32  │ 起始帧（1-based）    │
│ EndFrame     │ u32  │ 结束帧              │
└──────────────┴──────┴─────────────────────┘
```

## Camera Section（摄像机段）

```
┌──────────────┬──────┬──────────────────────┐
│ CameraCount  │ u16  │ 摄像机数量            │
├──────────────┴──────┴──────────────────────┤
│ Block × CameraCount                       │
└────────────────────────────────────────────┘
```

## Transform Section（图层变形段）

```
┌──────────────┬──────┬──────────────────────┐
│ TransformCount│ u16 │ 变形图层数量           │
├──────────────┴──────┴──────────────────────┤
│ Block × TransformCount                    │
└────────────────────────────────────────────┘
```

---

## Block（数据块）

摄像机和图层变形使用相同的块结构：

```
┌──────────────┬──────┬──────────────────────┐
│ NameLen      │ u8   │ 名称字节长度           │
│ Name         │ [u8] │ UTF-8 名称            │
│ FCurveCount  │ u16  │ 属性曲线数量           │
├──────────────┴──────┴──────────────────────┤
│ FCurve × FCurveCount                      │
└────────────────────────────────────────────┘
```

- Camera Block 的 Name = 摄像机图层名（如 "カメラ 1"）
- Transform Block 的 Name = 动画图层名（如 "雕像5 の複製 2"），用于 AE 端图层匹配

---

## FCurve（属性曲线）

```
┌──────────────┬──────┬─────────────────────────┐
│ LabelLen     │ u8   │ 标签字节长度             │
│ Label        │ [u8] │ UTF-8（如 "ImagePosition.X"）│
│ DefaultValue │ f64  │ 默认值                   │
│ KeyframeCount│ u32  │ 关键帧数量               │
├──────────────┴──────┴─────────────────────────┤
│ Keyframe × KeyframeCount                      │
└───────────────────────────────────────────────┘
```

### 属性标签

**摄像机属性：**

| Label | 说明 |
|-------|------|
| `ImageCenter.X` | 锚点 X |
| `ImageCenter.Y` | 锚点 Y |
| `ImagePosition.X` | 位置 X |
| `ImagePosition.Y` | 位置 Y |
| `ImageRotation` | 旋转（度） |
| `ImageScale` | 缩放（百分比，100 = 原始大小） |
| `Opacity` | 不透明度 |

**图层变形属性：**

| Label | 说明 |
|-------|------|
| `ImageAspectScale.X` | 缩放 X（百分比） |
| `ImageAspectScale.Y` | 缩放 Y（百分比） |
| `ImageCenter.X` | 中心点 X |
| `ImageCenter.Y` | 中心点 Y |
| `ImagePosition.X` | 位置 X |
| `ImagePosition.Y` | 位置 Y |
| `ImageRotation` | 旋转（度） |
| `Opacity` | 不透明度 |

带轴的属性用 `.` 分隔：`{PropertyName}.{Axis}`。无轴属性不含 `.`。

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
│ InterpType         │ u8   │ 插值类型                │
└────────────────────┴──────┴──────────────────────┘
```

每个关键帧固定 **45 字节**。

### 插值类型

| 值 | 名称 | 说明 |
|----|------|------|
| 0 | Smooth | 贝塞尔平滑插值，使用 Slope 和 HandleWeight |
| 1 | Linear | 线性插值 |
| 2 | Hold | 保持，值不变直到下一个关键帧 |

### 贝塞尔控制点

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
- **缩放**：百分比（100 = 原始大小）

---

# clipcam-extractor

从 Clip Studio Paint `.clip` 文件提取摄像机 + 图层变形动画数据并输出 `.clipcam` 格式。

## 用法

```
clipcam-extractor <input.clip> [output.clipcam]
```

成功时输出文件路径到 stdout，失败时输出错误到 stderr。

## 退出码

| 码 | 说明 |
|----|------|
| 0 | 成功 |
| 1 | 文件读取/解析/写入错误 |
| 2 | 文件中没有摄像机或变形数据 |
