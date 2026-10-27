// =========================================================
// 図面ウィンドウ内の直接 WebGL プレビュー
// - CAD の部材正本は持たない（配置・色のスナップショットのみ）
// - 操作中は JPEG を作らず requestAnimationFrame で描画
// - 印刷・操作終了後の高品質は CAD 側キャプチャを使う
// - カラーチャート ON 時は MeshBasic + NoToneMapping で凡例 hex と一致
// =========================================================
(function () {
  const POOL_R = 4;
  const JOINT_R = 10;
  let renderer = null;
  let canvas = null;
  let scene = null;
  let camera = null;
  let lightGroup = null;
  let meshes = [];
  let snapshot = null;
  let view = null;
  let overlay = null;
  let quality = "high";
  let dirty = false;
  let raf = 0;
  let interacting = false;
  let lastMs = 0;
  const perf = [];
  const orthoSlots = {};

  function THREERef() { return window.THREE; }

  function math() { return window.v3DrawingView; }

  function pushPerf(ms) {
    lastMs = ms;
    perf.push({ t: Date.now(), ms: ms, quality: quality });
    if (perf.length > 60) perf.shift();
    window.__crDrawLocalPerf = { lastMs: lastMs, samples: perf.slice(-20) };
  }

  function segs() {
    return quality === "low" ? 8 : 12;
  }

  function pixelRatio() {
    if (quality === "low") return 1;
    return Math.min(1.5, window.devicePixelRatio || 1);
  }

  function geomOf(kind, THREE) {
    if (kind === "joint") return new THREE.SphereGeometry(JOINT_R, segs() + 4, Math.max(6, segs() - 2));
    if (kind === "legBase") return new THREE.CylinderGeometry(12.5, 12.5, 5, segs());
    if (kind === "legCone") return new THREE.CylinderGeometry(7.5, 12.5, 7.5, segs());
    return new THREE.CylinderGeometry(POOL_R, POOL_R, 1, segs());
  }

  function matOf(THREE, colorChart, finish) {
    if (colorChart) {
      return new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: finish && typeof finish.metalness === "number" ? finish.metalness : 0.10,
      roughness: finish && typeof finish.roughness === "number" ? finish.roughness : 0.92,
      vertexColors: false,
    });
    if (mat.emissive) {
      mat.emissive.setHex((finish && finish.emissive) || 0x000000);
      mat.emissiveIntensity = (finish && finish.emissiveIntensity) || 0;
    }
    return mat;
  }

  function configureRenderer(r, THREE, colorChart, alpha) {
    if (!r || !THREE) return;
    if (THREE.SRGBColorSpace && r.outputColorSpace !== undefined) {
      r.outputColorSpace = THREE.SRGBColorSpace;
    } else if (typeof THREE.sRGBEncoding === "number") {
      r.outputEncoding = THREE.sRGBEncoding;
    }
    if (colorChart && THREE.NoToneMapping != null) {
      r.toneMapping = THREE.NoToneMapping;
      r.toneMappingExposure = 1;
    } else if (typeof THREE.ACESFilmicToneMapping === "number") {
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.18;
    }
    if (typeof r.setClearColor === "function") {
      r.setClearColor(0xffffff, alpha ? 0 : 1);
    }
  }

  function disposeMeshes() {
    meshes.forEach(function (m) {
      try { if (m.parent) m.parent.remove(m); } catch (e) {}
      try { if (m.geometry && m.geometry.dispose) m.geometry.dispose(); } catch (e2) {}
      try { if (m.material && m.material.dispose) m.material.dispose(); } catch (e3) {}
    });
    meshes = [];
  }

  function ensureScene() {
    const THREE = THREERef();
    if (!THREE || scene) return !!scene;
    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera((math() && math().FOV_DEG) || 30, 1.6, 1, 20000);
    lightGroup = new THREE.Group();
    lightGroup.add(new THREE.HemisphereLight(0xffffff, 0x8a8680, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1, 2, 1);
    lightGroup.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.28);
    fill.position.set(-1, 0.4, -0.6);
    lightGroup.add(fill);
    scene.add(lightGroup);
    return true;
  }

  function applySnapshot(snap) {
    snapshot = snap;
    const THREE = THREERef();
    if (!THREE || !ensureScene() || !snap) return;
    disposeMeshes();
    const colorChart = !!snap.colorChartOn;
    if (renderer) configureRenderer(renderer, THREE, colorChart, false);
    Object.keys(orthoSlots).forEach(function (id) {
      const slot = orthoSlots[id];
      if (slot && slot.renderer) configureRenderer(slot.renderer, THREE, colorChart, true);
    });
    (snap.groups || []).forEach(function (g) {
      const n = g.count || 0;
      if (!n) return;
      const finish = (snap.finishes && snap.finishes[g.mat]) || (snap.finishes && snap.finishes.IRON);
      const mesh = new THREE.InstancedMesh(geomOf(g.kind, THREE), matOf(THREE, colorChart, finish), n);
      mesh.count = n;
      mesh.frustumCulled = false;
      const mtx = new THREE.Matrix4();
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        mtx.fromArray(g.matrices, i * 16);
        mesh.setMatrixAt(i, mtx);
        col.setRGB(g.colors[i * 3] || 0, g.colors[i * 3 + 1] || 0, g.colors[i * 3 + 2] || 0);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      meshes.push(mesh);
    });
    dirty = true;
    renderSoon();
    renderAllOrtho();
  }

  function placeCamera() {
    const THREE = THREERef();
    const m = math();
    if (!camera || !m || !view) return;
    const box = snapshot && snapshot.box;
    const aspect = camera.aspect || 1.6;
    const st = m.normalize(view, box, aspect);
    view = st;
    const pose = m.cameraPose(st);
    camera.fov = m.FOV_DEG;
    camera.near = Math.max(1, st.radius / 220);
    camera.far = st.radius * 28;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    if (Math.abs(pose.offset.y) / Math.max(1, st.radius) > 0.98) {
      camera.up.set(0, 0, pose.offset.y > 0 ? -1 : 1);
    } else {
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    camera.updateProjectionMatrix();
    if (lightGroup) {
      const c = box ? m.boxInfo(box).center : pose.target;
      const s = box ? m.boxInfo(box).size : { x: st.radius, y: st.radius, z: st.radius };
      const key = lightGroup.children[1];
      const fill = lightGroup.children[2];
      if (key) key.position.set(c.x + s.x * 0.8, c.y + s.y * 1.6, c.z + s.z * 0.5);
      if (fill) fill.position.set(c.x - s.x * 1.0, c.y + s.y * 0.4, c.z - s.z * 0.4);
      lightGroup.visible = !(snapshot && snapshot.colorChartOn);
    }
  }

  function sizeToOverlay() {
    if (!renderer || !overlay || !canvas) return;
    const w = Math.max(2, Math.round(overlay.clientWidth || 2));
    const h = Math.max(2, Math.round(overlay.clientHeight || 2));
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function renderNow() {
    if (!renderer || !scene || !camera || !canvas) return;
    if (canvas.style.display === "none") return;
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    sizeToOverlay();
    placeCamera();
    const colorChart = !!(snapshot && snapshot.colorChartOn);
    renderer.setClearColor(0xffffff, 1);
    if (lightGroup) lightGroup.visible = !colorChart;
    renderer.render(scene, camera);
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    pushPerf(t1 - t0);
    dirty = false;
  }

  function loop() {
    raf = 0;
    if (dirty || interacting) renderNow();
    if (interacting) raf = requestAnimationFrame(loop);
  }

  function renderSoon() {
    dirty = true;
    if (raf) return;
    raf = requestAnimationFrame(loop);
  }

  function ensureRenderer() {
    const THREE = THREERef();
    if (!THREE || renderer || !overlay) return !!renderer;
    canvas = document.createElement("canvas");
    canvas.id = "draw-iso-gl";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.display = "block";
    overlay.insertBefore(canvas, overlay.firstChild);
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: quality !== "low",
      alpha: false,
      powerPreference: quality === "low" ? "low-power" : "high-performance",
    });
    configureRenderer(renderer, THREE, !!(snapshot && snapshot.colorChartOn), false);
    ensureScene();
    if (snapshot) applySnapshot(snapshot);
    return true;
  }

  function attach(el) {
    overlay = el;
    if (canvas && overlay && canvas.parentNode !== overlay) {
      try { if (renderer) renderer.dispose(); } catch (e) {}
      renderer = null;
      canvas = null;
    }
    ensureRenderer();
    dirty = true;
    renderSoon();
  }

  function setView(next) {
    view = next;
    dirty = true;
  }

  function setQuality(q) {
    const next = q === "low" ? "low" : "high";
    if (next === quality) return;
    quality = next;
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      renderer = null;
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    Object.keys(orthoSlots).forEach(function (id) { disposeOrtho(id); });
    disposeMeshes();
    scene = null;
    camera = null;
    lightGroup = null;
    if (overlay) ensureRenderer();
  }

  function hasScene() {
    return !!(snapshot && snapshot.groups && snapshot.groups.length && THREERef());
  }

  function setPrint(on) {
    if (canvas) canvas.style.display = on ? "none" : "block";
    Object.keys(orthoSlots).forEach(function (id) {
      const slot = orthoSlots[id];
      if (slot && slot.canvas) slot.canvas.style.display = on ? "none" : "block";
    });
  }

  function setInteracting(on) {
    interacting = !!on;
    if (interacting) renderSoon();
  }

  function disposeOrtho(id) {
    const slot = orthoSlots[id];
    if (!slot) return;
    try { if (slot.renderer) slot.renderer.dispose(); } catch (e) {}
    if (slot.canvas && slot.canvas.parentNode) slot.canvas.parentNode.removeChild(slot.canvas);
    delete orthoSlots[id];
  }

  function attachOrtho(id, el) {
    const THREE = THREERef();
    if (!THREE || !el) return null;
    let slot = orthoSlots[id];
    if (slot && slot.el === el && slot.renderer) return slot;
    if (slot) disposeOrtho(id);
    const glCanvas = document.createElement("canvas");
    glCanvas.className = "draw-ortho-gl";
    glCanvas.style.position = "absolute";
    glCanvas.style.inset = "0";
    glCanvas.style.width = "100%";
    glCanvas.style.height = "100%";
    glCanvas.style.pointerEvents = "none";
    glCanvas.style.display = "block";
    el.insertBefore(glCanvas, el.firstChild);
    const gl = new THREE.WebGLRenderer({
      canvas: glCanvas,
      antialias: quality !== "low",
      alpha: true,
      powerPreference: quality === "low" ? "low-power" : "high-performance",
    });
    configureRenderer(gl, THREE, !!(snapshot && snapshot.colorChartOn), true);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    slot = { id: id, el: el, canvas: glCanvas, renderer: gl, camera: cam, frame: null };
    orthoSlots[id] = slot;
    ensureScene();
    return slot;
  }

  function setOrthoFrame(id, frame) {
    const slot = orthoSlots[id];
    if (!slot || !frame) return;
    slot.frame = frame;
    const cam = slot.camera;
    const flipX = !!frame.flipX;
    cam.left = flipX ? frame.right : frame.left;
    cam.right = flipX ? frame.left : frame.right;
    cam.top = frame.top;
    cam.bottom = frame.bottom;
    cam.near = frame.near || 1;
    cam.far = frame.far || 20000;
    cam.scale.set(1, 1, 1);
    cam.position.set(frame.position.x, frame.position.y, frame.position.z);
    cam.up.set(frame.up.x, frame.up.y, frame.up.z);
    cam.lookAt(frame.target.x, frame.target.y, frame.target.z);
    cam.updateProjectionMatrix();
    renderOrtho(id);
  }

  function renderOrtho(id) {
    const slot = orthoSlots[id];
    if (!slot || !slot.renderer || !slot.camera || !scene) return;
    if (slot.canvas && slot.canvas.style.display === "none") return;
    const w = Math.max(2, Math.round((slot.el && slot.el.clientWidth) || 2));
    const h = Math.max(2, Math.round((slot.el && slot.el.clientHeight) || 2));
    slot.renderer.setPixelRatio(pixelRatio());
    slot.renderer.setSize(w, h, false);
    const prevVis = lightGroup ? lightGroup.visible : true;
    if (lightGroup) lightGroup.visible = true;
    const prevBg = scene.background;
    scene.background = null;
    slot.renderer.setClearColor(0xffffff, 0);
    slot.renderer.render(scene, slot.camera);
    scene.background = prevBg;
    if (lightGroup) lightGroup.visible = prevVis;
  }

  function renderAllOrtho() {
    Object.keys(orthoSlots).forEach(function (id) { renderOrtho(id); });
  }

  function captureOrtho(id) {
    const slot = orthoSlots[id];
    if (!slot || !slot.canvas) return "";
    renderOrtho(id);
    try {
      return slot.canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  window.v3DrawingPreview = {
    attach: attach,
    setSnapshot: applySnapshot,
    setView: setView,
    getView: function () { return view; },
    setQuality: setQuality,
    getQuality: function () { return quality; },
    hasScene: hasScene,
    ready: function () { return hasScene() && !!renderer; },
    renderSoon: renderSoon,
    renderNow: renderNow,
    setPrint: setPrint,
    setInteracting: setInteracting,
    lastMs: function () { return lastMs; },
    attachOrtho: attachOrtho,
    setOrthoFrame: setOrthoFrame,
    renderOrtho: renderOrtho,
    renderAllOrtho: renderAllOrtho,
    captureOrtho: captureOrtho,
    hasOrtho: function (id) { return !!(orthoSlots[id] && orthoSlots[id].renderer); },
  };

  window.addEventListener("message", function (ev) {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "CUBERACK_DRAWING_SNAPSHOT" && msg.preview) {
      applySnapshot(msg.preview);
      if (typeof window.__CR_getDrawingPayload === "function") {
        const p = window.__CR_getDrawingPayload();
        if (p) {
          p.preview = msg.preview;
          p.colorChartOn = !!msg.preview.colorChartOn;
        }
      }
    }
  });
  try {
    const ch = new BroadcastChannel("cuberack-drawing");
    ch.addEventListener("message", function (ev) {
      const msg = ev.data;
      if (msg && msg.type === "CUBERACK_DRAWING_SNAPSHOT" && msg.preview) {
        applySnapshot(msg.preview);
        if (typeof window.__CR_getDrawingPayload === "function") {
          const p = window.__CR_getDrawingPayload();
          if (p) {
            p.preview = msg.preview;
            p.colorChartOn = !!msg.preview.colorChartOn;
          }
        }
      }
    });
  } catch (e) {}
})();
