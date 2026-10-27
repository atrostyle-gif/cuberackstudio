// =========================================================
// 図面用 3D キャプチャ（ソリッド表示）
// - 既存 scene / rackGroup / InstancedMesh を再利用する
// - 図面専用モデルは作らない
// - メインカメラ・選択・材質・CAD renderer は恒久変更しない
// =========================================================
(function () {
  const SEL_HEX = {
    0xef4444: 1,
    0x00ff00: 1,
    0x38bdf8: 1,
  };
  const POOL_CYL_R = 4;
  const PRODUCT_CYL_R = 6.5;
  const perfLog = [];

  function pushPerf(row) {
    const item = Object.assign({ t: Date.now() }, row || {});
    perfLog.push(item);
    if (perfLog.length > 40) perfLog.shift();
    window.__crDrawPerf = perfLog;
  }

  function boxFromRack() {
    const THREERef = window.THREE;
    const box = new THREERef.Box3();
    const joints = window.joints || [];
    if (!joints.length) {
      box.set(new THREERef.Vector3(-200, 0, -200), new THREERef.Vector3(200, 200, 200));
      return box;
    }
    joints.forEach(function (j) {
      if (j) box.expandByPoint(new THREERef.Vector3(j.x, j.y, j.z));
    });
    const legs = window.legs || [];
    legs.forEach(function (lg) {
      const j = joints[lg && lg.jointIndex];
      if (j) box.expandByPoint(new THREERef.Vector3(j.x, j.y - 28, j.z));
    });
    box.expandByScalar(PRODUCT_CYL_R + 8);
    return box;
  }

  function hideOverlays() {
    const hidden = [];
    const scene = window.scene;
    if (!scene) return hidden;
    scene.traverse(function (obj) {
      if (!obj || obj.visible === false) return;
      if (obj.isInstancedMesh || obj.isMesh && obj.userData && obj.userData.v3InstancedRoot) return;
      const ud = obj.userData || {};
      const n = String(obj.name || "");
      const nl = n.toLowerCase();
      const type = String(obj.type || "");
      const isOverlayLine = obj.isGridHelper || obj.isAxesHelper || type === "GridHelper" || type === "AxesHelper"
        || (obj.parent === scene && (obj.isLine || obj.isLineSegments || type === "Line" || type === "LineSegments"));
      if (
        isOverlayLine ||
        n === "__v3SelOutline" ||
        ud.v3Gizmo ||
        ud.v3Measure ||
        ud.v3Hud ||
        ud.v3Dim ||
        ud.v3UserAxis ||
        ud.isPreview ||
        nl.indexOf("gizmo") >= 0 ||
        nl.indexOf("measure") >= 0 ||
        nl.indexOf("preview") >= 0 ||
        nl.indexOf("grid") >= 0
      ) {
        hidden.push(obj);
        obj.visible = false;
      }
    });
    ["grid25", "grid50", "grid100", "grid200", "groundRingMesh"].forEach(function (name) {
      const obj = window[name];
      if (obj && obj.visible) {
        hidden.push(obj);
        obj.visible = false;
      }
    });
    return hidden;
  }

  function muteSelection(scene) {
    const saved = [];
    if (!scene) return saved;
    scene.traverse(function (obj) {
      const mats = obj && obj.material;
      const list = Array.isArray(mats) ? mats : (mats ? [mats] : []);
      list.forEach(function (mat) {
        if (!mat || !mat.emissive || typeof mat.emissive.getHex !== "function") return;
        const hex = mat.emissive.getHex();
        if (!SEL_HEX[hex]) return;
        saved.push({ mat: mat, hex: hex, intensity: mat.emissiveIntensity });
        mat.emissive.setHex(0x000000);
        if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = 0;
      });
    });
    return saved;
  }

  function restoreSelection(saved) {
    saved.forEach(function (item) {
      try {
        item.mat.emissive.setHex(item.hex);
        if (typeof item.mat.emissiveIntensity === "number") item.mat.emissiveIntensity = item.intensity;
      } catch (e) {}
    });
  }

  function withProductThickness(fn) {
    const saved = [];
    const ratio = PRODUCT_CYL_R / POOL_CYL_R;
    function bump(list) {
      (list || []).forEach(function (item) {
        const m = item && item.mesh;
        if (!m || !m.scale) return;
        saved.push({ m: m, x: m.scale.x, y: m.scale.y, z: m.scale.z });
        m.scale.x *= ratio;
        m.scale.z *= ratio;
      });
    }
    bump(window.beams);
    bump(window.poles);
    const pool = window.v3InstancePool;
    if (pool && typeof pool.sync === "function") pool.sync(true);
    try {
      return fn();
    } finally {
      saved.forEach(function (s) {
        try { s.m.scale.set(s.x, s.y, s.z); } catch (e) {}
      });
      if (pool && typeof pool.sync === "function") pool.sync(true);
    }
  }

  function withCaptureMaterials(scene, fn) {
    const swapped = [];
    const colorChart = !!window.isColorChartOn;
    if (scene) {
      scene.traverse(function (obj) {
        if (!obj || !obj.isInstancedMesh || !obj.material) return;
        const old = obj.material;
        if (!old || typeof old.clone !== "function") return;
        let neu;
        if (colorChart && window.THREE && window.THREE.MeshBasicMaterial) {
          neu = new window.THREE.MeshBasicMaterial({ color: 0xffffff });
        } else {
          neu = old.clone();
          const matCode = (obj.userData && obj.userData.v3PoolMat) || "IRON";
          if (typeof window.applyMaterialFinish === "function") {
            window.applyMaterialFinish(neu, matCode);
          }
        }
        neu.flatShading = false;
        neu.wireframe = false;
        neu.transparent = false;
        neu.opacity = 1;
        neu.depthTest = true;
        neu.depthWrite = true;
        neu.needsUpdate = true;
        obj.material = neu;
        swapped.push({ obj: obj, old: old, neu: neu });
      });
    }
    try {
      return fn();
    } finally {
      swapped.forEach(function (s) {
        try { s.obj.material = s.old; } catch (e) {}
        try { if (s.neu && s.neu.dispose) s.neu.dispose(); } catch (e2) {}
      });
    }
  }

  function addStudioLights(scene, THREERef, center, size, colorChart) {
    const group = new THREERef.Group();
    group.name = "__crDrawLights";
    const hemi = new THREERef.HemisphereLight(0xffffff, colorChart ? 0xe8e8ea : 0x8a8680, colorChart ? 1.05 : 0.52);
    group.add(hemi);
    const key = new THREERef.DirectionalLight(0xffffff, colorChart ? 0.95 : 0.62);
    key.position.set(center.x + size.x * 0.85, center.y + size.y * 1.7, center.z + size.z * 0.55);
    group.add(key);
    const fill = new THREERef.DirectionalLight(0xffffff, colorChart ? 0.62 : 0.28);
    fill.position.set(center.x - size.x * 1.1, center.y + size.y * 0.45, center.z - size.z * 0.4);
    group.add(fill);
    const rim = new THREERef.DirectionalLight(0xfffaf4, colorChart ? 0.32 : 0.12);
    rim.position.set(center.x - size.x * 0.15, center.y + size.y * 0.9, center.z + size.z * 1.2);
    group.add(rim);
    scene.add(group);
    return group;
  }

  function removeStudioLights(scene, group) {
    if (!group) return;
    if (group.parent) group.parent.remove(group);
    group.traverse(function (obj) {
      if (obj && typeof obj.dispose === "function") {
        try { obj.dispose(); } catch (e) {}
      }
    });
  }

  function getOffscreenRenderer(THREERef, w, h) {
    if (!window.__crDrawOff || !window.__crDrawOff.renderer) {
      const canvas = document.createElement("canvas");
      const renderer = new THREERef.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.sortObjects = true;
      if (THREERef.SRGBColorSpace && renderer.outputColorSpace !== undefined) {
        renderer.outputColorSpace = THREERef.SRGBColorSpace;
      } else if (typeof THREERef.sRGBEncoding === "number") {
        renderer.outputEncoding = THREERef.sRGBEncoding;
      }
      if (typeof THREERef.ACESFilmicToneMapping === "number") {
        renderer.toneMapping = THREERef.ACESFilmicToneMapping;
        renderer.toneMappingExposure = window.isColorChartOn ? 1.22 : 1.12;
      }
      window.__crDrawOff = { renderer: renderer, canvas: canvas };
    }
    const renderer = window.__crDrawOff.renderer;
    const colorChart = !!window.isColorChartOn;
    if (colorChart && THREERef.NoToneMapping != null) {
      renderer.toneMapping = THREERef.NoToneMapping;
      renderer.toneMappingExposure = 1;
    } else if (typeof THREERef.ACESFilmicToneMapping === "number") {
      renderer.toneMapping = THREERef.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1.5));
    renderer.setSize(w, h, false);
    return renderer;
  }

  function hideOrphanInstances(box, THREERef) {
    const restored = [];
    const scene = window.scene;
    if (!scene || !box || !THREERef) return restored;
    const pad = 90;
    const minx = box.min.x - pad;
    const miny = box.min.y - pad;
    const minz = box.min.z - pad;
    const maxx = box.max.x + pad;
    const maxy = box.max.y + pad;
    const maxz = box.max.z + pad;
    const mtx = new THREERef.Matrix4();
    const pos = new THREERef.Vector3();
    const quat = new THREERef.Quaternion();
    const scl = new THREERef.Vector3();
    const zero = new THREERef.Matrix4().makeScale(0, 0, 0);
    scene.traverse(function (obj) {
      if (!obj || !obj.isInstancedMesh || !obj.count) return;
      let dirty = false;
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, mtx);
        mtx.decompose(pos, quat, scl);
        if (pos.x < minx || pos.x > maxx || pos.y < miny || pos.y > maxy || pos.z < minz || pos.z > maxz) {
          restored.push({ mesh: obj, index: i, mtx: mtx.clone() });
          obj.setMatrixAt(i, zero);
          dirty = true;
        }
      }
      if (dirty) obj.instanceMatrix.needsUpdate = true;
    });
    return restored;
  }

  function restoreOrphanInstances(saved) {
    (saved || []).forEach(function (item) {
      try {
        item.mesh.setMatrixAt(item.index, item.mtx);
        item.mesh.instanceMatrix.needsUpdate = true;
      } catch (e) {}
    });
  }

  function viewApi() {
    return window.v3DrawingView;
  }

  function sessionView() {
    return window.__crDrawCam || null;
  }

  function storeSessionView(view) {
    window.__crDrawCam = view;
    return view;
  }

  function boxPlain(box) {
    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  }

  function measureNdc(cam, box, THREERef) {
    const corners = [];
    const xs = [box.min.x, box.max.x];
    const ys = [box.min.y, box.max.y];
    const zs = [box.min.z, box.max.z];
    xs.forEach(function (x) {
      ys.forEach(function (y) {
        zs.forEach(function (z) {
          corners.push(new THREERef.Vector3(x, y, z));
        });
      });
    });
    const ndc = new THREERef.Vector3();
    let m = 0;
    corners.forEach(function (p) {
      ndc.copy(p).project(cam);
      m = Math.max(m, Math.abs(ndc.x), Math.abs(ndc.y));
    });
    return m || 1;
  }

  function applyDrawCamera(cam, box, THREERef, viewIn, aspect, refineFit) {
    const math = viewApi();
    const plain = boxPlain(box);
    let view = math
      ? math.normalize(viewIn, plain, aspect)
      : { theta: Math.PI / 4, phi: 1.1, radius: 1800, zoom: 1, fitRadius: 1800, target: box.getCenter(new THREERef.Vector3()), preset: "iso", aspect: aspect };
    if (math && (!viewIn || viewIn.fitRadius == null) && (view.preset !== "free" || !viewIn)) {
      view = math.fitKeepAngle(view, plain, aspect);
    }
    function place(v) {
      const pose = math ? math.cameraPose(v) : null;
      const p = pose ? pose.position : { x: 0, y: 0, z: 0 };
      const t = pose ? pose.target : v.target;
      cam.fov = (math && math.FOV_DEG) || 30;
      cam.aspect = aspect || v.aspect || 1.6;
      cam.position.set(p.x, p.y, p.z);
      if (Math.abs((pose && pose.offset.y) || 0) / Math.max(1, v.radius) > 0.98) {
        cam.up.set(0, 0, ((pose && pose.offset.y) || 1) > 0 ? -1 : 1);
      } else {
        cam.up.set(0, 1, 0);
      }
      cam.lookAt(t.x, t.y, t.z);
      cam.near = Math.max(1, v.radius / 220);
      cam.far = v.radius * 28;
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
    }
    place(view);
    let ndcMax = measureNdc(cam, box, THREERef);
    const targetNdc = (math && math.FIT_NDC) || 0.86;
    if (refineFit && Math.abs(view.zoom - 1) < 0.02 && ndcMax > 0.001) {
      view.fitRadius = view.radius * (ndcMax / targetNdc);
      view.zoom = 1;
      view.radius = view.fitRadius;
      place(view);
      ndcMax = measureNdc(cam, box, THREERef);
    }
    return { view: view, ndcMax: ndcMax, size: box.getSize(new THREERef.Vector3()), center: box.getCenter(new THREERef.Vector3()) };
  }

  function captureView(kind, width, height, opts) {
    const scene = window.scene;
    const mainCam = window.camera;
    const cadRenderer = window.renderer;
    if (!scene || !mainCam || !window.THREE) return "";

    const options = opts && typeof opts === "object" ? opts : {};
    const preview = options.quality === "preview";
    const w = Math.max(preview ? 320 : 960, Math.round(width || (preview ? 720 : 2000)));
    const h = Math.max(preview ? 200 : 600, Math.round(height || (preview ? 450 : 1250)));
    const THREERef = window.THREE;
    const box = boxFromRack();
    const aspect = w / h;

    const cam = mainCam.clone();
    cam.aspect = aspect;
    const framed = applyDrawCamera(cam, box, THREERef, options.view || sessionView(), aspect, !!options.refineFit);
    storeSessionView(framed.view);

    const pool = window.v3InstancePool;
    if (pool && typeof pool.sync === "function") pool.sync(true);

    const hidden = hideOverlays();
    const orphans = hideOrphanInstances(box, THREERef);
    const muted = muteSelection(scene);
    const prevBg = scene.background;
    const paperBg = 0xffffff;
    scene.background = new THREERef.Color(paperBg);
    const lightGroup = addStudioLights(scene, THREERef, framed.center, framed.size, !!window.isColorChartOn);
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    let url = "";
    function renderOnce(quality) {
      const jpeg = quality === "preview" ? 0.55 : 0.92;
      try {
        const off = getOffscreenRenderer(THREERef, w, h);
        if (window.isColorChartOn && THREERef.NoToneMapping != null) {
          off.toneMapping = THREERef.NoToneMapping;
          off.toneMappingExposure = 1;
        } else if (typeof THREERef.ACESFilmicToneMapping === "number") {
          off.toneMapping = THREERef.ACESFilmicToneMapping;
          off.toneMappingExposure = 1.12;
        }
        off.setPixelRatio(quality === "preview" ? 1 : Math.min(2, window.devicePixelRatio || 1.5));
        off.setSize(w, h, false);
        off.setClearColor(paperBg, 1);
        const tR0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        off.render(scene, cam);
        const tR1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const data = off.domElement.toDataURL("image/jpeg", jpeg);
        const tR2 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        pushPerf({
          quality: quality,
          w: w,
          h: h,
          msSetup: tR0 - t0,
          msRender: tR1 - tR0,
          msJpeg: tR2 - tR1,
          bytes: data.length,
        });
        return data;
      } catch (err) {
        console.warn("[drawing-capture] offscreen failed, fallback", err);
        try {
          if (cadRenderer) {
            const prevPr = cadRenderer.getPixelRatio();
            const prevSize = new THREERef.Vector2();
            cadRenderer.getSize(prevSize);
            cadRenderer.setPixelRatio(1);
            cadRenderer.setSize(w, h, false);
            cadRenderer.render(scene, cam);
            const data = cadRenderer.domElement.toDataURL("image/jpeg", jpeg);
            cadRenderer.setPixelRatio(prevPr || 1);
            if (window.viewEl) {
              cadRenderer.setSize(Math.max(1, window.viewEl.clientWidth), Math.max(1, window.viewEl.clientHeight), false);
            } else {
              cadRenderer.setSize(prevSize.x || 800, prevSize.y || 600, false);
            }
            return data;
          }
        } catch (err2) {
          console.warn("[drawing-capture] fallback failed", err2);
        }
      }
      return "";
    }

    if (preview) {
      url = renderOnce("preview");
    } else {
      withProductThickness(function () {
        withCaptureMaterials(scene, function () {
          url = renderOnce("high");
        });
      });
    }

    scene.background = prevBg;
    removeStudioLights(scene, lightGroup);
    restoreSelection(muted);
    restoreOrphanInstances(orphans);
    hidden.forEach(function (obj) { obj.visible = true; });
    try {
      if (cadRenderer) cadRenderer.render(scene, mainCam);
    } catch (e) {}
    if (options.asObject) {
      return {
        image: url,
        view: viewApi() ? viewApi().serialize(framed.view) : framed.view,
        overflow: framed.ndcMax > 1.02,
        ndcMax: framed.ndcMax,
        quality: preview ? "preview" : "high",
      };
    }
    return url;
  }

  function lengthOf(item) {
    if (typeof window.getBeamNominalLengthMmSafe === "function") {
      const n = window.getBeamNominalLengthMmSafe(item);
      if (n > 0) return n;
    }
    const n = Number(item && item.lengthMm);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function addCount(map, key, row) {
    const cur = map.get(key);
    if (cur) cur.qty += row.qty;
    else map.set(key, row);
  }

  function buildModelBom() {
    const map = new Map();
    const matOf = function (item, fallback) {
      const raw = (item && item.material) || fallback || "IRON";
      return typeof window.normalizeMaterial === "function" ? window.normalizeMaterial(raw) : raw;
    };
    (window.beams || []).forEach(function (b) {
      if (!b) return;
      const len = lengthOf(b);
      const mat = matOf(b, "IRON");
      const key = "Beam|" + len + "|" + mat;
      addCount(map, key, {
        key: "beam_" + len,
        kind: "Beam",
        name: "Beam " + (window.v3DrawingMath ? window.v3DrawingMath.formatDesignMm(len) : len) + "mm",
        lengthMm: len,
        material: mat,
        qty: 1,
      });
    });
    (window.poles || []).forEach(function (p) {
      if (!p) return;
      const len = lengthOf(p);
      const mat = matOf(p, "IRON");
      const key = "Pole|" + len + "|" + mat;
      addCount(map, key, {
        key: "pole_" + len,
        kind: "Pole",
        name: "Pole " + (window.v3DrawingMath ? window.v3DrawingMath.formatDesignMm(len) : len) + "mm",
        lengthMm: len,
        material: mat,
        qty: 1,
      });
    });
    const joints = window.joints || [];
    const jointCount = joints.filter(Boolean).length;
    if (jointCount) {
      const mat = matOf(joints.find(Boolean), "IRON");
      addCount(map, "JointBall|" + mat, {
        key: "jointBall",
        kind: "JointBall",
        name: "JointBall",
        lengthMm: null,
        material: mat,
        qty: jointCount,
      });
    }
    const legs = window.legs || [];
    if (legs.length) {
      const mat = matOf(legs[0], "IRON");
      addCount(map, "Leg|" + mat, {
        key: "leg",
        kind: "Leg",
        name: "Leg",
        lengthMm: legs[0] && legs[0].lengthMm ? legs[0].lengthMm : 16,
        material: mat,
        qty: legs.length,
      });
    }
    return Array.from(map.values());
  }

  function exportLengthColors() {
    const map = {};
    const keys = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
    if (typeof window.getLengthColor === "function") {
      keys.forEach(function (k) { map[String(k)] = window.getLengthColor(k); });
      map.order = window.getLengthColor(9999);
    }
    return map;
  }

  function exportFinishes() {
    return {
      IRON: { metalness: 0.10, roughness: 0.92, emissive: 0x000000, emissiveIntensity: 0 },
      BS: { metalness: 0.98, roughness: 0.15, emissive: 0xFFD700, emissiveIntensity: 0.4 },
      SUS: { metalness: 0.55, roughness: 0.45, emissive: 0x000000, emissiveIntensity: 0 },
      WOOD: { metalness: 0.0, roughness: 0.7, emissive: 0x000000, emissiveIntensity: 0 },
    };
  }

  function exportUsedLengths() {
    const map = exportLengthColors();
    const used = {};
    function addItem(item, lenFn) {
      if (!item) return;
      if (item.isCustom || item.isOrder) {
        used.order = map.order || "#7c3aed";
        return;
      }
      const len = typeof lenFn === "function" ? lenFn(item) : Number(item.lengthMm);
      if (!Number.isFinite(len) || len <= 0) return;
      const hex = typeof window.getLengthColor === "function" ? window.getLengthColor(len) : null;
      const keys = Object.keys(map);
      let key = "order";
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === "order") continue;
        if (Math.abs(Number(keys[i]) - len) <= 1e-3) {
          key = keys[i];
          break;
        }
      }
      used[key] = hex || map[key] || map.order;
    }
    (window.beams || []).forEach(function (b) { addItem(b, window.getBeamLength); });
    (window.poles || []).forEach(function (p) { addItem(p, window.getPoleLength); });
    const order = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800].map(String);
    const rows = [];
    order.forEach(function (k) {
      if (used[k]) rows.push({ key: k, color: used[k], label: k + " mm" });
    });
    if (used.order) rows.push({ key: "order", color: used.order, label: "オーダー" });
    return rows;
  }

  function buildPreviewSnapshot() {
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const pool = window.v3InstancePool;
    const groups = pool && typeof pool.exportSnapshot === "function" ? pool.exportSnapshot() : [];
    const box = boxFromRack();
    const snap = {
      box: boxPlain(box),
      colorChartOn: !!window.isColorChartOn,
      lengthColors: exportLengthColors(),
      usedLengths: exportUsedLengths(),
      materials: window.MATERIAL_COLOR || {},
      finishes: exportFinishes(),
      groups: groups,
    };
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    let bytes = 0;
    groups.forEach(function (g) {
      bytes += ((g.matrices && g.matrices.length) || 0) + ((g.colors && g.colors.length) || 0);
    });
    pushPerf({ quality: "snapshot", msRender: t1 - t0, bytes: bytes, groups: groups.length });
    return snap;
  }

  function postToDrawingChannel(payload) {
    try {
      if (window.__crDrawChannel) window.__crDrawChannel.postMessage(payload);
    } catch (e) {}
  }

  function computeOverallFromCad() {
    const math = window.v3DrawingMath;
    const dims = computeDims();
    let overall = {
      W: dims.spanX,
      D: dims.spanZ,
      H: dims.spanY,
    };
    try {
      const computed = math && typeof math.computeRackOverall === "function"
        ? math.computeRackOverall({
            joints: window.joints || [],
            beams: window.beams || [],
            poles: window.poles || [],
            legs: window.legs || [],
          }, {
            beamEffective: function (b) {
              const nom = typeof window.getBeamNominalLengthMmSafe === "function"
                ? window.getBeamNominalLengthMmSafe(b)
                : Number(b && b.lengthMm);
              if (typeof window.getBeamEffectiveLengthMm === "function") return window.getBeamEffectiveLengthMm(nom);
              return nom;
            },
            poleNominal: function (p) {
              if (typeof window.getPoleLength === "function") return window.getPoleLength(p);
              return Number(p && p.lengthMm);
            },
            poleOuter: typeof window.calcPoleOuterHeightMm === "function"
              ? function (noms) { return window.calcPoleOuterHeightMm(noms); }
              : null,
            hasLeg: !!(window.legs && window.legs.length),
            legMm: typeof window.getLegHeightMm === "function" ? window.getLegHeightMm() : 0,
          })
        : null;
      if (computed) {
        if (computed.W != null) overall.W = computed.W;
        if (computed.D != null) overall.D = computed.D;
        if (computed.H != null) overall.H = computed.H;
      }
    } catch (e) {}
    return { dims: dims, overall: overall };
  }

  function sendSnapshot(source) {
    const snap = buildPreviewSnapshot();
    const dimPack = computeOverallFromCad();
    const msg = {
      type: "CUBERACK_DRAWING_SNAPSHOT",
      preview: snap,
      colorChartOn: snap.colorChartOn,
      dims: dimPack.dims,
      overall: dimPack.overall,
    };
    if (source && typeof source.postMessage === "function") {
      try { source.postMessage(msg, "*"); } catch (e) {}
    }
    postToDrawingChannel(msg);
    return snap;
  }

  function handleColorChartRequest(msg, source) {
    if (typeof window.toggleColorChart === "function") {
      window.toggleColorChart(!!msg.on);
    } else {
      window.isColorChartOn = !!msg.on;
      if (typeof window.reapplyConnectorVisuals === "function") {
        window.reapplyConnectorVisuals("drawing-colorchart");
      }
    }
    sendSnapshot(source);
    const result = runCapture({
      quality: "high",
      view: sessionView(),
      aspect: msg.aspect > 0 ? msg.aspect : 1.6,
      refineFit: false,
    });
    replyToDrawing(source, msg.requestId, result);
    postToDrawingChannel({
      type: "CUBERACK_DRAWING_FRAME",
      requestId: msg.requestId,
      image: result && result.image,
      view: result && result.view,
      overflow: !!(result && result.overflow),
      ndcMax: result && result.ndcMax,
      quality: result && result.quality,
    });
  }

  function estimateRows() {
    return (window.currentEstimateParts || []).map(function (p) {
      return {
        key: p.key,
        kind: "Part",
        name: p.name || p.key,
        lengthMm: null,
        material: p.material,
        qty: p.qty,
      };
    });
  }

  function computeDims() {
    const math = window.v3DrawingMath;
    const joints = window.joints || [];
    const axes = math ? math.designAxes(joints) : { xs: [], ys: [], zs: [] };
    return {
      axes: axes,
      bayX: math ? math.baySpans(axes.xs) : [],
      bayZ: math ? math.baySpans(axes.zs) : [],
      levels: math ? math.baySpans(axes.ys) : [],
      spanX: axes.xs.length ? axes.xs[axes.xs.length - 1] - axes.xs[0] : 0,
      spanY: axes.ys.length ? axes.ys[axes.ys.length - 1] - axes.ys[0] : 0,
      spanZ: axes.zs.length ? axes.zs[axes.zs.length - 1] - axes.zs[0] : 0,
    };
  }

  let captureBusy = false;
  let captureQueued = null;

  function runCapture(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const quality = options.quality === "preview" ? "preview" : "high";
    const aspect = options.aspect > 0 ? options.aspect : 1.6;
    const w = quality === "preview" ? 720 : 2000;
    const h = Math.max(quality === "preview" ? 240 : 800, Math.round(w / aspect));
    return captureView(options.kind || "iso", w, h, {
      quality: quality,
      view: options.view,
      asObject: true,
      refineFit: !!options.refineFit,
    });
  }

  function handleViewRequest(msg) {
    const math = viewApi();
    const box = boxFromRack();
    const plain = boxPlain(box);
    const aspect = msg.aspect > 0 ? msg.aspect : 1.6;
    let view = sessionView();
    const action = msg.action || "capture";
    if (action === "reset" || action === "preset" && (!msg.preset || msg.preset === "iso")) {
      view = math ? math.applyPreset(msg.preset || "iso", plain, aspect, view) : view;
    } else if (action === "preset") {
      view = math ? math.applyPreset(msg.preset, plain, aspect, view) : view;
    } else if (action === "fit") {
      view = math ? math.fitKeepAngle(math.normalize(msg.view || view, plain, aspect), plain, aspect) : view;
    } else if (msg.view) {
      view = math ? math.normalize(msg.view, plain, aspect) : msg.view;
    }
    storeSessionView(view);
    const result = runCapture({
      quality: msg.quality,
      view: view,
      aspect: aspect,
      kind: view && view.preset,
      refineFit: action === "fit" || action === "preset" || action === "reset",
    });
    return result;
  }

  function replyToDrawing(source, requestId, result) {
    if (!source || typeof source.postMessage !== "function") return;
    try {
      source.postMessage({
        type: "CUBERACK_DRAWING_FRAME",
        requestId: requestId,
        image: result && result.image,
        view: result && result.view,
        overflow: !!(result && result.overflow),
        ndcMax: result && result.ndcMax,
        quality: result && result.quality,
      }, "*");
    } catch (e) {}
  }

  function enqueueViewRequest(msg, source) {
    captureQueued = { msg: msg, source: source };
    if (captureBusy) return;
    while (captureQueued) {
      const job = captureQueued;
      captureQueued = null;
      captureBusy = true;
      try {
        const result = handleViewRequest(job.msg);
        replyToDrawing(job.source, job.msg && job.msg.requestId, result);
      } catch (err) {
        console.warn("[drawing-capture] view request failed", err);
        replyToDrawing(job.source, job.msg && job.msg.requestId, { image: "", overflow: false, quality: "high" });
      } finally {
        captureBusy = false;
      }
    }
  }

  window.addEventListener("message", function (ev) {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "CUBERACK_DRAWING_COLORCHART") {
      handleColorChartRequest(msg, ev.source);
      return;
    }
    if (msg.type === "CUBERACK_DRAWING_SNAPSHOT_REQ") {
      sendSnapshot(ev.source);
      return;
    }
    if (msg.type !== "CUBERACK_DRAWING_VIEW") return;
    enqueueViewRequest(msg, ev.source);
  });

  try {
    window.__crDrawChannel = new BroadcastChannel("cuberack-drawing");
    window.__crDrawChannel.onmessage = function (ev) {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === "CUBERACK_DRAWING_COLORCHART") {
        handleColorChartRequest(msg, {
          postMessage: function (payload) {
            try { window.__crDrawChannel.postMessage(payload); } catch (e) {}
          },
        });
        return;
      }
      if (msg.type === "CUBERACK_DRAWING_SNAPSHOT_REQ") {
        sendSnapshot({
          postMessage: function (payload) {
            try { window.__crDrawChannel.postMessage(payload); } catch (e) {}
          },
        });
        return;
      }
      if (msg.type !== "CUBERACK_DRAWING_VIEW") return;
      enqueueViewRequest(msg, {
        postMessage: function (payload) {
          try { window.__crDrawChannel.postMessage(payload); } catch (e) {}
        },
      });
    };
  } catch (e) {}

  window.v3CaptureDrawingViews = function v3CaptureDrawingViews() {
    const result = runCapture({
      quality: "high",
      view: sessionView(),
      aspect: 1.6,
      kind: "iso",
      refineFit: !sessionView() || sessionView().preset !== "free",
    });
    return {
      iso: result && result.image ? result.image : captureView("iso", 2000, 1250),
      view: result && result.view,
      overflow: !!(result && result.overflow),
      front: "",
      side: "",
      top: "",
    };
  };

  window.v3DrawingCapture = {
    captureView: captureView,
    runCapture: runCapture,
    sessionView: sessionView,
    storeSessionView: storeSessionView,
    handleViewRequest: handleViewRequest,
  };

  window.v3BuildDrawingExtras = function v3BuildDrawingExtras() {
    const math = window.v3DrawingMath;
    const modelBom = buildModelBom();
    const bom = math ? math.mergeBom(modelBom, estimateRows()) : modelBom.concat(estimateRows());
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const dimPack = computeOverallFromCad();
    return {
      meta: {
        title: (window.currentFileName || "未保存のデザイン"),
        drawingNo: "D-" + y + m + d,
        date: y + "-" + m + "-" + d,
        project: window.currentFileName || "未保存のデザイン",
      },
      bom: bom,
      dims: dimPack.dims,
      overall: dimPack.overall,
      captures: window.v3CaptureDrawingViews(),
      preview: buildPreviewSnapshot(),
      colorChartOn: !!window.isColorChartOn,
    };
  };

  window.v3DrawingCapture.buildPreviewSnapshot = buildPreviewSnapshot;
  window.v3DrawingCapture.sendSnapshot = sendSnapshot;
  window.v3DrawingCapture.measure = function () {
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const preview = runCapture({ quality: "preview", aspect: 1.6 });
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const high = runCapture({ quality: "high", aspect: 1.6 });
    const t2 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const snapT0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const snap = buildPreviewSnapshot();
    const snapT1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return {
      previewMs: t1 - t0,
      highMs: t2 - t1,
      snapshotMs: snapT1 - snapT0,
      previewBytes: (preview && preview.image || "").length,
      highBytes: (high && high.image || "").length,
      groups: (snap && snap.groups && snap.groups.length) || 0,
      log: perfLog.slice(),
    };
  };
})();
