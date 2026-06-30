<p align="center">
  <img src="img/clipcam_ae_logo.svg" alt="ClipCam for AE" width="540">
</p>

<p align="center">
  <strong>Clip Studio Paint のカメラを After Effects へ持ち込む CEP パネル</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/After%20Effects-2020%2B-9999FF?logo=adobeaftereffects&logoColor=white" alt="AE">
  <img src="https://img.shields.io/badge/Clip%20Studio%20Paint-.clip-FF6B9D" alt="CSP">
  <img src="https://img.shields.io/badge/CEP-panel-4A154B" alt="CEP">
</p>

---

> 🇨🇳 [中文](README.md) · 🇺🇸 [English](README.en.md)

> 🧪 **パブリックベータ (Public Beta) — v1.0.1-beta**
>
> これは ClipCam-AE の公開ベータ版です。コア機能は実装済みで内部検証も済んでいますが、様々な実プロジェクトでの大規模な検証はまだ行われていません。**動作環境は Windows + After Effects 2020 以降のみです。** このリリースの目的は、早期のフィードバックや実運用環境での不具合報告を集めることです——問題が発生した場合は [Issues](https://github.com/ChenxingM/ClipCam-AE/issues) までご報告いただけると助かります。十分なフィードバックが集まり次第、安定版を公開します。

## 機能

- `.clip` ファイル、または中間形式の `.clipcam` を直接読み込み
- 複数カメラ対応（自動検出してドロップダウン表示）
- レイヤートランスフォームのインポート（CSP レイヤー名と AE レイヤー名を自動マッチ）
- ベジェハンドル操作に対応したインタラクティブなカーブエディター
- 2 つのインポートモード：**Camera Frame** / **LO Comp Layer**
- キーフレーム補間タイプを保持（Smooth / Linear / Hold）

> 📦 **`.clipcam` フォーマットについて**
>
> Clip Studio Paint は現在、**カメラやレイヤーのトランスフォームといった生データをエクスポートする手段を提供していません**——出力できるのは完成した動画、連番画像、タイムシートデータのみで、いずれもカメラカーブを直接復元できる生のアニメーションデータではありません。CSP 内部のキーフレームとカーブをそのまま After Effects へ持ち込むために、本プロジェクトは `.clipcam` バイナリ中間フォーマットを定義しています。
>
> - **`.clipcam` フォーマット仕様**は完全に公開：[docs/clipcam-format.md](docs/clipcam-format.md)
> - **`.clipcam` パーサー**（`js/clipcam.js`）はパネルと共に Apache 2.0 で公開
> - **`.clip → .clipcam` エクスポーター**は現時点ではクローズドソースの `bin/clipcam-extractor.exe` が唯一（メンテナンスは自分、無料で利用可、リバースエンジニアリング禁止）
>
> `clipcam-extractor` は私がメンテナンスしているクローズドソースの `.clip` ファイルパーサーです。**CSP の `.clip` フォーマット自体に公開仕様が存在しない**ため、私自身で `.clip` ファイル構造のリバースエンジニアリングを行いました。`.clip` フォーマットに関するリバースエンジニアリング資料はまだ下書き段階にとどまっており、現時点では非公開です。いずれ整理してから公開するかもしれません。
>
> 一方、 `.clipcam` 自体は完全にオープンです：仕様に基づいて独自の `.clipcam` リーダーを実装したり、CSP 以外のデータソースから `.clipcam` ファイルを生成したりすることは自由で、本パネルはそれらを読み込めます。

## デモ動画

使い方を紹介する動画を制作中です。公開後、こちらにリンクを追加します。

## インストール

### 方法 A：`.zxp` インストーラー（一般ユーザー推奨）

1. [Releases](https://github.com/ChenxingM/ClipCam-AE/releases) から最新の `ClipCam-AE-v*.zxp` をダウンロード
2. [aescripts ZXP Installer](https://aescripts.com/learn/zxp-installer/) をインストール
3. ZXP Installer を開いて `.zxp` をウィンドウにドラッグ → 完了を待つ
4. After Effects を再起動 → **ウィンドウ** → **拡張機能** → **ClipCamAE**

### 方法 B：ポータブル版（開発者・改造したい方向け）

1. [Releases](https://github.com/ChenxingM/ClipCam-AE/releases) から `ClipCam-AE-v*.zip` をダウンロードし、以下の場所に展開：
   ```
   C:\Users\<ユーザー名>\AppData\Roaming\Adobe\CEP\extensions\ClipCam-AE
   ```
2. 未署名拡張機能の有効化（開発者モード）——レジストリ `HKCU\SOFTWARE\Adobe\CSXS.11` に文字列値 `PlayerDebugMode = 1` を追加
   （リポジトリ内の `deploy.ps1` を実行すれば自動で設定されます）
3. After Effects を再起動 → **ウィンドウ** → **拡張機能** → **ClipCamAE**

### ソースから実行

```powershell
git clone https://github.com/ChenxingM/ClipCam-AE.git
cd ClipCam-AE
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

`deploy.ps1` は GitHub Releases から `clipcam-extractor.exe` を自動取得し（下の `bin/` セクション参照）、CEP extensions ディレクトリへのジャンクションを作成します。

## 使い方

### Camera タブ

1. `.clip` または `.clipcam` ファイルをパネルにドラッグ（または **Open** ボタン）
2. `.clip` ファイルは内蔵ツールで自動的にカメラデータが抽出されます
3. 複数カメラを含むファイルは上部にドロップダウンが表示されます
4. カーブエディターでキーフレームをプレビュー・調整
5. インポートモードとターゲットレイヤーを選択して **Apply** をクリック

### Layer タブ

1. レイヤートランスフォームデータを含むファイルを読み込む
2. **Refresh** をクリックして現在の AE コンポジションのレイヤー一覧を取得
3. パネルが CSP → AE のレイヤー名を自動マッチングします
4. 必要に応じてマッチング関係を手動で調整（ドロップダウン）
5. **Apply All** をクリックして一致した全レイヤーを一括書き込み、または各行右側の **Apply** で個別に書き込み

> ⚠️ **Scale を片軸だけインポートする場合の制限**
>
> AE の Scale は 2 次元プロパティで、軸ごとに分離できません。片方の軸だけをインポートする場合（例：`Scale Y` を外して `Scale X` のみにチェック）、もう一方の軸は対象レイヤーのインポート時点の現在の Scale 値（AE が初期値として読み取る値）に固定されます——その軸に既存のキーフレームアニメーションがあっても、この定数に平坦化されます。Y 軸のアニメーションをそのまま残したい場合は、両軸を一緒にインポートしてください。

### インポートモード

一般的な 2D アニメーションのコンポジション構造は、上位の **カメラコンポ（Camera Comp）** の中に **レイアウトプリコンポ（Layout / LO）** を入れ子にした形になります：

```
Camera                ← カメラコンポ
 └─ Layout (LO)       ← LO プリコンポ。このレイヤーのトランスフォームでカメラワークをつける
     ├─ Frame         ← カメラフレーム。プロジェクトによっては、カメラ台エクスプレッションを使い カメラコンポ側のカメラワークに反映させる運用もある
     ├─ C
     ├─ B
     └─ A
```

現在 2 つの適用モードが実装されており、それぞれ異なるワークフローに対応しています：

| モード | 操作する場所 | 対象 | データの方向 |
|--------|------------|------|-------------|
| **Camera Frame（カメラフレーム）** | **LO コンポ** の内部 | カメラフレームレイヤーの 位置 / スケール / 回転 | CSP データと 1:1 |
| **LO Comp Layer（LOコンポ）** | **Camera コンポ** の内部 | LO プリコンポレイヤーのトランスフォーム | 反転（カメラが右に動く → LO レイヤーが左に動く） |

- **Camera Frame**——カメラフレームレイヤーは LO コンポ内に存在し、CSP のカメラデータをそのままこのレイヤーに焼き付けます。
- **LO Comp Layer**——外層のカメラレイヤーは動かさず、**反転**したトランスフォームを LO プリコンポレイヤーに書き込みます。見た目はカメラの動きと等価です。カメラ台エクスプレッション使用の場合はこちら。

### LO Size

座標変換に使います。**CSP** をクリックすると `.clip` ファイルのキャンバスサイズが、**Comp** をクリックすると現在のコンポジションのサイズが自動入力されます。

## カーブエディター

| 操作 | 機能 |
|------|------|
| キーフレームをドラッグ | フレーム位置と値を移動 |
| ハンドルをドラッグ | 傾きとウェイトを調整（ベジェ制御点） |
| キーフレームを右クリック | 補間タイプを切り替え（Smooth / Linear / Hold） |
| ホイール | ズーム |
| Alt+ドラッグ / 中クリックドラッグ | ビューのパン |
| ダブルクリック | ビューを自動フィット |
| Ctrl+Z | 元に戻す |

## プロジェクト構成

```
ClipCam-AE/
├── bin/
│   ├── extractor.lock.json      # extractor のバージョン + SHA256 + ダウンロード URL
│   ├── fetch-extractor.ps1      # lock ファイルに従って extractor を取得＋検証
│   └── clipcam-extractor.exe    # オンデマンドで取得（リポジトリには含まれません）。クローズドソースのバイナリ
├── css/
│   └── style.css
├── js/
│   ├── CSInterface.js           # Adobe CEP SDK
│   ├── clipcam.js               # .clipcam パーサー
│   ├── curve-canvas.js          # カーブエディター
│   └── main.js                  # メイン UI ロジック
├── jsx/
│   └── hostscript.jsx           # AE ExtendScript
├── CSXS/
│   └── manifest.xml             # CEP 拡張機能マニフェスト
├── docs/
│   └── clipcam-format.md        # .clipcam バイナリフォーマット仕様
├── deploy.ps1                   # ローカル開発用デプロイスクリプト（CEP ジャンクション作成）
├── build.ps1                    # リリース用パッケージングスクリプト（.zip / .zxp を生成）
└── index.html
```

## 動作環境

- After Effects 2020 (17.0) 以降
- Windows（macOS は現時点で未対応）

## `clipcam-extractor.exe` について

本プロジェクトは `.clip` ファイルからカメラ＋レイヤートランスフォームデータを抽出し `.clipcam` 形式に変換するためのコンパイル済みバイナリ `clipcam-extractor.exe` に依存しています。

**このバイナリは Git リポジトリに含まれていません。** 別途クローズドソースな Rust プロジェクトでビルドされ、GitHub Releases に独立したアセットとして公開されます。リポジトリには、バージョン固定ファイル `bin/extractor.lock.json` と取得スクリプト `bin/fetch-extractor.ps1` のみが置かれています。

**開発者向けワークフロー**：

```powershell
# 初回クローン後は deploy.ps1 を実行（自動取得されます）、または手動で：
powershell -ExecutionPolicy Bypass -File bin/fetch-extractor.ps1
```

スクリプトは `bin/extractor.lock.json` を読み、バイナリをダウンロードし、SHA-256 を検証します。失敗時はテンポラリファイルをクリーンアップします。

**現在固定されているバージョン**（`bin/extractor.lock.json` より）：

| 項目 | 値 |
|---|---|
| バージョン | v1.0.1 |
| プラットフォーム | Windows x86-64 (PE32+) |
| サイズ | 1,327,104 bytes |
| SHA-256 | `6DD323E24A1A260FFADC4922B8927C7D4D59457BD73D81C5C264E4E935D6DF42` |

**使用条件**：

- 個人・商用問わず無料で利用可
- 本パネルの依存バイナリとしての再配布のみ可
- リバースエンジニアリング・逆アセンブル・逆コンパイルは禁止
- 無保証（AS-IS）

問題や他プラットフォーム対応のリクエストは [Issues](https://github.com/ChenxingM/ClipCam-AE/issues) からお願いします。

## 利用とクレジット

本リポジトリのパネルコードは永久に無料・オープンソースで、今後いかなる形でも有料化することはありません。

> 🇨🇳 [中文](README.md) · 🇺🇸 [English](README.en.md)

本ツールは Apache License 2.0 で公開しています。映像制作（アニメ・ドラマ・MV・CM・ゲーム CG 等の商業作品）を含むすべての用途において、**特に制限はありません**。

作品のクレジットに名前を入れてもらえると非常に嬉しいです：

```
技術開発協力 / Technical Support
千石まよひ / Sengoku Mayoi
```

「技術開発協力」の肩書は、プロジェクトに合うものであれば自由に変更していただいて構いません。

これは**お願いであって義務ではありません**——Apache 2.0 によりすでにすべての権利が付与されているので、クレジットなしでもまったく問題ありません。入れるのが難しい場合は、**GitHub のスター**や **Issues** でひとこと教えてもらえるだけでも十分ありがたいです。

詳細は [NOTICE](NOTICE) ファイルをご覧ください。

## ライセンス

- **パネルコード**（`js/`、`jsx/`、`css/`、`index.html`、`CSXS/`）：[Apache License 2.0](LICENSE)
- **`clipcam-extractor.exe`**：プロプライエタリ・フリーウェア（上記の節参照）
- **サードパーティアセット**（Adobe CEP SDK、Lucide アイコン、Inter フォント）：[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) を参照
- **クレジット**（商業作品向け、任意）：[NOTICE](NOTICE) を参照
