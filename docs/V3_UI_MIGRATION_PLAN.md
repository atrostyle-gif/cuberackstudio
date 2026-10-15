# V3 UI 移行計画

作成日: 2026-10-15
前提: 推奨レイアウトは案 C（CAD 型 + STAFF ワークスペース）。未承認なら実装しない。
本フェーズ（2A）は資料のみ。コード・CSS・index.html は変更しない。

---

## 1. 移行の原則

1. 機能マトリクスの項目を**落とさない**。
2. 3D エンジン / 価格計算 / 保存 JSON / 安定 ID / STAFF バックエンドは**再利用**。
3. 最初の実装は DOM の引っ越しと CSS シェル。ハンドラのロジックは既存関数を呼ぶ。
4. 1 ステップごとにブラウザで一般操作 + STAFF メニューが生きていることを確認する。
5. `main` merge / push / Netlify / Firebase・Supabase 変更はしない（現行運用どおり）。

---

## 2. 段階

### UI-0（本フェーズ）設計

成果物: 本資料群。コード変更なし。

### UI-1 シェル骨格（案 A 相当）

目的: NORTH / WEST / CENTER / EAST の箱だけ作る。既存ボタンを**切らずに箱へ移動**。

| 作業 | 対象ファイル | リスク |
|------|--------------|--------|
| header / 左ツール枠 / `#view` / 右枠 | `index.html` | セレクタ破壊 |
| 幅・flex | `index.html` 内 CSS、必要なら `js/ui/shell.css` 新規 | 3D リサイズ未呼び出し |
| 左バー生成先を WEST へ | `main.js`（生成 parent のみ） | 二重バー |
| `renderer` の resize | `scene.js` / `main.js` | キャンバス黒塗り |

成功条件: 現行と同じ操作で Joint/Beam が置け、保存・Undo・見積が動く。見た目だけグリッドが変わる。

### UI-2 一般コマンドの再配置

| 現行 | 移行先 | ファイル |
|------|--------|----------|
| ファイル 3 ボタン | NORTH | `file.js` bind はそのまま ID 維持が安全 |
| Undo/Redo/Reset | NORTH | `history.js`, `main.js` reset |
| Beam/Pole・長さ・オーダー | WEST（追加ツール時） | `ui.js` |
| 材質・長さ変更・寸法・明細 | EAST | `main.js`, `estimate.js`, `display.js` |
| グリッド/ヘルプ/カラーチャート | NORTH 表示メニュー | `ui.js` |
| 自動レイアウトボタン | WEST | `autolayout.js`（別 HTML は維持） |
| 背景/FIT/図面 | NORTH 出力 or EAST 表示 | `display.js`, `main.js` |

成功条件: マトリクスの一般機能がすべてどこかにあり、クリックできる。

### UI-3 STAFF ワークスペース（案 C の加算）

| 現行 | 移行先 | ファイル |
|------|--------|----------|
| `#admin-menu-open-btn` | NORTH ログイン | `admin-menu.js` |
| ログインフォーム | モーダル（既存オーバーレイ流用可） | 同上 |
| 在庫照合 | STAFF ドック | `stock-reconcile.js`。二重パスワード削除は**この段階の別コミット** |
| 共同編集 host | STAFF バー | `staff-collab-mode.js` の `host()` だけ変更 |
| ToDo | ドック | 同上。同期方式（500ms）は変えない |
| 価格リンク | ドック内リンク（当面別 HTML） | `admin-pricing-9fd83.html` |

成功条件: 未ログインで STAFF DOM が見えない（または操作できない）。ログイン後に ToDo / 在庫 / 価格入口がある。Firestore には触らない。

### UI-4 内製（後続、承認後）

- 自動レイアウトを別ウィンドウから EAST またはモーダルへ
- 価格管理をアプリ内へ（Phase 5 認証とセット）
- 旧 collab トップバー相当の常時 presence
- モバイル viewport + EAST ドロワー

### UI-5 同期待ち（Phase 4 と連携）

ソフトロック、リモートカーソル、ops 同期は UI-3 の STAFF バーに載せる。UI 再設計だけで同期を変えない。

---

## 3. 機能ごとの移行先（一覧）

| 機能 | 現行 | UI-1/2 一般 | UI-3 STAFF |
|------|------|-------------|------------|
| Joint/Beam/Pole/Leg 編集 | 3D + 右 | CENTER + WEST | — |
| 移動回転 | 左フローティング | WEST | — |
| 材質寸法 | 右カード | EAST | — |
| 見積 | 右テーブル | EAST 折りたたみ + 合計常時 | — |
| Undo/Redo | 右 | NORTH | — |
| 保存開く | 右 | NORTH | 共同編集は保存必須のまま |
| 自動レイアウト | 右ボタン → 別 HTML | WEST → 別 HTML | — |
| STAFF ログイン | 右ボタン → オーバーレイ | NORTH | モーダル |
| 価格変更 | 別 HTML | — | ドック |
| 在庫照合 | オーバーレイ内 | — | ドック |
| 共同編集 | オーバーレイ奥 | — | バー + ドック |
| ToDo | オーバーレイ奥 | — | ドック |

---

## 4. 実装対象ファイルと触る範囲

| ファイル | UI-1 | UI-2 | UI-3 | 備考 |
|----------|------|------|------|------|
| `index.html` | 骨格 | カード移動 | STAFF 枠 | 既存 ID を残す |
| `js/ui/ui.js` | 低 | bind 確認 | — | ロジック変更しない |
| `js/ui/admin-menu.js` | — | — | host / show | 平文パスワードは Phase 5 |
| `js/ui/staff-collab-mode.js` | — | — | `host()` | **タイマー・writeState は触らない** |
| `js/ui/admin-menu.css` | 低 | 中 | STAFF バー CSS | |
| `main.js` | 左バー parent | 材質ボタンは ID 維持なら無変更 | — | 巨大ファイル。差分最小 |
| `js/features/file.js` | — | ID 維持なら無変更 | — | JSON 形式変更禁止 |
| `js/features/history.js` | — | 無変更が望ましい | — | Undo 仕様改善は別コミット |
| `js/features/estimate.js` | `#total` 必須 | 明細の折りたたみは CSS のみ可 | — | 計算禁止 |
| `js/parts/*.js` | 禁止 | 禁止 | 禁止 | エンジン |
| `js/state/*` | 禁止 | 禁止 | 禁止 | ID ユーティリティ含む |
| `firestore.rules` | 禁止 | 禁止 | 禁止 | Phase 3 |
| `staff-collab-mode.js` 同期 | 禁止 | 禁止 | 禁止 | Phase 4 |

新規ファイル案（実装段階）: `js/ui/shell.js`, `js/ui/shell.css`。作るまで `index.html` 直書きでもよい。

---

## 5. 技術的リスクと緩和

| リスク | 深刻度 | 緩和 |
|--------|--------|------|
| `getElementById` 前提が壊れる | 高 | ID をリネームしない。移動のみ |
| `main.js` 衝突・巨大 diff | 高 | parent 変更と CSS に限定したコミット |
| 見積 DOM 欠落で例外 | 高 | `#parts-table` `#total` を EAST に必ず残す |
| 3D resize | 中 | シェル変更後に `window.dispatchEvent(new Event('resize'))` |
| 左バー二重 | 中 | 既存生成を 1 箇所に |
| STAFF を CSS だけで隠す | 中 | 将来は Firebase セッション。書込は Phase 3/5 |
| File picker / 別ウィンドウ | 低 | 移行しても API はそのまま |
| 自動レイアウトの opener | 中 | UI-4 まで別 HTML |
| Undo 初回不可 | 低 | UI 移行とは別修正 |
| モバイル未対応 | 中 | UI-4。初期はデスクトップ |

---

## 6. テスト（各 UI ステップの完了条件）

一般:

- Joint 追加削除、Beam/Pole、脚トグル
- 材質適用、長さ変更
- 見積合計が変わる
- Undo/Redo
- 保存スナップショットが Flat + ID（形式変更なし）
- 自動レイアウトが開く

STAFF（ログインは手動、パスワードを資料に書かない）:

- 未ログインで在庫・価格・ToDo が使えない
- ログイン後に各入口がある
- 共同編集 UI が host 移動後も描画される（接続テストは Firebase を変えない範囲で）

---

## 7. 次の UI 実装段階の提案

ユーザー承認後の最初の実装は **UI-1 のみ**:

1. `index.html` に NORTH/WEST/CENTER/EAST の箱を追加し、既存ノードを箱へ移す。
2. CSS で 3D が残りの幅を使う。
3. `main.js` の左バーを WEST に出す。
4. ブラウザで一般操作の回帰。

STAFF ワークスペース（UI-3）はシェルが安定してから。価格のサーバー認証は Phase 5 と同時が安全。

承認が無い限り `index.html` / CSS / JS は変更しない。
