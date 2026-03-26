# 重複定義の棚卸し結果

## Step 1: 重複定義の一覧

### 1. materials.js 系の重複

| 名前 | main.js の行 | 分割先 | 正本 | 削除/移動方針 |
|------|-------------|--------|------|--------------|
| `getCurrentMaterial()` | 2178 | js/core/materials.js:20 | materials.js | main.jsから削除 |
| `getPartTypeMaterial()` | 2195 | js/core/materials.js:37 | materials.js | main.jsから削除 |
| `setPartTypeMaterial()` | 2200 | js/core/materials.js:42 | materials.js | main.jsから削除 |
| `applyMaterialFinish()` | 2246 | js/core/materials.js:131 | materials.js | main.jsから削除 |
| `applyMaterialColorToMesh()` | 2256 | js/core/materials.js:141 | materials.js | main.jsから削除 |
| `applyMaterialToAllMeshes()` | 51 | なし | main.js | そのまま（materials.jsに移動検討） |

### 2. file.js 系の重複

| 名前 | main.js の行 | 分割先 | 正本 | 削除/移動方針 |
|------|-------------|--------|------|--------------|
| `applySnapshotFromString()` | 2418 | js/features/file.js:248 | file.js | main.jsから削除（ラッパーも削除） |
| `rebuildSceneFromData()` | 4804 | なし | main.js | file.jsに移動すべき |
| `createSnapshot()` | なし | js/features/file.js:243 | file.js | 問題なし |

### 3. estimate.js 系の重複

| 名前 | main.js の行 | 分割先 | 正本 | 削除/移動方針 |
|------|-------------|--------|------|--------------|
| `computeFrameDimensions()` | 5028 | js/features/estimate.js:87 | estimate.js | main.jsから削除 |
| `formatMm()` | 5091 | js/features/estimate.js:146 | estimate.js | main.jsから削除 |
| `updateDimensionPopup()` | 5097 | js/features/estimate.js:152 | estimate.js | main.jsから削除 |
| `buildEstimatePayload()` | 5695 | js/features/estimate.js:572 | estimate.js | main.jsから削除 |

### 4. autolayout.js 系の重複

| 名前 | main.js の行 | 分割先 | 正本 | 削除/移動方針 |
|------|-------------|--------|------|--------------|
| `autoGenerateModulesFromConfig()` | 5886 | js/features/autolayout.js:384 | autolayout.js | main.jsから削除 |
| `rebuildJointClusters()` | 5988 | js/features/autolayout.js:479 | autolayout.js | main.jsから削除 |
| `getClusterIdFromJointIndex()` | 6101 | js/features/autolayout.js:590 | autolayout.js | main.jsから削除 |
| `autoGenerateModules()` | 6155 | js/features/autolayout.js:691 | autolayout.js | main.jsから削除 |

### 5. mesh.js 系の重複

| 名前 | main.js の行 | 分割先 | 正本 | 削除/移動方針 |
|------|-------------|--------|------|--------------|
| `removeMeshFromParent()` | 360 | なし | main.js | mesh.jsに移動すべき |
| `clearAllMeshes()` | 2398 | なし | main.js | mesh.jsに移動すべき |
| `disposeJointMeshByIndex()` | 3383 | js/core/mesh.js:79 | mesh.js | main.jsから削除 |
| `disposeBeamMesh()` | 3390 | js/core/mesh.js:89 | mesh.js | main.jsから削除 |
| `disposePoleMesh()` | 3396 | js/core/mesh.js:98 | mesh.js | main.jsから削除 |

### 6. UIイベントの重複バインド

| 要素ID | main.js の行 | ui.js の行 | 正本 | 削除/移動方針 |
|--------|-------------|-----------|------|--------------|
| `grid-toggle-btn` | なし（ui.jsのみ） | js/ui/ui.js:233 | ui.js | 問題なし |
| `part-type-toggle` | なし（ui.jsのみ） | js/ui/ui.js:243 | ui.js | 問題なし |
| `connect-mode-btn` | なし（ui.jsのみ） | js/ui/ui.js:251 | ui.js | 問題なし |
| `length-select` | なし（ui.jsのみ） | js/ui/ui.js:282 | ui.js | 問題なし |
| `order-mode-btn` | なし（ui.jsのみ） | js/ui/ui.js:300 | ui.js | 問題なし |
| `color-chart-toggle-btn` | なし（ui.jsのみ） | js/ui/ui.js:331 | ui.js | 問題なし |
| `length-mode-btn` | 348 | なし | main.js | ui.jsに移動検討 |
| `order-cancel-btn` | 1949 | なし | main.js | ui.jsに移動検討 |
| `material-select` | 23 | なし | main.js | ui.jsに移動検討 |
| `open-height-editor-btn` | 3776 | js/ui/ui.js:379 | ui.js | main.jsから削除 |
| `add-layout-col-btn`, `add-layout-row-btn` | 3904-3905 | なし | main.js | autolayout.jsに移動検討 |
| カラーチャートドラッグ | 6387-6497 | なし | main.js | ui.jsに移動検討 |
| `setupOverlaysAndToggles()` | 6241 | なし | main.js | ui.jsに移動検討 |
| `initMaterialSelectUI()` | 6461 | なし | main.js | ui.jsに移動検討 |
| `toggleColorChart()` | 1928, 5668 | なし | main.js | ui.jsに移動検討（重複定義あり） |

## Step 2: 正本の確定方針

原則として、分割先ファイルを正本とし、main.jsから同名定義を削除する。

例外：
- `rebuildSceneFromData()`: file.jsに移動すべき（現在main.jsのみ）
- `removeMeshFromParent()`, `clearAllMeshes()`: mesh.jsに移動すべき（現在main.jsのみ）
- `applyMaterialToAllMeshes()`: そのままmain.jsに残すか、materials.jsに移動検討
