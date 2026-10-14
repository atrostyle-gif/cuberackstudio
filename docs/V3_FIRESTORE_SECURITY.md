# V3 Firestore セキュリティ設計

作成日: 2026-10-14
対応ドラフト: `firestore.rules` (本 Phase 0 で作成、**デプロイしない**)

---

## 1. 過去の指摘事項と対応

| 指摘 | 対応 |
|-----|------|
| 認証ユーザーなら誰でも全プロジェクト read/write 可能だった時期がある | `isMember(projectId)` で `memberUids` 配列判定を導入 |
| 非メンバーのクライアントで projects/{pid} が open 状態 | create 時に `createdAsMember(request.resource.data)` で自分を含めた memberUids 必須 |
| ops が任意書き換え可能 | update を全面禁止、create は `createdByUid == auth.uid` 必須 |
| presence の削除で他人を kick できた | `resource.data.uid == auth.uid` または `createdByUid` のみ delete 可 |
| STAFF 判定がクライアント側のみ (Firestore ルールは関与しない) | `staff_members/{uid}` コレクションを予約。 Phase 5 の Netlify Function で参照 |
| ToDo がルール未定義で誰でも書き換え可能 | `todos/{id}` に `isMember` + `authorUid == auth.uid` ルール追加 |
| snapshot GC で他人のスナップショットも消せる | create は `actorUid == auth.uid`、delete は `isMember` のみ (運用上は owner のみ GC) |

---

## 2. 各コレクションの権限表

| パス | create | read | update | delete |
|------|--------|------|--------|--------|
| `/projects/{pid}` | 認証済み + 自分を memberUids に含む + `createdByUid == auth.uid` | `isMember` | `isMember` + 不変フィールド保護 + 自分を除外しない | `createdByUid == auth.uid` のみ |
| `/projects/{pid}/ops/{opId}` | `isMember` + `createdByUid == auth.uid` + `clientId` 必須 | `isMember` | ❌ (append-only) | `isMember` |
| `/projects/{pid}/snapshots/{sid}` | `isMember` + `actorUid == auth.uid` | `isMember` | ❌ | `isMember` |
| `/projects/{pid}/presence/{cid}` | `isMember` + `uid == auth.uid` | `isMember` | `uid == auth.uid` のみ | 自分 or project owner |
| `/projects/{pid}/todos/{tid}` | `isMember` + `authorUid == auth.uid` | `isMember` | `isMember` + authorUid/createdAt 不変 | `isMember` |
| `/projects/{pid}/entities/{eid}` | `isMember` + `updatedByUid == auth.uid` | `isMember` | `isMember` + `revision` 単調増加 | `isMember` |
| `/invitations/{iid}` | 認証済み + `invitedByUid == auth.uid` | 認証済み (すべて) | 招待者 or 受領者 | 招待者 |
| `/staff_members/{uid}` | ❌ (Console のみ) | `isSelf(uid)` | ❌ | ❌ |
| `/pricing/{docId}` | ❌ | ❌ | ❌ | ❌ (Supabase 側に置くため) |
| その他 `/{document=**}` | ❌ | ❌ | ❌ | ❌ |

---

## 3. ルールの不変条件 (invariants)

### 3.1 プロジェクトを「乗っ取れない」こと
- `projects/{pid}` の update で `memberUids` から**自分を外す**行為は禁止
  - 悪意: Attacker が被害者を外して projectを独占 → `request.auth.uid in request.resource.data.memberUids` で防ぐ
- `createdByUid` / `createdAt` / `projectId` は不変 (`keepsField`)

### 3.2 ops ログを「書き換えられない」こと
- update を全面禁止
- 他ユーザーの op を**自分として create** できない (`createdByUid == auth.uid` 必須)
- delete は許すが、これは snapshot GC 用 (write-once-destroy のみ)

### 3.3 presence を「他人として create・偽装」できないこと
- `uid == auth.uid` が create / update の必須条件
- 他人の presence を create → 画面に偽の在席表示 → 「他ユーザーが編集中」の警告が誤発火、を防ぐ

### 3.4 entities のリビジョン検証
- update の際に `request.resource.data.revision > resource.data.revision` を要求
- クライアント側で revision を +1 して書く → ルールで単調増加を保証
- 2 PC 同時書き込みで片方が負ける (後着クライアントは revision が同じなので違反 → 拒否)

---

## 4. 旧データとの互換性

### 4.1 既存 `projects/*` doc で `memberUids` が無いもの
- V3 ルールでは `isMember()` が `memberUids` 配列参照のため、**read ですら拒否される**
- Phase 3 で手動 or スクリプトで補完する:
  ```
  for each projects/{pid}:
    if memberUids is missing or null:
      memberUids = [createdByUid]  (もし createdByUid があれば)
      memberUids = [知っている STAFF 全員の uid]  (もし createdByUid 不明)
  ```
- 移行後、全プロジェクトに `memberUids` フィールドがあることを verify

### 4.2 既存 ops / snapshots / presence
- フィールド構造は旧 STAFF と同じなので、ルール上は問題なし
- ただし古い presence が残っていると「オンライン表示が過剰」になる → Phase 3 で `/projects/{pid}/presence/*` 全削除

### 4.3 本番 (v2.0-dev) の `projects/{roomId}` 単一スナップショット merge
- `data.memberUids` が無い → read 拒否される → **旧クライアントは即座に動かなくなる**
- 旧クライアントは Phase 4 デプロイ**前にアクセス禁止**とする (キャッシュクリア周知)

---

## 5. ルールのテスト手順 (Phase 3 で実行)

本 Phase 0 ではテスト実行しない。**Phase 3 の着手承認後**に以下を実施:

### 5.1 Firebase Emulator Suite
```powershell
# Phase 3 で実行
npm install -g firebase-tools
firebase init emulators  # Firestore のみ有効化
firebase emulators:start --only firestore
```

### 5.2 テストケース (Jest / Mocha で記述)
| ケース | 期待 |
|-------|------|
| 非認証で `projects/*` read | 拒否 |
| 認証済みで、`memberUids` に自分を含まない project を read | 拒否 |
| 認証済みで、`memberUids` に自分を含む project を read | 許可 |
| `memberUids: [me]` で project を create | 許可 |
| `memberUids: [other]` で project を create (自分を含まない) | 拒否 |
| 他ユーザーの op を自分名義で create | 拒否 |
| 自分の op を create | 許可 |
| 既存 op を update | 拒否 |
| 他ユーザーの presence を create (`uid != auth.uid`) | 拒否 |
| 自分の presence を create | 許可 |
| `memberUids` から自分を外す update | 拒否 |
| 他人を memberUids に追加する update | 許可 (招待フロー) |
| entities の revision を減らす update | 拒否 |
| entities の revision を +1 する update | 許可 |

### 5.3 本番デプロイ前の必須チェック
1. Emulator で全テストケース通過 ← Phase 3
2. 現行ルールのバックアップ (Firebase Console から export) ← Phase 3
3. 既存プロジェクトの `memberUids` 補完スクリプト実行 ← Phase 3
4. **デプロイは「`firebase deploy --only firestore:rules`」のみ** (他のサービスを deploy しない)

---

## 6. ルール導入によるクォータへの影響

### 6.1 `isMember()` の `get(/projects/{pid})` 呼び出し
- Firestore ルールの `get()` はカウントされる (無料枠 50,000 reads/日 を消費)
- 1 op send あたり ops/create で 1 read (`isMember`) → 100 ops/分 × 60 分 × 8 時間 = 48,000 reads/日
- 対策:
  - クライアント側で `projectId` ごとに socket 持続中はルール判定キャッシュが効く (Firebase SDK の挙動を確認)
  - または `isMember` を `request.auth.token.projects` 配列で判定する方式に変更 (custom claims、Phase 4.5 で検討)

### 6.2 本 Phase 0 ではこの最適化は実施しない
- 無料枠超過は Blaze プラン移行で対応
- 代替案 (custom claims) は Phase 4.5 以降の最適化として記録

---

## 7. 「現状の本番」との差分

### 7.1 本番現状の推定ルール (旧 STAFF が最後にデプロイしたと思われるもの)
`_REFERENCE_staff-source-2026-08/firestore.rules` と**同じ**と仮定。
その中では:
- `isMember(projectId)` あり
- ops/snapshots/presence のパスはあるが、`todos`/`entities`/`invitations`/`staff_members`/`pricing` は未定義 → 全部 default `allow read, write: if false`

### 7.2 V3 ドラフトでの追加・変更
- `todos` 追加 ← Phase 4.1 で使う
- `entities` 追加 ← Phase 4 第 2 層
- `invitations` 追加 (予約) ← Phase 4.2
- `staff_members` 追加 (予約) ← Phase 5
- `pricing` 追加 (全拒否、将来のための予約)
- `projects.update` の `memberUids` 変更時に「自分を外せない」条件を厳格化
- `presence.delete` に project owner も含める (他人の古い presence を kick できる、owner のみ)

---

## 8. 削除リスクの再確認

本ルールを**デプロイすると**、以下が即座に発生する:

| 影響 | 影響範囲 | 対策 |
|-----|---------|------|
| `memberUids` の無い既存 project が全部 read 不可 | 旧 STAFF で作成された project | **Phase 3 で memberUids 移行を先に実施** |
| 旧 v2.0-dev クライアントが Firestore 書き込み不可 | 同時接続している現場 | **Phase 4 デプロイと同時に全ユーザーに新 URL 周知** |
| 旧 STAFF の `ops` doc で `createdByUid` フィールドが欠落しているものは、以降 update 不可 (もともと update 禁止なので無害) | 無害 | なし |

---

## 9. デプロイ手順 (Phase 3 で実施、本 Phase 0 では実施しない)

```powershell
# Phase 3 のみ:
cd source
firebase login
firebase init firestore  # firebase.json + .firebaserc を生成
# .firebaserc に "default": "cuberackstudio-staff" を書く
# firebase.json の "firestore.rules" を "firestore.rules" にする

# ドライラン (推奨)
firebase deploy --only firestore:rules --dry-run

# 本番デプロイ (ユーザー承認後のみ)
firebase deploy --only firestore:rules

# 失敗時の rollback (Firebase Console から過去ルールを復元)
# https://console.firebase.google.com/project/cuberackstudio-staff/firestore/rules
```

**本 Phase 0 ではこれらを実行しない。** ドラフトファイルを `source/firestore.rules` として配置するのみ。
