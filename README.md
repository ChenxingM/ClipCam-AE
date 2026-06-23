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

> 🇯🇵 [日本語](README.ja.md) · 🇺🇸 [English](README.en.md)

> 🧪 **公开测试版 (Public Beta) — v1.0.0-beta**
>
> 这是 ClipCam-AE 的首个公开测试版本。核心功能已实现并经过内部验证，但尚未在大量真实项目中跑过。当前仅支持 Windows + After Effects 2020 及以上版本。发布此版本的目的是收集早期反馈和真实使用场景下的 bug 报告——欢迎试用，遇到问题请到 [Issues](https://github.com/ChenxingM/ClipCam-AE/issues) 反馈，稳定版 1.0.0 将在收到足够反馈后发布。

## 功能

- 直接读取 `.clip` 文件或 `.clipcam` 中间格式
- 多摄像机支持（自动检测并提供选择）
- 图层变形导入（自动匹配 AE 图层名）
- 交互式曲线编辑器，支持贝塞尔手柄拖拽
- 两种导入模式：Camera Frame / LO Comp Layer
- 关键帧插值类型保留（Smooth / Linear / Hold）

> 📦 **关于 `.clipcam` 格式**
>
> Clip Studio Paint 目前**不提供导出摄像机 / 图层变形原始数据的途径**——只能输出成品视频、序列帧或摄影表（律表）信息，而这些都不是可以直接还原摄像机曲线的原始动画数据。为了把 CSP 内部的关键帧和曲线完整搬到 After Effects，本项目设计了 `.clipcam` 二进制中间格式。
>
> - **`.clipcam` 格式规范**完全开放：[docs/clipcam-format.md](docs/clipcam-format.md)
> - **`.clipcam` 解析器**（`js/clipcam.js`）随面板一起开源（Apache 2.0）
> - **`.clip → .clipcam` 生成器**目前只有闭源的 `bin/clipcam-extractor.exe`（由我维护，免费使用，禁止反编译）
>
> clipcam-extractor 是我维护的闭源 `.clip` 文件解析器。由于**CSP 的 `.clip` 格式本身没有公开规范**，我对 `.clip` 文件结构进行了逆向解析。关于 `.clip` 格式的逆向研究文档仍处于初稿阶段，目前尚未对外公开，未来可能会整理后发布。
>
> 而 `.clipcam` 本身是完全开放的：任何人都可以基于公开规范写自己的 `.clipcam` 读取工具，或从其他数据来源（非 CSP）生成 `.clipcam` 文件，本面板都能读入。

## 演示视频

[bilibili](https://www.bilibili.com/video/BV14dEq6NEAv)

## 安装

### 方式 A：.zxp 安装包（推荐普通用户）

1. 从 [Releases](https://github.com/ChenxingM/ClipCam-AE/releases) 下载最新 `ClipCam-AE-v*.zxp`
2. 下载并安装 [aescripts ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. 打开 ZXP Installer，将 `.zxp` 拖入窗口 → 等待完成
4. 重启 After Effects → **Window** → **Extensions** → **ClipCamAE**

### 方式 B：便携版（开发者 / 想改代码）

1. 从 [Releases](https://github.com/ChenxingM/ClipCam-AE/releases) 下载 `ClipCam-AE-v*.zip` 并解压到：
   ```
   C:\Users\<用户名>\AppData\Roaming\Adobe\CEP\extensions\ClipCam-AE
   ```
2. 启用未签名扩展（开发模式）——注册表 `HKCU\SOFTWARE\Adobe\CSXS.11` 添加字符串 `PlayerDebugMode` = `1`
   （也可以直接跑仓库里的 `deploy.ps1`，会自动配置）
3. 重启 After Effects → **Window** → **Extensions** → **ClipCamAE**

### 从源码运行

```powershell
git clone https://github.com/ChenxingM/ClipCam-AE.git
cd ClipCam-AE
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

`deploy.ps1` 会自动从 GitHub Releases 拉取 `clipcam-extractor.exe`（见下方 `bin/` 章节）并创建到 CEP extensions 目录的 junction。

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

> ⚠️ **Scale 单轴导入的限制**
>
> AE 的 Scale 是二维属性，无法按轴分离。如果只导入其中一轴（例如关闭 `Scale Y`、只勾选 `Scale X`），另一轴会被固定为目标图层在导入时的当前 Scale 值（以 AE 读到的初始值为准）——该轴上原有的关键帧动画会被压平成这个常量。要完整保留 Y 轴的动画，请同时勾选两轴一起导入。

### 导入模式

二维动画工程常见的合成嵌套结构如下——上层是**摄像机合成（Camera Comp）**，内部嵌套一个**构图预合成（Layout / LO）**：

```
Camera                ← 摄像机合成
 └─ Layout (LO)       ← 预合成（Precomp），控制这层的变换属性实现运镜
     ├─ Frame         ← 摄像机框，根据项目模板和需求不同，有使用摄像机框配合表达式实现在 Camera 合成的运镜
     ├─ C
     ├─ B
     └─ A
```

目前实现了两种应用模式，对应两种不同的工作流：

| 模式 | 面板操作位置 | 作用对象 | 数据方向 |
|------|------------|---------|---------|
| **Camera Frame（摄像机框）** | **LO 合成**内部 | 摄像机框图层的 位置 / 缩放 / 旋转 | 直接对应 CSP 数据 |
| **LO Comp Layer（LO图层）** | **Camera 合成**内部 | LO 预合成图层的变换属性 | 取反（摄像机右移 → LO 图层左移） |

- **Camera Frame**——摄像机框图层实际存在于 LO 合成里，把 CSP 的摄像机数据 1:1 烧到这个图层上。
- **LO Comp Layer**——上层的摄像机图层不动，把**反向**变换写到 LO 预合成层上。视觉上等价于摄像机移动。使用摄像机框表达式时选择这种模式。

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
│   ├── extractor.lock.json      # 固定 extractor 版本 + SHA256 + 下载地址
│   ├── fetch-extractor.ps1      # 按 lock 文件拉取并校验 extractor
│   └── clipcam-extractor.exe    # 按需下载（不进仓库）；闭源二进制，见下方章节
├── css/
│   └── style.css
├── js/
│   ├── CSInterface.js           # Adobe CEP SDK
│   ├── clipcam.js               # .clipcam 格式解析器
│   ├── curve-canvas.js          # 曲线编辑器 Canvas
│   └── main.js                  # 主 UI 逻辑
├── jsx/
│   └── hostscript.jsx           # AE ExtendScript
├── CSXS/
│   └── manifest.xml             # CEP 扩展清单
├── docs/
│   └── clipcam-format.md        # .clipcam 文件格式规范
├── deploy.ps1                   # 本地开发部署脚本（创建 CEP 目录 junction）
├── build.ps1                    # Release 打包脚本（产出 .zip / .zxp）
└── index.html
```

## 系统要求

- After Effects 2020 (17.0) 及以上
- Windows（macOS 暂不支持，后续更新）

## 关于 `bin/clipcam-extractor.exe`

本项目依赖一个预编译二进制 `clipcam-extractor.exe`，用于从 `.clip` 文件提取摄像机 + 图层变形数据并输出 `.clipcam` 格式。

**该二进制不在 Git 仓库内**，由独立的 Rust 项目（未公开源码）构建，以独立 asset 发布到 GitHub Releases。仓库里只存放版本锁文件 `bin/extractor.lock.json` 和拉取脚本 `bin/fetch-extractor.ps1`。

**开发者工作流**：

```powershell
# 首次克隆后跑一次 deploy.ps1（会自动 fetch），或手动拉：
powershell -ExecutionPolicy Bypass -File bin/fetch-extractor.ps1
```

脚本会读取 `bin/extractor.lock.json` 的 URL、下载二进制、校验 SHA-256，失败会清理临时文件。

**当前固定版本**（节选自 `bin/extractor.lock.json`）：

| 项 | 值 |
|---|---|
| 版本 | v1.0.0 |
| 平台 | Windows x86-64（PE32+） |
| 大小 | 1,331,200 bytes |
| SHA-256 | `209EE43D5941B1C1A391B065D09DE83C52A044CFCE8D4B31DF1E4638916CB469` |

**使用条款**：

- ✅ 免费用于个人及商业用途
- ✅ 可随本面板一起分发（作为依赖二进制）
- ❌ 禁止反编译、反汇编或逆向工程
- ❌ 禁止单独从 Release 页提取并再分发该二进制
- ❌ 不附带任何形式的担保（AS-IS）

如在使用中遇到问题或需要其他平台支持，请在 [Issues](https://github.com/ChenxingM/ClipCam-AE/issues) 中反馈。

## 使用与署名

本仓库中的面板代码永久免费开源，今后也不会以任何形式收费。

> 🇯🇵 [日本語](README.ja.md) · 🇺🇸 [English](README.en.md)

本工具采用 Apache License 2.0。任何用途都**没有额外限制**，包括影像制作（动画、剧集、MV、广告、游戏 CG 等商业作品）。

如果能在片尾工作人员表里挂一下我的名字，我会非常开心：

```
技术开发协力 / Technical Support
千石まよひ / Sengoku Mayoi
```

「技术开发协力」这个头衔可以根据你的项目风格自由替换。

这是**请求而非义务**——Apache 2.0 已经授予了你全部权利，不署名也完全 OK。如果片尾不方便署名，**在 GitHub 上 star 一下**或**在 Issues 里留个言**同样欢迎。

完整说明见 [NOTICE](NOTICE) 文件。

## 许可

- **面板代码**（`js/`、`jsx/`、`css/`、`index.html`、`CSXS/`）：[Apache License 2.0](LICENSE)
- **`clipcam-extractor.exe`**：二进制专有（Proprietary, freeware），见上一节
- **第三方资源**（Adobe CEP SDK、Lucide 图标、Inter 字体）：详见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)
- **署名**（商业作品可选）：见 [NOTICE](NOTICE)