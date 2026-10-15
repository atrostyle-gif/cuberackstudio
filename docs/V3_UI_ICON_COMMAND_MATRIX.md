# V3 アイコン / コマンド マトリクス

作成日: 2026-10-15
対象: `V3_UI_FEATURE_MATRIX.md` の全機能
権限: `一般` = 未ログイン可 / `STAFF` = 認証後表示。STAFF の書込はサーバーでも拒否する（UI 非表示だけでは権限にしない）

凡例:

- 位置: `NORTH` / `WEST` / `CENTER`（3D ジェスチャ） / `POP`（ポップアップ） / `CHIP`（常時極小） / `hidden`（エンジンのみ）
- 3D: そのコマンド中のキャンバスの意味

---

## A. NORTH（上部コンパクトバー）

| アイコン名 | グループ | 位置 | ポップアップ入力 | 確定 | キャンセル | 既存関数 / ID | 権限 | 3D |
|------------|----------|------|------------------|------|------------|---------------|------|----|
| （テキスト）プロジェクト名 | ファイル | NORTH | なし。dirty `*` | — | — | `updateTabTitle`, `#page-title` | 一般 | なし |
| 開く | ファイル | NORTH | 最近ファイル一覧（任意）+ ファイルピッカーへ | ピッカー開始 `openDesignFromFilePicker` | 閉じるだけ | `#load-design-btn` | 一般 | 読み込み後に再描画 |
| 保存 | ファイル | NORTH | なし（上書き）。未保存なら保存 As と同じ | `saveDesignOverwrite` | — | `#save-design-btn` | 一般 | なし |
| 名前を付けて保存 | ファイル | NORTH | なし（ネイティブダイアログ） | `saveDesignAs` | ダイアログ中断 | `#save-as-design-btn` | 一般 | なし |
| Undo | 履歴 | NORTH | なし | 即時 `undo` | — | `#undo-btn` | 一般 | スナップショット復元 |
| Redo | 履歴 | NORTH | なし | 即時 `redo` | — | `#redo-btn` | 一般 | 同上 |
| Reset | 履歴 | NORTH | 確認「すべて削除しますか」 | Reset 実行 | 閉じる | `#reset-btn` | 一般 | 原点 Joint |
| 表示 | 表示 | NORTH | チェック: グリッド、カラーチャート、接地リング、背景 ON | 各トグルを適用して閉じる | ドラフト破棄 | `#grid-toggle-btn`, `toggleColorChart`, 接地, `#background-photo-toggle-btn` | 一般 | 見た目のみ |
| 背景・FIT | 表示 | NORTH または表示のサブ | 画像選択、床高さ/オフセット/スケール/横、影、FIT ボタン | スライダーはドラッグ確定 or 適用ボタン。FIT は即時 | スライダーは確定前値に戻す | `#background-photo-*`, `#btn-open-fit`, `display.js` | 一般 | 背景メッシュ |
| 図面 | 出力 | NORTH | 条件未達なら理由表示 | `btn-open-drawing` click | 閉じる | `#btn-open-drawing` | 一般 | なし |
| ヘルプ | ヘルプ | NORTH | 操作一覧。説明書リンク | リンクは別タブ | Esc で閉じる | `#help-toggle-btn`, `#help-page-btn` | 一般 | なし |
| ログイン | アカウント | NORTH | パスワード（現行）。将来 Firebase | `tryLogin` | 閉じる | `#admin-menu-password`, `#admin-menu-login-btn` | 両方（フォームは誰でも） | なし |
| ログアウト | アカウント | NORTH | なし（認証後アイコン差替） | `admin-menu-logout` | — | `#admin-menu-logout-btn` | STAFF | なし |
| 合計金額 | 見積 | NORTH 常時テキスト | クリックで見積 POP を開く | — | — | `#total` | 一般 | なし |

自動バックアップはアイコンなし（hidden 維持）。MRU は「開く」ポップアップ内。

---

## B. WEST グループ 1 — 追加

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| Joint | 追加 | WEST | 説明「クリックで Joint」。座標の手入力は初期なし | モード ON。配置は 3D クリックが `createJoint` | Esc1=POP閉じ、Esc2=モードOFF | `createJoint`, `setSelectedJoint` | 一般 | クリックで追加/選択 |
| Beam | 追加 | WEST | 長さプリセット、オーダー ON/OFF、オーダー mm、材質 | 値を `#length-select` 等へ書きモード ON | ドラフト破棄。モードは Esc2 で OFF | `syncPartTypeFromToggle` Beam, `addBeamConnection`, `setOrderMode` | 一般 | 選択 Joint から伸ばす / 接続 |
| Pole | 追加 | WEST | Beam と同じ（Pole 長さリスト） | 同上 Pole | 同上 | `addPoleConnection` | 一般 | 垂直 |
| Leg | 追加 | WEST | 対象=選択 Joint。「底面のみ」注意。ON/OFF | `toggleLegForJoint` | 閉じる（脚は不変） | `addLegIfNeeded`, `toggleLegForJoint` | 一般 | Shift+クリックも維持 |
| 接続 | 追加/編集 | WEST | 説明「始点 Joint → 終点 Joint」 | `setConnectMode(true)` | モード OFF | `#connect-mode-btn` | 一般 | 2 点指定。斜め不可 |

脚の自動付与（底 Joint 生成時）は **hidden エンジン**。アイコンは手動トグル用。

プレビュー（マウス移動）は Beam/Pole モード中に 3D 上。POP の長さが `currentLengthMm` に同期してからプレビュー。

---

## C. WEST グループ 2 — 編集

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| 長さ | 編集 | WEST | 対象表示、現在長さ、プリセット/オーダー、新長さ、アンカー MIN/MAX | `#apply-len-btn` 相当 | ドラフト破棄。モード OFF 可 | `#length-mode-btn`, `#len-before`, `#mode-preset`, `#len-preset`, `#len-after`, `#anchor-side`, `#apply-len-btn` | 一般 | 長さモード中は Joint を拾わない（現行） |
| 材質 | 編集 | WEST | 対象種類、材質セレクト、適用範囲: 選択 / 全Beam / 全Pole / JointSet選択 / JointSet全 | 対応 `mat-apply-*` を click | 破棄 | `#material-select`, `#mat-apply-selected`, `#mat-apply-all-beam`, `#mat-apply-all-pole`, `#mat-jointSet`, `#mat-apply-jointSet`, `#mat-apply-all-jointSet` | 一般 | 選択ハイライト維持 |
| 削除 | 編集 | WEST | 対象名。クラスタ削除チェック | 単体: `deleteJoint` / `deleteConnectorByMesh`。クラスタ: 左バー削除と同じ | 閉じる | Alt+クリック維持。クラスタは `main.js` | 一般 | 削除モードならクリックで削除。通常の Alt も残す |

---

## D. WEST グループ 3 — 板

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| 棚板 | 板 | WEST | 材質、厚さ（現行 UI にあれば）。モード ON | `board-mode` + 棚側トグル | モード OFF | `#board-mode-btn`, `#board-kind-toggle` shelf, `#board-material`, `addShelfByJoints4` | 一般 | 4 Joint 選択 |
| 壁板 | 板 | WEST | 同様、壁側 | パネル側トグル | モード OFF | 同上 panel, `addPanelByJoints4` | 一般 | 4 Joint |

現行は 1 トグルで棚/壁を切替。新 UI はアイコンを分けるが、内部は `#board-kind-toggle` を同期。

---

## E. WEST グループ 4 — 配置

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| 移動 | 配置 | WEST | 短い説明。ON/OFF | `setMoveMode(true)` | モード OFF | `.cr-leftbar` 移動, `setMoveMode` | 一般 | ドラッグでクラスタ移動 |
| 回転 +90 | 配置 | WEST | なし（即時）または確認なし | `rotateActiveCluster90(+90)` | — | `main.js` | 一般 | アクティブクラスタ |
| 回転 -90 | 配置 | WEST | なし | `rotateActiveCluster90(-90)` | — | 同上 | 一般 | 同上 |
| クラスタ削除 | 配置 | WEST | 確認 | クラスタ削除 | 閉じる | 左バー削除 | 一般 | 選択クラスタ |
| 自動レイアウト | 配置 | WEST | 「ツールを開く」+ 高さ編集リンク | `open-auto-layout-tool` / `openHeightEditorWindow` | 閉じる | `#open-auto-layout-tool`, `#open-height-editor-btn`, `autolayout.js` | 一般 | 結果は `rebuildSceneFromData` |

回転はポップアップ不要（アイコン 2 つ）。グループ化で縦長を防ぐ。

---

## F. WEST / NORTH — 表示・出力の残り

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| 寸法 | 表示 | WEST または NORTH 表示内 | 外寸 W/D/H、芯々 | 閉じるだけ（読み取り） | 閉じる | `#dimension-open-btn`, `#dim-outer-*`, `#dim-core-*` | 一般 | なし |
| グリッド | 表示 | NORTH 表示内トグルでも可 | なしならアイコンがトグル | `applyGridVisibility` | — | `#grid-toggle-btn` | 一般 | グリッド |
| カラーチャート | 表示 | 同上 | 長さ色表 | 閉じる / 3D 色分けトグル | トグル戻す | `#color-chart-toggle-btn`, `#colorchart-overlay` | 一般 | コネクタ色 |
| 見積 | 出力 | WEST 推奨（NORTH 合計と連携） | `#parts-table` 相当、製作数、見積へ送る | 送るは `sendToEstimate`。閉じるは確定不要 | 閉じる（データ不変） | `#parts-table`, `#send-estimate-btn`, `calcAndRenderEstimate`, `order-pricing.js` | 一般 | なし |
| 価格読込 | hidden | — | なし | 起動時 | — | `price-loader.js` | 一般 | なし |

---

## G. STAFF（WEST 下部、認証後）

| アイコン名 | グループ | 位置 | ポップアップ | 確定 | キャンセル | 既存 | 権限 | 3D |
|------------|----------|------|--------------|------|------------|------|------|----|
| 共同編集 | STAFF | WEST | スタッフ選択、Firebase パスワード、開始。未保存なら保存を促す | `openStaffCollaboration` / ログインボタン。**ここで初めて現行 subscribe** | 閉じても接続中なら維持。終了は明示ボタン | `#staff-collab-host`, `signInWithEmailAndPassword`, `closeStaffCollaboration` | STAFF UI + Firebase Auth + 将来 rules | 同期中は 3D がリモート適用されうる（現行どおり、方式は変えない） |
| 接続チップ | STAFF | CENTER 上 CHIP | なし | — | — | `#staff-presence` テキスト | STAFF かつ collab 開始後 | なし |
| ToDo | STAFF | WEST | 一覧、追加、完了チェック。削除は現行に無いので「将来」と明記しつつ追加 UI は既存 API があるときだけ | `addTodo`, checkbox | 閉じる（サーバー上の ToDo は既に確定したものは残る） | `#staff-todo-*` | STAFF + Firestore todos | なし |
| 在庫照合 | STAFF | WEST | CSV 読込、結果表、印刷 | ファイル選択は即時読込。印刷ボタン | 閉じる | `#stock-reconcile-*`。二重ゲートはポップアップでは出さない（STAFF セッションに乗せる） | STAFF 表示。CSV はローカル | なし |
| 価格管理 | STAFF | WEST | 当面「価格ページを開く」。将来インライン | リンク | 閉じる | `admin-pricing-9fd83.html` | STAFF UI。**書込はサーバー必須**（現行 RPC は危険、Phase 5） | なし |

500ms 同期: 共同編集「開始」成功後に既存 `subscribe()` が設定する。他アイコンから呼ばない。

ソフトロック・リモートカーソル: マトリクス上は Phase 4 までアイコンなし。CHIP に空きを残す。

---

## H. CENTER ジェスチャ（アイコンではないが機能として残す）

| 機能 | 位置 | 動作 | 既存 | 権限 |
|------|------|------|------|------|
| Joint クリック追加 | 3D | 追加モード時 | `main.js` | 一般 |
| 選択 | 3D | 通常クリック | `setSelectedJoint` | 一般 |
| Alt+削除 | 3D | 削除モードでなくても残す | `deleteJoint`, `deleteConnectorByMesh` | 一般 |
| Shift+脚 | 3D | Leg アイコンなしでも残す | `toggleLegForJoint` | 一般 |
| 中ドラッグ回転 | 3D | Orbit | `scene.js` | 一般 |
| 右ドラッグパン | 3D | Orbit | 同上 | 一般 |
| ホイールズーム | 3D | Orbit | 同上 | 一般 |
| 移動ドラッグ | 3D | 移動モード時 | `setMoveMode` | 一般 |

---

## I. エンジンのみ（アイコンなし）

| 機能 | 扱い |
|------|------|
| 安定 ID | 保存・共同編集用。UI に出さない |
| `autoBackup` | 維持 |
| `auto-layout.BACKUP.html` | 導線なし。削除は承認後 |
| 価格 catalog 読込 | 起動時 |
| 製作数 | 見積 POP 内（estimate にあれば） |

---

## J. 件数チェック（マトリクス漏れ防止）

Phase 2A 機能 → 本表:

- Joint/Beam/Pole/Leg 追加削除・接続・脚・プレビュー → B, C, H
- 移動回転クラスタ Reset → E, NORTH Reset
- 長さ・材質・板・寸法・グリッド・色・背景 FIT・図面 → C, D, F, NORTH
- 見積・合計・送る・価格読込・オーダー価格 → F, NORTH 合計
- Undo/Redo → NORTH
- 保存開く MRU バックアップ → NORTH
- 自動レイアウト・高さ編集 → E
- STAFF ログインログアウト在庫価格 collab 500ms presence ToDo → NORTH ログイン, G
- ヘルプ説明書接地リング → NORTH 表示/ヘルプ
- 弱い UI（MRU、図面 disable、ToDo 削除、常時ステータス、ソフトロック） → 開く POP、図面 POP、ToDo 将来、CHIP、Phase 4
