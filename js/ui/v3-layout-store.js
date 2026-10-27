// =========================================================
// CUI-3A: UI配置の localStorage 保存
// - 設計JSON / Firestore には書かない
// - 不正データは初期配置へ戻す
// =========================================================

(function () {
  const KEY = "cuberack.v3.uiLayout";
  const VERSION = 1;
  const EDGES = { north: 1, south: 1, west: 1, east: 1 };

  const GROUP_IDS = ["select", "add", "edit", "board", "place", "view"];
  const COLS = { auto: 1, "1": 1, "2": 1, "3": 1 };
  const MIN_W = 64;
  const MAX_W = 196;
  const DEFAULT_W = 112;
  const RADIAL_SLOTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const RADIAL_CMDS = {
    select: 1, beam: 1, pole: 1, leg: 1, connect: 1,
    length: 1, material: 1, delete: 1, shelf: 1, wall: 1, move: 1,
    rotate: 1, duplicate: 1, clusterDel: 1, autolayout: 1, dimension: 1, estimate: 1,
    colorchart: 1, drawing: 1,
  };
  const DEFAULT_HEADER_ICONS = [
    "new", "open", "save", "save-as", "undo", "redo", "gap",
    "view", "more", "staff", "legacy", "version",
  ];
  const DEFAULT_CAD_ICONS = [
    "select",
    "beam", "pole", "leg", "connect",
    "length", "material",
    "shelf",
    "move", "rotate", "duplicate", "clusterDel", "autolayout",
    "dimension", "drawing", "colorchart", "layers", "structural", "settings",
  ];

  function defaultGroups() {
    const out = {};
    GROUP_IDS.forEach((id) => { out[id] = true; });
    return out;
  }

  function defaultState() {
    return {
      v: VERSION,
      toolbars: {
        tools: { mode: "dock", edge: "north", x: 72, y: 96, w: DEFAULT_W, cols: "auto" },
      },
      popups: {},
      groups: defaultGroups(),
      radial: defaultRadial(),
      viewport: defaultViewport(),
      layers: defaultLayers(),
      layerPanel: { open: false },
      eastRail: defaultEastRail(),
      headerIcons: defaultHeaderIcons(),
      cadIcons: defaultCadIcons(),
    };
  }

  function defaultEastRail() {
    return { open: null, width: 280 };
  }

  function defaultHeaderIcons() {
    return { order: DEFAULT_HEADER_ICONS.slice(), fileOpsMigrated: true };
  }

  function defaultCadIcons() {
    return { order: DEFAULT_CAD_ICONS.slice() };
  }

  function mergeCadIconOrder(saved, defaults) {
    const def = Array.isArray(defaults) && defaults.length
      ? defaults
      : DEFAULT_CAD_ICONS;
    const known = {};
    def.forEach(function (id) { known[id] = true; });
    const out = [];
    const seen = {};
    if (Array.isArray(saved)) {
      saved.forEach(function (id) {
        if (typeof id !== "string" || !known[id] || seen[id]) return;
        seen[id] = true;
        out.push(id);
      });
    }
    def.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function placeNewBeforeOpen(order) {
    const ids = [];
    const seen = {};
    (Array.isArray(order) ? order : []).forEach(function (id) {
      if (id === "new" || typeof id !== "string" || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
    const openAt = ids.indexOf("open");
    if (openAt >= 0) ids.splice(openAt, 0, "new");
    else ids.unshift("new");
    return ids;
  }

  function mergeHeaderIconOrder(saved, defaults) {
    const def = Array.isArray(defaults) && defaults.length
      ? defaults
      : DEFAULT_HEADER_ICONS;
    const known = {};
    def.forEach(function (id) { known[id] = true; });
    const out = [];
    const seen = {};
    if (Array.isArray(saved)) {
      saved.forEach(function (id) {
        if (typeof id !== "string" || !known[id] || seen[id]) return;
        seen[id] = true;
        out.push(id);
      });
    }
    def.forEach(function (id) {
      if (seen[id] || id === "new") return;
      seen[id] = true;
      out.push(id);
    });
    if (!seen.new && known.new) {
      const openAt = out.indexOf("open");
      if (openAt >= 0) out.splice(openAt, 0, "new");
      else out.unshift("new");
    }
    return out;
  }

  function migrateHeaderIconOrder(saved, defaults) {
    const merged = mergeHeaderIconOrder(saved, defaults);
    if (Array.isArray(saved) && saved.indexOf("new") >= 0 && saved[saved.length - 1] === "new") {
      return placeNewBeforeOpen(merged);
    }
    return merged;
  }

  function headerInsertIndex(centers, x) {
    if (!Array.isArray(centers) || !centers.length) return 0;
    if (typeof x !== "number" || !Number.isFinite(x)) return 0;
    for (let i = 0; i < centers.length; i += 1) {
      if (x < centers[i]) return i;
    }
    return centers.length;
  }

  function defaultRadial() {
    return {
      n: "beam",
      ne: "rotate",
      e: "pole",
      se: "length",
      s: "dimension",
      sw: "autolayout",
      w: "move",
      nw: "colorchart",
    };
  }

  function defaultViewport() {
    return { showViewNav: true, radialEnabled: true, viewNavW: 400 };
  }

  function defaultLayers() {
    return { frame: true, beam: true, pole: true, joint: true, leg: true, shelf: true, wall: true };
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
    let w = isFiniteNumber(raw.w) ? raw.w : base.w;
    if (!isFiniteNumber(w)) w = DEFAULT_W;
    w = Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
    const colsRaw = raw.cols == null ? base.cols : String(raw.cols);
    const cols = COLS[colsRaw] ? colsRaw : "auto";
    return { mode, edge, x, y, w, cols };
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

  function sanitizeGroups(raw) {
    const out = defaultGroups();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    GROUP_IDS.forEach((id) => {
      if (typeof raw[id] === "boolean") out[id] = raw[id];
    });
    return out;
  }

  function sanitizeRadial(raw) {
    const out = defaultRadial();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    RADIAL_SLOTS.forEach((slot) => {
      let cmd = String(raw[slot] || "");
      if (cmd === "joint") cmd = "select";
      if (RADIAL_CMDS[cmd]) out[slot] = cmd;
    });
    return out;
  }

  function sanitizeViewport(raw) {
    const out = defaultViewport();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    if (typeof raw.showViewNav === "boolean") out.showViewNav = raw.showViewNav;
    if (typeof raw.radialEnabled === "boolean") out.radialEnabled = raw.radialEnabled;
    if (isFiniteNumber(raw.viewNavW)) {
      out.viewNavW = Math.min(550, Math.max(280, Math.round(raw.viewNavW)));
    }
    return out;
  }

  function sanitizeLayers(raw) {
    const out = defaultLayers();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    ["frame", "beam", "pole", "joint", "leg", "shelf", "wall"].forEach((id) => {
      if (typeof raw[id] === "boolean") out[id] = raw[id];
    });
    return out;
  }

  function sanitizeLayerPanel(raw) {
    const out = { open: false };
    if (!raw || typeof raw !== "object") return out;
    if (typeof raw.open === "boolean") out.open = raw.open;
    return out;
  }

  function sanitizeEastRail(raw) {
    const out = defaultEastRail();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    if (raw.open === null || raw.open === "") out.open = null;
    else if (raw.open === "autolayout" || raw.open === "layers" || raw.open === "add" || raw.open === "length") out.open = raw.open;
    if (isFiniteNumber(raw.width)) {
      out.width = Math.min(420, Math.max(220, Math.round(raw.width)));
    }
    return out;
  }

  function sanitizeHeaderIcons(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.order)) {
      return { order: DEFAULT_HEADER_ICONS.slice(), fileOpsMigrated: true };
    }
    const order = raw.fileOpsMigrated
      ? mergeHeaderIconOrder(raw.order)
      : migrateHeaderIconOrder(raw.order);
    return { order, fileOpsMigrated: true };
  }

  function sanitizeCadIcons(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.order)) {
      return { order: DEFAULT_CAD_ICONS.slice() };
    }
    return { order: mergeCadIconOrder(raw.order) };
  }

  function sanitize(raw) {
    const def = defaultState();
    if (!raw || typeof raw !== "object" || raw.v !== VERSION) return def;
    const tools = sanitizeToolbar(raw.toolbars && raw.toolbars.tools, def.toolbars.tools);
    return {
      v: VERSION,
      toolbars: { tools },
      popups: sanitizePopups(raw.popups),
      groups: sanitizeGroups(raw.groups),
      radial: sanitizeRadial(raw.radial),
      viewport: sanitizeViewport(raw.viewport),
      layers: sanitizeLayers(raw.layers),
      layerPanel: sanitizeLayerPanel(raw.layerPanel),
      eastRail: sanitizeEastRail(raw.eastRail),
      headerIcons: sanitizeHeaderIcons(raw.headerIcons),
      cadIcons: sanitizeCadIcons(raw.cadIcons),
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
    GROUP_IDS,
    MIN_W,
    MAX_W,
    DEFAULT_W,
    RADIAL_SLOTS,
    RADIAL_CMDS,
    defaultState,
    defaultGroups,
    defaultRadial,
    defaultViewport,
    defaultLayers,
    defaultEastRail,
    defaultHeaderIcons,
    defaultCadIcons,
    DEFAULT_HEADER_ICONS,
    DEFAULT_CAD_ICONS,
    mergeHeaderIconOrder,
    mergeCadIconOrder,
    migrateHeaderIconOrder,
    placeNewBeforeOpen,
    headerInsertIndex,
    load,
    save,
    reset,
    sanitize,
  };
})();
