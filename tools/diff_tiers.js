/*
 * diff_tiers.js — 升降級比對報告（L10）
 * 比對「修正前基準」與「修正後」data.json，輸出逐型態的四級評級變化，
 * 並特別清點 *轉為可傳送*（tier1/2 → tier3）的型態——這是被錯判放生的最高風險，
 * 每一筆都附上理由供人工複核。
 * 用法：node tools/diff_tiers.js [baseline] [current] [outName]
 *   baseline：檔案路徑、或 "git:<revison>"（從 git 物件庫讀 site/data/data.json，R13）。
 *             預設 git:97ed136 ＝ 32 項修正前的上一次提交（已驗證與 data/_baseline_v25.json 逐位元組同等）。
 *   outName：輸出檔名（預設 tier-diff-<當前資料日期>.md；雙基準比對時可自訂後綴，避免互相覆蓋）
 * 輸出：stdout 摘要 + docs/<outName>.md（完整報告）
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const baseArg = process.argv[2] || 'git:97ed136';
const curFile = process.argv[3] || path.join(ROOT, 'site', 'data', 'data.json');
const outName = process.argv[4] || null;
const outDir = path.join(ROOT, 'docs');

// R13：基準不再依賴 gitignored 的 data/_baseline_v25.json 快照（很容易忘記重建）——
// 預設直接從本 repo 的 git 歷史讀「修正前最後一次提交」的 data.json，任何 checkout 都能重現。
function loadJson(name) {
  let txt;
  if (/^git:(.+)$/.test(name)) {
    const rev = name.slice(4);
    txt = cp.execSync('git show ' + rev + ':site/data/data.json', { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  } else {
    if (!fs.existsSync(name)) {
      console.error('找不到基準檔 ' + name + '（可用 git:<revison> 指向 repo 歷史快照）');
      process.exit(1);
    }
    txt = fs.readFileSync(name, 'utf8');
  }
  return JSON.parse(txt.replace(/^\uFEFF/, ''));
}
const base = loadJson(baseArg);
const cur = JSON.parse(fs.readFileSync(curFile, 'utf8').replace(/^\uFEFF/, ''));

const TIER_NAMES = ['必留', '建議保留', '看情況', '可傳送'];
const mapOf = d => new Map(d.forms.map(f => [f.id, { tier: f.verdict.tier, why: (f.verdict.why || []).join('；') }]));
const B = mapOf(base), C = mapOf(cur);

const diff = [];              // 所有評級變化
const toSend = [];            // → tier3（最高風險）
const toKeep = [];            // tier3 → 其他（防護升級）
const other = [];
const ids = new Set([...B.keys(), ...C.keys()]);
for (const id of ids) {
  const b = B.get(id), c = C.get(id);
  if (!b || !c) { other.push({ id, note: b ? '修正後不存在（拆分行調整）' : '修正後新增（拆分行調整／原無 pve）', ct: c && c.tier }); continue; }
  if (b.tier === c.tier) continue;
  const rec = { id, from: b.tier, to: c.tier, why: c.why };
  diff.push(rec);
  if (c.tier === 3) toSend.push(rec);
  else if (b.tier === 3) toKeep.push(rec);
  else other.push(rec);
}

const line = (t, n) => `${TIER_NAMES[t]}（t${t}）${n}`;
// 摘要：各級人數（參照當前資料）
const curCounts = [0, 0, 0, 0];
cur.forms.forEach(f => curCounts[f.verdict.tier]++);

console.log('=== 升降級比對（基準 → 修正後）===');
console.log(`基準：${base.forms.length} 型態；修正後：${cur.forms.length} 型態`);
console.log(`修正後各級：${line(0, curCounts[0])}｜${line(1, curCounts[1])}｜${line(2, curCounts[2])}｜${line(3, curCounts[3])}`);
console.log(`評級變化合計：${diff.length} 筆（不含拆分行增刪 ${other.filter(r => 'note' in r).length} 中的註記項）`);
console.log('');
console.log('★ 最重要核對：轉為「可傳送」（t1/2 → t3）＝', toSend.length, '筆');
for (const r of toSend) console.log(`  ${r.id}：t${r.from}→t3｜${r.why}`);
console.log('');
console.log('防護升級（t3 → t1/2）：', toKeep.length, '筆');
const byTo = {};
toKeep.forEach(r => { (byTo[r.to] ||= []).push(r); });
for (const [t, rs] of Object.entries(byTo)) console.log(`  → ${TIER_NAMES[t]} ${rs.length} 筆：${rs.slice(0, 12).map(r => r.id).join(' ')}${rs.length > 12 ? ' …' : ''}`);

// ---------- 完整報告輸出 docs/ ----------
fs.mkdirSync(outDir, { recursive: true });
const today = cur.meta && cur.meta.date ? cur.meta.date : new Date().toISOString().slice(0, 10);
const outFile = path.join(outDir, outName || `tier-diff-${today}.md`);
const baselineLabel = /^git:/.test(baseArg)
  ? `git ${baseArg.slice(4).slice(0, 7)}（site/data/data.json，修正前提交）`
  : path.basename(baseArg);
const md = [];
md.push(`# 評級升降級比對報告（${today}）`);
md.push('');
md.push(`- 基準：${baselineLabel}（修正前快照，${base.forms.length} 型態）`);
md.push(`- 修正後：site/data/data.json（${cur.forms.length} 型態）`);
md.push(`- 修正後各級：${line(0, curCounts[0])}｜${line(1, curCounts[1])}｜${line(2, curCounts[2])}｜${line(3, curCounts[3])}`);
md.push(`- 評級變化：**${diff.length} 筆**；另「拆分行增刪」（_dmax/_gmax 專案調整）${other.filter(r => 'note' in r).length} 筆`);
md.push('');
md.push(`## ⚠ 轉為「可傳送」（建議保留 → 可傳送）：${toSend.length} 筆（人工複核清單）`);
md.push('');
md.push('| 型態 | 原→新 | 修正後理由 |');
md.push('|---|---|---|');
for (const r of toSend) md.push(`| ${r.id} | t${r.from}→t3 | ${r.why} |`);
md.push('');
md.push(`## 防護升級（可傳送 → 保留類）：${toKeep.length} 筆`);
md.push('');
for (const [t, rs] of Object.entries(byTo)) {
  md.push(`### → ${TIER_NAMES[t]}（${rs.length} 筆）`);
  md.push(`\n${rs.map(r => r.id).join('、')}`);
}
md.push('');
md.push(`## 其餘升降級`);
md.push('');
// 注意：tier0 的 from=0 是 falsy——不可用 !r.from 區分兩類，否則 t0→t1 的成熟升降級會被
// 誤吞進「拆分行註記」（本次（2026-11-06）就吞掉了 eternatus／regigigas 等 4 筆 t0→t1）。
// 兩類以「有沒有 note 欄位」區分最直接
const others = other.filter(r => !('note' in r));
md.push(`共 ${others.length} 筆：`);
if (others.length) {
  md.push('| 型態 | 原→新 | 修正後理由 |');
  md.push('|---|---|---|');
  for (const r of others) md.push(`| ${r.id} | t${r.from}→t${r.to} | ${r.why} |`);
}
md.push('');
md.push('## 拆分行註記（資料結構調整，非評級倒退）');
md.push('');
const splits = other.filter(x => 'note' in x);
if (splits.length) for (const r of splits.slice(0, 60))
  md.push(`- ${r.id}：${r.note}${r.ct != null ? `（現為 ${TIER_NAMES[r.ct]}）` : ''}`);
md.push('');
md.push('## 修改重點摘要');
md.push('');
// R23：摘要只寫「已經成立的事實」。早期版本在這裡殘留 R06/R07 的臨時結論
//（蒼響／藏瑪然特＝真 Dynamax、無極汰那＝一般 Dynamax），已被 R16/R17 推翻——
// 第三輪核實（2026-11-07 官方公告＋Serebii）：三者皆「可參戰 Max Battle 但不能 Dynamax」
//（dmx.mode='special'），招式威力：Behemoth Blade／Bash＝D-Max 級（350／Max+ 450）、
// Dynamax Cannon＝G-Max 級（450／Max+ 550，龍屬）；無極汰那每帳號僅能捕獲一次。
md.push('- PvE 能量模型重寫（H01）、暗影防禦縮減納入（M07）、DPS 指標改名與假設揭露（H02/M05/M06）');
md.push('- 極巨攻擊屬性＝快招屬性（H03）、威力分級 350/450（H04/H05）、Max+ 揭露、R02 拆行後逐行分算（_dmax＝350，_gmax＝450）');
md.push('- R16 蒼響(劍之王)／藏瑪然特(盾之王)／無極汰那＝特殊 Max 參戰者：可參戰 Max Battle、不能 Dynamax／超極巨化（dmx.mode=\'special\'）；專屬招式 Behemoth Blade／Bash（鋼，D-Max 級 350）、Dynamax Cannon（龍，G-Max 級 450）');
md.push('- R17 無極汰那＝每帳號僅能捕獲一次（已捕帳號 2026-11 起活動改給 100 糖）');
md.push('- R05 普通屬性蓄力招退出 ×1.6 弱點分榜（porygon 系／雷吉奇卡斯等不再被假屬性分榜灌級）');
md.push('- R09 盃賽榜 45 天新鮮度：過期盃停用「限制盃人選」評級升級');
md.push('- L04 暗影高價值保護統一（R04）：任一聯盟（含 500）前 150／PvE 前 10%／屬性分榜前 5% 不得判可傳送');
md.push('- PvE 屬性分榜（H08）：tpDps × 攻擊體質修正後重建；tp≥97 → tier0、tp≥90 → 不得判可傳送');
md.push('- 百分位母體去重（H09）：排除 _dmax/_gmax 拆分行');
md.push('- NFE 連坐限縮＋自身戰力保護（H06）');
md.push('- IV 參考半級保留（M01）、rank 4096 全枚舉同分同名次（M02）');
md.push('- 搜尋字串形態限定詞＋混形態警告（H07）＋R03 名單外同編號保留形態強制警告');
fs.writeFileSync(outFile, md.join('\n') + '\n');
console.log('\n完整報告 → docs/' + path.basename(outFile));
