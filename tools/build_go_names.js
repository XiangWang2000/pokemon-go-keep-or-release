/*
 * build_go_names.js — 從 PokeMiners GO APK 繁中字串（data_go_texts_zhtw.json）解析 pokemon_name_XXXX，
 * 產出 data_go_names_zhtw.json（GO 遊戲內在用的屬種名稱表），build_data.js 會以 GO 名稱覆蓋主系列官方譯名。
 * 理由：GO 的繁中在地名與主系列官方譯名多處不一致（如 Tyrogue = 無畏小子／主系列譯名 巴爾郎），
 * 本站是給 GO 玩家用的，應以遊戲內看到的名稱為準。
 */
const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('data_go_texts_zhtw.json', 'utf8')).data;
const names = {};
for (let i = 0; i + 1 < raw.length; i += 2) {
  const m = /^pokemon_name_(\d{4})$/.exec(raw[i]);
  if (m && raw[i + 1]) names[parseInt(m[1], 10)] = raw[i + 1].trim();
}
fs.writeFileSync('data_go_names_zhtw.json', JSON.stringify(names));

// 與主系列官方譯名比對（供人工複核差異範圍）
const namesZh = JSON.parse(fs.readFileSync('data_names_zh_hant.json', 'utf8'));
let diff = 0;
const samples = [];
for (const [dex, go] of Object.entries(names)) {
  const main = namesZh[+dex - 1];
  if (main && main !== go) {
    diff++;
    if (samples.length < 25) samples.push(`#${dex} ${main} → GO:「${go}」`);
  }
}
console.log('GO 名稱總數:', Object.keys(names).length, '| 與主系列不同:', diff);
console.log(samples.join('\n'));
