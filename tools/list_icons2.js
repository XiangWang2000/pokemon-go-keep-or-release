// 用 git trees API 取得 wwm-uicons/pokemon 完整檔名清單
const https = require('https');
const fs = require('fs');
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
  const root = await getJson('https://api.github.com/repos/WatWowMap/wwm-uicons/contents/');
  const pk = root.find(x => x.name === 'pokemon');
  const tree = await getJson('https://api.github.com/repos/WatWowMap/wwm-uicons/git/trees/' + pk.sha);
  const files = tree.tree.filter(x => x.path.endsWith('.png')).map(x => x.path);
  console.log('total files:', files.length, '| truncated:', tree.truncated);

  const show = (dex) => {
    const fs = files.filter(p => p.startsWith(dex + '.') || p.startsWith(dex + '_')).sort();
    console.log(dex + ':', fs.slice(0, 16).join(' '));
  };
  for (const d of [19, 6, 27, 487, 386, 555, 9, 264, 100]) show(d);

  fs.writeFileSync('data_uicons_filelist.json', JSON.stringify(files));
})();
