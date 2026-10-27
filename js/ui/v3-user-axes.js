// =========================================================
// ユーザー向け座標: X=左右(Three X), Y=奥行(Three Z), Z=高さ(Three Y)
// Three.js 内部座標・スナップ・接続計算は変更しない。
// =========================================================
(function (global) {
  "use strict";

  var USER = ["X", "Y", "Z"];
  var MAP = {
    X: { three: "x", color: 0xef4444, css: "#ef4444", meaning: "左右" },
    Y: { three: "z", color: 0x22c55e, css: "#22c55e", meaning: "奥行" },
    Z: { three: "y", color: 0x3b82f6, css: "#3b82f6", meaning: "高さ" },
  };
  var THREE_TO_USER = { x: "X", y: "Z", z: "Y" };

  function isThreeToken(axis) {
    var s = String(axis || "");
    return s === "x" || s === "y" || s === "z";
  }

  function userOfThree(axis) {
    var a = String(axis || "").toLowerCase();
    return THREE_TO_USER[a] || null;
  }

  function threeOfUser(axis) {
    var a = String(axis || "").toUpperCase();
    return MAP[a] ? MAP[a].three : null;
  }

  // 小文字 x/y/z は Three、大文字 X/Y/Z はユーザー表示。混同しない。
  function normalizeUser(axis) {
    if (axis == null || axis === "") return null;
    var s = String(axis);
    if (isThreeToken(s)) return THREE_TO_USER[s];
    var u = s.toUpperCase();
    if (MAP[u]) return u;
    return THREE_TO_USER[s.toLowerCase()] || null;
  }

  function normalizeThree(axis) {
    var user = normalizeUser(axis);
    return user && MAP[user] ? MAP[user].three : null;
  }

  function info(axis) {
    var user = normalizeUser(axis);
    if (!user || !MAP[user]) return null;
    return {
      user: user,
      three: MAP[user].three,
      color: MAP[user].color,
      css: MAP[user].css,
      meaning: MAP[user].meaning,
    };
  }

  function labelOfThree(axis) {
    var inf = info(axis);
    return inf ? inf.user : String(axis || "").toUpperCase();
  }

  function colorOfThree(axis) {
    var inf = info(axis);
    return inf ? inf.color : 0x94a3b8;
  }

  function cssOfThree(axis) {
    var inf = info(axis);
    return inf ? inf.css : "#94a3b8";
  }

  function readComp(pos, threeAxis) {
    if (!pos) return 0;
    var a = String(threeAxis || "").toLowerCase();
    if (a === "x") return Number(pos.x) || 0;
    if (a === "y") return Number(pos.y) || 0;
    if (a === "z") return Number(pos.z) || 0;
    return 0;
  }

  global.v3UserAxes = {
    USER: USER,
    MAP: MAP,
    userOfThree: userOfThree,
    threeOfUser: threeOfUser,
    normalizeUser: normalizeUser,
    normalizeThree: normalizeThree,
    info: info,
    labelOfThree: labelOfThree,
    colorOfThree: colorOfThree,
    cssOfThree: cssOfThree,
    readComp: readComp,
  };
})(typeof window !== "undefined" ? window : this);
