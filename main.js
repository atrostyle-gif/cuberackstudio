// =========================================================
// 10. UI（種類・長さ・オーダービーム）【完全置換版】
// =========================================================

// 見積関連の関数は js/features/estimate.js に移動済み

(function bindMaterialUI(){
  return; // ★v1.0.9では initMaterialSelectUI を正本にする（競合防止）
  const sel = document.getElementById("material-select");
  const hint = document.getElementById("material-hint");
  if (!sel) return;

  function applyUI(mat){
    const m = normalizeMaterial(mat);
    window.__CR_CURRENT_MATERIAL__ = m;
    sel.value = m;
    if (hint) hint.textContent = (m === "IRON") ? "黒" : (m === "BS") ? "ゴールド" : "シルバー";
  }

  // 初期値
  applyUI(window.__CR_CURRENT_MATERIAL__ || "IRON");

  sel.addEventListener("change", () => {
    applyUI(sel.value);

    // 既存メッシュへ反映（次の項目③とセット）
    try { applyMaterialToAllMeshes?.(); } catch (_) {}
    try { requestEstimateRender?.("material changed"); } catch (_) {}
  });
})();

// =========================================================
// ユーティリティ関数は別ファイルに分割済み
// - js/utils/helpers.js: __v3, __p3, __dist, materialTag
// - js/utils/common.js: normalizeMaterial
// - js/state/state.js: bindArrayRefsToWindow
// =========================================================

// =========================================================
// 状態管理は js/state/state.js に移動済み
// - isColorChartOn, currentPartType, currentLengthMm
// - joints, jointMeshes, beams, poles, legs
// - selectedJointIndex, jointClusters, jointClusterId
// - その他の状態変数
// =========================================================

window.openDrawingTop = function () {
  window.open("./drawing.html", "cuberack_drawing", "width=1100,height=800");
};

function applyMaterialToAllMeshes() {
  // ヘルパー関数：メッシュに材質を適用
  const applyMaterial = (mesh, material) => {
    if (!mesh) return;
    applyMaterialColorToMesh(mesh, normalizeMaterial(material || "IRON"));
  };

  // Joint
  joints.forEach((j, idx) => applyMaterial(jointMeshes?.[idx], j?.material));

  // Beam, Pole, Leg
  [...beams, ...poles, ...legs].forEach((item) => {
    if (!item?.mesh) return;
    const mat = item.material || (item.jointIndex !== undefined ? joints?.[item.jointIndex]?.material : undefined);
    applyMaterial(item.mesh, mat);
  });

  // 注意：カラーチャートONなら、ここで材質色は上書きされる設計かもしれない
  // → その場合は「材質色優先」か「カラーチャート優先」どちらにするか決める必要がある
}

// =========================================================
// Drawing: 別ウィンドウへ現在モデルを送る（最小）
// =========================================================
// buildDrawingPayload は下記の詳細版を使用（グローバルに公開済み）

window.openDrawingWindowAndSend = function openDrawingWindowAndSend() {
  const child = window.open("./drawing.html", "cuberack_drawing");
  if (!child) {
    console.warn("[drawing] popup blocked?");
    return;
  }

  const payload = window.buildDrawingPayload();

  function send() {
    child.postMessage({ type: "CUBERACK_DRAWING_DATA", payload }, "*");
    console.log("[drawing] sent payload", payload);
  }

  // 子から READY が来たら送る（確実）
  function onMsg(ev) {
    if (!ev.data || typeof ev.data !== "object") return;
    if (ev.data.type === "CUBERACK_DRAWING_READY") {
      window.removeEventListener("message", onMsg);
      send();
    }
  }
  window.addEventListener("message", onMsg);

  // それでも取りこぼす場合の保険（READY前に送っても良いが、ここは保険だけ）
  setTimeout(() => {
    try { send(); } catch {}
  }, 400);
};

// =========================================================
// v1.0.5 EXPERIMENTAL
// Rack 幅（X方向）を一括で伸縮する（コア）
// =========================================================

// selectedConnector は js/state/state.js で定義済み
// window経由でアクセス可能 

// ==============================
// v1.0.6 長さ変更モード（排他ピック用・正本）
// ==============================
window.isLengthEditModeOn = false;

window.setLengthEditMode = function (on) {
  const prev = !!window.isLengthEditModeOn;
  window.isLengthEditModeOn = !!on;

  // 接続モードと排他（接続ONなら長さ変更は強制OFF）
  if (window.isLengthEditModeOn && window.isConnectModeOn) {
    window.isLengthEditModeOn = false;
  }

  // ★ONへ遷移した瞬間に「ジョイント選択の見た目」を強制リセット（黄色残り対策）
  if (!prev && window.isLengthEditModeOn) {
    try {
      // 状態も外す
      if (typeof selectedJointIndex !== "undefined") selectedJointIndex = null;

      // 見た目を全部戻す（黄色を付けた犯人が誰でも剥がせる）
      if (Array.isArray(jointMeshes)) {
        jointMeshes.forEach((m) => {
          if (!m) return;

          // スケール戻し
          try { m.scale?.set?.(1, 1, 1); } catch (e) {}

          // 色戻し（元色が退避されていればそれを優先）
          const ud = m.userData || (m.userData = {});
          const defaultHex =
  (typeof jointMaterialNormal !== "undefined" && jointMaterialNormal?.color)
    ? jointMaterialNormal.color.getHex()
    : 0x9ca3af;

const c =
  (ud._origColorHex != null) ? ud._origColorHex :
  (ud._baseColorHex != null) ? ud._baseColorHex :
  defaultHex;


          if (m.material && m.material.color && typeof m.material.color.setHex === "function") {
            m.material.color.setHex(c);
          }
          if (m.material && m.material.emissive && typeof m.material.emissive.setHex === "function") {
            m.material.emissive.setHex(0x000000);
          }
        });
      }
    } catch (e) {}
  }

  if (prev && !window.isLengthEditModeOn) {
  window.selectedConnector = null;

  // ★選択ハイライト解除（wireframe方式）
  try { window.__CR_setSelectedConnectorHighlight?.(null); } catch (e) {}

  // 選択UIを更新（len-before 等）
  try { updateSelectedConnectorUI?.(); } catch (e) {}

  // ★見た目の最終適用（D1に統一）
  try { window.reapplyConnectorVisuals?.("exit length mode"); } catch (e) {}

  // プレビューが残っていたら消す（念のため）
  try { hidePreview?.(); } catch (e) {}
}

  // ボタン表示同期（あれば）
  const btn = document.getElementById("length-mode-btn");
  if (btn) {
    btn.classList.toggle("is-on", window.isLengthEditModeOn);
    btn.classList.toggle("is-off", !window.isLengthEditModeOn);
    btn.textContent = window.isLengthEditModeOn ? "長さ変更 ON" : "長さ変更 OFF";
    btn.setAttribute("aria-pressed", window.isLengthEditModeOn ? "true" : "false");
  }
};

window.toggleLengthEditMode = function () {
  window.setLengthEditMode?.(!window.isLengthEditModeOn);
};

  // ==============================
// v1.0.6 接続モード
// ==============================
// isConnectModeOn, connectFromJointIndex, _connectFromPrevColor は js/state/state.js で定義済み
// window経由でアクセス可能

function setConnectMode(on){
  window.isConnectModeOn = !!on;

  // 解除時は選択中の接続元もクリア
  if (!window.isConnectModeOn) {
    clearConnectFromHighlight();
    window.connectFromJointIndex = null;
  }

  const btn = document.getElementById("connect-mode-btn");
  const cap = document.getElementById("connect-mode-caption");
  if (btn) {
    btn.classList.toggle("is-on", window.isConnectModeOn);
    btn.classList.toggle("is-off", !window.isConnectModeOn);
    btn.textContent = window.isConnectModeOn ? "接続モード ON" : "接続モード OFF";
    btn.setAttribute("aria-pressed", window.isConnectModeOn ? "true" : "false");
  }
  if (cap) {
    cap.style.display = window.isConnectModeOn ? "block" : "none";
  }
}

function clearConnectFromHighlight(){
  try{
    const mesh = jointMeshes?.[window.connectFromJointIndex];
    if (mesh && mesh.material && window._connectFromPrevColor != null) {
      mesh.material.color.setHex(window._connectFromPrevColor);
      if (mesh.material.emissive && window._connectFromPrevEmissive != null) {
        mesh.material.emissive.setHex(window._connectFromPrevEmissive);
        mesh.material.emissiveIntensity = 0;
      }
    }
  }catch(e){}
  window._connectFromPrevColor = null;
  window._connectFromPrevEmissive = null;
}

function highlightConnectFromJoint(jointIndex){
  clearConnectFromHighlight();
  const mesh = jointMeshes?.[jointIndex];
  if (!mesh || !mesh.material || !mesh.material.color) return;
  window._connectFromPrevColor = mesh.material.color.getHex();
  window._connectFromPrevEmissive = mesh.material.emissive ? mesh.material.emissive.getHex() : 0x000000;
  mesh.material.color.setHex(0xef4444); // 赤色（接続モード）
  if (mesh.material.emissive) {
    mesh.material.emissive.setHex(0xef4444); // 赤色の発光
    mesh.material.emissiveIntensity = 1.2; // 明るい発光強度
  }
}

// -----------------------------
// 長さプリセットは js/state/state.js で定義済み
// - BEAM_LENGTH_OPTIONS, POLE_LENGTH_OPTIONS
// - getCurrentLengthList()
// =========================================================

// -----------------------------
// オーダー状態は js/state/state.js で定義済み
// - isOrderMode(), getEffectiveCurrentLength()
// - currentOrderLengthMm
// window経由でアクセス可能

// ★ Order ON/OFF（フラグ）
window.isOrderModeOn = false;

// ==============================
// v1.0.6 接続モード（グローバル正本）
// ==============================
window.isConnectModeOn = false;
window.connectFromJointIndex = null;

window.clearConnectFromHighlight = function () {
  try {
    const mesh = jointMeshes?.[window.connectFromJointIndex];
    if (mesh && mesh.material && window._connectFromPrevColor != null) {
      mesh.material.color.setHex(window._connectFromPrevColor);
      if (mesh.material.emissive && window._connectFromPrevEmissive != null) {
        mesh.material.emissive.setHex(window._connectFromPrevEmissive);
        mesh.material.emissiveIntensity = 0;
      }
    }
  } catch (e) {}
  window._connectFromPrevColor = null;
  window._connectFromPrevEmissive = null;
};

window.highlightConnectFromJoint = function (jointIndex) {
  window.clearConnectFromHighlight();
  const mesh = jointMeshes?.[jointIndex];
  if (!mesh?.material?.color) return;
  window._connectFromPrevColor = mesh.material.color.getHex();
  window._connectFromPrevEmissive = mesh.material.emissive ? mesh.material.emissive.getHex() : 0x000000;
  mesh.material.color.setHex(0xef4444); // 赤色（接続モード）
  if (mesh.material.emissive) {
    mesh.material.emissive.setHex(0xef4444); // 赤色の発光
    mesh.material.emissiveIntensity = 1.2; // 明るい発光強度
  }
};

window.setConnectMode = function (on) {
  window.isConnectModeOn = !!on;

  if (!window.isConnectModeOn) {
    window.clearConnectFromHighlight();
    window.connectFromJointIndex = null;
  }

    // 接続モードは長さ変更モードと排他
  if (window.isConnectModeOn) window.setLengthEditMode?.(false);

  const btn = document.getElementById("connect-mode-btn");
  const cap = document.getElementById("connect-mode-caption");

  if (btn) {
    btn.classList.toggle("btn-primary", window.isConnectModeOn);
    btn.classList.toggle("btn-secondary", !window.isConnectModeOn);
    btn.textContent = window.isConnectModeOn ? "接続モード ON" : "接続モード OFF";
    btn.setAttribute("aria-pressed", window.isConnectModeOn ? "true" : "false");
  }
  if (cap) cap.style.display = window.isConnectModeOn ? "block" : "none";

  console.log("[connect] setConnectMode:", window.isConnectModeOn);
  };

// =========================================
// 接続モード：接続元ジョイントを強調表示
// =========================================
function highlightConnectFromJoint(jIdx) {
  const mesh = jointMeshes?.[jIdx];
  if (!mesh) return;

  // 元の色を保存（初回のみ）
  if (!mesh.userData._origColor) {
    mesh.userData._origColor = mesh.material.color.clone();
  }

  // ★目立つ色にする（赤）
  mesh.material.color.set(0xff3333);
  mesh.material.emissive?.set?.(0x550000);

  console.log("[connect] highlight joint", jIdx);
}

function clearConnectFromHighlight() {
  jointMeshes?.forEach((m) => {
    if (m?.userData?._origColor) {
      m.material.color.copy(m.userData._origColor);
      m.material.emissive?.set?.(0x000000);
      delete m.userData._origColor;
    }
  });
}

function debugMarkJoint(idx) {
  const m = jointMeshes[idx];
  if (!m) return;

  // 誰が見ても分かる見た目
  m.material = m.material.clone();
  m.material.color.set(0xff0000);
  m.scale.set(1.6, 1.6, 1.6);

  console.log("[debug] joint marked", idx);
}

(function initLengthModeUI(){
  const btn = document.getElementById("length-mode-btn");
  if (!btn) return;
  btn.addEventListener("click", () => window.toggleLengthEditMode?.());
  window.setLengthEditMode?.(false);
})();

// UI関連の関数は js/ui/ui.js に移動済み

// ==============================
// ==============================
// メッシュ操作関数は js/core/mesh.js に移動済み
// - removeMeshFromParent, clearAllMeshes
// window経由でアクセス可能
// ==============================

// DOM 取得（追加する）
// viewEl は js/core/scene.js で定義済み
// window経由でアクセス可能



// UI関連の関数は js/ui/ui.js に移動済み

// UI初期化は bootApp() 内で DOMContentLoaded 後に実行（DOM要素が存在することを保証）


// UI関連の関数は js/ui/ui.js に移動済み

function clearOrderPlacementMode() {
  // no-op: 旧UI/旧実装との互換のために残す
  // 必要になったら後で本実装に差し替える
}

// 自動レイアウト関連の関数は js/features/autolayout.js に移動済み

// =========================================================
// 長さ編集：軸判定 & 面移動（90度固定）
// =========================================================
function getAxisFromJoints(aIndex, bIndex, connectorType) {
  // ★ Pole は必ず Y
  if (connectorType === "pole") return "y";

  // ★ Beam は X/Z のみ（Yは見ない）
  const a = joints?.[aIndex];
  const b = joints?.[bIndex];
  if (!a || !b) return "x";

  const dx = Math.abs((b.x ?? 0) - (a.x ?? 0));
  const dz = Math.abs((b.z ?? 0) - (a.z ?? 0));

  // dz が勝ってたら Z、それ以外は X（同値なら Z に寄せてもOK）
  return (dz > dx) ? "z" : "x";
}

// joints → jointMeshes を同期
function syncJointMeshesFromData() {
  if (!Array.isArray(jointMeshes)) return;
  for (let i = 0; i < jointMeshes.length; i++) {
    const m = jointMeshes[i];
    const j = joints[i];
    if (!m || !j) continue;
    m.position.set(j.x, j.y, j.z);
  }
}

// =========================================
// LEG を joints 座標に追従させる（x/zのみ）
//  - 延長/移動で joints が変わったのに LEG が残る問題を防ぐ
// =========================================
// =========================================
// LEG を joints 座標に追従させる（x/zのみ）
//  - 延長/移動で joints が変わったのに LEG が残る問題を防ぐ
// =========================================
function syncLegMeshesFromData() {
  try {
    const hasJoints = (typeof joints !== "undefined") && Array.isArray(joints);
    if (!hasJoints) return;

    // ① legMeshes がある環境（存在チェックを必ず入れる）
    if (typeof legMeshes !== "undefined" && Array.isArray(legMeshes)) {
      for (let i = 0; i < legMeshes.length; i++) {
        const lm = legMeshes[i];
        const j = joints[i];
        if (!lm || !j) continue;

        if (Number.isFinite(j.x)) lm.position.x = j.x;
        if (Number.isFinite(j.z)) lm.position.z = j.z;
      }
      return;
    }

    // ② legMeshes が無い環境：userData.type==="leg" を走査して追従
    if (typeof rackGroup !== "undefined" && rackGroup && typeof rackGroup.traverse === "function") {
      rackGroup.traverse((obj) => {
        const ud = obj?.userData;
        if (!ud) return;

        // leg判定（あなたの実装に合わせて拡張しやすいように複数条件）
        const isLeg =
          ud.type === "leg" ||
          ud.kind === "leg" ||
          ud.isLeg === true;

        if (!isLeg) return;

        const idx = ud.jointIndex;
        if (typeof idx !== "number") return;

        const j = joints[idx];
        if (!j) return;

        if (Number.isFinite(j.x)) obj.position.x = j.x;
        if (Number.isFinite(j.z)) obj.position.z = j.z;
      });
    }
  } catch (e) {
    console.warn("[syncLegMeshesFromData] failed:", e);
  }
}

(function setupLengthModeUI(){
  const presetMode = document.getElementById("mode-preset");
  const customMode = document.getElementById("mode-custom");
  const presetSel  = document.getElementById("len-preset");
  const afterInput = document.getElementById("len-after");
  if (!presetMode || !customMode || !presetSel || !afterInput) return;

  function applyMode(){
  const isPreset = presetMode.checked;

  if (isPreset) {
    // プリセット：selectだけ表示
    presetSel.classList.remove("is-hidden");
    afterInput.classList.add("is-hidden");

    presetSel.disabled = false;

    // 値は最終値として保持しておきたいなら入れておく（適用側が len-after 参照でも動く）
    const v = Number(presetSel.value || 0);
    afterInput.value = v > 0 ? String(v) : "";

  } else {
    // オーダー：inputだけ表示
    presetSel.classList.add("is-hidden");
    afterInput.classList.remove("is-hidden");

    presetSel.disabled = true;
    presetSel.value = ""; // 迷い防止（不要なら消してOK）

    afterInput.focus();
  }
}
  presetSel.addEventListener("change", () => {
    // ★ボタン主導にするため、ここでは長さ変更モードをONにしない
    if (presetMode.checked) {
      const v = Number(presetSel.value || 0);
      afterInput.value = v > 0 ? String(v) : "";
    }
  });

  presetMode.addEventListener("change", applyMode);
  customMode.addEventListener("change", applyMode);

  // 初期適用
  applyMode();
})();

function syncEditLenPreset() {
  const sel = document.getElementById("len-preset");
  if (!sel) return;

  // 選択中があればそれを優先、なければ window.currentPartType
  const type =
    window.selectedConnector?.type ||
    window.currentPartType ||
    "beam";

  const presets =
    type === "pole"
      ? window.POLE_LENGTH_OPTIONS
      : window.BEAM_LENGTH_OPTIONS;

  sel.innerHTML = "";

  // 「選択…」
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "選択…";
  sel.appendChild(opt0);

  presets.forEach(len => {
    const opt = document.createElement("option");
    opt.value = len;
    opt.textContent = `${len}mm`;
    sel.appendChild(opt);
  });
}

// =========================================================
// コネクタメッシュ更新（長さ・向き・位置の正本）
// - Cylinder のローカルYが長手、という前提に統一
// - baseLen は userData.baseLengthMm を優先、無ければ geometry の高さ、無ければ 1
// =========================================================
function updateConnectorMesh(mesh, aPos, bPos) {
  if (!mesh || !aPos || !bPos) return;

  const start = new THREE.Vector3(aPos.x ?? 0, aPos.y ?? 0, aPos.z ?? 0);
  const end   = new THREE.Vector3(bPos.x ?? 0, bPos.y ?? 0, bPos.z ?? 0);

  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();

  // 長さ0は更新しない（壊れるので）
  if (!Number.isFinite(len) || len < 1e-6) return;

  // 中心位置
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);

  // 向き（ローカルY → dir）
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  mesh.quaternion.copy(q);

  // baseLen 決定
  const geomH =
    mesh.geometry?.parameters?.height ??
    mesh.geometry?.parameters?.length ??
    null;

  const baseLen =
    Number(mesh.userData?.baseLengthMm) ||
    Number(geomH) ||
    1;

  // 長さ反映（scale.y だけ）
  const sx = mesh.scale.x;
  const sz = mesh.scale.z;
  mesh.scale.set(sx, len / baseLen, sz);
}

// =========================================================
// joints → beams/poles mesh を同期（見た目の長さ・向き更新）
// =========================================================
function syncConnectorMeshesFromData() {
  if (typeof updateConnectorMesh !== "function") {
    console.warn("[syncConnectorMeshesFromData] updateConnectorMesh is not defined");
    return;
  }

  // Beam
  if (Array.isArray(beams)) {
    beams.forEach((b, idx) => {
      if (!b?.mesh) return;
      const a = joints?.[b.a];
      const c = joints?.[b.b];
      if (!a || !c) return;

      updateConnectorMesh(b.mesh, a, c);
    });
  }

  // Pole
  if (Array.isArray(poles)) {
    poles.forEach((p, idx) => {
      if (!p?.mesh) return;
      const a = joints?.[p.a];
      const c = joints?.[p.b];
      if (!a || !c) return;

      updateConnectorMesh(p.mesh, a, c);
    });
  }
}

// =========================================================
// v1.0.5 EXPERIMENTAL
// 選択中コネクタの「長さ」を上書き（データのみ）
// - Beam/Pole どちらでも customLength / isCustom を更新
// - プリセット外はオーダー確定
// =========================================================

function setSelectedConnectorLengthMm(newLenMm) {
  const len = Number(newLenMm);
  if (!Number.isFinite(len) || len <= 0) return false;
  if (!window.selectedConnector) return false;

  const isBeam = window.selectedConnector.type === "beam";
  const isPole = window.selectedConnector.type === "pole";
  if (!isBeam && !isPole) return false;

  // ★これが無いと arr is not defined で死ぬ
  const arr = isBeam ? beams : poles;

  // ★プリセットもここで決める（毎回）
  const presets = isBeam ? window.BEAM_LENGTH_OPTIONS : window.POLE_LENGTH_OPTIONS;

  const c = arr?.[window.selectedConnector.index];
  if (!c) return false;

  const aIndex = c.a;
  const bIndex = c.b;
  if (typeof aIndex !== "number" || typeof bIndex !== "number") {
    console.warn("[setSelectedConnectorLengthMm] connector has no endpoints:", c);
    return false;
  }

  const a = joints?.[aIndex];
  const b = joints?.[bIndex];
  if (!a || !b) {
    console.warn("[setSelectedConnectorLengthMm] missing joints:", { aIndex, bIndex, a, b });
    return false;
  }

  const rounded = Math.round(len);

  // --- 現在長さ（実距離） ---
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const dz = (b.z ?? 0) - (a.z ?? 0);

  const currentLen = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
  const delta = rounded - currentLen;

  // =========================================================
  // ★ 軸判定：ここで確定（外部関数に依存しない）
  //   - Pole は必ずY
  //   - Beam は X/Z（もしY差分が最大ならY扱いに倒す＝壊れてても動く）
  // =========================================================
  let axis = null;

  if (isPole) {
    axis = "y";
  } else {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const adz = Math.abs(dz);

    // どれも0なら「同一点」なので軸なし
    if (adx < 1e-6 && ady < 1e-6 && adz < 1e-6) {
      axis = null;
    } else {
      // 最大成分の軸を採用（90度固定前提の最も堅牢な判定）
      if (adx >= ady && adx >= adz) axis = "x";
      else if (adz >= adx && adz >= ady) axis = "z";
      else axis = "y";
    }
  }

  console.log("[setSelectedConnectorLengthMm] request", {
    type: selectedConnector.type,
    index: selectedConnector.index,
    aIndex,
    bIndex,
    a,
    b,
    dx, dy, dz,
    axis,
    currentLen,
    newLen: rounded,
    delta,
  });

  if (!axis) {
    console.warn("[setSelectedConnectorLengthMm] axis is null → abort");
    return false;
  }

// --- 90度固定のまま、面ごと平行移動（ラック単位で制限） ---
if (Math.abs(delta) > 1e-6) {
  // ★ラック（島）を確定（取れない環境もあるので安全に）
try { rebuildJointClusters?.(); } catch (e) {
  console.warn("[len] rebuildJointClusters failed", e);
}

// jointClusterId は「windowに生えている」か「ローカル」か環境差があるので両対応
const clusterArr =
  (Array.isArray(window.jointClusterId) && window.jointClusterId.length)
    ? window.jointClusterId
    : (typeof jointClusterId !== "undefined" && Array.isArray(jointClusterId) ? jointClusterId : null);

const selectedClusterId =
  (clusterArr && Number.isFinite(clusterArr[aIndex])) ? clusterArr[aIndex] : null;

// まず shift を試す（ラック単位の移動）
if (selectedClusterId == null) {
  shiftClusterJointsOnSide(aIndex, bIndex, axis, delta);
} else {
  shiftClusterJointsOnSide(aIndex, bIndex, axis, delta, selectedClusterId);
}

// --- フォールバック：shift後に実長が変わっていなければ端点だけ動かす ---
try {
  const ja2 = joints?.[aIndex];
  const jb2 = joints?.[bIndex];
  const dx2 = (jb2?.x ?? 0) - (ja2?.x ?? 0);
  const dy2 = (jb2?.y ?? 0) - (ja2?.y ?? 0);
  const dz2 = (jb2?.z ?? 0) - (ja2?.z ?? 0);
  const lenAfterShift = Math.round(Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2));

  if (lenAfterShift !== rounded) {
    console.warn("[len] shift moved 0 (or ineffective) → fallback endpoint move", { axis, delta, lenAfterShift, target: rounded });
    // どちら側を動かすか：UIのアンカー（MIN/MAX）を尊重
    const anchorPref = document.getElementById("anchor-side")?.value || "MIN";
    const aV = axis === "x" ? (ja2?.x ?? 0) : axis === "y" ? (ja2?.y ?? 0) : (ja2?.z ?? 0);
    const bV = axis === "x" ? (jb2?.x ?? 0) : axis === "y" ? (jb2?.y ?? 0) : (jb2?.z ?? 0);

    // MIN固定＝小さい側固定 / MAX固定＝大きい側固定
    const fixedIsA = (anchorPref === "MIN") ? (aV <= bV) : (aV >= bV);
    const moveIdx = fixedIsA ? bIndex : aIndex;
    const mj = joints?.[moveIdx];

    if (mj) {
      if (axis === "x") mj.x = (Number(mj.x) || 0) + delta;
      else if (axis === "y") mj.y = (Number(mj.y) || 0) + delta;
      else mj.z = (Number(mj.z) || 0) + delta;
    }
  }
} catch (e) {
  console.warn("[len] fallback endpoint move failed", e);
}

  // joints → mesh を同期（見た目を更新）
  syncJointMeshesFromData?.();
  syncConnectorMeshesFromData?.();
  syncLegMeshesFromData?.();
}

  // --- オーダー/プリセット判定（仕様通り：プリセット外=オーダー） ---
  const isPreset = presets.includes(rounded);
  c.isCustom = !isPreset;
  c.customLength = c.isCustom ? rounded : null;
  // lengthMmも更新（板のサイズ計算で使用される）
  c.lengthMm = rounded;

  // UI/見積/色 も更新
calcAndRenderEstimate?.();

// ★見た目の最終適用（ColorChart優先／OFFなら材質色へ復帰）
window.reapplyConnectorVisuals?.("after setSelectedConnectorLengthMm");

updateSelectedConnectorUI?.();
hidePreview?.();

  return true;
}

// createConnectorBetweenJoints は js/parts/connectors.js に移動済み

// ★重要：この関数は「データだけ」を変更する
// - saveHistory / rebuildSceneFromData は呼ばない
// - UI 側の resizeRackWidthStep() がそれを担当する
// - Console / 自動処理から安全に再利用できるようにしている
function resizeRackWidth(deltaMm, anchor = "LEFT") {
  if (!Array.isArray(joints) || joints.length === 0) {
    console.warn("[resizeRackWidth] joints not ready");
    return { movedJoints: 0 };
  }

  // X 座標の最小・最大を取得
  let minX = Infinity;
  let maxX = -Infinity;
  for (const j of joints) {
    minX = Math.min(minX, j.x);
    maxX = Math.max(maxX, j.x);
  }

  // どちらの面を動かすか
  const targetX = anchor === "LEFT" ? maxX : minX;
  const sign = anchor === "LEFT" ? +1 : -1;

  const EPS = 0.5; // 同一面判定（mm）

  // 対象ジョイントを一括移動
  let moved = 0;
  for (const j of joints) {
    if (Math.abs(j.x - targetX) < EPS) {
      j.x += deltaMm * sign;
      moved++;
    }
  }

  console.log(
    `[resizeRackWidth] delta=${deltaMm}mm anchor=${anchor} movedJoints=${moved}`
  );

  return { movedJoints: moved };
}

function getBeamLenMmByIndex(i) {
  const b = beams?.[i];
  if (!b) return 0;
  const ja = joints?.[b.a];
  const jb = joints?.[b.b];
  if (!ja || !jb) return 0;
  const dx = jb.x - ja.x, dy = jb.y - ja.y, dz = jb.z - ja.z;
  return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
}

function updateSelectedConnectorUI() {
  const info = document.getElementById("sel-info");
  const before = document.getElementById("len-before");
  const after = document.getElementById("len-after");
  const preset = document.getElementById("len-preset");

  if (!info || !before || !after || !preset) return;

  if (!selectedConnector) {
    info.textContent = "未選択";
    before.value = "-";
    return;
  }

  if (selectedConnector.type === "beam") {
    const len = getBeamLenMmByIndex(selectedConnector.index);
    info.textContent = `Beam #${selectedConnector.index}`;
    before.value = `${len} mm`;
    if (!after.value) after.value = String(len); // 初回だけ入れるのが便利
    return;
  }

  info.textContent = `${selectedConnector.type} #${selectedConnector.index}`;
  before.value = "-";
}

document.getElementById("len-preset")?.addEventListener("change", (e) => {
  const v = Number(e.target.value || 0);
  if (v > 0) document.getElementById("len-after").value = String(v);
});


// =========================================================
// v1.0.5 EXPERIMENTAL
// UI用ラッパ：履歴保存 + 最小幅制限 + 再描画
// =========================================================

// UI から呼ぶ正式ルート（履歴・制限・再描画をまとめる）
window.resizeRackWidthStep = function (deltaMm, anchor = "LEFT") {
  if (!Array.isArray(joints) || joints.length === 0) return;

  // 現在幅
  const xs = joints.map((j) => j.x);
  const w = Math.max(...xs) - Math.min(...xs);

  const MIN_W = 50;
  if (w + deltaMm < MIN_W) {
    alert(`これ以上縮められません（最小幅 ${MIN_W}mm）`);
    return;
  }

  if (window.callIfExists) window.callIfExists("saveHistory");

  resizeRackWidth(deltaMm, anchor);

  if (typeof rebuildSceneFromData === "function") rebuildSceneFromData();
};

// =========================================================
// v1.0.5 EXPERIMENTAL
// 選択中Beamの長さ差分だけ、接続面を動かす
// =========================================================
function applySelectedBeamLengthToGeometry(newLenMm, anchor = "MIN") {
  if (!selectedConnector || selectedConnector.type !== "beam") return false;

  const b = beams[selectedConnector.index];
  if (!b) return false;

  const a = joints[b.a];
  const c = joints[b.b];
  if (!a || !c) return false;

  // 現在長さ
  const dx = c.x - a.x;
  const dz = c.z - a.z;
  const curLen = Math.sqrt(dx * dx + dz * dz);
  if (curLen < 1e-6) return false;

  const delta = newLenMm - curLen;
  if (Math.abs(delta) < 0.5) return true; // 変化なし

  // X方向ビーム前提（横方向）
  const moveDir = (dx >= 0) ? 1 : -1;

  // どちら側を固定するか
  const fixedX = anchor === "MIN" ? a.x : c.x;

  const EPS = 0.5;
  joints.forEach(j => {
    if (
  anchor === "MIN"
    ? j.x > fixedX + EPS   // MIN側固定 → 先（＋側）だけ動かす
    : j.x < fixedX - EPS   // MAX側固定 → 手前（−側）だけ動かす
) {
  j.x += delta * moveDir;
}
  });

  return true;
}

// =========================================================
// v1.0.5 EXPERIMENTAL
// 選択パーツ長さ変更：適用ボタン
// =========================================================
(() => {
  const btn = document.getElementById("apply-len-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!selectedConnector) {
      alert("Beam / Pole をクリックして選択してください。");
      return;
    }

    // 変更後長さを決定（オーダー優先 → プリセット）
    const afterInput = document.getElementById("len-after");
    const presetSel  = document.getElementById("len-preset");

    const orderLen = Number(afterInput?.value || 0);
    const presetLen = Number(presetSel?.value || 0);

    const newLen = (orderLen > 0) ? orderLen : presetLen;

    if (!Number.isFinite(newLen) || newLen <= 0) {
      alert("変更後の長さを入力するか、プリセットを選択してください。");
      return;
    }

    // Undo用に履歴を先に保存
    if (window.callIfExists) window.callIfExists("saveHistory", "edit length");

    // データ更新（まずは1本だけ）
    // データ更新（選択コネクタの向きに応じて joint を動かす）
const ok = setSelectedConnectorLengthMm(newLen);
  // 接続モードは長さ変更モードと排他
     if (window.isConnectModeOn) window.setLengthEditMode?.(false);
     
     

// ★長さ変更後、見た目スケールも即反映（beam/poleどちらでも）
if (ok) {
  const type = selectedConnector?.type;
  const idx  = selectedConnector?.index;

  if (type === "beam" && beams?.[idx]?.mesh) {
    applyConnectorLengthScale(beams[idx].mesh, newLen);
  }
  if (type === "pole" && poles?.[idx]?.mesh) {
    applyConnectorLengthScale(poles[idx].mesh, newLen);
  }
}

    if (!ok) {
      alert("長さ変更に失敗しました。Console を確認してください。");
      return;
    }

    // ★見た目（実長）を変える：ジョイント座標を動かす
const anchor = document.getElementById("anchor-side")?.value || "MIN";

if (selectedConnector.type === "beam") {
  applySelectedBeamLengthToGeometry?.(newLen, anchor);
} else if (selectedConnector.type === "pole") {
  // ポールも同様にしたいが、まずはbeamを確実に動かす（次手で追加）
  // applySelectedPoleLengthToGeometry?.(newLen, anchor);
}

// ★追加：座標を動かした結果を、全コネクタの custom 判定に反映
normalizeCustomFlagsByActualLength?.();

    // 再描画＆見積更新
    if (typeof rebuildSceneFromData === "function") rebuildSceneFromData();
    
    // ★板のサイズも更新（beam/poleの長さ変更に追従）
    if (typeof window.rebuildBoards === "function") {
      window.rebuildBoards();
    }
    
    requestEstimateRender("after rebuildSceneFromData");
  

    // 選択強調も更新（ON/OFFどちらでも効くように）
    applyColorChartToAllConnectors?.();

    // 変更前欄を更新
    const beforeEl = document.getElementById("len-before");
    if (beforeEl) beforeEl.value = String(getSelectedConnectorLengthMm?.() ?? "-");
  });
})();

// =========================================================
// v1.0.5 EXPERIMENTAL
// 実長（ジョイント座標）から isCustom/customLength を正規化
// - プリセット外はオーダー確定
// - プリセット内は規格扱い（customLength=null）
// =========================================================
function normalizeCustomFlagsByActualLength() {
  const beamPresets = (window.BEAM_LENGTH_OPTIONS || BEAM_LENGTH_OPTIONS || []);
  const polePresets = (window.POLE_LENGTH_OPTIONS || POLE_LENGTH_OPTIONS || []);

  // Beam
  if (Array.isArray(beams)) {
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      if (!b) continue;

      // getBeamLength が無い環境でも壊れないように保険
      let len = null;
      if (typeof getBeamLength === "function") len = Math.round(getBeamLength(b));
      else if (typeof getBeamLengthMmSafe === "function") len = Math.round(getBeamLengthMmSafe(b));

      if (!Number.isFinite(len) || len <= 0) continue;

      const isPreset = beamPresets.includes(len);
      b.isCustom = !isPreset;
      b.customLength = b.isCustom ? len : null;
    }
  }

  // Pole
  if (Array.isArray(poles)) {
    for (let i = 0; i < poles.length; i++) {
      const p = poles[i];
      if (!p) continue;

      let len = null;
      if (typeof getPoleLength === "function") len = Math.round(getPoleLength(p));
      else {
        // fallback：ジョイント座標から
        const a = joints?.[p.a], b = joints?.[p.b];
        if (a && b) {
          const dx = (a.x ?? 0) - (b.x ?? 0);
          const dy = (a.y ?? 0) - (b.y ?? 0);
          const dz = (a.z ?? 0) - (b.z ?? 0);
          len = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
      }

      if (!Number.isFinite(len) || len <= 0) continue;

      const isPreset = polePresets.includes(len);
      p.isCustom = !isPreset;
      p.customLength = p.isCustom ? len : null;
    }
  }
}

// =========================================================
// main.js  モジュール家具 3D 見積りミニデモ（フル版・整頓版）
// =========================================================


// 脚UIを削除したので、呼ばれても何もしない空関数
function syncLegCountInput() {
  // no-op
}

// ★ ビューキューブ用の一時クォータニオン
const _viewCubeTmpQuat = new THREE.Quaternion();

// ★ ビューキューブの基準補正
//   - X軸 180° … 上下を正しく
//   - Y軸  90° … 「前」「右」の位置を、描いてくれた図の向きに合わせる
const _viewCubeAdjustQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI, Math.PI / 2, 0, "XYZ")
);


// ★ 寸法ラベル共通パラメータ
let labelScalePercent = 100; // 文字サイズ（%）
let labelOffsetMm = 40;      // コネクタ中心からの高さオフセット（mm）
const LABEL_BASE_W = 80;     // ラベルの基準幅（World単位）
const LABEL_BASE_H = 36;     // ラベルの基準高さ

// gridEnabled は js/state/state.js で定義済み

// 🔵 寸法ポップアップ ON/OFF（唯一の正本）
let isDimensionPopupOn = false;

function getDimensionPopupEl() {
  return document.getElementById("dimension-overlay");
}

function getDimensionPopupToggleBtnEl() {
  return document.getElementById("dimension-open-btn");
}

function applyDimensionPopupVisibility(on) {
  const popup = getDimensionPopupEl();
  if (!popup) return;

  popup.classList.toggle("hidden", !on);
}

function syncDimensionPopupButton(on) {
  const btn = getDimensionPopupToggleBtnEl();
  if (!btn) return;

  // ON/OFF の見た目を矛盾なく揃える
  btn.classList.toggle("btn-toggle-on", !!on);

  // もし HTML や他処理で付いてしまっても、ここで整流する
  btn.classList.toggle("is-off", !on);
  btn.classList.toggle("is-on",  !!on);

  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function setDimensionPopup(on, reason = "") {
  const next = !!on;

  // 状態更新（唯一の正本）
  isDimensionPopupOn = next;

  // ONにする直前/直後に「内容更新」と「位置固定」を必ず通す
  if (next) {
    try {
      updateDimensionPopup?.();
    } catch (e) {
      console.warn("[dimension] updateDimensionPopup failed", e);
    }

    // dialog の固定位置（既存仕様をここへ移管）
    const overlay = getDimensionPopupEl();
    const dialog = overlay ? overlay.querySelector(".dim-dialog") : null;
    if (dialog) {
      dialog.style.position = "fixed";
      dialog.style.right = "380px";
      dialog.style.top = "80px";
      dialog.style.left = "auto";
    }
  }

  // 表示/非表示
  applyDimensionPopupVisibility(next);

  // ボタン反転・aria同期
  syncDimensionPopupButton(next);
}


// ===== マウスドラッグ状態 =====
// マウス・ドラッグ状態は js/state/state.js で定義済み
// - isLeftMouseDown, isShiftPanning, lastPanX, lastPanY, didDrag
// window経由でアクセス可能

// =========================================================
// v1.0.8：移動モード（ラック/クラスタ移動ドラッグの有効/無効）
// =========================================================
if (typeof window.isMoveModeOn === "undefined") {
  window.isMoveModeOn = false; // 既定OFF（うっかり移動防止）
}

// クラスタ移動ドラッグを強制終了（OFF切替や安全復帰用）
function cancelClusterDragMove() {
  try {
    if (typeof dragState !== "undefined" && dragState) {
      dragState.active = false;
      dragState.clusterJointIndices = [];
      dragState.clusterStartPositions = [];
      dragState._dragStartHit = null;

      const pid = dragState._pointerId;
      if (pid != null) {
        renderer?.domElement?.releasePointerCapture?.(pid);
      }
      dragState._pointerId = null;
    }
  } catch {}

  try {
    if (typeof controls !== "undefined" && controls) controls.enabled = true;
  } catch {}
}

// UIボタンから呼ぶ（ON->OFF時は強制終了）
window.setMoveMode = function (on) {
  const next = !!on;
  const prev = !!window.isMoveModeOn;
  window.isMoveModeOn = next;

  if (prev && !next) cancelClusterDragMove();

  try { window.syncMoveModeUI?.(); } catch {}
};

// ===== 自動レイアウトツールからの設定受信 =====
window.addEventListener("storage", (event) => {
  if (event.key !== "cuberack_auto_layout") return;

  const payload = event.newValue ? JSON.parse(event.newValue) : null;
  if (!payload) return;

  if (payload.mode === "3d") {
    applyAutoLayout3DFromExternal(payload.data);
  } else if (payload.mode === "flat") {
    applyAutoLayoutFlatFromExternal(payload.data);
  }
});

// =========================================================
// v1.0.8：クラスタ（ラック）回転（+90° / Y軸 / 90度刻み）
// =========================================================
function getClusterJointIndicesFromJointIndex(jointIndex) {
  if (jointIndex == null || jointIndex < 0) return null;

  const cid = jointClusterId?.[jointIndex];
  if (cid != null && cid >= 0 && jointClusters?.[cid]?.joints?.length) {
    return jointClusters[cid].joints.slice();
  }
  return [jointIndex];
}

function getClusterCenterXZ(indices) {
  let sx = 0, sz = 0, n = 0;
  indices.forEach((idx) => {
    const j = joints?.[idx];
    if (!j) return;
    sx += j.x;
    sz += j.z;
    n++;
  });
  if (n <= 0) return { cx: 0, cz: 0 };
  return { cx: sx / n, cz: sz / n };
}

function snapXZ(x, z) {
  const STEP = 50;
  const MAGNET = 30;

  // 既存があればそれを使う
  const snapFn =
    (typeof snapMagnetCoord === "function" && snapMagnetCoord) ||
    (typeof snapMagnet === "function" && ((v) => snapMagnet(v, STEP, MAGNET))) ||
    null;

  if (!snapFn) return { x, z };

  // snapMagnetCoord は (pos, step, magnetRange) 想定
  if (snapFn === snapMagnetCoord) {
    return {
      x: snapMagnetCoord(x, STEP, MAGNET),
      z: snapMagnetCoord(z, STEP, MAGNET),
    };
  }

  // snapMagnet(pos, step, magnet) 互換
  return { x: snapFn(x), z: snapFn(z) };
}

function applyJointsToMeshesAndConnectors(indices) {
  // joint mesh
  indices.forEach((jIdx) => {
    const j = joints?.[jIdx];
    const m = jointMeshes?.[jIdx];
    if (j && m) m.position.set(j.x, j.y, j.z);
  });

  // legs
  if (Array.isArray(legs)) {
    legs.forEach((leg) => {
      if (!leg || leg.jointIndex == null) return;
      updateLegMeshPosition?.(leg.jointIndex);
    });
  }

  // beams / poles
  beams?.forEach((b) => {
    if (!b?.mesh) return;
    const aPos = joints[b.a], bPos = joints[b.b];
    if (!aPos || !bPos) return;
    updateConnectorMesh?.(b.mesh, aPos, bPos);
  });
  poles?.forEach((p) => {
    if (!p?.mesh) return;
    const aPos = joints[p.a], bPos = joints[p.b];
    if (!aPos || !bPos) return;
    updateConnectorMesh?.(p.mesh, aPos, bPos);
  });
}

// ★クラスタを +90° 回転（Y軸）
window.rotateActiveCluster90 = function (deg = 90) {
  console.log("[ROTATE] enter", {
    deg,
    activeJoint: window.__CR_ACTIVE_JOINT_INDEX__,
    isLengthEdit: window.isLengthEditModeOn,
    isConnect: window.isConnectModeOn,
    dragging: dragState?.active,
  });

  // ガード（既存方針を維持）
  if (window.isLengthEditModeOn || window.isConnectModeOn || dragState?.active) {
    return;
  }

  // --- 基準ジョイント決定 ---
  let baseJ = window.__CR_ACTIVE_JOINT_INDEX__;

  // クリック選択がある環境ならそれをフォールバックに使う
  if ((baseJ == null || baseJ < 0) && typeof selectedJointIndex !== "undefined") {
    if (typeof selectedJointIndex === "number" && selectedJointIndex >= 0) {
      baseJ = selectedJointIndex;
      window.__CR_ACTIVE_JOINT_INDEX__ = baseJ;
    }
  }

  // クラスタ（ラック島）を取得
  const indices = getClusterJointIndicesFromJointIndex(baseJ);
  if (!indices || !indices.length) {
    console.warn("[rotate] no active joint/cluster to rotate", {
      __CR_ACTIVE_JOINT_INDEX__: window.__CR_ACTIVE_JOINT_INDEX__,
      selectedJointIndex: (typeof selectedJointIndex !== "undefined" ? selectedJointIndex : "(undef)"),
    });
    return;
  }

  // --- 回転中心：選択ジョイントのポール軸（Y軸） ---
  const pivot = joints?.[baseJ];
  if (!pivot) {
    console.warn("[rotate] pivot joint not found", baseJ);
    return;
  }
  const cx = pivot.x;
  const cz = pivot.z;

  // 角度
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // ジョイント回転（XZ平面で回す）
  indices.forEach((jIdx) => {
    const j = joints?.[jIdx];
    if (!j) return;

    const dx = j.x - cx;
    const dz = j.z - cz;

    j.x = cx + dx * cos - dz * sin;
    j.z = cz + dx * sin + dz * cos;

    const mesh = jointMeshes?.[jIdx];
    if (mesh) mesh.position.set(j.x, j.y, j.z);
  });

  // 追従更新（既存の updateConnectorMesh を尊重）
  try {
    beams?.forEach((b) => {
      if (!b?.mesh) return;
      const aPos = joints?.[b.a];
      const bPos = joints?.[b.b];
      if (!aPos || !bPos) return;
      updateConnectorMesh(b.mesh, aPos, bPos);
    });
    poles?.forEach((p) => {
      if (!p?.mesh) return;
      const aPos = joints?.[p.a];
      const bPos = joints?.[p.b];
      if (!aPos || !bPos) return;
      updateConnectorMesh(p.mesh, aPos, bPos);
    });
  } catch (e) {
    console.warn("[rotate] updateConnectorMesh failed", e);
  }

  // 脚追従（存在する場合のみ）
  try {
    if (Array.isArray(legs)) {
      legs.forEach((l) => {
        if (!l || l.jointIndex == null) return;
        updateLegMeshPosition?.(l.jointIndex);
      });
    }
  } catch (e) {
    console.warn("[rotate] leg follow failed", e);
  }

  // 後処理
  try { saveHistory?.("rotate cluster " + deg); } catch {}
  try { requestEstimateRender?.("after rotate " + deg); } catch {}
  try { applyColorChartToAllConnectors?.(); } catch {}
};

// =========================================================
// Delete Cluster（mesh先dispose → indexMap再構築 → rebuild）
//   - overrideJointIndex が来たらそれを優先
//   - 順番依存を排除
//   - 「ジョイントだけ消える」「ビームが残る」を潰す
// =========================================================
window.deleteActiveCluster = function (overrideJointIndex, opts) {
  const options = Object.assign({ confirm: true }, opts || {});

  const j0 =
    (typeof overrideJointIndex === "number" && overrideJointIndex >= 0)
      ? overrideJointIndex
      : window.__CR_ACTIVE_JOINT_INDEX__;

  if (typeof j0 !== "number" || j0 < 0) {
    console.warn("[delete] no active joint");
    return false;
  }

  // 最新クラスタ
  if (typeof rebuildJointClusters === "function") rebuildJointClusters();

  const cid = jointClusterId?.[j0];
  const clusterJoints =
    (cid != null && jointClusters?.[cid]?.joints?.length)
      ? jointClusters[cid].joints.slice()
      : [j0];

  if (options.confirm) {
    if (!confirm(`このラック（${clusterJoints.length} joints）を削除しますか？`)) return false;
  }

  if (window.callIfExists) window.callIfExists("saveHistory", "delete cluster");

  const delSet = new Set(clusterJoints);

  // --------------------------------------------------
  // 0) 重要：mesh参照が生きているうちに “全部” dispose
  //    （rebuildSceneFromData が mesh を見て dispose する前提を壊さない）
  // --------------------------------------------------
  try {
    // beams/poles/legs は全て一旦破棄（あとで配列から復元）
    if (Array.isArray(beams)) beams.forEach((b) => { try { disposeBeamMesh?.(b); } catch {} });
    if (Array.isArray(poles)) poles.forEach((p) => { try { disposePoleMesh?.(p); } catch {} });
    if (Array.isArray(legs))  legs.forEach((l) => { try { disposeLegMesh?.(l);  } catch {} });
    // joints（球）も全破棄（安全側：後で再生成）
    if (Array.isArray(jointMeshes)) {
      for (let i = 0; i < jointMeshes.length; i++) {
        try { disposeJointMeshByIndex?.(i); } catch {}
      }
    }
  } catch (e) {
    console.warn("[delete] pre-dispose failed", e);
  }

  // --------------------------------------------------
  // 1) joints をフィルタして newJoints、old→new indexMap
  // --------------------------------------------------
  const oldCount = joints.length;
  const indexMap = new Array(oldCount).fill(-1);

  const newJoints = [];
  for (let i = 0; i < oldCount; i++) {
    if (delSet.has(i)) continue;
    indexMap[i] = newJoints.length;
    newJoints.push({ ...joints[i] });
  }

  // --------------------------------------------------
  // 2) beams/poles：削除対象端点を含むものは捨てる
  //              ：残すものは indexMap で remap
  // --------------------------------------------------
  function remapConnectors(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (!c) continue;

      if (delSet.has(c.a) || delSet.has(c.b)) continue;

      const na = indexMap[c.a];
      const nb = indexMap[c.b];
      if (na < 0 || nb < 0) continue;

      // meshは必ず再生成する（さっき全dispose済み）
      out.push({ ...c, a: na, b: nb, mesh: null });
    }
    return out;
  }

  const newBeams = remapConnectors(beams);
  const newPoles = remapConnectors(poles);

  // --------------------------------------------------
  // 3) legs：jointIndex remap（削除対象は捨てる）
  // --------------------------------------------------
  const newLegs = [];
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (!l) continue;
    if (delSet.has(l.jointIndex)) continue;

    const nj = indexMap[l.jointIndex];
    if (nj < 0) continue;

    newLegs.push({ ...l, jointIndex: nj, mesh: null });
  }

  // --------------------------------------------------
  // 4) 元配列を更新（参照を壊さない）
  // --------------------------------------------------
  joints.length = 0;
  joints.push(...newJoints);

  beams.length = 0;
  beams.push(...newBeams);

  poles.length = 0;
  poles.push(...newPoles);

  legs.length = 0;
  legs.push(...newLegs);

  // v1.0.5+ manual legs: 手動LEGの jointIndex を indexMap で remap
  const prevManualSet = window.manualLegJointSet || new Set();
  const newManualSet = new Set();
  for (const oldIdx of prevManualSet) {
    if (delSet.has(oldIdx)) continue;
    const nj = indexMap[oldIdx];
    if (nj >= 0) newManualSet.add(nj);
  }
  window.manualLegJointSet = newManualSet;

  // 選択解除
  window.__CR_ACTIVE_JOINT_INDEX__ = undefined;
  try { setSelectedJoint?.(null); } catch {}

  // クラスタ再構築
  if (typeof rebuildJointClusters === "function") rebuildJointClusters();

  // --------------------------------------------------
  // 5) シーン再生成
  //   - rebuildSceneFromData があるなら使う
  //   - もし落ちても joints/beams/poles が “全消え” で止まらないようにフォールバック
  // --------------------------------------------------
  try {
    if (typeof rebuildSceneFromData === "function") {
      rebuildSceneFromData();
    } else {
      // 最低限
      requestEstimateRender?.("after delete cluster (no rebuildSceneFromData)");
    }
  } catch (e) {
    console.warn("[delete] rebuildSceneFromData failed -> fallback", e);

    // --- フォールバック：簡易再生成（最低限 joints と connectors を復元） ---
    try {
      // joints
      jointMeshes.length = 0;
      for (let i = 0; i < joints.length; i++) {
        const j = joints[i];
        const mat = jointMaterialNormal?.clone?.()
          ? jointMaterialNormal.clone()
          : new THREE.MeshStandardMaterial({ color: 0x9ca3af });
        const geo = jointGeometry?.isBufferGeometry
          ? jointGeometry
          : new THREE.SphereGeometry(10, 16, 16);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(j.x, j.y, j.z);
        m.userData = { type: "joint", jointIndex: i };
        rackGroup?.add?.(m);
        jointMeshes.push(m);
      }

      // beams/poles（mesh再生成）
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        const aPos = joints[b.a], bPos = joints[b.b];
        if (!aPos || !bPos) continue;
        b.mesh = createCylinderBetween(aPos, bPos, beamMaterial);
        updateConnectorMesh?.(b.mesh, aPos, bPos);
      }
      for (let i = 0; i < poles.length; i++) {
        const p = poles[i];
        const aPos = joints[p.a], bPos = joints[p.b];
        if (!aPos || !bPos) continue;
        p.mesh = createCylinderBetween(aPos, bPos, poleMaterial);
        updateConnectorMesh?.(p.mesh, aPos, bPos);
      }

      // legs（存在するなら）
      for (let i = 0; i < legs.length; i++) {
        const l = legs[i];
        if (!l) continue;
        if (typeof createLegMeshForJointIndex === "function") {
          l.mesh = createLegMeshForJointIndex(l.jointIndex);
        }
      }
    } catch (e2) {
      console.warn("[delete] fallback rebuild failed", e2);
    }
  }

  // 見積・色
  calcAndRenderEstimate?.();
  applyColorChartToAllConnectors?.();

  return true;
};

// =========================================================
// ジオメトリ & カラーパレット / マテリアル定義は js/core/materials.js に移動済み
// - jointRadius, jointGeometry
// - COLOR_KUROGANE, COLOR_CONNECTOR, COLOR_PREVIEW
// - jointMaterialNormal, jointMaterialSelected, jointMaterialPreview
// - beamMaterial, poleMaterial, legMaterial
// - originalBeamColor, originalPoleColor, connectorMaterialPreview
// =========================================================


// =========================================================
// メッシュ生成 / 破棄ヘルパーは js/core/mesh.js に移動済み
// - createCylinderBetween
// - applyConnectorDisplayLength
// - setConnectorThicknessPreserveLength
// - disposeJointMeshByIndex, disposeBeamMesh, disposePoleMesh, disposeLegMesh
// =========================================================

// =========================================================
// カラーチャート関連（ヘルパー）【EARLY】
//   - 後半（LATE）が正本になるため、ここは互換・保管用
//   - 削除しないが、重複定義は避ける（applyLengthColoring を改名）
// =========================================================

function getBeamLength__EARLY(b) {
  const a = joints[b.a];
  const c = joints[b.b];
  if (!a || !c) return 0;
  return Math.round(
    new THREE.Vector3(a.x, a.y, a.z).distanceTo(
      new THREE.Vector3(c.x, c.y, c.z)
    )
  );
}

function getPoleLength__EARLY(p) {
  const a = joints[p.a];
  const c = joints[p.b];
  if (!a || !c) return 0;
  return Math.round(
    new THREE.Vector3(a.x, a.y, a.z).distanceTo(
      new THREE.Vector3(c.x, c.y, c.z)
    )
  );
}

function getLengthColor__EARLY(lengthMm) {
  return LENGTH_COLOR_MAP[lengthMm] || LENGTH_COLOR_MAP.order;
}

function renderColorChartTable() {
  const tbody = document.getElementById("colorchart-tbody");
  if (!tbody) {
    console.warn("[colorChart] tbody not found: #colorchart-tbody");
    return;
  }

  if (typeof LENGTH_COLOR_MAP === "undefined" || !LENGTH_COLOR_MAP) {
    console.warn("[colorChart] LENGTH_COLOR_MAP is missing");
    return;
  }

  // 表クリア
  tbody.innerHTML = "";

  // order は最後に出す
  const keys = Object.keys(LENGTH_COLOR_MAP)
    .filter((k) => k !== "order")
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  // 行生成
  for (const len of keys) {
    const col = LENGTH_COLOR_MAP[len]; // "#rrggbb" 想定
    const tr = document.createElement("tr");

    const tdLen = document.createElement("td");
    tdLen.textContent = `${len} mm`;

    const tdCol = document.createElement("td");
    const sw = document.createElement("span");
    sw.style.display = "inline-block";
    sw.style.width = "22px";
    sw.style.height = "14px";
    sw.style.borderRadius = "4px";
    sw.style.verticalAlign = "middle";
    sw.style.background = String(col); // ★そのまま "#xxxxxx"
    tdCol.appendChild(sw);

    tr.appendChild(tdLen);
    tr.appendChild(tdCol);
    tbody.appendChild(tr);
  }

  // order 行
  if ("order" in LENGTH_COLOR_MAP) {
    const tr = document.createElement("tr");

    const tdLen = document.createElement("td");
    tdLen.textContent = "オーダー";

    const tdCol = document.createElement("td");
    const sw = document.createElement("span");
    const col = LENGTH_COLOR_MAP.order;
    sw.style.display = "inline-block";
    sw.style.width = "22px";
    sw.style.height = "14px";
    sw.style.borderRadius = "4px";
    sw.style.verticalAlign = "middle";
    sw.style.background = String(col);
    tdCol.appendChild(sw);

    tr.appendChild(tdLen);
    tr.appendChild(tdCol);
    tbody.appendChild(tr);
  }

  console.log("[colorChart] table rendered:", keys.length + ("order" in LENGTH_COLOR_MAP ? 1 : 0), "rows");
}

// ★ 旧 applyLengthColoring は “保管” に回す（削除しない）
//   - 後半の applyLengthColoring が正本
function applyLengthColoring__EARLY_UNUSED() {
  console.log("[applyLengthColoring] EARLY CALLED (should not happen)");

  // ビーム
  beams.forEach((b) => {
    if (!b.mesh) return;
    const mat = b.mesh.material;
    const len = getBeamLength__EARLY(b);

    const baseColor =
      b.isCustom && b.customLength != null
        ? LENGTH_COLOR_MAP.order
        : getLengthColor__EARLY(len);

    mat.color.set(baseColor);

    if ("emissive" in mat) {
      if (b.isCustom) {
        mat.emissive.set(baseColor);
        mat.emissiveIntensity = 0.8;
      } else {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    if (b.isCustom) {
      mat.wireframe = true;
      b.mesh.scale.x = 1.5;
      b.mesh.scale.z = 1.5;
    } else {
      mat.wireframe = false;
      b.mesh.scale.x = 1.0;
      b.mesh.scale.z = 1.0;
    }
    mat.needsUpdate = true;
  });

  // ポール
  poles.forEach((p) => {
    if (!p.mesh) return;
    const mat = p.mesh.material;
    const len = getPoleLength__EARLY(p);

    const baseColor =
      p.isCustom && p.customLength != null
        ? LENGTH_COLOR_MAP.order
        : getLengthColor__EARLY(len);

    mat.color.set(baseColor);

    if ("emissive" in mat) {
      if (p.isCustom) {
        mat.emissive.set(baseColor);
        mat.emissiveIntensity = 0.8;
      } else {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    if (p.isCustom) {
      mat.wireframe = true;
      p.mesh.scale.x = 1.5;
      p.mesh.scale.z = 1.5;
    } else {
      mat.wireframe = false;
      p.mesh.scale.x = 1.0;
      p.mesh.scale.z = 1.0;
    }

    mat.needsUpdate = true; // ★必ず最後に
  });
}

// =========================================================
// カラーチャート表の描画（UI）
//   - UI の tbody (#colorchart-tbody) に LENGTH_COLOR_MAP を表示
//   - ここは後半の LENGTH_COLOR_MAP（文字列hex）でも動くようにする
// =========================================================
function renderColorChartTable() {
  const tbody = document.getElementById("colorchart-tbody");
  if (!tbody) {
    console.warn("[colorChart] tbody not found: #colorchart-tbody");
    return;
  }

  if (typeof LENGTH_COLOR_MAP === "undefined" || !LENGTH_COLOR_MAP) {
    console.warn("[colorChart] LENGTH_COLOR_MAP is missing");
    return;
  }

  tbody.innerHTML = "";

  const keys = Object.keys(LENGTH_COLOR_MAP)
    .filter((k) => k !== "order")
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const len of keys) {
    const col = LENGTH_COLOR_MAP[len];
    const tr = document.createElement("tr");

    const tdLen = document.createElement("td");
    tdLen.textContent = `${len} mm`;

    const tdCol = document.createElement("td");
    const sw = document.createElement("span");
    sw.style.display = "inline-block";
    sw.style.width = "22px";
    sw.style.height = "14px";
    sw.style.borderRadius = "4px";
    sw.style.verticalAlign = "middle";

    // LENGTH_COLOR_MAP が
    // - 数値(0x...) の場合
    // - 文字列("#...") の場合
    // どちらでも表示できるようにする（ロジック変更ではなく表示互換）
    if (typeof col === "string") {
      sw.style.background = col;
    } else {
      sw.style.background = `#${(col >>> 0).toString(16).padStart(6, "0")}`;
    }

    tdCol.appendChild(sw);

    tr.appendChild(tdLen);
    tr.appendChild(tdCol);
    tbody.appendChild(tr);
  }

  if ("order" in LENGTH_COLOR_MAP) {
    const tr = document.createElement("tr");

    const tdLen = document.createElement("td");
    tdLen.textContent = "オーダー";

    const tdCol = document.createElement("td");
    const sw = document.createElement("span");
    const col = LENGTH_COLOR_MAP.order;

    sw.style.display = "inline-block";
    sw.style.width = "22px";
    sw.style.height = "14px";
    sw.style.borderRadius = "4px";
    sw.style.verticalAlign = "middle";

    if (typeof col === "string") {
      sw.style.background = col;
    } else {
      sw.style.background = `#${(col >>> 0).toString(16).padStart(6, "0")}`;
    }

    tdCol.appendChild(sw);

    tr.appendChild(tdLen);
    tr.appendChild(tdCol);
    tbody.appendChild(tr);
  }

  console.log(
    "[colorChart] table rendered:",
    keys.length + ("order" in LENGTH_COLOR_MAP ? 1 : 0),
    "rows"
  );
}

// toggleColorChart は js/ui/ui.js に移動済み

const maskTable = document.getElementById("mask-table");
const rebuildGridBtn = document.getElementById("rebuild-grid-btn");
const runBtn = document.getElementById("run-flat-layout-btn");
const resetLayoutBtn = document.getElementById("reset-layout-btn"); // ★追加
const orderCancelBtn = document.getElementById("order-cancel-btn");

if (orderCancelBtn) {
  orderCancelBtn.addEventListener("click", () => {
    // オーダーモード解除（状態だけ）
    clearOrderPlacementMode();

    // ★ このタイミングなら orderLengthInput は初期化済みなので安全
    if (typeof orderLengthInput !== "undefined" && orderLengthInput) {
      orderLengthInput.value = "";
    }

    // 長さセレクトを「通常のデフォルト」に戻す
    const list = window.getCurrentLengthList();
    let def = currentLengthMm;

    if (!list.includes(def)) {
      if (list.includes(200)) def = 200;
      else def = list[0] ?? 0;
    }

    currentLengthMm = def;
    if (lengthSelect) {
      lengthSelect.value = String(def);
    }

    // プレビューも消す
    hidePreview();
  });
  if (ok) window.setLengthEditMode?.(false);

}

// ==== 自動レイアウト（高さ情報） =========================
// cellStageData[row][col] = { stages: number, heights: number[] } or null
// 自動レイアウトとビューブロック同期は js/state/state.js で定義済み
// - cellStageData, viewCubeEl, _viewCubeEuler, _viewCubeQuat
// window経由でアクセス可能

// カメラの向きに合わせてビューキューブ（HTML要素）を回転
function syncViewCubeWithCamera() {
  if (!window.viewCubeEl || !camera) return;

  // カメラのワールド向きを取得
  camera.getWorldQuaternion(_viewCubeTmpQuat);

  // カメラの逆向きをベースに
  _viewCubeTmpQuat.invert();

  // 描いてくれた「上・前・右」の配置になるように基準補正を掛ける
  _viewCubeTmpQuat.multiply(_viewCubeAdjustQuat);

  // CSS 3D 用にオイラー角へ変換
  window._viewCubeEuler.setFromQuaternion(_viewCubeTmpQuat, "YXZ");
  const rx = THREE.MathUtils.radToDeg(window._viewCubeEuler.x);
  const ry = THREE.MathUtils.radToDeg(window._viewCubeEuler.y);
  const rz = THREE.MathUtils.radToDeg(window._viewCubeEuler.z);

  // HTML 要素の transform に反映
  window.viewCubeEl.style.transform =
    `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
}

// isOrderMode(), getEffectiveCurrentLength() は js/state/state.js で定義済み
// window経由でアクセス可能


// 規格長配列 BEAM_LENGTH_OPTIONS / POLE_LENGTH_OPTIONS から
// 指定長さに一番近いものを返す
function findNearestLength(options, targetMm) {
  let best = options[0];
  let bestDiff = Math.abs(options[0] - targetMm);

  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(options[i] - targetMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = options[i];
    }
  }
  return best;
}

// =========================================================
// タブタイトル・未保存管理・MRU・自動バックアップ
// =========================================================

// currentFileName, isDirty, hasEverRendered は js/state/state.js で定義済み
// window経由でアクセス可能

// ファイル操作関連の関数は js/features/file.js に移動済み
// updateTabTitle, addToRecentFiles, getRecentFiles, autoBackup は window 経由でアクセス可能

// =========================================================
// 1. Undo / Redo 管理 & ハイライト
// =========================================================

// 履歴管理は js/state/state.js で定義済み
// - history, historyIndex
// window経由でアクセス可能

// highlightedObject, originalMaterial は js/state/state.js で定義済み
// window経由でアクセス可能

function setHighlight(mesh) {
  if (window.highlightedObject === mesh) return;

  resetHighlight();

  window.highlightedObject = mesh;
  window.originalMaterial = mesh.material;

  const hlMat = window.originalMaterial.clone();
  hlMat.color.setHex(0xef4444); // 赤色
  if (hlMat.emissive) {
    hlMat.emissive.setHex(0xef4444); // 赤色の発光
    hlMat.emissiveIntensity = 1.2; // 明るい発光強度
  }
  hlMat.transparent = true;
  hlMat.opacity = 0.9;

  mesh.material = hlMat;
}

function resetHighlight() {
  if (!window.highlightedObject) return;

  const hlMat = window.highlightedObject.material;
  window.highlightedObject.material = window.originalMaterial;

  if (hlMat !== window.originalMaterial) hlMat.dispose();

  window.highlightedObject = null;
  window.originalMaterial = null;
}

// =========================================================
// 選択コネクタの簡易ハイライト（wireframe + 長さ変更モード時は赤色）
// =========================================================
window.__CR_setSelectedConnectorHighlight = function (mesh) {
  const prev = window.__CR_SELECTED_CONNECTOR_MESH__;
  if (prev && prev.material) {
    const mats = Array.isArray(prev.material) ? prev.material : [prev.material];
    for (const m of mats) {
      if (!m) continue;
      m.wireframe = false;
      m.needsUpdate = true;
    }
    // 長さ変更モード時の色を戻す
    if (prev.userData && prev.userData.__cr_lengthModeOrigColor != null) {
      const mats = Array.isArray(prev.material) ? prev.material : [prev.material];
      for (const m of mats) {
        if (!m || !m.color) continue;
        m.color.setHex(prev.userData.__cr_lengthModeOrigColor);
        if (m.emissive && prev.userData.__cr_lengthModeOrigEmissive != null) {
          m.emissive.setHex(prev.userData.__cr_lengthModeOrigEmissive);
          m.emissiveIntensity = 0;
        }
        if (prev.userData.__cr_lengthModeOrigWireframe != null) {
          m.wireframe = prev.userData.__cr_lengthModeOrigWireframe;
        }
        m.needsUpdate = true;
      }
      prev.userData.__cr_lengthModeOrigColor = null;
      prev.userData.__cr_lengthModeOrigEmissive = null;
      prev.userData.__cr_lengthModeOrigWireframe = null;
    }
    // 通常モード時の色を戻す
    if (prev.userData && prev.userData.__cr_normalModeOrigColor != null) {
      const mats = Array.isArray(prev.material) ? prev.material : [prev.material];
      for (const m of mats) {
        if (!m || !m.color) continue;
        m.color.setHex(prev.userData.__cr_normalModeOrigColor);
        if (m.emissive && prev.userData.__cr_normalModeOrigEmissive != null) {
          m.emissive.setHex(prev.userData.__cr_normalModeOrigEmissive);
          m.emissiveIntensity = 0;
        }
        if (prev.userData.__cr_normalModeOrigWireframe != null) {
          m.wireframe = prev.userData.__cr_normalModeOrigWireframe;
        }
        m.needsUpdate = true;
      }
      prev.userData.__cr_normalModeOrigColor = null;
      prev.userData.__cr_normalModeOrigEmissive = null;
      prev.userData.__cr_normalModeOrigWireframe = null;
    }
  }

  window.__CR_SELECTED_CONNECTOR_MESH__ = mesh || null;

  if (!mesh || !mesh.material) return;

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    if (!m) continue;
    
    // 長さ変更モードONの時はwireframeを無効にして黄色の発光にする
    if (window.isLengthEditModeOn && m.color) {
      if (!mesh.userData) mesh.userData = {};
      // 元の色、emissive、wireframe状態を保存（初回のみ）
      if (mesh.userData.__cr_lengthModeOrigColor == null) {
        mesh.userData.__cr_lengthModeOrigColor = m.color.getHex();
        mesh.userData.__cr_lengthModeOrigEmissive = m.emissive ? m.emissive.getHex() : 0x000000;
        mesh.userData.__cr_lengthModeOrigWireframe = m.wireframe;
      }
      // wireframeを無効にして通常表示で発光するような赤色にする
      m.wireframe = false;
      m.color.setHex(0xef4444); // 赤色
      if (m.emissive) {
        m.emissive.setHex(0xef4444); // 赤色の発光
        m.emissiveIntensity = 1.2; // 明るい発光強度
      }
      m.needsUpdate = true;
    } else {
      // 通常時も赤色の発光にする
      if (!mesh.userData) mesh.userData = {};
      if (mesh.userData.__cr_normalModeOrigColor == null) {
        mesh.userData.__cr_normalModeOrigColor = m.color.getHex();
        mesh.userData.__cr_normalModeOrigEmissive = m.emissive ? m.emissive.getHex() : 0x000000;
        mesh.userData.__cr_normalModeOrigWireframe = m.wireframe;
      }
      m.wireframe = false;
      m.color.setHex(0xef4444); // 赤色
      if (m.emissive) {
        m.emissive.setHex(0xef4444); // 赤色の発光
        m.emissiveIntensity = 1.2; // 明るい発光強度
      }
      m.needsUpdate = true;
    }
  }
};

// =========================================================
// 2. パーツマスタ & 価格テーブル
// =========================================================

const PART_DEFS = {
  jointBall: { name: "ジョイントボール" },
  beam: { name: "ビーム（横棒）" },
  pole: { name: "ポール（縦棒）" },
};

const PRICE_TABLE = {
  jointBall: 600,
  beam: {
    25: 380,
    50: 420,
    100: 470,
    150: 470,
    200: 500,
    300: 580,
    400: 680,
    600: 800,
    800: 930,
  },
  pole: {
    50: 410,
    100: 470,
    200: 500,
    300: 580,
    400: 680,
    500: 750,
    600: 800,
    800: 930,
  },
};

const COMPONENT_PRICE_TABLE = {
  jointBall: 600,
  jointCap: 150,
  topCap: 70,
  sideCap: 50,
  legBoss: 370,
  leg: 320,
  m5Screw: 30,
  beamNut: 70,
};

const GRID = 200;

// =========================================================
// 実寸キャリブレーション用テーブル（あとから編集しやすくまとめて定義）
// =========================================================

// 見積関連の定数と関数は js/features/estimate.js に移動済み
// REAL_DIM, REAL_RADIUS, REAL_STACK, CENTER_TO_TOPCAP は window 経由でアクセス可能
// getRealBeamLength, getRealPoleLength は window 経由でアクセス可能

// =========================================================
// データ構造は js/state/state.js に移動済み
// - joints, jointMeshes, beams, poles, legs
// - selectedJointIndex, customOrderBeams
// =========================================================

// showBeamLength は js/state/state.js で定義済み
// window経由でアクセス可能

// MATERIAL_COLOR は js/core/materials.js で定義済み
// window経由でアクセス可能

// ================================
// 現在の材種（暫定）
// - UI導入までは手動で window.__CR_CURRENT_MATERIAL__ を変えてテストする
// ================================
// 材質関連の関数は js/core/materials.js に移動済み
// - getCurrentMaterial, getPartTypeMaterial, setPartTypeMaterial
// - applyMaterialFinish, applyMaterialColorToMesh
// window経由でアクセス可能
// ================================

// =========================================================
// JointSet材質UI（小物材質を統合）
// =========================================================
function initSmallPartsMaterialUI() {
  const sel = document.getElementById("mat-jointSet");
  const btnApply = document.getElementById("mat-apply-jointSet");
  const btnApplyAll = document.getElementById("mat-apply-all-jointSet");

  if (!sel || !btnApply || !btnApplyAll) return;

  // 二重登録防止
  if (sel.__matBound) return;
  sel.__matBound = btnApply.__matBound = btnApplyAll.__matBound = true;

  // JointSetに含まれるパーツタイプ
  const jointSetTypes = ["jointBall", "leg", "jointCap", "topCap", "sideCap", "beamNut", "m5Screw"];

  // 初期値：既存の材質があればそれを使用、なければIRON
  let initialMat = "IRON";
  try {
    const firstType = jointSetTypes[0];
    initialMat = getPartTypeMaterial(firstType);
  } catch {}
  sel.value = initialMat;

  // 材質をJointSetのすべてのパーツタイプに適用する関数
  function applyMaterialToJointSet(mat) {
    const normalizedMat = normalizeMaterial(mat || "IRON");
    
    for (const type of jointSetTypes) {
      setPartTypeMaterial(type, normalizedMat);
    }

    // 見積/部材明細更新（A1）
    try { calcAndRenderEstimate?.(); } catch {}
    try { requestEstimateRender?.("jointSet material changed"); } catch {}

    // ★B1：3D反映は「メッシュがあるものだけ」（jointBall/leg）
    // ★D1：最終適用は reapplyConnectorVisuals に寄せる
    try { window.reapplyConnectorVisuals?.("jointSet material changed"); } catch {}
  }

  // 「適用」ボタン：材質適用モードのトグル（Beam/Poleと同じ動作）
  btnApply.addEventListener("click", () => {
    // トグル動作：JointSet材質適用モードのON/OFF
    const isActive = !!window.__CR_JOINTSET_MATERIAL_APPLY_MODE__;
    
    if (isActive) {
      // モード解除
      window.__CR_JOINTSET_MATERIAL_APPLY_MODE__ = false;
      btnApply.classList.remove("btn-primary");
      btnApply.classList.add("btn-secondary");
      btnApply.textContent = "適用";
      
      // プレビューを非表示
      hidePreview?.();
      hideLegPreview?.();
    } else {
      // モード有効化
      window.__CR_JOINTSET_MATERIAL_APPLY_MODE__ = true;
      btnApply.classList.remove("btn-secondary");
      btnApply.classList.add("btn-primary");
      btnApply.textContent = "適用中";
      
      // プレビューを非表示
      hidePreview?.();
      hideLegPreview?.();
    }
  });

  // 「全適用」ボタン：選択中の材質を即座にすべてに適用
  btnApplyAll.addEventListener("click", () => {
    applyMaterialToJointSet(sel.value);
  });
}

// =========================================================
// 材質関連の関数は js/core/materials.js に移動済み
// - applyMaterialFinish, applyMaterialColorToMesh
// window経由でアクセス可能
// =========================================================

// =========================================================
// D1対応：最終表示の再適用（ColorChart優先／OFFで材質色へ復帰）
// ※重要：isColorChartOn はローカル変数が正本なので、それを優先参照する
// =========================================================
window.reapplyConnectorVisuals = function (reason = "unknown") {
  // JointSet材質適用モード中は、ColorChartがONでも材質色を優先
  if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
    window.applyMaterialColorToAllConnectors?.();
    return;
  }
  
  if (window.isColorChartOn) {
    window.applyColorChartToAllConnectors?.();
  } else {
    // ★OFF時：Beam/Poleだけでなく小物も含めて材質色へ
    window.applyMaterialColorToAllConnectors?.();
  }
};

// ★ColorChart OFF時に「材質色へ戻す」ための関数（Beam/Poleの個体材質のみ先に対応）
window.applyMaterialColorToAllConnectors = function () {
  // 長さ変更モードONの時は選択中のコネクタを取得してスキップする
  const selectedMesh = window.__CR_SELECTED_CONNECTOR_MESH__;
  
  // --------------------
  // Beam / Pole（個体材質）
  // --------------------
  if (Array.isArray(window.beams)) {
    for (const b of window.beams) {
      if (!b || !b.mesh) continue;
      // 長さ変更モードONの時、選択中のコネクタはスキップ
      if (window.isLengthEditModeOn && b.mesh === selectedMesh) continue;
      applyMaterialColorToMesh(b.mesh, b.material);
    }
  }
  if (Array.isArray(window.poles)) {
    for (const p of window.poles) {
      if (!p || !p.mesh) continue;
      // 長さ変更モードONの時、選択中のコネクタはスキップ
      if (window.isLengthEditModeOn && p.mesh === selectedMesh) continue;
      applyMaterialColorToMesh(p.mesh, p.material);
    }
  }

  // --------------------
  // A1 小物（種類ごと一括材質：materialByPartType）
  // --------------------
  const matJointBall = getPartTypeMaterial?.("jointBall") || "IRON";
  const matLeg       = getPartTypeMaterial?.("leg") || "IRON";

  // JointBall：jointMeshes を塗る（選択中は setSelectedJoint が上書きするので解除時に戻る）
  if (Array.isArray(window.jointMeshes)) {
    for (const jm of window.jointMeshes) {
      if (!jm) continue;
      applyMaterialColorToMesh(jm, matJointBall);
    }
  }

  // Leg：legs[].mesh を塗る（legMeshes が無い環境でも動く）
  if (Array.isArray(window.legs)) {
    for (const lg of window.legs) {
      if (!lg || !lg.mesh) continue;
      applyMaterialColorToMesh(lg.mesh, matLeg);
    }
  }
};

// ==========================================
// カラーチャート用グローバル
// ==========================================

// 長さ → 色 を決める関数
function getColorForLength(lengthMm) {
  if (!lengthMm || !isFinite(lengthMm)) {
    return new THREE.Color(0.8, 0.8, 0.8); // 未設定 → グレー
  }

  const minL = 50;
  const maxL = 800;
  const t = Math.max(0, Math.min(1, (lengthMm - minL) / (maxL - minL)));

  // 青 → 緑 → 赤 のグラデーション
  const h = (0.7 - 0.7 * t);
  const s = 0.9;
  const v = 0.9;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const r = v * (1 - (1 - f) * s);

  let r1, g1, b1;
  switch (i % 6) {
    case 0: r1 = v; g1 = r; b1 = p; break;
    case 1: r1 = q; g1 = v; b1 = p; break;
    case 2: r1 = p; g1 = v; b1 = r; break;
    case 3: r1 = p; g1 = q; b1 = v; break;
    case 4: r1 = r; g1 = p; b1 = v; break;
    case 5: r1 = v; g1 = p; b1 = q; break;
  }

  return new THREE.Color(r1, g1, b1);
}


// =========================================================
// 3.5 スナップショット
// =========================================================

// clearAllMeshes は js/core/mesh.js に移動済み
// window経由でアクセス可能


// ファイル操作関連の関数は js/features/file.js に移動済み
// - createSnapshot, applySnapshotFromString
// window経由でアクセス可能

// Undo/Redo機能は js/features/history.js に移動済み
// saveHistory, undo, loadHistory, redo は window 経由でアクセス可能

// =========================================================
// 4. Three.js セットアップ & グリッド
// =========================================================

// =========================================================
// 3Dシーン初期化は js/core/scene.js に移動済み
// - scene, rackGroup, camera, renderer, controls
// - raycaster, mouse, viewEl
// =========================================================

// =======================================
// 3Dビュー クリック処理
// =======================================
if (!window.viewEl) {
  console.error("[main] window.viewEl is not defined. Make sure js/core/scene.js is loaded.");
} else {
  window.viewEl.addEventListener("click", (e) => {
  // 0) ドラッグ直後の誤クリック防止
  if (window.didDrag) {
    window.didDrag = false;
    return;
  }

  // Raycaster 用の座標に変換
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

   // --------------------------------------------------
  // ① Alt + クリック → ビーム / ポール / ジョイント削除
  // --------------------------------------------------
  if (e.altKey) {
    hideLegPreview();

    const connectorMeshes = [
      ...beams.map((b) => b.mesh),
      ...poles.map((p) => p.mesh),
    ];

    // 子メッシュまで対象にする
    const hitConnector = raycaster.intersectObjects(connectorMeshes, true);

    if (hitConnector.length > 0) {
      // ★ 子メッシュごと deleteConnectorByMesh に渡す
      deleteConnectorByMesh(hitConnector[0].object);
      hidePreview();
      return;
    }

    // ここに来たらコネクタに当たっていない → ジョイント削除
    const hitJoints = raycaster.intersectObjects(jointMeshes);
    if (hitJoints.length > 0) {
      const idx = jointMeshes.indexOf(hitJoints[0].object);
      if (idx !== -1) {
        deleteJoint(idx);
        hidePreview();
      }
    }
    return;
  }

  // （この下に Shift+クリック や プレビュー確定、ジョイント選択の処理が続く）


  // --------------------------------------------------
  // ② Shift + クリック → 脚 ON / OFF
  // --------------------------------------------------
  if (e.shiftKey) {
    const idx = pickJointIndexByClientPos(e.clientX, e.clientY, 24);
    if (idx !== -1) {
      // JointSet材質適用モードが有効な場合はLegの材質も適用
      if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
        const sel = document.getElementById("mat-jointSet");
        const mat = normalizeMaterial(sel?.value || "IRON");
        setPartTypeMaterial("leg", mat);
        
        // 見積/部材明細更新
        try { calcAndRenderEstimate?.(); } catch {}
        try { requestEstimateRender?.("jointSet material applied to leg"); } catch {}
        
        // 3D反映
        try { window.reapplyConnectorVisuals?.("jointSet material applied to leg"); } catch {}
      }
      
      toggleLegForJoint(idx);
      hidePreview();
    }
    return;
  }

    // --------------------------------------------------
  // ②.6 通常クリック：ジョイント選択の吸着を最優先
  //  - 選択中ジョイント付近だけ「確定」を許可
  //  - それ以外の場所クリックは「ジョイント選択」にする
  // --------------------------------------------------
  if (!e.altKey && !e.shiftKey && !window.isConnectModeOn && !window.isLengthEditModeOn) {
    const nearIdx = pickJointIndexByClientPos(e.clientX, e.clientY, 28);

    if (nearIdx !== -1) {
      // 現在の選択ジョイントを取得（環境差の保険）
      const curSel =
        (typeof selectedJointIndex !== "undefined")
          ? selectedJointIndex
          : (typeof window.selectedJointIndex !== "undefined" ? window.selectedJointIndex : -1);

      // ★「選択ジョイント付近以外」をクリックした場合は、確定へ行かず選択だけで終了
      if (curSel !== nearIdx) {
        setSelectedJoint(nearIdx);
        hidePreview?.();
        hideLegPreview?.();
        return;
      }
      // curSel === nearIdx のときだけ、この後の既存「プレビュー確定」ロジックへ進む
    }
  }

// --------------------------------------------------
// ③.00 接続モード最優先（プレビュー確定より先に奪う）
//   ※接続処理は mousedown 側に一本化したので、click 側は二重処理防止のため無効化
// --------------------------------------------------
if (window.isConnectModeOn) {
  // ここで click を止めないと、他の click 確定処理やプレビュー確定が走る可能性がある
  hidePreview?.();
  hideLegPreview?.();
  resetHighlight?.();
  return;
}


  // --------------------------------------------------
  // ③ プレビュー線が出ている場合 → パーツ確定
  // --------------------------------------------------
  if (window.previewTargetPos && selectedJointIndex !== null) {

    const basePos = joints[selectedJointIndex];
    if (!basePos) {
      hidePreview();
      return;
    }

    // このクリック時点でのオーダー状態を確定（Beam/Pole 共通）
    const isCustomNow = !!window.isOrderModeOn;

    // orderLenNow は currentOrderLengthMm を信用せず、UIから直接読む（確定時点の値）
    let orderLenNow = null;
    {
      const ui = (typeof getUI === "function") ? getUI() : null;
      const v = parseInt(String(ui?.orderLengthInput?.value || "").trim(), 10);
      if (Number.isFinite(v) && v > 0) orderLenNow = v;
    }

    // ★ 確定に使うターゲット座標（通常＝プレビュー、オーダー時だけ長さ補正）
    let finalTargetPos = window.previewTargetPos;

    if (isCustomNow && typeof orderLenNow === "number" && orderLenNow > 0) {
      const dir = new THREE.Vector3(
        window.previewTargetPos.x - basePos.x,
        window.previewTargetPos.y - basePos.y,
        window.previewTargetPos.z - basePos.z
      );

      // 方向ベクトルがゼロに近い場合は補正しない
      if (dir.length() > 1e-6) {
        dir.normalize().multiplyScalar(orderLenNow);
        finalTargetPos = {
          x: basePos.x + dir.x,
          y: basePos.y + dir.y,
          z: basePos.z + dir.z,
        };
      }
    }

    // 干渉チェック（※ previewTargetPos ではなく finalTargetPos で判定）
    if (
      isPointInsideExistingConnector(finalTargetPos) ||
      isSegmentOverlappingExisting(basePos, finalTargetPos, window.currentPartType) ||
      doesSegmentPassThroughJoint(basePos, finalTargetPos, window.currentPartType)
    ) {
      alert("途中にジョイントボールがあるため、その上をまたいでパーツを置くことはできません。");
      hidePreview();
      return;
    }

    // 既存ジョイントか、新規作成か（※ finalTargetPos）
    const existingIndex = findJointIndexAt(finalTargetPos);

    // ★長さ変更モード中は「確定クリック」で何も作らない（＋選択解除）
    if (window.isLengthEditModeOn) {
      if (typeof selectedJointIndex !== "undefined") selectedJointIndex = -1;
      try { window.setSelectedJointIndex?.(-1); } catch (e) {}
      try { window.clearJointSelection?.(); } catch (e) {}
      try { window.updateSelectedJointVisual?.(); } catch (e) {}
      hidePreview?.();
      hideLegPreview?.();
      return;
    }

    const targetIndex =
      existingIndex !== -1 ? existingIndex : createJoint(finalTargetPos);

// ==============================
// A) ビーム or ポール追加（確定）
// ==============================
// 材質適用モード中は新規生成を無効化
if (!window.isConnectModeOn && !window.isLengthEditModeOn && !window.__CR_MATERIAL_APPLY_MODE__) {

  // window.currentPartType を使用（UIと同期済み）
  var uiPartType = window.currentPartType || "beam";

  var from = selectedJointIndex;
  var to = targetIndex;

  if (typeof from !== "number" || from < 0 || typeof to !== "number" || to < 0) {
    console.warn("[add] invalid joint index", { from: from, to: to });
  } else {

    var didCreateSomething = false;

    if (uiPartType === "beam") {

      var existsBeam = false;
      if (typeof hasBeamBetween === "function") {
        existsBeam = !!hasBeamBetween(from, to);
      }

      if (!existsBeam && typeof addBeamConnection === "function") {
        addBeamConnection(from, to);
        didCreateSomething = true;
      }

    } else {
      // pole
      var existsPole = false;
      if (Array.isArray(poles)) {
        existsPole = poles.some(function (p) {
          return !!p && (
            (p.a === from && p.b === to) ||
            (p.a === to && p.b === from)
          );
        });
      }

      if (!existsPole && typeof addPoleConnection === "function") {
        addPoleConnection(from, to);
        didCreateSomething = true;
      }
    }

    if (didCreateSomething) {
      // window.currentPartType を正本として使用（既に uiPartType で設定済み）
      window.currentPartType = uiPartType;

      if (window.callIfExists) window.callIfExists("reapplyConnectorVisuals", "after add connector");
      if (typeof requestEstimateRender === "function") requestEstimateRender("after add connector");
      if (window.callIfExists) window.callIfExists("saveHistory", "add " + uiPartType);

      if (typeof setSelectedJoint === "function") setSelectedJoint(targetIndex);
      if (typeof hidePreview === "function") hidePreview();
      if (typeof hideLegPreview === "function") hideLegPreview();
      return; // ★ click をここで確実に終了
    }
  }
}
  }

  // --------------------------------------------------
  // ③.25 接続モード → Joint を選んで接続（ここはイベントハンドラ内）
  // --------------------------------------------------
  if (window.isConnectModeOn) {
    // 接続モード中は通常処理に流さない
    console.log("[connect] mode ON hit-test start");

    // Joint の当たり判定（jointPickTargets が無い環境もあるのでフォールバック）
    const jointTargets =
      (typeof jointPickTargets !== "undefined" &&
        Array.isArray(jointPickTargets) &&
        jointPickTargets.length)
        ? jointPickTargets
        : (Array.isArray(window.jointMeshes) ? window.jointMeshes.filter(Boolean) : 
           (Array.isArray(jointMeshes) ? jointMeshes.filter(Boolean) : []));

    const hitJ = raycaster.intersectObjects(jointTargets, true);
    console.log("[connect/diag] intersect@2605", { win: window.isConnectModeOn, hitLen: hitJ.length });

    if (hitJ.length > 0) {
      // 子メッシュ対策：親を辿って jointIndex を拾う
      let o = hitJ[0].object;
      let jIdx = null;

      while (o) {
        if (
          o.userData &&
          o.userData.type === "joint" &&
          typeof o.userData.jointIndex === "number"
        ) {
          jIdx = o.userData.jointIndex;
          break;
        }
        o = o.parent;
      }

      // userData が無い場合の最終フォールバック（mesh配列から逆引き）
      if (jIdx == null) {
        const root = hitJ[0].object;
        const idx = (Array.isArray(window.jointMeshes) ? window.jointMeshes.findIndex((m) => m === root) : -1) ||
                    (Array.isArray(jointMeshes) ? jointMeshes.findIndex((m) => m === root) : -1);
        if (idx >= 0) jIdx = idx;
      }

      if (typeof jIdx === "number" && jIdx >= 0) {
        // 1回目：接続元を確定
        if (connectFromJointIndex == null) {
          connectFromJointIndex = jIdx;

          // 見た目で分かるように強調（どちらか存在する方だけ動けばOK）
          if (typeof highlightConnectFromJoint === "function") {
            highlightConnectFromJoint(jIdx);
          }
          if (typeof debugMarkJoint === "function") {
            debugMarkJoint(jIdx);
          }

          hidePreview?.();
          hideLegPreview?.();
          console.log("[connect] from joint", jIdx);
          return; // ★ここで通常選択へ行かない
        }

        // 2回目：同じ場所を押したら解除
        if (connectFromJointIndex === jIdx) {
          clearConnectFromHighlight?.();
          connectFromJointIndex = null;
          hidePreview?.();
          hideLegPreview?.();
          console.log("[connect] canceled (same joint)");
          return;
        }

        // 2回目：接続確定
        const from = connectFromJointIndex;
        const to = jIdx;

        clearConnectFromHighlight?.();
        connectFromJointIndex = null;

        console.log("[connect] link", { from, to });

        // ★履歴
        if (window.callIfExists) window.callIfExists("saveHistory");

        // ★生成
        const ok = createConnectorBetweenJoints(from, to);
        console.log("[connect] createConnectorBetweenJoints ok =", ok);

        if (ok) {
          normalizeCustomFlagsByActualLength?.();
          calcAndRenderEstimate?.();
          applyColorChartToAllConnectors?.();
        }

        hidePreview?.();
        hideLegPreview?.();
        return; // ★Beam/Pole 選択へ行かない
      }
    }

    // 接続モード中、ジョイントに当たらなかったクリックは何もしない
    hidePreview?.();
    hideLegPreview?.();
    return;
  }

  // --------------------------------------------------
  // ③.5 プレビューが無い場合 → Beam / Pole 選択
  //   ★ 通常（パーツ追加）では誤選択を防ぐため無効
  //   ★ 長さ変更モードのとき、または材質適用モードのとき有効化する
  // --------------------------------------------------
  {
    // 長さ変更モード判定（環境差を吸収）
    let lengthModeOn = false;
    try {
      lengthModeOn =
        !!window.isLengthEditModeOn ||
        !!window.isLengthEditMode ||
        !!window.isEditLengthMode ||
        !!window.isLengthModeOn ||
        !!window.isLengthMode;
    } catch (e) {}

    // 材質適用モードが有効な場合もBeam/Pole選択を有効化
    const materialApplyModeOn = !!window.__CR_MATERIAL_APPLY_MODE__;

    // 接続モード中はここに来ない設計だが、安全のため抑止
    // 材質適用モードが有効な場合は長さ変更モードでなくてもBeam/Pole選択を有効化
    if (!window.isConnectModeOn && (lengthModeOn || materialApplyModeOn)) {
      const connectorMeshes = [
        ...beams.map((b) => b.mesh).filter(Boolean),
        ...poles.map((p) => p.mesh).filter(Boolean),
      ];

      const hitConn = raycaster.intersectObjects(connectorMeshes, true);
      if (hitConn.length > 0) {
        // 子メッシュを拾うので親を辿って beams/poles の mesh 本体を探す
        let o = hitConn[0].object;
        while (o) {
          const bIdx = beams.findIndex((b) => b.mesh === o);
          if (bIdx !== -1) {
            selectedConnector = { type: "beam", index: bIdx };
            window.__CR_setSelectedConnectorHighlight?.(beams?.[bIdx]?.mesh);

            // 材質適用モードが有効な場合は自動的に材質を適用
            if (window.__CR_MATERIAL_APPLY_MODE__) {
              const mat = normalizeMaterial(
                document.getElementById("material-select")?.value || 
                window.__CR_CURRENT_MATERIAL__ || 
                "IRON"
              );
              const ok = applyMaterialToConnector("beam", bIdx, mat);
              if (ok) {
                afterMaterialChange("apply material to clicked beam");
                // 材質適用モードは維持（複数パーツに適用できるようにする）
              }
            }

console.log("[select] beam", selectedConnector);

// ★見た目の最終適用（ColorChart優先／OFFなら材質色へ復帰）
window.reapplyConnectorVisuals?.("select beam");

// ★長さ変更モードONの時は選択ハイライトを再適用
if (window.isLengthEditModeOn && beams?.[bIdx]?.mesh) {
  window.__CR_setSelectedConnectorHighlight?.(beams[bIdx].mesh);
}

// ★正本UI更新
window.updateSelectedConnectorUI?.();

// ★保険：UI未実装環境向けにlen-beforeだけは維持
try {
  const len = getSelectedConnectorLengthMm?.();
  const el = document.getElementById("len-before");
  if (el) el.value = (len ?? "");
} catch (_) {}

return;
          }

          const pIdx = poles.findIndex((p) => p.mesh === o);
          if (pIdx !== -1) {
            selectedConnector = { type: "pole", index: pIdx };
            window.__CR_setSelectedConnectorHighlight?.(poles?.[pIdx]?.mesh);

            // 材質適用モードが有効な場合は自動的に材質を適用
            if (window.__CR_MATERIAL_APPLY_MODE__) {
              const mat = normalizeMaterial(
                document.getElementById("material-select")?.value || 
                window.__CR_CURRENT_MATERIAL__ || 
                "IRON"
              );
              const ok = applyMaterialToConnector("pole", pIdx, mat);
              if (ok) {
                afterMaterialChange("apply material to clicked pole");
                // 材質適用モードは維持（複数パーツに適用できるようにする）
              }
            }

console.log("[select] pole", selectedConnector);

// ★見た目の最終適用（ColorChart優先／OFFなら材質色へ復帰）
window.reapplyConnectorVisuals?.("select pole");

// ★長さ変更モードONの時は選択ハイライトを再適用
if (window.isLengthEditModeOn && poles?.[pIdx]?.mesh) {
  window.__CR_setSelectedConnectorHighlight?.(poles[pIdx].mesh);
}

// ★正本UI更新
window.updateSelectedConnectorUI?.();

// ★保険：UI未実装環境向けにlen-beforeだけは維持
try {
  const len = getSelectedConnectorLengthMm?.();
  const el = document.getElementById("len-before");
  if (el) el.value = (len ?? "");
} catch (_) {}

return;

          }

          o = o.parent;
        }
      }
    }

    // 通常時は Beam/Pole を拾わず、後段の Joint 選択（④）へ流す
  }

  // --------------------------------------------------
  // ④ プレビューが無い場合 → ジョイント選択
  // --------------------------------------------------
  const jointTargets = (Array.isArray(window.jointMeshes) ? window.jointMeshes.filter(Boolean) : 
                         (Array.isArray(jointMeshes) ? jointMeshes.filter(Boolean) : []));
  const hitJoints = raycaster.intersectObjects(jointTargets);
  if (hitJoints.length > 0) {
    const mesh = hitJoints[0].object;
    const idx = (Array.isArray(window.jointMeshes) ? window.jointMeshes.indexOf(mesh) : -1) ||
                (Array.isArray(jointMeshes) ? jointMeshes.indexOf(mesh) : -1);
    if (idx !== -1) {
      // JointSet材質適用モードが有効な場合は自動的に材質を適用
      if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
        // ダブルクリック防止：最後のクリック時刻を記録
        const now = Date.now();
        if (!window.__CR_LAST_JOINT_CLICK_TIME__) window.__CR_LAST_JOINT_CLICK_TIME__ = 0;
        const timeSinceLastClick = now - window.__CR_LAST_JOINT_CLICK_TIME__;
        window.__CR_LAST_JOINT_CLICK_TIME__ = now;
        
        // ダブルクリック（300ms以内）の場合は全適用を実行しない
        if (timeSinceLastClick < 300) {
          // ダブルクリックを無視（全適用を実行しない）
          setSelectedJoint(idx);
          hidePreview?.();
          hideLegPreview?.();
          return;
        }
        
        const sel = document.getElementById("mat-jointSet");
        const mat = (typeof window.normalizeMaterial === "function" ? window.normalizeMaterial : normalizeMaterial)(sel?.value || "IRON");
        if (typeof window.setPartTypeMaterial === "function") {
          window.setPartTypeMaterial("jointBall", mat);
        } else if (typeof setPartTypeMaterial === "function") {
          setPartTypeMaterial("jointBall", mat);
        }
        
        // 見積/部材明細更新
        try { calcAndRenderEstimate?.(); } catch {}
        try { requestEstimateRender?.("jointSet material applied to joint"); } catch {}
        
        // クリックしたJointBallに材質色を適用（setSelectedJointの前に実行）
        const applyMat = typeof window.applyMaterialColorToMesh === "function" 
          ? window.applyMaterialColorToMesh 
          : (typeof applyMaterialColorToMesh === "function" ? applyMaterialColorToMesh : null);
        
        if (applyMat) {
          const clickedMesh = (Array.isArray(window.jointMeshes) ? window.jointMeshes[idx] : null) ||
                              (Array.isArray(jointMeshes) ? jointMeshes[idx] : null);
          if (clickedMesh) {
            // クリックしたJointBallに材質色を適用
            applyMat(clickedMesh, mat);
            // デバッグ用（必要に応じてコメントアウト）
            // console.log("[JointSet] Applied material", mat, "to joint", idx);
          }
        }
      }
      
      setSelectedJoint(idx);
      
      // JointSet材質適用モード中は、setSelectedJointの後に材質色と選択色を再適用
      if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
        const sel = document.getElementById("mat-jointSet");
        const mat = (typeof window.normalizeMaterial === "function" ? window.normalizeMaterial : normalizeMaterial)(sel?.value || "IRON");
        const clickedMesh = (Array.isArray(window.jointMeshes) ? window.jointMeshes[idx] : null) ||
                            (Array.isArray(jointMeshes) ? jointMeshes[idx] : null);
        if (clickedMesh) {
          // 材質色を再適用（setSelectedJoint内で適用されたが、確実にするため）
          const applyMat = typeof window.applyMaterialColorToMesh === "function" 
            ? window.applyMaterialColorToMesh 
            : (typeof applyMaterialColorToMesh === "function" ? applyMaterialColorToMesh : null);
          if (applyMat) {
            applyMat(clickedMesh, mat);
          }
          
          // 選択色（明るい発光黄色のemissive）を適用
          const mats = Array.isArray(clickedMesh.material) ? clickedMesh.material : [clickedMesh.material];
          for (const m of mats) {
            if (!m) continue;
            if (m.emissive && typeof m.emissive.setHex === "function") m.emissive.setHex(0xef4444);
            if (m.color && typeof m.color.setHex === "function") m.color.setHex(0xef4444);
            if (typeof m.emissiveIntensity === "number") m.emissiveIntensity = 1.2;
            m.needsUpdate = true;
          }
        }
      }
      hidePreview?.();
      hideLegPreview?.();
    }
  }
});
}


// 回転・パン・ズームは OrbitControls に任せる
controls.enableRotate = true;
controls.enablePan = true;     // ← パンを有効化
controls.enableZoom = true;
controls.screenSpacePanning = true;

// ★ マウスボタン割り当て
//   左ボタン：何もしない（アプリ側でクリック確定に使う）
//   中ボタン：回転
//   右ボタン：パン（水平移動）
controls.mouseButtons = {
  LEFT: THREE.MOUSE.NONE,
  MIDDLE: THREE.MOUSE.ROTATE,
  RIGHT: THREE.MOUSE.PAN,
};

controls.update();

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(1, 2, 1);
scene.add(dirLight);

const GRID_SIZE = 30000;

const grid200 = new THREE.GridHelper(
  GRID_SIZE,
  GRID_SIZE / 200,
  0x444444,
  0x444444
);
grid200.position.y = 0;
setGridMaterial(grid200, 0.18);  // ★ 透明度を設定
scene.add(grid200);

const grid100 = new THREE.GridHelper(
  GRID_SIZE,
  GRID_SIZE / 100,
  0x777777,
  0x777777
);
grid100.position.y = 0.001;
setGridMaterial(grid100, 0.16);  // ★ 少しだけ薄く
scene.add(grid100);

const grid50 = new THREE.GridHelper(
  GRID_SIZE,
  GRID_SIZE / 50,
  0xaaaaaa,
  0xaaaaaa
);
grid50.position.y = 0.002;
setGridMaterial(grid50, 0.12);   // ★ さらに薄く
scene.add(grid50);

// ★ グリッド生成が終わったので、ここで一度だけ状態反映
if (typeof window.updateGridVisibility === "function") {
  window.updateGridVisibility();
}

const grid25 = new THREE.GridHelper(
  GRID_SIZE,
  GRID_SIZE / 25,
  0xcccccc,
  0xcccccc
);
grid25.position.y = 0.003;
setGridMaterial(grid25, 0.08);   // ★ 一番薄く
scene.add(grid25);

// =========================================
// 左ドラッグで「ラックの島（クラスター）」を移動させる
// =========================================

// pointer 系イベントで raycaster を更新（既にあるならそれを使う）
function updateRaycasterFromPointerEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

// 磁石スナップ（座標をグリッドに吸着）
function snapMagnetCoord(pos, step, magnetRange) {
  const snapped = Math.round(pos / step) * step;
  return Math.abs(snapped - pos) <= magnetRange ? snapped : pos;
}

// ★ クラスタドラッグ開始
renderer.domElement.addEventListener("pointerdown", (e) => {
  console.log("[connect/diag] pointerdown", {
    win: window.isConnectModeOn,
    button: e.button,
    type: e.type,
    isBoardModeOn: window.isBoardModeOn
  });
  console.log("[connect/diag] pointerdown hasRay", {
    hasRaycaster: !!raycaster,
    hasUpdate: (typeof updateRaycasterFromPointerEvent === "function")
  });

  // ================================
  // 板モード最優先（V1.1.1）
  // ================================
  if (window.isBoardModeOn) {
    e.preventDefault();
    e.stopPropagation();

    if (e.button !== 0) return; // 左のみ

    // ジョイントをクリックした場合は4点選択モードに切り替え
    const jointIdx = pickJointIndexByClientPos(e.clientX, e.clientY, 28);
    if (jointIdx !== -1) {
      // 4点選択に追加
      const added = window.addJointToBoardSelection?.(jointIdx);
      if (added) {
        console.log("[board] joint selected for 4-point selection:", jointIdx, "total:", window.selectedJoints4?.length || 0);
        // 4点選択中は自動プレビューを無効化（4点選択完了時にプレビューが表示される）
        return;
      }
    }

    // ジョイント以外をクリックした場合、または4点選択が完了している場合はプレビューから板を追加
    // 4点選択が完了している場合は、その4点でプレビューが表示されているはず
    if (window.previewBoardJ4 && window.previewBoardJ4.length === 4) {
      // プレビューから板を追加（ドラッグ判定はpointerupで行う）
      window.__CR_BOARD_PENDING_ADD__ = true;
      window.__CR_BOARD_MOUSE_DOWN_POS__ = { x: e.clientX, y: e.clientY };
      console.log("[board] pointerdown: __CR_BOARD_PENDING_ADD__ = true", {
        previewJ4: window.previewBoardJ4,
        hasPreview: !!window.previewBoardMesh
      });
    }

    return;
  }

  if (e.button !== 0 || e.altKey) return; // 左のみ + Alt除外

  // v1.0.5+ manual legs: Shift+クリックで手動LEG追加/削除トグル（最優先）
  if (e.shiftKey) {
    try {
      const j = pickJointIndexByClientPos(e.clientX, e.clientY, 20);
      if (typeof j === "number" && j >= 0 && typeof toggleManualLeg === "function") {
        toggleManualLeg(j);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    } catch (err) {
      console.warn("[manual leg] pick failed", err);
    }
  }

  // --------------------------------------------------
  // ★移動モードOFFでも「最後に触ったジョイント」を記録する
  //   - 回転/一括削除の“対象クラスタ”の基準になる
  // --------------------------------------------------
  try {
    const j = pickJointIndexByClientPos(e.clientX, e.clientY, 20);
    if (typeof j === "number" && j >= 0) {
      window.__CR_ACTIVE_JOINT_INDEX__ = j;
      // DBG用（任意）
      // console.log("[ACTIVE] joint =", j);
    }
  } catch (err) {
    console.warn("[ACTIVE] pick failed", err);
  }

    // --------------------------------------------------
  // ★削除モード最優先：MoveMode OFFでも“クリックで削除”できるようにする
  // --------------------------------------------------
  if (window.isDeleteModeOn) {
    const jDel = pickJointIndexByClientPos(e.clientX, e.clientY, 20);
    if (jDel !== -1) {
      e.preventDefault();
      e.stopPropagation();

      // Active を更新してから削除（deleteActiveClusterがactive参照の実装でも動く）
      window.__CR_ACTIVE_JOINT_INDEX__ = jDel;

      // 対象クラスタ削除（あなたの deleteActiveCluster 実装に合わせる）
      // 1) 引数を取る実装なら jointIndex を渡す
      // 2) 引数を取らない実装でも active が更新済みなので動く
      window.deleteActiveCluster?.(jDel);
    }
    return; // 削除モード中は“選択”や“移動開始”へ行かない
  }

  // ================================
  // A) 接続モード最優先（MoveModeの影響を受けない）
  // ================================
  if (window.isConnectModeOn) {
    // ★長さ変更モード中は「接続」を無効化して、選択も残さない
    if (window.isLengthEditModeOn) {
      e.preventDefault();
      e.stopPropagation();

      if (typeof connectFromJointIndex !== "undefined") connectFromJointIndex = null;
      if (typeof clearConnectMarks === "function") clearConnectMarks();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (e.button !== 0) return;

    // pointerdown 時点で raycaster を更新
    updateRaycasterFromPointerEvent(e);

    // Joint を拾う（recursive true）
    const jointTargets =
      typeof jointPickTargets !== "undefined" &&
      Array.isArray(jointPickTargets) &&
      jointPickTargets.length
        ? jointPickTargets
        : (Array.isArray(jointMeshes) ? jointMeshes.filter(Boolean) : 
           (Array.isArray(window.jointMeshes) ? window.jointMeshes.filter(Boolean) : []));

    const hitJ = raycaster.intersectObjects(jointTargets, true);

    let jIdx = -1;

    if (hitJ.length > 0) {
      // userData.jointIndex があるならそれを使う
      let obj = hitJ[0].object;
      while (obj) {
        if (obj.userData && typeof obj.userData.jointIndex === "number") {
          jIdx = obj.userData.jointIndex;
          break;
        }
        obj = obj.parent;
      }

      // フォールバック：jointMeshes から逆引き
      if (jIdx < 0) {
        let o = hitJ[0].object;
        while (o) {
          const idx = (Array.isArray(jointMeshes) ? jointMeshes.indexOf(o) : -1) ||
                      (Array.isArray(window.jointMeshes) ? window.jointMeshes.indexOf(o) : -1);
          if (idx !== -1) {
            jIdx = idx;
            break;
          }
          o = o.parent;
        }
      }
    }

    console.log("[connect/diag] hit(pointerdown)", { hitLen: hitJ.length, jIdx });

    if (typeof jIdx === "number" && jIdx >= 0) {
      // 1点目
      if (connectFromJointIndex == null) {
        connectFromJointIndex = jIdx;

        if (typeof clearConnectMarks === "function") clearConnectMarks();
        if (typeof markConnectPick === "function") {
          markConnectPick(jIdx);
        } else {
          const m = jointMeshes?.[jIdx];
          if (m) {
            if (!m.userData) m.userData = {};
            if (!m.userData._connectMark) {
              m.userData._connectMark = {
                scale: { x: m.scale.x, y: m.scale.y, z: m.scale.z },
                color: m.material && m.material.color ? m.material.color.getHex() : null,
              };
            }
            if (m.material && m.material.color) m.material.color.set(0xff3333);
            m.scale.set(1.35, 1.35, 1.35);
          }
        }

        hidePreview?.();
        hideLegPreview?.();
        console.log("[connect] from joint", jIdx);
        return;
      }

      // 同じ場所 → 解除
      if (connectFromJointIndex === jIdx) {
        connectFromJointIndex = null;
        clearConnectMarks();
        hidePreview?.();
        hideLegPreview?.();
        console.log("[connect] canceled (same joint)");
        return;
      }

      // 2点目 → 生成
      const from = connectFromJointIndex;
      const to = jIdx;

      connectFromJointIndex = null;
      if (typeof clearConnectMarks === "function") clearConnectMarks();

      if (window.callIfExists) window.callIfExists("saveHistory");
      const ok = createConnectorBetweenJoints(from, to);

      if (ok) {
        normalizeCustomFlagsByActualLength?.();
        calcAndRenderEstimate?.();
        applyColorChartToAllConnectors?.();
      }

      hidePreview?.();
      hideLegPreview?.();
      return;
    }

    hidePreview?.();
    hideLegPreview?.();
    return;
  }

  // ================================
  // B) 通常：クラスタ移動（MoveMode ON の時だけ）
  // ================================
  if (!window.isMoveModeOn) return;

  const jointIndex = pickJointIndexByClientPos(e.clientX, e.clientY, 20);
if (jointIndex === -1) return;

// ★削除モード最優先：選択処理に入る前に delete
if (window.isDeleteModeOn) {
  e.preventDefault();
  e.stopPropagation();

  // ★このクリックで「ラック削除確認→削除」
  const ok = window.deleteActiveCluster?.(jointIndex, { confirm: true });

  // 削除モードは維持（連続削除したい場合）
  // 1回でOFFにしたいなら次行を有効化：
  // if (ok) window.setDeleteMode(false);

  // 選択表示が邪魔なら解除
  try { setSelectedJoint?.(null); } catch {}

  return;
}

// ★MoveModeのON/OFFに関係なく「回転対象」を記録（これが無いと回らない）
window.__CR_ACTIVE_JOINT_INDEX__ = jointIndex;

// ★MoveMode OFF のときは「移動ドラッグ開始」だけしない（記録は残す）
if (!window.isMoveModeOn) return;


  if (typeof rebuildJointClusters === "function") rebuildJointClusters();

  const clusterId = jointClusterId?.[jointIndex];
  const cluster =
    clusterId != null && clusterId >= 0 && jointClusters?.[clusterId]
      ? jointClusters[clusterId].joints
      : [jointIndex];

  dragState.active = true;
  dragState.clusterJointIndices = cluster.slice();
  dragState.clusterStartPositions = cluster.map((idx) => {
    const j = joints[idx];
    return { x: j.x, y: j.y, z: j.z };
  });

  if (!dragState.intersection) dragState.intersection = new THREE.Vector3();

  const hitPos = new THREE.Vector3(
    joints[jointIndex].x,
    joints[jointIndex].y,
    joints[jointIndex].z
  );

  const normal = camera.getWorldDirection(new THREE.Vector3()).clone().negate();
  dragState.plane.setFromNormalAndCoplanarPoint(normal, hitPos);

  dragState.intersection.copy(hitPos);
  dragState._dragStartHit = hitPos.clone();

  // pointer capture 安定化：pointerId を保持して解除に使う
  dragState._pointerId = e.pointerId;
  renderer.domElement.setPointerCapture?.(e.pointerId);

  if (typeof controls !== "undefined" && controls) controls.enabled = false;
});

// ★ ドラッグ中
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragState.active || !dragState.clusterJointIndices?.length) return;

  updateRaycasterFromPointerEvent(e);

  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragState.plane, hit)) return;

   // ▼ “開始点からの移動量”
  const dx = hit.x - dragState.intersection.x;
  const dz = hit.z - dragState.intersection.z;

  const STEP = 50;
  const MAGNET = 30;

  dragState.clusterJointIndices.forEach((jIdx, i) => {
    const base = dragState.clusterStartPositions[i];
    const j = joints[jIdx];
    if (!j || !base) return;

    // ★ 絶対座標に対してスナップする（効きやすい）
    const targetX = base.x + dx;
    const targetZ = base.z + dz;

    const snappedX = snapMagnet(targetX, STEP, MAGNET);
    const snappedZ = snapMagnet(targetZ, STEP, MAGNET);

    j.x = snappedX;
    j.y = base.y;      // 高さ固定
    j.z = snappedZ;

    const mesh = jointMeshes?.[jIdx];
    if (mesh) mesh.position.set(j.x, j.y, j.z);
  });

  // 脚追従
  if (Array.isArray(legs)) {
    legs.forEach((leg) => {
      if (!leg || leg.jointIndex == null) return;
      updateLegMeshPosition(leg.jointIndex);
    });
  }

  // ビーム/ポール更新
  beams.forEach((b) => {
    if (!b?.mesh) return;
    const aPos = joints[b.a], bPos = joints[b.b];
    if (!aPos || !bPos) return;
    updateConnectorMesh(b.mesh, aPos, bPos);
  });
  poles.forEach((p) => {
    if (!p?.mesh) return;
    const aPos = joints[p.a], bPos = joints[p.b];
    if (!aPos || !bPos) return;
    updateConnectorMesh(p.mesh, aPos, bPos);
  });
});

// ★ ドラッグ終了
function endClusterDrag() {
  if (!dragState.active) return;

  const pid = dragState._pointerId;
  if (pid != null) {
    renderer?.domElement?.releasePointerCapture?.(pid);
  }
  dragState._pointerId = null;

  dragState._dragStartHit = null;

  dragState.active = false;
  dragState.clusterJointIndices = [];
  dragState.clusterStartPositions = [];

  dragState._lastHit = null;

  if (typeof controls !== "undefined" && controls) controls.enabled = true;

  if (window.callIfExists) window.callIfExists("saveHistory", "move cluster");
  requestEstimateRender("after move cluster");
  applyColorChartToAllConnectors?.();
}

// 板モードのpointerup処理
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!window.isBoardModeOn) return;
  if (e.button !== 0) return; // 左のみ

  // ドラッグ判定（pointerdownとpointerupの位置を比較）
  if (window.__CR_BOARD_MOUSE_DOWN_POS__) {
    const dx = e.clientX - window.__CR_BOARD_MOUSE_DOWN_POS__.x;
    const dy = e.clientY - window.__CR_BOARD_MOUSE_DOWN_POS__.y;
    const moveDist = Math.sqrt(dx * dx + dy * dy);
    
    if (moveDist > 10) {
      console.log("[board] drag detected, cancel", moveDist);
      window.__CR_BOARD_PENDING_ADD__ = false;
      window.__CR_BOARD_MOUSE_DOWN_POS__ = null;
      return;
    }
  }

  // プレビューから板を追加
  if (window.__CR_BOARD_PENDING_ADD__) {
    console.log("[board] adding board from preview (pointerup)");
    window.__CR_BOARD_PENDING_ADD__ = false;
    window.__CR_BOARD_MOUSE_DOWN_POS__ = null;
    
    if (typeof window.addBoardFromPreview === "function") {
      window.addBoardFromPreview();
    } else {
      console.warn("[board] addBoardFromPreview not found");
    }
  }
}, true);

renderer.domElement.addEventListener("pointerup", endClusterDrag);
renderer.domElement.addEventListener("pointerleave", endClusterDrag);
renderer.domElement.addEventListener("pointercancel", endClusterDrag);

// =========================================================
// カメラ距離に応じてグリッドを自動切り替え
// =========================================================
function updateGridVisibilityByDistance() {
  
  // ★ 追加：UIトグルがOFFなら、距離判定より優先して完全非表示
  if (typeof gridEnabled !== "undefined" && !gridEnabled) {
    // GridHelperを全部隠す
    if (typeof scene !== "undefined" && scene) {
      scene.traverse((obj) => {
        if (obj && obj.isGridHelper) obj.visible = false;
      });
    }
    return;
  }

  // ★ 追加：背景写真ONの場合は、距離判定より優先して完全非表示
  if (typeof window.isBackgroundPhotoOn !== "undefined" && window.isBackgroundPhotoOn) {
    // GridHelperを全部隠す
    if (typeof scene !== "undefined" && scene) {
      scene.traverse((obj) => {
        if (obj && obj.isGridHelper) obj.visible = false;
      });
    }
    return;
  }

  // グリッドやカメラがまだ無ければ何もしない
  if (typeof camera === "undefined") return;
  if (typeof grid50 === "undefined" ||
    typeof grid100 === "undefined" ||
    typeof grid200 === "undefined") {
    return;
  }

  // すべて非表示なら「グリッドOFF状態」とみなして何もしない
  const anyVisible = grid50.visible || grid100.visible || grid200.visible;
  if (!anyVisible) {
    return;
  }

  // カメラの原点からの距離（※しっくり来なければ後で調整）
  const dist = camera.position.length();

  // 近いとき：細かいグリッド
  // 中距離：中くらい
  // 遠いとき：粗い
  if (dist < 600) {
    grid50.visible = true;
    grid100.visible = false;
    grid200.visible = false;
  } else if (dist < 1200) {
    grid50.visible = false;
    grid100.visible = true;
    grid200.visible = false;
  } else {
    grid50.visible = false;
    grid100.visible = false;
    grid200.visible = true;
  }
}

// ★ 下の共通関数をどこかに追加（この4つの直前か直後が分かりやすい）
function setGridMaterial(helper, opacity) {
  const mats = Array.isArray(helper.material)
    ? helper.material
    : [helper.material];

  mats.forEach((m) => {
    m.opacity = opacity;
    m.transparent = true;
    m.depthWrite = false;  // 他のオブジェクトの描画に干渉しにくくする
  });
}

// =========================================================
// 5. ジョイント管理
// =========================================================
// findJointIndexAt, createJoint, setSelectedJoint は js/parts/joints.js に移動済み

// =========================================================
// 6. 脚メッシュ
// =========================================================

// 脚関連の定数と関数は js/parts/legs.js に移動済み

// メッシュ破棄関数は js/core/mesh.js に移動済み
// - disposeJointMeshByIndex, disposeBeamMesh, disposePoleMesh, disposeLegMesh
// window経由でアクセス可能

// createLegMeshForJointIndex は js/parts/legs.js に移動済み

function updateLegMeshPosition(jointIndex) {
  const leg = legs.find((l) => l.jointIndex === jointIndex);
  if (leg && leg.mesh) {
    const j = joints[jointIndex];
    const offsetY = LEG_TOTAL_HEIGHT / 2 + jointRadius;
    leg.mesh.position.set(j.x, j.y - offsetY, j.z);
  }
}

// isBottomJoint, hasLegAtJoint, addLegIfNeeded, hideLegPreview, showLegPreview, toggleLegForJoint は js/parts/legs.js に移動済み

// v1.0.5+ manual legs: 手動でLEGを置いた jointIndex を保持
window.manualLegJointSet = window.manualLegJointSet || new Set();

// v1.0.5+ manual legs: 対象ジョイントの直下にPOLEがあるか
function hasPoleBelowJoint(jointIndex) {
  const pj = joints?.[jointIndex];
  if (!pj) return false;
  const arr = (typeof poles !== "undefined" && Array.isArray(poles)) ? poles : (window.poles || []);
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p || p.a == null || p.b == null) continue;
    const ja = joints?.[p.a];
    const jb = joints?.[p.b];
    if (!ja || !jb) continue;
    if (p.a === jointIndex && jb.y < ja.y) return true;
    if (p.b === jointIndex && ja.y < jb.y) return true;
  }
  return false;
}

// v1.0.5+ manual legs: 手動LEGの追加/削除トグル
function toggleManualLeg(jointIndex) {
  if (jointIndex == null || jointIndex < 0) return;
  const j = joints?.[jointIndex];
  if (!j) return;

  if (typeof window.saveHistory === "function") window.saveHistory("toggle manual leg");
  const set = window.manualLegJointSet || new Set();
  window.manualLegJointSet = set;

  if (set.has(jointIndex)) {
    set.delete(jointIndex);
    const idx = legs.findIndex((l) => l.jointIndex === jointIndex);
    if (idx !== -1) {
      const leg = legs[idx];
      if (typeof disposeLegMesh === "function") disposeLegMesh(leg);
      legs.splice(idx, 1);
    }
  } else {
    if (hasPoleBelowJoint(jointIndex)) {
      console.warn("[manual leg] 直下にPOLEがあるためLEGを追加できません。", jointIndex);
      return;
    }
    if (legs.some((l) => l.jointIndex === jointIndex)) return;
    const material = (typeof normalizeMaterial === "function") ? normalizeMaterial(j.material) : (j.material || "IRON");
    const mesh = (typeof createLegMeshForJointIndex === "function") ? createLegMeshForJointIndex(jointIndex) : null;
    if (mesh && typeof applyMaterialColorToMesh === "function") applyMaterialColorToMesh(mesh, material);
    legs.push({ jointIndex, material, mesh });
    set.add(jointIndex);
  }

  if (typeof syncLegCountInput === "function") syncLegCountInput();
  if (typeof window.requestEstimateRender === "function") window.requestEstimateRender("after toggle manual leg");
}

function updateLegCountFromArray() {
  const legInput = document.getElementById("leg-count-input");
  if (legInput) legInput.value = String(legs.length);
  if (!window.__buildingAutoLayout) {
  window.requestEstimateRender?.("after autolayout");
}

}

// =========================================================
// 7. コネクタ（ビーム／ポール） & ラベル
// =========================================================

// コネクタ関連の定数と関数は js/parts/connectors.js に移動済み
// addBeamConnection, addPoleConnection は js/parts/connectors.js に移動済み

// addBeamConnection, addPoleConnection, fixConnectorFunctionBindings, updateConnectorsForJoint は js/parts/connectors.js に移動済み

// deleteJoint, isPointInsideExistingConnector, isSegmentOverlappingExisting, doesSegmentPassThroughJoint は js/parts/joints.js に移動済み

// deleteConnectorByMesh, snapMagnet は js/parts/connectors.js に移動済み

// =========================================================
// 9. プレビュー（ビーム / ポール）
// =========================================================

// プレビュー変数は js/state/state.js で定義済み
// window経由でアクセス可能

function hidePreview() {
  if (window.previewConnector) {
    rackGroup.remove(window.previewConnector);   // ★
    window.previewConnector.geometry.dispose();
    window.previewConnector.material.dispose();
    window.previewConnector = null;
  }
  if (window.previewJoint) {
    rackGroup.remove(window.previewJoint);       // ★
    window.previewJoint.geometry.dispose();
    window.previewJoint.material.dispose();
    window.previewJoint = null;
  }
  window.previewTargetPos = null;
}

// raycaster, mouse は js/core/scene.js で定義済み

// ===== ラック（島）ドラッグ用 =====
const dragState = {
  active: false,

  dragStartHit: new THREE.Vector3(), // ★追加：ドラッグ開始時のヒット点

  // ドラッグ平面と交点
  plane: new THREE.Plane(),
  intersection: new THREE.Vector3(),

  // どの島（クラスター）を動かすか
  clusterId: -1,
  clusterJointIndices: [],      // 動かすジョイント index
  clusterStartPositions: [],    // 開始時点の {x,y,z}

  // “動いたか” 判定（履歴を無駄に増やさない）
  moved: false,
};


// =========================================================
// ジョイントの「つながりクラスター」を取得
//   - startIndex から Beam / Pole でつながっているジョイントだけを集める
// =========================================================
function collectConnectedJointIndices(startIndex) {
  if (startIndex == null || startIndex < 0 || startIndex >= joints.length) {
    return [];
  }

  const visited = new Set();
  const queue = [startIndex];
  visited.add(startIndex);

  while (queue.length > 0) {
    const idx = queue.shift();

    // ---- ビーム経由の隣接ジョイントを追加 ----
    beams.forEach((b) => {
      if (!b) return;

      if (b.a === idx && !visited.has(b.b)) {
        visited.add(b.b);
        queue.push(b.b);
      } else if (b.b === idx && !visited.has(b.a)) {
        visited.add(b.a);
        queue.push(b.a);
      }
    });

    // ---- ポール経由の隣接ジョイントを追加 ----
    poles.forEach((p) => {
      if (!p) return;

      if (p.a === idx && !visited.has(p.b)) {
        visited.add(p.b);
        queue.push(p.b);
      } else if (p.b === idx && !visited.has(p.a)) {
        visited.add(p.a);
        queue.push(p.a);
      }
    });
  }

  return Array.from(visited);
}

// ===== マウスイベントから raycaster を更新する共通関数 =====
function updateRaycasterFromPointerEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

// ===== ドラッグ候補のメッシュを集めるヘルパー =====
// beams, poles の中に { mesh: THREE.Mesh } 形式で入っている前提
function getDraggableMeshes() {
  const res = [];

  if (Array.isArray(beams)) {
    beams.forEach((b) => {
      if (b && b.mesh) res.push(b.mesh);
    });
  }

  if (Array.isArray(poles)) {
    poles.forEach((p) => {
      if (p && p.mesh) res.push(p.mesh);
    });
  }

  // 脚も動かしたければここで追加（今はコメントアウト）
  // if (Array.isArray(legs)) {
  //   legs.forEach((l) => {
  //     if (l && l.mesh) res.push(l.mesh);
  //   });
  // }

  return res;
}

function showPreview(basePos, targetPos) {

  // =========================================================
  // ★ 追加：オーダーモード時は「プレビュー位置」も長さで補正する
  //   - basePos から targetPos 方向へ currentOrderLengthMm だけ伸ばした点を
  //     プレビューの targetPos として扱う
  // =========================================================
  if (isOrderMode() && typeof currentOrderLengthMm === "number" && currentOrderLengthMm > 0) {
    const dir = new THREE.Vector3(
      targetPos.x - basePos.x,
      targetPos.y - basePos.y,
      targetPos.z - basePos.z
    );

    // 方向ベクトルがゼロに近い場合は補正しない
    if (dir.length() > 1e-6) {
      dir.normalize().multiplyScalar(window.currentOrderLengthMm);
      targetPos = {
        x: basePos.x + dir.x,
        y: basePos.y + dir.y,
        z: basePos.z + dir.z,
      };
    }
  }

  // =========================================================
  // ここから下は「既存コードそのまま」
  // =========================================================
  const existingIndex = findJointIndexAt(targetPos);
  if (existingIndex !== -1) {
    if (
      window.currentPartType === "beam" &&
      hasBeamBetween(selectedJointIndex, existingIndex)
    ) {
      hidePreview();
      return;
    }
    if (
      window.currentPartType === "pole" &&
      hasPoleBetween(selectedJointIndex, existingIndex)
    ) {
      hidePreview();
      return;
    }
  }

  if (isPointInsideExistingConnector(targetPos)) {
    hidePreview();
    return;
  }
  if (isSegmentOverlappingExisting(basePos, targetPos, window.currentPartType)) {
    hidePreview();
    return;
  }
  if (doesSegmentPassThroughJoint(basePos, targetPos, window.currentPartType)) {
    hidePreview();
    return;
  }

  if (!window.previewConnector) {
    window.previewConnector = new THREE.Mesh(
      connectorGeometry,
      connectorMaterialPreview.clone()
    );
    rackGroup.add(window.previewConnector); // ★
  }
  updateConnectorMesh(window.previewConnector, basePos, targetPos);

  if (!window.previewJoint) {
    window.previewJoint = new THREE.Mesh(jointGeometry, jointMaterialPreview.clone());
    rackGroup.add(window.previewJoint); // ★
  }
  window.previewJoint.position.set(targetPos.x, targetPos.y, targetPos.z);

  window.previewTargetPos = { ...targetPos };
}

function updatePreviewWithMouse(clientX, clientY) {
  // ★最小パッチ：長さ変更モード中は「選択もプレビューも必ず消して」ここで終了
  if (window.isLengthEditModeOn) {
    // 選択解除（この関数は null を「未選択」として扱っているので null に揃える）
    if (typeof selectedJointIndex !== "undefined") selectedJointIndex = null;
    if (typeof setSelectedJointIndex === "function") setSelectedJointIndex(null);
    if (typeof updateSelectedJointVisual === "function") updateSelectedJointVisual();
    if (typeof clearJointSelection === "function") clearJointSelection();

    // プレビュー解除
    hidePreview?.();
    hideLegPreview?.();
    return;
  }

  // 材質適用モード中はプレビューを非表示
  if (window.__CR_MATERIAL_APPLY_MODE__ || window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
    hidePreview?.();
    hideLegPreview?.();
    return;
  }

  // ジョイントが選択されていないならプレビュー無し（-1 も未選択として扱う）
  if (selectedJointIndex === null || selectedJointIndex === -1) {
    hidePreview();
    return;
  }

  const base = joints[selectedJointIndex];
  if (!base) {
    hidePreview();
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // ビーム用の水平面（y = base.y）
  const planeForBeam = new THREE.Plane(new THREE.Vector3(0, 1, 0), -base.y);

  // ===== ビームプレビュー =====
  if (window.currentPartType === "beam") {
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(planeForBeam, hit)) {
      hidePreview();
      return;
    }

    const dx = hit.x - base.x;
    const dz = hit.z - base.z;

    // ごく近いところは無視
    const distSq = dx * dx + dz * dz;
    if (distSq < 10 * 10) {
      hidePreview();
      return;
    }

    // X 方向か Z 方向かを決める
    const dir = { x: 0, y: 0, z: 0 };
    if (Math.abs(dx) > Math.abs(dz)) {
      dir.x = dx > 0 ? 1 : -1;
    } else {
      dir.z = dz > 0 ? 1 : -1;
    }

// ★ 現在の「実際に使う長さ」を取得（オーダー中ならオーダー長）
// ★プレビューはUIの最新値を最優先で使う（確定側と同期させる）
const ui = (typeof getUI === "function") ? getUI() : null;

let length = null;

// 1) Order ONなら orderLengthInput を使う
if (!!window.isOrderModeOn && ui?.orderLengthInput) {
  const v = parseInt(String(ui.orderLengthInput.value || "").trim(), 10);
  if (Number.isFinite(v) && v > 0) length = v;
}

// 2) Order OFF（または入力が無効）なら lengthSelect を使う
if (!(Number.isFinite(length) && length > 0) && ui?.lengthSelect) {
  const v = parseInt(String(ui.lengthSelect.value || "").trim(), 10);
  if (Number.isFinite(v) && v > 0) length = v;
}

// 3) 最後の保険（状態変数）
if (!(Number.isFinite(length) && length > 0)) {
  length = currentLengthMm;
}

const targetPos = {
  x: base.x + dir.x * length,
  y: base.y,
  z: base.z + dir.z * length,
};

    showPreview(base, targetPos);
    return;
  }

  // ===== ポールプレビュー =====
  if (window.currentPartType === "pole") {
    const baseVec = new THREE.Vector3(base.x, base.y, base.z);
    const baseNDC = baseVec.clone().project(camera);
    const baseScreenY =
      rect.top + (1 - (baseNDC.y + 1) * 0.5) * rect.height;

    const dyScreen = clientY - baseScreenY;
    const isUp = dyScreen < 0;
    const dirY = isUp ? 1 : -1;

    const length = getEffectiveCurrentLength();
    const targetY = base.y + dirY * length;

    if (targetY < 0) {
      hidePreview();
      return;
    }

    const targetPos = {
      x: base.x,
      y: targetY,
      z: base.z,
    };

    showPreview(base, targetPos);
    return;
  }

  // それ以外のパート種別のときはプレビュー無し
  hidePreview();
}

// pickJointIndexByClientPos, isClientPosNearSelectedJoint は js/parts/joints.js に移動済み

// =========================================================
// プレビュー用コネクタマテリアル（無ければここで作る）
// =========================================================

 if (typeof openHeightEditorBtn !== "undefined" && openHeightEditorBtn) {
  openHeightEditorBtn.addEventListener("click", openHeightEditorWindow);
}

// =========================================================
// 10.x 自動レイアウト（幅×奥行マトリクス → 3D生成）
// =========================================================

function readDepthWidthLayout() {
  const table = document.getElementById("layout-depth-width");
  if (!table) {
    console.warn("layout-depth-width テーブルが見つかりません。");
    return null;
  }

  // 幅方向スパン長さ（列ごと）
  const widthSelects = table.querySelectorAll("thead .width-length");
  const widthLens = Array.from(widthSelects)
    .map((sel) => parseInt(sel.value, 10))
    .filter((v) => !isNaN(v) && v > 0);

  // 奥行方向スパン長さ（行ごと）＋マスのON/OFF
  const depthLens = [];
  const enabledMatrix = [];

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((tr) => {
    const depthSel = tr.querySelector(".depth-length");
    const len = parseInt(depthSel.value, 10);
    depthLens.push(!isNaN(len) && len > 0 ? len : 0);

    const rowFlags = [];
    const cells = tr.querySelectorAll("input.cell-enable");
    cells.forEach((chk) => {
      rowFlags.push(chk.checked);
    });
    enabledMatrix.push(rowFlags);
  });

  if (!widthLens.length || !depthLens.length) {
    alert("幅方向・奥行方向の長さを設定してください。");
    return null;
  }

  return {
    widthLens,
    depthLens,
    enabledMatrix,
  };
}

// === 平面レイアウトの行・列追加 ===

// ビーム長セレクトを1個作るユーティリティ
function createBeamLengthSelect(className) {
  const sel = document.createElement("select");
  sel.className = className;
  BEAM_LENGTH_OPTIONS.forEach((len) => {
    const opt = document.createElement("option");
    opt.value = String(len);
    opt.textContent = `${len}mm`;
    if (len === 300) opt.selected = true; // デフォルト300mm
    sel.appendChild(opt);
  });
  return sel;
}

function addLayoutColumn() {
  const table = document.getElementById("layout-depth-width");
  if (!table) return;

  const headRow = table.querySelector("thead tr");
  if (!headRow) return;

  // ヘッダーに列追加
  const th = document.createElement("th");
  th.className = "width-header";
  th.appendChild(createBeamLengthSelect("width-length"));
  headRow.appendChild(th);

  // 各行にチェックボックスセルを追加
  const bodyRows = table.querySelectorAll("tbody tr");
  bodyRows.forEach((tr) => {
    const td = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "cell-enable";
    chk.checked = true;
    td.appendChild(chk);
    tr.appendChild(td);
  });
}

function addLayoutRow() {
  const table = document.getElementById("layout-depth-width");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  const headRow = table.querySelector("thead tr");
  if (!tbody || !headRow) return;

  const widthCount = headRow.querySelectorAll(".width-header").length;
  if (!widthCount) return;

  const tr = document.createElement("tr");

  // 奥行方向の長さセレクト（先頭セル）
  const th = document.createElement("th");
  th.appendChild(createBeamLengthSelect("depth-length"));
  tr.appendChild(th);

  // 幅方向のセル数ぶんチェックボックスを追加
  for (let i = 0; i < widthCount; i++) {
    const td = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "cell-enable";
    chk.checked = true;
    td.appendChild(chk);
    tr.appendChild(td);
  }

  tbody.appendChild(tr);
}

// ボタンにイベントをつなぐ
const addColBtn = document.getElementById("add-layout-col-btn");
const addRowBtn = document.getElementById("add-layout-row-btn");

if (addColBtn) addColBtn.addEventListener("click", addLayoutColumn);
if (addRowBtn) addRowBtn.addEventListener("click", addLayoutRow);

// 自動レイアウト関連の関数は js/features/autolayout.js に移動済み

// ===============================================
// 指定のマトリクス設定からラックを自動生成（多段対応版）
// cfg = {
//   widthLens: [列ごとのビーム長さ],
//   depthLens: [行ごとのビーム長さ],
//   enabledMatrix: [ [true/false,...], ... ],
//   stageMatrix: [ [{stages, heights:[..]} or null, ...], ... ],
//   mode: "replace" or "append"
// }
// ===============================================
// 自動レイアウト関連の関数は js/features/autolayout.js に移動済み

// =========================================
// マウス操作（接続モード：確実に拾う／選択が見える）
//  - mousedown/mousemove を canvas(capture) で単一登録
// =========================================
(function bindMouseHandlers() {
    // ★デバッグログのON/OFF（普段は false）
  const DBG_MOUSE = !!window.__CR_DBG_MOUSE__;

  const canvas = renderer.domElement;

  // 二重登録防止（ホットリロード対策）
  if (window.__CR_MOUSE_BOUND__) {
    console.warn("[mouse] already bound, skip");
    return;
  }
  window.__CR_MOUSE_BOUND__ = true;

  // -----------------------------------------
  // 接続モード：視認できるマーキング（戻せるように保存）
  // -----------------------------------------
  function markConnectPick(jIdx) {
    const m = jointMeshes?.[jIdx];
if (!m) {
  console.log("[CONNECT_DIAG_NO_MESH]", { jIdx, jointMeshesLen: jointMeshes?.length });
  return;
}


    // 初回だけ退避
    if (!m.userData) m.userData = {};
    if (!m.userData.__cr_orig) {
      m.userData.__cr_orig = {
        color: m.material?.color?.clone?.() || null,
        emissive: m.material?.emissive?.clone?.() || null,
        scale: { x: m.scale.x, y: m.scale.y, z: m.scale.z },
      };
    }

    // material 共有対策（cloneしてから変える）
    if (m.material && !m.userData.__cr_matCloned) {
      m.material = m.material.clone();
      m.userData.__cr_matCloned = true;
    }

    // 見た目を強烈に変える（色＋発光＋拡大）
    m.material?.color?.set?.(0xff3333);
    m.material?.emissive?.set?.(0x550000);
    m.scale.set(1.6, 1.6, 1.6);

    DBG_MOUSE && console.log("[connect] MARKED joint", jIdx);
  }

  function clearConnectMarks() {
    jointMeshes?.forEach((m) => {
      const o = m?.userData?.__cr_orig;
      if (!m || !o) return;

      if (m.material && o.color) m.material.color.copy(o.color);
      if (m.material && o.emissive) m.material.emissive.copy(o.emissive);
      m.scale.set(o.scale.x, o.scale.y, o.scale.z);

      delete m.userData.__cr_orig;
      // material は戻さない（共有破壊を防ぐため）
    });
  }

  // -----------------------------------------
  // raycaster 更新ユーティリティ（mousedownでも必ず更新）
  // -----------------------------------------
  function updateRayFromClientXY(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
  }

  // ================================
  // mousedown（captureで最優先に拾う）
  // ================================
  canvas.addEventListener(
    "mousedown",
    (e) => {
      // ★長さ変更モード中は「何も確定しない」＋「選択見た目を確実に解除」
      if (window.isLengthEditModeOn) {
        // まず状態を消す
        if (typeof selectedJointIndex !== "undefined") selectedJointIndex = -1;

        // 可能な解除APIを全部叩く（存在するものだけ）
        try { window.setSelectedJointIndex?.(-1); } catch {}
        try { window.clearJointSelection?.(); } catch {}
        try { window.updateSelectedJointVisual?.(); } catch {}

        // さらに“最後に選択されたmesh”が残っている実装対策（変数があれば）
        try {
          if (typeof selectedJointMesh !== "undefined" && selectedJointMesh) {
            // 色を直接いじっている実装なら、ここで戻す関数があるはず
            // resetOriginalColors / restoreJointMaterial 等があれば後で追加する
          }
        } catch {}

        // プレビュー消し
        hidePreview?.();
        hideLegPreview?.();

        // 以降の確定処理に入れない
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // まず「canvasに来ている」ことを確実にログ
      DBG_MOUSE && console.log("[mouse] canvas mousedown", {
        button: e.button,
        x: e.clientX,
        y: e.clientY,
        connect: !!window.isConnectModeOn,
      });

      // ================================
      // A) 板モード最優先（V1.1.1）
      // ================================
      if (window.isBoardModeOn) {
        e.preventDefault();
        e.stopPropagation();

        if (e.button !== 0) return; // 左のみ

        // ジョイントをクリックした場合は4点選択モードに切り替え
        const jointIdx = pickJointIndexByClientPos(e.clientX, e.clientY, 28);
        if (jointIdx !== -1) {
          // 4点選択に追加
          const added = window.addJointToBoardSelection?.(jointIdx);
          if (added) {
            console.log("[board] joint selected for 4-point selection:", jointIdx, "total:", window.selectedJoints4?.length || 0);
            // 4点選択中は自動プレビューを無効化（4点選択完了時にプレビューが表示される）
            return;
          }
        }

        // ジョイント以外をクリックした場合、または4点選択が完了している場合はプレビューから板を追加
        // 4点選択が完了している場合は、その4点でプレビューが表示されているはず
        if (window.previewBoardJ4 && window.previewBoardJ4.length === 4) {
          // プレビューから板を追加（ドラッグ判定はmouseupで行う）
          // ここでは処理をマークするだけ
          window.__CR_BOARD_PENDING_ADD__ = true;
          window.__CR_BOARD_MOUSE_DOWN_POS__ = { x: e.clientX, y: e.clientY };
          console.log("[board] mousedown: __CR_BOARD_PENDING_ADD__ = true", {
            previewJ4: window.previewBoardJ4,
            hasPreview: !!window.previewBoardMesh
          });
        }

        // ★板モード中は「通常のジョイント選択/生成」へ流さない
        return;
      }

      // ================================
      // B) 接続モード
      // ================================
      console.log("[connect/diag] enter", {
  win: window.isConnectModeOn,
  bare: (typeof isConnectModeOn !== "undefined" ? isConnectModeOn : "(undef)"),
  from: (typeof connectFromJointIndex !== "undefined" ? connectFromJointIndex : "(undef)"),
  btn: e.button
});

      if (window.isConnectModeOn) {
        e.preventDefault();
        e.stopPropagation();

        if (e.button !== 0) return; // 左のみ

        // mousedown時点で raycaster を更新
        updateRayFromClientXY(e.clientX, e.clientY);

        // Joint を拾う（recursive true）
        const jointTargets =
          (typeof jointPickTargets !== "undefined" &&
            Array.isArray(jointPickTargets) &&
            jointPickTargets.length)
            ? jointPickTargets
            : (Array.isArray(jointMeshes) ? jointMeshes.filter(Boolean) : []);

        const hitJ = raycaster.intersectObjects(jointTargets, true);

        let jIdx = -1;
        if (hitJ.length > 0) {
          let obj = hitJ[0].object;
          while (obj) {
            if (
              obj.userData &&
              obj.userData.type === "joint" &&
              typeof obj.userData.jointIndex === "number"
            ) {
              jIdx = obj.userData.jointIndex;
              break;
            }
            obj = obj.parent;
          }
        }

        console.log("[connect/diag] hit", {hitLen: hitJ.length, jIdx});

        if (typeof jIdx === "number" && jIdx >= 0) {
          // 1点目
          if (connectFromJointIndex == null) {
            connectFromJointIndex = jIdx;

            // まず“絶対分かる”見た目変更
            clearConnectMarks();
            markConnectPick(jIdx);

            // 既存関数があるならそれも呼ぶ（任意）
            highlightConnectFromJoint?.(jIdx);

            hidePreview?.();
            hideLegPreview?.();
            console.log("[connect] from joint", jIdx);
            return;
          }

          // 同じ場所 → 解除
          if (connectFromJointIndex === jIdx) {
            connectFromJointIndex = null;

            clearConnectFromHighlight?.();
            clearConnectMarks();

            hidePreview?.();
            hideLegPreview?.();
            console.log("[connect] canceled (same joint)");
            return;
          }

          // 2点目 → 生成
          const from = connectFromJointIndex;
          const to = jIdx;

          connectFromJointIndex = null;
          clearConnectFromHighlight?.();
          clearConnectMarks();

          console.log("[connect] link", { from, to });

          if (window.callIfExists) window.callIfExists("saveHistory");

          const ok = createConnectorBetweenJoints(from, to);
          console.log("[connect] createConnectorBetweenJoints ok =", ok);

          if (ok) {
            normalizeCustomFlagsByActualLength?.();
            calcAndRenderEstimate?.();
            applyColorChartToAllConnectors?.();
          }

          hidePreview?.();
          hideLegPreview?.();
          return;
        }

        // ジョイントに当たらなかった
        hidePreview?.();
        hideLegPreview?.();
        return;
      }

      // ================================
      // B) 通常モード（既存挙動：クラスタドラッグ開始など）
      // ================================
      if (e.button !== 0) return;

      // 通常モードでも ray を更新しておく（ズレ防止）
      updateRayFromClientXY(e.clientX, e.clientY);

      const jointIndex = pickJointIndexByClientPos(e.clientX, e.clientY, 20);

// ================================
// DELETE MODE：次のクリックで削除対象を確定（連続削除OK）
// ================================
if (jointIndex !== -1 && window.__CR_DELETE_MODE_ON__) {
  e.preventDefault();
  e.stopPropagation();

  const cid = jointClusterId?.[jointIndex];
  const clusterJoints =
    (cid != null && jointClusters?.[cid]?.joints?.length)
      ? jointClusters[cid].joints
      : [jointIndex];

  const ok = confirm(`このラック（${clusterJoints.length} joints）を削除しますか？`);
  if (!ok) {
    // キャンセルしても削除モードは継続（次のラックを選べる）
    return;
  }

  // 既存ロジックを再利用（削除対象を“このクリック”に確定）
  window.__CR_ACTIVE_JOINT_INDEX__ = jointIndex;

  // deleteActiveCluster が selectedJointIndex を参照する実装もあり得るので保険
  try { if (typeof selectedJointIndex !== "undefined") selectedJointIndex = jointIndex; } catch {}

  window.deleteActiveCluster?.(jointIndex);

  // ★ここで削除モードをOFFにしない（連続削除できるようにする）
  return;
}

if (jointIndex !== -1) {
  // ★MoveModeのON/OFFに関係なく「回転対象」を記録
  window.__CR_ACTIVE_JOINT_INDEX__ = jointIndex;

  // ★MoveMode ON のときだけクラスタドラッグ開始
  if (!!window.isMoveModeOn) {
    const clusterId = jointClusterId?.[jointIndex];
    const cluster =
      clusterId != null && jointClusters?.[clusterId]
        ? jointClusters[clusterId].joints
        : [jointIndex];

    dragState.active = true;
    dragState.clusterJointIndices = cluster.slice();
    dragState.clusterStartPositions = cluster.map((idx) => ({
      x: joints[idx].x,
      y: joints[idx].y,
      z: joints[idx].z,
    }));

    const hitPos = new THREE.Vector3(
      joints[jointIndex].x,
      joints[jointIndex].y,
      joints[jointIndex].z
    );

    dragState.plane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      hitPos
    );

    dragState.intersection.copy(hitPos);
    dragState.dragStartHit.copy(hitPos);

    controls.enabled = false;
    return;
  }
}

// ★移動モードOFFなら、ここではクラスター移動を開始しない（以降は既存の通常挙動へ）


      window.isLeftMouseDown = true;
      window.lastPanX = e.clientX;
      window.lastPanY = e.clientY;
      window.didDrag = false;
    },
    true // ← capture（ここが重要）
  );

  // ================================
  // mousemove（captureで単一登録）
  // ================================
canvas.addEventListener(
  "mousemove",
  (e) => {
    updateRayFromClientXY(e.clientX, e.clientY);

    // 接続モード：プレビュー停止（見た目の混乱防止）
    if (window.isConnectModeOn) {
      hidePreview?.();
      hideLegPreview?.();
      return;
    }

    // 材質適用モード中はプレビューを非表示
    if (window.__CR_MATERIAL_APPLY_MODE__ || window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
      hidePreview?.();
      hideLegPreview?.();
      hideBoardPreview?.();
      return;
    }

    // 板モード：板プレビューを表示
    if (window.isBoardModeOn) {
      hidePreview?.();
      hideLegPreview?.();
      resetHighlight?.();

      // 4点選択中は自動プレビューを無効化（4点選択完了時にプレビューが表示される）
      const selectedJoints4 = window.selectedJoints4 || [];
      if (selectedJoints4.length > 0 && selectedJoints4.length < 4) {
        // 4点未満の選択中は自動プレビューを非表示
        hideBoardPreview?.();
        return;
      }
      
      // 4点選択が完了している場合は、その4点でプレビューが表示されているので自動プレビューは不要
      if (selectedJoints4.length === 4) {
        return;
      }

      // マウス位置からワールド座標を取得
      const hit = raycaster.intersectObjects(
        [
          ...beams.map((b) => b.mesh),
          ...poles.map((p) => p.mesh),
        ].filter(Boolean),
        false
      );

      if (hit.length > 0) {
        const worldPos = hit[0].point;
        if (typeof window.showBoardPreview === "function") {
          window.showBoardPreview(worldPos);
        }
      } else {
        // 線分フォールバック：THREE.Ray#distanceSqToSegment でレイ-線分の最短距離の2乗と線分上最近傍点Qを取得。
        // distSq <= SNAP_MM^2 の候補のうち最小のものを採用し、worldPos=Q を showBoardPreview に渡す。
        const SNAP_MM = 60;
        const snapSq = SNAP_MM * SNAP_MM;
        const ray = raycaster.ray;
        const jList = (typeof joints !== "undefined" && Array.isArray(joints)) ? joints : (window.joints || []);
        const conns = [...(Array.isArray(beams) ? beams : []), ...(Array.isArray(poles) ? poles : [])];
        const P0 = new THREE.Vector3();
        const P1 = new THREE.Vector3();
        const R = new THREE.Vector3();
        const Q = new THREE.Vector3();
        let best = { distSq: Infinity, bestQ: null };
        for (const c of conns) {
          if (!c || c.a == null || c.b == null) continue;
          const pa = jList[c.a];
          const pb = jList[c.b];
          if (!pa || !pb) continue;
          P0.set(pa.x, pa.y, pa.z);
          P1.set(pb.x, pb.y, pb.z);
          const distSq = ray.distanceSqToSegment(P0, P1, R, Q);
          if (distSq <= snapSq && distSq < best.distSq) {
            best = { distSq, bestQ: Q.clone() };
          }
        }
        if (best.bestQ) {
          if (typeof window.showBoardPreview === "function") {
            window.showBoardPreview(best.bestQ);
          }
        } else {
          // 地面との交点を計算（水平面）
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const intersectPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            if (typeof window.showBoardPreview === "function") {
              window.showBoardPreview(intersectPoint);
            }
          } else {
            hideBoardPreview?.();
          }
        }
      }
      return;
    }

    if (window.isLeftMouseDown) {
      const dx = e.clientX - window.lastPanX;
      const dy = e.clientY - window.lastPanY;
      if (dx * dx + dy * dy > 4) window.didDrag = true;
    }

    if (e.altKey) {
      hideLegPreview?.();
      hideBoardPreview?.();
      const targets = [
        ...beams.map((b) => b.mesh),
        ...poles.map((p) => p.mesh),
        ...jointMeshes,
      ].filter(Boolean);

      const hit = raycaster.intersectObjects(targets, false);
      if (hit.length > 0) setHighlight?.(hit[0].object);
      else resetHighlight?.();
      return;
    }

    if (e.shiftKey) {
      const idx = pickJointIndexByClientPos(e.clientX, e.clientY, 24);
      if (idx !== -1) {
        setHighlight?.(jointMeshes[idx]);
        showLegPreview?.(idx);
      } else {
        resetHighlight?.();
        hideLegPreview?.();
      }
      hidePreview?.();
      hideBoardPreview?.();
      return;
    }

        // --------------------------------------------------
    // A-2) 選択ジョイント近傍以外では Beam/Pole プレビューを出さない
    // --------------------------------------------------
    if (!window.isLengthEditModeOn) {
      const near = isClientPosNearSelectedJoint(e.clientX, e.clientY, 80);
      if (!near) {
        hidePreview?.();
        // 近傍でなければプレビュー更新もさせない（チラつき防止）
        return;
      }
    }

    resetHighlight?.();
    hideLegPreview?.();
    hideBoardPreview?.();
    updatePreviewWithMouse?.(e.clientX, e.clientY);
  },
  true
);

    DBG_MOUSE && console.log("[mouse] handlers bound to canvas (capture) / connect visible mark enabled");

  // ================================
  // mouseup（板モードの追加処理）
  // ================================
  canvas.addEventListener(
    "mouseup",
    (e) => {
      if (!window.isBoardModeOn) return;
      if (e.button !== 0) return; // 左のみ

      // ドラッグ判定（mousedownとmouseupの位置を比較）
      if (window.__CR_BOARD_MOUSE_DOWN_POS__) {
        const dx = e.clientX - window.__CR_BOARD_MOUSE_DOWN_POS__.x;
        const dy = e.clientY - window.__CR_BOARD_MOUSE_DOWN_POS__.y;
        const moveDist = Math.sqrt(dx * dx + dy * dy);
        
        if (moveDist > 10) {
          console.log("[board] drag detected, cancel", moveDist);
          window.__CR_BOARD_PENDING_ADD__ = false;
          window.__CR_BOARD_MOUSE_DOWN_POS__ = null;
          return;
        }
      }

      // プレビューから板を追加
      if (window.__CR_BOARD_PENDING_ADD__) {
        console.log("[board] adding board from preview");
        window.__CR_BOARD_PENDING_ADD__ = false;
        window.__CR_BOARD_MOUSE_DOWN_POS__ = null;
        
        if (typeof window.addBoardFromPreview === "function") {
          window.addBoardFromPreview();
        } else {
          console.warn("[board] addBoardFromPreview not found");
        }
      }
    },
    true // capture
  );
})();

// =========================================================
// v1.0.8 UI：左サイド「ツールバー風」Move / Rotate(+90/-90)
//   - 右パネルは増やさない
//   - PNGアイコン（img/rotate_cw.png / img/rotate_ccw.png）を使用
// =========================================================
(function installMoveModeToolbar() {
  if (window.__CR_MOVE_MODE_TOOLBAR__) return;
  window.__CR_MOVE_MODE_TOOLBAR__ = true;

  // ================================
// Delete Mode: ON/OFF + ガイド表示
// ================================
if (typeof window.isDeleteModeOn === "undefined") window.isDeleteModeOn = false;

window.setDeleteMode = function (on) {
  window.isDeleteModeOn = !!on;

  // ガイド表示
  const id = "cr-delete-guide";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText = `
      position: fixed;
      left: 50%;
      top: 16px;
      transform: translateX(-50%);
      z-index: 10000;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(17,24,39,0.65);
      border: 1px solid rgba(255,255,255,0.12);
      color: #fff;
      font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      pointer-events: none;
      display: none;
      box-shadow: 0 10px 24px rgba(0,0,0,0.25);
    `;
    document.body.appendChild(el);
  }

  if (window.isDeleteModeOn) {
    el.textContent = "削除モード：削除したいラックのジョイントをクリック（ESCで終了）";
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }

  // ボタン見た目同期（もしあるなら）
  try { window.syncDeleteBtnUI?.(); } catch {}
};

// ESCで終了
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // 4点選択をキャンセル
    if (window.isBoardModeOn && window.selectedJoints4 && window.selectedJoints4.length > 0) {
      window.clearBoardSelection?.();
      return;
    }
    
    // 削除モードを終了
    if (window.isDeleteModeOn) {
      window.setDeleteMode(false);
    }
  }
});


  // setMoveMode が無い場合のフォールバック（最小）
  if (typeof window.setMoveMode !== "function") {
    window.setMoveMode = function (on) {
      window.isMoveModeOn = !!on;
    };
  }
  if (typeof window.isMoveModeOn === "undefined") window.isMoveModeOn = false;

  // --- CSS（左サイド縦バー + アイコンボタン） ---
  const style = document.createElement("style");
  style.textContent = `
    .cr-leftbar{
      position: fixed;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 8px;
      border-radius: 14px;
      background: rgba(17,24,39,0.32);           /* ←バーの透明度 */
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 10px 24px rgba(0,0,0,0.22);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    .cr-toolbtn{
      width: 56px;                               /* ←少し大きく */
      height: 56px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.05);        /* ←ボタンの透明度 */
      cursor: pointer;
      user-select: none;
      padding: 0;
      outline: none;
      position: relative;
      transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    }
    .cr-toolbtn:hover{
      background: rgba(255,255,255,0.07);
    }
    .cr-toolbtn.is-on{
      background: rgba(16,185,129,0.22);
      border-color: rgba(16,185,129,0.55);
      box-shadow: 0 0 0 3px rgba(16,185,129,0.16);
    }

    /* SVG と PNG を同じサイズ感に揃える */
    .cr-toolbtn svg{
      width: 30px;
      height: 30px;
      color: #ffffff;
      opacity: 1;
      display:block;
    }
    .cr-toolbtn .cr-ico{
      width: 30px;
      height: 30px;
      display: block;
      object-fit: contain;
      filter: invert(1);                         /* 黒PNG→白表示 */
      opacity: 0.98;
    }

    .cr-toolbtn .tip{
      position: absolute;
      left: 62px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateX(-6px);
      transition: opacity 120ms ease, transform 120ms ease;
      font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #fff;
      background: rgba(17,24,39,0.92);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 8px 10px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.25);
    }
    .cr-toolbtn:hover .tip{
      opacity: 1;
      transform: translateX(0);
    }
  `;
  document.head.appendChild(style);

  // --- DOM ---
  const bar = document.createElement("div");
  bar.className = "cr-leftbar";

  // 1) Move
  const btnMove = document.createElement("button");
  btnMove.type = "button";
  btnMove.className = "cr-toolbtn";
  btnMove.setAttribute("aria-label", "移動モード");
  btnMove.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <!-- 中央の四角（Moveの“ハンドル”感） -->
    <rect x="9" y="9" width="6" height="6" rx="1.4"
      stroke="currentColor" stroke-width="2.4" />

    <!-- 上 -->
    <path d="M12 3v4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M10.2 4.8L12 3l1.8 1.8" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"/>

    <!-- 下 -->
    <path d="M12 21v-4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M10.2 19.2L12 21l1.8-1.8" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"/>

    <!-- 左 -->
    <path d="M3 12h4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M4.8 10.2L3 12l1.8 1.8" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"/>

    <!-- 右 -->
    <path d="M21 12h-4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M19.2 10.2L21 12l-1.8 1.8" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span class="tip">移動モード（ラック移動）</span>
`;

  function syncMoveBtn() {
    const on = !!window.isMoveModeOn;
    btnMove.classList.toggle("is-on", on);
  }
  window.syncMoveModeUI = syncMoveBtn;
    // ★ Move ボタン：ON/OFF
  btnMove.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    window.setMoveMode(!window.isMoveModeOn);
    syncMoveBtn();
  });

    // 2) Rotate +90 (PNG)
  const btnRot = document.createElement("button");
  btnRot.type = "button";
  btnRot.className = "cr-toolbtn";
  btnRot.setAttribute("aria-label", "回転 +90°");
  btnRot.innerHTML = `
    <img class="cr-ico" src="img/rotate_ccw.png" alt="" aria-hidden="true">
    <span class="tip">回転（+90°）</span>
  `;
  btnRot.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    window.rotateActiveCluster90?.(+90);
  });

  // 3) Rotate -90 (PNG)
  const btnRotNeg = document.createElement("button");
  btnRotNeg.type = "button";
  btnRotNeg.className = "cr-toolbtn";
  btnRotNeg.setAttribute("aria-label", "回転 -90°");
  btnRotNeg.innerHTML = `
    <img class="cr-ico" src="img/rotate_cw.png" alt="" aria-hidden="true">
    <span class="tip">回転（-90°）</span>
  `;
  btnRotNeg.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    window.rotateActiveCluster90?.(-90);
  });

  // =========================================================
// v1.0.8 Delete Mode：
//  - ゴミ箱ON/OFF（確認なし）
//  - ホバーで削除対象ラック（クラスター）を赤ハイライト
//  - クリックで即削除（confirmなし）
// =========================================================

// 4) Delete Cluster（ゴミ箱）ボタン
const btnDel = document.createElement("button");
btnDel.type = "button";
btnDel.className = "cr-toolbtn";
btnDel.setAttribute("aria-label", "ラック削除（クラスター）");
btnDel.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 3h6l1 2h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M6 7h12l-1 14H7L6 7z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M10 11v7M14 11v7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>
  <span class="tip">ラック削除（クリックで削除）</span>
`;

// ---- DeleteMode 状態 ----
if (typeof window.isDeleteModeOn === "undefined") window.isDeleteModeOn = false;

// ---- ハイライト管理（元色退避→復元）----
if (!window.__CR_DELHL__) {
  window.__CR_DELHL__ = {
    activeJoint: -1,
    joints: new Map(),      // idx -> { colorHex, scale:{x,y,z} }
    conn: new Set(),        // mesh set
  };
}

function __crDelRestoreHighlight() {
  const st = window.__CR_DELHL__;
  // joints
  st.joints.forEach((bak, idx) => {
    const m = jointMeshes?.[idx];
    if (!m) return;
    try {
      if (m.material?.color && bak.colorHex != null) m.material.color.setHex(bak.colorHex);
      if (m.material?.emissive && bak.emissiveHex != null) {
        m.material.emissive.setHex(bak.emissiveHex);
        m.material.emissiveIntensity = 0;
      }
      if (bak.scale) m.scale.set(bak.scale.x, bak.scale.y, bak.scale.z);
    } catch {}
  });
  st.joints.clear();

  // connectors
  st.conn.forEach((mesh) => {
    if (!mesh) return;
    try {
      const bak = mesh.userData?._crDelBak;
      if (bak && mesh.material?.color && bak.colorHex != null) {
        mesh.material.color.setHex(bak.colorHex);
      }
      if (bak && mesh.material?.emissive && bak.emissiveHex != null) {
        mesh.material.emissive.setHex(bak.emissiveHex);
        mesh.material.emissiveIntensity = 0;
      }
      if (mesh.userData) delete mesh.userData._crDelBak;
    } catch {}
  });
  st.conn.clear();

  st.activeJoint = -1;
}

function __crDelApplyHighlightForJoint(j0) {
  const st = window.__CR_DELHL__;
  if (typeof j0 !== "number" || j0 < 0) {
    __crDelRestoreHighlight();
    return;
  }

  // 同じなら何もしない
  if (st.activeJoint === j0) return;

  __crDelRestoreHighlight();
  st.activeJoint = j0;

  // 最新クラスタ
  if (typeof rebuildJointClusters === "function") rebuildJointClusters();

  const cid = jointClusterId?.[j0];
  const clusterJoints =
    (cid != null && jointClusters?.[cid]?.joints?.length)
      ? jointClusters[cid].joints.slice()
      : [j0];

  const jointSet = new Set(clusterJoints);

  // --- joints を赤く（+少し拡大） ---
  clusterJoints.forEach((idx) => {
    const m = jointMeshes?.[idx];
    if (!m) return;

    try {
      // 退避
      if (!st.joints.has(idx)) {
        st.joints.set(idx, {
          colorHex: (m.material?.color ? m.material.color.getHex() : null),
          emissiveHex: (m.material?.emissive ? m.material.emissive.getHex() : null),
          scale: { x: m.scale.x, y: m.scale.y, z: m.scale.z },
        });
      }
      if (m.material?.color) m.material.color.setHex(0xef4444); // 赤色
      if (m.material?.emissive) {
        m.material.emissive.setHex(0xef4444); // 赤色の発光
        m.material.emissiveIntensity = 1.2; // 明るい発光強度
      }
      m.scale.set(1.25, 1.25, 1.25);
    } catch {}
  });

  // --- beams/poles も赤く（両端が cluster 内のもの） ---
  function markConnector(mesh) {
    if (!mesh) return;
    try {
      if (!mesh.userData) mesh.userData = {};
      if (!mesh.userData._crDelBak) {
        mesh.userData._crDelBak = {
          colorHex: (mesh.material?.color ? mesh.material.color.getHex() : null),
          emissiveHex: (mesh.material?.emissive ? mesh.material.emissive.getHex() : null),
        };
      }
      if (mesh.material?.color) mesh.material.color.setHex(0xef4444); // 赤色
      if (mesh.material?.emissive) {
        mesh.material.emissive.setHex(0xef4444); // 赤色の発光
        mesh.material.emissiveIntensity = 1.2; // 明るい発光強度
      }
      st.conn.add(mesh);
    } catch {}
  }

  (beams || []).forEach((b) => {
    if (!b?.mesh) return;
    if (jointSet.has(b.a) || jointSet.has(b.b)) markConnector(b.mesh);
  });
  (poles || []).forEach((p) => {
    if (!p?.mesh) return;
    if (jointSet.has(p.a) || jointSet.has(p.b)) markConnector(p.mesh);
  });
}

function setDeleteMode(on) {
  window.isDeleteModeOn = !!on;
  btnDel.classList.toggle("is-on", window.isDeleteModeOn);

  if (!window.isDeleteModeOn) {
    __crDelRestoreHighlight();
  }
}

// ゴミ箱ボタン：ON/OFFだけ（確認なし）
btnDel.addEventListener("click", (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  setDeleteMode(!window.isDeleteModeOn);
});

// Escでキャンセル
if (!window.__CR_DELETE_ESC_BOUND__) {
  window.__CR_DELETE_ESC_BOUND__ = true;
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && window.isDeleteModeOn) {
        setDeleteMode(false);
      }
    },
    true
  );
}

// ---- Deleteモード中の hover / click ----
// ※ 既存の pointerdown/mousedown と競合しないよう capture で先に処理
if (!window.__CR_DELETE_PICK_BOUND__) {
  window.__CR_DELETE_PICK_BOUND__ = true;

  const canvas = renderer.domElement;

  // 1) hover で対象ハイライト
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!window.isDeleteModeOn) return;
      // 既存のUIや他モードへの干渉を最小化（選択/プレビューはさせない）
      e.preventDefault();
      e.stopPropagation();

      const j = pickJointIndexByClientPos?.(e.clientX, e.clientY, 24);
      if (typeof j === "number" && j >= 0) __crDelApplyHighlightForJoint(j);
      else __crDelRestoreHighlight();
    },
    true
  );

  // 2) click で即削除（confirmなし）/ Deleteモード継続
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (!window.isDeleteModeOn) return;
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const j = pickJointIndexByClientPos?.(e.clientX, e.clientY, 24);
      if (!(typeof j === "number" && j >= 0)) return;

      // クリックしたラックを即削除（confirmなし）
      const ok = window.deleteActiveCluster?.(j, { confirm: false });
      if (ok) {
        // 次の削除に備えてハイライト更新
        __crDelRestoreHighlight();
      }
    },
    true
  );
}

// bar 追加は最後に
bar.appendChild(btnMove);
bar.appendChild(btnRot);
bar.appendChild(btnRotNeg);
bar.appendChild(btnDel);

  document.body.appendChild(bar);

  syncMoveBtn();
})();

// ===== 自動レイアウトツールからの設定受信 =====
window.addEventListener("storage", (event) => {
  if (event.key !== "cuberack_auto_layout") return;

  const payload = event.newValue ? JSON.parse(event.newValue) : null;
  if (!payload) return;

  if (payload.mode === "3d") {
    applyAutoLayout3DFromExternal(payload.data);
  } else if (payload.mode === "flat") {
    applyAutoLayoutFlatFromExternal(payload.data);
  }
});

function applyAutoLayout3DFromExternal(data) {
  // data = { xCount, zCount, yStages, moduleLenX, moduleLenZ, firstStageHeight }

  // もし既存の UI 用 input があるなら、それに値を入れてから
  // 既存の「この設定でモジュール自動生成」の関数を呼んでもOK
  //
  // 例：
  // document.getElementById("auto3-x-count").value = data.xCount;
  // document.getElementById("auto3-z-count").value = data.zCount;
  // ...
  // runAutoLayout3D(); // ← 今までボタンに紐づいていた関数名に合わせて変更

  // あるいは、直接あなたの自動生成ロジックをここに書いてもOK
}

function applyAutoLayoutFlatFromExternal(data) {
  // data = { cellSizeX, cellSizeZ, grid } みたいな形を想定
  // grid は [ [true/false, true/false, ...], ... ] （チェックされたマス）

  // ここも、今まで右パネルの「この設定で自動レイアウト（平面）」で
  // 実行していた処理をそのまま呼び出してください。
}

// =========================================================
// 12. シーン再構築（Undo/Redo 用）
// =========================================================
// rebuildSceneFromData は js/features/file.js に移動済み
// window経由でアクセス可能

// =========================================================
// 13. 見積り計算（全部まとめて1テーブル版）
// =========================================================
// =========================================
// ビーム長さを安全に取得（mm）
// lengthMm が無い古いデータでも集計できるようにする
// =========================================
function getBeamLengthMmSafe(beam) {
  if (beam.lengthMm && beam.lengthMm > 0) {
    return beam.lengthMm;
  }

  const ja = joints[beam.a];
  const jb = joints[beam.b];
  if (!ja || !jb) return 0;

  const dx = ja.x - jb.x;
  const dy = ja.y - jb.y;
  const dz = ja.z - jb.z;

  // ワールド単位＝mm なのでそのまま
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Math.round(len);
}

// 見積関連の関数は js/features/estimate.js に移動済み
// calcAndRenderEstimate は window.calcAndRenderEstimate として利用可能
// ラッパー関数は削除（無限再帰を防ぐため）

// =========================================================
// 14. キーボードショートカット（Undo / Redo / Delete）
// =========================================================
window.addEventListener("keydown", (e) => {
  // ★ 長押しによるリピート入力は無視
  if (e.repeat) return;

  // Ctrl+Z → Undo（js/features/history.js で処理）
  // Ctrl+Y → Redo（js/features/history.js で処理）

  // Delete → 選択中ジョイント削除
  if (e.key === "Delete" && selectedJointIndex !== null) {
    deleteJoint(selectedJointIndex);
    return;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === "Alt") {
    resetHighlight();
  }
  if (e.key === "Shift") {
    hideLegPreview();
    resetHighlight();
  }
});

// =========================================================
// 15. Undo / Redo / Reset ボタン
// =========================================================

// Undo/Redoボタンのイベントリスナーは js/features/history.js で設定済み

const resetBtn = document.getElementById("reset-btn");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (!confirm("すべてのパーツを削除して初期状態に戻します。よろしいですか？")) {
      return;
    }

    if (window.callIfExists) window.callIfExists("saveHistory");

    // ★ ここを修正：scene.remove → rackGroup.remove（or 親から外す）
    jointMeshes.forEach((m) => {
      if (!m) return;
      const parent = m.parent;
      if (parent) parent.remove(m);
    });

    beams.forEach((b) => {
      if (!b.mesh) return;
      const parent = b.mesh.parent;
      if (parent) parent.remove(b.mesh);
      b.mesh = null;
    });

    poles.forEach((p) => {
      if (!p.mesh) return;
      const parent = p.mesh.parent;
      if (parent) parent.remove(p.mesh);
      p.mesh = null;
    });

    legs.forEach((l) => disposeLegMesh(l));

    // 棚板・壁板のメッシュ削除とデータクリア（ラックと同様にデータ＋メッシュ両方を消す）
    if (window.shelves) {
      window.shelves.forEach((s) => {
        if (s && s.mesh) {
          const par = s.mesh.parent;
          if (par) par.remove(s.mesh);
          s.mesh.geometry?.dispose?.();
          const m = s.mesh.material;
          if (Array.isArray(m)) m.forEach(x => x?.dispose?.());
          else m?.dispose?.();
          s.mesh = null;
        }
      });
      window.shelves.length = 0;
    }
    if (window.panels) {
      window.panels.forEach((p) => {
        if (p && p.mesh) {
          const par = p.mesh.parent;
          if (par) par.remove(p.mesh);
          p.mesh.geometry?.dispose?.();
          const m = p.mesh.material;
          if (Array.isArray(m)) m.forEach(x => x?.dispose?.());
          else m?.dispose?.();
          p.mesh = null;
        }
      });
      window.panels.length = 0;
    }

    joints.length = 0;
    jointMeshes.length = 0;
    beams.length = 0;
    poles.length = 0;
    legs.length = 0;

    const idx = createJoint({ x: 0, y: 0, z: 0 });
    setSelectedJoint(idx);
    addLegIfNeeded(idx);
    syncLegCountInput();
    if (!window.__buildingAutoLayout) {
  window.requestEstimateRender?.("after autolayout");
}

    if (window.callIfExists) window.callIfExists("saveHistory");
  });
}

// =========================================================
// 16. セーブ / ロード（File System Access API）
// =========================================================

// ファイル操作関連の関数は js/features/file.js に移動済み
// saveDesignOverwrite, saveDesignAs, openDesignFromFilePicker は window 経由でアクセス可能
// ボタンイベントは js/features/file.js で設定済み

// =========================================================
// 16.5 寸法計算（芯々 / 外寸）
// =========================================================

// ★ 実測スタック（高さ） [mm]
//   Leg + JointBall + JointCap = 30.9mm
//   Leg + JointBall + JointCap + TopCap = 33.15mm
// 見積関連の定数は js/features/estimate.js に移動済み
// REAL_STACK, CENTER_TO_TOPCAP は window 経由でアクセス可能

// 見積関連の関数は js/features/estimate.js に移動済み
// - computeFrameDimensions, formatMm, updateDimensionPopup, buildEstimatePayload
// window経由でアクセス可能

// =========================================================
// 17. 長さ取得 & カラーチャート 【LATE：正本】
// =========================================================

function getBeamLength(b) {
  const a = joints[b.a];
  const c = joints[b.b];
  if (!a || !c) return 0;

  return Math.round(
    new THREE.Vector3(a.x, a.y, a.z).distanceTo(
      new THREE.Vector3(c.x, c.y, c.z)
    )
  );
}

function getPoleLength(p) {
  const a = joints[p.a];
  const c = joints[p.b];
  if (!a || !c) return 0;

  return Math.round(
    new THREE.Vector3(a.x, a.y, a.z).distanceTo(
      new THREE.Vector3(c.x, c.y, c.z)
    )
  );
}

function getLengthColor(lengthMm) {
  return LENGTH_COLOR_MAP[lengthMm] || LENGTH_COLOR_MAP.order;
}

// 長さごとの色マップ（正本）
// ※ THREE.Color.set は "#rrggbb" を受け取れる
const LENGTH_COLOR_MAP = {
  25: "#9ca3af",   // グレー
  50: "#f97316",   // オレンジ
  100: "#facc15",  // イエロー
  150: "#84cc16",  // 黄緑
  200: "#ef4444",  // 赤
  300: "#2563eb",  // 青
  400: "#10b981",  // 緑
  500: "#0ea5e9",  // 水色
  600: "#a855f7",  // 紫
  800: "#ec4899",  // ピンク
  order: "#7c3aed" // マップにない長さ（オーダー扱い）
};

function applyConnectorLengthScale(mesh, targetLengthMm) {
  if (!mesh) return;

  // 初回に「元の長さ」を記録（= scale 1.0 のときの長さ）
  // ここはあなたの実装に合わせて既定値を調整してOK（例: 200mm）
  if (mesh.userData.baseLengthMm == null) {
    mesh.userData.baseLengthMm = Number(mesh.userData.lengthMmBase ?? 200);
  }

  const base = Number(mesh.userData.baseLengthMm) || 200;
  const len = Math.max(1, Number(targetLengthMm) || base);

  // 長さはローカルYでスケール（方向は回転で表す）
  const sx = mesh.scale?.x ?? 1;
  const sz = mesh.scale?.z ?? 1;
  const sy = len / base;

  mesh.scale.set(sx, sy, sz);
}
// =========================================================
// ★ 長さ適用（正本）
// - X方向だけでなく、Y / Z 方向にも対応
// - 基本は「a固定、bを動かす」方式
// =========================================================
function applyConnectorLengthToJoints(connType, connIndex, targetLengthMm) {
  const len = Math.max(1, Number(targetLengthMm) || 0);
  if (!len) return;

  const list = (connType === "beam") ? beams : (connType === "pole") ? poles : null;
  if (!list || !list[connIndex]) return;

  const c = list[connIndex];
  const aIdx = c.a;
  const bIdx = c.b;
  const a = joints[aIdx];
  const b = joints[bIdx];
  if (!a || !b) return;

  // 現在の方向ベクトル
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const adz = Math.abs(dz);

  // ほぼ軸方向（あなたのラックは基本これ）
  // “どの軸に沿ってるか”を判定して、その軸だけ動かす
  let axis = "x";
  if (ady >= adx && ady >= adz) axis = "y";
  else if (adz >= adx && adz >= ady) axis = "z";

  // 符号（どっち向きに伸びてるか）
  const sgn =
    axis === "x" ? (dx >= 0 ? 1 : -1) :
    axis === "y" ? (dy >= 0 ? 1 : -1) :
                   (dz >= 0 ? 1 : -1);

  // b を a から targetLengthMm だけ離れた位置へ
  const newB = { x: b.x, y: b.y, z: b.z };
  if (axis === "x") newB.x = a.x + sgn * len;
  if (axis === "y") newB.y = a.y + sgn * len;
  if (axis === "z") newB.z = a.z + sgn * len;

  // joints 更新（データ正本）
  // joints 更新（参照維持）
b.x = newB.x;
b.y = newB.y;
b.z = newB.z;

  // joint mesh も更新
  if (jointMeshes?.[bIdx]) {
    jointMeshes[bIdx].position.set(newB.x, newB.y, newB.z);
  }

  // コネクタの mesh を更新（向きQuaternion + scale.y）
  // ※ updateConnectorMesh があるならそれを優先
  if (typeof updateConnectorMesh === "function" && c.mesh) {
    updateConnectorMesh(c.mesh, joints[aIdx], joints[bIdx]);
  } else if (c.mesh) {
    // フォールバック：作り直す
    const mat = (connType === "beam") ? beamMaterial : poleMaterial;
    try { rackGroup.remove(c.mesh); } catch(_) {}
    c.mesh = createCylinderBetween(joints[aIdx], joints[bIdx], mat);
  }
  
  // ★板のサイズも更新（beam/poleの長さ変更に追従）
  if (typeof window.rebuildBoards === "function") {
    window.rebuildBoards();
  }

  // 長さメタ（必要なら）
  c.lengthMm = len;

  // 色/ストライプの再適用（状態に追従）
window.reapplyConnectorVisuals?.("after update connector length");


  // 見積もり更新
  calcAndRenderEstimate?.();
}

// =========================================
// オーダー材：毒蛇ストライプ（黒×黄）テクスチャ
// =========================================
let ORDER_STRIPE_TEX = null;

function getOrderStripeTexture() {
  if (ORDER_STRIPE_TEX) return ORDER_STRIPE_TEX;

  const w = 64, h = 256; // ★ 縦を長くするのがポイント
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff700"; // 蛍光イエロー
  ctx.fillRect(0, 0, w, h);

  const stripeH = 32;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < h; y += stripeH * 2) {
    ctx.fillRect(0, y, w, stripeH);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;

  ORDER_STRIPE_TEX = tex;
  return tex;
}

function applyOrderStripe(mesh, lengthMm) {
  if (!mesh || !mesh.material) return;

  // Material を完全分離
  const mat = mesh.material.clone();
  mesh.material = mat;

  // テクスチャも完全分離
  const baseTex = getOrderStripeTexture();
  const tex = baseTex.clone();
  tex.needsUpdate = true;

  mat.map = tex;
  mat.color.set(0xffffff); // ★ 必ず白！
  mat.toneMapped = false;
  mat.transparent = false;

  const stripePitchMm = 80;
  const repeatY = Math.max(1, (Number(lengthMm) || 200) / stripePitchMm);

  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, repeatY);

  if ("emissive" in mat) {
    mat.emissive.set(0xffffff);
    mat.emissiveIntensity = 0.25;
  }

  mat.wireframe = false;

  // ★長さ表現を壊さない：Y（長さ軸想定）を保持
  const sy = mesh.scale?.y ?? 1;
  mesh.scale.set(1, sy, 1);
}

// =========================================
// カラーチャート ON（正本）
// =========================================
function applyLengthColoring() {
  // ===== 観測：mesh が付いているか =====
  const beamHasMesh = beams?.filter?.(b => !!b?.mesh)?.length ?? "NA";
  const poleHasMesh = poles?.filter?.(p => !!p?.mesh)?.length ?? "NA";

  // 長さ変更モードONの時は選択中のコネクタを取得してスキップする
  const selectedMesh = window.__CR_SELECTED_CONNECTOR_MESH__;

  // ===== Beam =====
  let __loggedBeamOnce = false;

  beams.forEach((b, idx) => {
    if (!b.mesh) return;
    // 長さ変更モードONの時、選択中のコネクタはスキップ
    if (window.isLengthEditModeOn && b.mesh === selectedMesh) return;

    const mesh = b.mesh;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;

    const len = getBeamLength(b);

    if (!__loggedBeamOnce) {
      console.log("[applyLengthColoring:LATE] BEAM before", {
        idx,
        len,
        matColor: mat.color?.getHexString?.(),
        scaleBefore: { x: mesh.scale?.x, y: mesh.scale?.y, z: mesh.scale?.z },
      });
    }

    if (b.isCustom) {
      applyOrderStripe(mesh, len);
      const m2 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (m2) m2.needsUpdate = true;
    } else {
      mat.map = null;
      mat.color.set(getLengthColor(len));
      mat.wireframe = false;

      if ("emissive" in mat) {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1, sy, 1);

      mat.needsUpdate = true;
    }

    if (!__loggedBeamOnce) {
      const matAfter = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      console.log("[applyLengthColoring:LATE] BEAM after", {
        idx,
        matColorAfter: matAfter?.color?.getHexString?.(),
        scaleAfter: { x: mesh.scale?.x, y: mesh.scale?.y, z: mesh.scale?.z },
      });
      __loggedBeamOnce = true;
    }
  });

  // ===== Pole =====
  poles.forEach((p) => {
    if (!p.mesh) return;
    // 長さ変更モードONの時、選択中のコネクタはスキップ
    if (window.isLengthEditModeOn && p.mesh === selectedMesh) return;

    const mesh = p.mesh;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;

    const len = getPoleLength(p);

    if (p.isCustom) {
      applyOrderStripe(mesh, len);
      const m2 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (m2) m2.needsUpdate = true;
    } else {
      mat.map = null;
      mat.color.set(getLengthColor(len));
      mat.wireframe = false;

      if ("emissive" in mat) {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1, sy, 1);

      mat.needsUpdate = true;
    }
  });

  // ===== ★ここが「末尾」：色が維持されているかの最終確認 =====
  setTimeout(() => {
    const b0 = beams?.[0];
    const mesh = b0?.mesh;
    const mat = mesh
      ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)
      : null;

    console.log("[colorChart probe @100ms]", {
      isColorChartOn,
      matColorNow: mat?.color?.getHexString?.(),
      matMapNow: !!mat?.map,
      matWireNow: mat?.wireframe,
      scaleNow: mesh ? { x: mesh.scale?.x, y: mesh.scale?.y, z: mesh.scale?.z } : null,
    });
  }, 100);

} // ← ★この } の直前までが「applyLengthColoring の末尾」


// =========================================
// カラーチャート OFF（正本）
// =========================================
function resetOriginalColors() {
  // ★ デバッグ時だけ表示（通常は無音）
if (window.__CR_DBG_COLOR__) {
  console.log("[resetOriginalColors] called", { isColorChartOn });
  console.trace("[resetOriginalColors trace]");
}


  // ===== Beam =====
  beams.forEach((b, i) => {
    const isSelected =
      selectedConnector?.type === "beam" && selectedConnector.index === i;

    if (!b.mesh) return;

    const mesh = b.mesh;
    const mat = mesh.material;

    if (b.isCustom) {
      const orderLen = b.customLength != null ? b.customLength : getBeamLength(b);

      applyOrderStripe(mesh, orderLen);

      mat.wireframe = true;

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1.5, sy, 1.5);

      if ("emissive" in mat) {
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 0.35;
      }
    } else {
      mat.map = null;
      mat.color.copy(originalBeamColor);
      mat.wireframe = false;

      if ("emissive" in mat) {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1, sy, 1);
    }

    // ★最後に選択強調（これもY保持）
    if (isSelected) {
      if ("emissive" in mat) {
        mat.emissive.set(0xffaa00);
        mat.emissiveIntensity = 1.0;
      }

      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1.8, sy, 1.8);
    }

    mat.needsUpdate = true;
  });

  // ===== Pole =====
  poles.forEach((p, i) => {
    const isSelected =
      selectedConnector?.type === "pole" && selectedConnector.index === i;

    if (!p.mesh) return;

    const mesh = p.mesh;
    const mat = mesh.material;

    if (p.isCustom) {
      const orderLen = p.customLength != null ? p.customLength : getPoleLength(p);

      applyOrderStripe(mesh, orderLen);

      mat.wireframe = true;

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1.5, sy, 1.5);

      if ("emissive" in mat) {
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 0.35;
      }
    } else {
      mat.map = null;
      mat.color.copy(originalPoleColor);
      mat.wireframe = false;

      if ("emissive" in mat) {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }

      // ★長さ表現を壊さない：Y保持
      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1, sy, 1);
    }

    // ★最後に選択強調（これもY保持）
    if (isSelected) {
      if ("emissive" in mat) {
        mat.emissive.set(0xffaa00);
        mat.emissiveIntensity = 1.0;
      }

      const sy = mesh.scale?.y ?? 1;
      mesh.scale.set(1.8, sy, 1.8);
    }

    mat.needsUpdate = true;
  });
}

// =========================================================
// ★ 正本API：window に固定（参照ズレ防止）【LATE：正本】
//   - ColorChart ON : 長さ色（既存関数に委譲）
//   - ColorChart OFF: 材質色（b.material / p.material を正本にする）
// =========================================================
window.applyColorChartToAllConnectors = function () {
  const beamsVar = (typeof beams !== "undefined") ? beams : [];
  const polesVar = (typeof poles !== "undefined") ? poles : [];
  const jointsVar = (typeof joints !== "undefined") ? joints : [];
  const jointMeshesVar = (typeof jointMeshes !== "undefined") ? jointMeshes : [];
  const legsVar = (typeof legs !== "undefined") ? legs : [];

  // ★デバッグ時だけ
  if (window.__CR_DBG_COLOR__) {
    console.log("[applyColorChartToAllConnectors] isColorChartOn =", !!isColorChartOn, {
      beamsLen: beamsVar?.length,
      polesLen: polesVar?.length,
      jointsLen: jointsVar?.length,
    });
  }

  // ============================
  // 1) ColorChart ON → 長さ色へ
  // ============================
  if (!!isColorChartOn) {
    // ここは「長さ色」の既存正本に委譲（名前が違うなら合わせて）
    if (window.hasFunction && window.hasFunction("applyLengthColoring")) {
      window.applyLengthColoring();
    } else if (typeof applyLengthColoring === "function") {
      applyLengthColoring();
    }
    return;
  }

  // ==========================================
  // 2) ColorChart OFF → 材質色（ここが本丸）
  //   ★ジョイント材質でコネクタを塗らない
  // ==========================================
  // 長さ変更モードONの時は選択中のコネクタを取得してスキップする
  const selectedMesh = window.__CR_SELECTED_CONNECTOR_MESH__;
  
  // Beam
  beamsVar.forEach((b) => {
    if (!b?.mesh) return;
    // 長さ変更モードONの時、選択中のコネクタはスキップ
    if (window.isLengthEditModeOn && b.mesh === selectedMesh) return;
    const mat = (typeof normalizeMaterial === "function")
      ? normalizeMaterial(b.material)
      : (b.material || "IRON");
    if (typeof applyMaterialColorToMesh === "function") {
      applyMaterialColorToMesh(b.mesh, mat);
    }
  });

  // Pole
  polesVar.forEach((p) => {
    if (!p?.mesh) return;
    // 長さ変更モードONの時、選択中のコネクタはスキップ
    if (window.isLengthEditModeOn && p.mesh === selectedMesh) return;
    const mat = (typeof normalizeMaterial === "function")
      ? normalizeMaterial(p.material)
      : (p.material || "IRON");
    if (typeof applyMaterialColorToMesh === "function") {
      applyMaterialColorToMesh(p.mesh, mat);
    }
  });

  // Joint（ジョイントはジョイント自身の材質でOK）
  for (let i = 0; i < jointsVar.length; i++) {
    const jm = jointMeshesVar[i];
    if (!jm) continue;
    const j = jointsVar[i];
    const mat = (typeof normalizeMaterial === "function")
      ? normalizeMaterial(j?.material)
      : (j?.material || "IRON");
    if (typeof applyMaterialColorToMesh === "function") {
      applyMaterialColorToMesh(jm, mat);
    }
  }

  // Leg（legs.material が無ければ joints の材質を継承）
  legsVar.forEach((l) => {
    if (!l?.mesh) return;
    const jm = jointsVar?.[l.jointIndex]?.material;
    const matRaw = (l.material != null) ? l.material : jm;
    const mat = (typeof normalizeMaterial === "function")
      ? normalizeMaterial(matRaw)
      : (matRaw || "IRON");
    if (typeof applyMaterialColorToMesh === "function") {
      applyMaterialColorToMesh(l.mesh, mat);
    }
    l.material = mat; // 後工程で揺れないように確定
  });
};

// toggleColorChart は js/ui/ui.js に移動済み

// =========================================================
// 18. 見積もり画面への送信（3D → estimate.html）
// =========================================================

/**
 * 現在の見積もりデータを「送信用ペイロード」にまとめる
 * - currentEstimateParts を key / qty ベースに正規化する
 */
// 見積関連の関数は js/features/estimate.js に移動済み
// buildEstimatePayload, sendToEstimate は window 経由でアクセス可能
// buildEstimatePayload は js/features/estimate.js に移動済み
// window経由でアクセス可能

// sendToEstimate は js/features/estimate.js で window.sendToEstimate として定義済み


// =========================================================
// 19. Shift+ドラッグ用：カメラパン
// =========================================================

function panCamera(deltaX, deltaY) {
  const panSpeed = 0.5;
  const offset = new THREE.Vector3();
  offset.copy(camera.position).sub(controls.target);
  const targetDistance = offset.length();

  const height = 2 * targetDistance * Math.tan((camera.fov * Math.PI) / 360);

  const panX = (deltaX / window.viewEl.clientWidth) * height * panSpeed;
  const panY = (deltaY / window.innerHeight) * height * panSpeed;

  const pan = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);

  const matrix = new THREE.Matrix4();
  matrix.extractRotation(camera.matrix);

  xAxis.applyMatrix4(matrix);
  yAxis.applyMatrix4(matrix);

  pan.addScaledVector(xAxis, -panX);
  pan.addScaledVector(yAxis, panY);

  camera.position.add(pan);
  controls.target.add(pan);
}

// =========================================================
// ビュー切り替え（等角 / 上 / 前 / 右）
// =========================================================
function setCameraPresetView(mode) {
  if (!camera || !controls) return;

  const target = controls.target.clone();
  const dist = camera.position.distanceTo(target) || 800;

  const pos = new THREE.Vector3();

  switch (mode) {
    case "top":       // 真上：Y+
      pos.set(0, dist, 0.001);
      break;

    case "bottom":    // 真下：Y-
      pos.set(0, -dist, 0.001);
      break;

    case "front":     // 正面：Z+
      pos.set(0, 0, dist);
      break;

    case "back":      // 背面：Z-
      pos.set(0, 0, -dist);
      break;

    case "right":     // 右側面：X+
      pos.set(dist, 0, 0);
      break;

    case "left":      // 左側面：X-
      pos.set(-dist, 0, 0);
      break;

    case "iso":
    default: {
      // 斜め等角っぽいビュー（X=Y=Z 方向）
      const k = dist / Math.sqrt(3);
      pos.set(k, k, k);
      break;
    }
  }

  camera.position.copy(pos);
  camera.up.set(0, 1, 0);   // 上方向は常に Y+
  controls.target.copy(target);
  controls.update();
}

// ビューブロックのアクティブ面を更新
function updateViewCubeActive(mode) {
  const cube = document.getElementById("view-cube");
  if (!cube) return;

  const topFace = cube.querySelector(".cube-top");
  const frontFace = cube.querySelector(".cube-front");
  const rightFace = cube.querySelector(".cube-right");

  [topFace, frontFace, rightFace].forEach((f) => {
    f && f.classList.remove("is-active");
  });

  switch (mode) {
    case "top":
      topFace && topFace.classList.add("is-active");
      break;
    case "front":
      frontFace && frontFace.classList.add("is-active");
      break;
    case "right":
      rightFace && rightFace.classList.add("is-active");
      break;
    case "iso":
    default:
      // 等角ビューのときは全部非アクティブのままでもOK
      break;
  }
}

// =========================================================
// 20. 初期化 & 描画ループ
// =========================================================

const firstIndex = createJoint({ x: 0, y: 0, z: 0 });
setSelectedJoint(firstIndex);
addLegIfNeeded(firstIndex);

if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}



// 初期状態は「履歴がまだ空のときだけ」保存する
if (window.history.length === 0 && window.historyIndex < 0) {
  if (window.callIfExists) window.callIfExists("saveHistory");
}

function animate() {
  requestAnimationFrame(animate);

  controls.update();

  // ★ 背景写真時の目線固定補正
  if (typeof window.correctBackgroundEyeLevel === "function") {
    window.correctBackgroundEyeLevel();
  }

  // ★ カメラの向きとキューブを同期
  syncViewCubeWithCamera();

  // ★ カメラ距離に応じてグリッドを自動切り替え
  updateGridVisibilityByDistance();

  renderer.render(scene, camera);
}

animate();


window.addEventListener("resize", () => {
  const width = window.viewEl.clientWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// =========================================================
// 21. 自動レイアウトでラックを一気に生成
// =========================================================

// 既存デザインを全部消す
function clearAllDesign() {
  jointMeshes.forEach((m, idx) => {
    if (!m) return;
    disposeJointMeshByIndex(idx);
  });
  beams.forEach((b) => disposeBeamMesh(b));
  poles.forEach((p) => disposePoleMesh(p));
  legs.forEach((l) => disposeLegMesh(l));

  joints.length      = 0;
  jointMeshes.length = 0;
  beams.length       = 0;
  poles.length       = 0;
  legs.length        = 0;
}


// 自動レイアウト関連の関数は js/features/autolayout.js に移動済み
// - autoGenerateModulesFromConfig, rebuildJointClusters
// - getClusterIdFromJointIndex, getClusterIdFromConnector, isSameClusterByConnector
// - autoGenerateModules
// window経由でアクセス可能

// 既存のボタン（もし index.html に残っている場合）はそのまま動く
const autoBtn = document.getElementById("auto-generate-btn");
if (autoBtn) {
  autoBtn.addEventListener("click", () => {
    if (window.hasFunction && window.hasFunction("autoGenerateModules")) {
      window.autoGenerateModules();
    }
  });
}


// =======================================
// カラーチャートポップアップの中身を更新
// =======================================
function updateColorChartPopup() {
  const tbody = document.getElementById("colorchart-tbody");
  if (!tbody) return;

  // 一旦クリア
  tbody.innerHTML = "";

  // orderキーを除き、長さ順にソート
  const entries = Object.entries(LENGTH_COLOR_MAP)
    .filter(([key]) => key !== "order")
    .map(([len, color]) => ({ len: Number(len), color }))
    .sort((a, b) => a.len - b.len);

  for (const { len, color } of entries) {
    const tr = document.createElement("tr");

    const tdLen = document.createElement("td");
    tdLen.className = "colorchart-len";
    tdLen.textContent = `${len} mm`;

    const tdColor = document.createElement("td");
    tdColor.className = "colorchart-color";
    const chip = document.createElement("span");
    chip.className = "colorchip";
    chip.style.backgroundColor = color;

    tdColor.appendChild(chip);
    tr.appendChild(tdLen);
    tr.appendChild(tdColor);
    tbody.appendChild(tr);
  }
}

// setupOverlaysAndToggles は js/ui/ui.js に移動済み

// initMaterialSelectUI は js/ui/ui.js に移動済み

function applyColorChartState(reason = "unknown") {
  // ★ここは「状態を決める」のではなく「状態を反映する」だけにする
  console.log("[applyColorChartState] apply -> delegate to window.applyColorChartToAllConnectors()", {
    reason,
    isColorChartOn,
  });

  // UI同期（ボタン表示 / パネル表示）
  syncColorChartUI?.();

// 3D反映（最終適用APIへ委譲：ColorChart優先／OFFで材質色へ復帰）
window.reapplyConnectorVisuals?.("applyColorChartState");
} 

// =========================================================
// 起動処理（DOMができてから1回だけ実行）
// =========================================================
// initAutoLayoutToolButton は js/features/autolayout.js に移動済み

function bootApp() {
  // UI初期化は ui.js の initUI() で一元管理（DOM準備後に実行）
  if (typeof window.initUI === "function") {
    window.initUI();
  }
  if (typeof window.setupOverlaysAndToggles === "function") {
    window.setupOverlaysAndToggles();
  }
  if (window.callIfExists) window.callIfExists("initAutoLayoutToolButton");
  if (window.callIfExists) window.callIfExists("syncColorChartUI");

  if (typeof window.initMaterialSelectUI === "function") {
    window.initMaterialSelectUI();
  }
  if (typeof initMaterialApplyButtonsUI === "function") {
    initMaterialApplyButtonsUI();
  }
  if (typeof initSmallPartsMaterialUI === "function") {
    initSmallPartsMaterialUI();
  }
  if (typeof window.initDisplayFeatures === "function") {
    window.initDisplayFeatures();
  }

  if (typeof window.calcAndRenderEstimate === "function") {
    try { window.calcAndRenderEstimate(); } catch (_) {}
  }
}

async function bootAppWithPrices() {
  if (typeof window.loadPriceCatalog === "function") {
    try {
      await window.loadPriceCatalog();
    } catch (e) {
          console.warn("[pricing] 価格表の読み込みに失敗。parts-catalog.js の価格を使用します。", e);
    }
  }
  bootApp();
}

// DOMの準備ができたタイミングで確実に起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAppWithPrices);
} else {
  bootAppWithPrices();
}

function getSelectedConnectorInfo() {
  // selectedConnector の構造が揺れても壊れにくいように吸収する
  const sc = (typeof selectedConnector !== "undefined") ? selectedConnector : window.selectedConnector;
  if (!sc) return null;

  // type / kind / connType のどれかで "beam" / "pole" を持っている想定
  const t = String(sc.type || sc.kind || sc.connType || sc.connectorType || "").toLowerCase();

  // index / idx / i
  const idx = (typeof sc.index === "number") ? sc.index :
              (typeof sc.idx === "number") ? sc.idx :
              (typeof sc.i === "number") ? sc.i :
              null;

  if (!Number.isFinite(idx) || idx < 0) return null;

  if (t.includes("beam")) return { type: "beam", index: idx };
  if (t.includes("pole")) return { type: "pole", index: idx };

  // 型が読めない場合は null（誤適用防止）
  return null;
}

function applyMaterialToConnector(type, index, mat) {
  const m = normalizeMaterial(mat || "IRON");

  if (type === "beam") {
    const b = window.beams?.[index];
    if (!b) return false;
    b.material = m;
    if (b.mesh) applyMaterialColorToMesh(b.mesh, m);
    return true;
  }

  if (type === "pole") {
    const p = window.poles?.[index];
    if (!p) return false;
    p.material = m;
    if (p.mesh) applyMaterialColorToMesh(p.mesh, m);
    return true;
  }

  return false;
}

function applyMaterialToAllOfType(type, mat) {
  const m = normalizeMaterial(mat || "IRON");

  if (type === "beam" && Array.isArray(window.beams)) {
    for (const b of window.beams) {
      if (!b) continue;
      b.material = m;
      if (b.mesh) applyMaterialColorToMesh(b.mesh, m);
    }
    return true;
  }

  if (type === "pole" && Array.isArray(window.poles)) {
    for (const p of window.poles) {
      if (!p) continue;
      p.material = m;
      if (p.mesh) applyMaterialColorToMesh(p.mesh, m);
    }
    return true;
  }

  return false;
}

function afterMaterialChange(reason) {
  // 見積・3D見た目を最終状態へ（D1）
  try { calcAndRenderEstimate?.(); } catch (_) {}
  try { window.reapplyConnectorVisuals?.(reason || "material change"); } catch (_) {}
}

function initMaterialApplyButtonsUI() {
  const btnSel  = document.getElementById("mat-apply-selected");
  const btnBeam = document.getElementById("mat-apply-all-beam");
  const btnPole = document.getElementById("mat-apply-all-pole");
  const selMat  = document.getElementById("material-select");

  if (!btnSel || !btnBeam || !btnPole || !selMat) return;

  // 二重登録防止
  if (btnSel.__matBound) return;
  btnSel.__matBound = btnBeam.__matBound = btnPole.__matBound = true;

  function currentMatFromUI() {
    return normalizeMaterial(selMat.value || window.__CR_CURRENT_MATERIAL__ || "IRON");
  }

  btnSel.addEventListener("click", () => {
    // トグル動作：材質適用モードのON/OFF
    const isActive = !!window.__CR_MATERIAL_APPLY_MODE__;
    
    if (isActive) {
      // モード解除
      window.__CR_MATERIAL_APPLY_MODE__ = false;
      btnSel.classList.remove("btn-primary");
      btnSel.classList.add("btn-secondary");
      btnSel.textContent = "適用";
      
      // 案内メッセージを非表示
      const notice = document.getElementById("material-apply-notice");
      if (notice) notice.style.display = "none";
      
      // プレビューを非表示
      hidePreview?.();
      hideLegPreview?.();
    } else {
      // モード有効化
      window.__CR_MATERIAL_APPLY_MODE__ = true;
      btnSel.classList.remove("btn-secondary");
      btnSel.classList.add("btn-primary");
      btnSel.textContent = "適用中";
      
      // 案内メッセージを表示
      const notice = document.getElementById("material-apply-notice");
      if (notice) notice.style.display = "block";
      
      // プレビューを非表示
      hidePreview?.();
      hideLegPreview?.();
    }
  });

  btnBeam.addEventListener("click", () => {
    const ok = applyMaterialToAllOfType("beam", currentMatFromUI());
    if (!ok) return;
    afterMaterialChange("apply material to all beams");
  });

  btnPole.addEventListener("click", () => {
    const ok = applyMaterialToAllOfType("pole", currentMatFromUI());
    if (!ok) return;
    afterMaterialChange("apply material to all poles");
  });
}

// =========================================================
// 操作説明ページ（help.html）を開く
// =========================================================
(() => {
  const helpPageBtn = document.getElementById("help-page-btn");
  if (!helpPageBtn) return;

  helpPageBtn.addEventListener("click", () => {
    window.open("help.html", "_blank", "noopener,noreferrer");
  });
})();

// =========================================================
// colorchart-close-btn を「必ず閉じる」保険（pointerdown / capture）
//  - drag処理が click を潰しても閉じられる
// =========================================================
(function installColorChartCloseHardener() {
  if (window.__CR_COLORCHART_CLOSE_HARDENER__) return;
  window.__CR_COLORCHART_CLOSE_HARDENER__ = true;

  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!t || !t.closest) return;

      const btn = t.closest("#colorchart-close-btn");
      if (!btn) return;

      // ここで止める（drag開始や他の捕捉処理に負けない）
      e.preventDefault();
      e.stopPropagation();

      // 正本APIでOFF
      try { window.toggleColorChart?.(false); } catch {}

      // DOMも保険で隠す（状態ズレ対策）
      const overlay = document.getElementById("colorchart-overlay");
      if (overlay) overlay.classList.add("hidden");
    },
    true
  );
})();

// =========================================================
// 図面ボタン（drawing.html を開く＆データ送信）
// =========================================================
(function bindDrawingButton() {
  const btn = document.getElementById("btn-open-drawing");
  const hint = document.getElementById("drawing-hint");
  if (!btn) return;

  const DRAWING_URL = "./drawing.html";

  let drawingWin = null;
  let drawingReady = false;
  let lastSentHash = "";

  function setHint(text) {
    if (hint) hint.textContent = text;
  }

  // 送信用に「クローン可能なJSON」だけを抽出する（mesh / 関数 / THREEオブジェクトを除去）
  function buildDrawingPayload() {
    function toPlainJoint(j) {
      if (!j) return null;
      return { x: Number(j.x) || 0, y: Number(j.y) || 0, z: Number(j.z) || 0 };
    }

    // Beam と Pole は同じ構造なので統合
    function toPlainConnector(c) {
      if (!c) return null;
      const A = typeof c.a === "number" ? c.a : (typeof c.jointA === "number" ? c.jointA : null);
      const B = typeof c.b === "number" ? c.b : (typeof c.jointB === "number" ? c.jointB : null);
      if (A === null || B === null) return null;

      const out = { a: A, b: B };
      if (typeof c.lengthMm === "number") out.lengthMm = c.lengthMm;
      if (typeof c.axis === "string") out.axis = c.axis;
      if (typeof c.isOrder === "boolean") out.isOrder = c.isOrder;
      if (typeof c.isCustom === "boolean") out.isCustom = c.isCustom;
      return out;
    }

    function toPlainLeg(lg) {
      if (!lg) return null;

      const ji =
        typeof lg.jointIndex === "number" ? lg.jointIndex :
        typeof lg.jointIdx === "number" ? lg.jointIdx :
        typeof lg.ji === "number" ? lg.ji :
        typeof lg.joint === "number" ? lg.joint :
        typeof lg.jointId === "number" ? lg.jointId :
        typeof lg.jointID === "number" ? lg.jointID :
        null;

      if (ji === null) return null;

      const out = { jointIndex: ji };

      const len =
        (typeof lg.lengthMm === "number" && lg.lengthMm > 0) ? lg.lengthMm :
        (typeof lg.length === "number" && lg.length > 0) ? lg.length :
        (typeof lg.lenMm === "number" && lg.lenMm > 0) ? lg.lenMm :
        (typeof lg.len === "number" && lg.len > 0) ? lg.len :
        0;

      if (len > 0) out.lengthMm = len;
      return out;
    }

    const srcJoints = (typeof joints !== "undefined" ? joints : (window.joints || []));
    const srcBeams  = (typeof beams  !== "undefined" ? beams  : (window.beams  || []));
    const srcPoles  = (typeof poles  !== "undefined" ? poles  : (window.poles  || []));
    const srcLegs   = (typeof legs   !== "undefined" ? legs   : (window.legs   || []));

    return {
      joints: Array.isArray(srcJoints) ? srcJoints.map(toPlainJoint) : [],
      beams:  Array.isArray(srcBeams)  ? srcBeams.map(toPlainConnector).filter(Boolean) : [],
      poles:  Array.isArray(srcPoles)  ? srcPoles.map(toPlainConnector).filter(Boolean) : [],
      legs:   Array.isArray(srcLegs)   ? srcLegs.map(toPlainLeg).filter(Boolean)  : [],
    };
  }

  // グローバルに公開
  window.buildDrawingPayload = buildDrawingPayload;

  function safeHash(obj) {
    try {
      const s = JSON.stringify(obj);
      return s.length + ":" + s.slice(0, 200);
    } catch {
      return String(Date.now());
    }
  }

  function openOrFocusDrawing() {
    if (drawingWin && !drawingWin.closed) {
      drawingWin.focus();
      return true;
    }

    drawingReady = false;
    drawingWin = window.open(DRAWING_URL, "CubeRackDrawing", "width=1200,height=820");
    if (!drawingWin) {
      setHint("ポップアップがブロックされています。許可してもう一度押してください。");
      return false;
    }
    setHint("図面ウィンドウ起動中…");
    return true;
  }

  function sendToDrawing(force = false) {
    if (!drawingWin || drawingWin.closed) return;
    if (!drawingReady) return;

    const payload = buildDrawingPayload();
    const h = safeHash(payload);
    if (!force && h === lastSentHash) return;
    lastSentHash = h;

    try {
      drawingWin.postMessage({ type: "CUBERACK_DRAWING_DATA", payload }, "*");
      setHint("図面に送信しました。");
    } catch {
      setHint("図面への送信に失敗しました。");
    }
  }

  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "CUBERACK_DRAWING_READY") {
      drawingReady = true;
      setHint("図面が準備できました。データ送信中…");
      sendToDrawing(true);
    }
  });

  btn.addEventListener("click", () => {
    if (!openOrFocusDrawing()) return;

    const t0 = Date.now();
    const timer = setInterval(() => {
      if (!drawingWin || drawingWin.closed) { clearInterval(timer); return; }
      if (drawingReady) {
        sendToDrawing(true);
        clearInterval(timer);
        return;
      }
      if (Date.now() - t0 > 5000) {
        setHint("図面が準備できません（drawing.js読込/エラーの可能性）");
        clearInterval(timer);
      }
    }, 200);
  });

  function refreshEnabledState() {
    const ok = (window.joints && window.joints.length > 0);
    btn.disabled = !ok;
    setHint(ok ? "図面を開いて出力できます。" : "データ準備中…");
  }

  refreshEnabledState();
  window.__CR_refreshDrawingButton = refreshEnabledState;
  window.__CR_sendDrawingNow = () => sendToDrawing(true);
})();

// =========================================================
// FIT ボタン（CUBERACK FIT を別タブで開く）
// =========================================================
(function bindFitButton() {
  const btn = document.getElementById("btn-open-fit");
  if (!btn) return;

  const FIT_URL = "https://cuberack-fit.netlify.app/";

  btn.addEventListener("click", () => {
    try {
      window.open(FIT_URL, "_blank", "noopener,noreferrer");
    } catch (e) {
      window.location.href = FIT_URL;
    }
  });
})();

// =========================================================
// FIX: applyMaterialColorToAllConnectors に JointBall/Leg を確実に含める（A1/B1）
// =========================================================
window.applyMaterialColorToAllConnectors = function () {
  // Beam/Pole
  if (Array.isArray(window.beams)) {
    for (const b of window.beams) {
      if (!b || !b.mesh) continue;
      applyMaterialColorToMesh(b.mesh, b.material);
    }
  }
  if (Array.isArray(window.poles)) {
    for (const p of window.poles) {
      if (!p || !p.mesh) continue;
      applyMaterialColorToMesh(p.mesh, p.material);
    }
  }

  // ★B1: jointBall（球メッシュ）
  const matJB = getPartTypeMaterial("jointBall");
  if (Array.isArray(window.jointMeshes)) {
    for (const jm of window.jointMeshes) {
      if (!jm) continue;
      applyMaterialColorToMesh(jm, matJB);
    }
  }

  // ★B1: leg（legs配列のmeshプロパティを使用）
  const matLeg = getPartTypeMaterial("leg");
  if (Array.isArray(window.legs)) {
    for (const lg of window.legs) {
      if (!lg || !lg.mesh) continue;
      applyMaterialColorToMesh(lg.mesh, matLeg);
    }
  }
};

// =========================================================
// 互換ブリッジ：旧UI（applyLengthToSelectedConnector等）→ v1.0.9 正本APIへ
// =========================================================
(function installLengthCompatBridge() {
  // 旧：選択コネクタ参照（UIがこれを見に行く場合がある）
  if (typeof window.selectedConnector === "undefined" && window.hasFunction && window.hasFunction("getSelectedConnectorInfo")) {
    Object.defineProperty(window, "selectedConnector", {
      configurable: true,
      get() {
        try { return window.getSelectedConnectorInfo(); } catch { return null; }
      },
    });
  }

  // 旧：適用関数名
  if (typeof window.applyLengthToSelectedConnector === "undefined" && window.hasFunction && window.hasFunction("setSelectedConnectorLengthMm")) {
    window.applyLengthToSelectedConnector = function (mm, reason = "compat") {
      const v = Number(mm);
      if (!Number.isFinite(v) || v <= 0) return false;
      try {
        window.setSelectedConnectorLengthMm(v);
        // 既存のUI更新関数があるなら同期
        try { window.updateSelectedConnectorUI?.(); } catch {}
        return true;
      } catch (e) {
        console.warn("[compat] applyLengthToSelectedConnector failed", e);
        return false;
      }
    };
  }

  // 旧：取得関数があれば合わせる（必要なら）
  if (typeof window.getSelectedConnectorLengthMmSafe === "undefined" && window.hasFunction && window.hasFunction("getSelectedConnectorLengthMm")) {
    window.getSelectedConnectorLengthMmSafe = function () {
      try { return window.getSelectedConnectorLengthMm(); } catch { return 0; }
    };
  }
})();
