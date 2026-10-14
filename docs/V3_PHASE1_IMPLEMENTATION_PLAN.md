# V3 Phase 1 実装計画 — 安定ID と互換性のみ

作成日: 2026-10-14
対象ブランチ (Phase 1 で使用): `feature/v3-safe-collaboration` (本 Phase 0 で作成済み)
対象ブランチ (本 Phase 0): 同上

**本ドキュメントは Phase 1 の作業計画書である。本 Phase 0 では一切のコード変更を実施しない。**

---

## 1. Phase 1 の目的

- 全エンティティ (joint / beam / pole / leg) に**安定 ID** を導入する
- 既存機能に**一切の挙動変更を加えない** (リグレッション 0)
- Phase 2 (ラップ形式ファイル + projectId) と Phase 4 (ops ベース共同編集) の**地盤**を作る

**Phase 1 で導入「しない」もの:**
- Firestore 共同編集ロジック (Phase 4)
- ラップ形式ファイル (Phase 2)
- Supabase 認証変更 (Phase 5)
- Firestore ルール適用 (Phase 3)
- UI 変更 (ToDo パネル等)

---

## 2. 作業手順 (順序厳守)

### Step 1: id-utils.js を新規作成
**ファイル**: `js/state/id-utils.js` (新規)
**内容**:
```js
(function () {
  "use strict";

  function _generate(prefix) {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) {}
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  window.newJointClientId = function () { return _generate("j"); };
  window.newBeamClientId = function () { return _generate("b"); };
  window.newPoleClientId = function () { return _generate("p"); };
  window.newLegClientId  = function () { return _generate("l"); };
})();
```
**変更しない:** 既存ファイル
**検証:** コンソールで `newJointClientId()` を 1,000 回呼び、全て unique

### Step 2: ensure-ids.js を新規作成
**ファイル**: `js/data/ensure-ids.js` (新規)
**内容**:
```js
(function () {
  "use strict";

  function ensureJointIds(arr) {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const j = arr[i];
      if (!j) continue;
      if (!j.id) j.id = window.newJointClientId();
    }
  }

  function ensureConnectorIds(beams, poles, joints) {
    function fix(arr, newId) {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b) continue;
        if (!b.id) b.id = newId();
        if (!b.aId && Array.isArray(joints) && joints[b.a]) b.aId = joints[b.a].id || null;
        if (!b.bId && Array.isArray(joints) && joints[b.b]) b.bId = joints[b.b].id || null;
      }
    }
    fix(beams, window.newBeamClientId);
    fix(poles, window.newPoleClientId);
  }

  function ensureLegIds(legs, joints) {
    if (!Array.isArray(legs)) return;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (!l) continue;
      if (!l.id) l.id = window.newLegClientId();
      if (!l.jointId && Array.isArray(joints) && joints[l.jointIndex]) {
        l.jointId = joints[l.jointIndex].id || null;
      }
    }
  }

  window.applyIdBackfillToWindow = function () {
    ensureJointIds(window.joints);
    ensureConnectorIds(window.beams, window.poles, window.joints);
    ensureLegIds(window.legs, window.joints);
  };

  // 単独呼び出しも可能にしておく
  window.__ensureJointIds = ensureJointIds;
  window.__ensureConnectorIds = ensureConnectorIds;
  window.__ensureLegIds = ensureLegIds;
})();
```
**検証:** 既存 Flat JSON を 1 件 open → `applyIdBackfillToWindow()` 実行 → 全要素に `id` が入っていること、2 回目の実行で ID が変化しないこと

### Step 3: index.html に script タグ追加
**変更箇所:** `js/utils/common.js` の `<script>` の**直後**

変更前 (推定):
```html
<script src="js/utils/common.js"></script>
<script src="js/state/state.js"></script>
```

変更後:
```html
<script src="js/utils/common.js"></script>
<script src="js/state/id-utils.js"></script>
<script src="js/data/ensure-ids.js"></script>
<script src="js/state/state.js"></script>
```

**検証:** ブラウザコンソールで `typeof newJointClientId === "function"` が true

### Step 4: joints.js の createJoint 変更
**ファイル:** `js/parts/joints.js`
**変更箇所:** `createJoint(pos)` 関数内の `joints.push(...)`

変更前:
```js
function createJoint(pos) {
  const existing = findJointIndexAt(pos);
  if (existing !== -1) return existing;
  joints.push({ x: pos.x, y: pos.y, z: pos.z });
  // ...以降の mesh 生成等
}
```

変更後:
```js
function createJoint(pos) {
  const existing = findJointIndexAt(pos);
  if (existing !== -1) return existing;
  joints.push({
    id: (typeof window.newJointClientId === "function") ? window.newJointClientId() : null,
    x: pos.x, y: pos.y, z: pos.z
  });
  // ...以降の mesh 生成等 (変更なし)
}
```

**検証:**
1. 新規プロジェクトを開く
2. ジョイントを 3 個作成
3. コンソールで `window.joints.map(j => j.id)` → すべて非 null でユニーク

### Step 5: connectors.js の addBeamConnection / addPoleConnection 変更
**ファイル:** `js/parts/connectors.js`

**変更箇所 1:** `addBeamConnection(aIndex, bIndex)` の `beams.push(...)`

変更前 (推定):
```js
beams.push({
  type: "beam",
  a: aIndex, b: bIndex,
  mesh, lengthMm, material, isCustom, customLength
});
```

変更後:
```js
beams.push({
  id: (typeof window.newBeamClientId === "function") ? window.newBeamClientId() : null,
  type: "beam",
  a: aIndex, b: bIndex,
  aId: (window.joints && window.joints[aIndex]) ? (window.joints[aIndex].id || null) : null,
  bId: (window.joints && window.joints[bIndex]) ? (window.joints[bIndex].id || null) : null,
  mesh, lengthMm, material, isCustom, customLength
});
```

**変更箇所 2:** `addPoleConnection(aIndex, bIndex)` も同様 (`newPoleClientId`、`type:"pole"`)

**検証:**
1. ジョイントを 2 個作成
2. ビームを 1 個追加
3. `window.beams[0]` に `id`, `aId`, `bId` が全て入っていること

### Step 6: legs.js の addLegIfNeeded 変更
**ファイル:** `js/parts/legs.js`

**変更箇所:** `addLegIfNeeded(jointIndex)` の `legs.push(...)`

変更前:
```js
legs.push({ jointIndex, material, mesh });
```

変更後:
```js
legs.push({
  id: (typeof window.newLegClientId === "function") ? window.newLegClientId() : null,
  jointIndex,
  jointId: (window.joints && window.joints[jointIndex]) ? (window.joints[jointIndex].id || null) : null,
  material, mesh
});
```

**検証:** 脚を 1 本追加 → `window.legs[0].id`, `window.legs[0].jointId` が非 null

### Step 7: file.js の createSnapshotLocal 変更
**ファイル:** `js/features/file.js`

**変更箇所:** `createSnapshotLocal()` 関数

変更前 (抜粋):
```js
function createSnapshotLocal() {
  return JSON.stringify({
    joints: JSON.parse(JSON.stringify(joints)),
    beams: beams.map((b) => ({ a: b.a, b: b.b, isCustom: !!b.isCustom, customLength: b.customLength, material: b.material })),
    poles: poles.map((p) => ({ a: p.a, b: p.b, isCustom: !!p.isCustom, customLength: p.customLength, material: p.material })),
    legs: legs.map((l) => ({ jointIndex: l.jointIndex, material: l.material })),
    manualLegs: Array.from(window.manualLegJointSet || []),
    shelves: ..., panels: ...
  });
}
```

変更後:
```js
function createSnapshotLocal() {
  return JSON.stringify({
    joints: joints.map((j) => ({
      ...(j.id ? { id: j.id } : {}),
      x: j.x, y: j.y, z: j.z
    })),
    beams: beams.map((b) => ({
      ...(b.id ? { id: b.id } : {}),
      type: "beam",
      a: b.a, b: b.b,
      ...(b.aId ? { aId: b.aId } : {}),
      ...(b.bId ? { bId: b.bId } : {}),
      isCustom: !!b.isCustom,
      customLength: b.customLength,
      material: b.material
    })),
    poles: poles.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      type: "pole",
      a: p.a, b: p.b,
      ...(p.aId ? { aId: p.aId } : {}),
      ...(p.bId ? { bId: p.bId } : {}),
      isCustom: !!p.isCustom,
      customLength: p.customLength,
      material: p.material
    })),
    legs: legs.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      jointIndex: l.jointIndex,
      ...(l.jointId ? { jointId: l.jointId } : {}),
      material: l.material
    })),
    manualLegs: Array.from(window.manualLegJointSet || []),
    shelves: ..., panels: ...  // (元のまま)
  });
}
```

**変更箇所 2:** `applySnapshotFromString(str)` の冒頭に ID 補完を追加

変更前 (推定):
```js
function applySnapshotFromString(str) {
  const data = JSON.parse(str);
  clearAllMeshes();
  // ...以降の rebuildSceneFromData 相当処理
}
```

変更後:
```js
function applySnapshotFromString(str) {
  const raw = JSON.parse(str);

  // ラップ形式判定: snapshot キーがあれば剥がす
  const data = (raw && typeof raw === "object" && raw.snapshot && typeof raw.snapshot === "object")
    ? raw.snapshot
    : raw;

  clearAllMeshes();
  // ...以降の rebuildSceneFromData 相当処理 (配列再構築)

  // 配列再構築後に ID 補完
  if (typeof window.applyIdBackfillToWindow === "function") {
    window.applyIdBackfillToWindow();
  }
  // 再描画
}
```

**検証:**
1. Phase 1 変更前の JSON (フラット、ID なし) を open → ID が自動付与される
2. 一度保存 → ファイルを見る → `id/aId/bId/jointId` が入っている
3. 保存した JSON をもう一度 open → ID は変わらない (ラウンドトリップ安定)

### Step 8: 回帰テスト (手動)
全て以下の項目を**チェックリスト化**して Phase 1 完了時に実施:

| 項目 | 期待 | 要確認 |
|-----|-----|--------|
| 新規プロジェクト作成 | 動く | ✅ |
| ジョイント作成 (単発) | 1 個追加される | ✅ |
| ジョイント作成 (同じ位置) | 2 個目は作られない (findJointIndexAt が返す) | ✅ |
| ビーム追加 | 動く、長さ正しい | ✅ |
| 柱追加 | 動く | ✅ |
| 脚追加 | 動く | ✅ |
| 棚追加 | 動く | ✅ |
| パネル追加 | 動く | ✅ |
| 削除 (ビーム) | 動く、インデックスずれなし | ✅ |
| 削除 (ジョイント) | 動く、連動する部品の処理 OK | ✅ |
| 長さ変更モード | 動く、既存の挙動 (バグ含む) そのまま | ✅ |
| Undo | 動く、ID 保持 | ✅ |
| Redo | 動く、ID 保持 | ✅ |
| 保存 (ファイル) | JSON に id が入っている | ✅ |
| 読み込み (Phase 1 で保存した JSON) | 動く、ID 不変 | ✅ |
| 読み込み (旧フラット JSON、ID なし) | 動く、ID 自動付与 | ✅ |
| 読み込み (旧 STAFF ラップ JSON) | 動く、snapshot が剥がれる、ID 補完 | ✅ |
| 見積り (estimate) | 変わらない | ✅ |
| 在庫照合 (stock-reconcile) | 変わらない | ✅ |
| STAFF モード (既存 collab 500ms) | 変わらない (悪影響なし) | ✅ |

### Step 9: コミット・マージ (Phase 1 完了承認後)
```powershell
# Phase 1 完了承認を受けた後のみ:
git add js/state/id-utils.js js/data/ensure-ids.js index.html \
        js/parts/joints.js js/parts/connectors.js js/parts/legs.js \
        js/features/file.js
git commit -m "feat(v3-phase1): add stable IDs for joint/beam/pole/leg, keep backwards compatibility"
# PR を作成し、動作確認後に main に merge
```

**本 Phase 0 では git add / commit / push は実行しない。**

---

## 3. 変更ファイル一覧 (Phase 1 全体)

| ファイル | 新規/変更 | 行数影響 |
|---------|---------|---------|
| `js/state/id-utils.js` | 新規 | +20 |
| `js/data/ensure-ids.js` | 新規 | +45 |
| `index.html` | 変更 (script タグ 2 行追加) | +2 |
| `js/parts/joints.js` | 変更 (`createJoint` 内 1 箇所) | +4 |
| `js/parts/connectors.js` | 変更 (`addBeamConnection` / `addPoleConnection` 2 箇所) | +8 |
| `js/parts/legs.js` | 変更 (`addLegIfNeeded` 1 箇所) | +4 |
| `js/features/file.js` | 変更 (`createSnapshotLocal` / `applySnapshotFromString` 2 箇所) | +20 |
| **合計** | 2 新規 + 5 変更 | +103 行 |

---

## 4. リスク評価

| リスク | 発生確率 | 影響 | 対策 |
|-------|--------|------|------|
| 既存 Flat JSON の読み込みで想定外のエラー | 低 | 中 | Phase 1 完了前に、本番で使われている JSON ファイルを 3-5 件収集し、全て open できることを確認 |
| `applyIdBackfillToWindow` が無限ループ | 低 | 高 | 冪等性テスト: 100 回連続実行で ID が変化しないこと |
| 旧 STAFF ラップ JSON を間違って Flat として parse | 低 | 中 | 判定条件 (`raw.snapshot` の存在) で確実に分岐 |
| `id` フィールドが undefined だと空オブジェクト `{}` が JSON に書かれる | 低 | 低 | `(j.id ? { id: j.id } : {})` のスプレッド合体で回避 |
| mesh が `null` の beam/pole (想定外) に ID を書く | 低 | 低 | `ensureConnectorIds` 内で null チェック済み |
| ブラウザが古く `crypto.randomUUID` がない | 低 | 低 | fallback (`${prefix}-${time36}-${rand36}`) あり |
| Undo で ID が増え続ける (履歴に古い ID 版と新しい ID 版が共存) | 中 | 中 | Phase 1 ではこの挙動を**受け入れる** (Phase 4 で正規化) |

---

## 5. Phase 1 完了基準 (DoD)

全て満たすこと:

- [ ] `js/state/id-utils.js` が追加され、`newJointClientId` 等が window に生えている
- [ ] `js/data/ensure-ids.js` が追加され、`applyIdBackfillToWindow` が window に生えている
- [ ] `index.html` に 2 行の script タグが追加されている
- [ ] `js/parts/joints.js` / `connectors.js` / `legs.js` が ID を付与する
- [ ] `js/features/file.js` が ID を保存し、ID 補完を呼ぶ
- [ ] 手動テストチェックリスト (Step 8) 全項目 ✅
- [ ] コミットは `feature/v3-safe-collaboration` ブランチ上
- [ ] `main` にマージされていない (ユーザー承認待ち)

---

## 6. Phase 1 終了後の次ステップ候補

Phase 1 完了・ユーザー検証後、以下の順序で進める:

- **Phase 2**: ラップ形式ファイル (`projectId`, `createdBy`, `updatedBy`) 導入
- **Phase 3**: Firestore ルール デプロイ (`firestore.rules` を本番適用)
- **Phase 4**: ops ベース共同編集 (`staff-collab.js` を本格移植)
- **Phase 4.1**: ToDo パネル UI 追加
- **Phase 5**: 価格認証 Netlify Function + Supabase RPC 置き換え
- **Phase 6**: 旧 `_REFERENCE_staff-source-2026-08/` 削除、`_OLD_Cube Rack Demo (backup)` 削除
- **Phase 7**: ドキュメント整理、プロジェクト Wiki 整備

**本 Phase 0 では Phase 1 以降の実装は一切行わない。**

---

## 7. 承認後の着手手順

1. Phase 0 完了報告を提出
2. ユーザーが「Phase 1 着手承認」を明示的に出す
3. 本ドキュメントの Section 2 を上から順に実施
4. 各 Step 完了ごとに動作確認報告
5. Phase 1 全体完了時点で、Phase 2 の計画書を作成し再度承認依頼
