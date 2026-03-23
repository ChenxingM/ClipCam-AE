<p align="center">
  <img src="img/clipcam_ae_logo.svg" alt="ClipCam for AE" width="540">
</p>

<p align="center">
  <strong>Clip Studio Paint 摄像机对接 After Effects 的 CEP 扩展</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/After%20Effects-2020%2B-9999FF?logo=adobeaftereffects&logoColor=white" alt="AE">
  <img src="https://img.shields.io/badge/Clip%20Studio%20Paint-.clip-FF6B9D" alt="CSP">
  <img src="https://img.shields.io/badge/CEP-panel-4A154B" alt="CEP">
</p>

---

## 功能

- 直接读取 `.clip` 文件或 `.clipcam` 中间格式
- 多摄像机支持（自动检测并提供选择）
- 图层变形导入（自动匹配 AE 图层名）
- 交互式曲线编辑器，支持贝塞尔手柄拖拽
- 两种导入模式：Camera Frame / LO Comp Layer
- 关键帧插值类型保留（Smooth / Linear / Hold）

## 安装

1. 将整个 `ClipCam-AE` 文件夹复制到 CEP 扩展目录：
   ```
   C:\Users\<用户名>\AppData\Roaming\Adobe\CEP\extensions\ClipCam-AE
   ```
2. 启用未签名扩展（开发模式）：
   - 注册表 `HKCU\SOFTWARE\Adobe\CSXS.11` 添加字符串 `PlayerDebugMode` = `1`
3. 重启 After Effects → **Window** → **Extensions** → **ClipCamAE**

## 使用

### Camera Tab

1. 将 `.clip` 或 `.clipcam` 文件拖入面板（或点击 **Open**）
2. `.clip` 文件会自动通过内置工具提取摄像机数据
3. 多摄像机文件会在顶部显示选择下拉菜单
4. 在曲线编辑器中预览和调整关键帧
5. 选择导入模式和目标图层，点击 **Apply**

### Layer Tab

1. 加载含图层变形数据的 `.clip` / `.clipcam` 文件
2. 点击 **Refresh** 获取当前 AE 合成的图层列表
3. 面板自动按名称匹配 CSP 图层 → AE 图层
4. 手动调整匹配关系（下拉选择）
5. 点击 **Apply Transforms** 批量写入关键帧

### 导入模式

| 模式 | 说明 |
|------|------|
| **Camera Frame** | 在 LO comp 内创建摄像机帧图层，Position / Scale / Rotation 直接对应 CSP 数据 |
| **LO Comp Layer** | 在 CAM comp 内控制 LO 图层，坐标和旋转取反（摄像机右移 → 图层左移） |

### LO Size

LO 尺寸用于坐标换算。点击 **CSP** 自动填入 `.clip` 文件的画布尺寸，点击 **Comp** 获取当前合成尺寸。

## 曲线编辑器

| 操作 | 功能 |
|------|------|
| 拖拽关键帧 | 移动帧位置和值 |
| 拖拽手柄 | 调整斜率和权重（贝塞尔控制点） |
| 右键关键帧 | 切换插值类型（Smooth / Linear / Hold） |
| 滚轮 | 缩放视图 |
| Alt+拖拽 / 中键拖拽 | 平移视图 |
| 双击 | 自动适配视图 |
| Ctrl+Z | 撤销 |

## 项目结构

```
ClipCam-AE/
├── bin/
│   └── clipcam-extractor.exe    # .clip → .clipcam 转换工具（闭源）
├── css/
│   └── style.css
├── js/
│   ├── CSInterface.js           # Adobe CEP SDK
│   ├── clipcam.js               # .clipcam v3 格式解析器
│   ├── curve-canvas.js          # 曲线编辑器 Canvas
│   └── main.js                  # 主 UI 逻辑
├── jsx/
│   └── hostscript.jsx           # AE ExtendScript
├── CSXS/
│   └── manifest.xml             # CEP 扩展清单
├── docs/
│   ├── clipcam-format.md        # .clipcam 文件格式规范
│   └── math.md                  # 数学计算详解
└── index.html
```

## 系统要求

- After Effects 2020 (17.0) 及以上
- Windows（macOS 暂不支持，后续更新）

## 许可

- 面板代码开源，[Apache 2.0](LICENSE) 许可证
- `bin/clipcam-extractor` 为预编译二进制，免费使用但暂不开源
- 关于本项目用到的其他第三方资源的许可证，详见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)