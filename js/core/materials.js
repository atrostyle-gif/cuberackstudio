// =========================================================
// 材質定義
// =========================================================

// =========================================================
// Material（材種）: IRON / BS / SUS
// =========================================================
const MATERIAL_COLOR = {
  IRON: 0x111111, // 黒
  BS:   0xFFD700, // より鮮やかな金色（ゴールド）
  SUS:  0xD3D3D3, // 薄いグレーのような銀色（ライトグレー）
  WOOD: 0xC8A97E, // 木っぽいベージュ（暫定）
};

// ================================
// 現在の材種（暫定）
// - UI導入までは手動で window.__CR_CURRENT_MATERIAL__ を変えてテストする
// ================================
window.__CR_CURRENT_MATERIAL__ = window.__CR_CURRENT_MATERIAL__ || "IRON";

function getCurrentMaterial() {
  return normalizeMaterial(window.__CR_CURRENT_MATERIAL__);
}

// =========================================================
// A1: 小物材質（種類ごと一括） 正本
// =========================================================
window.materialByPartType = window.materialByPartType || {
  jointBall: "IRON",
  leg: "IRON",
  jointCap: "IRON",
  topCap: "IRON",
  sideCap: "IRON",
  beamNut: "IRON",
  m5Screw: "IRON",
};

function getPartTypeMaterial(type) {
  const v = window.materialByPartType?.[type];
  return normalizeMaterial(v || "IRON");
}

function setPartTypeMaterial(type, mat) {
  if (!window.materialByPartType) window.materialByPartType = {};
  window.materialByPartType[type] = normalizeMaterial(mat || "IRON");
}

// =========================================================
// ジオメトリ & カラーパレット / マテリアル定義（統一版）
// =========================================================

// ▼ JointBall 用ジオメトリ
//   半径はお好みで（今まで 10 を使っていたので 10 のまま）
const jointRadius   = 10;
const jointGeometry = new THREE.SphereGeometry(jointRadius, 24, 16);

// =========================================================
// カラーパレット & マテリアル定義（黒鉄スタイル版）
// =========================================================

// ---- カラーパレット（16進カラー） ----

// 黒鉄（JointBall & Leg）
const COLOR_KUROGANE = 0x1e1e22; 

// Beam / Pole（黒鉄より少し明るいグレー）
const COLOR_CONNECTOR = 0x3a3a42;

// プレビューの色（操作しやすいようにライトシアン）
const COLOR_PREVIEW = 0x22e3ff;

// ---- JOINTBALL / LEG 共通マテリアル ----
const jointMaterialNormal = new THREE.MeshStandardMaterial({
  color: COLOR_KUROGANE,
  metalness: 0.5,
  roughness: 0.4,
});

const jointMaterialSelected = new THREE.MeshStandardMaterial({
  color: 0xffffcc,
  emissive: 0xffffcc,
  emissiveIntensity: 1.2,
  metalness: 0.5,
  roughness: 0.3,
});

// プレビュー用ジョイント（半透明）
const jointMaterialPreview = new THREE.MeshStandardMaterial({
  color: COLOR_KUROGANE,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  metalness: 0.2,
  roughness: 0.5,
});

// ---- BEAM / POLE ----
const beamMaterial = new THREE.MeshStandardMaterial({
  color: COLOR_CONNECTOR,
  metalness: 0.4,
  roughness: 0.45,
});

const poleMaterial = new THREE.MeshStandardMaterial({
  color: COLOR_CONNECTOR,
  metalness: 0.4,
  roughness: 0.45,
});

// ---- LEG ----
const legMaterial = new THREE.MeshStandardMaterial({
  color: COLOR_KUROGANE,
  metalness: 0.5,
  roughness: 0.45,
});

// カラーチャート OFF 時に戻すための元色
const originalBeamColor = new THREE.Color(COLOR_CONNECTOR);
const originalPoleColor = new THREE.Color(COLOR_CONNECTOR);

// プレビュー線（ビーム/ポール）
const connectorMaterialPreview = new THREE.MeshStandardMaterial({
  color: COLOR_PREVIEW,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});

// =========================================================
// 材質色をメッシュへ反映（ColorChart OFF復帰の基礎）
// =========================================================
function applyMaterialFinish(mat, code) {
  const m = normalizeMaterial(code);

  if (m === "IRON") { 
    mat.metalness = 0.10; 
    mat.roughness = 0.92; 
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  } // ほぼ黒マット
  if (m === "BS") {
    mat.metalness = 0.98; // より金属らしく
    mat.roughness = 0.15; // より滑らかで反射を強く
    // 金色をより目立たせるために発光を追加
    if (mat.emissive) mat.emissive.setHex(0xFFD700);
    mat.emissiveIntensity = 0.4; // より明るい発光で金色を強調
  } // 真鍮は強めに反射＋発光
  if (m === "SUS") { 
    mat.metalness = 0.55; 
    mat.roughness = 0.45; 
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  } // ★銀は"控えめ反射"が銀に見える
  if (m === "WOOD") {
    mat.metalness = 0.0;
    mat.roughness = 0.7;
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  } // 木は非金属、やや粗め

  mat.needsUpdate = true;
}

function applyMaterialColorToMesh(obj3d, materialCode) {
  if (!obj3d) return;

  const matCode = normalizeMaterial(materialCode);
  const hex = MATERIAL_COLOR?.[matCode];
  if (typeof hex !== "number") return;

  // 1つのmaterialに対して安全に適用
  function applyToMaterial(mat) {
    if (!mat) return;

    // color を持たない material もある（例: MeshDepthMaterial / ShaderMaterial 等）
    if (mat.color && typeof mat.color.setHex === "function") {
      mat.color.setHex(hex);
    }

    // ★これがないと反映が不安定になることがある
    mat.needsUpdate = true;

    // 仕上げは「色を上書きしない」前提で呼ぶ
    if (typeof applyMaterialFinish === "function") {
      applyMaterialFinish(mat, matCode);
    }
  }

  function applyToMesh(mesh) {
    if (!mesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) applyToMaterial(m);
  }

  // Mesh 直指定
  if (obj3d.isMesh) {
    applyToMesh(obj3d);
    return;
  }

  // Group/親指定でも効くようにする（描画工程は増えない。色を塗るだけ）
  if (typeof obj3d.traverse === "function") {
    obj3d.traverse((o) => {
      if (o && o.isMesh) applyToMesh(o);
    });
  }
}

// グローバルに公開
window.MATERIAL_COLOR = MATERIAL_COLOR;
window.getCurrentMaterial = getCurrentMaterial;
window.getPartTypeMaterial = getPartTypeMaterial;
window.setPartTypeMaterial = setPartTypeMaterial;
window.applyMaterialFinish = applyMaterialFinish;
window.applyMaterialColorToMesh = applyMaterialColorToMesh;

// 材質とジオメトリを公開
window.jointRadius = jointRadius;
window.jointGeometry = jointGeometry;
window.jointMaterialNormal = jointMaterialNormal;
window.jointMaterialSelected = jointMaterialSelected;
window.jointMaterialPreview = jointMaterialPreview;
window.beamMaterial = beamMaterial;
window.poleMaterial = poleMaterial;
window.legMaterial = legMaterial;
window.connectorMaterialPreview = connectorMaterialPreview;
window.originalBeamColor = originalBeamColor;
window.originalPoleColor = originalPoleColor;

// カラーパレットも公開
window.COLOR_KUROGANE = COLOR_KUROGANE;
window.COLOR_CONNECTOR = COLOR_CONNECTOR;
window.COLOR_PREVIEW = COLOR_PREVIEW;

// MATERIAL_COLOR をグローバルに公開
window.MATERIAL_COLOR = MATERIAL_COLOR;
