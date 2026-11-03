const fs = require('fs');
const raw = fs.readFileSync('data/pokeminers_gm_raw.json', 'utf8');

console.log('-- dynamax/gmax 全文搜尋 --');
for (const k of ['ynamax', 'igantamax', 'maxMove', 'maxLaunchLevel', 'PowerSpot', 'powerSpot']) {
  let c = 0, i = -1;
  while ((i = raw.indexOf(k, i + 1)) !== -1) { c++; if (c > 9000) break; }
  console.log(' ', k, c);
}

const gm = JSON.parse(raw);
console.log('-- FORM templates --');
const forms = gm.filter(t => t.templateId && t.templateId.includes('FORM'));
console.log('  count:', forms.length, '| names:', forms.map(t => t.templateId).slice(0, 6).join(' | '));

const zig = gm.find(t => t.templateId === 'V0263_POKEMON_GALARIAN_ZIGZAGOON');
if (zig) {
  const ps = zig.data.pokemonSettings;
  console.log('-- galarian zigzagoon pokemonSettings keys --');
  console.log('  keys:', Object.keys(ps).join(', '));
  console.log('  form field:', JSON.stringify(ps.form));
} else {
  console.log('no V0263_POKEMON_GALARIAN_ZIGZAGOON template');
}

// 檢查所有含 form 欄位的 pokemonSettings，確認 form 欄位型態
let withForm = 0, sample = [];
const seen = new Set();
for (const t of gm) {
  const ps = t.data && t.data.pokemonSettings;
  if (ps && ps.form !== undefined) {
    withForm++;
    const key = typeof ps.form;
    if (seen.size < 5 && !seen.has(ps.form + '|' + key)) { seen.add(ps.form + '|' + key); sample.push(ps.form + ' (' + key + ')' + ' ← ' + t.templateId); }
  }
}
console.log('-- entries with form field --');
console.log('  count:', withForm, '| sample:', sample.join(' ; '));
