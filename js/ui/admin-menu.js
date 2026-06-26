// js/ui/admin-menu.js — 管理者用メニュー（在庫照合・価格管理）
(function (global) {
  "use strict";

  var DEFAULT_PRICING_URL =
    "https://cube-rack-stadio.netlify.app/admin-pricing-9fd83.html";

  function initAdminMenu(options) {
    options = options || {};
    var stockMode = options.stockMode || "embedded";
    var pricingUrl = options.pricingUrl || DEFAULT_PRICING_URL;

    var overlay = document.getElementById("admin-menu-overlay");
    var openBtn = document.getElementById("admin-menu-open-btn");
    var closeBtn = document.getElementById("admin-menu-close-btn");
    var home = document.getElementById("admin-menu-home");
    var stockWrap = document.getElementById("admin-menu-stock-wrap");
    var stockBtn = document.getElementById("admin-menu-stock-btn");
    var stockBack = document.getElementById("admin-menu-stock-back-btn");
    var pricingLink = document.getElementById("admin-menu-pricing-link");

    if (!overlay || !openBtn) return;

    if (pricingLink) {
      pricingLink.href = pricingUrl;
      pricingLink.target = "_blank";
      pricingLink.rel = "noopener noreferrer";
    }

    function showHome() {
      if (home) home.classList.remove("hidden");
      if (stockWrap) stockWrap.classList.add("hidden");
    }

    function openOverlay() {
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      showHome();
    }

    function closeOverlay() {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }

    openBtn.addEventListener("click", openOverlay);
    if (closeBtn) closeBtn.addEventListener("click", closeOverlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeOverlay();
    });

    if (stockBtn) {
      stockBtn.addEventListener("click", function () {
        if (stockMode === "redirect") {
          global.location.href = options.stockRedirectUrl || "index.html";
          return;
        }
        if (home) home.classList.add("hidden");
        if (stockWrap) stockWrap.classList.remove("hidden");
      });
    }

    if (stockBack) {
      stockBack.addEventListener("click", showHome);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
        closeOverlay();
      }
    });
  }

  global.initAdminMenu = initAdminMenu;

  function boot() {
    initAdminMenu(global.ADMIN_MENU_OPTIONS || {});
  }

  if (global.document) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : this);
