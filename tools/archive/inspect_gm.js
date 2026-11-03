const fs = require('fs');
const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));

console.log('top keys:', Object.keys(gm).join(', '));
const pokes = gm.pokemon || [];
console.log('pokemon count:', pokes.length, '| moves count:', (gm.moves || []).length);

const base = pokes.find(p => p.speciesId === 'sandslash');
console.log('\nbase species entry (sandslash):', JSON.stringify(base, null, 1).slice(0, 1600));

const alolan = pokes.find(p => p.speciesId && p.speciesId.includes('_alolan'));
console.log('\nalolan form entry:', JSON.stringify(alolan, null, 1).slice(0, 1600));

console.log('\nmove entry (THUNDER_SHOCK):', JSON.stringify(gm.moves?.find(m => m.moveId === 'THUNDER_SHOCK'), null, 1).slice(0, 700));

console.log('\npokemonTags:', JSON.stringify(gm.pokemonTags).slice(0, 600));

const tags = new Set();
pokes.forEach(p => (p.tags || []).forEach(t => tags.add(t)));
console.log('\nall tags in pokemon entries:', [...tags].join(', '));

// NFE / evolution chain info availability
const char = pokes.find(p => p.speciesId === 'charizard');
console.log('\ncharizard entry:', JSON.stringify(char, null, 1).slice(0, 1600));
