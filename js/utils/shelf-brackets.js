// =========================================================
// Shelf Bracket Resolver (V1.1.1)
// - 棚板の左右金物（標準/凸/凹）を隣接関係から決定
// - 価格は形状に依存しない（幅だけ）
// =========================================================

(function initShelfBracketResolver(){
  function snap(v, step = 1) {
    return Math.round(v / step) * step;
  }

  function getShelfBoundsMm(shelf) {
    // shelf.j4 から min/max を取る
    const joints = window.joints || [];
    const pts = (shelf?.j4 || []).map(i => joints[i]).filter(Boolean);
    if (pts.length !== 4) return null;

    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  function getNominalWidthKeyFromShelf(shelf) {
    // 棚板の"名目幅"から金物単価キーを決める
    // 優先: shelf.nominalW があればそれ
    const wNom = Number(shelf?.nominalW || 0);
    if (wNom) return String(wNom);

    // 無ければ実寸幅から推定（91->100, 200->200, 306.5->300, 417->400, 600は別途）
    // 幅と奥行の定義を逆にする：幅 = Z方向、奥行 = X方向
    const b = getShelfBoundsMm(shelf);
    if (!b) return "100";

    const w = Math.abs(b.maxZ - b.minZ); // Z方向を幅とする
    // 許容誤差を見て近い規格に丸め
    const cand = [
      { key:"100", mm: 91 },
      { key:"200", mm: 200 },
      { key:"300", mm: 306.5 },
      { key:"400", mm: 417 },
      { key:"600", mm: 600 }, // 600は実寸が別途なら後で調整
    ];
    let best = cand[0], bestD = Infinity;
    for (const c of cand) {
      const d = Math.abs(w - c.mm);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best.key;
  }

  // 同一段・同一列とみなす基準（誤差吸収）
  const EPS_Y = 5;   // 5mm（段の誤差）
  const EPS_Z = 50;  // 50mm（幅方向の隣接判定の許容誤差を大きく）
  const EPS_X = 5;   // 5mm（奥行方向の誤差）

  function sameLevel(a, b) {
    return Math.abs(a.minY - b.minY) <= EPS_Y && Math.abs(a.maxY - b.maxY) <= EPS_Y;
  }
  // 同一列：X方向（奥行）が同じ（幅方向に並ぶ棚板を同一列とみなす）
  // 幅と奥行の定義を逆にする：幅 = Z方向、奥行 = X方向
  // ただし、奥行方向に並んでいる場合も考慮するため、条件を緩和
  function sameRow(a, b) {
    // X方向（奥行）が重なっている、または近い場合に同一列とみなす
    // または、X方向に並んでいる場合（接している場合）も同一列とみなす
    const xOverlap = !(a.maxX < b.minX - EPS_X || b.maxX < a.minX - EPS_X);
    const xAdjacent = Math.abs(a.maxX - b.minX) <= EPS_X || Math.abs(b.maxX - a.minX) <= EPS_X;
    return xOverlap || xAdjacent;
  }

  // a の右端（maxZ）が b の左端（minZ）に接している＝隣接（右隣）
  // 棚受け金物は幅方向（Z方向）につく
  // 隣接判定：aの右端とbの左端の距離が許容範囲内（beamの幅を考慮）
  // ただし、Z方向が同じ範囲の場合は、X方向の位置関係で判定
  function isRightNeighbor(boundsA, boundsB) {
    if (!sameLevel(boundsA, boundsB)) return false;
    if (!sameRow(boundsA, boundsB)) return false;
    
    // Z方向が重なっている場合（同じ幅範囲）
    const zOverlap = !(boundsA.maxZ < boundsB.minZ - EPS_Z || boundsB.maxZ < boundsA.minZ - EPS_Z);
    if (zOverlap) {
      // Z方向が同じ場合は、X方向の位置関係で判定
      // aがbより右側（X方向）にある場合、aの右側=凸、bの左側=凹
      return boundsA.minX >= boundsB.maxX - EPS_X;
    }
    
    // Z方向が重なっていない場合、Z方向の距離で判定
    const dist = boundsB.minZ - boundsA.maxZ;
    return dist >= -EPS_Z && dist <= EPS_Z && boundsA.maxZ <= boundsB.minZ + EPS_Z;
  }

  // a の左端（minZ）が b の右端（maxZ）に接している＝隣接（左隣）
  function isLeftNeighbor(boundsA, boundsB) {
    if (!sameLevel(boundsA, boundsB)) return false;
    if (!sameRow(boundsA, boundsB)) return false;
    
    // Z方向が重なっている場合（同じ幅範囲）
    const zOverlap = !(boundsA.maxZ < boundsB.minZ - EPS_Z || boundsB.maxZ < boundsA.minZ - EPS_Z);
    if (zOverlap) {
      // Z方向が同じ場合は、X方向の位置関係で判定
      // aがbより左側（X方向）にある場合、aの左側=凹、bの右側=凸
      return boundsA.maxX <= boundsB.minX + EPS_X;
    }
    
    // Z方向が重なっていない場合、Z方向の距離で判定
    const dist = boundsA.minZ - boundsB.maxZ;
    return dist >= -EPS_Z && dist <= EPS_Z && boundsA.minZ >= boundsB.maxZ - EPS_Z;
  }

  // 形状決定：標準 / 凸 / 凹
  // 連結面は「左棚板=凸（右側）」「右棚板=凹（左側）」
  // leftShape: 左側、rightShape: 右側
  // 幅と奥行の定義を逆にする：幅 = Z方向、奥行 = X方向
  window.resolveShelfBracketShapes = function resolveShelfBracketShapes(shelves) {
    const list = shelves || window.shelves || [];
    const info = list.map((s, idx) => {
      const b = getShelfBoundsMm(s);
      return { s, idx, b };
    }).filter(x => !!x.b);

    // 初期は両側標準
    const result = new Map(); // idx -> { leftShape, rightShape, widthKey }
    for (const it of info) {
      result.set(it.idx, {
        leftShape: "STD",   // 左側
        rightShape: "STD",  // 右側
        widthKey: getNominalWidthKeyFromShelf(it.s),
      });
    }

    // 隣接関係から形状を上書き
    // aの右側にbが隣接している場合：「aの右側=凸」「bの左側=凹」
    let neighborCount = 0;
    const debugInfo = [];
    
    for (const a of info) {
      for (const b of info) {
        if (a.idx === b.idx) continue;
        
        const sameL = sameLevel(a.b, b.b);
        const sameR = sameRow(a.b, b.b);
        const zDistRight = b.minZ - a.maxZ;
        const zDistLeft = a.minZ - b.maxZ;
        const isRight = isRightNeighbor(a.b, b.b);
        const isLeft = isLeftNeighbor(a.b, b.b);
        
        if (list.length <= 4) {
          // デバッグ情報を記録（棚板が少ない場合のみ）
          debugInfo.push({
            aIdx: a.idx,
            bIdx: b.idx,
            sameLevel: sameL,
            sameRow: sameR,
            zDistRight: zDistRight.toFixed(1),
            zDistLeft: zDistLeft.toFixed(1),
            isRightNeighbor: isRight,
            isLeftNeighbor: isLeft,
            aZRange: `${a.b.minZ.toFixed(1)}-${a.b.maxZ.toFixed(1)}`,
            bZRange: `${b.b.minZ.toFixed(1)}-${b.b.maxZ.toFixed(1)}`,
          });
        }
        
        if (isRight) {
          // aの右端（maxZ）がbの左端（minZ）に接している
          const ra = result.get(a.idx);
          const rb = result.get(b.idx);
          if (ra) ra.rightShape = "CONVEX";  // aの右側=凸
          if (rb) rb.leftShape = "CONCAVE";  // bの左側=凹
          neighborCount++;
        } else if (isLeft) {
          // aの左側にbが隣接している場合（逆方向のチェック）
          const ra = result.get(a.idx);
          const rb = result.get(b.idx);
          if (ra) ra.leftShape = "CONCAVE";  // aの左側=凹
          if (rb) rb.rightShape = "CONVEX";  // bの右側=凸
          neighborCount++;
        }
      }
    }
    
    // デバッグ用：隣接判定の結果をログ出力
    if (list.length > 1) {
      console.log("[shelf-brackets] 隣接判定結果:", {
        shelfCount: list.length,
        neighborCount: neighborCount,
        EPS_Z: EPS_Z,
        EPS_X: EPS_X,
        EPS_Y: EPS_Y,
      });
      if (debugInfo.length > 0) {
        console.log("[shelf-brackets] デバッグ詳細:", debugInfo);
        // 形状設定の結果も出力
        const shapeResults = [];
        for (let i = 0; i < list.length; i++) {
          const r = result.get(i);
          if (r) {
            shapeResults.push({
              shelfIdx: i,
              leftShape: r.leftShape,
              rightShape: r.rightShape,
              widthKey: r.widthKey,
            });
          }
        }
        console.log("[shelf-brackets] 形状設定結果:", shapeResults);
        // 最初の2つの棚板の詳細情報も出力
        if (info.length >= 2) {
          console.log("[shelf-brackets] 棚板0:", {
            zRange: `${info[0].b.minZ.toFixed(1)}-${info[0].b.maxZ.toFixed(1)}`,
            xRange: `${info[0].b.minX.toFixed(1)}-${info[0].b.maxX.toFixed(1)}`,
            yRange: `${info[0].b.minY.toFixed(1)}-${info[0].b.maxY.toFixed(1)}`,
          });
          console.log("[shelf-brackets] 棚板1:", {
            zRange: `${info[1].b.minZ.toFixed(1)}-${info[1].b.maxZ.toFixed(1)}`,
            xRange: `${info[1].b.minX.toFixed(1)}-${info[1].b.maxX.toFixed(1)}`,
            yRange: `${info[1].b.minY.toFixed(1)}-${info[1].b.maxY.toFixed(1)}`,
          });
        }
      }
    }

    return result; // Map
  };

  // 見積用：幅別の金物数量を集計（形状内訳も返す）
  window.countShelfBracketsForEstimate = function countShelfBracketsForEstimate() {
    const shelves = window.shelves || [];
    const map = window.resolveShelfBracketShapes(shelves);

    const agg = {}; // widthKey -> { qty, std, convex, concave }
    for (let i = 0; i < shelves.length; i++) {
      const r = map.get(i);
      if (!r) continue;

      const k = r.widthKey || "100";
      if (!agg[k]) agg[k] = { qty: 0, STD: 0, CONVEX: 0, CONCAVE: 0 };

      // 棚板1枚につき左右1個ずつ
      agg[k].qty += 2;

      agg[k][r.leftShape] = (agg[k][r.leftShape] || 0) + 1;
      agg[k][r.rightShape] = (agg[k][r.rightShape] || 0) + 1;
    }
    return agg;
  };
})();

// =========================================================
// Wall Brackets (V1.1.1)
// - 壁板1枚につき両側2本（価格は幅別）
// - 金物はPOLE側（高さ方向）につく
// =========================================================
(function initWallBracketCounter(){
  function getPanelBoundsMm(panel) {
    const joints = window.joints || [];
    const pts = (panel?.j4 || []).map(i => joints[i]).filter(Boolean);
    if (pts.length !== 4) return null;

    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  // 壁板の"幅キー"決定（金物はY方向（高さ方向）につくので、高さから判定）
  // computeBoardBoundsFromJointsで計算されたheightMmを使用（poleの長さから計算済み）
  window.getNominalWidthKeyFromPanel = function(panel) {
    const wNom = Number(panel?.nominalW || 0);
    if (wNom) return String(wNom);

    // computeBoardBoundsFromJointsを使って高さを取得（poleの長さから計算済み + boardInset * 2 を戻す）
    if (typeof window.computeBoardBoundsFromJoints === "function") {
      const b = window.computeBoardBoundsFromJoints(panel.j4, true);
      if (b && b.heightMm > 0) {
        // boardInset * 2 = 4mm を戻して、poleの全長を取得
        const h = b.heightMm + 4;
        
        // 実寸から規格高さ（=金物の幅キー）を推定
        const cand = [
          { key:"100", mm: 100 },
          { key:"200", mm: 200 },
          { key:"300", mm: 300 },
          { key:"400", mm: 400 },
          { key:"600", mm: 600 },
          { key:"800", mm: 800 },
        ];

        let best = cand[0], bestD = Infinity;
        for (const c of cand) {
          const d = Math.abs(h - c.mm);
          if (d < bestD) { best = c; bestD = d; }
        }
        return best.key;
      }
    }

    // フォールバック：境界から高さを計算
    const b = getPanelBoundsMm(panel);
    if (!b) return "100";

    // 高さ（Y方向）から規格を判定
    const h = Math.abs(b.maxY - b.minY);

    // 実寸から規格高さ（=金物の幅キー）を推定
    const cand = [
      { key:"100", mm: 100 },
      { key:"200", mm: 200 },
      { key:"300", mm: 300 },
      { key:"400", mm: 400 },
      { key:"600", mm: 600 },
      { key:"800", mm: 800 },
    ];

    let best = cand[0], bestD = Infinity;
    for (const c of cand) {
      const d = Math.abs(h - c.mm);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best.key;
  };

  // 見積用：幅別に「壁板金物（1本）」の数量を集計
  // 壁板1枚につき2本（両側）
  window.countWallBracketsForEstimate = function() {
    const panels = window.panels || [];
    const agg = {}; // widthKey -> qty(本数)

    for (const p of panels) {
      const k = window.getNominalWidthKeyFromPanel(p);
      if (!agg[k]) agg[k] = 0;
      agg[k] += 2; // 両側
    }
    return agg;
  };
})();
