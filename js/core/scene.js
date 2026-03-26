// =========================================================
// 3Dシーン初期化
// =========================================================

const viewEl = document.getElementById("view");
if (!viewEl) {
  console.error("[scene] #view element not found");
}

const scene = new THREE.Scene();
// === CubeRack 全体をまとめるグループ ===
const rackGroup = new THREE.Group();
scene.add(rackGroup);

scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(
  45,
  viewEl.clientWidth / window.innerHeight,
  1,
  40000
);
camera.position.set(1800, 1200, 1800);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewEl.clientWidth, window.innerHeight);
viewEl.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// グローバルに公開
window.scene = scene;
window.rackGroup = rackGroup;
window.camera = camera;
window.renderer = renderer;
window.controls = controls;
window.raycaster = raycaster;
window.mouse = mouse;
window.viewEl = viewEl;
