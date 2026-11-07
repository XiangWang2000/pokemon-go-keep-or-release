// html_to_md_max.js — 把另存的 pokemondb dynamax-attackers HTML 轉成 parse_max.js 吃的 markdown 行
// 用法: node tools/html_to_md_max.js <saved.html> [out=data/_max_db.md]
const fs = require('fs');

const src = process.argv[2] || (process.env.TEMP + '/dyn_page.html');
const out = process.argv[3] || 'data/_max_db.md';
const h = fs.readFileSync(src, 'utf8');

const trs = [...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1])
  .filter(t => /Dynamax|Gigantamax/i.test(t));
const rows = [];
for (const t of trs) {
  const alt = (t.match(/img-class="[^"]*icon-pkmn[^"]*"[\s\S]*?alt="([^"]+)"|(?:img class="img-fixed[^"]*"[\s\S]*?alt="([^"]+)")/)
    || []).slice(1).find(Boolean);
  const cat = t.match(/(Dynamax|Gigantamax)\s+([A-Za-z!?' .\-()]+?)(?:\s*\[|\s*<\/|\s*<a)/i);
  if (!alt || !cat) continue;
  const types = [...t.matchAll(/\/type\/([a-z]+)/g)].map(m => m[1]);
  const gmv = t.match(/G-Max\s+([A-Za-z]+)/i);
  rows.push('| ![' + alt + '](https://img.pokemondb.net/sprites/icon/' + alt.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png) | '
    + cat[1][0].toUpperCase() + cat[1].slice(1).toLowerCase() + ' ' + cat[2].trim()
    + ' [' + (types[0] || '') + '](/type/' + (types[0] || '') + ') | '
    + '**' + (gmv ? gmv[0] : '') + '**' + ' | 3 | 0 | 0 |');
}
console.log('rows:', rows.length);
console.log(rows.slice(0, 3).join('\n'));
fs.writeFileSync(out, rows.join('\n') + '\n');
console.log('wrote ' + out);
