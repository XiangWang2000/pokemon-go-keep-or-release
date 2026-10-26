// Re-fetch move zh names. PokeAPI language codes are lowercase ('zh-hant').
// Keys saved as UPPERCASE (matching PvPoke moveId used by build_data.js).
const fs = require('fs');
const https = require('https');

const gm = JSON.parse(fs.readFileSync('data_pvpoke_gamemaster.json', 'utf8'));
const moveIds = gm.moves.map(m => m.moveId);
console.log('moves to fetch:', moveIds.length);

function getJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(getJson(new URL(res.headers.location, url).href, redirects + 1));
      }
      let d = '';
      res.on('data', c => (d += d.length > 2e7 ? '' : c));
      res.on('end', () => {
        if (res.statusCode !== 200) { const err = new Error('HTTP ' + res.statusCode); err.status = res.statusCode; return reject(err); }
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const out = {};
  let ok = 0, notFound = [], fail = [];
  for (const id of moveIds) {
    const slug = id.replace(/_/g, '-').toLowerCase();
    try {
      const mv = await getJson('https://pokeapi.co/api/v2/move/' + slug);
      const zh = (mv.names || []).find(n => /^zh-hant$/i.test(n.language?.name))?.name
        || (mv.names || []).find(n => /^zh-hans$/i.test(n.language?.name))?.name || '';
      if (zh) { out[id.toUpperCase()] = zh; ok++; }
      else fail.push(id);
    } catch (e) {
      if (e.status === 404) notFound.push(id); else { fail.push(id); }
    }
  }
  fs.writeFileSync('data_moves_zh.json', JSON.stringify(out, null, 1));
  console.log('ok=' + ok, 'notFound(404, 將由 build fallback)=' + notFound.length, 'empty=' + fail.length);
  if (notFound.length) console.log('404:', notFound.slice(0, 60).join(', '));
})();
