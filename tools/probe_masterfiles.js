const fs = require('fs');

// === uicons: 圖示路徑 ===
const ui = JSON.parse(fs.readFileSync('data_wwm_uicons.json', 'utf8'));
console.log('== uicons ==');
console.log('top keys:', Object.keys(ui).slice(0, 12).join(', '));
const uiPoke = ui.pokemon || {};
console.log('pokemon entries:', Object.keys(uiPoke).length);
const ratKeys = Object.keys(uiPoke).filter(k => /^0?19[_-]/.test(k));
console.log('rattata-like keys:', ratKeys.slice(0, 8).join(', '));
console.log('sample 19:', JSON.stringify(uiPoke[ratKeys[0]] || uiPoke['19'] || null).slice(0, 400));
console.log('sample 19_31 if exists:', JSON.stringify(uiPoke['19_31'] || uiPoke['19-31'] || null).slice(0, 400));

// === reactmap: 譯名 & formId ===
const rm = JSON.parse(fs.readFileSync('data_wwm_reactmap.json', 'utf8'));
console.log('\n== reactmap ==');
console.log('top keys:', Object.keys(rm).slice(0, 12).join(', '));
const rmPoke = rm.pokemon || {};
const pkRat = rmPoke['19'] || rmPoke[19];
if (pkRat) {
  console.log('dex 19 keys:', Object.keys(pkRat).join(', '));
  console.log('dex 19 sample:', JSON.stringify(pkRat).slice(0, 500));
  if (pkRat.forms) {
    const fk = Object.keys(pkRat.forms).slice(0, 5);
    console.log('forms keys:', fk.join(', '));
    console.log('form sample:', JSON.stringify(pkRat.forms[fk[fk.length - 1]]).slice(0, 400));
  }
}

// === golbat / everything: 極巨化欄位 ===
for (const f of ['data_wwm_golbat.json', 'data_wwm_everything.json']) {
  const raw = fs.readFileSync(f, 'utf8');
  const c1 = (raw.match(/ynamax/gi) || []).length;
  const c2 = (raw.match(/gigantamax|g_max|G_MAX/g) || []).length;
  console.log('\n== ' + f + ' ==  ynamax hits:', c1, '| gmax-family hits:', c2);
}
const ev = JSON.parse(fs.readFileSync('data_wwm_everything.json', 'utf8'));
const evPoke = ev.pokemon || {};
const k0 = Object.keys(evPoke)[0];
console.log('everything pokemon sample keys:', Object.keys(evPoke[k0] || {}).join(', '));
console.log('everything pokemon[0]:', JSON.stringify(evPoke[k0]).slice(0, 600));
