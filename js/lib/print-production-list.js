// =========================================================
// 製作一覧の印刷（印刷前確認画面 → 印刷）
// - まず印刷前確認画面（モーダル）で現場名・発行日・全体メモ・行ごと納期・備考を編集可能
// - 「印刷する」で window.print() を実行（iframe に印刷用HTMLを書き出し）
// =========================================================

(function (global) {
  "use strict";

  var doc = global.document;

  function formatIssueDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var str = String(s);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * ProductionRow から finalMakeQty > 0 のプレビュー用行を生成する。
   * @param {Array<{ stockKey: string, displayName?: string, materialLabel?: string, partName: string, finalMakeQty: number }>} rows
   * @returns {Array<{ stockKey: string, displayName: string, materialLabel: string, qty: number, dueDate: string, note: string }>}
   */
  function getPreviewRows(rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var qty = Number(r.finalMakeQty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      var displayName =
        (r.displayName != null && String(r.displayName).trim())
          ? r.displayName
          : (r.partName != null ? r.partName : r.stockKey || "");
      var materialLabel = (r.materialLabel != null && String(r.materialLabel).trim()) ? r.materialLabel : "-";
      out.push({
        stockKey: r.stockKey || "",
        displayName: displayName,
        materialLabel: materialLabel,
        qty: qty,
        dueDate: "",
        note: "",
      });
    }
    return out;
  }

  /**
   * 印刷用HTMLを生成（現場名・発行日・全体メモ・表：部材名/材質/製作数/納期/備考）
   * @param {string} siteName
   * @param {string} issueDate
   * @param {string} globalMemo
   * @param {Array<{ displayName: string, materialLabel: string, qty: number, dueDate: string, note: string }>} previewRows
   * @returns {string}
   */
  function buildPrintHtmlFromPreview(siteName, issueDate, globalMemo, previewRows) {
    var rowsHtml = "";
    for (var i = 0; i < previewRows.length; i++) {
      var row = previewRows[i];
      rowsHtml +=
        "<tr>" +
        "<td>" + escapeHtml(row.displayName) + "</td>" +
        "<td class=\"col-material\">" + escapeHtml(row.materialLabel) + "</td>" +
        "<td style=\"text-align:right;\">" + escapeHtml(String(row.qty)) + "</td>" +
        "<td class=\"col-due\">" + escapeHtml(row.dueDate || "") + "</td>" +
        "<td class=\"col-note\">" + escapeHtml(row.note || "") + "</td>" +
        "</tr>";
    }
    var memoBlock = (globalMemo && String(globalMemo).trim())
      ? "<p class=\"memo\">メモ: " + escapeHtml(globalMemo) + "</p>"
      : "";
    var siteBlock = (siteName && String(siteName).trim())
      ? "<div class=\"site-name\">" + escapeHtml(siteName) + "</div>"
      : "";
    return (
      "<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"UTF-8\"><title>製作依頼書</title>" +
      "<style>" +
      "body{ font-family: sans-serif; background:#fff; color:#000; margin:16px; font-size:14px; }" +
      "h1{ font-size:18px; margin:0 0 8px 0; }" +
      ".header-row{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }" +
      ".site-name{ font-size:22px; font-weight:700; }" +
      ".issue-date{ font-size:13px; color:#333; text-align:right; }" +
      "table{ border-collapse: collapse; width:100%; margin-top:12px; }" +
      "th,td{ border:1px solid #333; padding:8px 12px; text-align:left; }" +
      "th{ background:#f0f0f0; font-size:13px; text-align:center; }" +
      "td:nth-child(3){ text-align:right; }" +
      "col.col-material{ width:4em; }" +
      "col.col-due{ width:7em; }" +
      ".col-material{ width:4em; max-width:4em; }" +
      "td.col-due{ width:7em; max-width:7em; }" +
      "td.col-note{ min-width:12em; }" +
      ".memo{ font-size:12px; color:#333; margin-top:16px; }" +
      "@media print{ body{ margin:12px; } }" +
      "</style></head><body>" +
      "<h1>製作依頼書</h1>" +
      "<div class=\"header-row\">" +
      (siteBlock || "<span></span>") +
      "<span class=\"issue-date\">発行日: " + escapeHtml(issueDate) + "</span>" +
      "</div>" +
      "<table><colgroup><col><col class=\"col-material\"><col><col class=\"col-due\"><col class=\"col-note\"></colgroup>" +
      "<thead><tr><th>部材名</th><th>材質</th><th>製作数</th><th>納期</th><th>備考</th></tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table>" +
      memoBlock +
      "</body></html>"
    );
  }

  /**
   * 印刷実行（iframe に書き出して print）
   * @param {string} siteName
   * @param {string} issueDate
   * @param {string} globalMemo
   * @param {Array<{ displayName: string, materialLabel: string, qty: number, dueDate: string, note: string }>} previewRows
   */
  function doActualPrint(siteName, issueDate, globalMemo, previewRows) {
    if (!doc) return;
    var html = buildPrintHtmlFromPreview(siteName, issueDate, globalMemo, previewRows);
    var iframe = doc.getElementById("print-production-list-iframe");
    if (!iframe) {
      iframe = doc.createElement("iframe");
      iframe.id = "print-production-list-iframe";
      iframe.setAttribute("style", "position:absolute; width:0; height:0; border:0; left:-9999px; top:0;");
      iframe.setAttribute("title", "印刷用");
      doc.body.appendChild(iframe);
    }
    var win = iframe.contentWindow;
    if (!win) return;
    win.document.open("text/html", "replace");
    win.document.write(html);
    win.document.close();
    function doPrint() {
      try {
        win.print();
      } catch (e) {
        if (global.console && global.console.warn) {
          global.console.warn("[print-production-list] print failed", e);
        }
      }
    }
    global.setTimeout(doPrint, 300);
  }

  /**
   * 印刷前確認画面（モーダル）を開く。
   * @param {function(): Array} getProductionRows - 現在の ProductionRow を返す関数
   * @param {{ onQtyChange?: function(string, number) }} [options] - 製作数変更時に在庫照合側へ反映するコールバック
   */
  function openPrintPreview(getProductionRows, options) {
    if (!doc) return;
    var rows = getProductionRows && getProductionRows();
    if (!Array.isArray(rows)) rows = [];
    var previewRows = getPreviewRows(rows);
    if (previewRows.length === 0) {
      if (global.alert) global.alert("印刷対象がありません。");
      return;
    }

    var onQtyChange = (options && options.onQtyChange) || null;
    var today = formatIssueDate(new Date());

    var modal = doc.getElementById("production-print-preview-modal");
    if (modal) {
      modal.parentNode.removeChild(modal);
    }
    modal = doc.createElement("div");
    modal.id = "production-print-preview-modal";
    modal.setAttribute("style",
      "position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1001;display:flex;" +
      "align-items:center;justify-content:center;overflow:auto;padding:20px;box-sizing:border-box;");

    var box = doc.createElement("div");
    box.setAttribute("style",
      "background:var(--panel-bg,#fff);padding:20px;border-radius:10px;max-width:90%;width:700px;max-height:90vh;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,0.2);");

    var title = doc.createElement("div");
    title.style.fontWeight = "600";
    title.style.marginBottom = "16px";
    title.style.fontSize = "16px";
    title.textContent = "印刷前確認";

    var labelSite = doc.createElement("label");
    labelSite.style.display = "block";
    labelSite.style.marginBottom = "4px";
    labelSite.style.fontSize = "12px";
    labelSite.textContent = "現場名";
    var inputSite = doc.createElement("input");
    inputSite.type = "text";
    inputSite.placeholder = "現場名";
    inputSite.setAttribute("style", "width:100%;padding:8px 12px;margin-bottom:12px;box-sizing:border-box;border:1px solid var(--border,#ddd);border-radius:6px;");

    var labelDate = doc.createElement("label");
    labelDate.style.display = "block";
    labelDate.style.marginBottom = "4px";
    labelDate.style.fontSize = "12px";
    labelDate.textContent = "発行日";
    var inputDate = doc.createElement("input");
    inputDate.type = "date";
    inputDate.value = today;
    inputDate.setAttribute("style", "width:100%;padding:8px 12px;margin-bottom:12px;box-sizing:border-box;border:1px solid var(--border,#ddd);border-radius:6px;");

    var labelMemo = doc.createElement("label");
    labelMemo.style.display = "block";
    labelMemo.style.marginBottom = "4px";
    labelMemo.style.fontSize = "12px";
    labelMemo.textContent = "全体メモ";
    var textareaMemo = doc.createElement("textarea");
    textareaMemo.rows = 2;
    textareaMemo.placeholder = "任意";
    textareaMemo.setAttribute("style", "width:100%;padding:8px 12px;margin-bottom:12px;box-sizing:border-box;border:1px solid var(--border,#ddd);border-radius:6px;resize:vertical;");

    var bulkDueWrap = doc.createElement("div");
    bulkDueWrap.setAttribute("style", "display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;");
    var labelBulkDue = doc.createElement("span");
    labelBulkDue.style.fontSize = "12px";
    labelBulkDue.textContent = "納期一括設定";
    var inputBulkDue = doc.createElement("input");
    inputBulkDue.type = "date";
    inputBulkDue.setAttribute("style", "padding:6px 10px;border:1px solid var(--border,#ddd);border-radius:6px;");
    var btnBulkDue = doc.createElement("button");
    btnBulkDue.type = "button";
    btnBulkDue.className = "btn-secondary";
    btnBulkDue.textContent = "一括適用";
    bulkDueWrap.appendChild(labelBulkDue);
    bulkDueWrap.appendChild(inputBulkDue);
    bulkDueWrap.appendChild(btnBulkDue);

    var tableWrap = doc.createElement("div");
    tableWrap.style.overflowX = "auto";
    tableWrap.style.marginBottom = "16px";
    var table = doc.createElement("table");
    table.setAttribute("style", "width:100%;border-collapse:collapse;font-size:13px;");
    table.innerHTML = "<thead><tr><th style=\"text-align:left;padding:6px 8px;border:1px solid var(--border,#ddd);\">部材名</th><th style=\"padding:6px 8px;border:1px solid var(--border,#ddd);\">材質</th><th style=\"text-align:right;padding:6px 8px;border:1px solid var(--border,#ddd);\">製作数</th><th style=\"padding:6px 8px;border:1px solid var(--border,#ddd);\">納期</th><th style=\"padding:6px 8px;border:1px solid var(--border,#ddd);\">備考</th></tr></thead><tbody></tbody>";
    var tbody = table.querySelector("tbody");

    for (var i = 0; i < previewRows.length; i++) {
      (function (idx) {
        var row = previewRows[idx];
        var tr = doc.createElement("tr");
        var tdName = doc.createElement("td");
        tdName.style.padding = "6px 8px";
        tdName.style.border = "1px solid var(--border,#ddd)";
        tdName.textContent = row.displayName;
        tr.appendChild(tdName);
        var tdMat = doc.createElement("td");
        tdMat.style.padding = "6px 8px";
        tdMat.style.border = "1px solid var(--border,#ddd)";
        tdMat.textContent = row.materialLabel;
        tr.appendChild(tdMat);
        var tdQty = doc.createElement("td");
        tdQty.style.padding = "6px 8px";
        tdQty.style.border = "1px solid var(--border,#ddd)";
        tdQty.style.textAlign = "right";
        var inputQty = doc.createElement("input");
        inputQty.type = "number";
        inputQty.min = 0;
        inputQty.value = String(row.qty);
        inputQty.className = "input-no-spinner";
        inputQty.setAttribute("style", "width:70px;text-align:right;padding:4px 8px;box-sizing:border-box;");
        inputQty.addEventListener("change", function () {
          var v = parseInt(this.value, 10);
          var n = Number.isNaN(v) || v < 0 ? 0 : v;
          previewRows[idx].qty = n;
          if (onQtyChange && row.stockKey) onQtyChange(row.stockKey, n);
        });
        tdQty.appendChild(inputQty);
        tr.appendChild(tdQty);
        var tdDue = doc.createElement("td");
        tdDue.style.padding = "6px 8px";
        tdDue.style.border = "1px solid var(--border,#ddd)";
        var inputDue = doc.createElement("input");
        inputDue.type = "date";
        inputDue.value = row.dueDate || "";
        inputDue.setAttribute("style", "width:100%;min-width:120px;padding:4px 8px;box-sizing:border-box;");
        inputDue.addEventListener("change", function () {
          previewRows[idx].dueDate = this.value || "";
        });
        tdDue.appendChild(inputDue);
        tr.appendChild(tdDue);
        var tdNote = doc.createElement("td");
        tdNote.style.padding = "6px 8px";
        tdNote.style.border = "1px solid var(--border,#ddd)";
        var inputNote = doc.createElement("input");
        inputNote.type = "text";
        inputNote.value = row.note || "";
        inputNote.placeholder = "備考";
        inputNote.setAttribute("style", "width:100%;min-width:100px;padding:4px 8px;box-sizing:border-box;");
        inputNote.addEventListener("input", function () {
          previewRows[idx].note = this.value || "";
        });
        tdNote.appendChild(inputNote);
        tr.appendChild(tdNote);
        tbody.appendChild(tr);
      })(i);
    }
    tableWrap.appendChild(table);

    btnBulkDue.addEventListener("click", function () {
      var d = inputBulkDue.value || "";
      for (var j = 0; j < previewRows.length; j++) {
        previewRows[j].dueDate = d;
      }
      var dueInputs = tbody.querySelectorAll("tr td:nth-child(4) input");
      for (var k = 0; k < dueInputs.length; k++) {
        dueInputs[k].value = d;
      }
    });

    var btnWrap = doc.createElement("div");
    btnWrap.setAttribute("style", "display:flex;gap:8px;justify-content:flex-end;");
    var btnClose = doc.createElement("button");
    btnClose.type = "button";
    btnClose.className = "btn-secondary";
    btnClose.textContent = "閉じる";
    btnClose.addEventListener("click", function () {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
    var btnPrint = doc.createElement("button");
    btnPrint.type = "button";
    btnPrint.className = "btn-primary";
    btnPrint.textContent = "印刷する";
    btnPrint.addEventListener("click", function () {
      var siteName = (inputSite.value || "").trim();
      var issueDate = inputDate.value || today;
      var globalMemo = (textareaMemo.value || "").trim();
      doActualPrint(siteName, issueDate, globalMemo, previewRows);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
    btnWrap.appendChild(btnClose);
    btnWrap.appendChild(btnPrint);

    box.appendChild(title);
    box.appendChild(labelSite);
    box.appendChild(inputSite);
    box.appendChild(labelDate);
    box.appendChild(inputDate);
    box.appendChild(labelMemo);
    box.appendChild(textareaMemo);
    box.appendChild(bulkDueWrap);
    box.appendChild(tableWrap);
    box.appendChild(btnWrap);
    modal.appendChild(box);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }
    });
    doc.body.appendChild(modal);
  }

  /**
   * 製作一覧の印刷フローを開始（印刷前確認画面を開く）。
   * @param {function(): Array} getProductionRows
   * @param {{ onQtyChange?: function(string, number) }} [options]
   */
  function printProductionList(getProductionRows, options) {
    openPrintPreview(getProductionRows, options);
  }

  function formatProductionDisplayName(stockKey, partName) {
    var key = (stockKey && String(stockKey).trim()) || "";
    if (!key) return (partName && String(partName).trim()) || "";
    if (key.indexOf("CUBE RACK PARTS | ") === 0) {
      return key.slice("CUBE RACK PARTS | ".length);
    }
    var beamMatch = key.match(/^CUBERACK BEAM\(([^)]*)\)\s*\|\s*(\d+)$/);
    if (beamMatch) return "BEAM (" + beamMatch[1] + ") " + beamMatch[2];
    var poleMatch = key.match(/^CUBERACK POLE\(([^)]*)\)\s*\|\s*(\d+)$/);
    if (poleMatch) return "POLE (" + poleMatch[1] + ") " + poleMatch[2];
    return (partName && String(partName).trim()) || key;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      formatProductionDisplayName: formatProductionDisplayName,
      getPreviewRows: getPreviewRows,
      buildPrintHtmlFromPreview: buildPrintHtmlFromPreview,
      doActualPrint: doActualPrint,
      openPrintPreview: openPrintPreview,
      printProductionList: printProductionList,
    };
  } else {
    global.PrintProductionList = {
      formatProductionDisplayName: formatProductionDisplayName,
      getPreviewRows: getPreviewRows,
      buildPrintHtmlFromPreview: buildPrintHtmlFromPreview,
      doActualPrint: doActualPrint,
      openPrintPreview: openPrintPreview,
      printProductionList: printProductionList,
    };
  }
})(typeof window !== "undefined" ? window : this);
