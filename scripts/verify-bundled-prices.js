/**
 * 同梱デフォルト → Supabase 保存ペイロードの検証（Node 用）
 * node scripts/verify-bundled-prices.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {}, console };
vm.createContext(ctx);

function run(file) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(code, ctx);
}

run("js/data/parts-catalog.js");
run("js/app/order-pricing.js");
run("js/data/price-loader.js");

const CORE = ctx.window.CORE_PRICE_PART_KEYS;
const bundled = ctx.window.getBundledPriceCatalogSnapshot();
const selfCompare = ctx.window.comparePriceCatalogToBundled(bundled);

console.log("対象パーツ数:", CORE.length);
console.log("照合項目数:", selfCompare.checkedCount);
console.log("同梱スナップショット自己照合:", selfCompare.allMatch ? "OK" : "NG");

if (!selfCompare.allMatch) {
  console.log("不一致:");
  selfCompare.rows.filter((r) => !r.match).forEach((r) => console.log(r));
  process.exit(1);
}

const missing = [];
for (const key of CORE) {
  const cat = bundled.partsCatalog[key];
  if (!cat || typeof cat.unitPrice !== "number") {
    missing.push(`${key}: partsCatalog.unitPrice`);
  }
  const mat = bundled.partPriceByMaterial[key];
  if (!mat || typeof mat.IRON !== "number") {
    missing.push(`${key}: partPriceByMaterial.IRON`);
  }
}

if (missing.length) {
  console.error("保存ペイロードに不足:", missing);
  process.exit(1);
}

console.log("初回登録用ペイロード: partsCatalog + partPriceByMaterial に全対象パーツを含みます。");
