// =========================================================
// 背景写真表示機能
// =========================================================

// 背景写真表示の状態管理
window.isBackgroundPhotoOn = false;
window.backgroundPhotoTexture = null;
window.originalBackground = null;
window.originalClearColor = null;
window.originalClearAlpha = null;
window.backgroundPhotoObjectURL = null;

// 背景写真調整の状態管理
window.bgFloorHeightPercent = 50; // 0-100
window.bgFloorOffsetMm = 0; // -1000 to +1000
window.bgScalePercent = 100; // 50-200
window.bgHorizontalOffsetMm = 0; // -2000 to +2000 (横方向の位置調整)
window.bgShadowOn = true;

// グリッドの可視状態（復帰用）
window.originalGridVisibility = null;

// カメラ/コントロールの元の状態（復帰用）
window.originalCameraPositionForBg = null;
window.originalControlsTargetForBg = null;
window.originalControlsMinDistanceForBg = null;
window.originalControlsMaxDistanceForBg = null;
window.originalControlsMaxPolarAngleForBg = null;
window.originalFOVForBg = null;

// 接地リング
window.groundRingMesh = null;

// =========================================================
// 背景写真表示機能
// =========================================================

window.toggleBackgroundPhoto = function(on) {
  if (typeof on !== "boolean") {
    window.isBackgroundPhotoOn = !window.isBackgroundPhotoOn;
  } else {
    window.isBackgroundPhotoOn = !!on;
  }

  if (!window.scene) {
    console.warn("[bg] scene not available");
    return;
  }

  if (window.isBackgroundPhotoOn) {
    // 背景写真をON
    if (!window.backgroundPhotoTexture) {
      console.warn("[bg] No texture loaded");
      syncBackgroundPhotoUI();
      return;
    }

    // 元の状態を保存（初回のみ）
    saveBackgroundState();

    // テクスチャを設定
    window.scene.background = window.backgroundPhotoTexture;
    
    // 色空間設定
    if (window.backgroundPhotoTexture.colorSpace !== undefined) {
      window.backgroundPhotoTexture.colorSpace = THREE.SRGBColorSpace;
    } else if (window.backgroundPhotoTexture.encoding !== undefined) {
      window.backgroundPhotoTexture.encoding = THREE.sRGBEncoding;
    }
    
    window.backgroundPhotoTexture.needsUpdate = true;

    // 目線固定を適用
    applyEyeLevelFix();

    // 接地リングを表示
    if (window.bgShadowOn) {
      showGroundRing();
    }

    // グリッドを非表示
    hideGridForBackground();

    // UIを表示
    showBackgroundPhotoUI();

    console.log("[bg] Background photo ON");
  } else {
    // 背景写真をOFF（完全復帰）
    restoreBackgroundState();

    // 接地リングを非表示
    hideGroundRing();

    // グリッドを復帰
    restoreGridForBackground();

    // UIを非表示
    hideBackgroundPhotoUI();

    console.log("[bg] Background photo OFF");
  }

  syncBackgroundPhotoUI();
};

function saveBackgroundState() {
  if (!window.camera || !window.controls) return;

  if (window.originalBackground === null) {
    window.originalBackground = window.scene.background ? 
      (window.scene.background.isColor ? window.scene.background.clone() : window.scene.background) : 
      null;
  }
  if (!window.originalClearColor && window.renderer) {
    window.originalClearColor = window.renderer.getClearColor(new THREE.Color());
    window.originalClearAlpha = window.renderer.getClearAlpha();
  }
  if (window.originalCameraPositionForBg === null) {
    window.originalCameraPositionForBg = window.camera.position.clone();
  }
  if (window.originalControlsTargetForBg === null) {
    window.originalControlsTargetForBg = window.controls.target.clone();
  }
  if (window.originalFOVForBg === null) {
    window.originalFOVForBg = window.camera.fov;
  }
  if (window.originalControlsMinDistanceForBg === null) {
    window.originalControlsMinDistanceForBg = window.controls.minDistance;
  }
  if (window.originalControlsMaxDistanceForBg === null) {
    window.originalControlsMaxDistanceForBg = window.controls.maxDistance;
  }
  if (window.originalControlsMaxPolarAngleForBg === null) {
    window.originalControlsMaxPolarAngleForBg = window.controls.maxPolarAngle;
  }
}

function restoreBackgroundState() {
  if (!window.scene) return;

  // 背景を復帰
  if (window.originalBackground !== null) {
    if (window.originalBackground && window.originalBackground.isColor) {
      window.scene.background = window.originalBackground.clone();
    } else {
      window.scene.background = window.originalBackground;
    }
    window.originalBackground = null;
  } else {
    window.scene.background = new THREE.Color(0xf0f0f0);
  }

  // clearColor復帰
  if (window.originalClearColor && window.renderer) {
    window.renderer.setClearColor(window.originalClearColor, window.originalClearAlpha || 1);
  }

  // カメラ/コントロールを復帰
  if (!window.camera || !window.controls) return;

  if (window.originalCameraPositionForBg !== null) {
    window.camera.position.copy(window.originalCameraPositionForBg);
    window.originalCameraPositionForBg = null;
  }
  if (window.originalControlsTargetForBg !== null) {
    window.controls.target.copy(window.originalControlsTargetForBg);
    window.originalControlsTargetForBg = null;
  }
  if (window.originalFOVForBg !== null) {
    window.camera.fov = window.originalFOVForBg;
    window.originalFOVForBg = null;
  }
  if (window.originalControlsMinDistanceForBg !== null) {
    window.controls.minDistance = window.originalControlsMinDistanceForBg;
    window.originalControlsMinDistanceForBg = null;
  }
  if (window.originalControlsMaxDistanceForBg !== null) {
    window.controls.maxDistance = window.originalControlsMaxDistanceForBg;
    window.originalControlsMaxDistanceForBg = null;
  }
  if (window.originalControlsMaxPolarAngleForBg !== null) {
    window.controls.maxPolarAngle = window.originalControlsMaxPolarAngleForBg;
    window.originalControlsMaxPolarAngleForBg = null;
  }

  window.camera.updateProjectionMatrix();
  if (window.controls.update) {
    window.controls.update();
  }
}

// 目線固定（Orbit維持）
function applyEyeLevelFix() {
  if (!window.camera || !window.controls || !window.isBackgroundPhotoOn) return;
  if (window.originalControlsTargetForBg === null) return;

  // target.yを固定（床基準）
  window.controls.target.y = window.originalControlsTargetForBg.y;

  // カメラのY位置を目線高さ（1100mm）に設定
  const eyeHeight = 1100;
  const currentPos = window.camera.position;
  const currentTarget = window.controls.target;
  const horizontalDx = currentPos.x - currentTarget.x;
  const horizontalDz = currentPos.z - currentTarget.z;

  window.camera.position.x = currentTarget.x + horizontalDx;
  window.camera.position.y = currentTarget.y + eyeHeight;
  window.camera.position.z = currentTarget.z + horizontalDz;

  window.camera.updateProjectionMatrix();
  if (window.controls.update) {
    window.controls.update();
  }
}

// 目線固定の補正（animate関数から呼ぶ）
window.correctBackgroundEyeLevel = function() {
  if (!window.isBackgroundPhotoOn || !window.camera || !window.controls) return;
  if (window.originalControlsTargetForBg === null || window.originalCameraPositionForBg === null) return;

  // グリッドを非表示（毎フレーム確実に非表示にする）
  if (typeof grid25 !== "undefined" && grid25) grid25.visible = false;
  if (typeof grid50 !== "undefined" && grid50) grid50.visible = false;
  if (typeof grid100 !== "undefined" && grid100) grid100.visible = false;
  if (typeof grid200 !== "undefined" && grid200) grid200.visible = false;

  const baseTarget = window.originalControlsTargetForBg;
  const currentTarget = window.controls.target;
  const currentPos = window.camera.position;

  // 調整値を適用したtarget.yを使用
  const offsetY = window.bgFloorOffsetMm;
  const adjustedTargetY = baseTarget.y + offsetY;

  // target.yを調整値込みで固定
  window.controls.target.y = adjustedTargetY;

  // スケール調整値を考慮
  const scaleFactor = window.bgScalePercent / 100;
  const baseDx = window.originalCameraPositionForBg.x - baseTarget.x;
  const baseDz = window.originalCameraPositionForBg.z - baseTarget.z;
  const baseHorizontalDist = Math.sqrt(baseDx * baseDx + baseDz * baseDz);
  const newHorizontalDist = baseHorizontalDist * scaleFactor;

  // 現在の角度を保持
  const currentDx = currentPos.x - currentTarget.x;
  const currentDz = currentPos.z - currentTarget.z;
  const currentAngle = Math.atan2(currentDz, currentDx);

  // 横方向の位置調整（視点の中心を横方向に移動）
  const horizontalOffsetMm = window.bgHorizontalOffsetMm;
  // 現在の視点方向に対して垂直な方向（左90度回転）
  const perpendicularAngle = currentAngle + Math.PI / 2;
  const offsetX = Math.cos(perpendicularAngle) * horizontalOffsetMm;
  const offsetZ = Math.sin(perpendicularAngle) * horizontalOffsetMm;

  // targetを横方向に移動
  window.controls.target.x = baseTarget.x + offsetX;
  window.controls.target.z = baseTarget.z + offsetZ;

  // 床高さ調整値を考慮（pitch角度）
  const imageHeightRatio = window.bgFloorHeightPercent / 100;
  const pitchAngle = (imageHeightRatio - 0.5) * 60; // -30 to +30 degrees
  const pitchRad = pitchAngle * Math.PI / 180;

  // カメラ位置を更新（移動後のtargetを基準に）
  const eyeHeight = 1100;
  const heightAdjust = Math.tan(pitchRad) * newHorizontalDist;

  window.camera.position.x = window.controls.target.x + Math.cos(currentAngle) * newHorizontalDist;
  window.camera.position.y = adjustedTargetY + eyeHeight + heightAdjust;
  window.camera.position.z = window.controls.target.z + Math.sin(currentAngle) * newHorizontalDist;
};

// 背景写真調整を適用（スライダー変更時に呼ぶ）
function applyBackgroundAdjustments() {
  if (!window.camera || !window.controls || !window.isBackgroundPhotoOn) return;
  
  // correctBackgroundEyeLevel()が次フレームで調整値を適用するので、
  // ここでは即座に適用するだけ
  window.correctBackgroundEyeLevel();
}

// 接地リングを表示
function showGroundRing() {
  if (!window.scene || !window.rackGroup) return;

  if (window.groundRingMesh) {
    window.groundRingMesh.visible = true;
    return;
  }

  try {
    let ringGeometry;
    if (typeof THREE.RingGeometry !== "undefined") {
      ringGeometry = new THREE.RingGeometry(4000, 4500, 64);
    } else {
      const outerRadius = 4500;
      const innerRadius = 4000;
      const shape = new THREE.Shape();
      shape.moveTo(outerRadius, 0);
      shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.moveTo(innerRadius, 0);
      hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      ringGeometry = new THREE.ShapeGeometry(shape, 64);
    }

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    window.groundRingMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    window.groundRingMesh.rotation.x = -Math.PI / 2;
    window.groundRingMesh.position.y = 0.1;
    window.groundRingMesh.renderOrder = -1;

    if (window.rackGroup) {
      window.rackGroup.add(window.groundRingMesh);
    } else {
      window.scene.add(window.groundRingMesh);
    }

    console.log("[bg] Ground ring shown");
  } catch (err) {
    console.warn("[bg] Failed to create ground ring:", err);
  }
}

function hideGroundRing() {
  if (window.groundRingMesh) {
    window.groundRingMesh.visible = false;
  }
}

// グリッドを非表示（背景写真ON時）
function hideGridForBackground() {
  if (!window.scene) return;

  // 元の可視状態を保存（初回のみ）
  if (window.originalGridVisibility === null) {
    window.originalGridVisibility = {};
    window.scene.traverse((obj) => {
      if (obj && obj.isGridHelper) {
        window.originalGridVisibility[obj.uuid] = obj.visible;
      }
    });
  }

  // すべてのグリッドを非表示（scene.traverseとグローバル変数の両方で）
  window.scene.traverse((obj) => {
    if (obj && obj.isGridHelper) {
      obj.visible = false;
    }
  });

  // グローバル変数でも直接非表示に（確実性のため）
  if (typeof grid25 !== "undefined" && grid25) grid25.visible = false;
  if (typeof grid50 !== "undefined" && grid50) grid50.visible = false;
  if (typeof grid100 !== "undefined" && grid100) grid100.visible = false;
  if (typeof grid200 !== "undefined" && grid200) grid200.visible = false;
}

// グリッドを復帰（背景写真OFF時）
function restoreGridForBackground() {
  if (!window.scene || !window.originalGridVisibility) return;

  // 保存していた可視状態を復元
  window.scene.traverse((obj) => {
    if (obj && obj.isGridHelper && window.originalGridVisibility[obj.uuid] !== undefined) {
      obj.visible = window.originalGridVisibility[obj.uuid];
    }
  });

  // 保存データをクリア
  window.originalGridVisibility = null;

  // グリッドの表示状態を更新（updateGridVisibilityByDistanceが自動的に処理する）
  // 明示的に呼ぶ必要はない（animate関数で毎フレーム実行される）
}

function syncBackgroundPhotoUI() {
  const btn = document.getElementById("background-photo-toggle-btn");
  if (!btn) return;

  btn.classList.toggle("is-on", window.isBackgroundPhotoOn);
  btn.classList.toggle("is-off", !window.isBackgroundPhotoOn);
  btn.textContent = window.isBackgroundPhotoOn ? "背景写真 ON" : "背景写真 OFF";
  btn.setAttribute("aria-pressed", window.isBackgroundPhotoOn ? "true" : "false");
}

function showBackgroundPhotoUI() {
  const ui = document.getElementById("background-photo-ui");
  if (ui) {
    ui.style.display = "block";
  }
}

function hideBackgroundPhotoUI() {
  const ui = document.getElementById("background-photo-ui");
  if (ui) {
    ui.style.display = "none";
  }
}

function loadBackgroundPhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return;
  }

  const objectURL = URL.createObjectURL(file);

  try {
    // 既存のテクスチャを破棄
    if (window.backgroundPhotoTexture) {
      if (window.backgroundPhotoTexture.dispose) {
        window.backgroundPhotoTexture.dispose();
      }
      if (window.backgroundPhotoObjectURL) {
        URL.revokeObjectURL(window.backgroundPhotoObjectURL);
      }
    }

    const loader = new THREE.TextureLoader();
    window.backgroundPhotoTexture = loader.load(
      objectURL,
      function(texture) {
        console.log("[bg] texture loaded successfully");
        
        if (texture.colorSpace !== undefined) {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else if (texture.encoding !== undefined) {
          texture.encoding = THREE.sRGBEncoding;
        }
        
        texture.needsUpdate = true;
        window.backgroundPhotoObjectURL = objectURL;

        // 背景がONの場合は即座に適用
        if (window.isBackgroundPhotoOn && window.scene) {
          window.toggleBackgroundPhoto(true);
        }
      },
      undefined,
      function(err) {
        console.error("[bg] Failed to load texture:", err);
        URL.revokeObjectURL(objectURL);
        alert("画像の読み込みに失敗しました。");
      }
    );
  } catch (err) {
    console.error("[bg] Failed to create texture:", err);
    URL.revokeObjectURL(objectURL);
    alert("画像の読み込みに失敗しました。");
  }
}

// =========================================================
// UI初期化
// =========================================================

function bindDisplaySettingsUI() {
  if (window.__CR_DISPLAY_UI_BOUND__) {
    console.warn("[display] UI already bound, skipping");
    return;
  }

  // 背景写真トグルボタン
  const bgToggleBtn = document.getElementById("background-photo-toggle-btn");
  if (!bgToggleBtn) {
    console.warn("[display] #background-photo-toggle-btn not found");
    return;
  }
  bgToggleBtn.addEventListener("click", () => {
    console.log("[display] Background photo toggle clicked");
    window.toggleBackgroundPhoto();
  });

  // 背景画像アップロードボタン
  const bgUploadBtn = document.getElementById("background-photo-upload-btn");
  const bgInput = document.getElementById("background-photo-input");
  if (!bgUploadBtn) {
    console.warn("[display] #background-photo-upload-btn not found");
  } else if (!bgInput) {
    console.warn("[display] #background-photo-input not found");
  } else {
    bgUploadBtn.addEventListener("click", () => {
      bgInput.value = "";
      bgInput.click();
    });
    bgInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        console.log("[bg] file selected", file.name, file.size);
        loadBackgroundPhoto(file);
      }
    });
  }

  // 背景写真調整UIのバインド
  bindBackgroundPhotoUI();

  syncBackgroundPhotoUI();

  window.__CR_DISPLAY_UI_BOUND__ = true;
  console.log("[display] UI bound successfully");
}

function bindBackgroundPhotoUI() {
  const floorHeightSlider = document.getElementById("bg-floor-height-slider");
  const floorOffsetSlider = document.getElementById("bg-floor-offset-slider");
  const scaleSlider = document.getElementById("bg-scale-slider");
  const horizontalOffsetSlider = document.getElementById("bg-horizontal-offset-slider");
  const shadowCheckbox = document.getElementById("bg-shadow-checkbox");
  const resetBtn = document.getElementById("bg-reset-btn");

  // 床高さ(画像)スライダー
  if (floorHeightSlider) {
    floorHeightSlider.addEventListener("input", (e) => {
      window.bgFloorHeightPercent = parseInt(e.target.value, 10);
      const valueEl = document.getElementById("bg-floor-height-value");
      if (valueEl) valueEl.textContent = window.bgFloorHeightPercent + "%";
      applyBackgroundAdjustments();
    });
  }

  // 3D床オフセットスライダー
  if (floorOffsetSlider) {
    floorOffsetSlider.addEventListener("input", (e) => {
      window.bgFloorOffsetMm = parseInt(e.target.value, 10);
      const valueEl = document.getElementById("bg-floor-offset-value");
      if (valueEl) valueEl.textContent = window.bgFloorOffsetMm;
      applyBackgroundAdjustments();
    });
  }

  // スケールスライダー
  if (scaleSlider) {
    scaleSlider.addEventListener("input", (e) => {
      window.bgScalePercent = parseInt(e.target.value, 10);
      const valueEl = document.getElementById("bg-scale-value");
      if (valueEl) valueEl.textContent = window.bgScalePercent + "%";
      applyBackgroundAdjustments();
    });
  }

  // 横方向位置調整スライダー
  if (horizontalOffsetSlider) {
    horizontalOffsetSlider.addEventListener("input", (e) => {
      window.bgHorizontalOffsetMm = parseInt(e.target.value, 10);
      const valueEl = document.getElementById("bg-horizontal-offset-value");
      if (valueEl) valueEl.textContent = window.bgHorizontalOffsetMm;
      applyBackgroundAdjustments();
    });
  }

  // 接地リングチェックボックス
  if (shadowCheckbox) {
    shadowCheckbox.checked = window.bgShadowOn;
    shadowCheckbox.addEventListener("change", (e) => {
      window.bgShadowOn = e.target.checked;
      if (window.bgShadowOn) {
        showGroundRing();
      } else {
        hideGroundRing();
      }
    });
  }

  // リセットボタン
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      window.bgFloorHeightPercent = 50;
      window.bgFloorOffsetMm = 0;
      window.bgScalePercent = 100;
      window.bgHorizontalOffsetMm = 0;
      updateBackgroundPhotoSliders();
      applyBackgroundAdjustments();
      console.log("[bg] Reset");
    });
  }
}

function updateBackgroundPhotoSliders() {
  const floorHeightSlider = document.getElementById("bg-floor-height-slider");
  const floorHeightValue = document.getElementById("bg-floor-height-value");
  const floorOffsetSlider = document.getElementById("bg-floor-offset-slider");
  const floorOffsetValue = document.getElementById("bg-floor-offset-value");
  const scaleSlider = document.getElementById("bg-scale-slider");
  const scaleValue = document.getElementById("bg-scale-value");
  const horizontalOffsetSlider = document.getElementById("bg-horizontal-offset-slider");
  const horizontalOffsetValue = document.getElementById("bg-horizontal-offset-value");

  if (floorHeightSlider) floorHeightSlider.value = window.bgFloorHeightPercent;
  if (floorHeightValue) floorHeightValue.textContent = window.bgFloorHeightPercent + "%";
  if (floorOffsetSlider) floorOffsetSlider.value = window.bgFloorOffsetMm;
  if (floorOffsetValue) floorOffsetValue.textContent = window.bgFloorOffsetMm;
  if (scaleSlider) scaleSlider.value = window.bgScalePercent;
  if (scaleValue) scaleValue.textContent = window.bgScalePercent + "%";
  if (horizontalOffsetSlider) horizontalOffsetSlider.value = window.bgHorizontalOffsetMm;
  if (horizontalOffsetValue) horizontalOffsetValue.textContent = window.bgHorizontalOffsetMm;
}

window.initDisplayFeatures = function() {
  bindDisplaySettingsUI();
};

// DOMContentLoaded後またはUI生成直後に呼ぶ
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindDisplaySettingsUI);
} else {
  bindDisplaySettingsUI();
}
