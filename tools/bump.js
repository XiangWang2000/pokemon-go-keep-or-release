/*
 * bump.js — 發布快取清理工：以「檔案內容 SHA256 前 10 碼」重寫 index.html 的 ?v= 查詢參數。
 * 內容沒變 → hash 不變 → 版本參數不動（冪等）；內容變了 → 瀏覽器快取自動失效。
 * 覆蓋：css/style.css、js/core.js、js/app.js；app.js 內的 data.json 查詢參數依 data hash 更新。
 * 用法：node tools/bump.js（部署 subtree push 之前跑）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const site = path.join(__dirname, '..', 'site');
const hashFile = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);

const cssPath = path.join(site, 'css', 'style.css');
const corePath = path.join(site, 'js', 'core.js');
const jsPath = path.join(site, 'js', 'app.js');
const dataPath = path.join(site, 'data', 'data.json');

// 先用 data.json hash 更新 app.js 內的 data 查詢參數，再算 app.js 自己的 hash
let appJs = fs.readFileSync(jsPath, 'utf8');
const dataHash = hashFile(dataPath);
const appJs2 = appJs.replace(/data\/data\.json\?v=[^']+/, `data/data.json?v=${dataHash}`);
fs.writeFileSync(jsPath, appJs2);
const coreHash = coreHashSafe();
const jsHash = hashFile(jsPath);
const cssHash = hashFile(cssPath);

function coreHashSafe() {
  return fs.existsSync(corePath) ? hashFile(corePath) : 'NODE'; // 缺 core.js 時保留佔位符，build 應該 fail-fast 過不了 CI
}

const indexPath = path.join(site, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace(/css\/style\.css\?v=[^"]+/, `css/style.css?v=${cssHash}`);
index = index.replace(/js\/core\.js\?v=[^"]+/, `js/core.js?v=${coreHash}`);
index = index.replace(/js\/app\.js\?v=[^"]+/, `js/app.js?v=${jsHash}`);
fs.writeFileSync(indexPath, index);

console.log(`bump 完成: css=${cssHash} core=${coreHash} js=${jsHash} data=${dataHash}`);
