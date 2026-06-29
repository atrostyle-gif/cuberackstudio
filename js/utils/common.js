// =========================================================
// 共通ユーティリティ関数
// =========================================================

/**
 * 材種コードを正規化する
 * @param {string} m - 材種コード（IRON, BS, SUS, BRASS等）
 * @returns {string} 正規化された材種コード（IRON, BS, SUS）
 */
window.normalizeMaterial = window.normalizeMaterial || function normalizeMaterial(m) {
  const s = String(m || "IRON").toUpperCase().trim();
  if (s === "BRASS") return "BS";
  if (s === "SUS") return "SUS";
  if (s === "BS") return "BS";
  if (s === "WOOD") return "WOOD";
  return "IRON";
};

/**
 * 材種タグを取得する（表示用）
 * @param {string} m - 材種コード
 * @returns {string} 材種タグ（IRONの場合は空文字）
 */
window.materialTag = window.materialTag || function materialTag(m) {
  const mm = normalizeMaterial(m);
  return (mm && mm !== "IRON") ? `［${mm}］` : "";
};

// 材種定数
window.MATERIALS = ["IRON", "BS", "SUS"];

/** 一時的に選択不可の材種（価格データ・既存設計データは保持） */
window.MATERIAL_SELECT_DISABLED = ["BS"];

window.isMaterialSelectable = window.isMaterialSelectable || function isMaterialSelectable(m) {
  const code = window.normalizeMaterial(m);
  return !(window.MATERIAL_SELECT_DISABLED || []).includes(code);
};

window.getSelectableMaterials = window.getSelectableMaterials || function getSelectableMaterials() {
  return (window.MATERIALS || ["IRON", "BS", "SUS"]).filter(window.isMaterialSelectable);
};

window.coerceSelectableMaterial = window.coerceSelectableMaterial || function coerceSelectableMaterial(m) {
  const code = window.normalizeMaterial(m);
  return window.isMaterialSelectable(code) ? code : "IRON";
};

/**
 * select の option を制限する（disabled 材種は hidden + disabled）
 * @param {HTMLSelectElement} selectEl
 * @param {{ resetIfDisabled?: boolean }} [opts] - false なら既存 BS 行など現在値は維持
 */
window.syncMaterialSelectOptions = window.syncMaterialSelectOptions || function syncMaterialSelectOptions(selectEl, opts = {}) {
  if (!selectEl || !selectEl.options) return;
  const { resetIfDisabled = true } = opts;
  const disabled = window.MATERIAL_SELECT_DISABLED || [];
  let needReset = false;

  Array.from(selectEl.options).forEach((opt) => {
    if (!disabled.includes(opt.value)) return;
    opt.disabled = true;
    opt.hidden = true;
    if (selectEl.value === opt.value) needReset = true;
  });

  if (needReset && resetIfDisabled) {
    selectEl.value = window.coerceSelectableMaterial(selectEl.value);
  }
};
