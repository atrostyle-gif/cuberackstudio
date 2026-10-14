# V3 共同編集アーキテクチャ確定

作成日: 2026-10-14
ステータス: **設計確定 (実装はしない)**

本ドキュメントは Phase 4 以降で実装する共同編集機能の最終設計を確定する。
Phase 1–3 の作業はすべて、本設計に収束するように進める。

---

## 0. 現状の確認 — 何が危険か

本番 `source/js/ui/staff-collab-mode.js` (176 行) は次の問題を抱える:

```
- 500ms 間隔で `createSnapshot()` を Firestore `projects/{roomId}.set({...}, {merge:true})` に書き込む
- 他ユーザーのスナップショットが到着すると `applySnapshotFromString()` を呼び、
  `clearAllMeshes()` → 全オブジェクト削除 → `rebuildSceneFromData()` でまるごと再構築する
- `writeState()` と `applySnapshotFromString()` の間で**ラストライターウィンズ**が発生する
```

### 具体的な事故シナリオ

| 時刻 | ユーザー A (PC1) | ユーザー B (PC2) | 結果 |
|-----|-----------------|-----------------|------|
| t=0 | 初期状態 (ジョイント 10) | 同じ初期状態 | OK |
| t=200ms | ジョイント追加 → 11 個 | — | OK (writeState で送信) |
| t=400ms | — | ジョイント追加 → 11 個 (別位置) | B の 11 個目は A のとは別物 |
| t=500ms | スナップショット書き込み (11 個、A が追加したジョイントのみ) | — | A の状態が勝つ |
| t=600ms | — | スナップショット書き込み (11 個、B が追加したジョイントのみ) | **B の状態が勝つ → A の追加が消える** |
| t=800ms | スナップショット受信 → 自分の 11 個を捨てて B の 11 個に置き換え | — | **A の作業が消滅** |

これが「複数 PC で編集するとデータが消える」の正体である。

---

## 1. Phase 4 で導入するアーキテクチャ (ops ベース)

### 1.1 概要図

```
┌──────────────────┐         Firestore           ┌──────────────────┐
│  Client A (PC1)  │   projects/{projectId}/     │  Client B (PC2)  │
│                  │   ├ ops/*  (push-only)       │                  │
│  ops を enqueue  │──→│   (addJoint, addBeam..) │←──  ops を subscribe │
│  即座に送信      │   │                          │  即座に適用      │
│                  │   ├ snapshots/*             │                  │
│  10 op or 60s    │──→│   (SNAPSHOT_APPLY)      │  catchup 時に読む │
│  ごとに snapshot │   │                          │                  │
│                  │   ├ presence/{clientId}     │                  │
│  3s heartbeat    │──→│   (name, color, target) │←──  リモート cursor │
└──────────────────┘   └────────────────────────┘   └──────────────────┘
```

### 1.2 コレクション構造

```
projects/{projectId}
  (document)
    name: string
    projectId: string              # 冗長保持 (ドキュメントID と同じ)
    createdByUid: string
    createdByEmail: string
    createdAt: Timestamp
    updatedBy: string
    updatedAt: Timestamp
    memberUids: string[]           # ルール isMember() が参照
    latestSnapshotGeneration: number

  /ops/{opId}
    opId: string                   # クライアント生成の UUID
    actionType: string             # addJoint | addBeam | ... | SNAPSHOT_APPLY | RESET_ALL
    payload: map                   # 操作内容。詳細は 2.2 節
    clientId: string               # 発行者 (window.__clientId)
    createdByUid: string
    createdByEmail: string
    generation: number             # snapshot 世代番号
    createdAt: Timestamp (server)  # 購読の orderBy キー
    createdAtMs: number            # クライアント計測 (同じ ms の衝突検知)

  /snapshots/{snapshotId}
    snapshot: map                  # createSnapshot() の中身
    reason: string                 # "manual save" | "autosave" | "op-threshold"
    actorUid: string
    opId: string                   # 連動する ops/*.opId
    generation: number
    createdAt: Timestamp

  /presence/{clientId}
    uid: string
    email: string
    name: string
    color: string                  # cursor の色
    currentAction: string          # "editing" | "idle" | "saved"
    target: map                    # {type: "beam", id: "..."} 等。ソフトロック判定に使う
    cursor: map                    # {x, y, z} 世界座標 (3D cursor 用、Phase 4.5 で検討)
    lastSeenAt: Timestamp

  /entities/{entityId}             # Phase 4 第 2 層 (競合リビジョン検証用、新設)
    revision: number
    updatedAt: Timestamp
    updatedByUid: string
```

**(廃止): Phase 1–3 の過渡期、本番の `projects/{roomId}` に書かれる単一スナップショットは、Phase 4 デプロイと同時に全プロジェクトで `/snapshots/*` に移行する。**

---

## 2. 操作種別と payload スキーマ

### 2.1 全 op タイプ一覧 (旧 STAFF と完全互換)

| actionType | payload | 発火元 (Phase 4 で変更するフックポイント) |
|------------|---------|-----------------------------------------|
| `addJoint` | `{joint: {id, x, y, z}}` | `js/parts/joints.js :: createJoint()` の `joints.push()` 直後 |
| `removeJoint` | `{id}` | `js/parts/joints.js :: deleteJoint()` 内 |
| `addBeam` | `{beam: {id, aId, bId, isCustom, customLength, material, type:"beam"}}` | `js/parts/connectors.js :: addBeamConnection()` の `beams.push()` 直後 |
| `removeBeam` | `{id}` | `js/parts/connectors.js :: deleteConnectorByMesh()` 内 |
| `addPole` | 同 addBeam | `js/parts/connectors.js :: addPoleConnection()` 直後 |
| `removePole` | `{id}` | 同 |
| `addLeg` | `{leg: {id, jointId, material}}` | `js/parts/legs.js :: addLegIfNeeded()` 直後 |
| `removeLeg` | `{id}` | `js/parts/legs.js :: toggleLegForJoint()` の削除分岐 |
| `addNote` | `{note: {id, text, createdAt, authorEmail}}` | **Phase 4 では UI 未復活のため実装しない** (受信時に無視) |
| `updateNote` | 同上 | 同上 |
| `addTodo` | `{todo: {id, text, done:false, createdAt, authorEmail}}` | **Phase 4 で ToDo UI 復活時**。 Phase 4.1 で `js/ui/staff-collab-mode.js` の後継に ToDo パネル追加 |
| `toggleTodo` | `{id, done}` | 同上 |
| `removeTodo` | `{id}` | 同上 |
| `RESET_ALL` | `{}` | `js/features/file.js :: resetAll()` 内 (もしくは「新規プロジェクト」ボタン) |
| `SNAPSHOT_APPLY` | `{snapshot, reason}` | 自動 snapshot 生成時 (後述 3.3) |
| `MOVE_JOINT` | **新規**: `{id, x, y, z, revision}` | `js/parts/joints.js` の未来のドラッグ機能 (Phase 4 では範囲外) |
| `UPDATE_BEAM_LENGTH` | **新規**: `{id, customLength, isCustom, revision}` | 「長さ変更モード」内。 Phase 4 で**同一線上のパーツも巻き込む**仕様を含めて移植 |

### 2.2 共通フィールド
- `opId`: クライアント生成 (`newOpId()`)、subscribe 側の dedupe に使う
- `clientId`: `window.__clientId` (`crypto.randomUUID()` で初期化、`localStorage` に永続化)
- `generation`: 直近の snapshot_apply 世代。 generation < latestSnapshotGeneration の op は**破棄**

---

## 3. 送信・受信パイプライン

### 3.1 送信 (ローカル操作 → Firestore)

```
ユーザー操作
  ↓
js/parts/*.js の既存関数 (createJoint, addBeamConnection, ...)
  ↓
window.__staffCollabSendOp({ type, payload })  ← Phase 4 で追加するフック
  ↓
staff-collab.js :: enqueueOp(op)
  ↓ (バッチング: 100ms デバウンス)
Firestore ops.add(op)
  ↓
（他クライアントの onSnapshot リスナーが受信）
```

**重要**: `window.__staffCollabSendOp` が未定義のとき (collab モードオフ時) は no-op。 Phase 1–3 では当然この関数は存在しないため、新規 ID が付いても何も送信されない (安全)。

### 3.2 受信 (Firestore → ローカル state)

```
Firestore ops.onSnapshot (orderBy createdAt)
  ↓
docChanges("added") を抽出
  ↓
各 op doc:
  1) processedOpIds に既にあれば skip (重複)
  2) op.generation < latestSnapshotGeneration なら skip (古い)
  3) op.clientId === window.__clientId かつ shouldApplyRemoteOpDespiteSelf でなければ skip (自分の操作)
  4) それ以外は applyRemoteOp(op) を呼ぶ
  ↓
applyRemoteOp:
  switch (op.actionType) {
    case "addJoint": ensureJointIds + joints.push + updateMeshes; break;
    case "addBeam": aId/bId を joints.id で引く → 無ければ pendingBeamOps へ; break;
    ...
  }
  ↓
renderAll() (Three.js scene 再描画)
```

### 3.3 Snapshot 生成 (サーバー状態の確定)

- トリガー:
  - 自分が発行した op の累計が **10** を超えたら
  - または **60 秒** 経過したら (idle タイマー)
  - または明示的な `file.save` 相当操作
- 動作:
  1. `createCurrentSnapshot()` を呼ぶ
  2. `generation = parseGeneration(current) + 1` に更新
  3. `ops/{newOpId}` に `SNAPSHOT_APPLY` op を追加 (他クライアントが catchup せずに自分の履歴に積めるよう)
  4. `snapshots/{newId}` に本体を保存
  5. `scheduleOpsGc(generation, uid)` で **10 秒後** に `generation < 新しい generation` の ops を 10 件ずつ delete
- GC の目的: 読み取り料金・subscribe 時の帯域を抑える

### 3.4 Hydrate (再接続 or 初回参加)

```
subscribeOpsAndPresence 開始
  ↓
hydrateFromLatestRemoteSnapshot(projectId):
  snapshots.orderBy("createdAt desc").limit(1).get()
  ↓
  snapshot.data() を applySnapshotFromString で適用
  ↓
  catchupStartAt = snapshot.createdAt.toMillis()
  ↓
ops.where("createdAt", ">", catchupStartAt).orderBy("createdAt asc").onSnapshot(...)
```

**保証**: 最新 snapshot で追いついた後の ops だけを live 購読するので、履歴全部を読み直す必要がない。

---

## 4. 競合検知 — 2 層構造

### 4.1 第 1 層: ソフトロック (UI 警告)

- 各 presence doc に `target: {type: "beam", id: "beam-id-xxx"}` を書く
- 他ユーザーが同じ target を持っていたら、UI に:
  ```
  ⚠ ○○さんがこの beam を編集中です
  ```
- **操作自体はブロックしない**。ユーザーに注意喚起するだけ
- 旧 STAFF の `warnSoftLockConflict` + `rebuildRemoteActiveTargets` を移植

### 4.2 第 2 層: Firestore トランザクション + リビジョン検証 (**新規**)

旧 STAFF には存在しないが、「ソフトロックの警告だけでは物理的に競合は防げない」との判断で追加する。

#### 対象操作
- `MOVE_JOINT`, `UPDATE_BEAM_LENGTH`, `UPDATE_POLE_LENGTH` 等の**既存エンティティの属性変更**
- `addJoint/addBeam/addPole/addLeg` の**新規追加系は対象外** (ID がクライアント生成 UUID なので衝突しない)

#### フロー
```
ユーザーが beam の長さを 500mm → 600mm に変更
  ↓
db.runTransaction(async (tx) => {
  const entRef = db.doc(`projects/${pid}/entities/${beamId}`);
  const snap = await tx.get(entRef);
  const serverRev = snap.exists ? snap.data().revision : 0;
  if (serverRev !== localRev) {
    throw new ConflictError("先に他のユーザーが変更しました");
  }
  tx.update(entRef, {
    revision: serverRev + 1,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: user.uid,
  });
  tx.set(db.collection(`projects/${pid}/ops`).doc(), {
    actionType: "UPDATE_BEAM_LENGTH",
    payload: { id: beamId, customLength: 600, isCustom: true, revision: serverRev + 1 },
    ...
  });
});
  ↓
成功: ローカル state 更新
失敗: UI にモーダル表示「○○さんが先に変更しました。再読み込みします」
      → hydrateFromLatestRemoteSnapshot() で全体を再同期
```

#### リトライ戦略
- `runTransaction` は Firebase SDK が自動で最大 5 回リトライする (デフォルト)
- 5 回失敗 → `ConflictError` を throw → UI にモーダル
- モーダルで「再読み込み」ボタンを押すと `hydrateFromLatestRemoteSnapshot` で全体同期

### 4.3 新規追加操作 (`addJoint` 等) に競合検知が不要な理由
- `id` がクライアント生成 UUID (重複確率 ≈ 2^-122)
- 位置 (x,y,z) ベースの `findJointIndexAt(pos)` で**位置の重複は検出可能** (旧 STAFF の方式: `jointIdRemap` に別名として記録、以降は `remappedId` を参照)
- 2 PC が偶然同じ位置に joint を追加した → 両方の op が届く → 第 2 op を受信した時点で `findJointIndexAt(pos) !== -1` を検知 → `state.jointIdRemap.set(incomingId, existingId)` に記録して、以降の beam/leg op の `aId/bId/jointId` を自動解決

---

## 5. ToDo 機能の設計 (Phase 4.1)

### 5.1 データ構造
```
projects/{projectId}/todos/{todoId}
  id: string
  text: string
  done: boolean
  createdAt: Timestamp
  authorUid: string
  authorEmail: string
  updatedAt: Timestamp
```

### 5.2 Op タイプ
- `addTodo`, `toggleTodo`, `removeTodo` (すべて payload に `id` 必須)

### 5.3 UI 配置
- 本番現状には ToDo UI が無い
- Phase 4.1 で `js/ui/staff-collab-mode.js` の後継 `js/ui/collab-panel.js` 内にパネルとして追加
- 旧 STAFF の ToDo DOM 構造を参考に移植 (ただし旧の `.staff-todo-list` クラス等は本番の既存 CSS に合わせて renaming)

### 5.4 権限
- `projects/{pid}/todos/*` は `isMember(pid)` のみ read/write/delete 可
- Firestore ルールで保証 (後述 V3_FIRESTORE_SECURITY.md)

---

## 6. STAFF ログイン・ルーム命名規約

### 6.1 認証方式
- 現状: `source/js/ui/staff-collab-mode.js` で `email` + `password` の匿名認証 → `signInWithEmailAndPassword`
- Phase 4 では、Firestore ルール (`isMember`) の判定材料として `request.auth.uid` を使う必要があるので、現状の認証方式そのまま流用可能
- STAFF メンバー管理は Firebase Console で:
  1. Auth にユーザー登録 (meil + pass)
  2. 既存プロジェクトの `memberUids` 配列に uid を追加 (手動 or 招待フロー)
- **Phase 4.2 で導入予定**: 招待フロー (招待トークンを URL に埋める → `signIn` 後に `projects/{pid}.update({memberUids: arrayUnion(uid)})`)

### 6.2 projectId / ルーム命名
- 現状: `js/ui/staff-collab-mode.js` では `roomId` を**ファイル名から生成** or 固定値
- V3: `projectId = generateNewProjectId(name)` → `"[sanitized-name]-[timestamp36]-[rand]"` 相当
- 保存ファイル JSON には `projectId` を含める (Phase 2)
- 開かれたファイルの `projectId` を `window.currentProjectId` にセット → `subscribeOpsAndPresence` が自動的に新しいルームに切り替わる
- `beforeunload` で `presence doc` を削除、unsubscribe

### 6.3 「新規プロジェクト」操作
- `file.resetAll()` を押すと:
  1. 現在の projectId の presence を削除、unsubscribe
  2. `generateNewProjectId("Untitled")` で新しい projectId を発番
  3. `window.currentProjectId = newId`
  4. 新しいプロジェクトの `projects/{newId}` を create (`memberUids: [currentUser.uid]`)
  5. subscribe を再開

---

## 7. STAFF モード と 匿名 (customer) モードの切り替え

### 7.1 現状
- `source/js/ui/staff-collab-mode.js` で `isStaffMode()` 判定
- STAFF モードオフのときは Firestore 書き込みは行わない

### 7.2 V3 でも同じ原則
- `window.__staffCollabSendOp` は STAFF モード時のみ定義される
- 匿名ユーザーは一切 Firestore に書き込まない (ルールでも `signedIn()` で防ぐ)
- 匿名ユーザーは price_catalog の読み取りだけ可能 (Supabase 側 RLS で担保)

### 7.3 UI 分岐
- STAFF ログインボタン → 既存の `installStaffLoginUi` (旧) 相当を Phase 4 で移植
- ログイン前はコラボ機能は一切見えない (ToDo パネル、cursor 表示なども含めて)

---

## 8. タイムライン整合性 — 旧データと新データの共存

### 8.1 Phase 4 デプロイ直後、既存 Firestore に残っている旧データ

| データ種別 | V3 でそのまま使えるか | 対応 |
|-----------|-------------------|------|
| `projects/{pid}` doc (`memberUids` あり) | ✅ そのまま | なし |
| `projects/{pid}` doc (`memberUids` なし、旧 STAFF 初期の doc) | ⚠ ルールで read 拒否される | Phase 3 で `members` マイグレーションを手動実行 (全 project に `memberUids` を補完) |
| `/ops/*` (旧 STAFF) | ✅ そのまま | なし (fieldnames 同一) |
| `/snapshots/*` (旧 STAFF) | ✅ そのまま | なし |
| `/presence/*` (旧 STAFF) | ⚠ 古い presence が残っていると「10 人オンライン」のように見える | Phase 3 で `/presence/*` を全削除 (deploy 前に一度) |
| 本番 (`v2.0-dev`) で書かれた `projects/{roomId}` の単一スナップショット merge | ⚠ V3 スキーマと矛盾 | Phase 3 で `/snapshots/*` にリネーム (手動バックアップ後) or 無視 |

### 8.2 Phase 4 デプロイ直後、旧ブラウザ (v2.0-dev) が接続してきたとき

- 旧ブラウザは `projects/{roomId}.set({...}, {merge:true})` を書く
- V3 ルールでは `projects/{pid}` の update は `isMember` のみ、かつ field 制約もあるので、**書き込みは拒否される**
- 旧ブラウザの UI 上はエラーがコンソールに出るだけで、ローカル編集は継続可能 (ただしクラウド同期は失敗)
- Phase 4 デプロイ**前にユーザー全員に周知**し、全員が新ブラウザを引いた状態にすること

### 8.3 旧クライアントの強制アップデート
- Phase 4 デプロイ時、`index.html` に `<meta http-equiv="cache-control" content="no-cache">` を付ける (または Netlify のキャッシュを purge)
- 全ユーザーに「ブラウザのキャッシュをクリアして下さい」と周知

---

## 9. パフォーマンス試算 (Firestore 無料枠内で収まるか)

### 9.1 読み取り
- 10 人同時編集、各自 1 時間作業
- 平均 10 op/分/人 → 全体 100 op/分 → **1 時間で 6,000 ops**
- 各 op doc は全参加者に 1 回配信 → 読み取り **6,000 × 10 = 60,000 reads/時間**
- 無料枠: **50,000 reads/日** → **超過**

**対策**:
- Snapshot GC で ops コレクションを 10 op ごとにクリアする (旧 STAFF の方式)
- 現実的には 1 プロジェクトに同時 2-3 人、 ops/時間は 500 程度 → 読み取り **1,500 reads/時間** → 無料枠内

### 9.2 書き込み
- 100 op/分 × 10 人 → **全体書き込みは 100 ops/分 (各クライアントは自分の op のみ書く)**
- 無料枠: **20,000 writes/日** → 100 ops/分 × 60 分 × 8 時間 = 48,000 writes/日 → **超過**

**対策**:
- バッチ送信 (100ms デバウンス) で 1 op/write を減らす
- Snapshot 書き込みは 10 op or 60s ごとなので writes を直撃しない
- Presence は 3 秒 heartbeat → 10 人で 200 writes/分 → 日 96,000 writes → **超過**
- **presence の間隔を 10 秒に延長** → 日 28,800 writes → ok

### 9.3 ストレージ
- 無料枠 1 GB
- 平均 project 10 KB (snapshot) × 100 project = 1 MB
- ops GC で古い op は削除 → ストレージ逼迫しない

### 9.4 結論
- **全体として無料枠では危険、Blaze プラン (従量課金) 推奨**
- または Phase 4 時点では「同時編集ユーザー数の上限 3」をドキュメント上の運用ルールとして明記

---

## 10. Phase 1 で導入するフックポイント (スタブ)

Phase 4 で実装する `window.__staffCollabSendOp` の呼び出し**だけ**を、Phase 4 を見据えて予約しておく:

```js
// Phase 1 では send 関数は未定義のため、下記は常に no-op として動作する
if (typeof window.__staffCollabSendOp === "function") {
  window.__staffCollabSendOp({ type: "addJoint", payload: { joint } });
}
```

**ただし**: Phase 1 の仕様では**実装しない**。Phase 1 は「ID 導入 + 保存形式拡張」のみ。 Phase 4 の実装着手時にこの呼び出しを**追加する**。
