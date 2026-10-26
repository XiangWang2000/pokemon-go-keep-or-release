/*
 * build_data.js — 整合所有資料源，產出 site/data/data.json
 * 來源:
 *  - data/pvpoke_gamemaster.json (PvPoke GameMaster: 1751 型態、種族值、招式、標籤)
 *  - data/pvpoke_{500,1500,2500,10000}.json (PvPoke 各聯盟排名)
 *  - data/cup_rankings.json (PvPoke 現行盃賽/特殊格式排名，由 tools/fetch_cup_rankings.js 產出)
 *  - data/names_zh_hant.json (官方繁體譯名, index = dex-1)
 *  - data/cpm.json (CP 倍率表, index = level-1)
 *  - data/moves_zh.json (招式官方繁中譯名, 可選)
 */
const fs = require('fs');

const gm = JSON.parse(fs.readFileSync('data/pvpoke_gamemaster.json', 'utf8'));
// GO Game Master 抽取資料（tools/fetch_go_gm.js）：PvE 招式數據 + 進化方向
const goGm = fs.existsSync('data/go_gm.json')
  ? JSON.parse(fs.readFileSync('data/go_gm.json', 'utf8'))
  : { moves: {}, evo: {} };
if (!goGm.moves || !Object.keys(goGm.moves).length) {
  console.log('警告：缺 data/go_gm.json（node tools/fetch_go_gm.js），PvE 估算將退回 PvPoke 近似值');
}

// 排除：主題造型物種（個人品項無法量化，不列入清單）
const EXCLUDE_SPECIES = new Set([
  'pikachu_5th_anniversary', 'pikachu_flying', 'pikachu_horizons', 'pikachu_kariyushi',
  'pikachu_libre', 'pikachu_pop_star', 'pikachu_rock_star', 'pikachu_shaymin',
]);
// PvPoke 的 released 標記落後 GO 實況：這些在 GO 已實裝（經 reactmap 形態清單核對，
// 2026-10-26），強制納入建置——不然會有「中段型態被勸傳送、進化目標子虛烏有」的錯位
const RELEASED_OVERRIDE = new Set([
  'farigiraf',           // reactmap 981 Normal 形態在列；PvPoke 尚未標 released
  'spewpa',              // GO 2022 隨 Scatterbug 實裝（665 有 20 種 Vivillon 沖浪卡形態）
  'toxtricity_amped',    // reactmap 849：Low Key／Amped 兩形態皆在列（PvPoke 皆標 false）
  'toxtricity_low_key',
]);
// GO 無「無形態本體」的物種：GO 只看得到下列形態行，base 行是 PvPoke 的模擬殘留 → 不建行
const GO_FORMLESS_BASE = new Set([
  'toxtricity', // GO 只有 Amped／Low Key（reactmap 849 無 Normal form）
]);

// ---------- 進化方向：以 GO Game Master 的 evolutionBranch 為權威 ----------
// （舊實作曾用「進化必使種族值總和上升」推斷方向並翻轉可疑邊——已被證實是陷阱：
//   Doublade(547) > Aegislash 盾牌形態(524) 是真實情況，用種族值翻邊會錯出 honedge→doublade→(盾)
//   這條正確線。進化方向只認 GO GM，與 PvPoke 不一致時僅輸出警告供人工核對。）
{
  const byId = new Map(gm.pokemon.map(p => [p.speciesId, p]));
  // GO 的進化目標可能不帶形態後綴（如 'aegislash'）→ 對應 PvPoke 的形態行。
  // 挑選順序：_shield（aegislash 慣例）＞ 已實裝 ＞ gm 排序第一筆——
  // 絕不挑 released=false 的行進 evoNext（曾造成 darumaka 懸空指向未實裝的 zen 形態）
  const mapTarget = (t) => {
    // 直上命中也要是實裝行（PvPoke 有未 released 的形態殘留行，如 maushold_family_of_four，
    // 掛上後 evoNext 會被淨化刪掉、NFE 標記卻殘留）→ 改往 released 的 root 行找
    if (byId.has(t) && (byId.get(t).released || RELEASED_OVERRIDE.has(t))) return t;
    const cands = gm.pokemon.filter(p => p.speciesId.startsWith(t + '_')).map(p => p.speciesId);
    if (cands.length) {
      const shield = cands.find(c => c.endsWith('_shield'));
      const rel = cands.find(c => gm.pokemon.find(p => p.speciesId === c && p.released));
      return shield || rel || cands[0];
    }
    const parts = t.split('_');
    while (parts.length > 1) {
      parts.pop();
      const row = byId.get(parts.join('_'));
      if (row && row.released) return row.speciesId;
    }
    return byId.has(t) ? t : null; // 全部找不到時退回原命中行（未實裝則由 evoNext 淨化處理）
  };
  const applied = [], mismatched = [];
  // GO 進化的全部子代集合（mapTarget 後）：PvPoke 有、GO 完全沒有下游的邊 → 矛盾，刪除
  const childrenGo = new Set();
  const parentsOf = new Map(); // 反向表：child → GO 說的父輩群（偵測 PvPoke 家族方向寫反）
  for (const [src, list] of Object.entries(goGm.evo)) {
    for (const t of list) {
      const m = mapTarget(t);
      if (!m) continue;
      childrenGo.add(m);
      if (!parentsOf.has(m)) parentsOf.set(m, new Set());
      parentsOf.get(m).add(src);
    }
  }
  // 暗影下游在 childrenGo 裡找不到（GO GM 分支只記在基礎種上）→ 對照普通版
  const childInGo = t => childrenGo.has(t.endsWith('_shadow') ? t.replace(/_shadow$/, '') : t);
  // 進化後型態在本站真的有行且實裝（GO 缺記錄時用來判 PvPoke 線是否可信）
  const knownReleased = t => RELEASED_OVERRIDE.has(t) || (byId.has(t) && byId.get(t).released);
  for (const p of gm.pokemon) {
    const fam = p.family || {};
    const go = (goGm.evo[p.speciesId] || []).map(mapTarget).filter(Boolean);
    const ppEvo = fam.evolutions || [];
    if (go.length) {
      if (JSON.stringify(gpEvoSafe(go)) !== JSON.stringify(gpEvoSafe(ppEvo))) {
        if (ppEvo.length) mismatched.push(p.speciesId + '(' + ppEvo + '→' + go + ')');
        fam.evolutions = [...new Set(go)]; // 多形態回退到同一 root 行會產生重複目標
      }
      delete fam.parent; // 方向以 GO 為準
      applied.push(p.speciesId);
    } else if (ppEvo.length && !ppEvo.every(childInGo)) {
      // PvPoke 家族方向可能整個寫反（實例：sinistcha.evolutions=['poltchageist']、
      // poltchageist.family.parent='sinistcha'——但進化方向明明是 Poltchageist→Sinistcha）。
      // GO 明確把本種記為某「evolutions 目標」的父輩下游時，這條線是反掛的 → 刪除，
      // 讓父輩那一行的 GO 邊去建立正確方向（poltchageist 的 evolutions 會指向 sinistcha）
      if (ppEvo.some(t => (parentsOf.get(p.speciesId) || new Set()).has(t))) {
        delete fam.evolutions;
        delete fam.parent;
      } else {
      // GO GM 沒記錄下游 ≠ PvPoke 錯置：GO 也會漏記資料——
      // （一）evolutionBranch 一律記在基礎種，形態種（區域形態/暗影）沒有自有記錄 → childInGo 天生比較不到
      // （二）探險效果/特殊進化（stantler→wyrdeer、girafarig→farigiraf）GM 直接不寫 branch（已核對原始 GM）
      // 所以改保守：只要 PvPoke 的每個下游都實裝（存在且有行），原線可信 → 保留。
      const allKnown = ppEvo.every(knownReleased);
      const shadowLine = p.speciesId.endsWith('_shadow');
      const shadowInherit = shadowLine && ppEvo.every(
        t => t.endsWith('_shadow') && childInGo(t) && knownReleased(t));
      if (allKnown || shadowInherit) {
        applied.push(p.speciesId);
      } else if (shadowLine) {
        // 暗影 per-topic 繼承：只收暗影子行真的存在、且普通版子代在 GO 有記錄的段落，
        // 不存在的暗影下游剔除該段而非整線陪葬（如 scyther_shadow 只留 scizor_shadow）
        const kept = ppEvo.filter(t => t.endsWith('_shadow') && childInGo(t) && knownReleased(t));
        if (kept.length) {
          fam.evolutions = kept;
          applied.push(p.speciesId);
        } else {
          mismatched.push(p.speciesId + '(' + ppEvo + '→none)');
          delete fam.evolutions;
          delete fam.parent;
        }
      } else {
        mismatched.push(p.speciesId + '(' + ppEvo + '→none)');
        delete fam.evolutions;
        delete fam.parent;
      }
      }
    }
  }
  function gpEvoSafe(a) { return [...new Set(a)].sort(); }
  console.log('進化方向（GO GM 為準）:', applied.length, '物種；PvPoke 差異覆寫', mismatched.length, '處');
  if (mismatched.length) console.log('  差異明細:', mismatched.join(' '));
}
const namesZh = JSON.parse(fs.readFileSync('data/names_zh_hant.json', 'utf8'));
// ---------- GO 譯名覆蓋 ----------
// 本站的讀者是 GO 玩家，譯名以 GO 遊戲內實際顯示為準（PokeMiners Latest APK 繁中字串，
// 由 tools/build_go_names.js 解析成 data/go_names_zhtw.json）。GO 的在地名與主系列官方譯名
// 有 81 處不同（如 Tyrogue＝「無畏小子」而非主系列的「巴爾郎」）——僅在主系列名存在時覆蓋。
const goNames = JSON.parse(fs.readFileSync('data/go_names_zhtw.json', 'utf8'));
{
  let goOverride = 0;
  for (const [dex, go] of Object.entries(goNames)) {
    if (namesZh[dex - 1] && namesZh[dex - 1] !== go) { namesZh[dex - 1] = go; goOverride++; }
  }
  console.log('GO 譯名覆蓋:', goOverride, '隻（源：PokeMiners GO APK 繁中字串）');
}
const cpm = JSON.parse(fs.readFileSync('data/cpm.json', 'utf8'));
let moveZh = {};
try { moveZh = JSON.parse(fs.readFileSync('data/moves_zh.json', 'utf8')); } catch (e) { console.log('(move names zh not ready yet)'); }

// 圖示/極巨化輔助資料
let reactmap = null, uiconsFiles = null, maxData = null;
try { reactmap = JSON.parse(fs.readFileSync('data/wwm_reactmap.json', 'utf8')); } catch (e) {}
try { uiconsFiles = new Set(JSON.parse(fs.readFileSync('data/uicons_filelist.json', 'utf8'))); } catch (e) {}
try { maxData = JSON.parse(fs.readFileSync('data/max.json', 'utf8')); } catch (e) {}

// 排除：主題造型物種（個人品項無法量化，不列入清單）

function loadRankings(file) {
  const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = {};
  arr.forEach((e, i) => { map[e.speciesId] = { r: i + 1, rating: e.rating, moves: e.moves }; });
  return map;
}
const ranks = {
  500: loadRankings('data/pvpoke_500.json'),
  1500: loadRankings('data/pvpoke_1500.json'),
  2500: loadRankings('data/pvpoke_2500.json'),
  10000: loadRankings('data/pvpoke_10000.json'),
};
const LEAGUES = [500, 1500, 2500, 10000];
const LEAGUE_ZH = { 500: '小小盃', 1500: '超級聯盟', 2500: '高級聯盟', 10000: '大師聯盟' };

// ---------- 盃賽／特殊格式排行（限制盃人選查詢用） ----------
let cupData = null;
try { cupData = JSON.parse(fs.readFileSync('data/cup_rankings.json', 'utf8')); } catch (e) { console.log('(cup rankings not ready yet)'); }
const cupIndexMap = {};
const cupMeta = [];
if (cupData) cupData.cups.forEach((c, i) => { cupIndexMap[c.key] = i; cupMeta.push({ k: c.key, cp: c.cp, zh: c.zh, total: c.total }); });

// ---------- 招式 ----------
const TYPE_ZH = { normal: '一般', fire: '火', water: '水', electric: '電', grass: '草', ice: '冰', fighting: '格鬥', poison: '毒', ground: '地面', flying: '飛行', psychic: '超能力', bug: '蟲', rock: '岩石', ghost: '幽靈', dragon: '龍', dark: '惡', steel: '鋼', fairy: '妖精' };
const moves = {};
for (const mv of gm.moves) {
  let zh = moveZh[mv.moveId] || '';
  if (!zh) {
    // PvPoke 專屬變體 fallback
    if (mv.moveId.startsWith('HIDDEN_POWER_')) zh = '覺醒力量〈' + TYPE_ZH[mv.type] + '〉';
    else if (mv.moveId.endsWith('_PLUS') && moveZh[mv.moveId.replace('_PLUS', '')]) zh = moveZh[mv.moveId.replace('_PLUS', '')] + '＋';
    else if (moveZh[mv.moveId.split('_')[0].toUpperCase()] && mv.type && mv.moveId.includes('_')) {
      const base = mv.moveId.replace('_' + mv.type.toUpperCase(), '');
      zh = (moveZh[base] || '') + '〈' + TYPE_ZH[mv.type] + '〉';
    }
  }
  moves[mv.moveId] = {
    n: zh || mv.name,
    t: mv.type,
    p: mv.power,
    g: mv.energyGain || 0,
    e: mv.energy || 0,
    cd: mv.cooldown,
  };
}
const glBan = new Set(gm.greatLeagueIneligible || []);

// ---------- 型態後綴 → 繁中 ----------
const SUFFIX_ZH = {
  alolan: '阿羅拉的樣子', galarian: '伽勒爾的樣子', hisuian: '洗翠的樣子', paldean: '帕底亞的樣子',
  mega: '超級進化', mega_x: '超級進化X', mega_y: '超級進化Y', primal: '原始回歸',
  shadow: '暗影', origin: '起源形態', altered: '變化形態', complete: '完整形態',
  therian: '靈獸形態', incarnate: '化身形態', attack: '攻擊形態', defense: '防禦形態', speed: '速度形態',
  zen: '達摩模式', standard: '一般模式', sunny: '晴天形態', rainy: '陰雨形態', snowy: '雪雲形態',
  heat: '加熱形態', wash: '清洗形態', mow: '除草形態', fan: '旋風形態', frost: '結凍形態',
  white: '白之形態', black: '黑之形態', hero: '英雄的樣子',
  crowned_sword: '劍之王', crowned_shield: '盾之王',
  single_strike: '一擊流', rapid_strike: '連擊流',
  amped: '高音形態', low_key: '低音形態',
  '10': '10%形態', dawn_wings: '黎明之翼', dusk_mane: '黃昏之鬃',
  aria: '歌唱形態', pirouette: '舞步形態', land: '陸上形態', sky: '天空形態',
  unbound: '解放形態', overcast: '陰天形態', sunshine: '開朗形態',
};
const SUFFIX_COMBINED = {
  galarian_standard: '伽勒爾的樣子·達摩模式',
};
const SUFFIX_TOKENS = new Set(Object.keys(SUFFIX_ZH));

// ---------- 型態 → wwm-uicons 圖示（GO 實際圖） ----------
// 命名:{dex}.png | {dex}_f{formId}.png | {dex}_e{1..4}.png(Mega/Primal) | _a1=暗影
const ICON_TOKEN_FORM = {
  alolan: 'Alola', galarian: 'Galarian', hisuian: 'Hisuian', paldean: 'Paldean',
  origin: 'Origin', altered: 'Altered', complete: 'Complete', therian: 'Therian', incarnate: 'Incarnate',
  attack: 'Attack', defense: 'Defense', speed: 'Speed', sunny: 'Sunny', rainy: 'Rainy', snowy: 'Snowy',
  heat: 'Heat', wash: 'Wash', mow: 'Mow', fan: 'Fan', frost: 'Frost',
  white: 'White', black: 'Black', hero: 'Hero',
  crowned_sword: 'Crowned Sword', crowned_shield: 'Crowned Shield', '10': '10%',
  single_strike: 'Single Strike', rapid_strike: 'Rapid Strike',
  amped: 'Amped', low_key: 'Low Key',
  dawn_wings: 'Dawn Wings', dusk_mane: 'Dusk Mane', aria: 'Aria', pirouette: 'Pirouette',
  land: 'Land', sky: 'Sky', unbound: 'Unbound', overcast: 'Overcast', sunshine: 'Sunshine',
  standard: 'Standard', zen: 'Zen', galarian_standard: 'Galarian Standard', galarian_zen: 'Galarian Zen',
};
const canoIcon = s => ('' + s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const MEGA_TOKENS = ['mega_x', 'mega_y', 'mega', 'primal', 'shadow'];
function iconOf(dex, suffixTokens) {
  if (!uiconsFiles || !dex) return null;
  const tokens = suffixTokens || [];
  const isShadow = tokens.includes('shadow');
  const sh = isShadow ? '_a1' : '';
  const e = tokens.includes('mega_x') ? 2 : tokens.includes('mega_y') ? 3
    : tokens.includes('mega') ? 1 : tokens.includes('primal') ? 4 : null;
  const modes = [];
  if (e) {
    modes.push(dex + '_e' + e + sh + '.png');
    if (isShadow) modes.push(dex + '_e' + e + '.png');
  } else {
    const nonForm = tokens.filter(t => !MEGA_TOKENS.includes(t));
    const rmPoke = reactmap && reactmap.pokemon[dex];
    if (nonForm.length && rmPoke && rmPoke.forms) {
      const want = nonForm.map(t => ICON_TOKEN_FORM[t]).every(Boolean)
        ? nonForm.map(t => ICON_TOKEN_FORM[t]).join(' ')   // 複合：Galarian Standard
        : nonForm.map(t => ICON_TOKEN_FORM[t] || t).join(' ');
        for (const [fid, f] of Object.entries(rmPoke.forms)) {
          if (canoIcon(f.name) === canoIcon(want)) { modes.push(dex + '_f' + fid + sh + '.png'); break; }
        }
      }
    modes.push(dex + sh + '.png'); // 預設型態
  }
  return modes.find(m => uiconsFiles.has(m)) || null;
}

// ---------- 工具 ----------
const CPM_L50 = cpm[49];           // Lv50
const CPM_L40 = cpm[39];           // Lv40
function cpLv(stats, ivs, levelIdx) {
  const A = stats.atk + ivs[0];
  const D = stats.def + ivs[1];
  const H = stats.hp + ivs[2];
  const c = cpm[levelIdx];
  return Math.floor((A * Math.sqrt(D) * Math.sqrt(H) * c * c) / 10);
}
const cpm50 = (c, l) => (l === Math.floor(l) ? c[l - 1] : (c[Math.floor(l) - 1] + c[Math.floor(l)]) / 2);

// PvE 估算（GO GM PvE 數值）：枚舉所有 快招×蓄力招 組合取最大循環 DPS
// - 快招集能 eps＝energyDelta/duration；蓄力招消耗＝|energyDelta|（負值）
// - 每招各自套 STAB ×1.2；暗影個體攻擊 ×1.2
// - GO GM 缺招式時退回 PvPoke 數值近似（duration→cd、energy→成本），漏的招式會列出
let pveFallbackMoves = 0;
function pveCalc(p) {
  const shadowAtk = /_shadow$/.test(p.speciesId) ? 1.2 : 1;
  const atkStat = (p.baseStats.atk + 15) * CPM_L40 * shadowAtk;
  const defStat = (p.baseStats.def + 15) * CPM_L40;
  const hpStat = (p.baseStats.hp + 15) * CPM_L40;
  const stag = t => (p.types && p.types.includes(t)) ? 1.2 : 1.0;
  const getGo = (id) => {
    const m = goGm.moves && goGm.moves[id];
    if (m) return m;
    // PvPoke fallback：cd(優秒)／e(PvP 能量成本當 PvE 消耗)
    const pp = moves[id];
    if (!pp || pp.p <= 0) return null;
    pveFallbackMoves++;
    return { type: pp.t, power: pp.p, durationMs: pp.cd, energyDelta: (id && pp.e > 0) ? -pp.e : pp.g ? pp.g : 0 };
  };
  const fastList = (p.fastMoves || []).map(getGo).filter(m => m && m.power > 0 && m.energyDelta > 0);
  if (!fastList.length) return null;
  const fCalc = fastList.map(f => {
    const dur = f.durationMs / 1000;
    return { f, dps: f.power * stag(f.type) / dur, eps: f.energyDelta / dur };
  });
  const chargedList = (p.chargedMoves || []).map(getGo).filter(m => m && m.power > 0 && m.energyDelta < 0);
  let dps;
  if (!chargedList.length) {
    // 無蓄力（Yawn 之類）：純快招
    dps = Math.max(...fCalc.map(fc => fc.dps));
  } else {
    dps = 0;
    for (const fc of fCalc) {
      for (const c of chargedList) {
        const cost = -c.energyDelta;
        const nFast = Math.max(1, Math.ceil(cost / fc.eps));
        const power = nFast * fc.f.power * stag(fc.f.type) + c.power * stag(c.type);
        const time = nFast * fc.f.durationMs / 1000 + c.durationMs / 1000;
        const comboDps = power / time;
        if (comboDps > dps) dps = comboDps;
      }
    }
  }
  const effective = dps * atkStat / 70;   // 除以固定防守參考值(相對比較用)
  const ehp = hpStat * defStat * 0.3;     // TDO 近似
  const weight = effective * Math.sqrt(ehp) * 0.01;
  return { dps: +dps.toFixed(2), score: +effective.toFixed(1), weight: +weight.toFixed(2) };
}

// ---------- 建立型態清單 ----------
const all = [];
const unknownSuffix = new Set();
for (const p of gm.pokemon) {
  if (!p.released && !RELEASED_OVERRIDE.has(p.speciesId)) continue; // 未實裝略過（已核對的白名單例外）
  if (EXCLUDE_SPECIES.has(p.speciesId)) continue; // 主題造型：個人喜好，不量化
  if (GO_FORMLESS_BASE.has(p.speciesId)) continue; // GO 無此本體，形態行另列
  const dex = p.dex;
  const baseZh = namesZh[dex - 1];
  if (!baseZh) { console.log('NO ZH NAME for', p.speciesId, dex, p.speciesName); }

  const fam = p.family || {};
  // 後綴：從尾巴收集已知型態 token（優先最長匹配，讓 mega_x/galarian_standard 等完整成立）
  let suffix = '';
  const tokens = p.speciesId.split('_');
  const collected = [];
  while (tokens.length > 1) {
    const tail = tokens.slice(1).join('_');
    if (SUFFIX_TOKENS.has(tail)) { collected.unshift(tail); tokens.splice(1); break; }
    const last = tokens[tokens.length - 1];
    if (SUFFIX_TOKENS.has(last)) { collected.unshift(last); tokens.pop(); continue; }
    break;
  }
  if (collected.length) suffix = collected.join('_');
  if (suffix && !SUFFIX_ZH[suffix] && !SUFFIX_COMBINED[suffix]) {
    // 自動組合多段型態（如 alolan_shadow → 阿羅拉的樣子·暗影）
    const parts = suffix.split('_');
    if (parts.every(t => SUFFIX_ZH[t])) SUFFIX_COMBINED[suffix] = parts.map(t => SUFFIX_ZH[t]).join('·');
    else unknownSuffix.add(suffix);
  }

  const tags = p.tags || [];
  const types = (p.types || []).filter(t => t !== 'none');
  const maxCP = cpLv(p.baseStats, [15, 15, 15], 49);

  // 排名
  const pvp = {};
  for (const L of LEAGUES) {
    const e = ranks[L][p.speciesId];
    pvp[L] = e ? { r: e.r, rating: e.rating } : null;
  }

  // 建議保留 IV（PvPoke 提供的各聯賽 rank1 參考）
  const ivRef = {};
  const di = p.defaultIVs || {};
  for (const L of LEAGUES.slice(0, 3)) {
    const k = 'cp' + L, k2 = L === 2500 ? 'cp2500l40' : null;
    const best = di[k] || (k2 && di[k2]);
    if (best) ivRef[L] = [Math.round(best[0]), Math.round(best[1]), Math.round(best[2]), Math.round(best[3])];
  }

  const pe = pveCalc(p);
  const entry = {
    id: p.speciesId,
    dex,
    zh: baseZh ? (suffix ? baseZh + '（' + (SUFFIX_COMBINED[suffix] || SUFFIX_ZH[suffix] || '') + '）' : baseZh) : p.speciesName,
    en: p.speciesName,
    t: types,
    a: p.baseStats.atk, d: p.baseStats.def, h: p.baseStats.hp,
    cp50: maxCP,
    tags,
    pvp,
    iv: ivRef,
    pve: pe,
    nfe: !!(fam.id && fam.evolutions && fam.evolutions.length > 0 && !tags.includes('mega')),
    li: glBan.has(p.speciesId) || undefined, // 超級聯盟禁入
    fam: fam.id,
    icon: iconOf(dex, collected),
    evoNext: fam.evolutions && fam.evolutions.length ? [...new Set(fam.evolutions)] : undefined,
  };
  // 極巨化/超極巨化（data/max.json 由 pokemondb 極巨化清單解析而來）
  if (maxData) {
    const mx = maxData[p.speciesId];
    if (mx) { entry.dm = true; if (mx.dmg) entry.dmg = true; }
  }
  all.push(entry);
}

// ---------- 超極巨化拆成獨立型態 ----------
// GO 中 Gigantamax 因子是獨立個體（一般個體未必有），且保留價值互不相關
const isFormIcon = e => /^\d+_f\d+\.png$/.test(e.icon || ''); // GO 獨立形態圖（{dex}_f{n}.png）
// 「極巨化本體＝形態／基礎種本身」的物種：GO 只有極巨化個體、無一般個體，
// 不拆行（拆了就是幻影）。蒼響／藏瑪然特＝能量形態轉換（劍之王不巨大化但可參戰）；
// 武道熊師＝GO 第一個「只發佈極巨化形態」的物種（Kubfu 只在 Max Battle 抓取，進化後保有極巨化能力）
const MAX_BODY_FORMS = new Set(['zacian_crowned_sword', 'zamazenta_crowned_shield', 'urshifu_single_strike', 'urshifu_rapid_strike']);
const MAX_BODY_BASE = new Set(['kubfu']);
if (maxData) {
  const gmaxExtra = [];
  const takenIds = new Set(all.map(e => e.id)); // 防拆行 id 撞上來源未來新增的同名行
  for (const e of all) {
    if (!e.dmg) continue;
    if (MAX_BODY_FORMS.has(e.id) || MAX_BODY_BASE.has(e.id)) continue; // 本體即極巨化，無一般個體
    if (takenIds.has(e.id + '_gmax')) continue;
    takenIds.add(e.id + '_gmax');
    const g = { ...e, id: e.id + '_gmax', zh: e.zh + '（超極巨化）', en: e.en + ' (Gigantamax)' };
    g.dmg = true; delete g.dm;
    g.icon = (uiconsFiles && uiconsFiles.has(e.dex + '_b2.png')) ? e.dex + '_b2.png' : e.icon;
    g.nfe = false; delete g.evoNext; // 超極巨化個體進化後失去 G-Max 因子
    gmaxExtra.push(g);
    delete e.dmg; // 一般狀態（仍可極巨化）不再共用判定
  }
  all.push(...gmaxExtra);
  console.log('超極巨化獨立型態:', gmaxExtra.length);
}

// ---------- 極巨化拆成獨立型態 ----------
// GO 中只有 Power Spot（Max Battle）抓到的個體才具極巨化能力（進化後保留），
// 一般來源的個體不會有 → 與母種一般個體分開列
if (maxData) {
  const dmaxExtra = [];
  const takenIds = new Set(all.map(e => e.id).concat(dmaxExtra.map(x => x.id)));
  for (const e of all) {
    if (!e.dm) continue;
    // 極巨化本體＝形態本身的特例（見 MAX_BODY_* 註解）不拆行；
    // 其餘形態（如顫弦蠑螈高音/低音、幸福蛋）都有一般個體 → 照常拆行
    if (MAX_BODY_FORMS.has(e.id) || MAX_BODY_BASE.has(e.id)) continue;
    if (takenIds.has(e.id + '_dmax')) continue;
    takenIds.add(e.id + '_dmax');
    const d = { ...e, id: e.id + '_dmax', zh: e.zh + '（極巨化）', en: e.en + ' (Dynamax)' };
    d.dm = true;
    d.icon = (uiconsFiles && uiconsFiles.has(e.dex + '_b1.png')) ? e.dex + '_b1.png' : e.icon;
    dmaxExtra.push(d);
    delete e.dm; // 一般個體另以標記判斷，不再帶能力資訊
  }
  all.push(...dmaxExtra);
  console.log('極巨化獨立型態:', dmaxExtra.length);
}

// ---------- PvE 百分位 ----------
if (pveFallbackMoves) console.log('PvE 招式 fallback（PvPoke 近似）:', pveFallbackMoves, '次');
const weights = all.filter(e => e.pve).map(e => e.pve.weight).sort((a, b) => a - b);
for (const e of all) {
  if (!e.pve) continue;
  const i = weights.findIndex(w => w >= e.pve.weight); // 近似百分位
  e.pve.pct = +(((i + 1) / weights.length) * 100).toFixed(1);
}

// ---------- 有效體質（守道館指標 bulkPct） ----------
// 守道館的收益 ≈ HP × DEF（道館防守者靠時間換士氣，能站多久由總承受量決定）；
// 以全體「基礎型態」（排除暗影重複行與極巨化拆分行）建立分佈，算出型態的百分位。
{
  const pool = all.filter(e => !/_shadow$/.test(e.id) && !/_(dmax|gmax)$/.test(e.id));
  const bulks = pool.map(e => e.h * e.d).sort((a, b) => a - b);
  for (const e of all) {
    const own = e.h * e.d;
    let le = 0;
    for (const b of bulks) { if (b <= own) le++; else break; } // bulks 已排序
    e.bulkPct = Math.round((le / bulks.length) * 1000) / 10; // 百分位，越高越硬
  }
  const top = [...all].sort((a, b) => (b.h * b.d) - (a.h * a.d)).slice(0, 5);
  console.log('有效體質 top5:', top.map(e => e.zh + '(' + e.bulkPct + '%)').join('、'));
}

// ---------- 保留 / 傳送判定 ----------
function bestRank(e) {
  let best = null;
  for (const L of [500, 1500, 2500, 10000]) {
    const r = e.pvp[L] && e.pvp[L].r;
    if (r && (r < (!best ? Infinity : best.r))) best = { r, L };
  }
  return best;
}
// ---------- 超級進化／原始回歸 併回母體型態 ----------
// 超級進化是「物種開放、個體自由進行」的機制：母體資訊已涵蓋判定，
// 型態細節（種族值／PvE／型態圖）併入母體卡片的超級進化區塊顯示。
// 暗影超級進化在遊戲中不存在（PvPoke 模擬殘留）→ 直接移除。
{
  const byId = new Map(all.map(e => [e.id, e]));
  const drop = new Set();
  let phantom = 0;
  for (const e of all) {
    const isShadow = /_shadow$/.test(e.id);
    const core = isShadow ? e.id.replace(/_shadow$/, '') : e.id;
    const m = core.match(/^(.+)_(mega_x|mega_y|mega|primal)$/);
    if (!m) continue;
    if (isShadow) { phantom++; drop.add(e.id); continue; }
    const base = byId.get(m[1]);
    if (!base) continue; // 母體未實裝 → 保留獨立行（罕見）
    (base.megas ||= []).push({
      id: e.id,
      zlabel: SUFFIX_ZH[m[2]] || '超級進化',
      isPrimal: m[2] === 'primal' || undefined,
      a: e.a, d: e.d, h: e.h, t: e.t.slice(),
      pve: e.pve ? { ...e.pve } : undefined,
      icon: e.icon,
    });
    drop.add(e.id);
  }
  const kept = all.filter(e => !drop.has(e.id));
  all.length = 0;
  all.push(...kept);
  console.log('超級進化/原始回歸併入母體:', drop.size - phantom, '筆（另移除暗影超進化模擬殘留', phantom, '筆）');
}

// ---------- 盃賽排行附掛到型態 ----------
// cupR = [[盃賽索引, 名次, 分數], …]（依名次升冪）
if (cupData) {
  const formById = new Map(all.map(e => [e.id, e]));
  let hitCount = 0;
  for (const c of cupData.cups) {
    const idx = cupIndexMap[c.key];
    for (const rk of c.ranks) {
      const e = formById.get(rk.i);
      if (!e) continue;
      ((e.cupR ||= []).push([idx, rk.r, +rk.s.toFixed(1)]));
      hitCount++;
    }
  }
  for (const e of all) if (e.cupR) e.cupR.sort((a, b) => a[1] - b[1]);
  console.log('盃賽排行附掛:', hitCount, '筆 /', all.filter(e => e.cupR).length, '型態至少上榜一次');
}

// ---------- 高解析大圖（PokeAPI HOME 512×512） ----------
// uicons 來源為 GO 遊戲內 icon（最長邊 128，高 DPI 放大有模糊感）；
// 基礎／暗影行（icon 為 {dex}.png 或 {dex}_a1.png，兩者共用同張 base art）改用 HOME 512 作為詳細頁大圖；
// 區域形態／超級進化／極巨化（_f/_e/_b 後綴）維持 uicons（才有 GO 專屬造型）。
{
  const HOME_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/';
  let hi = 0;
  for (const e of all) {
    if (/^\d+(_a1)?\.png$/.test(e.icon) && e.dex <= 1025) {
      e.hi = HOME_BASE + e.dex + '.png';
      hi++;
    }
  }
  console.log('HOME 512 高解析大圖:', hi, '列');
}

function judge(e) {
  const tags = e.tags;
  const reasons = [];
  const b = bestRank(e);
  let tier; // 0 必留 / 1 建議保留 / 2 看情況 / 3 可傳送
  const rankReason = (L, threshold) => {
    const rr = e.pvp[L] && e.pvp[L].r;
    if (rr && rr <= threshold) { reasons.push(LEAGUE_ZH[L] + '排行第 ' + rr + ' 名'); return true; }
    return false;
  };

  if (tags.includes('mythical')) {
    tier = 0;
    reasons.push('幻獸：來源稀少且無法交換，重複的也建議留著換 XL 糖果');
  } else if (e.megas) {
    tier = 0;
    const kinds = e.megas.some(m => m.isPrimal) ? '原始回歸' : '超級進化';
    reasons.push(kinds + '：需保留母體累積能量，大幅提升團體戰輸出（型態詳情見下方）');
    rankReason(10000, 50) || rankReason(2500, 50);
  } else if (e.dmg) {
    const gmaxCount = Math.min(Object.values(maxData).filter(v => v.dmg).length, all.filter(x => x.dmg).length);
    tier = 0;
    reasons.push('超極巨化：G-Max 招式獨立且數量稀少（全遊戲僅 ' + gmaxCount + ' 隻），衝高技能等級必留');
  } else if (b && b.r <= 50) {
    tier = 0;
    reasons.push(LEAGUE_ZH[b.L] + '排行第 ' + b.r + ' 名：對戰頂尖，值得投資等級與糖果');
    reasons.push('IV 會影響名次（rank1 參考 IV 見下方）；此物種門檻寬，一般 IV 已堪用');
  } else if (tags.includes('shadow') && b && b.r <= 200 && !(e.pve && e.pve.pct >= 97)) {
    // 暗影要讓路給「PvE 前 3%」：暗影 20% 攻擊加成常把鐵腕類型態推上頂尖攻打手，
    // 此時「頂尖攻打手（必留）」比名次說明更有參考價值（gigalith_shadow 案例）
    tier = 1;
    reasons.push('已暗影：' + LEAGUE_ZH[b.L] + '排行第 ' + b.r + ' 名，暗影版本主流');
  } else if ((tags.includes('legendary') || tags.includes('wildlegendary'))) {
    tier = 1;
    reasons.push('傳說寶可夢：至少保留一隻；重複低 IV 可送或交換');
    rankReason(10000, 100) || rankReason(2500, 100);
  } else if (tags.includes('ultrabeast')) {
    tier = 1;
    reasons.push('異獸：出現稀有，建議各留一隻');
  } else {
    // 一般型態
    const cupHit = e.cupR && e.cupR[0] && e.cupR[0][1] <= 50;
    if (e.pve && e.pve.pct >= 97) {
      tier = 0;
      reasons.push('頂尖攻打手（PvE 估算前 3%）');
    } else if (cupHit) {
      const c = e.cupR[0];
      tier = 1;
      reasons.push('限制盃人選：在 ' + cupMeta[c[0]].zh + ' 排行第 ' + c[1] + ' 名（該盃賽規則下頂尖）');
    } else if (b && b.r <= 150) {
      tier = 1;
      reasons.push(LEAGUE_ZH[b.L] + '排行第 ' + b.r + ' 名：值得練');
    } else if (e.pve && e.pve.pct >= 90) {
      tier = 1;
      reasons.push('優秀攻打手（PvE 估算前 10%）');
    } else if (tags.includes('regional')) {
      tier = 2;
      reasons.push('區域限定：至少留一隻做收藏');
    } else if (e.nfe) {
      // 未完全進化：看進化後要不要留；但自身名次夠硬 → 進化前型態自己就是戰力
      const cupTop10 = e.cupR && e.cupR[0] && e.cupR[0][1] <= 10;
      if ((b && b.r <= 60) || cupTop10) {
        tier = 1;
        reasons.push('進化前型態自身強勢：' + (cupTop10
          ? cupMeta[e.cupR[0][0]].zh + '排行第 ' + e.cupR[0][1] + ' 名'
          : LEAGUE_ZH[b.L] + '排行第 ' + b.r + ' 名') + '（進化後型態戰力反降時，直接練這隻即可，不必進化）');
      } else {
        tier = 2;
        reasons.push('未完全進化：建議留 2~3 隻備用（等天氣加成或換好 IV），其餘可送');
      }
    } else if (b && b.r <= 350) {
      tier = 2;
      reasons.push(LEAGUE_ZH[b.L] + '排行第 ' + b.r + ' 名：中段戰力——非必練，可做該聯盟替補或限制盃（小小盃等）人選，隊伍缺類型時保留');
      if (e.cupR && e.cupR[0] && e.cupR[0][1] <= 150) reasons.push('限制盃加分：在 ' + cupMeta[e.cupR[0][0]].zh + ' 排行第 ' + e.cupR[0][1] + ' 名');
    } else {
      tier = 3;
      reasons.push('對戰排行與 PvE 估算皆低：可以傳送換糖果');
      reasons.push('例外：圖鑑尚未完成、或需要保留進化素材時先留');
    }
  }
  e.verdict = { tier, why: reasons };
}

// ---------- evoNext 掛空淨化 ----------
// 進化目標萬一沒有實裝行（PvPoke 未釋出的子代、或 GO 只記特殊形式），
// 前面判断都會容忍，但輸出的資料不該有掛空引用 → 全部清掉；
// 放在評級前執行：全掛空的 NFE 實為最終型態，nfe 重置後 judge/NFE 連坐才不會失真
{
  const idSet = new Set(all.map(e => e.id));
  let pruned = 0;
  for (const e of all) {
    if (!e.evoNext) continue;
    const before = e.evoNext.length;
    e.evoNext = e.evoNext.filter(t => idSet.has(t));
    pruned += before - e.evoNext.length;
    if (!e.evoNext.length) { delete e.evoNext; if (e.nfe) e.nfe = false; } // 全掛空＝實為最終型態
  }
  console.log('evoNext 掛空邊淨化:', pruned, '筆');
}

for (const e of all) judge(e);

// ---------- 可極巨化的一般型態地板 ----------
// Max Battle 可用個體，不至於「可傳送」（超極巨化個體另有 tier0 判定）
// 角色感知：有效體質前 5% 的物種在 Max Battle 是坦克／輔助位——社群共識「必練一隻體質好的」
// （Max Spirit 以自身血量百分比補全隊、Max Guard 護隊，如幸福蛋/卡比獸），給建議保留而非看情況；
// 注意 Power Spot 可重複遭遇，建議是「練一隻好 IV」而非囤個體 → tier1 不给 tier0
for (const e of all) {
  if (!e.dm || e.verdict.tier < 3) continue;
  const topPct = Math.max(1, Math.round(100 - e.bulkPct));
  if (e.bulkPct >= 95) {
    e.verdict.tier = 1;
    e.verdict.why = [
      `Max Battle 的核心坦克／輔助位：有效體質（HP×DEF）排行前 ${topPct}%，` +
      'Max Spirit 補血量隨自身血量水漲船高、Max Guard 替全隊擋傷——社群共識必練一隻體質好的',
      '技能投資方向：Max Spirit / Max Guard 優先，攻擊招不用點高；Power Spot 可重複遭遇，練好一隻即可，不必囤',
    ];
  } else {
    e.verdict.tier = 2;
    e.verdict.why = ['可極巨化：Max Battle 攻手池的一員，建議至少保留一隻適用 IV'];
  }
}

// ---------- NFE 家庭一致性 post-pass ----------
// 沿進化樹尋找終點：若某 NFE 之後的所有可達「進化後型態」皆可傳送 → 一併降為可傳送
{
  const byId = new Map(all.map(e => [e.id, e]));
  const reachable = (e, seen) => {
    // 已抵達的進化後型態＝tier 判斷對象
    if (!e) return [];
    if (seen.has(e.id)) return [];
    seen.add(e.id);
    if (!e.nfe) return [e];
    const out = [];
    for (const nx of e.evoNext || []) for (const r of reachable(byId.get(nx), seen)) out.push(r);
    return out;
  };
  let fixedTotal = 0;
  // 非進化線理由的型態不連坐：區域限定／傳說／幻獸／異獸／Mega／GMax 的評級
  // 來自收藏價值或獨立機制，不因「下游都可傳送」而失去意義（如 mr_mime 歐洲限定）
  const lineIndep = e => {
    const t = e.tags || [];
    return e.megas || e.dmg || t.includes('regional') || t.includes('legendary') || t.includes('wildlegendary') || t.includes('mythical') || t.includes('ultrabeast');
  };
  for (let pass = 0; pass < 3; pass++) {   // 迭代至固定點（上游 NFE 依下游新評級再調整）
    let fixed = 0;
    for (const e of all) {
      if (!e.nfe || e.verdict.tier === 3) continue; // 已可傳送不必重判
      if (lineIndep(e)) continue; // 區域/傳說等：理由非進化線，保留原判
      if (/_(gmax|dmax)$/.test(e.id)) continue;     // 極巨化拆分行：另有地板規則，不降級
      // 自身名次夠硬的 NFE 不連坐（自身就是戰力，進化線終點再爛也值得留這隻）
      const bn = bestRank(e);
      if ((bn && bn.r <= 60) || (e.cupR && e.cupR[0] && e.cupR[0][1] <= 10)) continue;
      const ends = reachable(e, new Set());
      if (!ends.length) continue;               // 進化後型態未實裝 → 保守不動
      if (Math.min(...ends.map(x => x.verdict.tier)) !== 3) continue;
      fixed++;
      e.verdict.tier = 3;
      e.verdict.why = ['同進化線的最終型態皆為可傳送：整條進化線無保留價值，一起送（缺圖鑑或進化素材需求除外）'];
    }
    fixedTotal += fixed;
    if (!fixed) break;
  }
  console.log('NFE 進化線一致性修正:', fixedTotal, '筆');
}

const TIER_NAME = ['必留', '建議保留', '看情況', '可傳送'];
for (const e of all) e.verdict.tierName = TIER_NAME[e.verdict.tier];

// ---------- 進化後招式清單（供詳細頁） ----------
const movesFor = {};
for (const p of gm.pokemon) {
  if (!p.released) continue;
  movesFor[p.speciesId] = {
    fast: p.fastMoves || [],
    charged: (p.chargedMoves || []).slice(0, 6),
  };
}
// 極巨化／超極巨化拆分行沿用母種招式（可學的快招／特殊招式與一般個體相同，
// 僅 Max Battle 槽位不同——極巨招式區塊由前端依屬性生成）
for (const e of all) {
  const m = e.id.match(/^(.*)_(dmax|gmax)$/);
  if (m && movesFor[m[1]]) movesFor[e.id] = movesFor[m[1]];
}

// ---------- 輸出 ----------
const out = {
  meta: {
    date: new Date().toISOString().slice(0, 10),
    sources: [
      'PvPoke gamemaster + rankings (pvpoke.com)',
      'PokeMiners game_masters (CP 倍率)',
      'sindresorhus/pokemon (官方繁中譯名)',
      'PokeAPI (招式繁中譯名)',
    ],
  },
  cpm,
  moves,
  movesFor,
  cups: cupData ? cupMeta : [],
  cupFetched: cupData ? cupData.fetched : null,
  forms: all,
};
fs.mkdirSync('site/data', { recursive: true });
fs.writeFileSync('site/data/data.json', JSON.stringify(out));

// 統計報告
const tierCount = [0, 0, 0, 0];
all.forEach(e => tierCount[e.verdict.tier]++);
console.log('\n=== 報告 ===');
console.log('型態總數(實裝):', all.length);
console.log('未實裝略過:', gm.pokemon.length - all.length);
console.log('各評級數量: 必留', tierCount[0], '/ 建議保留', tierCount[1], '/ 看情況', tierCount[2], '/ 可傳送', tierCount[3]);
console.log('未知型態後綴:', [...unknownSuffix].join(', ') || '(無)');
console.log('資料檔大小:', (fs.statSync('site/data/data.json').size / 1024 / 1024).toFixed(2), 'MB');
console.log('\n範例:');
[all.find(e => e.id === 'charizard'), all.find(e => e.id === 'sandslash_shadow'), all.find(e => e.id === 'rattata')].filter(Boolean).forEach(e => console.log(JSON.stringify(e, null, 1).slice(0, 700), '\n---'));
