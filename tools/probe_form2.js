const fs = require('fs');
const gm = JSON.parse(fs.readFileSync('data_pokeminers_gm_raw.json', 'utf8'));

// 1) 正確模板名的伽勒爾蛇紋熊
const zig = gm.find(t => t.templateId === 'V0263_POKEMON_ZIGZAGOON_GALARIAN');
if (zig) {
  const ps = zig.data.pokemonSettings;
  console.log('== V0263_POKEMON_ZIGZAGOON_GALARIAN ==');
  console.log('keys:', Object.keys(ps).join(', '));
  console.log('form:', ps.form, '| display:', JSON.stringify(ps.display));
  console.log('assetBundleValue keys:', Object.keys(ps).filter(k => /asset|bundle|icon/i.test(k)));
} else {
  console.log('no V0263_POKEMON_ZIGZAGOON_GALARIAN');
}

// 2) EXTENDED 範本樣本（伽勒爾蛇紋熊/超進化）
const ext = gm.filter(t => t.templateId && t.templateId.startsWith('EXTENDED_'));
console.log('== EXTENDED templates:', ext.length, '==');
const extZig = ext.filter(t => /zigzagoon/i.test(t.templateId));
extZig.slice(0, 3).forEach(t => console.log(t.templateId, '→', JSON.stringify(t.data).slice(0, 400)));

// 3) 23 處 ynamax
console.log('== templates containing ynamax ==');
const dyn = gm.filter(t => t.templateId && /ynamax/i.test(t.templateId));
dyn.forEach(t => console.log(t.templateId, '→', JSON.stringify(t.data).slice(0, 160)));

// 4) 檢查所有 EXTENDED_ 與 V####_POKEMON_ 是否涵蓋我的 1618 型態（抽查幾個）
const vnames = new Set(gm.filter(t => /^V\d+_POKEMON_/.test(t.templateId)).map(t => t.templateId));
console.log('== V####_POKEMON templates:', vnames.size, '==');
console.log('sample alolan rattata exists:', [...vnames].some(n => /ALOLAN_RATTATA/.test(n)));
console.log('sample mega charizard y exists:', [...vnames].some(n => /CHARIZARD.*Y/.test(n)) || [...vnames].filter(n => /CHARIZARD/.test(n)).join(','));
