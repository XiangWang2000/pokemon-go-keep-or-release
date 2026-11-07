/*
 * test_integration.js — 真資料整合測試（R14）
 * 與 test_core.js（公式手算測例）互補：用「具體物種 × 實際規則」交叉驗證重建後的
 * site/data/data.json 與相關工具，不做公式自測。含反向測試——
 * 修正前的 bug 必讓測試失敗、修正後通過：
 *   - R02：G-Max 物種的 _dmax 拆分行不得繼承 450／專屬招式屬性
 *   - R03：編號搜尋名單外的同編號保留形態必須觸發混形態警告
 *   - R04：暗影 audit 遇「任一屬性分榜頂尖」要攔下（反向注入假資料驗證 exit≠0）
 *   - R05：普通屬性蓄力招不得出現 ×1.6 弱點分榜（tp 無 'normal' 鍵）
 *   - R15：一般屬性蓄力招仍參與中性盤面全域最佳（Porygon-Z＋Hyper Beam 手算錨點）
 *   - R16：特殊 Max 參戰者（蒼響劍之王／藏瑪然特盾之王／無極汰那）＝可參戰 Max Battle、
 *          不能 Dynamax、專屬 Max 招式（威力依官方分級）
 *   - R17：無極汰那取得規則＝每帳號僅能捕獲一次（已捕帳號改給 100 糖）、tier 回大師 #10 一般規則
 *   - R18：搜尋字串 dmax/gmax/special 分類——dynamax 只查 D-Max、gigantamax 只查 G-Max、
 *          特殊參戰者兩者皆不適用（無限定詞＋warning）
 *   - R10：parse_max 合併語意——先 D-Max 後 G-Max 也能補上 dmg（順序反轉不變）
 * 用法：node tools/test_integration.js（需先 node tools/build_data.js）
 * 目前 62 項。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const CORE = require('../site/js/core.js');
const { parseMaxEntries, buildIndex } = require('./parse_max.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : '')); }
}
console.log('== R14 整合測試（真資料）==');
const d = JSON.parse(fs.readFileSync('site/data/data.json', 'utf8'));
const byId = new Map(d.forms.map(f => [f.id, f]));
const form = id => byId.get(id);

/* ---------- R02：G-Max 物種的 _dmax / _gmax 拆行 ---------- */
console.log('\n[R02/R04] 超極巨化拆行：_dmax 與 _gmax 逐行分算');
const gmaxPairs = ['charizard', 'venusaur', 'blastoise'];
for (const base of gmaxPairs) {
  const dm = form(base + '_dmax'), g = form(base + '_gmax');
  t(`${base}_dmax / ${base}_gmax 兩行都存在`, !!dm && !!g);
  if (!dm || !g) continue;
  t(`${base}_gmax：dmg=true 且 dmx.mode='gmax'`, g.dmg === true && g.dmx && g.dmx.mode === 'gmax');
  t(`${base}_dmax：dm=true（非 G-Max）且 dmx.mode='dmax'`, dm.dm === true && !dm.dmg && dm.dmx && dm.dmx.mode === 'dmax');
  // 一般極巨攻擊（350）必弱於專屬超極巨招式（450）
  t(`${base}_dmax dmx.dps < _gmax dmx.dps（威力級 350 vs 450）`, dm.dmx.dps < g.dmx.dps, `${dm.dmx.dps} vs ${g.dmx.dps}`);
  // 拆分行不得共享同一個 dmx 物件（structuredClone 檢查）
  t(`${base} 拆行 dmx 各自獨立`, dm.dmx.dps !== g.dmx.dps);
}
t('charizard_gmax 屬性＝火（gmax_wildfire）', form('charizard_gmax').dmx.tp === 'fire', form('charizard_gmax').dmx.tp);
t('venusaur_gmax 屬性＝草（gmax_vinelash）', form('venusaur_gmax').dmx.tp === 'grass', form('venusaur_gmax').dmx.tp);

/* ---------- R05：普通屬性蓄力招不得進弱點分榜（但保留全域最佳資格：R15） ---------- */
console.log('\n[R05] 弱點分榜：tp 不含 normal 鍵');
const normalOnly = ['porygon_z', 'regigigas', 'porygon_z_dmax', 'regigigas_dmax'].filter(id => form(id) && form(id).pve && form(id).pve.tp);
for (const id of normalOnly) {
  t(`${id}: pve.tp 無 'normal' 鍵`, !('normal' in form(id).pve.tp), JSON.stringify(Object.keys(form(id).pve.tp)));
}
// 全資料反向：任何行都不應有 normal 弱點分榜
const anyNormalTp = d.forms.filter(f => f.pve && f.pve.tp && 'normal' in f.pve.tp).map(f => f.id);
t('全部型態的 tp 皆無 normal 鍵', anyNormalTp.length === 0, '違規: ' + anyNormalTp.slice(0, 8).join(' '));

/* ---------- R15：一般屬性蓄力招參與中性盤面全域最佳 ---------- */
console.log('\n[R15] Porygon-Z：Hyper Beam（一般屬性）必須參與中性最佳招式');
{
  // R15 修正前：`if (cType === 'normal') continue` 把一般屬性蓄力招整組排除，
  // porygon_z 只能選次佳組合（LOCK_ON＋SOLAR_BEAM，dps 20.4）甚至無中性組合。
  // 手算 fixture（GM 實值；Porygon-Z 屬性＝一般/超能力，兩段皆一般屬性 STAB ×1.2）：
  //   LOCK_ON 一般威力 2／0.5s／+10 能 → 每擊有效 2.4 傷害；集 100 能需 10 擊（5.0s）
  //   HYPER_BEAM 一般威力 150／4.0s／-100 能 → 有效 180 傷害
  //   中性盤面循環 DPS = (10×2.4 + 180) / (5.0 + 4.0) = 204 / 9 = 22.6667
  const pz = form('porygon_z');
  t('手算錨點：LOCK_ON＋Hyper Beam 中性循環 DPS＝204/9', Math.abs((CORE.pveCycle({ power: 2, durSec: 0.5, energy: 10 }, { power: 150, durSec: 4.0, energy: -100 }, 1.2, 1.2)) - 204 / 9) <= 1e-4);
  t('porygon_z 中性最佳蓄力招＝HYPER_BEAM（修正前＝SOLAR_BEAM）', pz && pz.pve && pz.pve.c === 'HYPER_BEAM',
    pz && JSON.stringify(pz.pve && { f: pz.pve.f, c: pz.pve.c, dps: pz.pve.dps }));
  t('porygon_z pve.dps＝手算 22.67', pz && pz.pve && Math.abs(pz.pve.dps - 204 / 9) <= 0.01,
    pz && pz.pve && String(pz.pve.dps));
  // 全域反向：修正前「只有一般屬性蓄力招」的物種 best 恒為 null → pveCalc 回 null。
  // 本資料集沒有這種極端案例，但最小不變量是：一般屬性蓄力招族群的 pve 必須存在。
  t('porygon_z（一般屬性蓄力招族群）的 pve 存在且分榜/單榜鏈不斷', pz && pz.pve && pz.pve.pct != null);
}

/* ---------- R16：特殊 Max 參戰者（可參戰、不能 Dynamax、專屬 Max 招式） ---------- */
console.log('\n[R16] 特殊 Max：蒼響(劍之王)／藏瑪然特(盾之王)／無極汰那');
{
  // 官方（2026-11-07 核實）：Crowned 能量形態轉換公告＋Dynamax Trails 公告＋Bulbapedia Max Battle——
  // 三者「可參加 Max Battles despite not being able to Dynamax or Gigantamax」；
  // Max Battle 專屬招式（威力不同於 D/G 兩級）：
  //   Behemoth Blade／Bash＝鋼屬 250/300/350（Max+ 450）→ 依 D-Max 尺度 350 估
  //   Dynamax Cannon＝龍屬 350/400/450（Max+ 550）→ 依 G-Max 尺度 450 估
  const spec = {
    zacian_crowned_sword: { tp: 'steel', power: 350 },
    zamazenta_crowned_shield: { tp: 'steel', power: 350 },
    eternatus: { tp: 'dragon', power: 450 },
  };
  const CPM_L40 = 0.7903; // Lv40 個體加成（與 build_data 相同）
  const goGm = JSON.parse(fs.readFileSync('data/go_gm.json', 'utf8'));
  for (const [id, s] of Object.entries(spec)) {
    const f = form(id);
    t(id + ' 存在、dm=true（可參戰 Max Battle）且非 dmg', f && f.dm === true && !f.dmg);
    if (!f) continue;
    t(id + ': dmx.mode=special（不能 Dynamax，非快招屬性）tp=' + s.tp + ' fixed',
      f.dmx && f.dmx.mode === 'special' && f.dmx.tp === s.tp && f.dmx.fixed === true,
      JSON.stringify(f.dmx));
    const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));
    const p = gm.pokemon.find(x => x.speciesId === id);
    const atkStat = (p.baseStats.atk + 15) * CPM_L40;
    const fastRaw = (p.fastMoves || []).map(m => goGm.moves[m]).filter(m => m && m.power > 0 && m.energyDelta > 0);
    const minDur = Math.min(...fastRaw.map(m => m.durationMs)) / 1000;
    // dmx.dps 必須等於「自己那一階專屬威力 × STAB 1.2」的手算值——350（Behemoth）／450（Dynamax Cannon）
    const expect = CORE.maxRate({ power: s.power, multiplier: 1.2, atkStat, fastDurSec: minDur });
    t(id + ': dmx.dps＝專屬招式威力 ' + s.power + ' 的手算值', f.dmx.dps === +expect.toFixed(2),
      '實得 ' + f.dmx.dps + '，期望 ' + expect.toFixed(2));
  }
}

/* ---------- R17：無極汰那＝每帳號僅捕一隻＋回歸大師 #10 一般規則（tier0） ---------- */
console.log('\n[R17] 無極汰那：tier0（大師聯盟 #10）＋取得規則文字更正');
{
  const e = form('eternatus');
  t('eternatus 存在、dm=true 且無 dmg', e && e.dm === true && !e.dmg);
  if (e) {
    t('verdict tier=0（大師聯盟 #10 → 一般規則 b.r≤50，不再以「回歸可再捕」降級）', e.verdict.tier === 0,
      e.verdict.tier + '｜' + JSON.stringify(e.verdict.why));
    t('理由明示「每個帳號只能捕獲一次」且不再說回歸可再捕', /每個帳號只能捕獲一次/.test(e.verdict.why.join('；')) && !/回歸可再捕/.test(e.verdict.why.join('；')), e.verdict.why.join('｜'));
    t('理由明示已捕帳號 2026-11 改給 100 糖（非第二隻）', /100 (顆?)?糖果/.test(e.verdict.why.join('；')), e.verdict.why.join('｜'));
    t('理由含大師聯盟排行（PvP 實證）', /大師聯盟排行第/.test(e.verdict.why.join('；')), e.verdict.why.join('｜'));
    t('理由不再宣稱「每次活動限一隻」', !/每次活動限一隻/.test(e.verdict.why.join('；')), e.verdict.why.join('｜'));
  }
}

/* ---------- R03：搜尋字串防誤送（名單外保留形態） ---------- */
console.log('\n[R03] 編號搜尋選中名單外保留形態 → 強制警告');
{
  const dbRows = d.forms.map(f => ({ dex: f.dex, id: f.id, keep: f.verdict.tier < 3, shadow: /_shadow$/.test(f.id), max: !!(f.dm || f.dmg) }));
  // 找真實案例：同編號內「母行可傳送（tier3）」但「暗影保留（tier<3）」——編號搜尋會一起選中
  const groups = {};
  for (const f of d.forms) (groups[f.dex] = groups[f.dex] || []).push(f);
  const cases = Object.entries(groups).filter(([, fs]) =>
    fs.some(x => /_shadow$/.test(x.id) && x.verdict.tier < 3) && fs.some(x => !/_shadow$/.test(x.id) && x.verdict.tier === 3));
  t('存在「同編號＝暗影必留＋母形態可送」的真實案例（防誤送機制有實戰對象）', cases.length > 0, cases.length + ' 個編號');
  if (cases.length) {
    const [dex, fsx] = cases[0];
    const momr = fsx.find(x => !/_shadow$/.test(x.id) && x.verdict.tier === 3);
    const rows = [{ dex: Number(dex), id: momr.id, shadow: false, max: false }];
    const plan = CORE.searchPlan(rows, dbRows);
    t(`#${dex}：傳送母形態「${momr.id}」→ 名單外暗影必留觸發警告`, plan.mixedDexes.includes(Number(dex)), JSON.stringify(plan.mixedDexes));
    // 反向：同一行加上 shadow 名單（rows＝暗影行）時，名單外「非暗影保留」不觸發（&shadow 限定）
    const keepShadow = fsx.filter(x => /_shadow$/.test(x.id));
    const plan2 = CORE.searchPlan(keepShadow.map(x => ({ dex: Number(dex), id: x.id, shadow: true, max: false })), dbRows);
    const nonShadowRiskSeen = plan2.mixedDexes.length && fsx.some(x => !/_shadow$/.test(x.id) && x.verdict.tier < 3);
    t(`#${dex}：&shadow 名單不受非暗影保留誤觸`, !nonShadowRiskSeen, JSON.stringify(plan2.mixedDexes));
  }
  // 混類警告（名單內同編號暗影＋一般）
  const plan3 = CORE.searchPlan([
    { dex: 100, id: 'zz_shadow_a', shadow: true, max: false },
    { dex: 100, id: 'zz_a', shadow: false, max: false },
  ], null); // dbRows=null only skips R03 名單外檢查
  t('名單內同編號混形態 → mixedDexes 警告', plan3.mixedDexes.includes(100));
}

/* ---------- R18：搜尋字串的 Max 分類（真資料 dbRows 對照） ---------- */
console.log('\n[R18] dmax／gmax／special 分類與限定詞');
{
  const mxOf = f => f.dmg ? 'gmax' : f.dm ? ((f.dmx && f.dmx.mode === 'special') ? 'special' : 'dmax') : null;
  const dbRows = d.forms.map(f => ({
    dex: f.dex, id: f.id, keep: f.verdict.tier < 3, shadow: /_shadow$/.test(f.id), mx: mxOf(f),
  }));
  // G-Max-only 名單：&gigantamax；同編號的 _dmax 保留形態不得被誤算為會被選中
  const gform = form('charizard_gmax');
  t('charizard_gmax 存在（G-Max-only 測試對象）', !!gform);
  if (gform) {
    const plan = CORE.searchPlan([{ dex: gform.dex, id: gform.id, shadow: false, mx: mxOf(gform) }], dbRows);
    t('searchPlan G-Max-only → qualified=gigantamax', plan.qualified === 'gigantamax', plan.qualified);
    t('searchPlan 名單補上 &gigantamax', /&gigantamax/.test(plan.text), /&gigantamax/.test(plan.text))
    t('&gigantamax 不把同編號 D-Max 保留形態算進風險（不會被這個搜尋選中）', !plan.mixedDexes.includes(gform.dex),
      JSON.stringify(plan.mixedDexes));
  }
  // D＋G 混合：無法用單一限定詞表示 → 無限定詞 + warning（不給誤導性承諾）
  const df = form('charizard_dmax'), gf = form('charizard_gmax');
  const mix = CORE.searchPlan([
    { dex: df.dex, id: df.id, shadow: false, mx: mxOf(df) },
    { dex: gf.dex, id: gf.id, shadow: false, mx: mxOf(gf) },
  ], dbRows);
  t('D+G 混合 → 純文字無限定詞', mix.qualified === null && !/dynamax|gigantamax/.test(mix.text), mix.text);
  t('D+G 混合 → warning 明示兩關鍵字不互涵、需逐隻複核', typeof mix.warning === 'string' && /gigantamax|逐隻/.test(mix.warning), mix.warning);
  // 特殊參戰者：兩個關鍵字都不適用 → 無限定詞 + warning
  const sp = form('zacian_crowned_sword');
  const planSp = CORE.searchPlan([{ dex: sp.dex, id: sp.id, shadow: false, mx: mxOf(sp) }], dbRows);
  t('特殊參戰者名單 → 無限定詞', planSp.qualified === null && !/dynamax|gigantamax/.test(planSp.text), planSp.text);
  t('特殊參戰者名單 → warning（dynamax／gigantamax 都查不到）', typeof planSp.warning === 'string' && /特殊/.test(planSp.warning), planSp.warning);
}

/* ---------- R04 反向稽核：假暗影 tier3 注入 → audit 必須 exit≠0 ---------- */
console.log('\n[R04] 反向稽核：注入假「高價值暗影可傳送」→ audit 攔截');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poaudit-'));
  const mkFake = (tp) => {
    const clone = JSON.parse(JSON.stringify(d));
    delete clone.meta; delete clone.cupFetched; // 避免混入其他警告
    clone.forms.push({
      id: 'faketest_shadow', dex: 152, zh: '測試暗影', en: 'Faketest', t: ['normal'], tags: ['shadow'],
      verdict: { tier: 3, tierName: '可傳送', why: ['測試注入'] },
      pvp: { 1500: { r: 600, s: 50 } },
      pve: { pct: 10, tp },
      icon: '1.png',
    });
    return JSON.stringify(clone);
  };
  // 反向例：tp {ghost:97, poison:30}——舊版 Math.min 兩值取 30 不觸發；修正後 Math.max 取 97 攔下
  const bad = mkFake({ ghost: 97, poison: 30 });
  fs.writeFileSync(path.join(tmpDir, 'bad.json'), bad);
  let exitBad = 0, outBad = '';
  try { outBad = cp.execSync(`node tools/audit_data.js "${path.join(tmpDir, 'bad.json')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { exitBad = e.status; outBad = (e.stdout || '') + (e.stderr || ''); }
  t('audit 以非零退出碼拒絕', exitBad !== 0, 'exit=' + exitBad + '\n     ' + String(outBad).slice(-500).replace(/\n/g, ' | '));
  t('錯誤訊息含「暗影高價值」與注入 id', /暗影高價值/.test(String(outBad)) && /faketest_shadow/.test(String(outBad)), String(outBad).slice(-500).replace(/\n/g, ' | '));
  // 對照例：tp 全 30（無任何頂尖屬性）→ 不得誤報（確保反向結果不是「必然失敗」）
  const okFake = mkFake({ ghost: 30, poison: 30 });
  fs.writeFileSync(path.join(tmpDir, 'ok.json'), okFake);
  let exitOk = 0;
  try { cp.execSync(`node tools/audit_data.js "${path.join(tmpDir, 'ok.json')}"`, { encoding: 'utf8', stdio: 'ignore' }); }
  catch (e) { exitOk = e.status; }
  t('無風險假資料不誤報（exit=0）', exitOk === 0, 'exit=' + exitOk);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/* ---------- R10：parse_max 順序反轉（合併語意） ---------- */
console.log('\n[R10] parse_max：D-Max/G-Max 合併，順序反轉不變');
{
  const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));
  const match = buildIndex(gm.pokemon);
  const L = des => `| ![Charizard](char.png) | ${des} Charizard | [run](run.md) |`;
  const fwd = parseMaxEntries(L('Dynamax') + '\n' + L('Gigantamax'), match).result.charizard;
  const rev = parseMaxEntries(L('Gigantamax') + '\n' + L('Dynamax'), match).result.charizard;
  t('先 D 後 G → dmg=true', fwd && fwd.dmg === true, JSON.stringify(fwd));
  t('先 G 後 D → dmg=true（R10 合併修復處）', rev && rev.dmg === true, JSON.stringify(rev));
  const only = parseMaxEntries(L('Dynamax'), match).result.charizard;
  t('純 D-Max → dmg=false', only && only.dmg === false);
}

/* ---------- 完整性抽檢：audit 本尊 + 盃賽揭露 ---------- */
console.log('\n[R09/R12] meta 與盃賽揭露');
{
  t('meta.incomplete 無「盃賽榜過期」但盃賽榜若過期必有揭露',
    !(d.cupFetched && Math.round((Date.now() - new Date(d.cupFetched)) / 86400000) > 45) ||
      ((d.meta.incomplete || []).some(x => /盃賽榜過期/.test(x))));
}

console.log(`\n==========\n整合測試：${pass} 通過 / ${fail} 失敗`);
if (fail) process.exitCode = 1;
