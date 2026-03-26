// =========================================================
// 在庫照合UI（Square CSV 読み込み・BOM比較・製作数テーブル）
// - スタッフ向け簡易ロック付き（パスワード一致時のみ本体表示）
// - 在庫比較はバリエーション名（比較キー）で行う
// =========================================================

(function (global) {
  "use strict";

  var StockImport = global.StockImport;
  var StockCompare = global.StockCompare;

  /**
   * 簡易ロック用パスワード（スタッフのみ在庫照合を開くため）。
   * ※ 本格的な認証ではなく、一般ユーザーが触りにくくするための簡易的なものです。
   */
  var STOCK_GATE_PASSWORD = "1914";

  /** 手動製作数 比較キー(stockKey) -> number（ユーザーが編集した値） */
  var manualMakeQtyByStockKey = {};

  /** 在庫数 比較キー(stockKey) -> number（CSV読込値または手入力で上書きした値。在庫欄1つで管理） */
  var stockQtyByStockKey = {};

  /**
   * 現在の照合結果（ProductionRow 配列）を返す。印刷用。
   * @returns {Array<{ stockKey: string, displayName?: string, partName: string, finalMakeQty: number }>}
   */
  function getCurrentProductionRows() {
    if (!StockCompare || !StockCompare.compareBomWithStock) return [];
    var bomRows = StockCompare.getBomRows();
    var result = StockCompare.compareBomWithStock(bomRows, [], {
      manualMakeQtyByStockKey: manualMakeQtyByStockKey,
      stockQtyByStockKey: stockQtyByStockKey,
    });
    return result.rows || [];
  }

  /**
   * 照合結果を再計算し、テーブルと要約を更新する。
   * フロー: 最新BOM取得 → stockQtyByStockKey を現在在庫として使用 → compareBomWithStock → テーブル再描画
   */
  function refreshCompareAndTable() {
    var bomRows = StockCompare.getBomRows();
    var result = StockCompare.compareBomWithStock(bomRows, [], {
      manualMakeQtyByStockKey: manualMakeQtyByStockKey,
      stockQtyByStockKey: stockQtyByStockKey,
    });
    renderProductionTable(result.rows);
    renderSummary(0, result.rows.length, result.unregisteredStockKeys);
  }

  /**
   * 外部（estimate.js や「再集計」ボタン）から呼ばれる再集計用のラッパー。
   * 現在保持している stockQtyByStockKey / manualMakeQtyByStockKey を使って再描画する。
   */
  function refreshStockReconcileTable() {
    refreshCompareAndTable();
  }

  /**
   * ProductionRow 配列でテーブルを描画する（部材名・材質・必要数・在庫数・不足数・製作数）。製作数は input で編集可能。
   * @param {Array<{ stockKey: string, displayName?: string, materialLabel?: string, partName: string, requiredQty: number, stockQty: number, shortageQty: number, finalMakeQty: number }>} rows
   */
  function renderProductionTable(rows) {
    var tbody = document.getElementById("stock-reconcile-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (!rows || rows.length === 0) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "BOMがありません。描画後に部材明細を生成してください。";
      td.style.color = "var(--muted, #64748b)";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tr = document.createElement("tr");

      var tdName = document.createElement("td");
      tdName.textContent = (row.displayName != null && String(row.displayName).trim()) ? row.displayName : (row.partName != null ? row.partName : "-");
      tr.appendChild(tdName);

      var tdMaterial = document.createElement("td");
      tdMaterial.textContent = (row.materialLabel != null && String(row.materialLabel).trim()) ? row.materialLabel : "-";
      tr.appendChild(tdMaterial);

      var tdRequired = document.createElement("td");
      tdRequired.textContent = String(row.requiredQty);
      tdRequired.style.textAlign = "right";
      tr.appendChild(tdRequired);

      var tdStock = document.createElement("td");
      tdStock.style.textAlign = "right";
      var stockInput = document.createElement("input");
      stockInput.type = "number";
      stockInput.min = 0;
      stockInput.step = 1;
      stockInput.value = String(row.stockQty);
      stockInput.style.width = "100%";
      stockInput.style.maxWidth = "80px";
      stockInput.style.boxSizing = "border-box";
      stockInput.style.textAlign = "right";
      stockInput.className = "input-no-spinner";
      stockInput.dataset.stockKey = row.stockKey;
      stockInput.addEventListener("change", function () {
        var stockKey = this.dataset.stockKey;
        var val = parseInt(this.value, 10);
        if (stockKey) {
          stockQtyByStockKey[stockKey] = Number.isNaN(val) ? 0 : Math.max(0, val);
          refreshCompareAndTable();
        }
      });
      tdStock.appendChild(stockInput);
      tr.appendChild(tdStock);

      var tdShortage = document.createElement("td");
      tdShortage.textContent = String(row.shortageQty);
      tdShortage.style.textAlign = "right";
      if (row.shortageQty > 0) {
        tdShortage.style.color = "var(--danger, #ef4444)";
      }
      tr.appendChild(tdShortage);

      var tdMake = document.createElement("td");
      tdMake.style.textAlign = "right";
      var input = document.createElement("input");
      input.type = "number";
      input.min = 0;
      input.step = 1;
      input.value = String(row.finalMakeQty);
      input.style.width = "100%";
      input.style.maxWidth = "80px";
      input.style.boxSizing = "border-box";
      input.style.textAlign = "right";
      input.className = "input-no-spinner";
      input.dataset.stockKey = row.stockKey;
      input.addEventListener("change", function () {
        var stockKey = this.dataset.stockKey;
        var val = parseInt(this.value, 10);
        if (stockKey) {
          manualMakeQtyByStockKey[stockKey] = Number.isNaN(val) ? 0 : Math.max(0, val);
          refreshCompareAndTable();
        }
      });
      tdMake.appendChild(input);
      tr.appendChild(tdMake);

      tbody.appendChild(tr);
    }
  }

  /**
   * 要約と在庫未登録（比較キー）一覧は表示しない（内部ロジックは呼び出し元で維持）。
   * @param {number} loadedCount - 読み込み部品キー数（比較キー数）
   * @param {number} bomCount - BOM対象数
   * @param {string[]} unregisteredStockKeys - 在庫未登録の比較キー一覧
   */
  function renderSummary(loadedCount, bomCount, unregisteredStockKeys) {
    var elSummary = document.getElementById("stock-reconcile-summary");
    var elUnreg = document.getElementById("stock-reconcile-unregistered");
    if (elSummary) elSummary.textContent = "";
    if (elUnreg) elUnreg.textContent = "";
  }

  /**
   * CSV ファイル選択後に読み込み・照合・表示を行う。
   * @param {Event} e
   */
  function onFileSelected(e) {
    var input = e && e.target;
    var file = input && input.files && input.files[0];
    var msgEl = document.getElementById("stock-reconcile-message");
    var summaryEl = document.getElementById("stock-reconcile-summary");
    var unregEl = document.getElementById("stock-reconcile-unregistered");

    function setMessage(text, isError) {
      if (!msgEl) return;
      msgEl.textContent = text || "";
      msgEl.style.color = isError ? "var(--danger, #ef4444)" : "var(--text, #1a202c)";
    }

    function clearSummary() {
      if (summaryEl) summaryEl.textContent = "";
      if (unregEl) unregEl.textContent = "";
    }

    if (!file) {
      setMessage("", false);
      return;
    }

    if (!StockImport || !StockImport.readStockCsvFile) {
      setMessage("在庫読み込みモジュールが利用できません。", true);
      return;
    }
    if (!StockCompare || !StockCompare.compareBomWithStock) {
      setMessage("照合モジュールが利用できません。", true);
      return;
    }

    setMessage("読み込み中…", false);
    clearSummary();

    StockImport.readStockCsvFile(file)
      .then(function (result) {
        if (!result.success) {
          setMessage(result.error || "読み込みに失敗しました。", true);
          renderProductionTable([]);
          return;
        }
        var items = result.items || [];
        stockQtyByStockKey = {};
        for (var idx = 0; idx < items.length; idx++) {
          var it = items[idx];
          if (it && it.stockKey != null) {
            var q = Number(it.stockQty);
            stockQtyByStockKey[it.stockKey] = Number.isNaN(q) || q < 0 ? 0 : Math.floor(q);
          }
        }
        setMessage("読み込み完了。照合結果を表示しています。", false);
        refreshCompareAndTable();
      })
      .catch(function (err) {
        setMessage(
          "エラー: " + (err && err.message ? err.message : String(err)),
          true
        );
        renderProductionTable([]);
        clearSummary();
      });

    if (input) input.value = "";
  }

  /**
   * 簡易ロック: パスワード一致時のみ在庫照合本体を表示する。
   */
  function initStockGate() {
    var lockedEl = document.getElementById("stock-reconcile-locked");
    var contentEl = document.getElementById("stock-reconcile-content");
    var modalEl = document.getElementById("stock-reconcile-gate-modal");
    var openBtn = document.getElementById("stock-reconcile-open-btn");
    var passwordInput = document.getElementById("stock-gate-password-input");
    var submitBtn = document.getElementById("stock-gate-submit-btn");
    var cancelBtn = document.getElementById("stock-gate-cancel-btn");
    var errorEl = document.getElementById("stock-gate-error");

    function showModal() {
      if (modalEl) {
        modalEl.style.display = "flex";
        if (errorEl) errorEl.textContent = "";
        if (passwordInput) {
          passwordInput.value = "";
          passwordInput.focus();
        }
      }
    }
    function hideModal() {
      if (modalEl) modalEl.style.display = "none";
      if (errorEl) errorEl.textContent = "";
      if (passwordInput) passwordInput.value = "";
    }
    function unlock() {
      hideModal();
      if (lockedEl) lockedEl.style.display = "none";
      if (contentEl) contentEl.style.display = "block";
    }
    function setGateError(msg) {
      if (errorEl) errorEl.textContent = msg || "";
    }

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        showModal();
      });
    }
    if (submitBtn && passwordInput) {
      submitBtn.addEventListener("click", function () {
        var value = (passwordInput.value || "").trim();
        if (value === STOCK_GATE_PASSWORD) {
          unlock();
        } else {
          setGateError("パスワードが違います");
        }
      });
    }
    if (passwordInput && submitBtn) {
      passwordInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          submitBtn.click();
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", hideModal);
    }
    if (modalEl) {
      modalEl.addEventListener("click", function (e) {
        if (e.target === modalEl) hideModal();
      });
    }
  }

  /**
   * 「Square在庫CSVを読み込む」ボタンとファイル入力の初期化。
   */
  function initStockReconcileUI() {
    initStockGate();

    var btn = document.getElementById("stock-reconcile-load-btn");
    var fileInput = document.getElementById("stock-reconcile-file-input");
    var printBtn = document.getElementById("stock-reconcile-print-btn");

    if (btn && fileInput) {
      btn.addEventListener("click", function () {
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", onFileSelected);
    }

    if (printBtn) {
      printBtn.addEventListener("click", function () {
        if (global.PrintProductionList && typeof global.PrintProductionList.printProductionList === "function") {
          global.PrintProductionList.printProductionList(getCurrentProductionRows, {
            onQtyChange: function (stockKey, qty) {
              manualMakeQtyByStockKey[stockKey] = qty;
              refreshCompareAndTable();
            },
          });
        } else {
          if (global.alert) global.alert("印刷機能が読み込まれていません。");
        }
      });
    }

    global.refreshStockReconcileTable = refreshStockReconcileTable;

    if (StockCompare) {
      var bomRows = StockCompare.getBomRows();
      if (bomRows.length > 0) {
        var initialResult = StockCompare.compareBomWithStock(bomRows, [], {
          manualMakeQtyByStockKey: manualMakeQtyByStockKey,
          stockQtyByStockKey: stockQtyByStockKey,
        });
        renderProductionTable(initialResult.rows);
        renderSummary(0, initialResult.rows.length, initialResult.unregisteredStockKeys || []);
      }
    }
  }

  if (global.document && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStockReconcileUI);
  } else if (global.document) {
    initStockReconcileUI();
  }
})(typeof window !== "undefined" ? window : this);
