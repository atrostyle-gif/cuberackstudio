// =========================================================
// ユーティリティ関数
// =========================================================

// 数値の丸め（小数点3桁）
function __v3(x){ return x == null ? null : Math.round(x * 1000) / 1000; }

// ベクトルの丸め（小数点3桁）
function __p3(v){ return v ? { x: __v3(v.x), y: __v3(v.y), z: __v3(v.z) } : null; }

// 距離計算
function __dist(a,b){
  if(!a||!b) return null;
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
  return Math.round(Math.sqrt(dx*dx+dy*dy+dz*dz));
}

// 材種タグ（表示用）
function materialTag(m) {
  const mm = normalizeMaterial(m);
  return (mm && mm !== "IRON") ? `［${mm}］` : "";
}

// 安全な関数呼び出しヘルパー
function callIfExists(funcName, ...args) {
  const func = window[funcName];
  if (typeof func === "function") {
    return func(...args);
  }
  return undefined;
}

// 安全な関数存在チェック
function hasFunction(funcName) {
  return typeof window[funcName] === "function";
}

// グローバルに公開
window.__v3 = __v3;
window.__p3 = __p3;
window.__dist = __dist;
window.materialTag = materialTag;
window.callIfExists = callIfExists;
window.hasFunction = hasFunction;