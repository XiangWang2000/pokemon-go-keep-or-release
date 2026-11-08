/*
 * test_core.js — 核心計算單元測試（site/js/core.js 唯一定義，Node 直接可測）
 * 每個案例先手算期望值再比對；此檔同時是 H01/H02/M01/M02/H05/H07 修正的驗證證據。
 * 用法：node tools/test_core.js（全過 → 靜默結束 0；失敗列出斷言後結束 1）
 * 第四輪新增：R21（搜尋字串尾端單次限定詞）／R22（splitSearchText 分批）／R26（同-CP 盃賽挑選）
 */
const core = require('../site/js/core.js');

let failed = 0;
function eq(actual, expected, label, tol) {
  const okNum = typeof expected === 'number' && Math.abs(actual - expected) <= (tol == null ? 1e-9 : tol);
  const ok = okNum || actual === expected;
  if (!ok) { failed++; console.log(`❌ ${label}\n   期望 ${JSON.stringify(expected)}，實得 ${JSON.stringify(actual)}`); }
  else console.log(`✅ ${label}`);
}
function ok(cond, label) { if (cond) console.log('✅ ' + label); else { failed++; console.log('❌ ' + label); } }

/* ---------- 1. PvE 能量單位（H01）：每次招式能量 + 餘能滾存 ---------- */
// 手算案例：快招 威力10／1.0s／+6能、蓄力 威力60／1.0s／-33能
// 集滿即發：第奇數輪需 33 → 6 下（36 能、餘 3）、偶數輪需 30 → 5 下（餘 0）
// 64 輪：快招次數 352、時間 352×1+64×1=416s、傷害 352×10+64×60=7360 → DPS=7360/416=17.6923
const F = { power: 10, durSec: 1.0, energy: 6 };
const C = { power: 60, durSec: 1.0, energy: -33 };
eq(core.pveCycle(F, C, 1, 1), 7360 / 416, 'pveCycle 能量單位（餘能滾存 64 輪）＝17.6923', 1e-4);
// STAB 分別作用：快 1.2、蓄 1.0 → (352×12+64×60)/416 = (4224+3840)/416 = 19.3846
eq(core.pveCycle(F, C, 1.2, 1.0), (352 * 12 + 64 * 60) / 416, 'pveCycle STAB 分開作用', 1e-4);
// 純快招不可構成循環（蓄力 0 能）→ null
eq(core.pveCycle(F, { power: 10, durSec: 1, energy: 0 }, 1, 1), null, 'pveCycle 零能量蓄力 → null');
// 舊錯誤模型（把 energy/second 當 each-use）會把 +6能/秒 對 -33 算成 ceil(33/6/s)→必不會得到 5/6 交替；
// 上列 17.6923 期望值即為防回歸錨點。

/* ---------- 2. 極巨攻擊相對指標（H04/H05） ---------- */
// 手算：power 350、multiplier 1.2、atk 150、快招 0.5s
// rate = 350×1.2×150/70 ÷ (25×0.5+2.5) = 900 ÷ 15 = 60
eq(core.maxRate({ power: 350, multiplier: 1.2, atkStat: 150, fastDurSec: 0.5 }), 60, 'maxRate 手算＝60（D-Max L3 尺度）', 1e-6);
// G-Max 威力 450、快招同 0.5s → 450×1.2×150/70/15 = 77.1429（同池內 G≈D 的 1.286 倍）
eq(core.maxRate({ power: 450, multiplier: 1.2, atkStat: 150, fastDurSec: 0.5 }) / 60, 450 / 350, 'maxRate G-Max／D-Max 相對比＝威力比', 1e-6);

/* ---------- 3. IV 排名（M01/M02）：4096 全枚舉、同分同名次、半級保留 ---------- */
const form = { a: 100, d: 100, h: 100, id: 'test' };
const rBest = core.ivRank(form, [15, 15, 15], 1500, false);
eq(rBest.rank, 1, 'ivRank 滿 IV＝第 1 名（competition rank）');
ok(rBest.total === 4096 && rBest.feasible === 4096, 'ivRank total 固定 4096（上限內全部可行）');
// 同分同名次：a、d 同種族值 → 交換攻/防 IV 乘積相同 → 名次一樣
const formSym = { a: 5, d: 5, h: 5, id: 'sym' };
const r1 = core.ivRank(formSym, [10, 15, 10], 1500, false);
const r2 = core.ivRank(formSym, [15, 10, 10], 1500, false);
ok(r1.rank === r2.rank && r1.product === r2.product, `ivRank 同分同名次（rank=${r1.rank}＝${r2.rank}，product 相等）`);
// 半級保留（M01）：等級不該被 round 成整數；最佳等級落在半級網格上
ok(Math.abs((rBest.level % 0.5)) === 0, 'ivRank 等級為 0.5 的倍數（半級保留）');
// CP 不超上限
ok(rBest.cp <= 1500, 'ivRank 返回 CP 不超過上限');
// 暗影體積判定影響名次：暗影攻×1.2（防×0.8333）→ 同 IV 但暗影/非暗影的最佳等級可以不同且不拋錯
const rs = core.ivRank(form, [15, 15, 15], 1500, true);
ok(rs && rs.rank >= 1 && rs.level >= 1, 'ivRank 暗影 Judge 參數可用');

/* ---------- 4. 複製搜尋字串（H07＋R18） ---------- */
// rows 的形態欄位 mx：'dmax'（一般 D-Max）／'gmax'（超極巨化）／'special'（特殊 Max 參戰者）
// R18（官方搜尋 FAQ／GO Hub）：dynamax 只查 D-Max；gigantamax 只查 G-Max；
// 特殊參戰者兩者都不適用——混合情況無法用單一搜尋字串可靠表示 → 不補限定詞並附 warning
// 全暗影 → 每段補 &shadow
const p1 = core.searchPlan([{ dex: 25, shadow: true }, { dex: 26, shadow: true }]);
eq(p1.text, '25,26&shadow', 'searchPlan 全暗影 → &shadow 限定詞');
eq(p1.qualified, 'shadow', 'searchPlan qualified=shadow');
// 連續壓縮 + 純 D-Max
const p2 = core.searchPlan([{ dex: 3, mx: 'dmax' }, { dex: 4, mx: 'dmax' }, { dex: 5, mx: 'dmax' }]);
eq(p2.text, '3-5&dynamax', 'searchPlan 連續編號壓縮 + &dynamax');
// R18：純 G-Max → &gigantamax（dynamax 關鍵字查不到超極巨化個體）
const p6 = core.searchPlan([{ dex: 6, mx: 'gmax' }, { dex: 7, mx: 'gmax' }]);
eq(p6.text, '6,7&gigantamax', 'searchPlan 純 G-Max → &gigantamax');
eq(p6.qualified, 'gigantamax', 'searchPlan qualified=gigantamax');
// 混形態：同編號不同 class → mixedDexes 非空、不補限定詞
const p3 = core.searchPlan([{ dex: 133, shadow: true }, { dex: 133, mx: 'dmax' }, { dex: 134, shadow: true }]);
eq(p3.text, '133,134', 'searchPlan 名單含混形態時 → 不補限定詞（避免誤導，警告由 UI modal 處理）');
ok(p3.mixedDexes.length === 1 && p3.mixedDexes[0] === 133, 'searchPlan 混形態偵測（133 同時有暗影+極巨化）');
// 混一般+暗影（無法補 &shadow）
const p4 = core.searchPlan([{ dex: 1, shadow: true }, { dex: 2 }]);
ok(p4.qualified === null && p4.mixedDexes.length === 0, 'searchPlan 暗+一般 → 無限定詞可用（badge 提醒由 UI 層處理 mixed）');
// R18 反向①：D-Max＋G-Max 混合 → 不補任何限定詞，且 warning 明示無法可靠表示
const p7 = core.searchPlan([{ dex: 8, mx: 'dmax' }, { dex: 9, mx: 'gmax' }]);
eq(p7.text, '8,9', 'searchPlan D+G 混合 → 不補限定詞');
ok(p7.qualified === null, 'searchPlan D+G 混合 → qualified=null');
ok(typeof p7.warning === 'string' && p7.warning.length > 0, 'searchPlan D+G 混合 → warning 明示需逐隻複核');
// R18 反向②：純特殊參戰者（dynamax／gigantamax 兩關鍵字都查不到）→ 無限定詞 + warning
const p8 = core.searchPlan([{ dex: 888, mx: 'special' }, { dex: 889, mx: 'special' }]);
eq(p8.text, '888,889', 'searchPlan 特殊參戰者 → 無限定詞');
ok(p8.qualified === null, 'searchPlan 特殊參戰者 → qualified=null');
ok(p8.warning && /特殊/.test(p8.warning), 'searchPlan 特殊參戰者 → warning 明示兩關鍵字皆不適用');
// R18 反向③：特殊參戰者＋一般 D-Max → 無限定詞 + warning
const p9 = core.searchPlan([{ dex: 890, mx: 'special' }, { dex: 25, mx: 'dmax' }]);
ok(p9.qualified === null && p9.warning != null, 'searchPlan special+dmax → 無限定詞且給 warning');
// R03 反向：dbRows 名單外保留個體——&gigantamax 只選 G-Max，名單外 D-Max 保留個體不算被選中
const pDb = core.searchPlan(
  [{ dex: 3, id: 'charizard_gmax', mx: 'gmax' }],
  [{ dex: 3, id: 'charizard_dmax', keep: true, mx: 'dmax' },
   { dex: 3, id: 'charizard', keep: true }]);
eq(pDb.text, '3&gigantamax', 'searchPlan &gigantamax 補上限定詞');
ok(pDb.mixedDexes.length === 0, 'searchPlan &gigantamax：名單外 D-Max／一般保留形態不會被選中');
// 相容舊欄位 max:true（＝一般 D-Max）
const p10 = core.searchPlan([{ dex: 3, max: true }]);
eq(p10.text, '3&dynamax', 'searchPlan 舊欄位 max:true 相容為 dmax');
// tooLong：900 字上限偵測
const many = []; for (let d = 1; d <= 400; d++) many.push({ dex: d * 2, shadow: true });
const p5 = core.searchPlan(many);
ok(p5.tooLong === true, 'searchPlan 超長偵測');

/* ---------- 4b. R21：限定詞只在 OR 群組尾端一次（修正前必失敗） ---------- */
// 遊戲搜尋運算：逗號（OR）比 &（AND）優先、不支援括號——「1&shadow,25&shadow」
// 不能當 (1 AND shadow) OR (25 AND shadow) 解讀，會漏掉型態（R21，官方 FAQ＋GO Hub）。
const r21a = core.searchPlan([{ dex: 1, shadow: true }, { dex: 25, shadow: true }]);
eq(r21a.text, '1,25&shadow', 'R21 非連續暗影 → 單一尾端 &shadow（舊碼＝1&shadow,25&shadow）');
const r21b = core.searchPlan([
  { dex: 1, mx: 'dmax' }, { dex: 2, mx: 'dmax' }, { dex: 4, mx: 'dmax' },
  { dex: 6, mx: 'dmax' }, { dex: 7, mx: 'dmax' }]);
eq(r21b.text, '1,2,4,6,7&dynamax', 'R21 多個不連續區間全 D-Max → 尾端一次 &dynamax');
const r21c = core.searchPlan([{ dex: 6, mx: 'gmax' }, { dex: 9, mx: 'gmax' }, { dex: 11, mx: 'gmax' }]);
eq(r21c.text, '6,9,11&gigantamax', 'R21 G-Max 非相鄰多物種 → 尾端一次 &gigantamax');
eq(core.searchPlan([{ dex: 3, mx: 'dmax' }]).text, '3&dynamax', 'R21 單物種不變（3&dynamax）');
ok(core.searchPlan([]).text === '', 'R21 空名單 → 空字串（不產生孤兒限定詞）');
// 通用反向：任何帶限定詞的字串不得在中段出現 '&'（限定詞只能是最後一段的尾端）
const r21x = core.searchPlan([
  { dex: 1, shadow: true }, { dex: 2, shadow: true }, { dex: 9, shadow: true },
  { dex: 100, shadow: true }, { dex: 101, shadow: true }]);
ok((r21x.text.match(/&/g) || []).length === 1 && r21x.text.endsWith('&shadow'),
  'R21 通用反向：限定詞只能出現在字串尾端一次 ' + r21x.text);

/* ---------- 4c. R22：超長字串分批切分 ---------- */
// 逗號是 top-level 分隔（語意 OR），切分只能落在逗號邊界、不可破壞 a-b 區間
eq(JSON.stringify(core.splitSearchText('1,2,999,4', 6)), JSON.stringify(['1,2', '999,4']),
  'splitSearchText 按逗號邊界切分且每批 ≤ max');
eq(core.splitSearchText('1-3,4,5', 900).join(','), '1-3,4,5', 'splitSearchText 短字串原樣返回（區間不破壞）');
{
  const long = core.searchPlan(many); // 與 p5 同一字串（>900 字）
  const batches = core.splitSearchText(long.text, 900);
  ok(batches.length >= 2 && batches.every(b => b.length <= 900), 'splitSearchText 真超長案例每批 ≤900');
  eq(batches.join(','), long.text, 'splitSearchText 重組等於原字串');
}
/* ---------- 4d. R26：IV 計算機盃賽提示（同 CP 過濾） ---------- */
// 真實語意（R26）：seel 小小盃 #26 / 超級聯盟 #959——選 CP1500 時不得拿小小盃當保留依據
const cups26 = [
  { zh: '小小盃', cp: 500, total: 332 },
  { zh: '超級聯盟限定盃', cp: 1500, total: 1501 },
];
const seelCupR = [[0, 26], [1, 959]];
{
  const c1500 = core.cupForCap(seelCupR, cups26, 1500);
  ok(c1500 && c1500.cp === 1500 && c1500.rank === 959, 'R26 CP1500 → 同 CP 榜 #959（舊碼＝小小盃 #26）', )
    && console.log('     ', JSON.stringify(c1500));
  const c500 = core.cupForCap(seelCupR, cups26, 500);
  ok(c500 && c500.cp === 500 && c500.rank === 26, 'R26 CP500 → 小小盃 #26（顯示仍正確）');
  ok(core.cupForCap(seelCupR, cups26, 2500) === null, 'R26 無同 CP 盃 → null（不給跨 CP 提示）');
  ok(core.cupForCap(null, cups26, 1500) === null && core.cupForCap([], cups26, 1500) === null, 'R26 空 cupR → null');
}
ok(core.dataOlderThanDays('2020-01-01', 45) === true, 'dataOlderThanDays 遠期日 → 過期');
ok(core.dataOlderThanDays('2026-11-01', 45) === false, 'dataOlderThanDays 新鮮日 → 未過期');
ok(core.dataOlderThanDays(undefined, 45) === false, 'dataOlderThanDays 無日期 → 不判過期（保守）');

/* ---------- 5. esc（L07） ---------- */
eq(core.esc('<img src=x onerror=alert(1)>&"\''), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;', 'esc 全跳脫 <>&"\'');
eq(core.esc(null), '', 'esc(null)＝空字串');
eq(core.esc(7), '7', 'esc(數字)＝字串化');

/* ---------- 6. cpmOf ---------- */
eq(core.cpmOf(1), core.CPM_TABLE[0], 'cpmOf(1)＝表頭');
eq(core.cpmOf(40), 0.790300011634826, 'cpmOf(40)＝官方 Lv40 CPM');
eq(core.cpmOf(50), 0.840300023555755, 'cpmOf(50)＝官方 Lv50 CPM（0.8453＝Lv51，表尾）');

process.exit(failed ? 1 : 0);
