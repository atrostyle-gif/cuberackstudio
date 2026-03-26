# コード整理整頓 - 実施内容まとめ

## 実施日
2026年1月7日

## 実施内容

### 1. 重複コードの整理 ✅
- **共通ユーティリティファイルの作成**: `js/utils/common.js` を新規作成
  - `normalizeMaterial()` 関数を集約
  - `materialTag()` 関数を集約
  - `MATERIALS` 定数を定義

- **重複定義の削除**:
  - `js/data/parts-catalog.js`: 3箇所の重複した `normalizeMaterial` 定義を削除
  - `main.js`: `normalizeMaterial` と `materialTag` の定義を削除
  - `estimate.html`: `normalizeMaterialSafe` を削除し、共通関数を使用

### 2. ファイル構造の整理 ✅
- **共通ユーティリティの追加**:
  - `index.html`: `js/utils/common.js` の読み込みを追加
  - `estimate.html`: `js/utils/common.js` の読み込みを追加

### 3. 未使用ファイルの削除 ✅
- `prices.json`: 削除（`prices.js` と重複、使用されていない）
- `prices.js`: 削除（使用されていない）

### 4. コードの改善点
- 材種正規化ロジックを一元化し、保守性を向上
- 重複コードを削減し、コードベースを整理
- 共通関数を `window` オブジェクトに公開し、グローバルアクセスを可能に

## 残作業

### 推奨される今後の改善
1. **main.js の分割**: 9855行の巨大ファイルを機能別に分割
   - UI関連: `js/app/ui.js`
   - 3D描画関連: `js/app/renderer.js`
   - データ管理: `js/app/data.js`
   - 見積計算: `js/app/estimate.js`

2. **コメントの統一**: 日本語と英語のコメントスタイルを統一

3. **命名規則の統一**: 変数・関数名の命名規則を統一

4. **ライブラリファイルの整理**: 
   - `three.min.js` と `OrbitControls.js` がローカルに存在するが、CDNから読み込まれている
   - 必要に応じてローカルファイルを `lib/` ディレクトリに移動

## 変更されたファイル

### 新規作成
- `js/utils/common.js` - 共通ユーティリティ関数

### 変更
- `index.html` - 共通ユーティリティの読み込みを追加
- `estimate.html` - 共通ユーティリティの読み込みを追加、重複関数を削除
- `js/data/parts-catalog.js` - 重複定義を削除、共通関数を使用
- `main.js` - 重複定義を削除、共通関数を使用

### 削除
- `prices.json` - 未使用ファイル
- `prices.js` - 未使用ファイル

## 注意事項

- すべての変更は後方互換性を維持しています
- `window.normalizeMaterial` と `window.materialTag` は既存コードから引き続きアクセス可能です
- 既存の機能に影響はありません
