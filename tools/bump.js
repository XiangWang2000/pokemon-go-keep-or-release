// 發佈前快取參數工具：把 index.html 的 ?v= 與 app.js 的 data fetch 參數
// 改成「檔案內容雜湊」——內容沒變 → hash 不變（可重跑、無 diff）；
// 內容變了 → hash 自動更新，瀏覽器快取自然失效。
// 用法：node tools/bump.js（部署 subtree push 之前跑）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const site = path.join(__dirname, '..', 'site');
const hashFile = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);

const cssPath = path.join(site, 'css', 'style.css');
const jsPath = path.join(site, 'js', 'app.js');
const dataPath = path.join(site, 'data', 'data.json');

// 先把 app.js 內的 data fetch 參數換成 data.json 的 hash，再算 app.js 自己的 hash
let appJs = fs.readFileSync(jsPath, 'utf8');
const dataHash = hashFile(dataPath);
const appJs2 = appJs.replace(/data\/data\.json\?v=[^']+/, `data/data.json?v=${dataHash}`);
fs.writeFileSync(jsPath, appJs2);
const jsHash = hashFile(jsPath);
const cssHash = hashFile(cssPath);

const indexPath = path.join(site, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace(/css\/style\.css\?v=[^"]+/, `css/style.css?v=${cssHash}`);
index = index.replace(/js\/app\.js\?v=[^"]+/, `js/app.js?v=${jsHash}`);
fs.writeFileSync(indexPath, index);

console.log(`bump 完成於 css=${cssHash} js=${jsHash} data=${dataHash}`);
