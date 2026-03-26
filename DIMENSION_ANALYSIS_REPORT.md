# 寸法表示不整合 調査報告書

## 1. 関連箇所一覧（ファイル/行/関数/概要）

### 1.1 寸法計算ユーティリティ（正本）
| ファイル | 行番号 | 関数名 | 役割 | 分類 |
|---------|--------|--------|------|------|
| `js/app/dimension-utils.js` | 8-9 | 定数定義 | `SIDE_CAP_THICKNESS=2.1`, `JOINT_BALL_DIAMETER=18.3` | A |
| `js/app/dimension-utils.js` | 20-28 | `BEAM_EFFECTIVE_LENGTH_TABLE` | 実データ値テーブル（BEAM_100=90.8, BEAM_200=200.0, BEAM_300=309.2等） | A |
| `js/app/dimension-utils.js` | 56-134 | `getBeamEffectiveLengthMm` | 名目長さ→実効長変換（実データテーブル参照） | A |
| `js/app/dimension-utils.js` | 141-150 | `getBeamOuterToOuterLengthMm` | 単一ビームの外形寸法（実効長+OUTER_OFFSET） | A |
| `js/app/dimension-utils.js` | 203-223 | `calcCenterToCenterLengthMm` | 芯々距離計算（Σ(L_i) + N × 18.3） | C |
| `js/app/dimension-utils.js` | 311-330 | `calcPoleOuterHeightMm` | 外形高さ計算（Σ(L_i) + (N+1) × D + LEG + TC） | C |

### 1.2 寸法表示計算（estimate.js）
| ファイル | 行番号 | 関数名 | 役割 | 分類 |
|---------|--------|--------|------|------|
| `js/features/estimate.js` | 27-62 | `REAL_DIM` | 実寸定数定義（jointBallDia:18.3, sideCap:2.1, beam実データ） | A |
| `js/features/estimate.js` | 87-433 | `computeFrameDimensions` | フレーム全体の寸法計算（芯々/外形） | A+B+C |
| `js/features/estimate.js` | 153-159 | ビーム有効長取得 | `getBeamEffectiveLengthMm`経由で実データ取得 | A |
| `js/features/estimate.js` | 317-318 | 芯々幅計算 | `calcCenterToCenterLengthMm`使用（理論式） | C |
| `js/features/estimate.js` | 363-367 | 外形幅計算 | `Σ(L_i) + (N+1) × 18.3 + 2 × 2.1`（実データ+理論式混在） | A+C |
| `js/features/estimate.js` | 442-485 | `updateDimensionPopup` | UI表示更新（`computeFrameDimensions`の結果を表示） | - |

### 1.3 図面描画（drawing.js）
| ファイル | 行番号 | 関数名 | 役割 | 分類 |
|---------|--------|--------|------|------|
| `js/app/drawing.js` | 755-761 | ビーム名目長さ取得 | `getBeamNominalLengthMmSafe`経由 | B |
| `js/app/drawing.js` | 759-760 | ビーム実効長取得 | `getBeamEffectiveLengthMm`経由（実データ） | A |
| `js/app/drawing.js` | 777-780 | 外形幅計算 | `Σ(L_i) + (N+1) × 18.3 + 2 × 2.1`（実データ+理論式混在） | A+C |
| `js/app/drawing.js` | 844-847 | 外形奥行計算 | `Σ(L_i) + (N+1) × 18.3 + 2 × 2.1`（実データ+理論式混在） | A+C |

### 1.4 ジオメトリ計測（main.js）
| ファイル | 行番号 | 関数名 | 役割 | 分類 |
|---------|--------|--------|------|------|
| `main.js` | 860-868 | `getBeamLenMmByIndex` | ジョイント座標差から距離計算（ジオメトリ計測） | B |
| `main.js` | 5169-5185 | `getBeamLengthMmSafe` | ビーム長さ取得（lengthMm優先、なければ座標差） | B |

## 2. 算出経路トレース（A/B/C分類付き）

### 2.1 芯々寸法（coreWidth/coreDepth/coreHeight）の算出経路

```
computeFrameDimensions()
  ├─ X方向ビーム抽出（ジオメトリ判定: joints座標差）
  ├─ 名目長さ取得: getBeamNominalLengthMmSafe(beam) [B]
  ├─ 実効長取得: getBeamEffectiveLengthMm(nominal) [A: 実データテーブル参照]
  └─ 芯々距離計算: calcCenterToCenterLengthMm(xBeamEffectiveLengths) [C: 理論式]
      └─ 公式: Σ(L_i) + N × 18.3
          └─ ここで L_i は実データ値（BEAM_200=200.0等）、18.3は定数
```

**分類**: A（実データ）→ C（理論式）の混在

### 2.2 外形寸法（outerWidth/outerDepth）の算出経路

```
computeFrameDimensions()
  ├─ X方向ビーム抽出（ジオメトリ判定）
  ├─ 実効長取得: getBeamEffectiveLengthMm(nominal) [A: 実データ]
  └─ 外形計算: 直接計算 [A+C混在]
      └─ 公式: Σ(L_i) + (N+1) × 18.3 + 2 × 2.1
          ├─ L_i: 実データ値（A）
          ├─ 18.3: 定数（理論値18.35ではなく実測値18.3）
          └─ 2.1: 定数（理論値2.0ではなく実測値2.1）
```

**分類**: A（実データ）+ C（理論式）の混在、ただし定数値が理論値と異なる

### 2.3 外形高さ（outerHeight）の算出経路

```
computeFrameDimensions()
  ├─ Y方向Pole抽出（ジオメトリ判定）
  ├─ 名目長さ取得: p.lengthMm [B: ジオメトリデータ]
  └─ 外形高さ計算: calcPoleOuterHeightMm(yPoleNominals) [C: 理論式]
      ├─ 実効長取得: getPoleEffectiveLengthMm(nominal) [A: 実データテーブル]
      └─ 公式: Σ(L_i) + (N+1) × 18.1 + 12.8 + 2.25
          └─ ここで L_i は実データ値、18.1/12.8/2.25は定数
```

**分類**: A（実データ）→ C（理論式）の混在

## 3. 代表ケース比較（期待値 vs 実際）

### ケース1: SC + JB + BEAM_200 + JB + SC（単一ビーム200mm）

**理論式（ユーザー指定）**:
```
D(1) = 2*SIDECAP + (1+1)*JOINTBALL + 1*BEAM_200
     = 2*2 + 2*18.35 + 200
     = 4 + 36.7 + 200
     = 240.70 mm
```

**実データ値（コード内）**:
```
SIDECAP = 2.1 mm
JOINTBALL = 18.3 mm
BEAM_200実効長 = 200.0 mm

外形 = 2*2.1 + 2*18.3 + 200.0
     = 4.2 + 36.6 + 200.0
     = 240.80 mm
```

**コード計算（estimate.js 363-367行）**:
```javascript
const N = 1; // ビーム本数
const sumEffective = 200.0; // 実効長
const JB = 18.3;
const SC = 2.1;
outerWidth = 200.0 + (1+1) * 18.3 + 2 * 2.1
           = 200.0 + 36.6 + 4.2
           = 240.8 mm
```

**ズレ**: 理論値240.70 vs 実際240.80 = **+0.10mm**

### ケース2: SC + JB + BEAM_100 + JB + BEAM_100 + JB + SC（2本の100mmビーム）

**理論式（ユーザー指定）**:
```
D(2) = 2*SIDECAP + (2+1)*JOINTBALL + 2*BEAM_100
     = 2*2 + 3*18.35 + 2*90.8
     = 4 + 55.05 + 181.6
     = 240.65 mm
```

**実データ値（コード内）**:
```
SIDECAP = 2.1 mm
JOINTBALL = 18.3 mm
BEAM_100実効長 = 90.8 mm

外形 = 2*2.1 + 3*18.3 + 2*90.8
     = 4.2 + 54.9 + 181.6
     = 240.70 mm
```

**コード計算（estimate.js 363-367行）**:
```javascript
const N = 2; // ビーム本数
const sumEffective = 90.8 + 90.8 = 181.6;
const JB = 18.3;
const SC = 2.1;
outerWidth = 181.6 + (2+1) * 18.3 + 2 * 2.1
           = 181.6 + 54.9 + 4.2
           = 240.7 mm
```

**ズレ**: 理論値240.65 vs 実際240.70 = **+0.05mm**

### ケース3: SC + JB + BEAM_400 + JB + SC（単一ビーム400mm）

**理論式（ユーザー指定）**:
```
D(1) = 2*SIDECAP + (1+1)*JOINTBALL + 1*BEAM_400
     = 2*2 + 2*18.35 + 418.35（理論値）
     = 4 + 36.7 + 418.35
     = 459.0 mm（理論値）
```

**実データ値（コード内）**:
```
SIDECAP = 2.1 mm
JOINTBALL = 18.3 mm
BEAM_400実効長 = 418.3 mm（実測値、理論値418.35から-0.05mm）

外形 = 2*2.1 + 2*18.3 + 418.3
     = 4.2 + 36.6 + 418.3
     = 459.1 mm
```

**コード計算（estimate.js 363-367行）**:
```javascript
const N = 1;
const sumEffective = 418.3; // 実データ値
const JB = 18.3;
const SC = 2.1;
outerWidth = 418.3 + (1+1) * 18.3 + 2 * 2.1
           = 418.3 + 36.6 + 4.2
           = 459.1 mm
```

**ズレ**: 
- 理論値（BEAM_400=418.35）: 459.0 mm
- 実際（BEAM_400=418.3）: 459.1 mm
- 差: **+0.1mm**（ただし、BEAM_400の実データが理論より-0.05mm小さいため、外形は+0.1mm大きくなる）

## 4. 最有力な原因トップ3（根拠付き）

### 原因1: 理論値と実データ値の定数不一致（優先度: ★★★）

**根拠**:
- ユーザー指定の理論値: `JOINTBALL=18.35`, `SIDECAP=2.0`
- コード内の実データ値: `JOINT_BALL_DIAMETER=18.3`, `SIDE_CAP_THICKNESS=2.1`
- 差: JOINTBALL -0.05mm, SIDECAP +0.1mm

**影響範囲**:
- `dimension-utils.js`: 定数定義（8-9行）
- `estimate.js`: 定数定義（29, 32行）と外形計算（357-358行）
- `drawing.js`: 外形計算（777-778, 844-845行）

**ズレの寄与**:
- ケース1: (2.1-2.0)*2 + (18.3-18.35)*2 = 0.2 - 0.1 = +0.1mm ✓
- ケース2: (2.1-2.0)*2 + (18.3-18.35)*3 = 0.2 - 0.15 = +0.05mm ✓

### 原因2: ビーム実データ値の理論値からのズレ（優先度: ★★）

**根拠**:
- ユーザー指定: BEAM_400の理論値は418.35mm
- コード内実データ: BEAM_400=418.3mm（-0.05mm）
- 長尺ビームは±0.15mm程度の製造誤差があるとユーザーが指摘

**影響範囲**:
- `dimension-utils.js`: `BEAM_EFFECTIVE_LENGTH_TABLE`（20-28行）
- `estimate.js`: `REAL_DIM.beam`（41-50行）

**ズレの寄与**:
- ケース3: BEAM_400の実データが理論より-0.05mm小さいが、JOINTBALL/SIDECAPの差で外形は+0.1mm

### 原因3: 芯々距離計算式のジョイントボール直径の扱い（優先度: ★）

**根拠**:
- `calcCenterToCenterLengthMm`（203-223行）: `Σ(L_i) + N × 18.3`
- この式は「N本のビーム間にN個のジョイントボール」を前提
- しかし、実際の配置では「N+1個のジョイントボール」が存在する可能性

**影響範囲**:
- `dimension-utils.js`: `calcCenterToCenterLengthMm`（203-223行）
- `estimate.js`: 芯々距離計算（317-318, 324-325行）

**注意**: この原因は「芯々距離」の計算であり、「外形寸法」には直接影響しない。外形計算では`(N+1) × JB`が正しく使われている。

## 5. 修正案（コード変更せず、案のみ）

### 修正案1: 定数値の統一（最優先）

**方針**: 理論値と実データ値のどちらを採用するか決定し、全箇所で統一

**選択肢A: 理論値を採用**
- `JOINT_BALL_DIAMETER = 18.35`（18.3 → 18.35）
- `SIDE_CAP_THICKNESS = 2.0`（2.1 → 2.0）
- 影響箇所:
  - `dimension-utils.js` 8-9行
  - `estimate.js` 29, 32行
  - `estimate.js` 357-358行（外形計算）
  - `drawing.js` 777-778, 844-845行

**選択肢B: 実データ値を採用（現状維持）**
- 理論式の定義を実データ値に合わせて更新
- ユーザーへの説明: 「実測値ベースで表示」

**推奨**: 選択肢A（理論値採用）。理由: ユーザーが「200基準のモジュール理論」を基準としているため。

### 修正案2: 寸法表示の入口統一

**方針**: 寸法表示の計算を`dimension-utils.js`に集約し、`estimate.js`と`drawing.js`で共通使用

**実装**:
1. `dimension-utils.js`に外形計算関数を追加:
   ```javascript
   window.calcBeamOuterLengthMm = function(beamEffectiveLengths) {
     const N = beamEffectiveLengths.length;
     const sum = beamEffectiveLengths.reduce((a, b) => a + b, 0);
     return sum + (N + 1) * JOINT_BALL_DIAMETER + 2 * SIDE_CAP_THICKNESS;
   };
   ```
2. `estimate.js`と`drawing.js`でこの関数を使用

**効果**: 定数値の変更が1箇所で済む

### 修正案3: ビーム実データ値の理論値との整合性確認

**方針**: BEAM_400等の長尺ビームの実データ値が理論値と±0.15mm以内か確認

**実装**:
- 理論値計算式: `BEAM_n = n * (BEAM_200 / 200)` など
- 実データ値との差を検証
- 差が大きい場合は実データ値を理論値に近づけるか、理論式を実データに合わせる

### 修正案4: 表示ラベルの明確化

**方針**: 「理論値ベース」か「実測値ベース」かをUIに明示

**実装**:
- 寸法表示の近くに「（理論値）」または「（実測値）」のラベルを追加
- または、設定で切り替え可能にする

## 6. 次のステップ

1. **修正案1の選択**: 理論値 vs 実データ値のどちらを採用するか決定
2. **修正案2の実装**: 寸法計算の入口統一（1箇所ずつ修正）
3. **検証**: 代表ケース3つで修正後の計算値を確認
4. **UI確認**: 修正後の表示が期待通りか確認
