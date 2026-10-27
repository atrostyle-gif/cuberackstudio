// =========================================================
// BS 廃番・在庫限り
// - 在庫の正本は STAFF の Square CSV（stockQtyByStockKey）
// - 新しい在庫DBは作らない / 設計操作では在庫を減算しない
// - 取得できない場合はゼロと断定せず「在庫未確認」
// =========================================================
(function (global) {
  "use strict";

  var STATUS = {
    NA: "na",
    OK: "ok",
    SHORTAGE: "shortage",
    ZERO: "zero",
    UNKNOWN: "unknown",
  };

  function normalize(mat) {
    if (typeof global.normalizeMaterial === "function") return global.normalizeMaterial(mat);
    var s = String(mat || "IRON").toUpperCase().trim();
    if (s === "BRASS") return "BS";
    return s === "BS" || s === "SUS" ? s : "IRON";
  }

  function stockMap() {
    return typeof global.getStaffStockQtyMap === "function" ? global.getStaffStockQtyMap() : null;
  }

  function catalogLoaded() {
    return typeof global.isStaffStockCatalogLoaded === "function" && !!global.isStaffStockCatalogLoaded();
  }

  function stockKeyFor(partKey, material) {
    if (!global.StockCompare || typeof global.StockCompare.getStockKeyFromBomRow !== "function") return "";
    return global.StockCompare.getStockKeyFromBomRow({
      key: String(partKey || ""),
      material: material,
    });
  }

  function partLabel(partKey) {
    var key = String(partKey || "");
    if (typeof global.getPartInfo === "function") {
      try {
        var info = global.getPartInfo(key, "BS");
        if (info && info.label) return info.label;
      } catch (_) {}
    }
    return key;
  }

  function connectorLengthMm(data) {
    if (!data) return 0;
    if (data.isCustom && Number(data.customLength) > 0) return Math.round(Number(data.customLength));
    return Math.round(Number(data.lengthMm) || 0);
  }

  function connectorPartKey(kind, data) {
    var len = connectorLengthMm(data);
    var mat = normalize(data && data.material);
    if (data && data.isCustom) return String(kind) + "_custom_" + mat + "_" + len;
    return String(kind) + "_" + len;
  }

  function countEstimate(partKey, material) {
    var mat = normalize(material);
    var key = String(partKey || "");
    var parts = global.currentEstimateParts;
    var sum = 0;
    if (!Array.isArray(parts)) return 0;
    for (var i = 0; i < parts.length; i++) {
      var row = parts[i];
      if (!row) continue;
      if (String(row.key) !== key) continue;
      if (normalize(row.material) !== mat) continue;
      sum += Number(row.qty) || 0;
    }
    return sum;
  }

  function countCurrent(partKey, material) {
    var mat = normalize(material);
    var key = String(partKey || "");
    if (key === "jointBall") {
      return normalize((typeof global.getPartTypeMaterial === "function" && global.getPartTypeMaterial("jointBall")) || "IRON") === mat
        ? (global.joints || []).length
        : 0;
    }
    if (key === "leg") {
      return normalize((typeof global.getPartTypeMaterial === "function" && global.getPartTypeMaterial("leg")) || "IRON") === mat
        ? (global.legs || []).length
        : 0;
    }
    var kind = null;
    if (key.indexOf("beam_") === 0) kind = "beam";
    else if (key.indexOf("pole_") === 0) kind = "pole";
    if (kind) {
      var list = kind === "beam" ? (global.beams || []) : (global.poles || []);
      var n = 0;
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (!c) continue;
        if (normalize(c.material) !== mat) continue;
        if (connectorPartKey(kind, c) === key) n += 1;
      }
      return n;
    }
    return countEstimate(key, mat);
  }

  function lookup(partKey, material, requiredQty) {
    var mat = normalize(material);
    var required = Math.max(0, Math.floor(Number(requiredQty) || 0));
    if (mat !== "BS") {
      return {
        applicable: false,
        status: STATUS.NA,
        partKey: partKey,
        material: mat,
        requiredQty: required,
        stockQty: null,
        shortageQty: 0,
        stockKey: "",
        catalogLoaded: catalogLoaded(),
        estimateQty: countCurrent(partKey, mat),
      };
    }
    var key = stockKeyFor(partKey, "BS");
    var map = stockMap();
    var loaded = catalogLoaded();
    var hasKey = !!(map && key && Object.prototype.hasOwnProperty.call(map, key));
    var estimateQty = countCurrent(partKey, "BS");
    if (!hasKey) {
      return {
        applicable: true,
        status: STATUS.UNKNOWN,
        partKey: partKey,
        material: "BS",
        requiredQty: required,
        stockQty: null,
        shortageQty: null,
        stockKey: key,
        catalogLoaded: loaded,
        estimateQty: estimateQty,
      };
    }
    var stockQty = Math.max(0, Math.floor(Number(map[key]) || 0));
    if (stockQty <= 0) {
      return {
        applicable: true,
        status: STATUS.ZERO,
        partKey: partKey,
        material: "BS",
        requiredQty: required,
        stockQty: 0,
        shortageQty: required,
        stockKey: key,
        catalogLoaded: loaded,
        estimateQty: estimateQty,
      };
    }
    if (required > stockQty) {
      return {
        applicable: true,
        status: STATUS.SHORTAGE,
        partKey: partKey,
        material: "BS",
        requiredQty: required,
        stockQty: stockQty,
        shortageQty: required - stockQty,
        stockKey: key,
        catalogLoaded: loaded,
        estimateQty: estimateQty,
      };
    }
    return {
      applicable: true,
      status: STATUS.OK,
      partKey: partKey,
      material: "BS",
      requiredQty: required,
      stockQty: stockQty,
      shortageQty: 0,
      stockKey: key,
      catalogLoaded: loaded,
      estimateQty: estimateQty,
    };
  }

  function statusText(result) {
    if (!result || result.status === STATUS.NA) return "";
    var name = partLabel(result.partKey);
    if (result.status === STATUS.UNKNOWN) {
      return name + "：在庫確認が必要（在庫未確認）";
    }
    if (result.status === STATUS.ZERO) {
      return name + "：廃番・在庫なし";
    }
    if (result.status === STATUS.SHORTAGE) {
      return name + "：在庫不足（見積 " + result.requiredQty + " / 在庫 " + result.stockQty + " / 不足 " + result.shortageQty + "）";
    }
    return name + "：在庫あり（残数 " + result.stockQty + "）";
  }

  function canConfirmNew(result) {
    if (!result || !result.applicable) return true;
    return result.status === STATUS.OK || result.status === STATUS.SHORTAGE;
  }

  function notify(message, level) {
    var panel = document.getElementById("bs-stock-banner");
    if (panel) {
      panel.hidden = !message;
      panel.textContent = message || "";
      panel.setAttribute("data-level", level || "info");
      panel.style.color = level === "block" ? "#b42318" : level === "warn" ? "#b54708" : "";
    }
    if (message) console.warn("[bs-stock]", message);
    try {
      global.dispatchEvent(new CustomEvent("cuberack:bs-stock-notice", {
        detail: { message: message || "", level: level || "info" },
      }));
    } catch (_) {}
  }

  function gateNewPart(/* partKey, material, extraQty, label */) {
    // CADツールバー改善: 在庫ゲートは行わない。lookup は見積表示用に残す。
    return { ok: true, skipped: true, status: STATUS.NA };
  }

  function gateConnectorAdd(kind, lengthMm, material) {
    var len = Math.round(Number(lengthMm) || 0);
    var key = String(kind) + "_" + len;
    return gateNewPart(key, material, 1, (kind === "pole" ? "Pole_" : "Beam_") + len);
  }

  function gateConvertItems(/* kind, items, material */) {
    return { ok: true, skipped: true, status: STATUS.NA };
  }

  function gateJointSetApply(/* material, extraJointQty */) {
    return { ok: true, skipped: true, status: STATUS.NA };
  }

  function currentMaterial() {
    if (typeof global.getCurrentMaterial === "function") return normalize(global.getCurrentMaterial());
    return normalize(global.__CR_CURRENT_MATERIAL__);
  }

  function refreshUi() {
    var panel = document.getElementById("bs-stock-panel");
    var linesEl = document.getElementById("bs-stock-lines");
    if (!panel || !linesEl) return;
    var mat = currentMaterial();
    var jointMat = normalize(typeof global.getPartTypeMaterial === "function" ? global.getPartTypeMaterial("jointBall") : "IRON");
    var jointSel = document.getElementById("mat-jointSet");
    if (jointSel && jointSel.value) jointMat = normalize(jointSel.value) || jointMat;
    var show = mat === "BS" || jointMat === "BS";
    panel.hidden = !show;
    if (!show) return;

    var rows = [];
    if (!catalogLoaded()) {
      rows.push("Square在庫CSVが未読込です。在庫数量は未確認として扱います（ゼロとは断定しません）。");
    } else {
      rows.push("在庫照合は STAFF の Square CSV（現在の数量 大阪店）を使用します。設計操作では在庫を減らしません。");
    }

    var seen = {};
    function addRow(partKey, required) {
      var result = lookup(partKey, "BS", Math.max(1, required || 0));
      if (!result.applicable) return;
      var line = statusText(result) + " / 見積数量 " + (result.estimateQty || 0);
      if (!seen[partKey]) {
        seen[partKey] = true;
        rows.push(line);
      }
    }

    if (mat === "BS") {
      (global.beams || []).forEach(function (b) {
        if (b && normalize(b.material) === "BS") addRow(connectorPartKey("beam", b), countCurrent(connectorPartKey("beam", b), "BS"));
      });
      (global.poles || []).forEach(function (p) {
        if (p && normalize(p.material) === "BS") addRow(connectorPartKey("pole", p), countCurrent(connectorPartKey("pole", p), "BS"));
      });
      var lengths = global.BEAM_LENGTH_OPTIONS || [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
      var grouped = { ok: [], shortage: [], zero: [], unknown: [] };
      lengths.forEach(function (len) {
        ["beam_", "pole_"].forEach(function (prefix) {
          var key = prefix + len;
          if (seen[key]) return;
          var result = lookup(key, "BS", 1);
          if (result && grouped[result.status]) grouped[result.status].push(partLabel(key));
        });
      });
      if (grouped.ok.length) rows.push("在庫あり: " + grouped.ok.join("、"));
      if (grouped.shortage.length) rows.push("在庫不足: " + grouped.shortage.join("、"));
      if (grouped.zero.length) rows.push("廃番・在庫なし: " + grouped.zero.join("、"));
      if (grouped.unknown.length) rows.push("在庫確認が必要: " + grouped.unknown.join("、"));
    }
    if (jointMat === "BS") {
      ["jointBall", "leg", "jointCap", "topCap", "sideCap", "beamNut"].forEach(function (type) {
        addRow(type, Math.max(1, countCurrent(type, "BS")));
      });
    }

    linesEl.innerHTML = "";
    rows.forEach(function (text) {
      var div = document.createElement("div");
      div.textContent = text;
      linesEl.appendChild(div);
    });
  }

  function bindUi() {
    var sel = document.getElementById("material-select");
    var jointSel = document.getElementById("mat-jointSet");
    if (sel && !sel.__bsStockBound) {
      sel.__bsStockBound = true;
      sel.addEventListener("change", refreshUi);
    }
    if (jointSel && !jointSel.__bsStockBound) {
      jointSel.__bsStockBound = true;
      jointSel.addEventListener("change", refreshUi);
    }
    global.addEventListener("cuberack:stock-loaded", refreshUi);
    refreshUi();
  }

  function useStaffMap(entries, loaded) {
    var map = stockMap();
    if (!map) return false;
    Object.keys(map).forEach(function (k) { delete map[k]; });
    Object.keys(entries || {}).forEach(function (k) {
      var q = Number(entries[k]);
      map[k] = Number.isNaN(q) || q < 0 ? 0 : Math.floor(q);
    });
    if (typeof global.markStaffStockCatalogLoaded === "function") {
      global.markStaffStockCatalogLoaded(!!loaded);
    }
    refreshUi();
    return true;
  }

  global.v3BsStock = {
    STATUS: STATUS,
    lookup: lookup,
    statusText: statusText,
    canConfirmNew: canConfirmNew,
    gateNewPart: gateNewPart,
    gateConnectorAdd: gateConnectorAdd,
    gateConvertItems: gateConvertItems,
    gateJointSetApply: gateJointSetApply,
    connectorPartKey: connectorPartKey,
    countCurrent: countCurrent,
    refreshUi: refreshUi,
    notify: notify,
    useStaffMap: useStaffMap,
  };

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", bindUi);
  } else {
    bindUi();
  }
})(typeof window !== "undefined" ? window : this);
