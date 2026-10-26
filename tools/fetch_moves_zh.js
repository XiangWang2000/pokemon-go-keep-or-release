// Fetch official zh-Hant move names from PokeAPI, one per PvPoke move id.
const fs = require('fs');
const https = require('https');

const gm = JSON.parse(fs.readFileSync('data_pvpoke_gamemaster.json', 'utf8'));
const moveIds = gm.moves.map(m => m.moveId.toLowerCase());
console.log('moves to fetch:', moveIds.length);

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const out = {};
  let ok = 0, fail = [];
  for (const id of moveIds) {
    // shape GO moveId "THUNDER_SHOCK" -> pokeapi "thunder-shock"
    const slug = id.replace(/_/g, '-').toLowerCase();
    try {
      const mv = await getJson('https://pokeapi.co/api/v2/move/' + slug);
      const zh = (mv.names || []).find(n => n.language?.name === 'zh-Hant')?.name
        || (mv.names || []).find(n => n.language?.name === 'zh-Hans')?.name || '';
      out[id] = zh;
      ok++;
    } catch (e) {
      fail.push(id + ':' + e.message);
    }
  }
  fs.writeFileSync('data_moves_zh.json', JSON.stringify(out, null, 1));
  console.log('done. ok=' + ok, 'fail=' + fail.length);
  if (fail.length) console.log(fail.slice(0, 30).join('\n'));
})();
