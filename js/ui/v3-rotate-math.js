// =========================================================
// Rotate: Pole中心線まわりの点回転（永続座標用）
// P' = A + R(P - A)
// =========================================================
(function (root) {
  function hypot3(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  }

  function normalize(x, y, z) {
    const len = hypot3(x, y, z);
    if (len < 1e-9) return null;
    return { x: x / len, y: y / len, z: z / len };
  }

  function poleAxisFromJoints(a, b) {
    if (!a || !b) return null;
    let axis = normalize(b.x - a.x, b.y - a.y, b.z - a.z);
    if (!axis) return null;
    // 垂直Poleは上向きにそろえ、既存CW/CCW（上面から見た向き）と一致させる
    if (axis.y < -1e-6) {
      axis = { x: -axis.x, y: -axis.y, z: -axis.z };
    }
    return {
      origin: { x: a.x, y: a.y, z: a.z },
      axis,
    };
  }

  // 既存のXZ回転（+90で +X→+Z）と、+Y軸Rodriguesが一致するように符号を反転
  function rotationRadForDeg(deg) {
    return (-(Number(deg) || 0) * Math.PI) / 180;
  }

  // Rodrigues: v' = v cosθ + (k × v) sinθ + k (k · v) (1 - cosθ)
  function rotatePointAroundAxis(p, origin, axis, rad) {
    const vx = p.x - origin.x;
    const vy = p.y - origin.y;
    const vz = p.z - origin.z;
    const k = normalize(axis.x, axis.y, axis.z);
    if (!k) {
      return { x: p.x, y: p.y, z: p.z };
    }
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dot = k.x * vx + k.y * vy + k.z * vz;
    const cx = k.y * vz - k.z * vy;
    const cy = k.z * vx - k.x * vz;
    const cz = k.x * vy - k.y * vx;
    const oneMinus = 1 - cos;
    return {
      x: origin.x + vx * cos + cx * sin + k.x * dot * oneMinus,
      y: origin.y + vy * cos + cy * sin + k.y * dot * oneMinus,
      z: origin.z + vz * cos + cz * sin + k.z * dot * oneMinus,
    };
  }

  function roundCoord(n) {
    return Math.round(n * 1e6) / 1e6;
  }

  function applyRotateToPoint(p, origin, axis, rad) {
    const next = rotatePointAroundAxis(p, origin, axis, rad);
    p.x = roundCoord(next.x);
    p.y = roundCoord(next.y);
    p.z = roundCoord(next.z);
    return p;
  }

  function axisDistance(p, origin, axis) {
    const vx = p.x - origin.x;
    const vy = p.y - origin.y;
    const vz = p.z - origin.z;
    const k = normalize(axis.x, axis.y, axis.z);
    if (!k) return hypot3(vx, vy, vz);
    const cx = k.y * vz - k.z * vy;
    const cy = k.z * vx - k.x * vz;
    const cz = k.x * vy - k.y * vx;
    return hypot3(cx, cy, cz);
  }

  const api = {
    hypot3,
    normalize,
    poleAxisFromJoints,
    rotationRadForDeg,
    rotatePointAroundAxis,
    applyRotateToPoint,
    axisDistance,
    roundCoord,
  };

  root.v3RotateMath = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    const assertNear = (a, b, label) => {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d = hypot3(dx, dy, dz);
      if (d > 1e-6) {
        throw new Error(label + " dist=" + d + " got=" + JSON.stringify(a) + " expected=" + JSON.stringify(b));
      }
    };
    const origin = { x: 800, y: 0, z: 400 };
    const top = { x: 800, y: 300, z: 400 };
    const axis = poleAxisFromJoints(origin, top);
    const p = { x: 1000, y: 0, z: 400 };
    const q = rotatePointAroundAxis(p, axis.origin, axis.axis, rotationRadForDeg(90));
    assertNear(q, { x: 800, y: 0, z: 600 }, "90deg around vertical pole");
    const axisPt = rotatePointAroundAxis(origin, axis.origin, axis.axis, Math.PI / 2);
    assertNear(axisPt, origin, "axis origin stays");
    const farPole = poleAxisFromJoints({ x: 1500, y: 0, z: -200 }, { x: 1500, y: 400, z: -200 });
    const r0 = { x: 1500, y: 50, z: -200 };
    const r1 = rotatePointAroundAxis(r0, farPole.origin, farPole.axis, Math.PI / 2);
    assertNear(r1, r0, "point on far pole stays");
    console.log("v3-rotate-math self-test OK");
  }
})(typeof window !== "undefined" ? window : globalThis);
