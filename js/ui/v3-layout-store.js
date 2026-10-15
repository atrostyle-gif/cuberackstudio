// =========================================================
// CUI-3A: UI配置の localStorage 保存
// - 設計JSON / Firestore には書かない
// - 不正データは初期配置へ戻す
// =========================================================

(function () {
  const KEY = "cuberack.v3.uiLayout";
  const VERSION = 1;
  const EDGES = { north: 1, south: 1, west: 1, east: 1 };

  function defaultState() {
    return {
      v: VERSION,
      toolbars: {
        tools: { mode: "dock", edge: "west", x: 72, y: 96 },
      },
      popups: {},
    };
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function sanitizeToolbar(raw, fallback) {
    const base = fallback || defaultState().toolbars.tools;
    if (!raw || typeof raw !== "object") return { ...base };
    const mode = raw.mode === "float" ? "float" : raw.mode === "dock" ? "dock" : base.mode;
    const edge = EDGES[raw.edge] ? raw.edge : base.edge;
    let x = isFiniteNumber(raw.x) ? raw.x : base.x;
    let y = isFiniteNumber(raw.y) ? raw.y : base.y;
    if (Math.abs(x) > 20000 || Math.abs(y) > 20000) {
      x = base.x;
      y = base.y;
    }
    return { mode, edge, x, y };
  }

  function sanitizePopups(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    Object.keys(raw).forEach((id) => {
      if (!id || id.length > 64) return;
      const p = raw[id];
      if (!p || typeof p !== "object") return;
      if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return;
      if (Math.abs(p.x) > 20000 || Math.abs(p.y) > 20000) return;
      out[id] = { x: p.x, y: p.y };
    });
    return out;
  }

  function sanitize(raw) {
    const def = defaultState();
    if (!raw || typeof raw !== "object" || raw.v !== VERSION) return def;
    const tools = sanitizeToolbar(raw.toolbars && raw.toolbars.tools, def.toolbars.tools);
    return {
      v: VERSION,
      toolbars: { tools },
      popups: sanitizePopups(raw.popups),
    };
  }

  function load() {
    try {
      const text = window.localStorage.getItem(KEY);
      if (!text) return defaultState();
      return sanitize(JSON.parse(text));
    } catch (e) {
      console.warn("[v3-layout-store] invalid layout, using default", e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      const clean = sanitize(state);
      window.localStorage.setItem(KEY, JSON.stringify(clean));
      return clean;
    } catch (e) {
      console.warn("[v3-layout-store] save failed", e);
      return sanitize(state);
    }
  }

  function reset() {
    const next = defaultState();
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) {}
    return next;
  }

  window.v3LayoutStore = {
    KEY,
    VERSION,
    defaultState,
    load,
    save,
    reset,
    sanitize,
  };
})();
