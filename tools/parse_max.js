// parse_max.js — 從 pokemondb dynamax-attackers 頁 markdown 解析 D-Max / G-Max 物種清單
// 對照源直接用 PvPoke gamemaster（speciesName/speciesId 為唯一權威鍵）
// 輸出: data/max.json = { "<speciesId>": { dm: true, dmg: true, name, form } }
const fs = require('fs');

const src = process.argv[2] || 'C:\\Users\\User\\.local\\share\\opencode\\tool-output\\tool_16ebf17dd001uQN6IpiHHLurgk';
const md = fs.readFileSync(src, 'utf8');
const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));

// PvPoke 每型態: speciesName → { base, form, speciesId, dex }
const master = gm.pokemon.map(p => {
  const m = p.speciesName.match(/^(.+?)\s*\((.+?)\)$/);
  return {
    id: p.speciesId,
    dex: p.dex,
    base: m ? m[1] : p.speciesName,
    form: m ? m[2] : '',
  };
});

const cano = s => ('' + s).toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/(form(e)?|mode|style)$/i, '');
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

const seen = new Set();
const result = {};
const unmatched = [];
for (const raw of md.split('\n')) {
  const m = raw.match(/^\|\s*!\[([^\]]+)\]\([^)]*\)\s*\|\s*(Dynamax|Gigantamax)\s+(.+?)\s+\[/i);
  if (!m) continue;
  if (seen.has(m[3] + '|' + m[1])) continue;
  seen.add(m[3] + '|' + m[1]);
  const hit = matchMaster(m[1]);
  if (!hit) { unmatched.push(m[1]); continue; }
  if (!result[hit.id]) result[hit.id] = { dm: true, dmg: /gigantamax/i.test(m[2]), name: hit.base, species: hit.id };
}
const keys = Object.keys(result);
const gmaxKeys = keys.filter(k => result[k].dmg);
console.log('unique entries:', keys.length, '| G-Max species:', gmaxKeys.length);
console.log('unmatched:', unmatched.length ? unmatched.join(', ') : '(none)');
console.log('gmax:', gmaxKeys.join(' '));
fs.writeFileSync('data/max.json', JSON.stringify(result, null, 1));
console.log('wrote data/max.json');
