// =========================================================
// 状態管理とデータ構造
// =========================================================

// =========================================================
// 3. データ構造
// =========================================================

const joints = [];
const jointMeshes = [];
const beams = []; // {a,b,mesh,label,length}
const poles = []; // {a,b,mesh,label,length}
const legs = [];  // {jointIndex,mesh}
window.legs = legs;
const customOrderBeams = [];

// =========================================================
// Boards（棚板 / 壁板）
// - V1.1.1: まずは「ジョイント4点選択」で追加する最小実装
// =========================================================
const shelves = []; // { j4:[a,b,c,d], thicknessMm, material, mesh }
const panels  = []; // { j4:[a,b,c,d], thicknessMm, material, side, mesh }

window.shelves = shelves;
window.panels = panels;

// 追加モード（UIからON/OFF）
window.isBoardModeOn = false;

let selectedJointIndex = null;

let showBeamLength = false;

// =========================================================
// クラスター情報（ラックをグループ分けするためのメタデータ）
// =========================================================

// jointClusters[n] = {
//   joints: [jointIndex, ...],
//   beams:  [beamIndex, ...],
//   poles:  [poleIndex, ...],
// }
let jointClusters = [];

// 各 joint がどのクラスターに属しているか（-1 = 未所属）
let jointClusterId = [];

// =========================================================
// 状態変数
// =========================================================

// 🔵 カラーチャート ON/OFF フラグ（唯一の正本：initUIより前に必要）
let isColorChartOn = false;

// グリッド表示のON/OFF状態（UIから参照される）
let gridEnabled = true;

// -----------------------------
// 状態
// -----------------------------
let currentPartType = "beam";
let currentLengthMm = 200;
window.isOrderModeOn = false;
window.currentPartType = currentPartType; // ★追加

// 長さプリセット
const BEAM_LENGTH_OPTIONS = [25, 50, 100, 150, 200, 300, 400, 600, 800];
const POLE_LENGTH_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];

function getCurrentLengthList() {
  // window.currentPartType を正本として使用
  const partType = window.currentPartType || currentPartType || "beam";
  return partType === "beam"
    ? BEAM_LENGTH_OPTIONS
    : POLE_LENGTH_OPTIONS;
}

// -----------------------------
// オーダー状態
// -----------------------------
function isOrderMode() {
  return !!window.isOrderModeOn;
}

function getEffectiveCurrentLength() {
  return isOrderMode() && currentOrderLengthMm != null
    ? currentOrderLengthMm
    : currentLengthMm;
}

// ★ Order 長（mm）: オーダーモードで使う入力値
let currentOrderLengthMm = null;

// ==============================
// v1.0.6 長さ変更モード（排他ピック用・正本）
// ==============================
window.isLengthEditModeOn = false;

let selectedConnector = null; 

// ==============================
// v1.0.6 接続モード
// ==============================
let isConnectModeOn = false;
let connectFromJointIndex = null;
let _connectFromPrevColor = null; // ハイライト復元用

window.isConnectModeOn = false;
window.connectFromJointIndex = null;

// =========================================================
// プレビュー状態
// =========================================================
let previewTargetPos = null;
let previewConnector = null;
let previewJoint = null;

let previewLegMesh = null;
let previewLegJointIndex = null;

// グローバルに公開（他のモジュールから参照可能にする）
// プロパティ経由で常に最新の値を参照できるようにする
Object.defineProperty(window, 'previewTargetPos', {
  get: () => previewTargetPos,
  set: (v) => { previewTargetPos = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'previewConnector', {
  get: () => previewConnector,
  set: (v) => { previewConnector = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'previewJoint', {
  get: () => previewJoint,
  set: (v) => { previewJoint = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'previewLegMesh', {
  get: () => previewLegMesh,
  set: (v) => { previewLegMesh = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'previewLegJointIndex', {
  get: () => previewLegJointIndex,
  set: (v) => { previewLegJointIndex = v; },
  configurable: true,
  enumerable: true
});

// =========================================================
// マウス・ドラッグ状態
// =========================================================
let isLeftMouseDown = false; // 左ボタン押しっぱなし判定
let isShiftPanning = false;  // Shift+ドラッグでパン中かどうか
let lastPanX = 0;
let lastPanY = 0;
let didDrag = false;         // ドラッグかクリックかの判定用

// グローバルに公開（他のモジュールから参照可能にする）
// プロパティ経由で常に最新の値を参照できるようにする
Object.defineProperty(window, 'isLeftMouseDown', {
  get: () => isLeftMouseDown,
  set: (v) => { isLeftMouseDown = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'isShiftPanning', {
  get: () => isShiftPanning,
  set: (v) => { isShiftPanning = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'lastPanX', {
  get: () => lastPanX,
  set: (v) => { lastPanX = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'lastPanY', {
  get: () => lastPanY,
  set: (v) => { lastPanY = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'didDrag', {
  get: () => didDrag,
  set: (v) => { didDrag = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, '_connectFromPrevColor', {
  get: () => _connectFromPrevColor,
  set: (v) => { _connectFromPrevColor = v; },
  configurable: true,
  enumerable: true
});

// =========================================================
// Undo/Redo 履歴
// =========================================================
let history = [];
let historyIndex = -1;

// =========================================================
// ハイライト状態
// =========================================================
let highlightedObject = null;
let originalMaterial = null;

// =========================================================
// ファイル管理
// =========================================================
let currentFileName = "未保存のデザイン";
let isDirty = false;
let hasEverRendered = false;

const MRU_KEY = "mfes_recent_files";

// =========================================================
// 自動レイアウト（高さ情報）
// =========================================================
// cellStageData[row][col] = { stages: number, heights: number[] } or null
let cellStageData = null;

// ビューブロック同期用
let viewCubeEl = null;
const _viewCubeEuler = new THREE.Euler();
const _viewCubeQuat = new THREE.Quaternion();

// ===== window 参照の整合（常に最新を返す：参照ズレ防止）=====
(function bindArrayRefsToWindow() {
  const def = (name, getter) => {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: getter,
        set(v) {
          console.warn(`[window.${name}] setter blocked; use in-scope var instead`, v);
        },
      });
    } catch (e) {
      // defineProperty できない環境向けのフォールバック
      window[name] = getter();
    }
  };

  def("joints", () => joints);
  def("jointMeshes", () => jointMeshes);
  def("beams",  () => beams);
  def("poles",  () => poles);
})();

// グローバルに公開する関数と定数
window.getCurrentLengthList = getCurrentLengthList;
window.isOrderMode = isOrderMode;
window.getEffectiveCurrentLength = getEffectiveCurrentLength;
window.BEAM_LENGTH_OPTIONS = BEAM_LENGTH_OPTIONS;
window.POLE_LENGTH_OPTIONS = POLE_LENGTH_OPTIONS;

// 履歴管理をグローバルに公開
Object.defineProperty(window, 'history', {
  get: () => history,
  set: (v) => { history = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'historyIndex', {
  get: () => historyIndex,
  set: (v) => { historyIndex = v; },
  configurable: true,
  enumerable: true
});

// 自動レイアウトとビューブロック同期をグローバルに公開
Object.defineProperty(window, 'cellStageData', {
  get: () => cellStageData,
  set: (v) => { cellStageData = v; },
  configurable: true,
  enumerable: true
});
Object.defineProperty(window, 'viewCubeEl', {
  get: () => viewCubeEl,
  set: (v) => { viewCubeEl = v; },
  configurable: true,
  enumerable: true
});
// _viewCubeEuler と _viewCubeQuat は内部使用のため、直接公開
window._viewCubeEuler = _viewCubeEuler;
window._viewCubeQuat = _viewCubeQuat;

// selectedConnector をグローバルに公開
Object.defineProperty(window, 'selectedConnector', {
  get: () => selectedConnector,
  set: (v) => { selectedConnector = v; },
  configurable: true,
  enumerable: true
});

// currentOrderLengthMm をグローバルに公開
Object.defineProperty(window, 'currentOrderLengthMm', {
  get: () => currentOrderLengthMm,
  set: (v) => { currentOrderLengthMm = v; },
  configurable: true,
  enumerable: true
});

// currentLengthMm をグローバルに公開
Object.defineProperty(window, 'currentLengthMm', {
  get: () => currentLengthMm,
  set: (v) => { currentLengthMm = v; },
  configurable: true,
  enumerable: true
});

// isOrderMode, getEffectiveCurrentLength をグローバルに公開
window.isOrderMode = isOrderMode;
window.getEffectiveCurrentLength = getEffectiveCurrentLength;

// currentFileName, isDirty, hasEverRendered をグローバルに公開
Object.defineProperty(window, 'currentFileName', {
  get: () => currentFileName,
  set: (v) => { currentFileName = v; },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'isDirty', {
  get: () => isDirty,
  set: (v) => { isDirty = v; },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'hasEverRendered', {
  get: () => hasEverRendered,
  set: (v) => { hasEverRendered = v; },
  configurable: true,
  enumerable: true
});

// MRU_KEY をグローバルに公開
window.MRU_KEY = MRU_KEY;

// highlightedObject, originalMaterial をグローバルに公開
Object.defineProperty(window, 'highlightedObject', {
  get: () => highlightedObject,
  set: (v) => { highlightedObject = v; },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'originalMaterial', {
  get: () => originalMaterial,
  set: (v) => { originalMaterial = v; },
  configurable: true,
  enumerable: true
});

// showBeamLength をグローバルに公開
Object.defineProperty(window, 'showBeamLength', {
  get: () => showBeamLength,
  set: (v) => { showBeamLength = v; },
  configurable: true,
  enumerable: true
});

// gridEnabled をグローバルに公開
Object.defineProperty(window, 'gridEnabled', {
  get: () => gridEnabled,
  set: (v) => { gridEnabled = v; },
  configurable: true,
  enumerable: true
});

// isColorChartOn をグローバルに公開
Object.defineProperty(window, 'isColorChartOn', {
  get: () => isColorChartOn,
  set: (v) => { isColorChartOn = v; },
  configurable: true,
  enumerable: true
});
