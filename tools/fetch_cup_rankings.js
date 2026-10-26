/*
 * fetch_cup_rankings.js — 抓 PvPoke 現行「盃賽／特殊格式」排行榜，產出 data_cup_rankings.json
 * PvPoke 資料路徑：data/rankings/{cup}/{category}/rankings-{cp}.json  (category 在前！)
 * 盃賽 meta 有輪替，此清單以 gamemaster.json 的 formats（hideRankings=false）為準，抓取時自動略過失效格式。
 */
const fs = require('fs');

const CUPS = [
  { cup: 'little', cp: 500, zh: '小小盃' },
  { cup: 'fantasy', cp: 1500, zh: '幻境盃' },
  { cup: 'laic2027', cp: 1500, zh: 'LAIC 2027 錦標賽盃' },
  { cup: 'spectral', cp: 1500, zh: '幽譜盃 BF・Spectral' },
  { cup: 'cauldron', cp: 2500, zh: '巨釜盃 BF・Cauldron' },
  { cup: 'battlefrontiermaster', cp: 10000, zh: 'BF 大師盃' },
  { cup: 'trail', cp: 1500, zh: '德文試煉盃' },
  { cup: 'gymbreakers', cp: 1500, zh: 'Gymbreakers S7' },
  { cup: 'catch', cp: 1500, zh: 'Catch Cup（當季捕獲限定）' },
  { cup: 'mega', cp: 1500, zh: '超級進化超級聯盟' },
  { cup: 'mega', cp: 2500, zh: '超級進化高級聯盟' },
  { cup: 'mega', cp: 10000, zh: '超級進化大師聯盟' },
];

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

(async () => {
  // 舊檔先讀進記憶體：下載失敗的盃賽沿用舊資料，絕不讓網路錯誤「清空證據」
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync('data_cup_rankings.json', 'utf8')); } catch (e) { prev = null; }

  const out = { fetched: new Date().toISOString().slice(0, 10), cups: [] };
  let missed = [];
  for (const c of CUPS) {
    const url = `https://pvpoke.com/data/rankings/${c.cup}/overall/rankings-${c.cp}.json`;
    const data = await getJson(url);
    if (!Array.isArray(data) || !data.length) {
      console.log('MISS', c.cup, c.cp);
      missed.push(c);
      const old = prev && prev.cups && prev.cups.find(x => x.key === c.cup + '_' + c.cp);
      if (old) out.cups.push(old); // 失敗 → 保留上一份成功資料（含其日期）
      continue;
    }
    // 同 cup 同 cp 去重（若已存在保留新資料）
    const key = c.cup + '_' + c.cp;
    out.cups = out.cups.filter(x => x.key !== key);
    out.cups.push({
      key,
      cup: c.cup,
      cp: c.cp,
      zh: c.zh,
      total: data.length,
      // 只留 speciesId / 名次 / 分數，檔案控制在百 KB 級
      ranks: data.map((e, i) => ({ i: e.speciesId, r: i + 1, s: e.rating })),
    });
    console.log('OK  ', c.cup, c.cp, data.length);
  }

  // 日期語意：有失敗時必須早於或等於當天（有舊資料未更新，不能宣稱當天全量撈取）
  if (missed.length && prev && prev.fetched) {
    out.fetched = [out.fetched, prev.fetched].sort()[0];
  }

  // 覆蓋率防呆：預期一筆都沒拿到、或整體盃賽數比上次少（除非明確下架）→ 保留舊檔並報錯
  if (!out.cups.length) {
    console.error('錯誤：全部盃賽下載失敗，保留舊檔不覆寫');
    process.exit(1);
  }
  if (prev && prev.cups && prev.cups.length && out.cups.length < prev.cups.length) {
    const dropped = prev.cups.filter(x => !out.cups.some(y => y.key === x.key));
    console.error('錯誤：本次盃賽數(%d)少於上次(%d)，疑似格式下架或下載失敗：', out.cups.length, prev.cups.length, dropped.map(d => d.key).join(', '));
    console.error('已保留舊檔不覆寫；若確認為正式下架請手動刪除 data_cup_rankings.json 後重跑');
    process.exit(1);
  }

  // 原子寫入：先寫暫存再改名，中斷不會留下半損檔
  fs.writeFileSync('data_cup_rankings.json.tmp', JSON.stringify(out));
  fs.renameSync('data_cup_rankings.json.tmp', 'data_cup_rankings.json');
  const size = (fs.statSync('data_cup_rankings.json').size / 1024).toFixed(1);
  console.log('盃賽數:', out.cups.length, '/', CUPS.length, '| 檔案大小:', size, 'KB', '| 撈取日:', out.fetched);
  if (missed.length) {
    console.error('警告：有 ' + missed.length + ' 個盃賽下載失敗（沿用舊資料），命令以非零碼結束');
    process.exit(1);
  }
})();
