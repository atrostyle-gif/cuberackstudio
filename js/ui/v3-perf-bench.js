// =========================================================
// 大型ラック描画性能ベンチ（手動呼び出し専用）
// window.__v3PerfBench.buildBeams / measureCamera / runSuite
// =========================================================
(function () {
  function gpuInfo() {
    const r = window.renderer;
    const info = r && r.info;
    let meshes = 0;
    let instanced = 0;
    let instancedCount = 0;
    if (window.scene) {
      window.scene.traverse(function (o) {
        if (!o) return;
        if (o.isInstancedMesh) {
          instanced += 1;
          instancedCount += o.count || 0;
          meshes += 1;
        } else if (o.isMesh) {
          meshes += 1;
        }
      });
    }
    return {
      calls: info && info.render ? info.render.calls : 0,
      triangles: info && info.render ? info.render.triangles : 0,
      geometries: info && info.memory ? info.memory.geometries : 0,
      textures: info && info.memory ? info.memory.textures : 0,
      sceneMeshes: meshes,
      instancedMeshes: instanced,
      instancedCount: instancedCount,
      beams: (window.beams || []).length,
      poles: (window.poles || []).length,
      joints: (window.joints || []).length,
      legs: (window.legs || []).length,
    };
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const a = arr.slice().sort(function (x, y) { return x - y; });
    const i = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
    return a[i];
  }

  function summarize(frameMs) {
    if (!frameMs.length) return { avgFps: 0, minFps: 0, p95Ms: 0, avgMs: 0, frames: 0 };
    let sum = 0;
    let maxMs = 0;
    for (let i = 0; i < frameMs.length; i++) {
      sum += frameMs[i];
      if (frameMs[i] > maxMs) maxMs = frameMs[i];
    }
    const avg = sum / frameMs.length;
    return {
      avgFps: 1000 / avg,
      minFps: 1000 / maxMs,
      p95Ms: percentile(frameMs, 0.95),
      avgMs: avg,
      maxMs: maxMs,
      frames: frameMs.length,
    };
  }

  function bulk(on) {
    window.__buildingAutoLayout = !!on;
    window.__CR_SKIP_HISTORY__ = !!on;
  }

  function clear() {
    bulk(true);
    try { window.clearAllDesign(); } catch (e) {}
    if (window.v3InstancePool && typeof window.v3InstancePool.clear === "function") {
      window.v3InstancePool.clear();
    }
    bulk(false);
  }

  function buildBeams(n) {
    const t0 = performance.now();
    bulk(true);
    try { window.clearAllDesign(); } catch (e) {}
    const pitch = 200;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const jmap = [];
    for (let z = 0; z <= rows; z++) {
      jmap[z] = [];
      for (let x = 0; x <= cols; x++) {
        jmap[z][x] = window.createJoint({ x: x * pitch, y: 0, z: z * pitch });
      }
    }
    let made = 0;
    for (let z = 0; z < rows && made < n; z++) {
      for (let x = 0; x < cols && made < n; x++) {
        const a = jmap[z][x];
        const b = jmap[z][x + 1];
        if (a == null || b == null) continue;
        window.addBeamConnection(a, b);
        made++;
      }
    }
    bulk(false);
    if (typeof window.syncDesignLengthFromJoints === "function") window.syncDesignLengthFromJoints();
    if (window.v3InstancePool && typeof window.v3InstancePool.sync === "function") window.v3InstancePool.sync(true);
    if (typeof window.requestEstimateRender === "function") window.requestEstimateRender("perf build");
    return {
      n: made,
      joints: (window.joints || []).length,
      legs: (window.legs || []).length,
      ms: performance.now() - t0,
    };
  }

  function fitCamera() {
    const js = window.joints || [];
    let minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0;
    for (let i = 0; i < js.length; i++) {
      const j = js[i];
      if (!j) continue;
      minX = Math.min(minX, j.x); maxX = Math.max(maxX, j.x);
      minY = Math.min(minY, j.y); maxY = Math.max(maxY, j.y);
      minZ = Math.min(minZ, j.z); maxZ = Math.max(maxZ, j.z);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 400);
    const cam = window.camera;
    cam.position.set(cx + span * 1.2, cy + span * 0.8, cz + span * 1.2);
    cam.lookAt(cx, cy, cz);
    cam.far = Math.max(40000, span * 8);
    cam.near = Math.max(1, cam.far / 5000);
    cam.updateProjectionMatrix();
    if (window.controls) {
      window.controls.target.set(cx, cy, cz);
      window.controls.maxDistance = cam.far;
      window.controls.update();
    }
    return { span: span, far: cam.far };
  }

  function measureCamera(ms) {
    ms = ms || 2000;
    return new Promise(function (resolve) {
      const frames = [];
      const r = window.renderer;
      const orig = r.render.bind(r);
      let last = 0;
      let t0 = 0;
      let started = false;
      const cam = window.camera;
      const tgt = (window.controls && window.controls.target)
        ? window.controls.target.clone()
        : new THREE.Vector3();
      const radius = cam.position.clone().sub(tgt).length();
      const y = cam.position.y;
      r.render = function () {
        const now = performance.now();
        if (!started) {
          started = true;
          t0 = now;
          last = now;
        }
        const dt = now - last;
        last = now;
        if (now - t0 > 80 && now - t0 < ms) frames.push(dt);
        const t = Math.min(1, (now - t0) / ms);
        const ang = t * Math.PI * 2;
        cam.position.set(tgt.x + Math.cos(ang) * radius, y, tgt.z + Math.sin(ang) * radius);
        cam.lookAt(tgt);
        orig.apply(this, arguments);
        if (now - t0 >= ms) {
          r.render = orig;
          resolve(Object.assign(summarize(frames), { gpu: gpuInfo() }));
        }
      };
    });
  }

  function timeOp(name, fn) {
    const t0 = performance.now();
    const ret = fn();
    return { name: name, ms: performance.now() - t0, ret: ret };
  }

  async function runOne(n, camMs) {
    const build = buildBeams(n);
    const fit = fitCamera();
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    const cam = await measureCamera(camMs || 2000);
    const select = timeOp("select", function () {
      if (!window.beams.length) return false;
      window.selectedConnector = { type: "beam", index: 0 };
      if (typeof window.updateSelectedConnectorUI === "function") window.updateSelectedConnectorUI();
      if (typeof window.reapplyConnectorVisuals === "function") window.reapplyConnectorVisuals("perf select");
      return true;
    });
    const move = timeOp("move", function () {
      const js = window.joints || [];
      for (let i = 0; i < js.length; i++) {
        if (js[i]) js[i].x += 10;
      }
      if (typeof window.syncJointMeshesFromData === "function") window.syncJointMeshesFromData();
      if (typeof window.syncConnectorMeshesFromData === "function") window.syncConnectorMeshesFromData();
      if (window.v3InstancePool && typeof window.v3InstancePool.sync === "function") window.v3InstancePool.sync(true);
      return true;
    });
    let dup = { name: "duplicate", ms: null, ret: null };
    if (n <= 1500 && window.v3Duplicate && window.joints[0]) {
      dup = timeOp("duplicate", function () {
        return window.v3Duplicate.duplicateByJointIndex(0);
      });
    }
    const undo = timeOp("undo-prep", function () {
      if (typeof window.saveHistory === "function") window.saveHistory("perf");
      return true;
    });
    const save = timeOp("save-json", function () {
      if (typeof window.makeDesignJsonText === "function") return window.makeDesignJsonText().length;
      return JSON.stringify({ joints: window.joints, beams: window.beams }).length;
    });
    const reload = timeOp("reload-parse", function () {
      const text = typeof window.makeDesignJsonText === "function"
        ? window.makeDesignJsonText()
        : JSON.stringify({ joints: window.joints, beams: window.beams });
      JSON.parse(text);
      return text.length;
    });
    return {
      n: n,
      build: build,
      fit: fit,
      camera: cam,
      select: select,
      move: move,
      duplicate: dup,
      undo: undo,
      save: save,
      reload: reload,
      instanced: !!(window.v3InstancePool && window.v3InstancePool.enabled),
    };
  }

  window.__v3PerfBench = {
    gpuInfo: gpuInfo,
    clear: clear,
    buildBeams: buildBeams,
    fitCamera: fitCamera,
    measureCamera: measureCamera,
    timeOp: timeOp,
    runOne: runOne,
  };
})();
