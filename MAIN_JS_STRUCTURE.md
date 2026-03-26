# main.js 構造目次

## セクション一覧

### 1. 初期化・設定
- 1.1 UI取得関数（getUI）
- 1.2 グローバル変数・フラグ初期化
- 1.3 ユーティリティ関数（__v3, __p3, __dist）
- 1.4 window参照の整合（bindArrayRefsToWindow）
- 1.5 材種正規化関数（normalizeMaterial, materialTag）

### 2. 状態管理
- 2.1 パーツタイプ・長さ管理
- 2.2 オーダーモード管理
- 2.3 接続モード管理
- 2.4 長さ変更モード管理
- 2.5 カラーチャート状態

### 3. UI初期化・イベント
- 3.1 initUI関数
- 3.2 グリッド切り替え
- 3.3 Beam/Pole切替
- 3.4 長さプリセット
- 3.5 オーダーモードUI
- 3.6 カラーチャートUI
- 3.7 接続モードUI
- 3.8 長さ変更UI

### 4. 3Dシーン初期化
- 4.1 Three.jsシーン・カメラ・レンダラー設定
- 4.2 OrbitControls設定
- 4.3 ライティング設定
- 4.4 グリッド表示
- 4.5 背景・環境設定

### 5. メッシュ生成・管理
- 5.1 ジョイントメッシュ生成
- 5.2 ビームメッシュ生成
- 5.3 ポールメッシュ生成
- 5.4 脚メッシュ生成
- 5.5 メッシュ破棄関数
- 5.6 メッシュ更新関数

### 6. 材質・カラー管理
- 6.1 材質定義（jointMaterial, beamMaterial, poleMaterial, legMaterial）
- 6.2 カラーパレット
- 6.3 材質適用関数（applyMaterialColorToMesh）
- 6.4 カラーチャート適用

### 7. ジョイント操作
- 7.1 ジョイント作成（createJoint）
- 7.2 ジョイント削除
- 7.3 ジョイント選択・ハイライト
- 7.4 ジョイント座標更新

### 8. ビーム・ポール操作
- 8.1 ビーム作成（createBeam）
- 8.2 ポール作成（createPole）
- 8.3 ビーム・ポール削除
- 8.4 長さ変更（setSelectedConnectorLengthMm）
- 8.5 長さ取得（getBeamLengthMm, getPoleLengthMm）

### 9. 脚操作
- 9.1 脚作成（createLeg, addLegIfNeeded）
- 9.2 脚削除
- 9.3 脚ON/OFF切り替え

### 10. マウス操作・イベント
- 10.1 マウスクリック処理
- 10.2 マウスドラッグ処理
- 10.3 レイキャスティング
- 10.4 オブジェクト選択
- 10.5 キーボードショートカット

### 11. 自動レイアウト
- 11.1 自動レイアウトUI初期化
- 11.2 3D自動レイアウト（autoGenerateModulesFromConfig）
- 11.3 平面自動レイアウト（applyAutoLayoutFlatFromExternal）
- 11.4 自動レイアウトツール連携

### 12. 見積計算・表示
- 12.1 見積計算（calcAndRenderEstimate）
- 12.2 パーツ集計
- 12.3 価格計算
- 12.4 見積テーブル描画
- 12.5 見積書へのデータ送信

### 13. ファイル操作
- 13.1 デザイン保存（saveDesign, saveDesignAs）
- 13.2 デザイン読み込み（loadDesign）
- 13.3 JSON変換（makeDesignJsonText, loadDesignFromJsonText）
- 13.4 自動バックアップ

### 14. Undo/Redo
- 14.1 履歴管理（history, historyIndex）
- 14.2 履歴保存（saveHistory）
- 14.3 Undo処理
- 14.4 Redo処理
- 14.5 ハイライト管理

### 15. シーン再構築
- 15.1 rebuildSceneFromData
- 15.2 メッシュ再生成
- 15.3 座標同期

### 16. パーツマスタ・価格
- 16.1 パーツ定義（PART_DEFS）
- 16.2 価格テーブル（PRICE_TABLE）
- 16.3 コンポーネント価格（COMPONENT_PRICE_TABLE）

### 17. クラスター管理
- 17.1 ジョイントクラスター（jointClusters）
- 17.2 クラスターID管理（jointClusterId）

### 18. Drawing連携
- 18.1 buildDrawingPayload
- 18.2 openDrawingWindowAndSend

### 19. 互換ブリッジ
- 19.1 旧API互換関数
- 19.2 互換性ラッパー

### 20. アプリ起動
- 20.1 bootApp
- 20.2 初期化処理
