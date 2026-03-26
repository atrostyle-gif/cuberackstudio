// シンプル版 OrbitControls
// カメラをドラッグで回転・ホイールでズームだけできる最小実装

THREE.OrbitControls = function (object, domElement) {
  const scope = this;

  this.object = object;
  this.domElement = domElement || document;

  this.enabled = true;
  this.target = new THREE.Vector3();

  this.minDistance = 10;
  this.maxDistance = Infinity;

  this.rotateSpeed = 1.0;
  this.zoomSpeed = 1.0;

  const STATE = { NONE: -1, ROTATE: 0 };
  let state = STATE.NONE;

  const spherical = new THREE.Spherical();
  const sphericalDelta = new THREE.Spherical(0, 0, 0);
  let scale = 1;

  const rotateStart = new THREE.Vector2();
  const rotateEnd = new THREE.Vector2();
  const rotateDelta = new THREE.Vector2();

  // --- 内部関数 ---

  function getZoomScale() {
    return Math.pow(0.95, scope.zoomSpeed);
  }

  function rotateLeft(angle) {
    sphericalDelta.theta -= angle;
  }

  function rotateUp(angle) {
    sphericalDelta.phi -= angle;
  }

  function handleMouseDownRotate(event) {
    rotateStart.set(event.clientX, event.clientY);
  }

  function handleMouseMoveRotate(event) {
    rotateEnd.set(event.clientX, event.clientY);
    rotateDelta.subVectors(rotateEnd, rotateStart);

    const element = scope.domElement === document ? scope.domElement.body : scope.domElement;
    rotateLeft((2 * Math.PI * rotateDelta.x) / element.clientHeight * scope.rotateSpeed);
    rotateUp((2 * Math.PI * rotateDelta.y) / element.clientHeight * scope.rotateSpeed);

    rotateStart.copy(rotateEnd);

    scope.update();
  }

  function handleMouseWheel(event) {
    if (event.deltaY < 0) {
      // 拡大
      scale /= getZoomScale();
    } else if (event.deltaY > 0) {
      // 縮小
      scale *= getZoomScale();
    }
    scope.update();
  }

  function onMouseDown(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    if (event.button === 0) { // 左クリック
      state = STATE.ROTATE;
      handleMouseDownRotate(event);
    }

    if (state !== STATE.NONE) {
      window.addEventListener('mousemove', onMouseMove, false);
      window.addEventListener('mouseup', onMouseUp, false);
    }
  }

  function onMouseMove(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    if (state === STATE.ROTATE) {
      handleMouseMoveRotate(event);
    }
  }

  function onMouseUp(event) {
    window.removeEventListener('mousemove', onMouseMove, false);
    window.removeEventListener('mouseup', onMouseUp, false);
    state = STATE.NONE;
  }

  function onMouseWheel(event) {
    if (scope.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    handleMouseWheel(event);
  }

  // --- public: カメラ位置を更新 ---

  this.update = function () {
    const offset = new THREE.Vector3();

    // カメラからターゲットへのベクトル
    offset.copy(scope.object.position).sub(scope.target);

    // 球面座標に変換
    spherical.setFromVector3(offset);

    spherical.theta += sphericalDelta.theta;
    spherical.phi += sphericalDelta.phi;

    // 上下の回転制限（真上・真下に行き過ぎないように）
    const EPS = 0.000001;
    spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));

    // ズーム反映
    spherical.radius *= scale;
    spherical.radius = Math.max(scope.minDistance, Math.min(scope.maxDistance, spherical.radius));

    // 再びデカルト座標に戻す
    offset.setFromSpherical(spherical);

    // カメラ位置を更新
    scope.object.position.copy(scope.target).add(offset);
    scope.object.lookAt(scope.target);

    // 次フレームに備えて差分をリセット
    sphericalDelta.set(0, 0, 0);
    scale = 1;
  };

  this.dispose = function () {
    scope.domElement.removeEventListener('mousedown', onMouseDown, false);
    scope.domElement.removeEventListener('wheel', onMouseWheel, false);
    window.removeEventListener('mousemove', onMouseMove, false);
    window.removeEventListener('mouseup', onMouseUp, false);
  };

  // イベント登録
  this.domElement.addEventListener('mousedown', onMouseDown, false);
  this.domElement.addEventListener('wheel', onMouseWheel, { passive: false });

  // 初期位置を反映
  this.update();
};