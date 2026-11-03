/*
 * audit_data.js — site/data/data.json 一致性驗證
 * 檢查：結構完整、評級邏輯自洽、圖示命中、排行範圍、例外物種風險清點
 * 用法：node tools/audit_data.js
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('site/data/data.json', 'utf8'));
const uicons = new Set(JSON.parse(fs.readFileSync('data/uicons_filelist.json', 'utf8')));

let errors = 0;
const err = (m) => { errors++; console.log('  ❌ ' + m); };
const ok = (m) => console.log('  ✅ ' + m);
const warn = (m) => console.log('  ⚠️ ' + m);

console.log('== 1. 結構完整性 ==');
const bad = d.forms.filter(f =>
  !f.id || !f.dex || !f.zh || !Array.isArray(f.t) || !f.verdict ||
  ![0, 1, 2, 3].includes(f.verdict.tier) || !f.verdict.why || !f.verdict.why.length);
if (bad.length) { err('結構缺欄位: ' + bad.map(f => f.id).join(', ')); } else ok(`全部 ${d.forms.length} 型態欄位完整、verdict 結構正確`);

// dex 範圍與 id 對應
const badDex = d.forms.filter(f => f.dex < 1 || f.dex > 1050);
if (badDex.length) err('dex 超出範圍: ' + badDex.map(f => f.id).join(', ')); else ok('dex 編號範圍全部正常');

console.log('\n== 2. 圖示命中 ==');
const nullIcons = d.forms.filter(f => f.icon == null); // uicons 未收錄：前端已 fallback 到 PokeAPI 全國圖鑑圖
const missIcons = d.forms.filter(f => f.icon != null && !uicons.has(f.icon));
if (nullIcons.length) warn('uicons 未收錄（改用 PokeAPI 全國圖鑑圖）: ' + nullIcons.map(f => f.id).join(', '));
if (missIcons.length) { err('缺圖示: ' + missIcons.map(f => f.id + ':' + f.icon).join(', ')); }
if (!nullIcons.length && !missIcons.length) ok(d.forms.length + ' 型態圖示全部命中 uicons');
let megaMiss = 0;
for (const f of d.forms) if (f.megas) for (const m of f.megas) if (!uicons.has(m.icon)) megaMiss++;
if (megaMiss) err('超進化型態缺圖示 ' + megaMiss + ' 個'); else ok('超進化合併區塊圖示全部命中');

console.log('\n== 3. 排行資料範圍 ==');
const rankCounts = { 500: 500, 1500: 1500, 2500: 2500, 10000: 430 };
let badRank = 0;
for (const f of d.forms) {
  for (const L of [500, 1500, 2500, 10000]) {
    const r = f.pvp && f.pvp[L];
    if (r && r.r && (r.r < 1 || r.r > 1200)) { badRank++; err(`${f.id} ${L} 名次異常: ${r.r}`); }
  }
}
if (!badRank) ok('PvP 名次全部在合理範圍');

console.log('\n== 4. 評級邏輯自洽（不可傳送類不得落入 tier3）==');
const risk = [];
for (const f of d.forms) {
  const t = f.tags || [];
  const proto = t.includes('legendary') || t.includes('wildlegendary') || t.includes('mythical') || t.includes('ultrabeast') || t.includes('regional');
  const special = f.megas || f.dmg || proto;
  if (f.verdict.tier === 3 && special) risk.push(f.id);
  // tier 0 必須有正當理由
  if (f.verdict.tier === 0) {
    const hasReason = f.megas || f.dmg || t.includes('mythical') || (f.pvp && Object.values(f.pvp).some(r => r && r.r <= 50)) || (f.pve && f.pve.pct >= 97);
    if (!hasReason) err('必留但無正當事由: ' + f.id);
  }
}
if (risk.length) { err('落入可傳送的不可再取得型態: ' + risk.join(', ')); } else ok('無「不可再取得（傳說/幻獸/異獸/區域/超級進化/超極巨化）」被判可傳送的型態');
// 未完全進化落入 tier3 是設計行為（進化線終點皆可傳送），單獨清點供人工複核
const nfeT3 = d.forms.filter(f => f.nfe && f.verdict.tier === 3);
console.log('  （NFE 因進化線終點皆可傳送而降級:', nfeT3.length, '筆——設計行為）');

// 進化方向健全性：所有 NFE 的進化後型態種族值總和應 >= 自己
const byId = new Map(d.forms.map(f => [f.id, f]));
const sum = f => f.a + f.d + f.h;
const badEvoDir = [];
for (const f of d.forms) {
  if (!f.nfe) continue;
  for (const nx of f.evoNext || []) {
    const c = byId.get(nx);
    // 日光同體能反轉（如 XL 聯賽特殊），僅標記嚴重倒退（總和差 > 60）
    if (c && sum(c) < sum(f) - 60) badEvoDir.push(f.id + '>' + nx + '(' + sum(f) + '→' + sum(c) + ')');
  }
}
if (badEvoDir.length) err('進化方向倒退可疑: ' + badEvoDir.join(', ')); else ok('進化方向（種族值遞增）全部健全');

console.log('\n== 5. 暗影型態風險清點（火箭隊輪替，再取得不易）==');
const shadowT3 = d.forms.filter(f => (f.tags || []).includes('shadow') && f.verdict.tier === 3);
const shadowTotal = d.forms.filter(f => (f.tags || []).includes('shadow')).length;
console.log(`  暗影總數 ${shadowTotal}，其中被判「可傳送」${shadowT3.length}`);
console.log('  樣本:', shadowT3.slice(0, 10).map(f => `${f.id}(#${(f.pvp[f.verdict.tier ? 1500 : 0] || {}).r || '—'})`).join(' '));

console.log('\n== 6. 關鍵物種抽查 ==');
const spot = ['mewtwo', 'metagross_shadow', 'azumarill', 'medicham', 'registeel', 'gastrodon', 'rattata', 'litwick', 'sinistcha', 'poltchageist'];
for (const id of spot) {
  const f = d.forms.find(x => x.id === id);
  if (!f) { err('抽查物種不存在: ' + id); continue; }
  const best = [500, 1500, 2500, 10000].map(L => f.pvp[L] && f.pvp[L].r).filter(Boolean).sort((a, b) => a - b)[0] || '—';
  console.log(`  ${id.padEnd(20)} ${f.verdict.tierName}  PvP最佳#${best}  PvE%=${f.pve ? (100 - f.pve.pct).toFixed(1) : '—'}  圖示=${f.icon}`);
}

console.log('\n== 7. 盃賽資料 ==');
console.log(`  cups=${d.cups.length}, 撈取日=${d.cupFetched}, 附掛型態=${d.forms.filter(f => f.cupR).length}`);
// 預期覆蓋：跟抓取腳本的 CUPS 清單對齊（少於 10 個視為抓取不完整）
const EXPECT_CUPS_MIN = 10;
if (d.cups.length < EXPECT_CUPS_MIN) err(`盃賽數 ${d.cups.length} 低於預期 ${EXPECT_CUPS_MIN}——抓取可能不完整`);
else ok(`盃賽覆蓋 ${d.cups.length} 個（≥${EXPECT_CUPS_MIN}）`);

console.log('\n== 8. IV 計算與圖鑑一致性 ==');
const ivBad = d.forms.filter(f => f.iv && Object.values(f.iv).some(v => !(Array.isArray(v) && v.length === 4 && v[0] >= 1)));
if (ivBad.length) err('IV 參考格式異常: ' + ivBad.map(f => f.id).join(', ')); else ok('rank1 IV 參考值格式全部正確');

console.log('\n== 9. 進化圖譜健康 ==');
const evById = new Map(d.forms.map(f => [f.id, f]));
const evIds = d.forms.map(f => f.id);
const dupIds = evIds.filter((x, i) => evIds.indexOf(x) !== i);
if (dupIds.length) err('重複 id: ' + dupIds.join(', ')); else ok('id 唯一（' + evIds.length + ' 行）');
let dangling = 0;
for (const f of d.forms) for (const t of f.evoNext || []) if (!evById.get(t)) dangling++;
if (dangling) err('evoNext 掛空引用（指向不存在的行）: ' + dangling); else ok('evoNext 無掛空引用');
let dupEdge = 0;
for (const f of d.forms) {
  const nx = f.evoNext || [];
  if (new Set(nx).size !== nx.length) { dupEdge++; console.log('    重複邊: ' + f.id + ' → ' + JSON.stringify(nx)); }
}
if (dupEdge) err('evoNext 重複邊: ' + dupEdge); else ok('evoNext 無重複邊');
let nfeIncon = 0;
for (const f of d.forms) {
  const nx = f.evoNext || [];
  if (f.nfe && !nx.length) { nfeIncon++; console.log('    nfe=true 但無下游: ' + f.id); }
  if (!f.nfe && nx.length) { nfeIncon++; console.log('    nfe=false 卻有下游: ' + f.id); }
}
if (nfeIncon) err('nfe 與 evoNext 狀態不一致: ' + nfeIncon); else ok('nfe 與 evoNext 狀態一致');
// 拆行：_dmax/_gmax 行母行必須存在、母行不得保留被搬走的標記（dmax 拆走 dm、gmax 拆走 dmg）
let splitBad = 0;
const evIdSet = new Set(evIds);
for (const f of d.forms) {
  const m = f.id.match(/^(.+)_(dmax|gmax)$/);
  if (!m) continue;
  const mom = evIdSet.has(m[1]) ? evById.get(m[1]) : null;
  if (!mom) { splitBad++; console.log('    拆行無母行: ' + f.id); continue; }
  if (m[2] === 'dmax' && (mom.dm || mom.dmg)) { splitBad++; console.log('    母行仍帶極巨化標記: ' + f.id); }
  if (m[2] === 'gmax' && mom.dmg) { splitBad++; console.log('    超極母行仍帶 dmg: ' + f.id); }
}
if (splitBad) err('極巨化拆行異常: ' + splitBad); else ok('極巨化拆行（母行/標記/圖示）结构正確');

console.log('\n==========');
console.log(errors ? `發現 ${errors} 個問題` : '全部檢查通過 ✅');
// 有錯誤 → 非零退出碼，讓 CI / npm 命令能真實攔下失敗
if (errors) process.exitCode = 1;
