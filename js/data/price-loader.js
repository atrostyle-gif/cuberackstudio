// js/data/price-loader.js
// リモート価格表 JSON を取得し、parts-catalog.js へマージする（開発時フォールバックあり）

(function () {
  "use strict";

  const CORE_PRICE_PART_KEYS = [
    "jointBall", "jointCap", "topCap", "sideCap", "legBoss", "leg",
    "m5Screw", "beamNut",
    "beam_25", "beam_50", "beam_100", "beam_150", "beam_200",
    "beam_300", "beam_400", "beam_500", "beam_600", "beam_800",
    "pole_50", "pole_100", "pole_200", "pole_300", "pole_400",
    "pole_500", "pole_600", "pole_800",
  ];

  const BASIC_PART_KEYS = [
    "jointBall", "jointCap", "topCap", "sideCap",
    "legBoss", "leg", "beamNut", "m5Screw",
  ];

  function catalogKeyRank(key) {
    const basicIdx = BASIC_PART_KEYS.indexOf(key);
    if (basicIdx >= 0) return basicIdx;

    const beam = /^beam_(\d+)$/.exec(key);
    if (beam) return 100 + Number(beam[1]);

    const pole = /^pole_(\d+)$/.exec(key);
    if (pole) return 1000 + Number(pole[1]);

    if (key === "shelfBoard") return 2000;
    if (key === "wallPanel") return 2001;

    const shelfBracket = /^shelfBracket_(\d+)$/.exec(key);
    if (shelfBracket) return 3000 + Number(shelfBracket[1]);

    const wallBracket = /^wallBracket_(\d+)$/.exec(key);
    if (wallBracket) return 4000 + Number(wallBracket[1]);

    return 9000;
  }

  function sortPriceCatalogKeys(keys) {
    return [...keys].sort((a, b) => {
      const diff = catalogKeyRank(a) - catalogKeyRank(b);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
  }

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function deepMerge(target, source) {
    if (!isPlainObject(target) || !isPlainObject(source)) return source;
    const out = { ...target };
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = out[key];
      if (isPlainObject(tv) && isPlainObject(sv)) {
        out[key] = deepMerge(tv, sv);
      } else if (sv !== undefined) {
        out[key] = sv;
      }
    }
    return out;
  }

  function mergeCatalogEntries(target, source) {
    if (!isPlainObject(target) || !isPlainObject(source)) return;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      if (isPlainObject(sv) && isPlainObject(target[key])) {
        target[key] = { ...target[key], ...sv };
      } else {
        target[key] = sv;
      }
    }
  }

  function isRemoteConfigured() {
    const cfg = window.PRICING_CONFIG || {};
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function getRemoteClient() {
    if (!isRemoteConfigured()) return null;
    if (!window.supabase?.createClient) {
      console.warn("[price-loader] 価格クライアントが読み込まれていません");
      return null;
    }
    if (!window.__cuberackSupabaseClient) {
      const cfg = window.PRICING_CONFIG;
      window.__cuberackSupabaseClient = window.supabase.createClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey
      );
    }
    return window.__cuberackSupabaseClient;
  }

  function hasCatalogPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    const keys = [
      "partsCatalog",
      "partPriceByMaterial",
      "scaffoldBoardPrices",
      "scaffoldPanelPrices",
      "partsWholesale",
      "partWholesaleByMaterial",
      "scaffoldBoardWholesalePrices",
      "scaffoldPanelWholesalePrices",
      "orderRules",
      "orderPricing",
    ];
    return keys.some((k) => {
      const v = payload[k];
      return isPlainObject(v) && Object.keys(v).length > 0;
    });
  }

  function normalizeCatalogRow(row) {
    if (!row) return null;
    let catalog = row.catalog_json ?? row;
    if (typeof catalog === "string") {
      try {
        catalog = JSON.parse(catalog);
      } catch (_) {
        return null;
      }
    }
    if (!hasCatalogPayload(catalog)) return null;
    unifyIronPrices(catalog);
    catalog.updatedAt = catalog.updatedAt || row.updated_at || null;
    catalog._source = "remote";
    return catalog;
  }

  function readCache() {
    const cfg = window.PRICING_CONFIG || {};
    const key = cfg.cacheKey || "cuberack_price_catalog_v1";
    const ttl = Number(cfg.cacheTtlMs) || 0;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data) return null;
      if (ttl > 0 && parsed.fetchedAt) {
        const age = Date.now() - Number(parsed.fetchedAt);
        if (age > ttl) return null;
      }
      return parsed.data;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    const cfg = window.PRICING_CONFIG || {};
    const key = cfg.cacheKey || "cuberack_price_catalog_v1";
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ fetchedAt: Date.now(), data })
      );
    } catch (_) {}
  }

  const SIZE_TABLE_ONLY_KEYS = { shelfBoard: true, wallPanel: true };

  function isPricedCatalogKey(key, item) {
    if (!key || SIZE_TABLE_ONLY_KEYS[key]) return false;
    return !!(item && typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice));
  }

  /**
   * 旧 partsCatalog.unitPrice を IRON へ初回だけ引き継ぐ。
   * ironPriceUnified 付きの JSON では unitPrice で IRON を上書きしない。
   */
  function unifyIronPrices(catalog) {
    if (!isPlainObject(catalog)) return catalog;

    const parts = isPlainObject(catalog.partsCatalog) ? catalog.partsCatalog : {};
    if (!isPlainObject(catalog.partPriceByMaterial)) catalog.partPriceByMaterial = {};
    const byMat = catalog.partPriceByMaterial;
    const partsWs = isPlainObject(catalog.partsWholesale) ? catalog.partsWholesale : {};
    let matWs = isPlainObject(catalog.partWholesaleByMaterial) ? catalog.partWholesaleByMaterial : null;
    const already = catalog.ironPriceUnified === true;

    const keys = new Set(Object.keys(parts).concat(Object.keys(byMat), Object.keys(partsWs)));
    keys.forEach((key) => {
      if (SIZE_TABLE_ONLY_KEYS[key]) return;
      const item = parts[key];
      const unitPrice = isPricedCatalogKey(key, item) ? item.unitPrice : null;
      if (!already) {
        if (unitPrice === null && !isPlainObject(byMat[key]) && !Object.prototype.hasOwnProperty.call(partsWs, key)) return;
        if (unitPrice !== null || isPlainObject(byMat[key])) {
          if (!isPlainObject(byMat[key])) byMat[key] = {};
          if (unitPrice !== null) {
            byMat[key].IRON = unitPrice;
          }
        }
        if (Object.prototype.hasOwnProperty.call(partsWs, key)) {
          if (!matWs) {
            catalog.partWholesaleByMaterial = {};
            matWs = catalog.partWholesaleByMaterial;
          }
          if (!isPlainObject(matWs[key])) matWs[key] = {};
          if (!Object.prototype.hasOwnProperty.call(matWs[key], "IRON")) {
            const n = Number(partsWs[key]);
            if (Number.isFinite(n) && n >= 0) matWs[key].IRON = Math.round(n);
          }
        }
      }
      if (item && isPlainObject(byMat[key]) && typeof byMat[key].IRON === "number") {
        item.unitPrice = byMat[key].IRON;
      }
    });

    catalog.ironPriceUnified = true;
    return catalog;
  }

  function syncUnitPriceFromIron(partsCatalog, partPriceByMaterial) {
    if (!isPlainObject(partsCatalog) || !isPlainObject(partPriceByMaterial)) return;
    Object.keys(partPriceByMaterial).forEach((key) => {
      if (SIZE_TABLE_ONLY_KEYS[key]) return;
      const row = partPriceByMaterial[key];
      const item = partsCatalog[key];
      if (item && isPlainObject(row) && typeof row.IRON === "number") {
        item.unitPrice = row.IRON;
      }
    });
  }

  function applyPriceCatalog(payload) {
    if (!payload || typeof payload !== "object") return false;

    const hadPartsWholesale = Object.prototype.hasOwnProperty.call(payload, "partsWholesale");
    const hadMatWholesale = Object.prototype.hasOwnProperty.call(payload, "partWholesaleByMaterial");
    const hadBoardWholesale = Object.prototype.hasOwnProperty.call(payload, "scaffoldBoardWholesalePrices");
    const hadPanelWholesale = Object.prototype.hasOwnProperty.call(payload, "scaffoldPanelWholesalePrices");

    if (payload.partsCatalog || payload.partPriceByMaterial || payload.ironPriceUnified) {
      unifyIronPrices(payload);
    }

    if (payload.partsCatalog && window.PARTS_CATALOG) {
      mergeCatalogEntries(window.PARTS_CATALOG, payload.partsCatalog);
    }
    if (payload.partPriceByMaterial && window.PART_PRICE_BY_MATERIAL) {
      window.PART_PRICE_BY_MATERIAL = deepMerge(
        window.PART_PRICE_BY_MATERIAL,
        payload.partPriceByMaterial
      );
    }
    if (payload.scaffoldBoardPrices) {
      window.SCAFFOLD_BOARD_PRICE_TABLE = deepMerge(
        window.SCAFFOLD_BOARD_PRICE_TABLE || {},
        payload.scaffoldBoardPrices
      );
    }
    if (payload.scaffoldPanelPrices) {
      window.SCAFFOLD_PANEL_PRICE_TABLE = deepMerge(
        window.SCAFFOLD_PANEL_PRICE_TABLE || {},
        payload.scaffoldPanelPrices
      );
    }
    if (payload.orderRules && window.ORDER_RULES) {
      window.ORDER_RULES = deepMerge(window.ORDER_RULES, payload.orderRules);
    }
    if (payload.orderPricing && typeof window.applyOrderPricingOverrides === "function") {
      window.applyOrderPricingOverrides(payload.orderPricing);
    }
    if (hadPartsWholesale) {
      window.PARTS_WHOLESALE = isPlainObject(payload.partsWholesale)
        ? JSON.parse(JSON.stringify(payload.partsWholesale))
        : {};
    }
    if (hadMatWholesale) {
      window.PART_WHOLESALE_BY_MATERIAL = isPlainObject(payload.partWholesaleByMaterial)
        ? JSON.parse(JSON.stringify(payload.partWholesaleByMaterial))
        : {};
    } else if (isPlainObject(payload.partWholesaleByMaterial) && Object.keys(payload.partWholesaleByMaterial).length) {
      window.PART_WHOLESALE_BY_MATERIAL = deepMerge(
        window.PART_WHOLESALE_BY_MATERIAL || {},
        payload.partWholesaleByMaterial
      );
    }
    if (hadBoardWholesale) {
      window.SCAFFOLD_BOARD_WHOLESALE_TABLE = isPlainObject(payload.scaffoldBoardWholesalePrices)
        ? JSON.parse(JSON.stringify(payload.scaffoldBoardWholesalePrices))
        : {};
    }
    if (hadPanelWholesale) {
      window.SCAFFOLD_PANEL_WHOLESALE_TABLE = isPlainObject(payload.scaffoldPanelWholesalePrices)
        ? JSON.parse(JSON.stringify(payload.scaffoldPanelWholesalePrices))
        : {};
    }

    syncUnitPriceFromIron(window.PARTS_CATALOG, window.PART_PRICE_BY_MATERIAL);
    window.__IRON_PRICE_UNIFIED__ = true;

    window.__PRICE_CATALOG_META__ = {
      version: payload.version ?? null,
      updatedAt: payload.updatedAt ?? null,
      source: payload._source || "remote",
    };

    try {
      window.dispatchEvent(
        new CustomEvent("cuberack:prices-loaded", { detail: payload })
      );
    } catch (_) {}

    return true;
  }

  function exportPriceCatalogSnapshot() {
    unifyIronPrices({
      partsCatalog: window.PARTS_CATALOG || {},
      partPriceByMaterial: window.PART_PRICE_BY_MATERIAL || {},
      partsWholesale: window.PARTS_WHOLESALE || {},
      partWholesaleByMaterial: window.PART_WHOLESALE_BY_MATERIAL || {},
      ironPriceUnified: window.__IRON_PRICE_UNIFIED__ === true,
    });
    window.__IRON_PRICE_UNIFIED__ = true;
    syncUnitPriceFromIron(window.PARTS_CATALOG, window.PART_PRICE_BY_MATERIAL);
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      ironPriceUnified: true,
      partsCatalog: JSON.parse(JSON.stringify(window.PARTS_CATALOG || {})),
      partPriceByMaterial: JSON.parse(
        JSON.stringify(window.PART_PRICE_BY_MATERIAL || {})
      ),
      scaffoldBoardPrices: JSON.parse(
        JSON.stringify(window.SCAFFOLD_BOARD_PRICE_TABLE || {})
      ),
      scaffoldPanelPrices: JSON.parse(
        JSON.stringify(window.SCAFFOLD_PANEL_PRICE_TABLE || {})
      ),
      orderRules: JSON.parse(JSON.stringify(window.ORDER_RULES || {})),
      orderPricing:
        typeof window.exportOrderPricingSnapshot === "function"
          ? window.exportOrderPricingSnapshot()
          : undefined,
      partsWholesale: JSON.parse(JSON.stringify(window.PARTS_WHOLESALE || {})),
      partWholesaleByMaterial: JSON.parse(
        JSON.stringify(window.PART_WHOLESALE_BY_MATERIAL || {})
      ),
      scaffoldBoardWholesalePrices: JSON.parse(
        JSON.stringify(window.SCAFFOLD_BOARD_WHOLESALE_TABLE || {})
      ),
      scaffoldPanelWholesalePrices: JSON.parse(
        JSON.stringify(window.SCAFFOLD_PANEL_WHOLESALE_TABLE || {})
      ),
    };
  }

  /**
   * 卸価格入力。空欄は未登録、0 は有効。負数・非数は不正。
   */
  function parseWholesaleInput(raw) {
    if (raw === null || raw === undefined) {
      return { ok: true, registered: false, value: null };
    }
    const s = String(raw).trim();
    if (s === "") return { ok: true, registered: false, value: null };
    const n = Number(s);
    if (!Number.isFinite(n)) {
      return { ok: false, registered: false, value: null, error: "数値ではありません" };
    }
    if (n < 0) {
      return { ok: false, registered: false, value: null, error: "0以上である必要があります" };
    }
    return { ok: true, registered: true, value: Math.round(n) };
  }

  /**
   * 価格表の内部整合性を検証（必須キー・単価の妥当性・IRON価格の一致など）
   */
  function checkPriceCatalogIntegrity(catalog) {
    const issues = [];
    let checked = 0;

    function issue(key, field, message) {
      issues.push({ key, field, message });
    }

    for (const key of CORE_PRICE_PART_KEYS) {
      const cat = catalog?.partsCatalog?.[key];
      const mat = catalog?.partPriceByMaterial?.[key];

      if (!cat || typeof cat.unitPrice !== "number") {
        issue(key, "unitPrice", "基本単価が未設定です");
      } else {
        checked++;
        if (cat.unitPrice < 0) issue(key, "unitPrice", "単価が負の値です");
      }

      if (!mat || typeof mat.IRON !== "number") {
        issue(key, "IRON", "材種別単価（IRON）が未設定です");
      } else {
        checked++;
        if (mat.IRON < 0) issue(key, "IRON", "単価が負の値です");
        if (cat && typeof cat.unitPrice === "number" && cat.unitPrice !== mat.IRON) {
          issue(key, "IRON", `基本単価（${cat.unitPrice}）と IRON 単価（${mat.IRON}）が一致しません`);
        }
      }

      for (const m of ["BS", "SUS"]) {
        if (mat && typeof mat[m] === "number") {
          checked++;
          if (mat[m] < 0) issue(key, m, "単価が負の値です");
        }
      }
    }

    const boardKeys = Object.keys(catalog?.scaffoldBoardPrices || {});
    const panelKeys = Object.keys(catalog?.scaffoldPanelPrices || {});
    checked += boardKeys.length + panelKeys.length;

    for (const k of boardKeys) {
      const v = catalog.scaffoldBoardPrices[k];
      if (typeof v !== "number" || v < 0) {
        issue(k, "棚板", "単価が不正です");
      }
    }
    for (const k of panelKeys) {
      const v = catalog.scaffoldPanelPrices[k];
      if (typeof v !== "number" || v < 0) {
        issue(k, "壁板", "単価が不正です");
      }
    }

    function checkWholesaleMap(map, field) {
      if (!isPlainObject(map)) return;
      for (const k of Object.keys(map)) {
        const v = map[k];
        if (isPlainObject(v)) {
          for (const mat of Object.keys(v)) {
            const n = v[mat];
            if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
              issue(k, field + "/" + mat, "卸価格が不正です");
            } else {
              checked++;
            }
          }
        } else if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
          issue(k, field, "卸価格が不正です");
        } else {
          checked++;
        }
      }
    }
    checkWholesaleMap(catalog.partsWholesale, "卸");
    checkWholesaleMap(catalog.partWholesaleByMaterial, "材種別卸");
    checkWholesaleMap(catalog.scaffoldBoardWholesalePrices, "棚板卸");
    checkWholesaleMap(catalog.scaffoldPanelWholesalePrices, "壁板卸");

    return {
      ok: issues.length === 0,
      issues,
      checkedCount: checked,
    };
  }

  async function fetchRemoteCatalog() {
    const client = getRemoteClient();
    if (!client) return null;

    const { data, error } = await client
      .from("price_catalog")
      .select("catalog_json, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;
    return normalizeCatalogRow(data);
  }

  let loadPromise = null;
  let forcePromise = null;

  function emitPricesError(error, source) {
    const message = (error && error.message) ? String(error.message) : String(error || "価格の取得に失敗しました");
    window.__PRICE_CATALOG_META__ = {
      source: source || "error",
      error: message,
      staleApplied: false,
    };
    try {
      window.dispatchEvent(new CustomEvent("cuberack:prices-error", {
        detail: { source: source || "error", error: message },
      }));
    } catch (_) {}
  }

  async function fetchRemoteCatalogLive() {
    const fn = window.fetchRemoteCatalog;
    if (typeof fn === "function") return fn();
    return fetchRemoteCatalog();
  }

  async function loadPriceCatalog(options = {}) {
    const force = !!options.force;
    const skipCache = !!options.skipCache;
    const allowStale = options.allowStale !== false;

    if (force) {
      if (forcePromise) return forcePromise;
    } else if (loadPromise) {
      return loadPromise;
    }

    const task = (async () => {
      if (!isRemoteConfigured()) {
        window.__PRICE_CATALOG_META__ = { source: "bundled" };
        return { ok: true, source: "bundled" };
      }

      const applyBundled = () => {
        window.__PRICE_CATALOG_META__ = { source: "bundled" };
        return { ok: true, source: "bundled" };
      };

      if (!skipCache) {
        const cached = readCache();
        if (cached && hasCatalogPayload(cached)) {
          applyPriceCatalog({ ...cached, _source: "cache" });
          fetchRemoteCatalogLive()
            .then((fresh) => {
              if (!fresh) return;
              writeCache(fresh);
              applyPriceCatalog(fresh);
            })
            .catch((e) =>
              console.warn("[price-loader] background refresh failed", e)
            );
          return { ok: true, source: "cache", data: cached };
        }
      }

      try {
        const remote = await fetchRemoteCatalogLive();
        if (remote) {
          writeCache(remote);
          applyPriceCatalog(remote);
          return { ok: true, source: "remote", data: remote };
        }
        if (!allowStale) {
          emitPricesError(new Error("最新の価格を取得できませんでした"), "empty");
          return { ok: false, source: "empty" };
        }
        return applyBundled();
      } catch (e) {
        if (!allowStale) {
          console.warn("[price-loader] remote load failed, stale not applied", e);
          emitPricesError(e, "error");
          return { ok: false, source: "error", error: e };
        }
        const stale = readCache();
        if (stale && hasCatalogPayload(stale)) {
          console.warn("[price-loader] remote failed, using stale cache", e);
          applyPriceCatalog({ ...stale, _source: "stale-cache" });
          return { ok: true, source: "stale-cache", data: stale, error: e };
        }
        console.warn(
          "[price-loader] remote load failed, using parts-catalog fallback",
          e
        );
        return applyBundled();
      }
    })();

    if (force) {
      forcePromise = task;
      try {
        return await task;
      } finally {
        if (forcePromise === task) forcePromise = null;
        loadPromise = null;
      }
    }

    loadPromise = task;
    return task;
  }

  function refreshPriceCatalog(options) {
    return loadPriceCatalog(Object.assign({
      force: true,
      skipCache: true,
      allowStale: false,
    }, options || {}));
  }

  async function savePriceCatalog(payload, options = {}) {
    const client = getRemoteClient();
    if (!client) throw new Error("価格の保存先が未設定です");

    const adminPassword = options.adminPassword || "";
    if (!adminPassword) {
      throw new Error("管理者パスワードが必要です");
    }

    const body = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await client.rpc("save_price_catalog", {
      payload: body,
      admin_password: adminPassword,
    });

    if (error) throw error;

    const saved =
      normalizeCatalogRow({ catalog_json: data, updated_at: body.updatedAt }) ||
      body;
    writeCache(saved);
    applyPriceCatalog(saved);
    return saved;
  }

  window.deepMergePriceCatalog = deepMerge;
  window.applyPriceCatalog = applyPriceCatalog;
  window.exportPriceCatalogSnapshot = exportPriceCatalogSnapshot;
  window.checkPriceCatalogIntegrity = checkPriceCatalogIntegrity;
  window.CORE_PRICE_PART_KEYS = CORE_PRICE_PART_KEYS;
  window.sortPriceCatalogKeys = sortPriceCatalogKeys;
  window.fetchRemoteCatalog = fetchRemoteCatalog;
  window.fetchSupabaseCatalog = fetchRemoteCatalog;
  window.loadPriceCatalog = loadPriceCatalog;
  window.refreshPriceCatalog = refreshPriceCatalog;
  window.savePriceCatalog = savePriceCatalog;
  window.parseWholesaleInput = parseWholesaleInput;
  window.unifyIronPrices = unifyIronPrices;

  if (window.PARTS_CATALOG && window.PART_PRICE_BY_MATERIAL) {
    unifyIronPrices({
      partsCatalog: window.PARTS_CATALOG,
      partPriceByMaterial: window.PART_PRICE_BY_MATERIAL,
      partsWholesale: window.PARTS_WHOLESALE || {},
      partWholesaleByMaterial: window.PART_WHOLESALE_BY_MATERIAL || {},
      ironPriceUnified: false,
    });
    window.__IRON_PRICE_UNIFIED__ = true;
  }
})();
