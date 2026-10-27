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

/**
 * 選択不可の材種。
 * BS は廃番のため新規選択から外す。既存BS部材の表示・見積・変換は維持する。
 * 在庫ゲートは行わない。
 */
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
 * オーダー／自由長さ（mm）。整数も小数も受け付ける。無効値は null。
 * プリセット select は従来どおり parseInt で読む。
 */
window.parseLengthMm = window.parseLengthMm || function parseLengthMm(raw) {
  const n = Number(String(raw == null ? "" : raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

window.PRESET_LENGTH_EPS_MM = 1e-6;

window.actualJointDistanceMm = window.actualJointDistanceMm || function actualJointDistanceMm(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(
    (Number(b.x) || 0) - (Number(a.x) || 0),
    (Number(b.y) || 0) - (Number(a.y) || 0),
    (Number(b.z) || 0) - (Number(a.z) || 0)
  );
};

window.isPresetLengthMm = window.isPresetLengthMm || function isPresetLengthMm(len, presets) {
  const n = Number(len);
  if (!Number.isFinite(n) || n <= 0) return false;
  const list = presets || [];
  const eps = window.PRESET_LENGTH_EPS_MM || 1e-6;
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(Number(list[i]) - n) <= eps) return true;
  }
  return false;
};

/** 見積・在庫・単価キー用。既存の Math.round 業務ルールを名前付きにしただけ。設計実寸は丸めない。 */
window.estimateBucketMm = window.estimateBucketMm || function estimateBucketMm(len) {
  const n = Number(len);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
};

window.formatDesignMm = window.formatDesignMm || function formatDesignMm(len) {
  const n = Number(len);
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-6) return String(r);
  return String(Number(n.toFixed(4)));
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
