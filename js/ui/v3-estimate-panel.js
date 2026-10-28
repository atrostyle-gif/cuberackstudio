// =========================================================
// V3 見積明細ポップアップ
// - 計算は calcAndRenderEstimate の結果だけを表示する
// - BOM集計・単価計算は複製しない
// =========================================================
(function () {
  const POP_ID = "estimate";

  function $(id) {
    return document.getElementById(id);
  }

  function isOpen() {
    const ui = window.v3WorkspaceUi;
    return !!(ui && ui.getOpenPopupId && ui.getOpenPopupId() === POP_ID);
  }

  function yen(n) {
    if (!Number.isFinite(Number(n))) return "—";
    return Number(n).toLocaleString("ja-JP");
  }

  function isStaff() {
    return typeof window.isCubeRackStaffMode === "function" && window.isCubeRackStaffMode();
  }

  function priceMode() {
    return window.getEstimatePriceMode ? window.getEstimatePriceMode() : "retail";
  }

  function isIncomplete() {
    if (window.currentEstimateIncomplete === true) return true;
    return lines().some(function (row) { return row && row.registered === false; });
  }

  function stockLabel(row) {
    if (!isStaff()) return "";
    const mat = String(row && row.material || "").toUpperCase();
    if (mat !== "BS" || !window.v3BsStock || typeof window.v3BsStock.lookup !== "function") return "—";
    const result = window.v3BsStock.lookup(row.key, "BS", Number(row.qty) || 0);
    if (!result || result.status === "na") return "—";
    if (result.status === "unknown") return "未確認";
    if (result.status === "zero") return "在庫なし";
    if (result.status === "shortage") return "不足 " + result.shortageQty;
    if (typeof result.stockQty === "number") return String(result.stockQty);
    return "—";
  }

  function lines() {
    return Array.isArray(window.currentEstimateLines) ? window.currentEstimateLines : [];
  }

  function fill(root) {
    if (!root) return;
    const wrap = root.querySelector(".v3-est-table-wrap");
    const scroll = wrap ? wrap.scrollTop : 0;
    const staff = isStaff();
    root.innerHTML = "";
    root.classList.toggle("is-staff", staff);

    const rows = lines();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "v3-est-empty";
      empty.textContent = "部材がありません。";
      root.appendChild(empty);
    } else {
      const scroller = document.createElement("div");
      scroller.className = "v3-est-table-wrap";
      const table = document.createElement("table");
      table.className = "v3-est-table" + (staff ? " is-staff" : " is-general");
      table.innerHTML =
        "<thead><tr>" +
        "<th class=\"col-name\">部材名</th><th class=\"col-mat\">材質</th>" +
        "<th class=\"num col-qty\">数量</th>" +
        (staff ? "<th class=\"num col-stock\">在庫</th>" : "") +
        "<th class=\"num col-unit\">単価</th><th class=\"num col-sub\">小計</th>" +
        "</tr></thead>";
      const tbody = document.createElement("tbody");
      rows.forEach(function (row) {
        const tr = document.createElement("tr");
        function td(text, cls) {
          const el = document.createElement("td");
          if (cls) el.className = cls;
          el.textContent = text;
          tr.appendChild(el);
        }
        td(row.name || row.key || "", "col-name");
        td(row.material || "—", "col-mat");
        td(String(row.qty || 0), "num col-qty");
        if (staff) td(stockLabel(row), "num col-stock");
        if (row.registered === false) {
          td("未登録", "num col-unit is-unregistered");
          td("—", "num col-sub");
        } else {
          td(yen(row.unitPrice), "num col-unit");
          td(yen(row.sub), "num col-sub");
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroller.appendChild(table);
      root.appendChild(scroller);
      scroller.scrollTop = scroll;
    }

    const incomplete = isIncomplete();
    const foot = document.createElement("div");
    foot.className = "v3-est-total" + (incomplete ? " is-unavailable" : "");
    const label = document.createElement("span");
    label.textContent = "合計金額";
    const value = document.createElement("strong");
    if (incomplete) {
      value.textContent = "算出不可";
    } else {
      const total = Number.isFinite(Number(window.currentEstimateTotal))
        ? Number(window.currentEstimateTotal)
        : 0;
      value.textContent = total.toLocaleString("ja-JP") + " 円";
    }
    foot.appendChild(label);
    foot.appendChild(value);
    root.appendChild(foot);

    if (isStaff()) {
      const switchWrap = document.createElement("div");
      switchWrap.className = "v3-est-price-switch";
      switchWrap.setAttribute("role", "group");
      switchWrap.setAttribute("aria-label", "価格区分");
      const current = priceMode();
      function addSeg(mode, text) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "v3-est-price-seg" + (current === mode ? " is-on" : "");
        btn.textContent = text;
        btn.setAttribute("aria-pressed", current === mode ? "true" : "false");
        btn.addEventListener("click", function () {
          if (typeof window.setEstimatePriceMode !== "function") return;
          window.setEstimatePriceMode(mode);
        });
        switchWrap.appendChild(btn);
      }
      addSeg("retail", "通常価格");
      addSeg("wholesale", "卸価格");
      root.appendChild(switchWrap);
    }

    if (incomplete) {
      const warn = document.createElement("p");
      warn.className = "v3-est-ws-error";
      const missing = rows.filter(function (row) { return row && row.registered === false; })
        .map(function (row) { return row.name || row.key; })
        .filter(Boolean);
      warn.textContent = missing.length
        ? "部材単価が登録されていません（" + missing.join("、") + "）"
        : "部材単価が登録されていません";
      root.appendChild(warn);
    }

    const note = document.createElement("p");
    note.className = "v3-est-note";
    note.textContent = "税込・参考価格。実際の販売価格とは異なる場合があります。";
    root.appendChild(note);
    try { window.syncEstimatePrintButton && window.syncEstimatePrintButton(); } catch (e) {}
  }

  function render(body) {
    const root = document.createElement("div");
    root.id = "v3-est-root";
    root.className = "v3-est-root";
    body.appendChild(root);
    fill(root);
  }

  function ensureLines() {
    if (lines().length) return;
    if (typeof window.calcAndRenderEstimate === "function") {
      try { window.calcAndRenderEstimate(); } catch (e) {}
    }
  }

  function open(opts) {
    const ui = window.v3WorkspaceUi;
    if (!ui || typeof ui.openPopup !== "function") return;
    ensureLines();
    if (isOpen()) {
      refresh();
      const el = $("v3-cmd-pop");
      if (el) {
        el.classList.remove("hidden");
        el.style.zIndex = "60";
      }
      if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") {
        window.v3CadToolbar.syncActive();
      }
      return;
    }
    const anchor = (opts && opts.anchor) || $("v3-cad-estimate") || $("v3-north-total");
    ui.openPopup(POP_ID, {
      title: "見積明細",
      wide: true,
      hideApply: true,
      skipFocus: true,
      cancelLabel: "閉じる",
      anchor: anchor,
      render: render,
    });
  }

  function refresh() {
    if (!isOpen()) return;
    fill($("v3-est-root"));
  }

  window.v3EstimatePanel = {
    open: open,
    refresh: refresh,
    isOpen: isOpen,
    stockLabel: stockLabel,
  };

  document.addEventListener("cuberack:staff-mode-enabled", refresh);
  document.addEventListener("cuberack:staff-mode-disabled", refresh);
})();
