// 列出圖示目錄的真實檔名，找出命名規則
const https = require('https');
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/vnd.github+json' } }, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(res.statusCode + ' ' + url)));
    }).on('error', reject);
  });
}
(async () => {
  // 1) wwm-uicons pokemon 目錄（前 200 檔名樣本）
  try {
    const ui = await getJson('https://api.github.com/repos/WatWowMap/wwm-uicons/contents/pokemon');
    console.log('uicons/pokemon files:', ui.length);
    console.log(ui.slice(0, 18).map(f => f.name).join(' '));
    const rattata = ui.filter(f => /^19[-_.]/.test(f.name)).map(f => f.name);
    console.log('rattata-like:', rattata.slice(0, 10).join(' '));
    const mega = ui.filter(f => /^6[-_.]/.test(f.name)).map(f => f.name);
    console.log('dex6-like:', mega.slice(0, 12).join(' '));
  } catch (e) { console.log('uicons list ERR:', e.message); }

  // 2) pogo_assets Images/Pokemon 子目錄 sha → tree
  try {
    const root = await getJson('https://api.github.com/repos/PokeMiners/pogo_assets/contents/Images');
    const pk = root.find(x => x.name === 'Pokemon');
    const tree = await getJson('https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/' + pk.sha);
    const files = tree.tree.filter(x => /\.png$/.test(x.path));
    console.log('\npogo_assets Pokemon png files (bbox=' + files.length + '):', files.length);
    const rattata = files.filter(x => x.path.startsWith('pokemon_icon_19_')).map(x => x.path);
    console.log('rattata-like:', rattata.slice(0, 12).join(' '));
    const dex6 = files.filter(x => x.path.startsWith('pokemon_icon_6_')).map(x => x.path);
    console.log('dex6-like:', dex6.slice(0, 12).join(' '));
    const dex263 = files.filter(x => x.path.startsWith('pokemon_icon_263_')).map(x => x.path);
    console.log('dex263-like:', dex263.slice(0, 12).join(' '));
  } catch (e) { console.log('pogo_assets tree ERR:', e.message); }
})();
