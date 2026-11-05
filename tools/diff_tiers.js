/*
 * diff_tiers.js — 升降級比對報告（L10）
 * 比對「修正前基準」與「修正後」data.json，輸出逐型態的四級評級變化，
 * 並特別清點 *轉為可傳送*（tier1/2 → tier3）的型態——這是被錯判放生的最高風險，
 * 每一筆都附上理由供人工複核。
 * 用法：node tools/diff_tiers.js [baseline=../data/_baseline_v25.json] [current=../site/data/data.json]
 * 輸出：stdout 摘要 + docs/tier-diff-<日期>.md（完整報告）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const baseFile = process.argv[2] || path.join(ROOT, 'data', '_baseline_v25.json');
const curFile = process.argv[3] || path.join(ROOT, 'site', 'data', 'data.json');
const outDir = path.join(ROOT, 'docs');

if (!fs.existsSync(baseFile)) {
  console.error('找不到基準檔 ' + baseFile + '（基準 data/_baseline_v25.json 需由修正前的 build 產出、另存快照）');
  process.exit(1);
}
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const cur = JSON.parse(fs.readFileSync(curFile, 'utf8'));

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
console.log(`評級變化合計：${diff.length} 筆（不含拆分行增刪 ${other.length} 中的註記項）`);
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
const md = [];
md.push(`# 評級升降級比對報告（${today}）`);
md.push('');
md.push(`- 基準：${path.basename(baseFile)}（修正前快照，${base.forms.length} 型態）`);
md.push(`- 修正後：site/data/data.json（${cur.forms.length} 型態）`);
md.push(`- 修正後各級：${line(0, curCounts[0])}｜${line(1, curCounts[1])}｜${line(2, curCounts[2])}｜${line(3, curCounts[3])}`);
md.push(`- 評級變化：**${diff.length} 筆**；另「拆分行增刪」（_dmax/_gmax 專案調整）${other.filter(r => !r.from).length} 筆`);
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
const others = other.filter(r => r.from);
md.push(`共 ${others.length} 筆：`);
if (others.length) {
  md.push('| 型態 | 原→新 | 修正後理由 |');
  md.push('|---|---|---|');
  for (const r of others) md.push(`| ${r.id} | t${r.from}→t${r.to} | ${r.why} |`);
}
md.push('');
md.push('## 拆分行註記（資料結構調整，非評級倒退）');
md.push('');
const splits = other.filter(x => !x.from);
if (splits.length) for (const r of splits.slice(0, 60))
  md.push(`- ${r.id}：${r.note}${r.ct != null ? `（現為 ${TIER_NAMES[r.ct]}）` : ''}`);
md.push('');
md.push('## 修改重點摘要');
md.push('');
md.push('- PvE 能量模型重寫（H01）、暗影防禦縮減納入（M07）、DPS 指標改名與假設揭露（H02/M05/M06）');
md.push('- 極巨攻擊屬性＝快招屬性（H03）、威力分級 350/450（H04/H05）、Max+ 揭露');
md.push('- 無極汰那特案（H10）：tier0 必留＋專屬招式 Dynamax Cannon');
md.push('- PvE 屬性分榜（H08）：tpDps × 攻擊體質修正後重建；tp≥97 → tier0、tp≥90 → 不得判可傳送');
md.push('- 百分位母體去重（H09）：排除 _dmax/_gmax 拆分行');
md.push('- NFE 連坐限縮＋自身戰力保護（H06）');
md.push('- IV 參考半級保留（M01）、rank 4096 全枚舉同分同名次（M02）');
md.push('- 搜尋字串形態限定詞＋混形態警告（H07）');
fs.writeFileSync(path.join(outDir, `tier-diff-${today}.md`), md.join('\n') + '\n');
console.log('\n完整報告 → docs/tier-diff-' + today + '.md');
