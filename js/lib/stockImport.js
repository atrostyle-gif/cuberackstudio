// =========================================================
// Square在庫CSV読み込み・正規化（在庫照合用）
// - 使用列: 商品名, バリエーション名, 現在の数量 大阪店
// - 在庫比較キーは複合キー「商品名 | バリエーション名」
// - PapaParse を前提（グローバル Papa または window.Papa）
// =========================================================

(function (global) {
  "use strict";

  var Papa = global.Papa || (global.window && global.window.Papa);

  /** @typedef {{ stockKey: string, itemName: string, partName: string, stockQty: number }} StockItem */

  var REQUIRED_HEADERS = [
    "商品名",
    "バリエーション名",
    "現在の数量 大阪店",
  ];

  /**
   * CSV文字列をパースし、StockItem 配列に正規化する。
   * @param {string} csvText - CSV文字列（1行目はヘッダー）
   * @returns {{ success: boolean, items?: StockItem[], error?: string }}
   */
  function parseAndNormalizeStockCsv(csvText) {
    if (typeof csvText !== "string") {
      return { success: false, error: "CSVデータが無効です。" };
    }
    var trimmed = csvText.trim();
    if (!trimmed.length) {
      return { success: false, error: "CSVが空です。" };
    }

    if (!Papa) {
      return { success: false, error: "PapaParse が読み込まれていません。" };
    }

    var parsed = Papa.parse(trimmed, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
    });

    if (parsed.errors && parsed.errors.length > 0) {
      var first = parsed.errors[0];
      return {
        success: false,
        error: "CSVのパースエラー: " + (first.message || String(first)),
      };
    }

    var rows = parsed.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "有効なデータ行がありません。" };
    }

    var firstRow = rows[0];
    var missing = REQUIRED_HEADERS.filter(function (h) {
      return !Object.prototype.hasOwnProperty.call(firstRow, h);
    });
    if (missing.length > 0) {
      return {
        success: false,
        error:
          "必須列がありません: " +
          missing.join(", ") +
          "。Square商品マスターCSVの1行目にヘッダーがあることを確認してください。",
      };
    }

    /** @type {Record<string, StockItem>} */
    var byStockKey = {};

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var itemNameRaw = row["商品名"];
      var variationRaw = row["バリエーション名"];
      var itemName =
        typeof itemNameRaw === "string"
          ? itemNameRaw.trim()
          : String(itemNameRaw || "").trim();
      var partName =
        typeof variationRaw === "string"
          ? variationRaw.trim()
          : String(variationRaw || "").trim();
      if (!itemName && !partName) continue;

      var stockKey = itemName + " | " + partName;

      var qtyRaw = row["現在の数量 大阪店"];
      var num = Number(qtyRaw);
      if (Number.isNaN(num)) num = 0;
      var stockQty = num < 0 ? 0 : Math.floor(num);

      if (byStockKey[stockKey]) {
        byStockKey[stockKey].stockQty += stockQty;
      } else {
        byStockKey[stockKey] = {
          stockKey: stockKey,
          itemName: itemName,
          partName: partName,
          stockQty: stockQty,
        };
      }
    }

    var items = Object.keys(byStockKey).map(function (k) {
      return byStockKey[k];
    });

    return { success: true, items: items };
  }

  /**
   * ファイルを読み込み、parseAndNormalizeStockCsv に渡す。
   * @param {File} file
   * @returns {Promise<{ success: boolean, items?: StockItem[], error?: string }>}
   */
  function readStockCsvFile(file) {
    if (!file || typeof file.text !== "function") {
      return Promise.resolve({
        success: false,
        error: "ファイルを読み込めません。",
      });
    }
    return file
      .text()
      .then(function (text) {
        return parseAndNormalizeStockCsv(text);
      })
      .catch(function (err) {
        return {
          success: false,
          error: "ファイルの読み込みに失敗しました: " + (err && err.message ? err.message : String(err)),
        };
      });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseAndNormalizeStockCsv: parseAndNormalizeStockCsv,
      readStockCsvFile: readStockCsvFile,
      REQUIRED_HEADERS: REQUIRED_HEADERS,
    };
  } else {
    global.StockImport = {
      parseAndNormalizeStockCsv: parseAndNormalizeStockCsv,
      readStockCsvFile: readStockCsvFile,
      REQUIRED_HEADERS: REQUIRED_HEADERS,
    };
  }
})(typeof window !== "undefined" ? window : this);
