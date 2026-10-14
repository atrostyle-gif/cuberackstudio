# V3 価格認証設計

作成日: 2026-10-14
背景: 現状 `js/config/pricing-config.js` と Supabase RPC `save_price_catalog` に**平文パスワード `513399` がハードコード**されており、GitHub / Netlify 配信コード・Supabase SQL 両方から容易に抽出可能。

---

## 1. 現状の脆弱性

### 1.1 クライアント側
```js
// source/js/config/pricing-config.js (抜粋、Phase 0 では変更しない)
window.PRICING_CONFIG = {
  adminPassword: "513399",   // ← クライアント JS に平文、F12 で丸見え
  ...
};
```

### 1.2 Supabase 側
```sql
-- source/supabase/schema.sql (抜粋)
create or replace function save_price_catalog(payload jsonb, admin_password text)
returns void language plpgsql security definer as $$
declare
  expected text := '513399';   -- ← SQL ソースに平文
begin
  if admin_password <> expected then
    raise exception 'invalid admin password';
  end if;
  ...
```

### 1.3 攻撃経路
- 誰でも Netlify 配信の JS を取得 → パスワード `513399` 入手
- Supabase の公開 anon キーで `rpc('save_price_catalog', {payload, admin_password: '513399'})` を叩く
- 価格データを**任意に書き換え可能**

---

## 2. 設計方針の比較

| 方式 | 複雑度 | 安全性 | 月額 | 導入まで時間 |
|------|-------|-------|------|-----------|
| **A. Netlify Function + Firebase ID Token verify** | 中 | 高 (STAFF の Firebase 認証を再利用) | 無料 (Netlify 125k req/月) | 1 日 |
| B. Supabase Auth + RLS で admin role | 低 | 高 (Supabase 内で完結) | 無料 | 半日。ただし **STAFF と Supabase の二重アカウント管理が必要** |
| C. Supabase Edge Function + 環境変数パスワード | 低 | 中 (単一パスワード共有は変わらない) | 無料 | 半日 |
| D. 現状維持 + パスワード強化 | 低 | **低 (本質的に解決しない)** | 無料 | 0 |

### 選定: **方式 A (Netlify Function + Firebase ID Token verify)**

**理由**:
- 既に STAFF モードで Firebase 認証を使っている → アカウント一元管理
- Firebase ID Token は**サーバー側で検証可能**な短命 JWT → 盗まれても 1 時間で失効
- Netlify Function なら本番 Netlify に同居デプロイ可能 → インフラ追加不要
- `staff_members/{uid}` コレクションを参照して STAFF allowlist を担保 → パスワード共有を**完全撤廃**できる

---

## 3. 方式 A の設計詳細

### 3.1 全体フロー

```
┌──────────────┐                    ┌──────────────────────┐
│ 管理 UI       │                    │ Netlify Function     │
│ (ブラウザ)    │                    │ /api/update-pricing  │
│              │                    │                      │
│ STAFF Login  │                    │ 1. Authorization     │
│  (Firebase)  │─ ID Token ─────→   │    header から ID Token│
│              │  POST /api/update- │    を取り出す          │
│ Save ボタン  │  pricing            │                      │
│              │  {payload, token}  │ 2. Firebase Admin SDK │
└──────────────┘                    │    で verifyIdToken   │
                                    │                      │
                                    │ 3. staff_members      │
                                    │    コレクションに      │
                                    │    uid があるか確認    │
                                    │                      │
                                    │ 4. OK なら Supabase   │
                                    │    service_role key で │
                                    │    price_catalog を    │
                                    │    update             │
                                    └──────────────────────┘
                                              │
                                              ↓
                                    ┌──────────────────┐
                                    │ Supabase          │
                                    │ price_catalog     │
                                    │ (service_role 権限)│
                                    └──────────────────┘
```

### 3.2 ディレクトリ構成 (Phase 5 で作成、本 Phase 0 では作成しない)

```
source/
  netlify/
    functions/
      update-pricing.js        # 新規
      get-pricing.js           # (任意、現状は Supabase 直読みでも OK)
      _firebase-admin.js       # Firebase Admin SDK 初期化のヘルパ
      _supabase-service.js     # Supabase service_role クライアント初期化
    package.json               # firebase-admin, @supabase/supabase-js
  netlify.toml                 # [[functions]] エントリ追加
```

### 3.3 Netlify Function の疑似コード

```js
// netlify/functions/update-pricing.js (Phase 5 で実装、Phase 0 では未作成)
const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  // CORS: 本番 Netlify ドメインのみ
  if (event.httpMethod === "OPTIONS") return cors200();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  // ID Token 取り出し
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, body: "missing token" };
  }
  const idToken = authHeader.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken, true);
  } catch (e) {
    return { statusCode: 401, body: "invalid token" };
  }

  // STAFF allowlist 確認
  const staffDoc = await admin
    .firestore()
    .collection("staff_members")
    .doc(decoded.uid)
    .get();
  if (!staffDoc.exists) {
    return { statusCode: 403, body: "not a staff member" };
  }

  // Payload parse
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "invalid json" };
  }

  // Supabase 書き込み (service_role 権限)
  const { error } = await supabase
    .from("price_catalog")
    .upsert(payload.rows, { onConflict: "part_key" });

  if (error) {
    console.error("[price-update]", { uid: decoded.uid, error });
    return { statusCode: 500, body: "db error" };
  }

  // 監査ログ (Firestore)
  await admin
    .firestore()
    .collection("audit_logs")
    .add({
      type: "pricing_update",
      uid: decoded.uid,
      email: decoded.email,
      rowCount: payload.rows.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
```

### 3.4 クライアント側 (Phase 5 で変更)

```js
// 既存の tools/pricing-admin.html の "Save" ボタンハンドラを変更
async function saveAllPrices() {
  // STAFF ログイン済み前提
  const user = firebase.auth().currentUser;
  if (!user) {
    alert("STAFF ログインが必要です");
    return;
  }
  const idToken = await user.getIdToken(/* forceRefresh */ false);

  const payload = { rows: collectAllPriceRows() };

  const res = await fetch("/.netlify/functions/update-pricing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken,
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    alert("保存しました");
  } else {
    alert("エラー: " + (await res.text()));
  }
}
```

### 3.5 Supabase 側の変更 (Phase 5)

- `save_price_catalog(payload, admin_password)` RPC を**削除**
- `price_catalog` テーブルの RLS を:
  - `SELECT`: 全員許可 (public anon key でも読める)
  - `INSERT / UPDATE / DELETE`: `service_role` のみ (anon では拒否)
- `service_role` key は Netlify Function 内の `SUPABASE_SERVICE_ROLE_KEY` 環境変数にのみ存在、クライアントには一切配信しない

### 3.6 環境変数 (Netlify Dashboard で設定、本 Phase 0 では設定しない)

| 変数名 | 値の出所 | 用途 |
|--------|--------|------|
| `FIREBASE_PROJECT_ID` | Firebase Console | Admin SDK 初期化 |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console → サービスアカウント JSON | 同上 |
| `FIREBASE_PRIVATE_KEY` | 同上 (改行は `\n` でエスケープ) | 同上 |
| `SUPABASE_URL` | Supabase Dashboard | Service クライアント |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | 同上 |

**全て Netlify UI で「site env variable」として設定**。Git には**絶対にコミットしない** (`.gitignore` に `.env` を追加するが、そもそも .env ファイルは作らない)。

---

## 4. 旧パスワード `513399` の扱い

### 4.1 Phase 0 (本 Phase)
- `pricing-config.js` と `supabase/schema.sql` の `513399` は**そのまま残す**
- 本 Phase では「設計を書くだけ」なので変更しない

### 4.2 Phase 5 デプロイ時の無効化手順
1. Netlify Function `update-pricing` をデプロイ (STAFF allowlist による新経路)
2. クライアント UI (`tools/pricing-admin.html`) を Netlify Function 経由に切り替え
3. 動作確認後、Supabase RPC `save_price_catalog` を**DROP**
4. `pricing-config.js` から `adminPassword` フィールドを**削除**
5. 旧 UI のパスワード入力欄も削除

### 4.3 無効化の順序に注意
- 2 → 3 の間に第三者が旧 RPC を叩けば、まだ `513399` で書き換え可能
- そのため **「2 と 3 を同一デプロイで」** 行う:
  - Netlify に新 Function をデプロイ
  - 同時に `supabase migration up` で RPC を DROP

---

## 5. 監査ログ

### 5.1 保存先
`projects/{pid}` と同階層の `audit_logs/{autoid}`

### 5.2 スキーマ
```
audit_logs/{autoid}
  type: "pricing_update" | "project_delete" | "member_add" | "member_remove"
  uid: string
  email: string
  payload: map (type ごとに異なる)
  createdAt: Timestamp
```

### 5.3 Firestore ルール (firestore.rules で予約)
```
match /audit_logs/{autoid} {
  allow read: if false;  // Admin SDK のみ閲覧可
  allow write: if false; // Admin SDK のみ書き込み可
}
```

(`firestore.rules` ドラフトに未記載 → **Phase 5 の着手時に追記**)

---

## 6. 当面の代替案 (Phase 5 待ちの場合)

Phase 5 まで時間がかかる場合の短期対応:

### 6.1 選択肢 X: パスワードを環境変数化しつつ、UI は残す
- `pricing-config.js` から `adminPassword` を**削除**
- 代わりに Supabase RPC が `pg_catalog.current_setting('app.admin_password', true)` で読む
- Supabase Project Settings で `app.admin_password = <長いランダム文字列>` を設定
- クライアント UI のパスワード入力欄にはこの新パスワードを STAFF 個人に周知
- **問題点**: パスワード共有は続く → 本質的な解決にならない。 Phase 5 まで**使わない**判断もあり

### 6.2 選択肢 Y: パスワード UI を一時的にオフにし、Supabase 側で write を無効化
- `tools/pricing-admin.html` の Save ボタンを無効化
- Supabase の `price_catalog` RLS で write を全拒否
- 読み取りは可能なまま → 価格表示は動く
- 価格変更は Phase 5 まで**できなくなる**
- 営業上許容できるなら、最も安全な短期対応

### 6.3 本 Phase 0 の推奨
- Phase 1–4 と並行して **Phase 5 を優先実装** する
- Phase 5 完了まで変更頻度が低ければ (月数回) 現状維持も許容できる
- **判断は Phase 1 承認時に別途**

---

## 7. 既存 Supabase データのバックアップ

Phase 5 で RPC を DROP する前に:

```bash
# Phase 5 実行前の必須手順
# Supabase CLI で CSV export
supabase db dump --data-only --schema public --tables price_catalog > price_catalog_backup_YYYYMMDD.sql
# または Supabase Dashboard → Table Editor → Export CSV

# Phase 5 で RPC drop:
# supabase/migrations/20261014_drop_save_price_catalog.sql
# DROP FUNCTION IF EXISTS save_price_catalog(jsonb, text);
```

バックアップファイル保存先: Phase 0 では**作成しない**。 Phase 4/5 の着手承認時にリポジトリ外の安全な場所 (ローカルの `_BACKUPS/` ディレクトリ) に保存する。
