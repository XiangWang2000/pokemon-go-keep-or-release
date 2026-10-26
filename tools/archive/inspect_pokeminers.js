const fs = require('fs');
const gm = JSON.parse(fs.readFileSync('data/pokeminers_gm_raw.json', 'utf8'));

console.log('raw gamemaster entries:', gm.length);

// find player level settings -> cpMultiplier
const lvl = gm.find(t => t.templateId === 'PLAYER_LEVEL_SETTINGS' || t.templateId?.includes('PLAYER_LEVEL'));
console.log('player level template:', JSON.stringify(lvl, null, 1).slice(0, 600));
const cpm = lvl?.data?.playerLevel?.cpMultiplier;
if (cpm) {
  console.log('cpMultiplier length:', cpm.length, 'first:', cpm[0], 'L40:', cpm[39], 'L50:', cpm[49]);
  fs.writeFileSync('data/cpm.json', JSON.stringify(cpm, null, 0));
}

// shiny availability template?
const shinyTemplates = gm.filter(t => t.templateId?.includes('SHINY')).map(t => t.templateId).slice(0, 5);
console.log('shiny-related templates (sample):', shinyTemplates);

// types typeEffective? not needed now
// costume pokemon count
const costumes = gm.filter(t => t.templateId?.startsWith('COSTUME_P_'));
console.log('costume templates:', costumes.length, costumes.slice(0, 6).map(c => c.templateId));

// names zh from app strings? check a pokemon entry's display fields
const base = gm.find(t => t.templateId === 'V0001_POKEMON_BULBASAUR');
console.log('\nbulbasaur raw entry keys:', Object.keys(base?.data?.pokemonSettings || {}).slice(0, 40).join(', '));
