// =========================================================
// V3 InstancedMesh 描画プール
// Beam / Pole / JointBall / Leg を種類×材質ごとにインスタンス描画する。
// ハンドル（THREE.Mesh）はシーンに入れず、既存の mesh 参照・選択・色APIを維持する。
// 設計座標（joints の float64）は触らない。
// =========================================================
(function () {
  if (!window.THREE) return;

  const CAP0 = 128;
  const PRODUCT_PREVIEW_SCALE = 6.5 / 4;
  const _pools = Object.create(null);
  const _legSlots = [];
  let _dirty = true;
  let _cylGeom = null;
  let _jointGeom = null;
  let _legBaseGeom = null;
  let _legConeGeom = null;
  const _mtx = new THREE.Matrix4();
  const _tmpPos = new THREE.Vector3();
  const _tmpQuat = new THREE.Quaternion();
  const _tmpScl = new THREE.Vector3();
  const _color = new THREE.Color();
  const _idToHandle = new WeakMap();

  const pool = {
    enabled: true,
    dirty: function () { _dirty = true; },
    isHandle: function (obj) { return !!(obj && obj.userData && obj.userData.v3Instanced); },
  };

  function matCodeOf(code) {
    const n = typeof window.normalizeMaterial === "function" ? window.normalizeMaterial(code) : (code || "IRON");
    return n || "IRON";
  }

  function cylGeom() {
    if (_cylGeom) return _cylGeom;
    _cylGeom = new THREE.CylinderGeometry(4, 4, 1, 12);
    _cylGeom.userData.v3Shared = true;
    return _cylGeom;
  }

  function jointGeom() {
    if (_jointGeom) return _jointGeom;
    const r = window.jointRadius || 10;
    _jointGeom = new THREE.SphereGeometry(r, 16, 10);
    _jointGeom.userData.v3Shared = true;
    return _jointGeom;
  }

  function legBaseGeom() {
    if (window.legBaseGeometry) return window.legBaseGeometry;
    if (_legBaseGeom) return _legBaseGeom;
    _legBaseGeom = new THREE.CylinderGeometry(12.5, 12.5, 5, 16);
    _legBaseGeom.userData.v3Shared = true;
    return _legBaseGeom;
  }

  function legConeGeom() {
    if (window.legConeGeometry) return window.legConeGeometry;
    if (_legConeGeom) return _legConeGeom;
    _legConeGeom = new THREE.CylinderGeometry(7.5, 12.5, 7.9, 16);
    _legConeGeom.userData.v3Shared = true;
    return _legConeGeom;
  }

  function geomOf(kind) {
    if (kind === "joint") return jointGeom();
    if (kind === "legBase") return legBaseGeom();
    if (kind === "legCone") return legConeGeom();
    return cylGeom();
  }

  function srcMaterial(kind) {
    if (kind === "joint") return window.jointMaterialNormal;
    if (kind === "pole") return window.poleMaterial;
    if (kind === "legBase" || kind === "legCone") return window.legMaterial;
    return window.beamMaterial;
  }

  function poolMaterial(kind, matCode) {
    const src = srcMaterial(kind) || new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mat = src.clone();
    mat.color.setHex(0xffffff);
    if (typeof window.applyMaterialFinish === "function") window.applyMaterialFinish(mat, matCode);
    const hex = window.MATERIAL_COLOR && window.MATERIAL_COLOR[matCode];
    if (typeof hex === "number" && kind !== "beam" && kind !== "pole") {
      // instanceColor が本色。白のまま finish だけ材質へ。
    }
    mat.vertexColors = false;
    return mat;
  }

  function keyOf(kind, matCode) {
    return kind + ":" + matCodeOf(matCode);
  }

  function nextCap(need) {
    let cap = CAP0;
    while (cap < need) cap *= 2;
    return cap;
  }

  // r128 の setColorAt は未作成時に mesh.count 件だけバッファを作る。
  // count を 0 にしてから初回同期すると長さ3になり、新規 slot の色書き込みが捨てられる。
  function defaultInstanceHex(kind, matCode) {
    const code = matCodeOf(matCode);
    const hex = window.MATERIAL_COLOR && window.MATERIAL_COLOR[code];
    if (typeof hex === "number") return hex;
    if (kind === "joint" || kind === "legBase" || kind === "legCone") return 0x111111;
    return 0x3a3a42;
  }

  function allocInstanceColor(mesh, cap, kind, matCode) {
    const n = Math.max(cap || 0, (mesh.instanceMatrix && mesh.instanceMatrix.count) || 0, 1);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    if (typeof attr.setUsage === "function" && typeof THREE.DynamicDrawUsage === "number") {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    _color.setHex(defaultInstanceHex(kind, matCode));
    for (let i = 0; i < n; i++) _color.toArray(attr.array, i * 3);
    mesh.instanceColor = attr;
    attr.needsUpdate = true;
  }

  function ensureInstanceColor(p) {
    const mesh = p && p.mesh;
    if (!mesh) return;
    const cap = p.capacity || (mesh.instanceMatrix && mesh.instanceMatrix.count) || CAP0;
    const need = cap * 3;
    if (mesh.instanceColor && mesh.instanceColor.array && mesh.instanceColor.array.length >= need) return;
    const prev = mesh.instanceColor;
    allocInstanceColor(mesh, cap, p.kind, p.matCode);
    if (prev && prev.array && mesh.instanceColor && mesh.instanceColor.array) {
      mesh.instanceColor.array.set(prev.array.subarray(0, Math.min(prev.array.length, need)));
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function makeInstanced(kind, matCode, cap) {
    const mesh = new THREE.InstancedMesh(geomOf(kind), poolMaterial(kind, matCode), cap);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    allocInstanceColor(mesh, cap, kind, matCode);
    mesh.count = 0;
    mesh.userData.v3PoolKind = kind;
    mesh.userData.v3PoolMat = matCodeOf(matCode);
    mesh.userData.v3InstancedRoot = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (window.rackGroup) window.rackGroup.add(mesh);
    else if (window.scene) window.scene.add(mesh);
    return mesh;
  }

  function ensurePool(kind, matCode, extra) {
    const key = keyOf(kind, matCode);
    let p = _pools[key];
    const need = (p ? p.handles.length : 0) + (extra || 1);
    if (!p) {
      const cap = nextCap(need);
      p = { key: key, kind: kind, matCode: matCodeOf(matCode), capacity: cap, mesh: makeInstanced(kind, matCode, cap), handles: [] };
      _pools[key] = p;
      return p;
    }
    if (need > p.capacity) {
      const cap = nextCap(need);
      const old = p.mesh;
      const neu = makeInstanced(kind, matCode, cap);
      neu.count = p.handles.length;
      for (let i = 0; i < p.handles.length; i++) {
        old.getMatrixAt(i, _mtx);
        neu.setMatrixAt(i, _mtx);
        if (old.instanceColor) {
          _color.fromBufferAttribute(old.instanceColor, i);
          neu.setColorAt(i, _color);
        }
      }
      neu.instanceMatrix.needsUpdate = true;
      if (neu.instanceColor) neu.instanceColor.needsUpdate = true;
      if (old.parent) old.parent.remove(old);
      p.mesh = neu;
      p.capacity = cap;
    }
    return p;
  }

  function register(handle) {
    if (!handle || handle.userData.v3Unique) return;
    const kind = handle.userData.v3Kind;
    const matCode = matCodeOf(handle.userData.v3MatCode);
    const prev = handle.userData.v3PoolKey;
    const key = keyOf(kind, matCode);
    if (prev && prev !== key) unregister(handle);
    const p = ensurePool(kind, matCode, 1);
    if (handle.userData.v3Slot >= 0 && handle.userData.v3PoolKey === key) return;
    handle.userData.v3Slot = p.handles.length;
    handle.userData.v3PoolKey = key;
    p.handles.push(handle);
    p.mesh.count = p.handles.length;
    ensureInstanceColor(p);
    p.mesh.setColorAt(handle.userData.v3Slot, colorFromHandle(handle));
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    _dirty = true;
  }

  function unregister(handle) {
    if (!handle) return;
    const key = handle.userData.v3PoolKey;
    const i = handle.userData.v3Slot;
    const p = key ? _pools[key] : null;
    handle.userData.v3Slot = -1;
    handle.userData.v3PoolKey = null;
    if (!p || i == null || i < 0) return;
    const last = p.handles.length - 1;
    const other = p.handles[last];
    p.handles[i] = other;
    if (other && i !== last) other.userData.v3Slot = i;
    p.handles.pop();
    if (p.mesh) p.mesh.count = p.handles.length;
    _dirty = true;
  }

  function makeStubMat(kind) {
    const src = srcMaterial(kind);
    if (src && src.clone) return src.clone();
    return new THREE.MeshStandardMaterial({ color: 0x3a3a42 });
  }

  function createHandle(kind, srcMat, matCode) {
    const handle = new THREE.Mesh(geomOf(kind), srcMat && srcMat.clone ? srcMat.clone() : makeStubMat(kind));
    handle.userData.v3Instanced = true;
    handle.userData.v3Kind = kind;
    handle.userData.v3MatCode = matCodeOf(matCode);
    handle.userData.v3Slot = -1;
    handle.userData.baseLengthMm = 1;
    handle.matrixAutoUpdate = true;
    handle.frustumCulled = false;
    handle.visible = true;
    register(handle);
    return handle;
  }

  function needsUnique(handle) {
    const mat = handle && handle.material;
    if (!mat) return false;
    return !!(mat.wireframe || mat.map);
  }

  function eject(handle) {
    if (!handle || handle.userData.v3Unique) return;
    unregister(handle);
    handle.userData.v3Instanced = false;
    handle.userData.v3Unique = true;
    if (window.rackGroup && !handle.parent) window.rackGroup.add(handle);
    _dirty = true;
  }

  function absorb(handle) {
    if (!handle || !handle.userData.v3Unique) return;
    if (needsUnique(handle)) return;
    if (handle.parent) handle.parent.remove(handle);
    handle.userData.v3Unique = false;
    handle.userData.v3Instanced = true;
    register(handle);
  }

  function isSelectedJointHandle(handle) {
    if (!handle) return false;
    const idx = window.selectedJointIndex;
    if (typeof idx !== "number" || idx < 0) return false;
    const meshes = window.jointMeshes;
    return !!(meshes && meshes[idx] === handle);
  }

  function colorFromHandle(handle) {
    const measHl = handle && handle.userData && handle.userData._v3MeasHL;
    if (typeof measHl === "number") {
      _color.setHex(measHl);
      return _color;
    }
    if (isSelectedJointHandle(handle)) {
      _color.setHex(0xef4444);
      return _color;
    }
    const mat = handle.material;
    if (mat && mat.color && mat.color.isColor) _color.copy(mat.color);
    else _color.setHex(0x3a3a42);
    if (mat && mat.emissive && mat.emissive.isColor && (mat.emissiveIntensity || 0) > 0.05) {
      _color.lerp(mat.emissive, Math.min(1, mat.emissiveIntensity));
    }
    return _color;
  }

  function matColorSrgb(matCode) {
    const hex = window.MATERIAL_COLOR && window.MATERIAL_COLOR[matCode];
    if (typeof hex === "number") {
      return {
        r: ((hex >> 16) & 255) / 255,
        g: ((hex >> 8) & 255) / 255,
        b: (hex & 255) / 255,
      };
    }
    if (typeof hex === "string") return hexToSrgb01(hex);
    return null;
  }

  function hexToSrgb01(hex) {
    const s = String(hex || "").replace("#", "");
    if (s.length < 6) return null;
    const n = parseInt(s, 16);
    if (!Number.isFinite(n)) return null;
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  function colorToSrgb01(color) {
    const c = color.clone();
    if (typeof c.convertLinearToSRGB === "function") c.convertLinearToSRGB();
    return { r: c.r, g: c.g, b: c.b };
  }

  function chartColorSrgb(handle, kind) {
    if (!window.isColorChartOn) return null;
    if (kind !== "beam" && kind !== "pole") return null;
    const list = kind === "pole" ? (window.poles || []) : (window.beams || []);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || item.mesh !== handle) continue;
      let len;
      if (kind === "pole") {
        const cad = typeof window.getPoleLength === "function" ? window.getPoleLength(item) : Number(item.lengthMm);
        if (typeof window.getPoleColorLengthMm === "function") len = window.getPoleColorLengthMm(item, cad);
        else len = Number(item.lengthMm) > 0 ? Number(item.lengthMm) : cad;
      } else {
        len = typeof window.getBeamLength === "function" ? window.getBeamLength(item) : item.lengthMm;
      }
      const hex = typeof window.getLengthColor === "function" ? window.getLengthColor(len) : null;
      return hexToSrgb01(hex);
    }
    return null;
  }

  function syncHandleMatrix(handle) {
    handle.updateMatrix();
    if (handle.visible === false) {
      _mtx.makeScale(0, 0, 0);
      return _mtx;
    }
    return handle.matrix;
  }

  let _lastSync = { at: 0, force: false, dirtyBefore: false, skipped: false, count: 0 };

  function sync(force) {
    const dirtyBefore = _dirty;
    if (!pool.enabled) {
      _lastSync = { at: Date.now(), force: !!force, dirtyBefore: dirtyBefore, skipped: true, reason: "disabled", count: _lastSync.count + 1 };
      return;
    }
    if (!_dirty && !force) {
      _lastSync = { at: Date.now(), force: !!force, dirtyBefore: dirtyBefore, skipped: true, reason: "clean", count: _lastSync.count + 1 };
      return;
    }
    _lastSync = { at: Date.now(), force: !!force, dirtyBefore: dirtyBefore, skipped: false, reason: "ran", count: _lastSync.count + 1 };
    syncLegs();
    Object.keys(_pools).forEach(function (key) {
      const p = _pools[key];
      if (!p || !p.mesh) return;
      ensureInstanceColor(p);
      const n = p.handles.length;
      p.mesh.count = n;
      p.mesh.visible = n > 0;
      for (let i = 0; i < n; i++) {
        const h = p.handles[i];
        if (!h) {
          _mtx.makeScale(0, 0, 0);
          p.mesh.setMatrixAt(i, _mtx);
          _color.setHex(defaultInstanceHex(p.kind, p.matCode));
          p.mesh.setColorAt(i, _color);
          continue;
        }
        if (needsUnique(h)) {
          eject(h);
          i--;
          continue;
        }
        p.mesh.setMatrixAt(i, syncHandleMatrix(h));
        p.mesh.setColorAt(i, colorFromHandle(h));
      }
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    });
    _dirty = false;
  }

  function registerLeg(group) {
    if (!group) return;
    group.userData.v3InstancedLeg = true;
    const matCode = matCodeOf(group.userData.v3MatCode || "IRON");
    const base = createHandle("legBase", window.legMaterial, matCode);
    const cone = createHandle("legCone", window.legMaterial, matCode);
    group.userData.v3LegBase = base;
    group.userData.v3LegCone = cone;
    _legSlots.push(group);
    _dirty = true;
    return group;
  }

  function unregisterLeg(group) {
    if (!group) return;
    unregister(group.userData.v3LegBase);
    unregister(group.userData.v3LegCone);
    const i = _legSlots.indexOf(group);
    if (i >= 0) _legSlots.splice(i, 1);
    _dirty = true;
  }

  function syncLegs() {
    const baseH = Number(window.LEG_BASE_H) || 5;
    const coneH = Number(window.LEG_CONE_H) || 7.9;
    const total = baseH + coneH;
    for (let i = 0; i < _legSlots.length; i++) {
      const g = _legSlots[i];
      if (!g) continue;
      const vis = g.visible !== false;
      const bx = g.position.x || 0;
      const by = g.position.y || 0;
      const bz = g.position.z || 0;
      const base = g.userData.v3LegBase;
      const cone = g.userData.v3LegCone;
      const baseY = by + (-total / 2 + baseH / 2);
      const coneY = baseY + baseH / 2 + coneH / 2;
      if (base) {
        base.visible = vis;
        base.position.set(bx, baseY, bz);
        base.scale.set(1, 1, 1);
      }
      if (cone) {
        cone.visible = vis;
        cone.position.set(bx, coneY, bz);
        cone.scale.set(1, 1, 1);
      }
    }
  }

  function createConnector(kind, material, matCode) {
    const handle = createHandle(kind === "pole" ? "pole" : "beam", material, matCode);
    handle.userData.baseLengthMm = 1;
    handle.scale.set(1, 1, 1);
    return handle;
  }

  function createJointHandle(pos, matCode) {
    const handle = createHandle("joint", window.jointMaterialNormal, matCode);
    if (pos) handle.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
    return handle;
  }

  function disposeHandle(handle) {
    if (!handle) return;
    if (handle.userData && handle.userData.v3InstancedLeg) {
      unregisterLeg(handle);
      return;
    }
    if (handle.userData && (handle.userData.v3Instanced || handle.userData.v3Unique)) {
      unregister(handle);
      if (handle.parent) handle.parent.remove(handle);
      if (handle.material && handle.material.dispose && !handle.geometry?.userData?.v3Shared) {
        /* keep shared geom */
      }
      if (handle.material && handle.material.dispose && handle.userData.v3Unique) {
        try { handle.material.dispose(); } catch (e) {}
      }
    }
  }

  function rewriteHit(hit) {
    if (!hit || !hit.object) return hit;
    const obj = hit.object;
    if (obj.userData && obj.userData.v3InstancedRoot && typeof hit.instanceId === "number") {
      const key = keyOf(obj.userData.v3PoolKind, obj.userData.v3PoolMat);
      const p = _pools[key];
      const handle = p && p.handles[hit.instanceId];
      if (handle) hit.object = handle;
    }
    return hit;
  }

  function rewriteHits(hits) {
    if (!hits) return hits;
    for (let i = 0; i < hits.length; i++) rewriteHit(hits[i]);
    return hits;
  }

  function wrapRaycaster() {
    if (!THREE.Raycaster || THREE.Raycaster.prototype.__v3InstWrapped) return;
    const origObjs = THREE.Raycaster.prototype.intersectObjects;
    const origObj = THREE.Raycaster.prototype.intersectObject;
    THREE.Raycaster.prototype.intersectObjects = function (objects, recursive, target) {
      const list = expandTargets(objects);
      const hits = origObjs.call(this, list, recursive, target);
      return rewriteHits(hits);
    };
    THREE.Raycaster.prototype.intersectObject = function (object, recursive, target) {
      const hits = origObj.call(this, object, recursive, target);
      return rewriteHits(hits);
    };
    THREE.Raycaster.prototype.__v3InstWrapped = true;
  }

  function expandTargets(objects) {
    if (!objects || !objects.length) return objects;
    const out = [];
    const seen = new Set();
    let hasHandle = false;
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (!o) continue;
      if (o.userData && o.userData.v3Instanced && !o.userData.v3Unique) {
        hasHandle = true;
        const key = o.userData.v3PoolKey;
        const p = key && _pools[key];
        if (p && p.mesh && !seen.has(p.mesh)) {
          seen.add(p.mesh);
          out.push(p.mesh);
        }
      } else if (o.userData && o.userData.v3InstancedLeg) {
        hasHandle = true;
        ["v3LegBase", "v3LegCone"].forEach(function (k) {
          const h = o.userData[k];
          const p = h && _pools[h.userData.v3PoolKey];
          if (p && p.mesh && !seen.has(p.mesh)) {
            seen.add(p.mesh);
            out.push(p.mesh);
          }
        });
      } else {
        out.push(o);
      }
    }
    if (!hasHandle) return objects;
    Object.keys(_pools).forEach(function (key) {
      const p = _pools[key];
      if (p && p.mesh && !seen.has(p.mesh) && p.kind !== "legBase" && p.kind !== "legCone") {
        // already added handles' pools
      }
    });
    return out.length ? out : objects;
  }

  function wrapApplyColor() {
    const orig = window.applyMaterialColorToMesh;
    if (typeof orig !== "function" || orig.__v3InstWrapped) return;
    window.applyMaterialColorToMesh = function (obj, code) {
      if (obj && obj.userData && obj.userData.v3Instanced) {
        obj.userData.v3MatCode = matCodeOf(code);
        orig(obj, code);
        register(obj);
        _dirty = true;
        return;
      }
      if (obj && obj.userData && obj.userData.v3InstancedLeg) {
        obj.userData.v3MatCode = matCodeOf(code);
        orig(obj.userData.v3LegBase, code);
        orig(obj.userData.v3LegCone, code);
        _dirty = true;
        return;
      }
      return orig(obj, code);
    };
    window.applyMaterialColorToMesh.__v3InstWrapped = true;
  }

  function wrapUpdateConnector() {
    const orig = window.updateConnectorMesh;
    if (typeof orig !== "function" || orig.__v3InstWrapped) return;
    window.updateConnectorMesh = function (mesh, aPos, bPos) {
      orig(mesh, aPos, bPos);
      if (mesh && mesh.userData && mesh.userData.v3Instanced) _dirty = true;
    };
    window.updateConnectorMesh.__v3InstWrapped = true;
  }

  function clear() {
    Object.keys(_pools).forEach(function (key) {
      const p = _pools[key];
      if (p && p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
      _pools[key] = null;
      delete _pools[key];
    });
    _legSlots.length = 0;
    _dirty = true;
  }

  function colorHex(color) {
    if (!color || typeof color.getHex !== "function") return null;
    return "0x" + color.getHex().toString(16).padStart(6, "0");
  }

  function inspectHandle(handle) {
    if (!handle) return { ok: false, reason: "no-handle" };
    const ud = handle.userData || {};
    const key = ud.v3PoolKey;
    const slot = ud.v3Slot;
    const p = key ? _pools[key] : null;
    const mat = handle.material;
    const out = {
      ok: true,
      instanced: !!ud.v3Instanced,
      unique: !!ud.v3Unique,
      kind: ud.v3Kind || null,
      matCode: ud.v3MatCode || null,
      poolKey: key || null,
      slot: typeof slot === "number" ? slot : null,
      parentType: handle.parent ? handle.parent.type : null,
      parentIsInstancedRoot: !!(handle.parent && handle.parent.userData && handle.parent.userData.v3InstancedRoot),
      visible: handle.visible !== false,
      pos: { x: handle.position.x, y: handle.position.y, z: handle.position.z },
      handleColor: mat && mat.color ? colorHex(mat.color) : null,
      handleEmissive: mat && mat.emissive ? colorHex(mat.emissive) : null,
      handleEmissiveIntensity: mat && typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : null,
      selectedByHandle: isSelectedJointHandle(handle),
      needsUnique: needsUnique(handle),
      inPoolHandles: !!(p && p.handles && p.handles[slot] === handle),
      poolMeshUuid: p && p.mesh ? p.mesh.uuid : null,
      poolMeshCount: p && p.mesh ? p.mesh.count : null,
      poolCapacity: p ? p.capacity : null,
      instanceColor: null,
      instancePos: null,
      dirty: _dirty,
    };
    if (p && p.mesh && typeof slot === "number" && slot >= 0) {
      if (p.mesh.instanceColor) {
        _color.fromBufferAttribute(p.mesh.instanceColor, slot);
        out.instanceColor = colorHex(_color);
        out.instanceColorRgb = { r: _color.r, g: _color.g, b: _color.b };
      }
      p.mesh.getMatrixAt(slot, _mtx);
      _mtx.decompose(_tmpPos, _tmpQuat, _tmpScl);
      out.instancePos = { x: _tmpPos.x, y: _tmpPos.y, z: _tmpPos.z };
    }
    return out;
  }

  function stats() {
    const keys = Object.keys(_pools);
    let instances = 0;
    let drawn = 0;
    const byKind = {};
    keys.forEach(function (k) {
      const p = _pools[k];
      const n = (p && p.handles && p.handles.length) || 0;
      instances += n;
      const kind = (p && p.kind) || String(k).split(":")[0];
      byKind[kind] = (byKind[kind] || 0) + n;
      if (p && p.mesh && p.mesh.parent) drawn += p.mesh.count || 0;
    });
    return { pools: keys.length, instances: instances, drawn: drawn, dirty: _dirty, byKind: byKind };
  }

  function exportSnapshot() {
    sync(true);
    const groups = [];
    const arr16 = [];
    Object.keys(_pools).forEach(function (key) {
      const p = _pools[key];
      if (!p || !p.mesh || !p.mesh.count) return;
      const n = p.mesh.count;
      const matrices = new Array(n * 16);
      const colors = new Array(n * 3);
      for (let i = 0; i < n; i++) {
        p.mesh.getMatrixAt(i, _mtx);
        if (p.kind === "beam" || p.kind === "pole") {
          _mtx.decompose(_tmpPos, _tmpQuat, _tmpScl);
          _tmpScl.x *= PRODUCT_PREVIEW_SCALE;
          _tmpScl.z *= PRODUCT_PREVIEW_SCALE;
          _mtx.compose(_tmpPos, _tmpQuat, _tmpScl);
        }
        _mtx.toArray(arr16);
        for (let k = 0; k < 16; k++) matrices[i * 16 + k] = arr16[k];
        const handle = p.handles && p.handles[i];
        const chart = handle ? chartColorSrgb(handle, p.kind) : null;
        const matRgb = !chart ? matColorSrgb(p.matCode) : null;
        if (chart) {
          colors[i * 3] = chart.r;
          colors[i * 3 + 1] = chart.g;
          colors[i * 3 + 2] = chart.b;
        } else if (matRgb) {
          colors[i * 3] = matRgb.r;
          colors[i * 3 + 1] = matRgb.g;
          colors[i * 3 + 2] = matRgb.b;
        } else if (p.mesh.instanceColor) {
          _color.fromBufferAttribute(p.mesh.instanceColor, i);
          const srgb = colorToSrgb01(_color);
          colors[i * 3] = srgb.r;
          colors[i * 3 + 1] = srgb.g;
          colors[i * 3 + 2] = srgb.b;
        } else {
          colors[i * 3] = 0.22;
          colors[i * 3 + 1] = 0.22;
          colors[i * 3 + 2] = 0.25;
        }
      }
      groups.push({ kind: p.kind, mat: p.matCode, count: n, matrices: matrices, colors: colors });
    });
    return groups;
  }

  pool.createConnector = createConnector;
  pool.createJoint = createJointHandle;
  pool.registerLeg = registerLeg;
  pool.unregisterLeg = unregisterLeg;
  pool.register = register;
  pool.unregister = unregister;
  pool.disposeHandle = disposeHandle;
  pool.eject = eject;
  pool.absorb = absorb;
  pool.sync = sync;
  pool.clear = clear;
  pool.rewriteHits = rewriteHits;
  pool.stats = stats;
  pool.exportSnapshot = exportSnapshot;
  pool.note = function () { _dirty = true; };
  pool.lastSync = function () { return _lastSync; };
  pool.isDirty = function () { return _dirty; };
  pool.isSelectedJointHandle = isSelectedJointHandle;
  pool.inspectHandle = inspectHandle;

  function boot() {
    wrapRaycaster();
    wrapApplyColor();
    wrapUpdateConnector();
  }

  boot();
  window.addEventListener("load", boot);

  window.v3InstancePool = pool;
})();
