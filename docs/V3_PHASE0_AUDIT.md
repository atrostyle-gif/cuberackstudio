# V3 Phase 0 — データモデル精査レポート

作成日: 2026-10-14
ブランチ: `feature/v3-safe-collaboration` (HEAD `a0725be` 時点、未コミット: `__LATEST__README.txt` のみ保護)

本ドキュメントは Ver3.0 統合に先立ち、本番 (`source/`) と旧 STAFF 版
(`_REFERENCE_staff-source-2026-08/`) のデータモデルを突き合わせ、
「どこを・どの関数で・どういう順序で・どこに影響しながら」変更するかを**実装前に**確定するものである。

---

## 0. 判定の原則

| 原則 | 内容 |
|------|------|
| **原則 A** | インデックス参照 (`beams[i].a` 等) は**削除しない**。既存コードが参照するため、ID と**併存**させる。 |
| **原則 B** | ID はクライアント生成の文字列 (`crypto.randomUUID()` が使えればそれ、無ければ時刻+乱数)。一度採番した ID は**全ライフサイクルで不変**。 |
| **原則 C** | ID 補完 (旧データ読み込み時) は**冪等**にする。同じオブジェクトを 2 回読み直しても `id` が別物に変わってはならない。 |
| **原則 D** | ID 衝突 (後述、2 PC が同時に同じジョイントを `createJoint` した場合) は、**位置ベースの照合**で遅延マージし、`jointIdRemap: Map<localId, mergedId>` で解決する (旧 STAFF と同一方式)。 |
| **原則 E** | ID が無い旧データを読んだ際の自動付与と「現在の window 上の配列への再採番」は、同一トランザクション (同期的) で完結させる。中間状態を他モジュールに見せない。 |

---

## 1. 差分マトリクス

### 1.1 `js/state/state.js` (本番 388 行 vs 旧 相当多数)

| 項目 | 本番 (現状) | 旧 STAFF | V3 で必要な変更 |
|------|-----------|---------|---------------|
| `joints` 配列 | `[{x,y,z}]` | `[{id, x, y, z}]` | Phase 1 で `id` 付与 (Phase 1 のみでは**まだ ID を使わない**。配列には入っているだけ) |
| `beams` 配列 | `[{a,b,mesh,label,length,material,isCustom,customLength}]` | `[{id, a, b, aId, bId, type, mesh, material, isCustom, customLength, note?}]` | Phase 1 で `id, aId, bId` を**追加**、既存の `a, b, mesh` 等はそのまま保持 |
| `poles` 配列 | `[{a,b,mesh,label,length,material,isCustom,customLength}]` | `[{id, a, b, aId, bId, type, mesh, material, isCustom, customLength}]` | 同上 |
| `legs` 配列 | `[{jointIndex, material, mesh}]` | `[{id, jointIndex, jointId, material, mesh, height}]` | 同上。`height` は Phase 1 では追加しない (旧の拡張、現本番の挙動変更を避ける) |
| `window.todos` | 未定義 | `[{id, text, done, createdAt, authorEmail}]` の配列 | Phase 1 では追加しない (Phase 4 で ToDo 移植時) |
| `window.currentProjectId` | 未定義 | 定義済み (`let` → `window.currentProjectId = null`) | **Phase 2** で導入 |
| `window.__designFileMeta` | 未定義 | 定義済み (createdBy/At, updatedBy/At) | **Phase 2** で導入 |
| セッター防護 | `beams`/`poles`/`joints` 等は `defineProperty` setter で `console.warn` 済み | 同じ | 既存の防護を維持。V3 では `shelves/panels/todos` も同様に保護する (Phase 4) |

### 1.2 `js/parts/joints.js` (本番 393 行 vs 旧)

| 関数 | 本番 | 旧 | V3 で必要な変更 (Phase 1 範囲) |
|------|------|---|-----------------------------|
| `findJointIndexAt(pos)` | 位置一致 (`1e-3`) で `index` | 位置一致で `index` | 変更なし |
| `createJoint(pos)` | `joints.push({x,y,z})` して `return joints.length-1` | `const joint = {id: newJointClientId(), x, y, z}; joints.push(joint); (collab send); return joints.length-1` | **変更**: `const joint = {id: newJointClientId(), x, y, z}; joints.push(joint)` に書き換える。collab send 等のフックは Phase 4 で追加。 |
| `newJointClientId()` | **存在しない** | `crypto.randomUUID()` または `j-${time}-${rand}` | **新規追加**: `js/state/id-utils.js` (新規) に `newJointClientId`, `newBeamClientId`, `newPoleClientId`, `newLegClientId` をまとめて置く |
| `setSelectedJoint(index)` | 存在する | 存在する + `__staffPresenceSetEditingTarget` 等のフック | Phase 1 では**変更なし** |
| `deleteJoint(index)` | 存在する ( `splice` でインデックス再採番) | 存在する + `aId/bId` 参照の削除も担保 | **変更**: 削除時に `beams/poles/legs` 側の `aId/bId/jointId` も `null` 化 (孤立化) する補助関数を追加。インデックス再採番はこれまでどおり発生する。 |
| `updateConnectorsForJoint(jointIndex)` | 存在する | 存在する | 変更なし |

**ID 補完ロジック (`ensureJointIdsForAll()`)**:
- `applySnapshotFromString` / `rebuildSceneFromData` で**先頭に呼ぶ**新規関数
- `joints.forEach(j => { if (!j.id) j.id = newJointClientId(); })`
- 既存 `id` は尊重。空文字 `""` も「無効」扱いで再採番

### 1.3 `js/parts/connectors.js` (本番 304 行 vs 旧 相当)

| 関数 | 本番 | 旧 | V3 で必要な変更 (Phase 1 範囲) |
|------|------|---|-----------------------------|
| `hasBeamBetween(aIndex, bIndex)` | インデックス照合のみ | インデックス + ID 照合 | **拡張**: `hasBeamBetweenById(aId, bId)` を**新規追加**し、`hasBeamBetween` 側で `aId/bId` があればそれで照合、無ければインデックスで照合、の 2 段構えに |
| `hasPoleBetween` | 同上 | 同上 | 同上 |
| `addBeamConnection(aIndex, bIndex)` | `beams.push({type:"beam", a, b, mesh, ...})` | `beams.push({id, type, a, b, aId, bId, mesh, ...})` + collab send | **変更**: `const beam = {id: newBeamClientId(), type:"beam", a: aIndex, b: bIndex, aId: joints[aIndex]?.id ?? null, bId: joints[bIndex]?.id ?? null, mesh, ...}; beams.push(beam)` に書き換える。 collab send は Phase 4。 |
| `addPoleConnection` | 同上 | 同上 | 同上 (`newPoleClientId()`、`type:"pole"`) |
| `deleteConnectorByMesh(hit)` | インデックス起点で `splice` | インデックス起点、`aId/bId` 残骸は Phase 4 の `removeBeam` op で処理 | Phase 1 では**変更なし**。Phase 4 で削除 op を発行する際に `id` ベースで送信する |
| `createConnectorBetweenJoints(aIndex, bIndex)` | 既存 | 既存 | 変更なし |
| `getDistanceMmBetweenJoints` | 既存 | 既存 | 変更なし |

**ID 補完ロジック (`ensureConnectorIdsForAll()`)**:
- `applySnapshotFromString` / `rebuildSceneFromData` で `ensureJointIdsForAll()` の**次に**呼ぶ
- `beams.forEach(b => { if (!b.id) b.id = newBeamClientId(); if (!b.aId && joints[b.a]) b.aId = joints[b.a].id; if (!b.bId && joints[b.b]) b.bId = joints[b.b].id; })`
- `poles.forEach(...)` も同様
- **重要**: `b.aId` が無く `joints[b.a]` の位置が変わっている (例えばジョイント削除で再採番された) 場合、`b.aId` は**位置から照合する補助**も通す。本来は `applySnapshot` 時にそんなズレは起きないが、安全策として `findJointIndexAtPos` フォールバックを 1 段入れる

### 1.4 `js/parts/legs.js` (本番 193 行 vs 旧 相当)

| 関数 | 本番 | 旧 | V3 で必要な変更 |
|------|------|---|---------------|
| `addLegIfNeeded(jointIndex)` | `legs.push({jointIndex, material, mesh})` | `legs.push({id, jointIndex, jointId, material, mesh, height})` | **変更**: `const leg = {id: newLegClientId(), jointIndex, jointId: joints[jointIndex]?.id ?? null, material, mesh}; legs.push(leg)` に書き換え。`height` は追加しない (旧の拡張)。 |
| `toggleLegForJoint(jointIndex)` | `legs.findIndex(l => l.jointIndex === jointIndex)` | 同じ (ID でも検索可能) | Phase 1 では**変更なし**。 Phase 4 で ID ベース削除 op 送信を追加 |

**ID 補完ロジック (`ensureLegIdsForAll()`)**:
- `legs.forEach(l => { if (!l.id) l.id = newLegClientId(); if (!l.jointId && joints[l.jointIndex]) l.jointId = joints[l.jointIndex].id; })`

### 1.5 `js/features/file.js` (本番 485 行 vs 旧 888 行)

| 項目 | 本番 | 旧 | V3 で必要な変更 |
|------|------|---|---------------|
| 保存 JSON 形式 | フラット `{joints, beams, poles, legs, manualLegs, shelves, panels}` | ラップ `{name, projectId, createdBy, createdAt, updatedBy, updatedAt, snapshot: {...}}` | **Phase 2** でラップ形式に移行。 Phase 1 ではフラットのまま、ただし `id/aId/bId/jointId` を**保存**するよう `createSnapshotLocal` に追記 |
| `createSnapshotLocal()` | `beams.map(b => ({a, b, isCustom, customLength, material}))` | `beams.map(b => ({type, a, b, ...(b.id!=null?{id:b.id}:{}), ...(b.aId?{aId:b.aId}:{}), ...(b.bId?{bId:b.bId}:{}), isCustom, customLength, material}))` | **変更**: `beams/poles/legs/joints` に `id/aId/bId/jointId` の条件付き保存を追加 |
| `applySnapshotFromString(str)` | 旧フラット JSON 直接 parse → `rebuildSceneFromData` | ラップ形式 + フラット形式両対応 + ID 補完 | **Phase 1 変更点**: `JSON.parse` 直後に以下を実行: 1) `data` に `snapshot` キーがあればラップ形式として展開, 2) ID 補完ロジック (`ensureJointIds/ConnectorIds/LegIds`) を呼ぶ, 3) 既存の配列再構築を実行 |
| 新規追加関数 | — | `createCurrentSnapshot()`, `buildDesignFilePayload({forceNewProjectId})`, `generateNewProjectId(name)`, `resetAllLocalState()` | Phase 1 では追加しない (Phase 2 でまとめて導入) |
| `openDesignFromFilePicker` | 既存 | 既存 + `projectId` 継承 + `__designFileMeta` 保存 | Phase 2 で拡張 |

### 1.6 `js/features/history.js` (本番 174 行 vs 旧 268 行)

| 項目 | 本番 | 旧 | V3 で必要な変更 |
|------|------|---|---------------|
| `saveHistory(reason)` | `createSnapshot()` 全体を文字列として積む | 同じ + `__staffCollabClearPendingOps` + `__collabClearStacks` | Phase 1 では**変更なし**。Phase 4 で collab stack 連携のフックを追加 |
| `undo()` / `redo()` | `historyIndex` を進めて `loadHistory` | 同じ + collab 逆 op 送信 + `__collabRecordForwardOp` | Phase 1 では**変更なし**。Phase 4 で `__staffCollabSendOp` + 逆操作生成を追加 |
| `loadHistory(index)` | `applySnapshotFromString` を呼ぶ | 同じ (ID 補完は applySnapshotFromString 側) | 変更なし (file.js 側の変更で自動的に ID 補完が走る) |

**重要**: Phase 1 完了時点では `saveHistory` によって積まれるスナップショットには `id/aId/bId/jointId` が**既に含まれている** (file.js の `createSnapshotLocal` 変更で実現)。これにより Undo → Redo でも ID は変わらない。

---

## 2. 具体的な変更ファイル一覧 (Phase 1 で触るファイル)

### 新規追加
- `js/state/id-utils.js` (新規・約 50 行)
  - `newJointClientId()`, `newBeamClientId()`, `newPoleClientId()`, `newLegClientId()`
  - いずれも `crypto.randomUUID` または `${prefix}-${time36}-${rand36}` の生成
  - 読み込み順序: `js/utils/common.js` の**直後** (他の `js/parts/*.js` より前)
- `js/data/ensure-ids.js` (新規・約 80 行)
  - `ensureJointIds(joints)`, `ensureConnectorIds(beams, poles, joints)`, `ensureLegIds(legs, joints)`
  - `applyIdBackfillToWindow()` — `window.joints/beams/poles/legs` に対して上記 3 本をまとめて呼ぶ
  - 読み込み順序: `id-utils.js` の次

### 既存変更
- `js/parts/joints.js`
  - `createJoint(pos)`: push する joint オブジェクトに `id` を付与
  - `deleteJoint(index)` (もし存在すれば): 相対する `beams/poles` の `aId/bId` を `null` にする補助呼び出し
- `js/parts/connectors.js`
  - `addBeamConnection(aIndex, bIndex)`: push する beam に `id/aId/bId` を付与
  - `addPoleConnection(aIndex, bIndex)`: 同上
  - `hasBeamBetween/hasPoleBetween`: ID 併存版の拡張 (必要になった時点で、Phase 1 では**元のインデックス照合のまま**にする判断もあり — Phase 4 まで保留可)
- `js/parts/legs.js`
  - `addLegIfNeeded(jointIndex)`: push する leg に `id/jointId` を付与
- `js/features/file.js`
  - `createSnapshotLocal()`: `id/aId/bId/jointId` を含めて出力
  - `applySnapshotFromString(str)`: 配列再構築の**直後**で `applyIdBackfillToWindow()` を呼ぶ
- `index.html`
  - `<script src="js/utils/common.js">` の**次に** `<script src="js/state/id-utils.js">` と `<script src="js/data/ensure-ids.js">` を追加

### 変更しないファイル (Phase 1 時点)
- `js/state/state.js` (配列定義のみ、形は後方互換で変化なし)
- `js/features/history.js` (単に `createSnapshot` を呼ぶだけなので、file.js 側の変更で自動対応)
- `js/features/estimate.js` (インデックス参照のみ、ID 非依存)
- `js/features/autolayout.js` (同上)
- `js/features/stock-reconcile.js` (同上)
- `js/features/display.js` (同上)
- `js/parts/boards.js` (`j4` は `jointIndex[]`、Phase 4 で `jointId[]` も検討)
- `js/ui/*.js` (非依存)
- `main.js` (非依存。Phase 4 で collab フック追加)
- `js/ui/staff-collab-mode.js` (Phase 4 で置き換え、Phase 1 では**触らない**)

---

## 3. ID 補完時の参照整合性 — ユースケース別検証

| ケース | 動作 | 検証 |
|-------|------|------|
| **UC-1**: Phase 1 デプロイ直後、既存 Flat JSON を開く | `applySnapshotFromString` → `applyIdBackfillToWindow` が全要素に ID を自動付与 → 以降の `createSnapshot` は ID 付きで保存 | 開いた直後と再保存後で、要素数・位置・材質・接続関係が同一 |
| **UC-2**: Phase 1 で保存した JSON を Phase 1 で再度開く | 既に ID 付きなので `ensureIds` は no-op (既存 ID を尊重) | ラウンドトリップで ID が不変 |
| **UC-3**: Phase 1 の `createJoint` 後に `applySnapshotFromString` で Undo | Undo で履歴から復元 → 復元された joints には既に ID あり → `ensureIds` 冪等で no-op | Undo 前後で既存 ID が変わらない |
| **UC-4**: 旧 STAFF 版で保存されたラップ形式を Phase 1 で開く | Phase 1 の applySnapshotFromString は**ラップを剥がして `snapshot` を使う**ように拡張、`projectId` は Phase 1 では無視 (window には書かない)、以降 Phase 1 では一切使わない | 旧 STAFF JSON が開けて、要素数・位置・材質が同一 |
| **UC-5**: 旧 JSON を開いた直後に新規に `createJoint` | 既存 joints には ID あり、新規 joint にも ID あり | 混在しても連番問題なし |
| **UC-6**: `deleteJoint(3)` で index 3 を削除、`beams[7].a === 3` が指すものが変わる | Phase 1: 既存ロジックのまま。`deleteJoint` 内で該当 beams を削除 or 移動する既存処理が走る → `applyIdBackfillToWindow` を**毎 delete 後に走らせない** (ID はそのまま保持されるため) | Undo で復元時、`beams[7].a` 等のインデックスは再計算されるが、`beams[7].aId` は保存時のまま。整合性は `a === findIndexById(aId)` を信頼する **Phase 4 の方針** に合致 |
| **UC-7** (Phase 4 で検証): リモートから `addBeam` op 受信、`aId` が自分の `joints` に存在しない | 旧 STAFF と同じく `pendingBeamOps` に入れ、`addJoint` op 到着後にフラッシュ | Phase 4 のテスト項目 |

---

## 4. 旧 Flat JSON と 旧 STAFF ラップ形式の読み込み互換性

### 4.1 Phase 1 時点での対応

```js
// 疑似コード: applySnapshotFromString の冒頭
function applySnapshotFromString(str) {
  const raw = JSON.parse(str);

  // ラップ形式判定: snapshot キーがあれば剥がす
  // (旧 STAFF ラップ, 将来の V3 ラップ, 両方に対応)
  const data = (raw && typeof raw === "object" && raw.snapshot && typeof raw.snapshot === "object")
    ? raw.snapshot
    : raw;

  // Phase 1 では raw.projectId / raw.updatedBy は無視 (Phase 2 で有効化)

  // 以下、既存の rebuildSceneFromData 相当処理
  // ...
  applyIdBackfillToWindow();  // ← Phase 1 で新規追加
  rebuildSceneFromData();
}
```

### 4.2 読み込み可能な形式一覧

| 形式 | 判定キー | Phase 1 対応 | Phase 2 対応 |
|------|---------|------------|-------------|
| 旧 Flat (本番現状) | `joints` が root | ✅ | ✅ |
| 旧 STAFF ラップ | `snapshot.joints` が存在、`projectId` あり | ✅ (ラップ剥がし) | ✅ (`projectId` も復元) |
| V3 ラップ | `snapshot.joints` が存在、`projectId` あり、要素に `id` 付き | ✅ (ID は既にある) | ✅ |
| Desktop 旧版 | 旧 Flat と同一 | ✅ | ✅ |

---

## 5. Undo / Redo との整合性

### 5.1 現状
- `saveHistory(reason)` は `createSnapshot()` を文字列として `window.history[]` に積む
- `undo()` / `redo()` は `window.history[newIndex]` を取り出して `applySnapshotFromString` を呼ぶ

### 5.2 Phase 1 変更後の挙動
1. ユーザーが `createJoint` → joint に `id: j-XXX` が付く
2. `saveHistory("create joint")` → スナップショットに `id: j-XXX` が含まれる
3. ユーザーが `undo()` → 前のスナップショット (joint が無い) を applySnapshotFromString
4. ユーザーが `redo()` → joint ありスナップショットを applySnapshotFromString → `ensureJointIds` が走るが**既に id が入っている**ので no-op → `id: j-XXX` のまま復元

### 5.3 重要な不変条件
- **一度採番された ID は、Undo/Redo をどう往復させても変わらない**
- これにより Phase 4 で collab op を発行する際、Undo した操作を Redo しても同じ ID を参照し続けられる

---

## 6. 部品削除・インデックス再採番との整合性

### 6.1 現状の挙動
- `deleteConnectorByMesh(hit)` → `beams.splice(idx, 1)` → `beams[idx 以降]` のインデックスがずれる
- `deleteJoint(index)` (もし存在) → `joints.splice(index, 1)` → `beams/poles` の `.a` / `.b` インデックス、`legs[].jointIndex` が**すべてずれる** (おそらく既存コードで補正している)

### 6.2 Phase 1 変更後
- `splice` によってインデックスがずれても、`id` / `aId` / `bId` / `jointId` は**不変**
- Phase 4 の collab op 送信・適用時には**ID を主、インデックスを従**として扱う
- Phase 1 時点では、既存の index 中心のロジックに手を入れない。ID はただ「乗っかっている」だけ

### 6.3 Phase 4 で解決する課題 (Phase 1 では対応しない)
- `deleteJoint(idx)` の時に `beams/poles/legs` の該当 `aId/bId/jointId` を**明示的に** null にする必要があるか (インデックスは splice 後に残骸が残ることがある)
- インデックス再採番と ID の整合を定期的に突き合わせる自動チェック (`validateDataConsistency()`)

---

## 7. リモート操作の重複受信・順序逆転・通信断への対応 (Phase 4 設計の予告)

本章は Phase 1 の範囲外だが、Phase 1 で導入する ID 設計がこの要件を**満たせるかどうか**を検証する目的で記載。

### 7.1 重複受信
- Firestore `onSnapshot` は同じ doc を複数回配信することがある (`docChanges("added")` で絞っても、再接続時に過去 doc が再配信される)
- **対策**: 各 op doc に `opId` (`newOpId()` で生成した UUID 相当) を持たせ、受信側は `processedOpIds: Set<string>` で dedupe
- **Phase 1 の ID 設計との関係**: 各 joint/beam/pole/leg の `id` と、`opId` は**別物**。前者はエンティティ ID、後者は操作 ID

### 7.2 順序逆転
- Firestore の `createdAt` serverTimestamp は書き込み完了時刻、クライアント側は `Date.now()` の `createdAtMs` も併記
- `onSnapshot` の順序は `createdAt` の `orderBy("createdAt", "asc")` で担保
- **ただし**: 2 PC で同時に発行された op が同じ ms (`createdAt`) になった場合は順序未定。この時、`addBeam` の `aId/bId` が指す `addJoint` op が**先に届かない**ケースが起きる
- **対策** (旧 STAFF の方式):
  - 未解決の `aId/bId` を参照する op は `pendingBeamOps` に enqueue
  - 対応する `addJoint` op が届いた時点で `flushPendingBeamOps` を実行
  - 旧 STAFF では `beamPendingKey(beam)` で重複を回避
- **Phase 1 の ID 設計との関係**: `aId/bId` が ID 空間で一意に決まるので、順序逆転があっても最終的な整合が取れる

### 7.3 通信断
- `beforeunload` / `pagehide` で `presence doc` を自動削除 (旧 STAFF の `installUnloadPresenceCleanup`)
- 再接続時には `hydrateFromLatestRemoteSnapshot` で最新 snapshot からリセット → その後の ops だけを live 購読
- **Phase 1 時点での対応**: 既存の `staff-collab-mode.js` (500ms スナップショット方式) は Phase 4 まで動き続ける。 Phase 1 の ID 導入は、この簡易実装にも**悪影響なし** (保存 JSON が `id` を含むようになるだけ)

---

## 8. 競合編集時のリビジョン検知 (Phase 4 設計)

**ソフトロック警告だけでは不十分**という指摘を踏まえ、以下 2 層構造を Phase 4 で実装する:

### 8.1 第 1 層: ソフトロック (UI 警告)
- 旧 STAFF の `warnSoftLockConflict` を移植
- 「他のユーザーが編集中です」のバナー表示のみ、**拒否はしない**
- プレゼンス情報 (`presence/{clientId}.target`) をベースに判定

### 8.2 第 2 層: Firestore トランザクションによるリビジョン検証 (**新規設計**)
- 各エンティティ (`beams`, `poles`, `legs`) に対する「変更系 op」 (`moveJoint`, `updateBeamLength`, `removeBeam` 等) は、**ドキュメント個別のバージョン doc** を持つ
- `projects/{pid}/entities/{entityId}` に `{ revision: number, updatedAt, updatedBy }` を保存
- op を送信する前に `runTransaction` で:
  1. `entities/{entityId}` を読む
  2. ローカルで持っている `revision` と比較
  3. 一致: `revision` を +1 して ops に append
  4. 不一致: トランザクションを**ロールバック**し、UI に「他のユーザーが先に変更しました。再読み込みして下さい」と表示
- 同時 `addBeam` 等の**新規作成系** op はエンティティ ID がクライアント生成なので衝突しない (自己採番 UUID)

### 8.3 Phase 1 の ID 設計との関係
- `beams[i].id` が決まっていれば `entities/{id}` のパスが即座に作れる
- Phase 1 で ID を導入しておくことが、Phase 4 のトランザクション実装の**前提条件**

---

## 9. 旧 STAFF 版の操作ログがそのまま使えるか

### 9.1 既存 Firestore データ (推定)
旧 STAFF Firebase プロジェクト `cuberackstudio-staff` の `projects/{pid}/ops/*` には、以下の `actionType` を持つ doc が蓄積されている可能性がある:
`addJoint`, `removeJoint`, `addBeam`, `removeBeam`, `addPole`, `removePole`, `addLeg`, `removeLeg`, `addNote`, `updateNote`, `addTodo`, `toggleTodo`, `removeTodo`, `RESET_ALL`, `SNAPSHOT_APPLY`

### 9.2 Phase 4 で継続購読する際の互換性
| op タイプ | V3 で引き継ぎ可能か | 備考 |
|-----------|-----------------|------|
| `addJoint` | ✅ そのまま適用可能 | `payload.joint.{id,x,y,z}` を使う |
| `addBeam` / `addPole` / `addLeg` | ✅ そのまま適用可能 | `payload.beam.{id, aId, bId, ...}` 等 |
| `removeBeam` / `removePole` / `removeLeg` / `removeJoint` | ✅ そのまま適用可能 | `payload.id` を使って ID 検索 |
| `addNote` / `updateNote` | ✅ そのまま適用可能 (Phase 4 で note UI も復活する場合) | 本番現状には note 機能が無い。Phase 4 でも note UI を付けないなら、受信時は無視する選択肢 |
| `addTodo` / `toggleTodo` / `removeTodo` | ✅ そのまま適用可能 | Phase 4 で ToDo 実装 |
| `RESET_ALL` | ✅ そのまま適用可能 | 既存の `resetAll` を呼ぶだけ |
| `SNAPSHOT_APPLY` | ✅ そのまま適用可能 | `payload.snapshot` を `applySnapshotFromString(JSON.stringify(payload.snapshot))` |

### 9.3 変換不要と判定した根拠
- 旧 STAFF と V3 の op タイプは完全一致 (Phase 4 で新規 op タイプを追加しない方針)
- payload スキーマも完全一致 (ID フィールド名が同じ: `id, aId, bId, jointId`)
- `generation` フィールドも共通 (旧 STAFF の `parseGeneration` 相当を V3 でも使う)

### 9.4 懸念点
- 旧データに**存在するが V3 で使わないフィールド**: `payload.beam.note` (本番 UI にノート機能なし)
  - 対応: 受信時に無視、保存時には書き込まない。将来 note UI を復活させる際にそのまま使える
- `firestoreCreatedAtToMs` 等の変換関数は V3 でも必要

---

## 10. firebase.json / .firebaserc の必要性

### 10.1 現状
- `source/` にも `_REFERENCE_staff-source-2026-08/` にも `firebase.json` / `.firebaserc` は**存在しない**
- 旧 STAFF では `firebase deploy --only firestore:rules` が実行されたかどうか不明 (CI 設定も無い)
- 本番 Netlify は `netlify.toml` の `publish = "."` + `command = "echo static"` で静的ファイルを配信するのみ (Firebase CLI は未使用)

### 10.2 必要性判定
| ファイル | 新規作成 | 理由 |
|---------|---------|------|
| `firebase.json` | **Phase 3 で必要** (今回は作らない) | `firestore.rules` をデプロイするために `{"firestore": {"rules": "firestore.rules"}}` が必要 |
| `.firebaserc` | **Phase 3 で必要** (今回は作らない) | `{"projects": {"default": "cuberackstudio-staff"}}` でプロジェクト指定 |
| `functions/` ディレクトリ | **不要** | Phase 5 の Netlify Function 案を採用する場合、`netlify/functions/` に置くため Firebase Functions は使わない |

### 10.3 本 Phase 0 では作成しない
- 作成すると「デプロイできる状態」になり、間違って `firebase deploy` を打つ事故リスクがある
- **Phase 3 の着手承認後に、デプロイコマンド実行の直前**で作成する

---

## 11. 本 Phase 0 で確認した副次的事項

- 本番 `source/` には `package.json` が無い → ESLint・テスト・ビルドのスクリプトは一切無い → Phase 1 で `package.json` を導入するかは別途議論 (手動テストで通せる間は追加しない方針)
- 本番 Netlify は静的サイト配信のみ、Netlify Functions は未使用 → Phase 5 で初めて Functions ディレクトリを作る
- `source/.gitignore` の中身は 34 バイトと極小 (おそらく `node_modules/` 1 行のみ)
- 既存 Firestore のルールが「本番で何が有効か」は Firebase Console でしか確認できない → Phase 3 の最初に「現行ルールのスクリーンショット or export を手動で取る」ステップが必要
