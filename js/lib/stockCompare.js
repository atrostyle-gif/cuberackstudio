// =========================================================
// BOM と在庫の照合（在庫照合用）
// - 在庫比較キーは複合キー「商品名 | バリエーション名」
// - BOM 内部キー + material（+ length for beam/pole）から同一形式の stockKey へ変換
// - ProductionRow は Phase 2 で納期・スタンプ用フィールドを追加しやすい形で定義
// =========================================================

(function (global) {
  "use strict";

  /**
   * BOM 1行の形（既存 currentEstimateParts の要素）
   * @typedef {{ key: string, name?: string | null, qty: number, material?: string }} BomRow
   */

  /**
   * 在庫1件（比較キー = 商品名 | バリエーション名）
   * @typedef {{ stockKey: string, itemName: string, partName: string, stockQty: number }} StockItem
   */

  /**
   * 照合結果1行（displayName は部材明細と同じ表示名、materialLabel は表示用材質、stockKey 等は内部照合用）
   * materialLabel: BOM row の material を表示用に正規化（IRON/SUS/BR、不要な部品は "-"）
   * @typedef {{
   *   stockKey: string,
   *   displayName: string,
   *   partType: string,
   *   materialLabel: string,
   *   sizeLabel: string,
   *   partName: string,
   *   requiredQty: number,
   *   stockQty: number,
   *   shortageQty: number,
   *   suggestedMakeQty: number,
   *   manualMakeQty: number | null,
   *   finalMakeQty: number
   * }} ProductionRow
   */

  /**
   * 材質を Square 用に正規化（大文字化し、揺れを吸収）
   * IRON/STEEL/SS400 -> IRON, SUS/STAINLESS/SUS304/SUS316 -> SUS, BR/BRASS -> BR
   * @param {string} [material]
   * @returns {string} IRON | SUS | BR 等
   */
  function normalizeMaterialForStock(material) {
    var m = (material && String(material).trim()) || "";
    if (!m) return "IRON";
    var u = m.toUpperCase();
    if (u === "STEEL" || u === "SS400" || u === "IRON") return "IRON";
    if (u === "STAINLESS" || u === "SUS304" || u === "SUS316" || u === "SUS") return "SUS";
    if (u === "BRASS" || u === "BR") return "BR";
    return u || "IRON";
  }

  /**
   * BOM 行から表示用の部品種別・材質・長さ／規格を返す。
   * @param {BomRow} bomRow
   * @returns {{ partType: string, materialLabel: string, sizeLabel: string }}
   */
  function getBomRowDisplayInfo(bomRow) {
    var partType = "";
    var materialLabel = "-";
    var sizeLabel = "-";
    if (!bomRow || typeof bomRow.key !== "string") {
      partType = (bomRow && bomRow.name && String(bomRow.name).trim()) || (bomRow && bomRow.key ? String(bomRow.key) : "") || "-";
      return { partType: partType, materialLabel: materialLabel, sizeLabel: sizeLabel };
    }
    var key = bomRow.key.trim();
    var mat = normalizeMaterialForStock(bomRow.material);

    switch (key) {
      case "jointBall":
        partType = "JOINT BALL"; materialLabel = mat; break;
      case "jointCap":
        partType = "JOINT CAP"; materialLabel = mat; break;
      case "sideCap":
        partType = "SIDE CAP"; materialLabel = mat; break;
      case "topCap":
        partType = "TOP CAP"; materialLabel = mat; break;
      case "leg":
        partType = "LEG"; materialLabel = mat; break;
      case "legBoss":
        partType = "LEG BOSS"; materialLabel = "IRON"; break;
      case "m5Screw":
        partType = "M5皿ネジ"; materialLabel = "-"; break;
      case "beamNut":
        partType = "BEAM NUT"; materialLabel = mat; break;
      default:
        break;
    }

    if (key.indexOf("beam_") === 0) {
      var beamLen = getLengthFromBomKey(key);
      partType = "BEAM";
      materialLabel = mat;
      sizeLabel = beamLen != null ? String(beamLen) : "-";
    } else if (key.indexOf("pole_") === 0) {
      var poleLen = getLengthFromBomKey(key);
      partType = "POLE";
      materialLabel = mat;
      sizeLabel = poleLen != null ? String(poleLen) : "-";
    }

    if (!partType) {
      partType = (bomRow.name && String(bomRow.name).trim()) || key;
    }
    return { partType: partType, materialLabel: materialLabel, sizeLabel: sizeLabel };
  }

  /**
   * BOM の key から beam/pole の長さを取得する。
   * key 形式: beam_200, beam_custom_IRON_799, pole_300, pole_custom_BS_1000
   * @param {string} key
   * @returns {number | null}
   */
  function getLengthFromBomKey(key) {
    if (!key || typeof key !== "string") return null;
    var parts = key.split("_");
    if (parts.length < 2) return null;
    var last = parts[parts.length - 1];
    var num = parseInt(last, 10);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  /**
   * BOM 内部キー + material から Square の在庫比較キー（商品名 | バリエーション名）を返す。
   * 変換できない場合は console に bomRow を出力し、bomRow.name または bomRow.key を返す。
   * @param {BomRow} bomRow - currentEstimateParts の1要素
   * @returns {string}
   */
  function getStockKeyFromBomRow(bomRow) {
    if (!bomRow || typeof bomRow.key !== "string") {
      return (bomRow && bomRow.name && String(bomRow.name).trim()) || (bomRow && bomRow.key ? String(bomRow.key) : "") || "";
    }
    var key = bomRow.key.trim();
    var mat = normalizeMaterialForStock(bomRow.material);

    switch (key) {
      case "jointBall":
        return "CUBE RACK PARTS | JOINT BALL (" + mat + ")";
      case "jointCap":
        return "CUBE RACK PARTS | JOINT CAP (" + mat + ")";
      case "sideCap":
        return "CUBE RACK PARTS | SIDE CAP (" + mat + ")";
      case "topCap":
        return "CUBE RACK PARTS | TOP CAP (" + mat + ")";
      case "leg":
        return "CUBE RACK PARTS | LEG (" + mat + ")";
      case "legBoss":
        return "CUBE RACK PARTS | LEG BOSS (IRON)";
      case "m5Screw":
        return "CUBE RACK PARTS | M5皿ﾈｼﾞ(ﾌﾟﾗｽ穴)";
      case "beamNut":
        return "CUBE RACK PARTS | BEAM NUT (" + mat + ")";
      default:
        break;
    }

    if (key.indexOf("beam_") === 0) {
      var beamLen = getLengthFromBomKey(key);
      if (beamLen != null) {
        return "CUBERACK BEAM(" + mat + ") | " + String(beamLen);
      }
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[stockCompare] BOM beam から長さを取得できません:", bomRow);
      }
      return (bomRow.name && String(bomRow.name).trim()) || key;
    }

    if (key.indexOf("pole_") === 0) {
      var poleLen = getLengthFromBomKey(key);
      if (poleLen != null) {
        return "CUBERACK POLE(" + mat + ") | " + String(poleLen);
      }
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[stockCompare] BOM pole から長さを取得できません:", bomRow);
      }
      return (bomRow.name && String(bomRow.name).trim()) || key;
    }

    return (bomRow.name && String(bomRow.name).trim()) || key;
  }

  /**
   * 現在の描画BOM（currentEstimateParts）を取得する。
   * 部材明細と同じ集計元（estimate.js の calcAndRenderEstimate が設定する window.currentEstimateParts）を参照する。
   * 未計算・空の場合は calcAndRenderEstimate を叩いてから取得する。
   * 在庫照合テーブルは calcAndRenderEstimate 終了時に refreshStockReconcileTable で再描画されるため、部材追加後も最新BOMと同期する。
   * @returns {BomRow[]}
   */
  function getBomRows() {
    var win = global.window || global;
    var parts = win.currentEstimateParts;
    if (Array.isArray(parts) && parts.length > 0) {
      return parts;
    }
    if (typeof win.calcAndRenderEstimate === "function") {
      win.calcAndRenderEstimate();
      parts = win.currentEstimateParts;
    }
    return Array.isArray(parts) ? parts : [];
  }

  /**
   * 在庫配列を stockKey -> stockQty のマップに変換（partName は先頭のものを使用）
   * @param {StockItem[]} stockItems
   * @returns {{ byStockKey: Record<string, number>, partNameByStockKey: Record<string, string> }}
   */
  function stockItemsToMap(stockItems) {
    var byStockKey = /** @type {Record<string, number>} */ ({});
    var partNameByStockKey = /** @type {Record<string, string>} */ ({});
    if (!Array.isArray(stockItems)) return { byStockKey, partNameByStockKey };
    for (var i = 0; i < stockItems.length; i++) {
      var it = stockItems[i];
      if (!it || !it.stockKey) continue;
      var k = String(it.stockKey).trim();
      var qty = Number(it.stockQty);
      byStockKey[k] = (byStockKey[k] || 0) + (Number.isNaN(qty) ? 0 : Math.max(0, qty));
      if (it.partName && !partNameByStockKey[k]) {
        partNameByStockKey[k] = String(it.partName).trim();
      }
    }
    return { byStockKey, partNameByStockKey };
  }

  /**
   * BOM と在庫を比較し、ProductionRow 配列を返す。
   * @param {BomRow[]} bomRows - 現在のBOM（key, name, qty, material）
   * @param {StockItem[]} stockItems - Square CSV から取得した在庫（インポート時用。省略時は options.stockQtyByStockKey のみ使用）
   * @param {{ manualMakeQtyByStockKey?: Record<string, number>, stockQtyByStockKey?: Record<string, number> }} [options] - 手動製作数、現在在庫数（表の在庫欄の値）
   * @returns {{ rows: ProductionRow[], unregisteredStockKeys: string[] }}
   */
  function compareBomWithStock(bomRows, stockItems, options) {
    var manualByKey = (options && options.manualMakeQtyByStockKey) || {};
    var stockQtyByKey = (options && options.stockQtyByStockKey) || null;
    var map = stockItemsToMap(stockItems);
    var byStockKey = map.byStockKey;
    var partNameByStockKey = map.partNameByStockKey;

    /** @type {ProductionRow[]} */
    var rows = [];
    /** @type {string[]} */
    var unregisteredStockKeys = [];

    if (!Array.isArray(bomRows)) return { rows: [], unregisteredStockKeys: [] };

    for (var i = 0; i < bomRows.length; i++) {
      var bom = bomRows[i];
      var stockKey = getStockKeyFromBomRow(bom);
      if (!stockKey) continue;

      var requiredQty = Number(bom.qty) || 0;
      var stockQty;
      if (stockQtyByKey != null && stockQtyByKey[stockKey] !== undefined) {
        stockQty = Number(stockQtyByKey[stockKey]);
        if (Number.isNaN(stockQty) || stockQty < 0) stockQty = 0;
      } else {
        stockQty = byStockKey[stockKey] !== undefined ? byStockKey[stockKey] : 0;
      }
      if (byStockKey[stockKey] === undefined && (stockQtyByKey == null || stockQtyByKey[stockKey] === undefined)) {
        unregisteredStockKeys.push(stockKey);
      }
      var shortageQty = Math.max(requiredQty - stockQty, 0);
      var suggestedMakeQty = shortageQty;
      var manualMakeQty =
        manualByKey[stockKey] !== undefined && manualByKey[stockKey] !== null
          ? Number(manualByKey[stockKey])
          : null;
      if (manualMakeQty !== null && Number.isNaN(manualMakeQty)) {
        manualMakeQty = null;
      }
      var finalMakeQty =
        manualMakeQty !== null && manualMakeQty >= 0
          ? manualMakeQty
          : suggestedMakeQty;

      var partName =
        (bom.name && String(bom.name).trim()) ||
        partNameByStockKey[stockKey] ||
        stockKey;

      var displayInfo = getBomRowDisplayInfo(bom);
      var displayName =
        (bom.name && String(bom.name).trim()) || partName || stockKey;

      rows.push({
        stockKey: stockKey,
        displayName: displayName,
        partType: displayInfo.partType,
        materialLabel: displayInfo.materialLabel,
        sizeLabel: displayInfo.sizeLabel,
        partName: partName,
        requiredQty: requiredQty,
        stockQty: stockQty,
        shortageQty: shortageQty,
        suggestedMakeQty: suggestedMakeQty,
        manualMakeQty: manualMakeQty,
        finalMakeQty: finalMakeQty,
      });
    }

    return { rows: rows, unregisteredStockKeys: unregisteredStockKeys };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      getStockKeyFromBomRow: getStockKeyFromBomRow,
      getBomRowDisplayInfo: getBomRowDisplayInfo,
      getLengthFromBomKey: getLengthFromBomKey,
      normalizeMaterialForStock: normalizeMaterialForStock,
      getBomRows: getBomRows,
      stockItemsToMap: stockItemsToMap,
      compareBomWithStock: compareBomWithStock,
    };
  } else {
    global.StockCompare = {
      getStockKeyFromBomRow: getStockKeyFromBomRow,
      getBomRowDisplayInfo: getBomRowDisplayInfo,
      getLengthFromBomKey: getLengthFromBomKey,
      normalizeMaterialForStock: normalizeMaterialForStock,
      getBomRows: getBomRows,
      stockItemsToMap: stockItemsToMap,
      compareBomWithStock: compareBomWithStock,
    };
  }
})(typeof window !== "undefined" ? window : this);
