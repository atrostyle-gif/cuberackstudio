# V3 UI 再設計インベントリ

作成日: 2026-10-15
ステータス: **調査のみ（UI は未変更）。最終レイアウトは未決定。**
対象: 本番 `source/` 一般モード / STAFF モード、および参照用 `_REFERENCE_staff-source-2026-08/`

本資料は Ver3.0 で UI 全体を見直す前提の棚卸しである。
画面の最終配置・情報設計はユーザーと相談して決める。ここでは現状と改善の選択肢だけを列挙する。

---

## 0. 現状の骨格（両モード共通）

本番アプリは **左 3D ビュー + 右サイドパネル（固定幅 380px）** の 2 カラムである。

| 領域 | DOM | 実装 |
|------|-----|------|
| 3D キャンバス | `#view` | `js/core/scene.js`, `main.js`（ポインタ操作） |
| 右パネル | `#panel` | `index.html` の静的 HTML + `js/ui/ui.js` |
| 左フローティングバー | `.cr-leftbar`（JS 生成） | `main.js`（移動 / 回転 / クラスタ削除） |
| STAFF オーバーレイ | `#admin-menu-overlay` | `js/ui/admin-menu.js`, `js/ui/admin-menu.css` |
| 共同編集ホスト | `#staff-collab-host` | `js/ui/staff-collab-mode.js` |

`index.html` に `viewport` メタがなく、メイン CSS にブレークポイントもない。スマホでは右パネルが幅を占有したまま縦スクロールする想定で、**モバイル専用レイアウトはほぼ未実装**。

バージョン表示は `CubeRackStudio v1.0.0-internal` / `Ver 1.1.4` のまま（Ver3.0 未反映）。

---

## 1. 一般モードの UI 構成

### 1.1 画面構成

```
┌──────────────────────────────────────────────┬──────────────────┐
│ #view  3D                                    │ #panel 380px     │
│  - ヘルプ / 寸法 / カラーチャート オーバーレイ │  カードが縦積み   │
│  - 左下〜左に .cr-leftbar（移動・回転・削除）  │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

上部のグローバルツールバーは無い。ファイル・Undo・STAFF 入口はすべて右パネル内。

### 1.2 ツールバー相当（右パネル上部）

| UI | ID / 関数 | 役割 |
|----|-----------|------|
| 上書き保存 | `#save-design-btn` → `saveDesignOverwrite` (`file.js`) | File System Access API。非対応時はダウンロード |
| 名前を付けて保存 | `#save-as-design-btn` → `saveDesignAs` | 同上 |
| 開く | `#load-design-btn` → `openDesignFromFilePicker` | JSON 読み込み |
| Undo / Redo | `#undo-btn` `#redo-btn` + Ctrl+Z/Y | `history.js` |
| Reset All | `#reset-btn` | `main.js` で初期化 |
| グリッド | `#grid-toggle-btn` | `ui.js` `applyGridVisibility` |
| 操作ヘルプ | `#help-toggle-btn` | `#help-overlay` |
| 説明書 | `#help-page-btn` | `help.html` へ |
| STAFFモード | `#admin-menu-open-btn` | オーバーレイを開く（一般ユーザーにも常時表示） |

### 1.3 サイドパネル（設計操作）

上から順:

1. **タイトル** — ファイル名 + dirty マーク
2. **ファイル** — 保存 / 開く
3. **編集操作** — Undo/Redo/Reset + ユーティリティ行
4. **パーツ選択** — Beam/Pole トグル `#part-type-toggle`、長さ `#length-select`、オーダー `#order-mode-btn`
5. **材質** — `#material-select`、選択/全 Beam/全 Pole 適用
6. **JointSet 材質** — `#mat-jointSet`、適用 / 全適用
7. **接続モード** — `#connect-mode-btn`
8. **カラーチャート** — `#color-chart-toggle-btn`（3D 上の長さ色 + `#colorchart-overlay`）
9. **自動レイアウト** — `#open-auto-layout-tool` → `auto-layout.html`
10. **長さ変更** — `#length-mode-btn`、プリセット/オーダー、アンカー側、適用
11. **棚板・壁板** — `#board-mode-btn`、種類トグル、材質
12. **寸法 / 図面 / FIT** — `#dimension-open-btn`、`#btn-open-drawing`（条件付き enable）、`#btn-open-fit`
13. **背景写真** — アップロード、ON/OFF、床高さ/オフセット/スケール/横オフセット/影
14. **部材明細** — `#parts-table`、`#total`、見積へ送る `#send-estimate-btn`

### 1.4 3D 上の設計操作（パネル外）

| 操作 | 実装 |
|------|------|
| Joint クリックで Beam/Pole 追加 | `main.js` ポインタ処理 + `joints.js` / `connectors.js` |
| Alt+クリックで削除 | `deleteJoint` / `deleteConnectorByMesh` |
| Shift+クリックで脚 ON/OFF | `toggleLegForJoint` |
| 中ドラッグ回転・右ドラッグパン・ホイールズーム | OrbitControls (`js/core/scene.js`) |
| 移動モードでクラスタ移動 | `main.js` `setMoveMode` |
| クラスタ ±90° 回転・削除 | `rotateActiveCluster90`, クラスタ削除 |

### 1.5 価格・見積

| UI | 実装 |
|----|------|
| 部材明細テーブル | `js/features/estimate.js` `calcAndRenderEstimate` |
| 合計表示 `#total` | 同上。`requestEstimateRender` でデバウンス |
| 見積へ送る | `sendToEstimate` → `estimate.html` |
| 価格データ | `js/data/price-loader.js` + Supabase `price_catalog`、失敗時はローカル catalog |
| オーダー価格 | `js/app/order-pricing.js` |

一般モードでも見積は常時表示される。価格**変更** UI は STAFF 専用。

### 1.6 保存・読み込み

- 形式: Phase 1 時点は Flat JSON（`id/aId/bId/jointId` を併記）
- 入口: 右パネル 3 ボタンのみ。最近使ったファイル UI は `getRecentFiles` があるが、パネルに一覧は出していない
- 自動バックアップ: `autoBackup` が 10 分間隔（OPFS）。ユーザーからは見えない

### 1.7 モバイル

- `index.html` に viewport なし
- `#panel` 固定 380px、body は `overflow:hidden` の横 flex
- STAFF オーバーレイのみ `admin-menu.css` の `@media (max-width: 480px)` あり
- タッチ操作の専用ジェスチャは未確認（マウス前提のヘルプ文）

---

## 2. STAFF モードの UI 構成

一般モードと **同じキャンバス / 同じ右パネル** を使い、上にオーバーレイを重ねる。モード切替後も設計 UI は消えない。

### 2.1 モード切り替え

1. 右パネル「STAFFモード」→ `#admin-menu-overlay`
2. パスワード（`PRICING_CONFIG.adminPassword`、クライアント平文）
3. 成功で `sessionStorage cuberack_staff_mode_auth=1` と `cuberack:staff-mode-enabled`
4. ホーム: 在庫照合 / 同時編集・ToDo / 価格を変更 / 終了

実装: `js/ui/admin-menu.js` `initAdminMenu`, `tryLogin`, `isCubeRackStaffMode`

### 2.2 STAFF 専用機能

| 機能 | UI | 実装 | 備考 |
|------|-----|------|------|
| 在庫照合 | `#admin-menu-stock-wrap` 内に `#stock-reconcile-card` を内包 | `js/features/stock-reconcile.js` | オーバーレイ内なのに、カード自体にもパスワードゲートがある（二重） |
| 同時編集・ToDo | `#staff-collab-wrap` / `#staff-collab-host` | `staff-collab-mode.js` | Firebase ログイン（スタッフ選択 + パスワード）。500ms スナップショット同期 |
| 価格変更 | リンク → `admin-pricing-9fd83.html` | 別ページ。再度ログイン | アプリ本体から離脱する |

### 2.3 共同編集 UI（現行）

ログイン後ホスト内に描画:

- 参加中スタッフ名、共同編集を終了
- オンライン一覧（presence 名の連結テキストのみ）
- ToDo リスト（チェック + 追加）。削除 UI は薄い

無いもの（旧 STAFF にはあった）:

- 画面上の collab トップバー（誰がオンラインか常時表示）
- リモートカーソル
- ソフトロック警告（「他の人がこの Beam を編集中」）
- プロジェクト名 / projectId の表示
- 最小化・ドラッグ可能なフローティングバー

### 2.4 在庫照合 UI の重複

- STAFF ホームから「在庫照合」
- その中の `#stock-reconcile-open-btn` が再度パスワードを要求しうる
- カード HTML が `index.html` の STAFF オーバーレイ内にネストされているため、一般パネルからは見えないが DOM 上は常駐

---

## 3. 重複・未使用・別ページ

### 3.1 重複している UI

| 内容 | 詳細 |
|------|------|
| パスワードゲート | STAFF オーバーレイと在庫照合カードで二重 |
| カラーチャート | パネルのトグル（3D 色分け）と `#colorchart-overlay` 表が別系統 |
| 長さ指定 | パーツ選択のプリセット/オーダーと、長さ変更カードのプリセット/オーダーが別 UI |
| 材質適用 | Beam/Pole 用と JointSet 用が並ぶ（必要だが説明が少ない） |
| ヘルプ | 操作ヘルプ オーバーレイと「説明書」`help.html` |
| バックアップ HTML | `auto-layout.BACKUP.html` など本番導線からは未使用 |

### 3.2 使われ方が弱い / 隠れている UI

| 内容 | 詳細 |
|------|------|
| 図面を開く | 条件を満たすまで `disabled`（`main.js`） |
| 最近使ったファイル | 保存はするが、開く UI が無い |
| `.cr-leftbar` | 3D 内フローティング。右パネルの編集操作と役割が分かれており、発見しづらい |
| 接地リング表示 | パネル内ラベルあり。背景/フィット系と隣接 |
| `auto-layout.BACKUP.html` / `autolayout.BACKUP.js` | 参照残骸 |

### 3.3 別 HTML（アプリから飛ぶ）

| ページ | 役割 |
|--------|------|
| `auto-layout.html` | 自動レイアウトツール |
| `estimate.html` | 見積書 |
| `drawing.html` | 図面 |
| `height-editor.html` | 高さ編集（自動レイアウト系） |
| `admin-pricing-9fd83.html` | 価格マスタ |
| `help.html` | 説明書 |

Ver3.0 で「同じアプリに統合する」対象は、少なくとも自動レイアウト・見積・価格・共同編集・在庫である。図面/FIT は残すか別ツールか要相談。

---

## 4. 旧 STAFF 版から移植すべき UI

参照: `_REFERENCE_staff-source-2026-08/index.html`, `staff-collab.js`, `main.js`

優先度は「統合後の STAFF 作業を成立させるもの」順。レイアウト位置は未決定。

| 優先 | 機能 | 旧版の所在 | 現行 | 移植時の注意 |
|------|------|-----------|------|-------------|
| P0 | 共同編集ステータスバー（誰がオンライン / 最終保存） | `#collab-topbar`（ドラッグ・最小化可） | オーバーレイ内テキストのみ | 3D を隠さず常時見える場所が必要 |
| P0 | スタッフログイン状態の常時表示 | `#collab-current-user`, `#logout-btn` | オーバーレイを開かないと分からない | 一般モードと見た目を分ける |
| P0 | ToDo パネル（3D 横 or フローティング） | `main.js` 左バー ToDo ボタン + staff-collab パネル | STAFF メニュー奥 | 設計しながら ToDo を見られること |
| P1 | オンライン presence の個別表示 | `#collab-online-users` | 名前の連結のみ | 色付きドット等 |
| P1 | ソフトロック警告 | `__staffSoftLockWarnIfConflict` | 無し | Phase 4 の第 1 層 |
| P1 | 編集ターゲットの共有 | `__staffPresenceSetEditingTarget` | 無し | Phase 4 |
| P2 | リモートカーソル | 旧 collab | 無し | 実装コスト高。要相談 |
| P2 | スタッフ人数バッジ | `#staff-count` | 無し | トップバーに統合可 |
| P2 | ログインゲート（アプリ全体） | 旧は STAFF 専用ビルド | 現行は一般+STAFF 同居 | Ver3.0 は同居が前提なので全面ゲートは使わない |
| — | ops ベース同期そのもの | `staff-collab.js` | 500ms LWW | UI ではなく Phase 4 の同期。UI だけ先に持ってこない |

移植しない / 後回し:

- 旧 STAFF 専用ビルドの「未ログインなら collab UI を隠す」CSS（`body:not(.staff-authenticated)`）は、一般ユーザー向けアプリではそのまま使えない
- `src/main.js` の別系統 collab プロトタイプ（`presence-card`）は現行 Vanilla アプリと二重実装なので移植しない

---

## 5. ファイルと関数（UI 処理マップ）

| ファイル | UI 責務 |
|----------|---------|
| `index.html` | 右パネル・オーバーレイのマークアップ、メイン CSS |
| `js/ui/ui.js` | グリッド、Beam/Pole トグル、長さ、オーダー、カラーチャート初期化 |
| `js/ui/admin-menu.js` | STAFF オーバーレイ開閉・ログイン・在庫/共同編集画面切替 |
| `js/ui/admin-menu.css` | オーバーレイ見た目、狭い幅の微調整のみ |
| `js/ui/staff-collab-mode.js` | 共同編集ログイン UI、presence テキスト、ToDo、500ms 同期 |
| `js/features/file.js` | 保存/開くボタン、タブタイトル |
| `js/features/history.js` | Undo/Redo ボタンとショートカット |
| `js/features/estimate.js` | 部材明細・合計 |
| `js/features/display.js` | 寸法オーバーレイ、表示系 |
| `js/features/autolayout.js` | 自動レイアウト（別 HTML と連携） |
| `js/features/stock-reconcile.js` | 在庫照合 UI |
| `js/parts/boards.js` | 棚板・壁板モード |
| `main.js` | ポインタ、長さ変更カード、左バー、クラスタ、図面ボタン enable、Reset |
| `js/app/drawing.js` / `drawing.html` | 図面 |
| `estimate.html` | 見積書ページ |
| `admin-pricing-9fd83.html` | 価格管理ページ |

---

## 6. Ver3.0 改善提案（レイアウト未決定）

以下は相談用の方向性であり、配置の確定ではない。

### 6.1 情報設計

1. **一般と STAFF を 1 アプリのまま、役割でシェルを分ける**  
   キャンバスは共有。STAFF だけが追加レール（バー / ドロワー / モーダル）を持つ。
2. **右パネルの縦長カード山をグループ化する**  
   候補: 「ファイルと履歴」「作る」「直す」「板」「出力（寸法/図面/見積）」。タブかアコーディオンかは未決定。
3. **3D 操作とパネル操作の発見性を揃える**  
   左フローティングバー（移動・回転・削除）を、一般ユーザーが最初に見つける場所へ寄せるか、パネル側と重複表示するかを相談する。
4. **見積は常時フルテーブルか、サマリー+詳細か**  
   現状はパネル下部にフルテーブル。設計中は合計だけ、確定後に明細、という案もある。
5. **別 HTML を段階的にアプリ内へ**  
   優先候補: 自動レイアウト、価格、共同編集、在庫。見積書・図面は印刷向けのため別ビューのままでもよい。

### 6.2 STAFF 統合

1. ログイン後はキャンバスを見ながら共同編集状態が分かる（旧 `#collab-topbar` 相当）
2. ToDo はメニューの奥ではなく、設計画面から 1 アクション
3. 在庫照合の二重パスワードをやめる（STAFF セッションに乗せる）
4. 価格変更を別ドメイン感のページから、STAFF シェル内のビューへ（認証は Phase 5 の Netlify Function 案と同時）

### 6.3 モバイル

1. viewport を入れる
2. 右パネルをドロワー化するか、下シートにするか（未決定）
3. タッチ用の選択・削除・パン（現状ヘルプはマウス）

### 6.4 やらないこと（今回）

- 画面レイアウトの最終決定
- コンポーネント実装
- 色・フォントの刷新を先行させること（情報設計が先）

---

## 7. 次の相談ポイント（ユーザー向け）

1. 一般ユーザーの第一画面に何を残すか（作る / 見積 / 保存）
2. STAFF の常時表示は「細いトップバー」か「右パネルの STAFF タブ」か
3. 自動レイアウトと見積をアプリ内に埋め込むか、今どおり別ページか
4. モバイルを Ver3.0 の必須にするか、デスクトップ優先のままか
5. 旧 STAFF のリモートカーソルまで必要か、オンライン名とソフトロック警告で足りるか

回答が出るまで UI 実装には入らない。
