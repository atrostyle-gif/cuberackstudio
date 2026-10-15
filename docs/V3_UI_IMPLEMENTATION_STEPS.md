# V3 コンパクト UI 実装手順（未実装）

作成日: 2026-10-15
本フェーズは資料のみ。承認後も **本番公開は明示許可まで禁止**。

Phase 2A の UI-1（右 EAST 常時）は採用しない。代わりに下記 CUI-1 以降。

---

## 1. 技術方針: 壊さず置き換える

### 1.1 既存 DOM ID を維持

`file.js` / `ui.js` / `main.js` / `estimate.js` / `admin-menu.js` は ID 文字列に依存する。

実装時:

- `#panel` は残し `hidden` または `class="v3-legacy-panel"` で画面外へ
- 新アイコンの `data-click="#save-design-btn"` で既存ボタンを `.click()` するか、入力要素をポップアップへ **Node.move**（ID 不変）
- ID リネーム禁止

### 1.2 イベントリスナー

新規 listener を既存関数の上に重ねない。既存 `initUI` / `initFileButtons` / `initHistoryButtons` は動かしたまま、可視ボタンだけ隠す。

左バー `.cr-leftbar` は WEST の移動・回転・クラスタ削除と二重になるため、CUI-1 では生成先を WEST に変えるか、新アイコンから同じ `setMoveMode` を呼び旧バーを出さない。

### 1.3 hidden と新 UI

`display:none` のテーブルは `offsetHeight` が 0。`calcAndRenderEstimate` がレイアウトに依存していれば vis-hidden（`position:absolute; left:-9999px`）で DOM 接続を維持。実装時に estimate.js を読む（計算ロジックは変更しない）。

### 1.4 3D resize

`#panel` を外すと `#view` が広がる。シェル適用後:

```
window.dispatchEvent(new Event("resize"));
```

`scene.js` の既存 resize ハンドラに乗せる。ハンドラが無ければ CUI-1 で `camera.aspect` + `renderer.setSize` を既存コード経路で呼ぶ（新規エンジンを書かない）。

### 1.5 ポップアップ状態

単一モジュール案 `js/ui/v3-command-popup.js`（未作成）:

- 同時に 1 インスタンス
- Esc / 確定 / 対象変更は `V3_UI_POPUP_SPEC.md`
- 既存モード変数を正本にする

### 1.6 コマンド排他

追加・接続・長さ・板・移動・削除モードは現行どおり排他に近づける。新 UI はアイコン `aria-pressed` をこれらのフラグに同期するだけ。独自の第二モードマネージャを持たない（食い違い防止）。

### 1.7 キャンセルと Undo

POP オープン ≠ history。確定だけ既存 saveHistory。キャンセルは `hidePreview` のみ。

### 1.8 見積タイミング

現行 `requestEstimateRender` のまま。POP ドラフトでは呼ばない。NORTH は `#total` を観測。

### 1.9 保存互換

`createSnapshot` / `applySnapshotFromString` を UI から直接変えず、既存ボタン経由。Flat JSON + 安定 ID のまま。

### 1.10 同期を広げない

- `openStaffCollaboration` は共同編集 POP の開始成功時のみ
- ページロードで collab を auto-start しない
- 新タイマーを足さない（500ms は既存内部のみ）

### 1.11 権限

STAFF アイコン非表示は UX。価格・todos・ops の保護は Phase 3/5 のサーバー。実装コメントに「UI hide ≠ auth」を残す。

---

## 2. 実装ステップ

### CUI-0 本資料（完了）

コード変更なし。

### CUI-1 シェル（3D 最大化）

1. `index.html` に NORTH バー・WEST アイコン列・`#view` 全幅。`#panel` は legacy hidden
2. CSS: body flex、`#panel` 幅 0 / 非表示
3. resize 発火
4. 既存ボタンが hidden でも `click()` できること

成功: Joint 追加、見積合計が NORTH に出る、保存ボタンがまだ hidden でも API で createSnapshot 可能。目視で 3D が広い。

触るファイル: `index.html`, 少量 CSS, `main.js` 左バー parent のみ。  
触らない: `joints.js`, `file.js` の JSON, `staff-collab-mode.js` の timer。

### CUI-2 NORTH 接続

開く/保存/Undo/Redo/Reset/合計/ログインを新アイコン → 既存 ID click。

成功: 現行と同じファイル操作。

### CUI-3 WEST + ポップアップ

アイコンマトリクス順に、1 グループずつ POP を既存フォームへ同期。

順序: 追加（Beam/Pole 長さ）→ 材質 → 長さ変更 → 板 → 移動回転 → 表示 → 見積 POP。

成功: マトリクスの一般機能がすべてアイコンか 3D ジェスチャで到達できる。

### CUI-4 STAFF アイコン

ログイン後に WEST 下部を出す。共同編集 POP からのみ `openStaffCollaboration`。CHIP は presence 文字列。在庫 POP は二重パスワードなし（セッション vis）。価格はリンク。

成功: 未ログインで STAFF アイコンなし。ログイン後も 500ms は「開始」するまで回らない。

### CUI-5 仕上げ（承認後）

フォーカス、Esc 二段、はみ出しクランプ、ヘルプ文の更新、viewport。  
本番 Netlify は別途明示承認。

---

## 3. 変更リスク（実装時）

| リスク | 緩和 |
|--------|------|
| hidden panel で init が要素なし | init は DOMContentLoaded 時に ID が存在すればよい。消さず hidden |
| 見積が空 | `#parts-table` `#total` を残す |
| モード二重 | フラグは既存のみ |
| collab 誤起動 | CUI-4 まで openStaff を呼ばない |
| 巨大 main.js diff | click 委譲と CSS に限定 |
| 左バー二重 | 旧バー非表示 |

---

## 4. テスト（各ステップ）

一般: Joint/Beam/Pole/脚、長さ材質、Undo、保存スナップショットが ID 付き Flat、見積合計変化、自動レイアウト起動。  
STAFF: 非表示、ログイン後アイコン、共同編集は明示開始のみ。Firebase/Supabase 設定は変えない。

---

## 5. Git / 公開

- ブランチ `feature/v3-safe-collaboration`
- push / main merge / Netlify **禁止**（ユーザー明示承認まで）
- 未追跡 `__LATEST__README.txt`, `_v3_phase11_test_data/` 保護
