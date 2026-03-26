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
