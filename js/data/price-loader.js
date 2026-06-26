// js/data/price-loader.js
// Supabase 上の価格表 JSON を取得し、同梱デフォルトへマージする

(function () {
  "use strict";

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

  function isSupabaseConfigured() {
    const cfg = window.PRICING_CONFIG || {};
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function getSupabaseClient() {
    if (!isSupabaseConfigured()) return null;
    if (!window.supabase?.createClient) {
      console.warn("[price-loader] @supabase/supabase-js が読み込まれていません");
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
    catalog.updatedAt = catalog.updatedAt || row.updated_at || null;
    catalog._source = "supabase";
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

  function applyPriceCatalog(payload) {
    if (!payload || typeof payload !== "object") return false;

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
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
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
    };
  }

  // parts-catalog.js 読み込み直後の価格（マージ前の同梱正本）
  const bundledCatalogSnapshot = exportPriceCatalogSnapshot();

  const CORE_PRICE_PART_KEYS = [
    "jointBall",
    "jointCap",
    "topCap",
    "sideCap",
    "legBoss",
    "leg",
    "m5Screw",
    "beamNut",
    "beam_25",
    "beam_50",
    "beam_100",
    "beam_150",
    "beam_200",
    "beam_300",
    "beam_400",
    "beam_600",
    "beam_800",
    "pole_50",
    "pole_100",
    "pole_200",
    "pole_300",
    "pole_400",
    "pole_500",
    "pole_600",
    "pole_800",
  ];

  function getBundledPriceCatalogSnapshot() {
    return JSON.parse(JSON.stringify(bundledCatalogSnapshot));
  }

  function comparePriceCatalogToBundled(catalog) {
    const bundled = bundledCatalogSnapshot;
    const rows = [];
    let allMatch = true;

    function addRow(key, field, expected, actual) {
      const match = Number(expected) === Number(actual);
      if (!match) allMatch = false;
      rows.push({ key, field, expected, actual, match });
    }

    for (const key of CORE_PRICE_PART_KEYS) {
      const expPrice = bundled.partsCatalog?.[key]?.unitPrice;
      if (typeof expPrice === "number") {
        addRow(
          key,
          "unitPrice (IRON)",
          expPrice,
          catalog?.partsCatalog?.[key]?.unitPrice
        );
      }

      const expByMat = bundled.partPriceByMaterial?.[key] || {};
      const actByMat = catalog?.partPriceByMaterial?.[key] || {};
      for (const mat of ["IRON", "BS", "SUS"]) {
        if (typeof expByMat[mat] === "number") {
          addRow(key, mat, expByMat[mat], actByMat[mat]);
        }
      }
    }

    return { allMatch, rows, checkedCount: rows.length };
  }

  async function fetchSupabaseCatalog() {
    const client = getSupabaseClient();
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

  async function loadPriceCatalog(options = {}) {
    if (loadPromise && !options.force) return loadPromise;

    loadPromise = (async () => {
      if (!isSupabaseConfigured()) {
        window.__PRICE_CATALOG_META__ = { source: "bundled" };
        return { source: "bundled" };
      }

      const applyBundled = () => {
        window.__PRICE_CATALOG_META__ = { source: "bundled" };
        return { source: "bundled" };
      };

      if (!options.skipCache) {
        const cached = readCache();
        if (cached && hasCatalogPayload(cached)) {
          applyPriceCatalog({ ...cached, _source: "cache" });
          fetchSupabaseCatalog()
            .then((fresh) => {
              if (!fresh) return;
              writeCache(fresh);
              applyPriceCatalog(fresh);
            })
            .catch((e) =>
              console.warn("[price-loader] background refresh failed", e)
            );
          return { source: "cache", data: cached };
        }
      }

      try {
        const remote = await fetchSupabaseCatalog();
        if (remote) {
          writeCache(remote);
          applyPriceCatalog(remote);
          return { source: "supabase", data: remote };
        }
        return applyBundled();
      } catch (e) {
        const stale = readCache();
        if (stale && hasCatalogPayload(stale)) {
          console.warn("[price-loader] Supabase failed, using stale cache", e);
          applyPriceCatalog({ ...stale, _source: "stale-cache" });
          return { source: "stale-cache", data: stale, error: e };
        }
        console.warn(
          "[price-loader] Supabase load failed, using bundled defaults",
          e
        );
        return applyBundled();
      }
    })();

    return loadPromise;
  }

  async function savePriceCatalog(payload, options = {}) {
    const client = getSupabaseClient();
    if (!client) throw new Error("[price-loader] Supabase が未設定です");

    const adminPassword = options.adminPassword || "";
    if (!adminPassword) {
      throw new Error("[price-loader] 管理者パスワードが必要です");
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

    const saved = normalizeCatalogRow({ catalog_json: data, updated_at: body.updatedAt }) || body;
    writeCache(saved);
    applyPriceCatalog(saved);
    return saved;
  }

  window.deepMergePriceCatalog = deepMerge;
  window.applyPriceCatalog = applyPriceCatalog;
  window.exportPriceCatalogSnapshot = exportPriceCatalogSnapshot;
  window.getBundledPriceCatalogSnapshot = getBundledPriceCatalogSnapshot;
  window.comparePriceCatalogToBundled = comparePriceCatalogToBundled;
  window.CORE_PRICE_PART_KEYS = CORE_PRICE_PART_KEYS;
  window.fetchSupabaseCatalog = fetchSupabaseCatalog;
  window.loadPriceCatalog = loadPriceCatalog;
  window.savePriceCatalog = savePriceCatalog;
})();
