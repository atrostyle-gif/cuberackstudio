// js/ui/admin-menu.js — STAFFモード（在庫照合・価格管理）
(function (global) {
  "use strict";

  var DEFAULT_PRICING_URL = "admin-pricing-9fd83.html";
  var STAFF_AUTH_KEY = "cuberack_staff_mode_auth";

  function getExpectedPassword() {
    return (global.PRICING_CONFIG && global.PRICING_CONFIG.adminPassword) || "";
  }

  function isStaffModeActive() {
    return global.sessionStorage && global.sessionStorage.getItem(STAFF_AUTH_KEY) === "1";
  }

  global.isCubeRackStaffMode = isStaffModeActive;

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
    var staffLogin = document.getElementById("admin-menu-login");
    var staffPassword = document.getElementById("admin-menu-password");
    var staffError = document.getElementById("admin-menu-login-error");
    var staffLoginBtn = document.getElementById("admin-menu-login-btn");
    var staffLogoutBtn = document.getElementById("admin-menu-logout-btn");
    var collabBtn = document.getElementById("admin-menu-collab-btn");
    var collabBackBtn = document.getElementById("staff-collab-back-btn");
    var collabWrap = document.getElementById("staff-collab-wrap");

    if (!overlay || !openBtn) return;

    if (pricingLink) {
      pricingLink.href = pricingUrl;
      pricingLink.target = "_self";
    }

    function showHome() {
      if (staffLogin) staffLogin.classList.add("hidden");
      if (home) home.classList.remove("hidden");
      if (stockWrap) stockWrap.classList.add("hidden");
      if (collabWrap) collabWrap.classList.add("hidden");
    }

    function showLogin() {
      if (home) home.classList.add("hidden");
      if (stockWrap) stockWrap.classList.add("hidden");
      if (staffLogin) staffLogin.classList.remove("hidden");
      if (staffPassword) {
        staffPassword.value = "";
        global.setTimeout(function () { staffPassword.focus(); }, 0);
      }
      if (staffError) staffError.textContent = "";
    }

    function openOverlay() {
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      if (isStaffModeActive()) showHome();
      else showLogin();
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
    if (collabBtn) collabBtn.addEventListener("click", function () {
      if (home) home.classList.add("hidden");
      if (collabWrap) collabWrap.classList.remove("hidden");
      if (typeof global.openStaffCollaboration === "function") global.openStaffCollaboration();
    });
    if (collabBackBtn) collabBackBtn.addEventListener("click", showHome);

    function tryLogin() {
      var expected = getExpectedPassword();
      var entered = staffPassword ? staffPassword.value : "";
      if (!expected) {
        if (staffError) staffError.textContent = "スタッフ用パスワードが設定されていません。";
        return;
      }
      if (entered !== expected) {
        if (staffError) staffError.textContent = "パスワードが正しくありません。";
        return;
      }
      global.sessionStorage.setItem(STAFF_AUTH_KEY, "1");
      global.document.dispatchEvent(new CustomEvent("cuberack:staff-mode-enabled"));
      if (staffError) staffError.textContent = "";
      showHome();
    }

    if (staffLoginBtn) staffLoginBtn.addEventListener("click", tryLogin);
    if (staffPassword) {
      staffPassword.addEventListener("keydown", function (e) {
        if (e.key === "Enter") tryLogin();
      });
    }
    if (staffLogoutBtn) {
      staffLogoutBtn.addEventListener("click", function () {
        if (typeof global.closeStaffCollaboration === "function") global.closeStaffCollaboration();
        global.sessionStorage.removeItem(STAFF_AUTH_KEY);
        global.sessionStorage.removeItem("cuberack_price_admin_auth");
        showLogin();
      });
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
