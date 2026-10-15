# V3 UI 機能マトリクス

作成日: 2026-10-15
対象: 本番 `source/`（現行 UI）
ステータス: **調査のみ。機能の廃止はしない。**

本資料は現行 UI の全機能を、要素・ハンドラ・状態・依存関係で一覧化する。
Ver3.0 再設計ではここに列挙した機能を**捨てずに移行先を決める**。

関連: `docs/V3_UI_REDESIGN_INVENTORY.md`

---

## 0. 凡例

| 列 | 意味 |
|----|------|
| 公開 | `一般` = 未ログインでも使える / `STAFF` = 認証後のみ（現行はクライアント判定） / `両方` |
| 状態 | 主な `window` / 配列 |
| リスク | UI 差し替え時に壊れやすい点 |

エンジン層（Three.js シーン、`joints/beams/poles/legs`、見積計算、保存 JSON、安定 ID）は **再利用前提** で、DOM の置き場だけ変える。

---

## 1. Joint / Beam / Pole / Leg

| 機能 | 公開 | UI 要素 | イベント | 状態 | 実装 | 依存 | 新UI移行先（案） |
|------|------|---------|----------|------|------|------|------------------|
| Joint 追加 | 一般 | 3D クリック（選択 Joint から長さ方向） | `main.js` pointer | `joints`, `jointMeshes`, `selectedJointIndex`, `currentLengthMm` | `createJoint` (`joints.js`) | `addLegIfNeeded`, プレビュー, 見積 | 中央 3D + 左ツール「追加」 |
| Joint 選択 | 一般 | 3D クリック | `setSelectedJoint` | `selectedJointIndex` | `joints.js` | 材質ハイライト | 3D + 右「選択」 |
| Joint 削除 | 一般 | Alt+クリック | `deleteJoint` | 上記配列の splice | `joints.js` | Beam/Pole/Leg 連動削除, `requestEstimateRender`, Undo | 左ツール「削除」+ 右詳細 |
| Beam 追加 | 一般 | Joint クリック / 接続モード | `addBeamConnection` | `beams`, `currentPartType=beam` | `connectors.js` | `hasBeamBetween`, 材質, オーダー長 | 左ツール Beam |
| Pole 追加 | 一般 | 同上 | `addPoleConnection` | `poles` | `connectors.js` | 同上 | 左ツール Pole |
| Beam/Pole 削除 | 一般 | Alt+クリック | `deleteConnectorByMesh` | `beams`/`poles` | `connectors.js` | `saveHistory`（削除後） | 左ツール削除 |
| 接続モード | 一般 | `#connect-mode-btn` | `setConnectMode` | `isConnectModeOn`, `connectFromJointIndex` | `ui.js` + `main.js` | 斜め禁止 | 左ツール |
| 脚 自動 | 一般 | Joint 生成時 | `addLegIfNeeded` | `legs`, 底面判定 | `legs.js` | `isBottomJoint` | エンジン内部（UI は「脚」表示のみ） |
| 脚 ON/OFF | 一般 | Shift+クリック | `toggleLegForJoint` | `legs`, `manualLegJointSet` | `legs.js` | `saveHistory` | 右プロパティ |
| プレビュー | 一般 | マウス移動 | `previewJoint` 等 | `previewTargetPos` | `main.js` + `state.js` | 長さプリセット | 3D 上（維持） |

安定 ID（`id/aId/bId/jointId`）は Phase 1 で配列に載っている。UI 再設計では**表示しなくてもエンジンは ID を保持**する。

---

## 2. 選択・移動・回転

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 新UI移行先 |
|------|------|----|----------|------|------|-----------|
| 移動モード | 一般 | `.cr-leftbar` 移動ボタン | `setMoveMode` | `isMoveModeOn` | `main.js` | 左ツールバー |
| クラスタ移動 | 一般 | 移動 ON 時ドラッグ | pointer | `jointClusters` | `main.js` | 3D |
| 回転 ±90° | 一般 | 左バー回転ボタン | `rotateActiveCluster90` | アクティブクラスタ | `main.js` | 左ツール |
| クラスタ削除 | 一般 | 左バー削除 | クラスタ単位削除 | 同上 | `main.js` | 左ツール（確認ダイアログ推奨） |
| Orbit 回転/パン/ズーム | 一般 | 中ドラッグ/右ドラッグ/ホイール | OrbitControls | camera | `scene.js` | 3D（維持） |
| Reset All | 一般 | `#reset-btn` | `main.js` | 全配列クリア | 原点 Joint 再生成 | 上部「プロジェクト」 |

---

## 3. 材質・寸法変更

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 新UI移行先 |
|------|------|----|----------|------|------|-----------|
| 追加長さプリセット | 一般 | `#length-select` | change → `currentLengthMm` | `BEAM_LENGTH_OPTIONS` 等 | `ui.js` | 左ツール or 右「追加設定」 |
| オーダー長さ | 一般 | `#order-mode-btn`, `#order-length-input` | `setOrderMode` | `isOrderModeOn`, `currentOrderLengthMm` | `ui.js` | 右「長さ」 |
| 長さ変更モード | 一般 | `#length-mode-btn`, `#apply-len-btn`, `#len-preset`, `#anchor-side` | `main.js` | `isLengthEditModeOn`, `selectedConnector` | `main.js` | 右プロパティ（選択時のみ） |
| Beam/Pole 材質 | 一般 | `#material-select`, `#mat-apply-selected/all-beam/all-pole` | `main.js` | `material` 各要素 | `materials.js` | 右「材質」 |
| JointSet 材質 | 一般 | `#mat-jointSet`, `#mat-apply-jointSet`, `#mat-apply-all-jointSet` | `main.js` | Joint/脚 | 同上 | 右「材質」 |
| 棚板・壁板 | 一般 | `#board-mode-btn`, `#board-kind-toggle`, `#board-material` | `boards.js` | `shelves`, `panels` | `boards.js` | 左ツール「板」+ 右詳細 |
| 寸法表示 | 一般 | `#dimension-open-btn`, `#dimension-overlay` | `ui.js` / `display.js` | 外寸・芯々 | `dimension-utils.js` | 右「寸法」（常時サマリー可） |
| グリッド | 一般 | `#grid-toggle-btn` | `applyGridVisibility` | `gridEnabled` | `ui.js` | 3D オーバーレイ or 表示メニュー |
| カラーチャート | 一般 | `#color-chart-toggle-btn`, `#colorchart-overlay` | `toggleColorChart` | `isColorChartOn` | `display.js` | 表示メニュー |
| 背景写真 / FIT | 一般 | `#background-photo-*`, `#btn-open-fit` | `display.js`, `main.js` | 背景メッシュ | `display.js` | 表示メニュー（折りたたみ） |
| 図面 | 一般 | `#btn-open-drawing`（条件付き enable） | `main.js` | — | `drawing.html` | 上部「出力」 |

---

## 4. 見積と価格表示

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 新UI移行先 |
|------|------|----|----------|------|------|-----------|
| 部材明細 | 一般 | `#parts-table` | `calcAndRenderEstimate` | joints/beams/poles/legs/shelves | `estimate.js` | 右「見積」折りたたみ |
| 合計 | 一般 | `#total` | `requestEstimateRender` | デバウンス `__estTimer` | `estimate.js` | 右下部常時 |
| 見積へ送る | 一般 | `#send-estimate-btn` | `sendToEstimate` | payload | `estimate.js` → `estimate.html` | 上部「出力」または右フッター |
| 価格読込 | 一般 | なし（起動時） | `price-loader.js` | catalog | Supabase `price_catalog` | エンジン維持 |
| オーダー価格 | 一般 | 明細内 | `order-pricing.js` | customLength | 同上 | 右見積 |

価格**変更**は STAFF 専用（§8）。計算ロジックは触らない。

---

## 5. Undo / Redo

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | リスク |
|------|------|----|----------|------|------|--------|
| 保存 | 一般 | 各操作内 | `saveHistory` | `history[]`, `historyIndex` | `history.js` | 変更前保存と変更後保存が混在。初回 Undo が効きにくい |
| Undo | 一般 | `#undo-btn`, Ctrl+Z | `undo` / `loadHistory` | 同上 | `applySnapshotFromString` | 履歴はスナップショット全体。ID は Phase 1 で往復可能 |
| Redo | 一般 | `#redo-btn`, Ctrl+Y | `redo` | 同上 | 同上 | 同上 |

新 UI では上部コマンドバーへ移す。ロジックは `history.js` を維持し、後続フェーズで「操作後に必ず saveHistory」を揃えるのが安全。

---

## 6. 保存・開く

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 新UI移行先 |
|------|------|----|----------|------|------|-----------|
| 上書き保存 | 一般 | `#save-design-btn` | `saveDesignOverwrite` | `currentFileHandle`, `isDirty` | `file.js` | 上部 |
| 名前を付けて保存 | 一般 | `#save-as-design-btn` | `saveDesignAs` | `currentFileName` | `file.js` | 上部 |
| 開く | 一般 | `#load-design-btn` | `openDesignFromFilePicker` | 履歴リセット | `file.js` | 上部 |
| タイトル | 一般 | `#page-title`, `document.title` | `updateTabTitle` | dirty `*` | `file.js` | 上部プロジェクト名 |
| 自動バックアップ | 一般 | 非表示 | `autoBackup` 10 分 | OPFS | `file.js` | 維持（設定に出すかは相談） |
| MRU | 一般 | **UI なし** | `addToRecentFiles` | localStorage `MRU_KEY` | `file.js` | 上部「最近」メニューに出す候補 |

保存形式（Flat JSON + 安定 ID）は **Phase 2 のファイルラップとは別件**。本 UI フェーズでは形式を変えない。

共同編集は「先に名前を付けて保存」が必要（`staff-collab-mode.js` `roomId()`）。

---

## 7. 自動レイアウト

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 新UI移行先 |
|------|------|----|----------|------|------|-----------|
| ツールを開く | 一般 | `#open-auto-layout-tool` | `autolayout.js` | 別ウィンドウ | `auto-layout.html` | 左ツール「自動配置」→ 将来はアプリ内パネル |
| 高さ編集 | 一般 | `#open-height-editor-btn`（旧UI残） | `ui.js` | `height-editor.html` | 同上 | 自動配置ワークフロー内 |
| 生成結果の反映 | 一般 | なし | `rebuildSceneFromData` | `cellStageData` | `autolayout.js` + `file.js` | エンジン維持 |

`auto-layout.BACKUP.html` は導線なし。廃止ではなく「残骸」として移行計画で整理候補にする（削除はユーザー承認後）。

---

## 8. STAFF ログイン・価格・在庫・共同編集・ToDo

| 機能 | 公開 | UI | ハンドラ | 状態 | 実装 | 権限（現行 / あるべき姿） |
|------|------|----|----------|------|------|--------------------------|
| STAFF 入口 | 両方見える | `#admin-menu-open-btn` | `openOverlay` | — | `admin-menu.js` | 現行: 誰でもボタンが見える。新UI: ログイン導線のみ一般、中身は STAFF |
| パスワードログイン | STAFF | `#admin-menu-password`, `#admin-menu-login-btn` | `tryLogin` | `sessionStorage cuberack_staff_mode_auth` | 平文 `PRICING_CONFIG.adminPassword` | 現行: クライアントのみ。あるべき: Firebase Auth + サーバー allowlist（Phase 5） |
| ログアウト | STAFF | `#admin-menu-logout-btn` | `closeStaffCollaboration` | sessionStorage 削除 | `admin-menu.js` | 上部ステータス |
| 在庫照合 | STAFF | `#admin-menu-stock-*`, `#stock-reconcile-*` | `stock-reconcile.js` | CSV, 照合結果 | 二重パスワードあり | サーバー不要（ローカル CSV）だが STAFF 表示のみ |
| 価格変更 | STAFF | リンク `admin-pricing-9fd83.html` | 別ページ再ログイン | Supabase RPC + 平文パスワード | **書込はサーバー必須**（Phase 5 Netlify Function） |
| 共同編集ログイン | STAFF | `#staff-collab-host` スタッフ選択 | Firebase `signInWithEmailAndPassword` | `state.user`, `room` | `staff-collab-mode.js` | Firestore rules（Phase 3）+ UI は認証後のみ |
| 500ms 同期 | STAFF | なし | `snapshotTimer` | `projects/{room}` merge | 同 | Phase 4 で ops に置換。UI 再設計では同期方式を変えない |
| presence | STAFF | `#staff-presence` | onSnapshot | presence サブコレ | 同 | 上部 STAFF バーへ |
| ToDo 追加/完了 | STAFF | `#staff-todo-*` | `addTodo`, checkbox | `todos` サブコレ | 同 | STAFF ワークスペース。削除 UI は現行薄い |

STAFF 専用機能を消さない。新 UI では **表示はクライアントで隠す + 書込はサーバーで拒否** の二段にする。

---

## 9. その他（廃止しない補助機能）

| 機能 | 公開 | 移行先 |
|------|------|--------|
| 操作ヘルプ | 一般 | 上部「ヘルプ」 |
| 説明書 `help.html` | 一般 | 同上 |
| 接地リング | 一般 | 表示メニュー |
| 製作数（見積） | 一般 | 右見積 |

---

## 10. 現行で UI が弱いが機能としては残すもの

- 最近使ったファイル（データはある）
- 図面ボタン（条件付き disable）
- ToDo 削除
- 共同編集の常時ステータス
- ソフトロック・リモートカーソル（エンジン未移植、Phase 4）

これらは「廃止」ではなく「新 UI で発見しやすくする」。
