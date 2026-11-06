// parse_max.js — 從 pokemondb dynamax-attackers 頁 markdown 解析 D-Max / G-Max 物種清單
// 對照源直接用 PvPoke gamemaster（speciesName/speciesId 為唯一權威鍵）
// 輸出: data/max.json = { "<speciesId>": { dm: true, dmg: true, name, form } } + fetched 撈取日
// 用法: node tools/parse_max.js [頁面檔案] —— 預設讀 data/_max_db.md
//       （先另存 pokemondb.net/go/dynamax-attackers 成 .md；檔案不存在時列出取得說明後中止）
const cano = s => ('' + s).toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/(form(e)?|mode|style)$/i, '');

// R10：純函式抽出（可被 tools/test_integration.js 直接呼叫做順序反轉測試）
// 合併語意：同一物种在頁面出現多次（來源表先列 D-Max 再列 G-Max，或反序）→ 任一次看到
// Gigantamax 就把 dmg 升為 true；「先 D-Max 後 G-Max」不再被 first-seen wins 吃掉 dmg。
function buildIndex(gmPokemon) {
  // PvPoke 每型態: speciesName → { base, form, speciesId, dex }
  const master = gmPokemon.map(p => {
    const m = p.speciesName.match(/^(.+?)\s*\((.+?)\)$/);
    return {
      id: p.speciesId,
      dex: p.dex,
      base: m ? m[1] : p.speciesName,
      form: m ? m[2] : '',
    };
  });
  const byBase = {};
  for (const e of master) { (byBase[cano(e.base)] ||= []).push(e); }

  function matchMaster(dbName) {
    const m = dbName.match(/^(.+?)\s*\((.+?)\)$/);
    const base = m ? m[1] : dbName.trim();
    const form = m ? m[2] : '';
    const hits = byBase[cano(base)];
    if (!hits) return null;
    if (!form) {
      return hits.find(x => !x.form)
        || hits.find(x => ['Normal', 'Standard', 'Incarnate'].includes(x.form))
        || hits[0];
    }
    const cf = cano(form);
    // 型態完全一致（或 DB 名稱多餘詞已由 cano 剝除）
    return hits.find(x => cano(x.form) === cf)
      || hits.find(x => cano(x.form).includes(cf) || cf.includes(cano(x.form)))
      || hits[0];
  }
  return matchMaster;
}

function parseMaxEntries(mdText, matchMaster) {
  const seen = new Set();
  const result = {};
  const unmatched = [];
  for (const raw of mdText.split('\n')) {
    const m = raw.match(/^\|\s*!\[([^\]]+)\]\([^)]*\)\s*\|\s*(Dynamax|Gigantamax)\s+(.+?)\s+\[/i);
    if (!m) continue;
    // 注意 dedupe key 必含型態（m[2]）：真實頁面上同一 species 的 Dynamax 與 Gigantamax
    // 行的名稱 cell 完全相同（名稱＋type badge link）——key 不含 m[2] 時第二行直接被略過，
    // dmg 帶不帶起來就全看行序（R10 的 bug）
    if (seen.has(m[3] + '|' + m[1] + '|' + m[2].toLowerCase())) continue;
    seen.add(m[3] + '|' + m[1] + '|' + m[2].toLowerCase());
    const hit = matchMaster(m[1]);
    if (!hit) { unmatched.push(m[1]); continue; }
    const isGmax = /gigantamax/i.test(m[2]);
    if (!result[hit.id]) result[hit.id] = { dm: true, dmg: isGmax, name: hit.base, species: hit.id };
    else if (isGmax && !result[hit.id].dmg) result[hit.id].dmg = true; // R10：合併
  }
  return { result, unmatched };
}

module.exports = { parseMaxEntries, buildIndex };

// ---------- CLI：讀檔 → 解析 → 寫 data/max.json ----------
if (require.main === module) {
  const fs = require('fs');
  const src = process.argv[2] || 'data/_max_db.md';
  if (!fs.existsSync(src)) {
    console.error('找不到來源檔 ' + src + '\n' +
      '請先另存 https://pokemondb.net/go/dynamax-attackers 頁面（markdown/HTML 皆可）為 ' + src + '，\n' +
      '或用參數指明路徑：node tools/parse_max.js C:\\path\\to\\saved.md');
    process.exit(1);
  }
  const md = fs.readFileSync(src, 'utf8');
  const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));
  const { result, unmatched } = parseMaxEntries(md, buildIndex(gm.pokemon));
  const out = { fetched: new Date().toISOString().slice(0, 10), ...result };
  const keys = Object.keys(result);
  const gmaxKeys = keys.filter(k => result[k].dmg);
  console.log('unique entries:', keys.length, '| G-Max species:', gmaxKeys.length);
  console.log('unmatched:', unmatched.length ? unmatched.join(', ') : '(none)');
  console.log('gmax:', gmaxKeys.join(' '));
  fs.writeFileSync('data/max.json', JSON.stringify(out, null, 1));
  console.log('wrote data/max.json');
}
