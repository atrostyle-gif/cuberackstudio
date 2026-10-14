# V3 バックアップ・ロールバック計画

作成日: 2026-10-14
対象: Supabase `price_catalog`, Firestore `cuberackstudio-staff/*`, 本番 `source/` リポジトリ

**本 Phase 0 では一切の実行を行わない。** 各手順は Phase 3/5 の着手承認後に実施する。

---

## 1. バックアップの原則

| 原則 | 内容 |
|-----|------|
| **原則 1** | 本番データに触れる操作 (削除/移行/マイグレーション) の**直前**にバックアップを取る |
| **原則 2** | バックアップは**本番とは別の媒体** (ローカル or 別クラウド) に保存 |
| **原則 3** | バックアップは**復元手順と一緒に**保存 (「どうやって戻すか」を忘れないため) |
| **原則 4** | 復元手順は**ドライラン**で検証してから本番へ |
| **原則 5** | バックアップファイルに**日付・プロジェクト名・取得者**をファイル名に含める |

---

## 2. Supabase バックアップ

### 2.1 `price_catalog` テーブル
```bash
# Supabase CLI (Phase 5 着手時のみ実行)
supabase db dump \
  --project-ref <your-project-ref> \
  --data-only \
  --schema public \
  --tables price_catalog \
  > _BACKUPS/supabase/price_catalog_YYYYMMDD_HHMM.sql
```

**または Dashboard 手動 export:**
1. Supabase Dashboard → Table Editor → `price_catalog`
2. 右上の `Export` → `Download as CSV`
3. ファイル名を `price_catalog_YYYYMMDD_HHMM.csv` に変更
4. `C:\Users\cypress3\Desktop\_BACKUPS\supabase\` に保存 (Phase 5 着手時に作成)

### 2.2 RPC 定義のバックアップ
```bash
# save_price_catalog の定義を export
supabase db dump --schema public --functions > _BACKUPS/supabase/functions_YYYYMMDD.sql
```

### 2.3 RLS ポリシーのバックアップ
```bash
supabase db dump --schema public --no-data > _BACKUPS/supabase/schema_YYYYMMDD.sql
```

### 2.4 復元手順
```sql
-- 最悪ケース: 価格データが消えたとき
-- 1. 旧 CSV をもう一度アップロード (Supabase Dashboard → Insert row 一括)
-- 2. または SQL で:
--    TRUNCATE price_catalog;
--    \COPY price_catalog FROM 'price_catalog_YYYYMMDD_HHMM.csv' CSV HEADER;
```

### 2.5 Phase 5 で RPC を DROP する際の安全策
```sql
-- DROP の直前
BEGIN;
  -- 現状の RPC を一時的にリネーム (削除せず retain)
  ALTER FUNCTION save_price_catalog(jsonb, text)
    RENAME TO save_price_catalog_deprecated_YYYYMMDD;
COMMIT;

-- 動作確認期間 (1 週間程度) 問題なければ DROP
-- Phase 5+ で:
-- DROP FUNCTION save_price_catalog_deprecated_YYYYMMDD(jsonb, text);
```

---

## 3. Firestore バックアップ

### 3.1 Firebase CLI による export (Phase 3 着手時)

```powershell
# Phase 3 で実行
firebase login
firebase use cuberackstudio-staff

# Firestore 全体 export (BigQuery/GCS に出す必要あり)
# gcloud firestore export gs://<bucket>/firestore-backup-YYYYMMDD

# ローカル保存 (Firestore Admin SDK を使った script が必要)
# 下記 3.2 の script を使う
```

### 3.2 Node.js スクリプトによるローカル export (Phase 3 着手時)

```js
// _BACKUPS/scripts/export-firestore.js (Phase 3 で作成)
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json")),
});

const db = admin.firestore();
const outDir = `_BACKUPS/firestore/${new Date().toISOString().slice(0,10)}`;
fs.mkdirSync(outDir, { recursive: true });

async function exportCollection(colPath) {
  const snap = await db.collection(colPath).get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  fs.writeFileSync(
    path.join(outDir, colPath.replace(/\//g, "_") + ".json"),
    JSON.stringify(docs, null, 2)
  );
  console.log(`exported ${colPath}: ${docs.length} docs`);
}

async function main() {
  // Top-level: projects
  const projects = await db.collection("projects").get();
  await exportCollection("projects");

  // Sub-collections for each project
  for (const projDoc of projects.docs) {
    const pid = projDoc.id;
    await exportCollection(`projects/${pid}/ops`);
    await exportCollection(`projects/${pid}/snapshots`);
    await exportCollection(`projects/${pid}/presence`);
    // todos / entities は Phase 3 時点では存在しない
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```

**実行方法 (Phase 3 着手時):**
```powershell
cd _BACKUPS/scripts
npm install firebase-admin
node export-firestore.js
```

**出力先:** `_BACKUPS/firestore/YYYY-MM-DD/*.json`

### 3.3 現行 Firestore ルールのバックアップ (Phase 3 着手時)
```powershell
# Firebase Console から手動 copy / paste でも可
# または:
firebase firestore:rules:get > _BACKUPS/firestore/rules_current_YYYYMMDD.rules
```

### 3.4 復元手順
```js
// _BACKUPS/scripts/import-firestore.js (Phase 3 で作成)
// 上記 export の逆手順
// doc.id を保持しながら db.collection(path).doc(id).set(data) を順次実行
```

**復元時の注意:**
- サーバタイムスタンプ (`createdAt: FieldValue.serverTimestamp()`) は復元時に**新しい時刻**になる
- → `createdAt` を `Timestamp.fromMillis(originalMs)` で復元する必要あり
- script 内で `data.createdAt = admin.firestore.Timestamp.fromMillis(originalMs)` と変換

---

## 4. リポジトリ (ソースコード) バックアップ

### 4.1 現状
- Git リポジトリ (`.git/`) に全履歴が保存されている
- `main` ブランチ HEAD: `a0725be` (本 Phase 0 開始時点)
- Phase 1 以降の変更は `feature/v3-safe-collaboration` ブランチに切る (本 Phase 0 で作成済み)

### 4.2 デプロイ前のタグ付け
```powershell
# Phase 3/4/5 の各デプロイ直前に実行
git tag -a pre-phase3-firestore-rules-deploy -m "before firestore rules deploy"
git push origin pre-phase3-firestore-rules-deploy
```

ロールバック時はこのタグに戻す:
```powershell
git checkout pre-phase3-firestore-rules-deploy
# 必要なら新ブランチで修正
```

### 4.3 外部バックアップ (任意)
- GitHub / GitLab / Cursor Origin などへの mirror push
- 本 Phase 0 では**実施しない** (未設定なら Phase 1 で検討)

---

## 5. Netlify デプロイのロールバック

### 5.1 現状
- Netlify Dashboard → Site → Deploys に全履歴が残る
- 任意の過去デプロイを `Publish deploy` で即座に復元可能

### 5.2 Phase 4/5 デプロイ時の手順
1. 現在のデプロイ (production) の URL / 日時をメモ
2. 新コードをデプロイ (`git push origin feature/v3-...` → PR → merge → main → auto deploy)
3. 問題発生 → Netlify Dashboard で前デプロイを `Publish deploy`
4. 原因調査 → 修正 → 再デプロイ

### 5.3 本 Phase 0 では
- Netlify への**デプロイを一切行わない**
- `feature/v3-safe-collaboration` を `main` に merge **しない**

---

## 6. ロールバック判定基準

| 症状 | ロールバック | 原因調査継続 |
|-----|------------|------------|
| 既存プロジェクトが open できない | 即時 | 後で |
| 価格が表示されない | 即時 | 後で |
| 保存が失敗する | 即時 | 後で |
| 共同編集で他人の作業が消える | 即時 | 後で |
| 一部機能が UI 崩れ | ユーザー影響を評価 | 影響小なら継続 |
| コンソールエラーが出る (機能影響なし) | — | 継続 |

---

## 7. バックアップ・復元テスト (Phase 3 で必須)

Phase 3 実行**前**に、以下を Emulator で検証:

### 7.1 Firestore
- 空の Emulator に `_BACKUPS/firestore/*/projects_*.json` を import
- 期待: 全 project / ops / snapshots / presence が復元
- 時刻フィールドが正しい `Timestamp` 型

### 7.2 Supabase
- 空の test schema に CSV import
- 期待: `price_catalog` 全行が復元
- 制約・RLS ポリシーも復元

---

## 8. バックアップ運用 (Phase 4 デプロイ後)

### 8.1 週次バックアップ
- 毎週月曜 09:00 (手動 or Firestore scheduled export)
- 保存先: `_BACKUPS/firestore/YYYY-MM-DD/`
- 保持期間: 3 ヶ月分 (古いものは手動削除)

### 8.2 月次バックアップ
- 月末最終営業日
- `_BACKUPS/archives/` に別途コピー
- 保持期間: 1 年

### 8.3 本 Phase 0 では
- バックアップディレクトリも**まだ作成しない**
- Phase 3 着手時に `_BACKUPS/` を作成

---

## 9. シークレット類の保護

| 対象 | 保存場所 | バックアップ |
|-----|---------|-----------|
| Firebase サービスアカウント JSON | ローカル `_BACKUPS/secrets/firebase-sa-YYYYMMDD.json` (絶対に Git にコミットしない) | 1 回保存すれば十分 |
| Supabase `service_role` key | Netlify 環境変数 のみ | Netlify Dashboard でダウンロード可 |
| STAFF 用 Firebase メールアドレス一覧 | ローカル `_BACKUPS/staff/members_YYYYMMDD.csv` | 月次更新 |

**本 Phase 0 では一切の秘密鍵・パスワードをコミット / レポートに記載しない。** Phase 3/5 の着手時に別チャンネル (DM、Password Manager) で受け渡し。

---

## 10. 「万一データが消えたとき」のインシデント対応フロー

1. **直ちに本番 (Netlify) を停止** (Netlify Dashboard → Site → Stop auto-publishing)
2. 影響範囲を特定 (消えたコレクション、プロジェクト ID、時刻)
3. 最新バックアップから復元 (Section 3.4 / 2.4)
4. 復元後に Diff を取り、消えた範囲が本当に戻ったか確認
5. 根本原因を調査 (操作ログ、デプロイ履歴、Firestore audit log)
6. 再発防止策をドキュメント化
7. Netlify auto-publishing を再開

**連絡先:** Phase 3/5 着手承認時に責任者を明記。

---

## 11. 本 Phase 0 で実施したこと / 実施しないこと

### ✅ 実施した
- バックアップ・復元の**計画書**作成 (本ドキュメント)
- 旧 STAFF `firestore.rules` の存在確認
- 本番 `source/` の git 状態確認 (HEAD / ブランチ)

### ❌ 実施しない
- Supabase `pg_dump` 実行
- Firestore `export-firestore.js` 実行
- `_BACKUPS/` ディレクトリ作成
- Firebase CLI インストール
- Netlify Dashboard の設定変更
- サービスアカウント JSON のダウンロード
