# 高さ方向（Y軸）寸法 調査・検証報告書

## 1. 関連箇所一覧（file / line / function / type[A/B/C]）

### 1.1 dimension-utils.js（高さ計算の正本）

| file | line | function / 識別子 | 役割 | type |
|------|------|-------------------|------|------|
| js/app/dimension-utils.js | 15 | V_JB_JC | 垂直方向「D = JB+JC」接続ユニット厚み = 18.1 mm | B（定数） |
| js/app/dimension-utils.js | 16 | V_LEG | LEG（脚）厚み = 12.8 mm | B（定数） |
| js/app/dimension-utils.js | 17 | V_TC | TC（トップキャップ）厚み = 2.25 mm | B（定数） |
| js/app/dimension-utils.js | 35-43 | POLE_EFFECTIVE_LENGTH_TABLE | POLE名目→実効長テーブル（100:90.8, 200:200.0, … 800:855.1） | A |
| js/app/dimension-utils.js | 230-302 | getPoleEffectiveLengthMm | 名目長さ→実効長（テーブル参照・線形補間） | A |
| js/app/dimension-utils.js | 311-329 | calcPoleOuterHeightMm | 外形高さ = Σ(L_i) + (N+1)×D + LEG + TC | A+B |
| js/app/dimension-utils.js | 339-356 | calcPoleCenterToCenterHeightMm | 芯々高さ = Σ(L_i) + N×D | A+B |

### 1.2 estimate.js（寸法表示・芯々/外形の呼び出し）

| file | line | function / 識別子 | 役割 | type |
|------|------|-------------------|------|------|
| js/features/estimate.js | 34-38 | REAL_DIM.topCap, legHeight | TopCap=2.3, legHeight=12.7（フォールバック用） | B |
| js/features/estimate.js | 52-61 | REAL_DIM.pole | Pole名目→実寸テーブル（表示以外で使用される可能性） | A |
| js/features/estimate.js | 77-84 | REAL_STACK, CENTER_TO_TOPCAP | floorToCenterWithLeg=30.9, floorToTopCapWithLeg=33.15, CENTER_TO_TOPCAP≈2.25 | B/C |
| js/features/estimate.js | 250-311 | computeFrameDimensions 内 | yPolesAll / yPoleNominals の抽出（Y方向Pole列・名目長さ） | C |
| js/features/estimate.js | 331-336 | computeFrameDimensions 内 | coreHeight = calcPoleCenterToCenterHeightMm(yPoleNominals) | A+B |
| js/features/estimate.js | 402-422 | computeFrameDimensions 内 | outerHeight = calcPoleOuterHeightMm − (hasLeg ? 0 : 12.8) / フォールバック | A+B / C |
| js/features/estimate.js | 413 | 直書き | outerHeight -= 12.8（脚なし時） | B |
| js/features/estimate.js | 450, 465 | updateDimensionPopup | dim-core-height / dim-outer-height の表示更新 | - |

### 1.3 drawing.js（図面の高さ寸法・寸法線描画）

| file | line | function / 識別子 | 役割 | type |
|------|------|-------------------|------|------|
| js/app/drawing.js | 851-902 | drawView 内 | yPolesAll 抽出 → bestGroup → Hmm = calcPoleOuterHeightMm(bestGroup) | A+B |
| js/app/drawing.js | 909-910 | drawView 内 | Hmm フォールバック = (maxV−minV) 投影座標差 | C |
| js/app/drawing.js | 929-962 | drawView 内 | 高さ寸法線の上下端：bottomY = minY3D − 12.8, topY = maxY3D + 2.25 | B |
| js/app/drawing.js | 959-960 | 直書き | LEG_HEIGHT=12.8, TC_HEIGHT=2.25 | B |
| js/app/drawing.js | 1263-1266 | findDimLineAtPoint 内 | 同様に LEG_HEIGHT=12.8, TC_HEIGHT=2.25 で底面/上面算出 | B |

---

## 2. 高さ方向の現行計算フロー図

```
【芯々高さ coreHeight】
  estimate.computeFrameDimensions()
    → yPoleNominals = [名目,名目,...]   （C: ジオメトリから抽出）
    → coreHeight = calcPoleCenterToCenterHeightMm(yPoleNominals)
         → getPoleEffectiveLengthMm(nominal) で ΣPOLE   （A: テーブル）
         → H_c2c = Σ(L_i) + N × D,  D=18.1   （B: 理論式だが D=JB+JC）

【外形高さ outerHeight / Hmm】
  estimate.computeFrameDimensions()
    → outerHeight = calcPoleOuterHeightMm(yPoleNominals)
         → getPoleEffectiveLengthMm で ΣPOLE   （A）
         → H_outer = Σ(L_i) + (N+1)×D + V_LEG + V_TC   （B）
         → D=18.1, V_LEG=12.8, V_TC=2.25
    → 脚なしなら outerHeight -= 12.8   （B: 直書き）

  drawing.drawView()
    → Hmm = calcPoleOuterHeightMm(bestGroup)   （上と同じ式）
    → 寸法線描画では bottomY = minY3D − 12.8, topY = maxY3D + 2.25   （B: 直書き）
```

**式の対応関係（現行コード）**

| 種別 | 現行式 | 使っている定数 |
|------|--------|----------------|
| 芯々 | ΣPOLE + N×D | D = V_JB_JC = 18.1 |
| 外形 | ΣPOLE + (N+1)×D + LEG + TC | D=18.1, LEG=12.8, TC=2.25 |

---

## 3. 理論値 vs 実表示値の比較表（mm）

**前提（今回の確定値）**

- LEG = 12.9  
- JOINTBALL = 18.0  
- TOPCAP = 2.2  
- POLE: 100=90.8, 200=200.0, 300=309.2, 400=418.3, 500=527.6, 600=636.7, 800=855.1  

**理論モデル**

- 芯々: `H_c2c = ΣPOLE + (n−1)×JOINTBALL`（n＝ポール本数）
- 外形: `H_outer = LEG + ΣPOLE + (n+1)×JOINTBALL + TOPCAP`  
  （下端ジョイント1個＋上端ジョイント1個＋ポール間ジョイント(n−1)個 → 計 (n+1) 個）

**現行コードの意味**

- 芯々: `ΣPOLE + N×D`,  D=18.1（JB+JC）
- 外形: `ΣPOLE + (N+1)×D + V_LEG + V_TC`,  D=18.1, V_LEG=12.8, V_TC=2.25  

### 3.1 芯々高さ H_c2c

| 構成 | 理論式 | 理論値(mm) | 現行コード式 | 現行値(mm) | 差(mm) |
|------|--------|------------|--------------|------------|--------|
| POLE_200×1 | 200 + 0×18 | **200.0** | 200 + 1×18.1 | **218.1** | +18.1 |
| POLE_100×2 | 181.6 + 1×18 | **199.6** | 181.6 + 2×18.1 | **217.8** | +18.2 |
| POLE_200×2 | 400 + 1×18 | **418.0** | 400 + 2×18.1 | **436.2** | +18.2 |
| POLE_400×2 | 836.6 + 1×18 | **854.6** | 836.6 + 2×18.1 | **872.8** | +18.2 |
| POLE_200×5 | 1000 + 4×18 | **1072.0** | 1000 + 5×18.1 | **1090.5** | +18.5 |

### 3.2 外形高さ H_outer（脚あり）

| 構成 | 理論式 | 理論値(mm) | 現行コード式 | 現行値(mm) | 差(mm) |
|------|--------|------------|--------------|------------|--------|
| POLE_200×1 | 12.9+200+2×18+2.2 | **251.1** | 200+(1+1)×18.1+12.8+2.25 | **251.25** | +0.15 |
| POLE_100×2 | 12.9+181.6+3×18+2.2 | **250.7** | 181.6+3×18.1+12.8+2.25 | **250.95** | +0.25 |
| POLE_200×2 | 12.9+400+3×18+2.2 | **469.1** | 400+3×18.1+12.8+2.25 | **469.35** | +0.25 |
| POLE_400×2 | 12.9+836.6+3×18+2.2 | **905.7** | 836.6+3×18.1+12.8+2.25 | **905.95** | +0.25 |
| POLE_200×5 | 12.9+1000+6×18+2.2 | **1121.1** | 1000+6×18.1+12.8+2.25 | **1121.55** | +0.45 |

※ 差は主に LEG(12.8→12.9)、JOINTBALL(18.0) vs D(18.1)、TOPCAP(2.2→2.25) の違い。

### 3.3 外形高さ（脚なし時・estimate のみ）

- 現行: `outerHeight = calcPoleOuterHeightMm(...) - 12.8`  
  つまり「いったん脚ありで計算してから 12.8 を引く」。
- 理論: 脚なし外形 = `ΣPOLE + (n+1)×JOINTBALL + TOPCAP`（LEG を含まない）。
- 定数差の影響に加え、「引く値 12.8」が確定値 LEG=12.9 と 0.1 mm ずれる。

### 3.4 POLE 本数比較（実データベース）

| 比較 | 左側 | 右側 | 理論上そのはずれ |
|------|------|------|------------------|
| POLE_100×2 vs POLE_200 | 90.8+90.8=181.6 | 200.0 | 18.4（実効長差） |
| POLE_200×2 vs POLE_400 | 200+200=400 | 418.3 | 18.3（実効長差） |
| POLE_400×2 vs POLE_800 | 418.3+418.3=836.6 | 855.1 | 18.5（実効長差） |

※ 現行 POLE テーブルは実データと一致。比較は「理論上の同一高さ」の検証用。

---

## 4. 問題点の有無と優先度（★〜★★★）

### ★★★ 最優先

**1) 芯々高さのジョイント本数（N と n−1 のずれ）**

- 理論: `H_c2c = ΣPOLE + (n−1)×JOINTBALL`（ポール n 本のとき、その「間」は n−1 個）。
- 現行: `H_c2c = ΣPOLE + N×D`（N＝ポール本数）→ ジョイントを n 回足している。
- 影響: 芯々が常に約 +18 mm 前後ずれる。`calcPoleCenterToCenterHeightMm` の式が設計と不一致。
- 箇所: dimension-utils.js の `calcPoleCenterToCenterHeightMm`（349行付近）。

**2) 垂直方向定数が設計確定値と不一致**

- 確定値: LEG=12.9, JOINTBALL=18.0, TOPCAP=2.2。
- 現行: V_LEG=12.8, V_JB_JC=18.1（JB+JC）, V_TC=2.25。
- 外形は「(n+1)×JOINTBALL」であるべきところを「(N+1)×D」で計算しており、さらに LEG/TC も違う。
- 影響: 外形は 0.15〜0.45 mm 程度の系統的ズレ。芯々は上記の N/(n−1) 問題がより効く。
- 箇所: dimension-utils.js の V_LEG, V_JB_JC, V_TC。

### ★★ 中優先

**3) 脚なし時の LEG 減算がハードコードかつ値ずれ**

- 現行: `outerHeight -= 12.8`（estimate.js）。
- 確定値では LEG=12.9 のため 0.1 mm ずれ。さらに「12.8」が複数ファイルに散らばる。
- 箇所: estimate.js 412–413行、drawing.js 959–960, 1263–1264行。

**4) 芯々に「D=JB+JC」を使っていること**

- 理論では「JOINTBALL のみ」で (n−1) 個。現行は「D=18.1（JB+JC）」を N 個加算。
- 設計上、芯々は「ジョイント中心間」なので JOINTBALL だけで良いか、または D の定義を設計と揃える必要あり。
- 箇所: dimension-utils.js の芯々・外形どちらも D = V_JB_JC を参照。

### ★ 要確認

**5) POLE_800 の特別扱い**

- 調査範囲内では、POLE_800 だけ別扱いしている箇所はなし。テーブルに 800:855.1 があるのみ。
- 現状は「問題なし」とみてよい。

**6) LEG/TOPCAP の片側だけの扱い**

- 外形は「LEG + … + TOPCAP」と両端で足しているので、片側忘れはなさそう。
- 脚なし時の「LEG を引く」は「全体から LEG 分を差し引く」であり、考え方としては一貫している（値と出所の統一が課題）。

---

## 5. 「次に直すならここ」という修正候補（コードは書かず案のみ）

### 修正候補 1（最優先）: 芯々高さのジョイント本数

- **対象**: dimension-utils.js の `calcPoleCenterToCenterHeightMm`。
- **内容**:  
  - 現行: `centerToCenter = sum + N * D`  
  - 案: `centerToCenter = sum + (N - 1) * D`（N≥1）。  
  または設計どおり「JOINTBALL のみ」を使う場合は、定数 D を JOINTBALL に揃えたうえで `(N-1)*JOINTBALL` にする。
- **効果**: 芯々表示が設計式 H_c2c = ΣPOLE + (n−1)×JOINTBALL と一致する。

### 修正候補 2: 垂直方向定数の設計値への統一

- **対象**: dimension-utils.js の V_LEG, V_JB_JC（または垂直用 JOINTBALL）, V_TC。
- **内容**:  
  - LEG → 12.9  
  - JOINTBALL（垂直）→ 18.0（外形・芯々で「JOINTBALL のみ」とするか、D=JB+JC のまま設計値に合わせるかを仕様で決定）  
  - TOPCAP → 2.2  
- **効果**: 外形・芯々とも設計値との系統的ズレを減らせる。

### 修正候補 3: 脚なし時の LEG 扱いの統一

- **対象**: estimate.js の `outerHeight -= 12.8`、drawing.js の LEG_HEIGHT=12.8, TC_HEIGHT=2.25。
- **内容**:  
  - 「脚なし外形」を dimension-utils 側に関数として用意する（例: `calcPoleOuterHeightMmNoLeg` のように LEG を含まない版）か、  
  - あるいは `calcPoleOuterHeightMm` に `hasLeg` などを渡し、内部で LEG を足し引きしない形で計算する。  
  - いずれにしても、使う LEG 値は 12.9 に統一し、直書き 12.8 をやめる。
- **効果**: 脚あり/脚なしのどちらも設計と一致し、一箇所で定数管理できる。

### 修正候補 4: 高さ用定数の一元化

- **対象**: estimate.js の REAL_STACK / REAL_DIM（topCap, legHeight）、drawing.js の LEG_HEIGHT, TC_HEIGHT。
- **内容**: 高さまわりの物理定数は dimension-utils.js を唯一の根拠にし、estimate / drawing はそこを参照するか、dimension-utils の関数経由でのみ使う。
- **効果**: 将来、LEG/JOINTBALL/TOPCAP を変えたときの変更箇所を減らせる。

---

## 6. 数式まとめ（コピー用）

**理論（今回の確定値）**

- LEG = 12.9, JOINTBALL = 18.0, TOPCAP = 2.2  
- POLE: 100=90.8, 200=200.0, 300=309.2, 400=418.3, 500=527.6, 600=636.7, 800=855.1  
- 芯々: `H_c2c = ΣPOLE + (n−1)×JOINTBALL`  
- 外形: `H_outer = LEG + ΣPOLE + (n+1)×JOINTBALL + TOPCAP`  

**現行コード**

- 芯々: `H_c2c = ΣPOLE + N×D`,  D=18.1  
- 外形: `H_outer = ΣPOLE + (N+1)×D + V_LEG + V_TC`,  D=18.1, V_LEG=12.8, V_TC=2.25  
- 脚なし: 上記外形から 12.8 を引く。

以上で、高さ方向の調査・検証と「次に直すならここ」までの整理を完了している。
