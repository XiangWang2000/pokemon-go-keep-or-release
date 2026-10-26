const fs = require('fs');

function peek(name, file, count = 3) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('\n==== ' + name + ' ====');
  console.log('top-level: ' + (Array.isArray(d) ? 'Array[' + d.length + ']' : 'Object keys: ' + Object.keys(d).slice(0, 10).join(', ')));
  if (Array.isArray(d)) {
    console.log(JSON.stringify(d[0], null, 1).slice(0, 900));
  } else {
    const k = Object.keys(d)[0];
    console.log(k + ' -> ' + JSON.stringify(d[k], null, 1).slice(0, 900));
  }
}

peek('pvpoke gamemaster', 'data/pvpoke_gamemaster.json');
peek('pvpoke rankings 1500', 'data/pvpoke_1500.json');
peek('pvpoke rankings 500', 'data/pvpoke_500.json');
peek('pvpoke rankings 2500', 'data/pvpoke_2500.json');

const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));
const sample = gm.find(p => p.speciesId && p.speciesId.includes('alolan')) || gm[2];
console.log('\n==== gamemaster form entry sample ====');
console.log(JSON.stringify(sample, null, 1).slice(0, 1500));

const mv = (gm.moves || gm.find(p => p.moveId));
console.log('\n==== move entry sample ====');
console.log(JSON.stringify(Array.isArray(gm.moves) ? gm.moves[0] : mv, null, 1).slice(0, 800));
