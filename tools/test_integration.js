/*
 * test_integration.js — 真資料整合測試（R14）
 * 與 test_core.js（公式手算測例）互補：用「具體物種 × 實際規則」交叉驗證重建後的
 * site/data/data.json 與相關工具，不做公式自測。含反向測試——
 * 修正前的 bug 必讓測試失敗、修正後通過：
 *   - R02：G-Max 物種的 _dmax 拆分行不得繼承 450／專屬招式屬性
 *   - R03：編號搜尋名單外的同編號保留形態必須觸發混形態警告
 *   - R04：暗影 audit 遇「任一屬性分榜頂尖」要攔下（反向注入假資料驗證 exit≠0）
 *   - R05：普通屬性蓄力招不得出現 ×1.6 弱點分榜（tp 無 'normal' 鍵）
 *   - R06：蒼響／藏瑪然特 Max 招＝專屬鋼屬（mode 'gmax'、tp 'steel'）
 *   - R07：無極汰那＝一般 Dynamax（不再是 G-Max 級／tier0 必留）
 *   - R10：parse_max 合併語意——先 D-Max 後 G-Max 也能補上 dmg（順序反轉不變）
 * 用法：node tools/test_integration.js（需先 node tools/build_data.js）
 * 目前 40 項。
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

/* ---------- R05：普通屬性蓄力招不得進弱點分榜 ---------- */
console.log('\n[R05] 弱點分榜：tp 不含 normal 鍵');
const normalOnly = ['porygon_z', 'regigigas', 'porygon_z_dmax', 'regigigas_dmax'].filter(id => form(id) && form(id).pve && form(id).pve.tp);
for (const id of normalOnly) {
  t(`${id}: pve.tp 無 'normal' 鍵`, !('normal' in form(id).pve.tp), JSON.stringify(Object.keys(form(id).pve.tp)));
}
// 全資料反向：任何行都不應有 normal 弱點分榜
const anyNormalTp = d.forms.filter(f => f.pve && f.pve.tp && 'normal' in f.pve.tp).map(f => f.id);
t('全部型態的 tp 皆無 normal 鍵', anyNormalTp.length === 0, '違規: ' + anyNormalTp.slice(0, 8).join(' '));

/* ---------- R06：蒼響／藏瑪然特專屬鋼屬 Max 招 ---------- */
console.log('\n[R06] 蒼響／藏瑪然特＝真 Dynamax＋專屬鋼屬 Max 招');
for (const id of ['zacian_crowned_sword', 'zamazenta_crowned_shield']) {
  const f = form(id);
  t(id + ' 存在且可極巨化', f && f.dm === true && !f.dmg);
  if (!f) continue;
  t(id + ': dmx.tp=鋼屬、屬性固定（mode gmax、fixed）',
    f.dmx && f.dmx.tp === 'steel' && f.dmx.mode === 'gmax' && f.dmx.fixed === true,
    JSON.stringify(f.dmx && { tp: f.dmx.tp, mode: f.dmx.mode, fixed: f.dmx.fixed }));
}

/* ---------- R07：無極汰那＝一般 Dynamax，不再是 tier0 專屬 Max 招 ---------- */
console.log('\n[R07] 無極汰那：一般 Dynamax（撤回 G-Max 級 450 特案）');
{
  const e = form('eternatus');
  t('eternatus 存在、dm=true 且無 dmg', e && e.dm === true && !e.dmg);
  if (e) {
    t('dmx.mode=dmax（極巨攻擊＝快招屬性，非 G-Max 威力級）', e.dmx && e.dmx.mode === 'dmax',
      JSON.stringify(e.dmx && { mode: e.dmx.mode, tp: e.dmx.tp }));
    t('dmx.tp 為快招屬性（龍尾→龍／毒擊→毒）', e.dmx && ['dragon', 'poison'].includes(e.dmx.tp));
    t('verdict 非 tier0（撤回「錯過無法再捕」的必留）', e.verdict.tier !== 0, e.verdict.tierName);
    t('理由含期間限定取得／回歸資訊', /GO Pass|Dynamax Trails/.test(e.verdict.why.join('；')), e.verdict.why.join('｜'));
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
