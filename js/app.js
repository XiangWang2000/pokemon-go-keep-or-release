/* 寶可夢GO 去留指南 — 主程式（純靜態，無依賴） */
const TYPE_ZH = { normal: '一般', fire: '火', water: '水', electric: '電', grass: '草', ice: '冰', fighting: '格鬥', poison: '毒', ground: '地面', flying: '飛行', psychic: '超能力', bug: '蟲', rock: '岩石', ghost: '幽靈', dragon: '龍', dark: '惡', steel: '鋼', fairy: '妖精' };
const TYPE_BG = { normal: '#928b7e', fire: '#e8743a', water: '#4c8ad1', electric: '#e4c22e', grass: '#5cae57', ice: '#7ecdd6', fighting: '#c24a44', poison: '#9a5b9f', ground: '#c9af5f', flying: '#8aa6de', psychic: '#e0659f', bug: '#96ac39', rock: '#a08c4a', ghost: '#6560a8', dragon: '#4f60c8', dark: '#564f42', steel: '#7a97ab', fairy: '#d98caf' };
const LEAGUE_NAME = { 500: '小小盃', 1500: '超級聯盟', 2500: '高級聯盟', 10000: '大師聯盟' };
const TIER_NAME = ['必留', '建議保留', '看情況', '可傳送'];

let DATA = null, FORMS = [], filtr = { search: '', tier: '', type: '', extra: '', gen: '', sort: 'dex' };

// 世代用全國圖鑑號區段判定（圖鑑號在 GO 沿用主系列，不隨形態變動）
const GEN_RANGES = { 1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649], 6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 9999] };
const REGION_MARKERS = ['_alolan', '_galarian', '_hisuian', '_paldean'];
// 同圖鑑號內的地區主導排序：一個地區（或一條形態線）的行排完才排下一條——
// 關都本體線 → 起源等特殊形態（同本體區）→ 阿羅拉 → 伽勒爾 → 洗翠 → 帕底亞；
// 線內順序：一般 → 暗影 → 極巨化 → 超極巨化
function lineKey(id) {
  let core = id, stage = 0;
  for (;;) {
    if (core.endsWith('_shadow')) { core = core.slice(0, -7); if (stage < 1) stage = 1; }
    else if (core.endsWith('_dmax')) { core = core.slice(0, -5); if (stage < 2) stage = 2; }
    else if (core.endsWith('_gmax')) { core = core.slice(0, -5); if (stage < 3) stage = 3; }
    else break;
  }
  let group = 0;
  for (let i = 0; i < REGION_MARKERS.length; i++) if (core.includes(REGION_MARKERS[i])) group = i + 1;
  return { core, group, stage };
}
// 讓每行 _sk＝地區×大常數＋線序×10＋階段（載入後算一次）
function assignSortKeys() {
  const lineSeq = new Map(), counter = new Map();
  for (const f of FORMS) {
    const k = lineKey(f.id);
    const gk = f.dex + '|' + k.group;
    const lk = gk + '|' + k.core;
    let n = lineSeq.get(lk);
    if (n === undefined) { n = counter.get(gk) || 0; lineSeq.set(lk, n); counter.set(gk, n + 1); }
    f._sk = k.group * 100000 + n * 10 + k.stage;
  }
}
let current = null, curLeague = '1500';
let lastFocus = null; // 開詳細面板前的焦點元素，關閉時歸位

const $ = s => document.querySelector(s);
// 篩選／排序持久化：誤關分頁回來不用重設（搜尋、五個下拉都保留）
try { Object.assign(filtr, JSON.parse(localStorage.getItem('pogo_filtr') || '{}')); } catch (e) {}
$('#filterTier').value = filtr.tier; $('#filterType').value = filtr.type;
$('#filterExtra').value = filtr.extra; $('#filterGen').value = filtr.gen;
$('#sortBy').value = filtr.sort; $('#search').value = filtr.search;
function saveFiltr() { try { localStorage.setItem('pogo_filtr', JSON.stringify(filtr)); } catch (e) {} }
const grid = $('#grid');

const UICONS = 'https://raw.githubusercontent.com/WatWowMap/wwm-uicons/master/pokemon/';
// ---------- 圖示來源（可切換） ----------
// 'go'：uicons GO 遊戲內圖（畫風自然、檔案小最快）；最長邊僅 128px，高 DPI 放大偏柔
// 'hd'：基礎／暗影行改用 Pokémon HOME 512 高清渲染（清晰、畫風稍異於 GO）
// 完整的高清 GO 圖源目前不存在（PokeMiners 256 僅 0.3% 涵蓋），固提供兩種模式讓使用者自選
let imgStyle = 'go';
try { imgStyle = localStorage.getItem('pogo_imgstyle') || 'go'; } catch (e) {}
function spriteOf(f) {
  if (imgStyle === 'hd' && f.hi) return f.hi;
  if (f.icon) return UICONS + encodeURI(f.icon);
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f.dex}.png`;
}

function bestRank(f) {
  // 優先超級／高級／大師聯盟（一般人會打的）；小小盃（500 CP 活動賽制）
  // 只在主力聯盟都沒名次時才當代表——避免「小小盃 #73」搶走頭條誤導新手
  // （妙蛙種子：小小盃 #73 但超級聯盟 #1072）
  let best = null;
  for (const L of [1500, 2500, 10000]) {
    const e = f.pvp[L];
    if (e && (!best || e.r < best.r)) best = { r: e.r, L };
  }
  if (!best && f.pvp[500]) best = { r: f.pvp[500].r, L: 500 };
  return best;
}
// 聯盟／盃賽上限的顯示名：主力聯盟用 LEAGUE_NAME，特殊盃用 cups 資料的名稱
function capName(cp) {
  if (LEAGUE_NAME[cp]) return LEAGUE_NAME[cp];
  const c = ((DATA && DATA.cups) || []).find(x => x.cp === +cp);
  return c ? c.zh : 'CP' + cp;
}
// 排行榜顯示名：500 那格是 PvPoke 的「格式總榜」（非現行小小盃盃規），顯示時不能混叫小小盃
function rankName(L) {
  return L === 500 ? '500 格式總榜' : LEAGUE_NAME[L];
}

/* ---------- CP / IV 排名計算 ---------- */
// 正規半級 CPM 表（levels 1, 1.5, 2, …, 50；取自 GO GameMaster cpMultiplier，
// 與 PvPoke Pokemon.js 相同——半級是真值，不是相鄰整數的算術平均）
const CPM_TABLE = [
  0.0939999967813491, 0.135137430784308, 0.166397869586944, 0.192650914456886, 0.215732470154762,
  0.236572655026622, 0.255720049142837, 0.273530381100769, 0.290249884128570, 0.306057381335773,
  0.321087598800659, 0.335445032295077, 0.349212676286697, 0.362457748778790, 0.375235587358474,
  0.387592411085168, 0.399567276239395, 0.411193549517250, 0.422500014305114, 0.432926413410414,
  0.443107545375824, 0.453059953871985, 0.462798386812210, 0.472336077786704, 0.481684952974319,
  0.490855810259008, 0.499858438968658, 0.508701756943992, 0.517393946647644, 0.525942508771329,
  0.534354329109191, 0.542635762230353, 0.550792694091796, 0.558830599438087, 0.566754519939422,
  0.574569148039264, 0.582278907299041, 0.589887911977272, 0.597400009632110, 0.604823657502073,
  0.612157285213470, 0.619404110566050, 0.626567125320434, 0.633649181622743, 0.640652954578399,
  0.647580963301656, 0.654435634613037, 0.661219263506722, 0.667934000492096, 0.674581899290818,
  0.681164920330047, 0.687684905887771, 0.694143652915954, 0.700542893277978, 0.706884205341339,
  0.713169102333341, 0.719399094581604, 0.725575616972598, 0.731700003147125, 0.734741011137376,
  0.737769484519958, 0.740785574597326, 0.743789434432983, 0.746781208702482, 0.749761044979095,
  0.752729105305821, 0.755685508251190, 0.758630366519684, 0.761563837528228, 0.764486065255226,
  0.767397165298461, 0.770297273971590, 0.773186504840850, 0.776064945942412, 0.778932750225067,
  0.781790064808426, 0.784636974334716, 0.787473583646825, 0.790300011634826, 0.792803950958807,
  0.795300006866455, 0.797803921486970, 0.800300002098083, 0.802803892322847, 0.805299997329711,
  0.807803863460723, 0.810299992561340, 0.812803834895026, 0.815299987792968, 0.817803806620319,
  0.820299983024597, 0.822803778631297, 0.825299978256225, 0.827803750922782, 0.830299973487854,
  0.832803753381377, 0.835300028324127, 0.837803755931569, 0.840300023555755, 0.842803729034748,
  0.845300018787384
];
function cpmOf(level) {
  const i = Math.round(level * 2) - 2; // (level-1)*2
  return CPM_TABLE[Math.max(0, Math.min(CPM_TABLE.length - 1, i))];
}

function cpAt(f, ivs, level, shadow) {
  // level: 1..50 整數或半級；GO 的 CP 計算不含暗影倍率（×1.2/×0.8333 只影響戰鬥傷害）
  const c = cpmOf(level);
  const A = (f.a + ivs[0]);
  const D = (f.d + ivs[1]);
  const H = f.h + ivs[2];
  return Math.floor(A * Math.sqrt(D) * Math.sqrt(H) * c * c / 10);
}
// 給定 IV、聯盟上限 → 最佳等級、CP、戰鬥有效體質乘積
function evalIv(f, ivs, cap) {
  const shadow = f.id.endsWith('_shadow');
  let best = null;
  for (let l = 1; l <= 50; l += 0.5) {
    const c = cpmOf(l);
    // CP：原始種族值＋IV（無暗影倍率）
    const cp = Math.floor((f.a + ivs[0]) * Math.sqrt((f.d + ivs[1]) * (f.h + ivs[2])) * c * c / 10);
    if (cp > cap) break;
    // 戰鬥有效體質：暗影在戰鬥中攻×1.2／防×0.8333（與 PvPoke 排名一致）；HP 取整（GO 規則）
    const A = (f.a + ivs[0]) * (shadow ? 1.2 : 1) * c;
    const D = (f.d + ivs[1]) * (shadow ? 0.8333333 : 1) * c;
    const H = Math.floor((f.h + ivs[2]) * c);
    const product = A * D * H;
    if (!best || product > best.product) best = { level: l, cp, product };
  }
  return best;
}
function ivRank(f, ivs, cap) {
  const ivsList = [];
  for (let i = 0; i <= 15; i++) for (let d = 0; d <= 15; d++) for (let h = 0; h <= 15; h++) ivsList.push([i, d, h]);
  const prods = [];
  for (const v of ivsList) { const e = evalIv(f, v, cap); if (e) prods.push(e.product); }
  prods.sort((x, y) => y - x);
  const uniq = [];
  for (const p of prods) { if (!uniq.length || uniq[uniq.length - 1] !== p) uniq.push(p); }
  const mine = evalIv(f, ivs, cap);
  let rank = 1;
  for (const p of uniq) { if (p > mine.product) rank++; else break; }
  return { ...mine, rank, total: uniq.length, pct: +((rank / uniq.length) * 100).toFixed(1) };
}

/* ---------- 渲染 ---------- */
function typeBadge(t) { return `<span class="type-badge" style="background:${TYPE_BG[t] || '#666'}">${TYPE_ZH[t] || t}</span>`; }

function cardHtml(f) {
  const b = bestRank(f);
  const fmt = pct => Math.max(0.1, 100 - pct).toFixed(1).replace(/\.0$/, '');
  // 卡片小字統一列出各衡量尺度的位置（存在就顯示，不是「適合哪邊」的意思）
  const mini = [
    f.cp50 ? 'CP ' + f.cp50 : '',
    b && b.r <= 500 ? rankName(b.L) + ' #' + b.r : '', // #501 之後的尾段名次對新手無意義，不上卡面（詳細頁仍有全榜）
    f.pve && f.pve.pct != null ? 'PvE 前 ' + fmt(f.pve.pct) + '%' : '',
    f.dmx && f.dm ? 'Max 前 ' + fmt(f.dmx.pct) + '%' : '',
  ].filter(Boolean).join(' · ');
  const isSh = f.id.endsWith('_shadow');
  return `<div class="card" data-id="${f.id}" tabindex="0" role="button" aria-label="${f.zh}，${f.verdict.tierName}">
    <img loading="lazy" decoding="async" src="${spriteOf(f)}" alt=""${isSh ? ' class="shadowicon"' : ''}>${f.dmg ? '<span class="dmbadge gmax" title="可參加超極巨化戰（Gigantamax）">G·巨</span>' : f.dm ? '<span class="dmbadge" title="可參加極巨戰（Max Battle）">極</span>' : f.megas ? '<span class="dmbadge megab" title="這個物種有超級進化形態">超</span>' : ''}${marks[f.id] ? `<span class="markchip m-${({ '保留': 'keep', '可送': 'maybe', '已送': 'sent' })[marks[f.id]]}" title="我的標記：${marks[f.id]}">${marks[f.id]}</span>` : ''}
    <div class="zh">${f.zh}</div>
    <div class="en">${f.en}</div>
    <div class="row">${f.t.map(typeBadge).join('')}</div>
    <div class="vchip t${f.verdict.tier}">${f.verdict.tierName}</div>
    <div class="mini">${mini}</div></div>`;
}

function passFilter(f) {
  const s = filtr.search.toLowerCase();
  if (s) {
    const megaTerm = ['超級進化', '原始回歸', 'mega'].some(t => filtr.search === t || filtr.search.includes(t)) || /mega|primal/.test(s);
    if (!(f.zh.toLowerCase().includes(s) || f.en.toLowerCase().includes(s) || String(f.dex) === s || f.id.includes(s)
      || (megaTerm && f.megas))) return false;
  }
  if (filtr.tier !== '' && f.verdict.tier !== +filtr.tier) return false;
  if (filtr.type && !f.t.includes(filtr.type)) return false;
  const tags = f.tags || [];
  if (filtr.extra) {
    if (filtr.extra === 'legend' && !(tags.includes('legendary') || tags.includes('mythical') || tags.includes('ultrabeast'))) return false;
    if (filtr.extra === 'mega' && !(f.megas || tags.includes('mega') || tags.includes('supermega'))) return false;
    if (filtr.extra === 'dmax' && !f.dm) return false;
    if (filtr.extra === 'gmax' && !f.dmg) return false;
    if (filtr.extra === 'shadow' && !(tags.includes('shadow') || tags.includes('shadoweligible'))) return false;
    if (filtr.extra === 'regional' && !tags.includes('regional')) return false;
    if (filtr.extra === 'nfe' && !f.nfe) return false;
    if (filtr.extra === 'iv' && !f.iv || filtr.extra === 'iv' && !Object.keys(f.iv || {}).length) return false;
    if (filtr.extra === 'mine' && !marks[f.id]) return false;
    if ((filtr.extra === 'mine_keep' || filtr.extra === 'mine_maybe' || filtr.extra === 'mine_sent')) {
      const want = { mine_keep: '保留', mine_maybe: '可送', mine_sent: '已送' }[filtr.extra];
      if (marks[f.id] !== want) return false;
    }
  }
  if (filtr.gen) { const r = GEN_RANGES[filtr.gen]; if (!(f.dex >= r[0] && f.dex <= r[1])) return false; }
  return true;
}

function render() {
  const list = FORMS.filter(passFilter);
  const key = filtr.sort;
  list.sort((x, y) => {
    if (key === 'dex') return x.dex - y.dex || (x._sk - y._sk);
    if (key === 'cp') return y.cp50 - x.cp50;
    if (key === 'pvp') { const bx = bestRank(x), by = bestRank(y); return (bx ? bx.r : 9999) - (by ? by.r : 9999); }
    if (key === 'pve') return (y.pve?.pct ?? -1) - (x.pve?.pct ?? -1);
    if (key === 'tier') return x.verdict.tier - y.verdict.tier || x.dex - y.dex || (x._sk - y._sk);
    return 0;
  });
  if (!list.length) {
    // 空狀態要教你怎麼回來，不是只說「沒有」
    grid.innerHTML = `<div class="state">找不到符合條件的型態。<br>
      可以<b>清空搜尋框</b>、把評級／屬性／類別／世代選回「全部」，或換個關鍵字再試一次。</div>`;
  } else {
    grid.innerHTML = list.map(cardHtml).join('');
  }
  // 計數行：標明資料更新日（新手需要知道資料新不新）；有標記就附統計，清包時一眼看清
  let cntLine = `共 ${list.length} 個型態（資料庫共 ${FORMS.length} 個）`;
  if (DATA.meta && DATA.meta.date) cntLine += ` · 資料更新 ${DATA.meta.date} · 來源：PvPoke／PokeMiners`;
  const mkCnt = { 保留: 0, 可送: 0, 已送: 0 };
  for (const k of Object.keys(marks)) if (mkCnt[marks[k]] !== undefined) mkCnt[marks[k]]++;
  const mkTotal = mkCnt.保留 + mkCnt.可送 + mkCnt.已送;
  if (mkTotal) cntLine += ` · 我的標記：${mkTotal} 隻（保留 ${mkCnt.保留}／可送 ${mkCnt.可送}／已送 ${mkCnt.已送}）`;
  $('#resultCount').textContent = cntLine;
}

/* ---------- 詳細面板 ---------- */
function openDetail(f) {
  current = f;
  const b = bestRank(f);
  const tags = f.tags || [];
  const tagNames = { legendary: '傳說', wildlegendary: '野外傳說', mythical: '幻獸', ultrabeast: '異獸', regional: '區域限定', mega: '超級進化', supermega: '超級進化(X/Y)', shadow: '已暗影', shadoweligible: '物種有暗影版（火箭隊獲取，一般個體不可轉換）', alolan: '阿羅拉', galarian: '伽勒爾', hisuian: '洗翠', paldean: '帕底亞', starter: '御三家', duplicate: '重複型態' };
  if (f.dmg) tagNames.dmg = '超極巨化'; else if (f.dm) tagNames.dm = '極巨化';
  const rankChips = [500, 1500, 2500, 10000].map(L => f.pvp[L] ? `<span class="rankchip" title="${L === 500 ? 'PvPoke 500 CP 格式總榜（非現行小小盃盃規）；現行小小盃榜見「限制盃／特殊盃賽排名」' : 'PvPoke 評分（模擬值，不同聯盟尺度不同）：' + (f.pvp[L].rating ?? '—')}">${rankName(L)} <b>#${f.pvp[L].r}</b></span>` : '').join('');
  const cupChips = (f.cupR || []).map(c => {
    const cd = (DATA.cups || [])[c[0]];
    return cd ? `<span class="rankchip cupchip" title="${cd.zh}（CP 上限 ${cd.cp}，榜單共 ${cd.total} 型態）／資料 ${DATA.cupFetched} 撈取">${cd.zh} <b>#${c[1]}</b></span>` : '';
  }).join('');
  const ivRefs = Object.keys(f.iv || {}).map(L => `<div class="ivbox">${LEAGUE_NAME[+L] || ''}<br><b style="font-variant-numeric:tabular-nums">${f.iv[L].slice(1).join('/')}</b><br><span style="font-size:10px">Lv${f.iv[L][0]}</span></div>`).join('') || '<span class="ivref">無資料</span>';
  const fast = (f.fm || []).map(m => `<span class="fast">${m}</span>`).join('');
  const charged = (f.cm || []).map(m => `<span class="charged">${m}</span>`).join('');
  // Max Battle 槽位（GO 介面名稱：攻擊／極巨防壁／極巨回復）：
  // 攻擊槽屬性隨特殊招式變化；超極巨化個體的攻擊槽改為專屬超極巨招式
  let maxBlock = '';
  if (f.dm || f.dmg) {
    const atks = f.dmg
      ? '<span class="charged">專屬超極巨招式<small>攻擊槽由該物種的超極巨招式取代</small></span>'
      : (f.cmr || []).map(id => {
          const m = (DATA.moves || {})[id];
          return m && m.t ? `<span class="charged">極巨攻擊〈${TYPE_ZH[m.t] || m.t}〉<small>${m.n}</small></span>` : '';
        }).join('');
    maxBlock = `<div class="maxmoves"><b>極巨戰招式（Max Battle 用）</b>
      <div class="moves">${atks}<span class="charged">極巨防壁<small>替全隊減傷</small></span><span class="charged">極巨回復<small>回復自己與同伴 HP</small></span></div>
      <p class="muted" style="font-size:11px">快招累積能量後，於極巨階段放招；攻擊槽的極巨招式隨特殊招式屬性變化</p></div>`;
  }

  // 淨化建議（僅暗影行）：結論先行＋繁中語彙（個體值／報恩／遷怒）；暗影不能超級進化另列一條結論
  let purifyHtml = '';
  if (tags.includes('shadow')) {
    const t = f.verdict.tier;
    const body = t <= 1
      ? '<p style="margin:0 0 8px"><b>結論：先保留暗影（不淨化）</b><br>' +
        '· 這隻的評級是以「暗影身分」判的：暗影攻擊 ×1.2 的加成<b>就是</b>保留價值的主要依據，淨化後就消失了。<br>' +
        '· 會考慮淨化的只有兩種情況：①手上已有另一隻同物種夠用的暗影；②個體值只差一下就 15/15/15（淨百），想要滿個體做收藏。</p>'
      : t === 2
        ? '<p style="margin:0 0 8px"><b>結論：兩種都合理，照用途挑</b><br>' +
          '· <b>會拿去出戰</b>（道館、團體戰或聯盟對戰）→ 留暗影：攻擊 ×1.2 的加成讓這隻還有戰力。<br>' +
          '· <b>只是囤著／背包爆了</b> → 淨化：個體值各 +2（上限 15）、強化省星塵，招式變成「報恩」且隨時能用「招式學習器」換掉（暗影招式「遷怒」只能在限定活動期間更換）。<br>' +
          '· 簡單講：<b>確定會用的留暗影，囤著沒在用的淨化。</b></p>'
        : '<p style="margin:0 0 8px"><b>結論：淨化比較划算</b><br>' +
          '· 這隻以暗影身分出戰的名次本來就低，×1.2 的加成也救不回來；淨化後個體值 +2／+2／+2、強化省星塵，招式改成「報恩」、可用招式學習器隨時更換。<br>' +
          '· 沒有「非留暗影不可」的理由——淨化是單向的，確定不後悔就淨。</p>';
    // 暗影不能超級進化：物種有超級進化（母體帶 megas）→ 淨化是超級進化的前置門檻
    const baseRow = FORMS.find(g => g.id === f.id.replace(/_shadow$/, ''));
    const megas = baseRow && baseRow.megas || [];
    let megaLine = '';
    if (megas.length) {
      const bestMega = megas.filter(m => m.pve && m.pve.pct != null).sort((a, b) => a.pve.pct - b.pve.pct)[0];
      megaLine = '<p style="margin:0"><b>結論：想玩這隻的「超級進化」就必須先淨化</b><br>' +
        '· 暗影個體<b>不能</b>超級進化——這個物種的超級進化型態' +
        (bestMega ? `估算為攻打道館／團體戰前 ${(100 - bestMega.pve.pct).toFixed(1)}% 的輸出戰力` : `有 ${megas.map(m => m.zlabel).join('／')}`) +
        '，要吃這份強度就得先淨化。<br>' +
        '· 暗影加成與超級進化只能二選一：不缺暗影打手、常打超級進化戰的話，淨化較划算。</p>';
    }
    const footer = '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--line);font-size:11px;color:var(--muted)">' +
      '淨化是<b>單向</b>的；要花糖果與星塵（一般物種約 1 糖＋1000 星塵，實際以遊戲內顯示為準）。' +
      '<br><b>淨百規則：</b>淨化把個體值每項 +2（最高到 15）；原始攻／防／血都 13 以上的個體，淨化後即 15/15/15（淨百）。' +
      '可用下方「IV 排名計算機」輸入暗影個體值，預覽淨化後數值。</div>';
    purifyHtml = `<div class="ivref">${body}${megaLine}${footer}</div>`;
  }

  // 推薦帶法（PvPoke 排行組合＋PvE 估算最佳組合）；chips 包進 .moves 才有分段樣式
  let recHtml = '';
  {
    const nm = id => ((DATA.moves || {})[id] || {}).n || id;
    const chipRow = chips => `<div class="moves">${chips.map(c => `<span class="${c[0]}">${c[1]}</span>`).join('')}</div>`;
    const lines = [];
    for (const L of [500, 1500, 2500, 10000]) {
      const p = f.pvp[L];
      if (p && p.mv && p.mv.length) {
        const cn = p.mv.slice(1).filter(Boolean).map(nm);
        lines.push(`${rankName(L)}排行 ${p.r ? '#' + p.r : '—'}${chipRow([['fast', nm(p.mv[0])]].concat(cn.map(x => ['charged', x])))}`);
      }
    }
    if (f.pve && f.pve.f) {
      lines.push(`PvE 估算最佳${chipRow(f.pve.c ? [['fast', nm(f.pve.f)], ['charged', nm(f.pve.c)]] : [['fast', nm(f.pve.f)], ['charged', '（純快招循環）']])}`);
    }
    if (lines.length) recHtml = `<div class="ivref" style="margin-top:6px"><b>推薦帶法</b>（PvPoke 排行組合＋PvE 估算最佳組合；實帶以你自己的配置為準）${lines.map(l => `<div style="margin-top:3px">${l}</div>`).join('')}</div>`;
  }

  // 極巨戰估算（dm/dmg 行）：與普通 PvE 分開衡量
  let dmxHtml = '';
  if (f.dmx && (f.dm || f.dmg)) {
    const atkPct = Math.max(0.1, 100 - f.dmx.pct).toFixed(1).replace(/\.0$/, '');
    dmxHtml = `<details class="fold"><summary>極巨戰（Max Battle）攻擊估算<span class="fdnote">攻手前 ${atkPct}%</span></summary><div class="foldbody"><table class="stats">
      <tr><td>極巨攻擊循環 DPS 估算</td><td>${f.dmx.dps}</td></tr>
      <tr><td>攻手池百分位</td><td>排行前 <b>${atkPct}%</b>（可極巨化型態內）</td></tr></table>
      <div class="ivref" style="margin-top:6px">Max Battle 只有極巨化／超極巨化個體能出戰，輸出以極巨攻擊為主（威力 250、屬性隨特殊招式變化）——衡量尺度和普通 PvE 不同，別互相套用。<br>
      · 這個排名看「攻擊體質＋快招集能速度」；要一場連發多發極巨攻擊，也參考有效體質（撐到第六階段就得多發）。<br>
      ${f.dmg ? '· 超極巨化個體攻擊槽是專屬超極巨招式，目標類型有差但威力同屬 250 尺度，估算一併適用。' : ''}</div></div></details>`;
  }

  // 「接下來該做什麼」：評級之外補動作指引（新手最想要、卻最缺的一塊）
  const nextActs = ['這隻是<b>核心戰力</b>：不傳送；有星塵／糖果就照下方「推薦帶法」強化。',
    '值得用：<b>留著</b>，但可以不急著練——確定要打出場再投資星塵（強化很貴）。',
    '可留可送：有收藏價值、或還在猶豫就先留；確定不需要再送，不必為它投入資源。',
    '這隻<b>可以送走了</b>：遊戲內「傳送」即可；送前再看一眼標籤，確認沒有你想要收藏的東西。'];
  const nextRows = [];
  if (f.dm || f.dmg) nextRows.push(`· 這隻能打<b>極巨戰</b>：先練到 Lv30 左右就很堪用，不必一次推到 50${f.dmg ? '（超極巨化是獨立個體，別跟普通形態共用）' : ''}。`);
  if (f.megas) nextRows.push('· 有<b>超級進化</b>形態：<b>超級能量</b>主要靠打超級進化戰（Mega 團體戰）、抓「曾超級進化過」的該物種、或帶著超級進化中的夥伴走路累積——<b>傳送只給一般糖果，不給超級能量</b>；留一隻母體即可。');
  if (f.tags && f.tags.includes('shadoweligible') && !tags.includes('shadow')) nextRows.push('· 物種有暗影版（火箭隊抓取）：已暗影若有下方「淨化建議」可參考其取捨。');
  const nextHtml = `<div class="ivref">${nextActs[f.verdict.tier]}${nextRows.length ? '<br>' + nextRows.join('<br>') : ''}</div>`;

  // 折疊容器：核心決策區（判定理由＋接下來＋淨化建議＋招式）預設展開，其餘數值細節預設收合；
  // note＝收合時也能看到的行內摘要，讓使用者不必展開就知道裡面有什麼
  const fold = (open, title, note, inner) =>
    `<details class="fold"${open ? ' open' : ''}><summary>${title}${note ? `<span class="fdnote">${note}</span>` : ''}</summary><div class="foldbody">${inner}</div></details>`;

  $('#detailBody').innerHTML = `
    <h2>${f.zh}</h2><div class="en">${f.en} · #${f.dex}</div>
    <img class="sprite${f.id.endsWith('_shadow') ? ' shadowicon' : ''}" src="${spriteOf(f)}" alt="${f.zh} 的遊戲內圖示">
    <div class="vchip t${f.verdict.tier}" style="width:100%;display:block">${f.verdict.tierName}</div>

    ${fold(true, '判定理由', null, `<ul class="why">${f.verdict.why.map(w => `<li>${w}</li>`).join('')}</ul>`)}

    ${fold(true, '接下來該做什麼', null, nextHtml)}

    ${tags.includes('shadow') ? fold(true, '淨化建議', null, purifyHtml) : ''}

    ${f.megas ? fold(false, '超級進化／原始回歸型態', f.megas.length + ' 種', `<div class="megalist">${f.megas.map(m => `
      <div class="megabox"><img class="megasprite" src="${UICONS}${m.icon}" alt="${m.zlabel}">
        <div><b>${m.zlabel}</b>・建議 IV／糖果需求比照一般進化<br>
        種族值 ${m.a}/${m.d}/${m.h} · ${m.t.map(typeBadge).join('')}<br>
        ${m.pve ? `PvE 估算：循環 DPS ${m.pve.dps}／強度前 ${(100 - m.pve.pct).toFixed(1)}%` : '無招式估算'}
        <br><span style="color:var(--muted);font-size:11px">超級進化型態無法參加聯盟對戰</span></div></div>`).join('')}</div>`) : ''}

    ${fold(false, '對戰排名（PvPoke）', b ? (b.r <= 500 ? rankName(b.L) + ' #' + b.r : '聯盟榜後段') : '無名次', `<div class="chips">${rankChips || '未進入各聯賽排名'}</div>`)}

    ${fold(false, '限制盃／特殊盃賽排名', (f.cupR && f.cupR.length) ? f.cupR.length + ' 項上榜' : '未上榜', `<div class="ivref" style="margin-bottom:8px">剛入坑可先<b>忽略這區</b>——這些是限定的活動賽制，看上面的普通聯盟名次就夠了。</div><div class="chips">${cupChips || '<span class="ivref">未進入任何現行盃賽榜單</span>'}</div>
      <p class="muted" style="font-size:11px;margin:6px 0 0">榜單隨季度輪替，抓取日 ${DATA.cupFetched || '—'}</p>`)}

    ${fold(false, '道館／團體戰輸出估算（PvE）', f.pve ? '強度前 ' + (100 - f.pve.pct).toFixed(1).replace(/\.0$/, '') + '%' : null,
      (f.pve ? `<table class="stats">
        <tr><td>循環 DPS 估算</td><td>${f.pve.dps}</td></tr>
        <tr><td>強度百分位</td><td>前 ${(100 - f.pve.pct).toFixed(1)}%</td></tr></table>
      <div class="ivref" style="margin-top:6px">PvE 留哪隻？（只適用會實際上場、強度也夠的攻打手）：<br>
        · <b>糖果便宜的物種</b>：隨便挑一隻等級高的練上去就好——每點攻 IV 只有 ±0.4% DPS，不用為了挑 IV 傷腦筋。<br>
        · <b>糖果昂貴的物種（傳說、稀有的區域限定）</b>：先留「等級最高／星數最多」那隻，起點高最省糖；<b>等級相同</b>才用攻 IV 挑。<br>
        · IV 之後<b>改不了</b>沒錯，但「改不了」不代表「影響大」——升一級力量級帶來的 DPS 增益，遠大於攻 IV 0→15 整條加起來。<br>
        · 防／血 IV 確實影響「能挨幾下打」，但 GO 的傷害計算<b>取整數</b>，IV 的小幅起伏大多不會改變挨打次數——決定挨幾下的是<b>物種體質與等級</b>；IV 差異常常一整場團體戰都不會變成多挨或少挨一下。<br>
        · 強度百分位偏低的型態，就算攻 IV 滿也沒必要留。</div>` : '無招式資料'))}

    ${dmxHtml ? dmxHtml : ''}

    ${fold(false, '建議對戰個體值（rank 1 參考）', null, `<div class="ivref" style="margin-bottom:8px"><b>為什麼排名 1 的 IV 常是「攻低」？</b>對戰有 CP 上限：攻擊愈低，同一隻能升到的等級愈高、愈耐打——<b>3/14/12 不是差，是這隻在該聯盟裡最耐打的黃金組合</b>。<br>
      遊戲內看 IV：打開寶可夢 →「查看／評價」→ 三條評價條（滑桿樣式）＋上方星級，對應攻／防／血。</div><div class="ivlines">${ivRefs}</div>
      <div class="ivref" style="margin-top:6px">格式＝攻/防/血，例如 15/15/15。輸入你的個體值就能算排名 ↓</div>`)}

    ${fold(false, 'IV 排名計算機', null,
      `<div class="ivref" style="margin-bottom:8px">IV＝個體值（每項 0–15、天生固定；淨化是唯一能 +2 的方法）。遊戲內怎麼看：見上一區的說明。</div>
      <div class="ivfields">
        <label class="ivfield"><span>攻擊</span><input id="ivA" type="number" min="0" max="15" value="15" aria-label="攻擊個體值 0 到 15"></label>
        <label class="ivfield"><span>防禦</span><input id="ivD" type="number" min="0" max="15" value="15" aria-label="防禦個體值 0 到 15"></label>
        <label class="ivfield"><span>血量（耐力）</span><input id="ivH" type="number" min="0" max="15" value="15" aria-label="耐力（血量）個體值 0 到 15"></label>
        <label class="ivfield ivleague"><span>聯盟上限</span><select id="ivLeague" aria-label="聯盟上限">${[500, 1500, 2500, 10000].map(L => `<option value="${L}" ${L == 1500 ? 'selected' : ''}>${LEAGUE_NAME[L]}</option>`).join('')}${[...new Set(((DATA && DATA.cups) || []).map(c => c.cp))].filter(cp => ![500, 1500, 2500, 10000].includes(cp)).sort((x, y) => x - y).map(cp => `<option value="${cp}">${capName(cp)}（特殊盃）</option>`).join('')}</select></label>
      </div>
      <button id="ivGo">計算排名</button>
      <div id="ivResult"></div>`)}

    ${fold(false, '種族值＆上限', null, `<table class="stats">
      <tr><td>種族值（天生固定，非個體值）攻/防/血</td><td>${f.a} / ${f.d} / ${f.h}</td></tr>
      <tr><td>最高 CP（Lv50 滿個體）</td><td>${f.cp50}</td></tr>
      ${(f.bulkPct >= 85) ? `<tr><td>守館體質</td><td>有效體質（HP×DEF）排行前 <b>${(100 - f.bulkPct).toFixed(1).replace(/\.0$/, '')}%</b>——能占守道館較久；但守館收益本來就低（金幣有上限／被淘汰就結束），只當參考指標</td></tr>` : ''}
      <tr><td>標籤</td><td>${tags.map(t => tagNames[t] || t).concat(f.dmg ? ['超極巨化'] : f.dm ? ['極巨化'] : []).join('、') || '一般'}</td></tr>
      ${f.li ? '<tr><td></td><td>⚠ 超級聯盟禁入</td></tr>' : ''}
    </table>`)}

    ${fold(true, '招式與推薦帶法', null, `<div class="moves">${fast}${charged}</div>${recHtml}${maxBlock}`)}

    <section><h3>我的收藏</h3>
      <button class="markBtn" id="markBtn">${marks[f.id] ? '✓ 已標記：' + marks[f.id] + '（再點一次取消）' : '標記這隻（點擊循環：保留 → 可送 → 已送）'}</button>
    </section>`;
  $('#detail').classList.remove('hidden');
  // 焦點管理：進面板把焦點交給關閉鈕（preventScroll 避免页面跳動）；關掉時焦點歸位原卡片
  lastFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card') ? document.activeElement : null;
  const cd = $('#closeDetail');
  cd.onclick = closeDetail;
  cd.focus({ preventScroll: true });
  $('#ivGo').onclick = runIvCalc;
  $('#markBtn').onclick = () => {
    const cur = marks[f.id];
    if (!cur) marks[f.id] = '保留';
    else if (cur === '保留') marks[f.id] = '可送';
    else if (cur === '可送') marks[f.id] = '已送';
    else delete marks[f.id];
    saveMarks(); render(); openDetail(f); // render 讓卡片角章與統計行即時更新
  };
}
function closeDetail() {
  $('#detail').classList.add('hidden');
  if (lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
}
$('#closeDetail') && ($('#closeDetail').onclick = closeDetail);

function runIvCalc() {
    const ivs = [parseInt($('#ivA').value, 10), parseInt($('#ivD').value, 10), parseInt($('#ivH').value, 10)];
    const cap = parseInt($('#ivLeague').value, 10);
    if (ivs.some(v => isNaN(v) || v < 0 || v > 15)) { $('#ivResult').textContent = '個體值請輸入 0~15 的數字'; return; }
    const r = ivRank(current, ivs, cap);
    if (!r) { $('#ivResult').textContent = '此型態無法進入該聯盟／盃賽'; return; }
    // 物種本身在「該聯盟」的地位（IV 再好也救不了整體太弱的物種）
    const sp = current.pvp && current.pvp[cap];
    const spRank = sp ? sp.r : null;
    const cupBest = (current.cupR || [])[0]; // cupR 在建置時已依名次升冪
    const cupCd = cupBest ? (DATA.cups || [])[cupBest[0]] : null;
    const cupHit = cupBest && cupBest[1] <= 50;
    let grade, color;
    if (spRank != null && spRank > 350) {
      grade = cupHit ? '聯盟榜後段，但受限盃前 50 人選' : '物種排行偏後，IV 衝滿也有限';
      color = cupHit ? 'var(--softkeep)' : 'var(--maybe)';
    } else if (spRank == null) {
      grade = cupHit ? '未列聯盟總榜，但受限盃前 50 人選' : '未列入該聯盟戰力榜';
      color = cupHit ? 'var(--softkeep)' : 'var(--maybe)';
    } else if (r.rank <= 50) { grade = '頂級，必留'; color = 'var(--keep)'; }
    else if (r.rank <= 200) { grade = '值得練'; color = 'var(--softkeep)'; }
    else if (r.rank <= 700) { grade = '看情況'; color = 'var(--maybe)'; }
    else { grade = '可傳送（缺圖鑑除外）'; color = 'var(--send)'; }
    const ref = current.iv && current.iv[cap];
    // 暗影個體：順帶預覽淨化後的 IV（淨化每項 +2、最高 15）
    let purifyLine = '';
    if ((current.tags || []).includes('shadow')) {
      const pv = ivs.map(v => Math.min(15, v + 2));
      const hundo = pv.every(v => v === 15);
      purifyLine = `<br>淨化後 IV：<b>${pv.join('/')}</b>${hundo ? '（<b>淨百！</b>淨化即變 15/15/15）' : ''}`;
    }
    const cupLine = cupCd ? `<br>盃賽情報：在「${cupCd.zh}（CP${cupCd.cp}）」排行第 <b>${cupBest[1]}</b> 名／榜單共 ${cupCd.total} 型態` : '';
    const spLine = spRank != null
      ? `物種在${capName(cap)}排行第 <b>${spRank}</b> 名（IV 排名是 #${r.rank}/${r.total}）`
      : `物種未進入${capName(cap)}排行榜＋IV 排名是 #${r.rank}/${r.total}`;
    $('#ivResult').innerHTML = `<span class="grade" style="background:${color};color:#141420">${grade}</span><br>
      ${spLine}${cupLine}<br>
      最佳等級 Lv${r.level}、CP ${r.cp}
      ${ref ? `<br>rank1 參考 IV：${ref.slice(1).join('/')}（Lv${ref[0]}）` : ''}
      <br><span style="color:var(--muted);font-size:11px">PvP 體質愈接近「攻低、防高、血高」名次愈好；但物種本身的排名才是天花板</span>${purifyLine}`;
}

/* ---------- 收藏 ---------- */
let marks = {};
try { marks = JSON.parse(localStorage.getItem('pogo_marks') || '{}'); } catch (e) { marks = {}; }
function saveMarks() { localStorage.setItem('pogo_marks', JSON.stringify(marks)); }

/* ---------- 事件 ---------- */
// 搜尋輸入防抖：每鍵全量重渲 1717 卡太貴，停 150ms 才套用
let searchTimer = null;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filtr.search = e.target.value.trim();
    saveFiltr();
    render();
  }, 150);
});
$('#filterTier').addEventListener('change', e => { filtr.tier = e.target.value; saveFiltr(); render(); });
$('#filterType').addEventListener('change', e => { filtr.type = e.target.value; saveFiltr(); render(); });
$('#filterExtra').addEventListener('change', e => { filtr.extra = e.target.value; saveFiltr(); render(); });
$('#filterGen').addEventListener('change', e => { filtr.gen = e.target.value; saveFiltr(); render(); });
$('#sortBy').addEventListener('change', e => { filtr.sort = e.target.value; saveFiltr(); render(); });
// 圖示來源切換（GO 原圖 ↔ HOME 高清），寫入 localStorage 並重渲可見區塊
{
  const btn = $('#imgStyle');
  const label = { go: '圖示：GO 原圖', hd: '圖示：HOME 高清' };
  const sync = () => { btn.textContent = label[imgStyle]; btn.classList.toggle('on', imgStyle === 'hd'); };
  sync();
  btn.addEventListener('click', () => {
    imgStyle = imgStyle === 'go' ? 'hd' : 'go';
    try { localStorage.setItem('pogo_imgstyle', imgStyle); } catch (e) {}
    sync();
    render();
    if (!$('#detail').classList.contains('hidden') && current) openDetail(current);
  });
}
grid.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  const f = FORMS.find(x => x.id === card.dataset.id);
  if (f) openDetail(f);
});
// 鍵盤操作：卡片可 Tab 導覽，Enter／空白鍵開啟詳細
grid.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault(); // 空白鍵預設是捲動页面
  const f = FORMS.find(x => x.id === card.dataset.id);
  if (f) openDetail(f);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

/* ---------- 啟動 ---------- */
// 載入骨架：資料還沒到先給個 shimmer，不是一片空白
{
  const el = document.createElement('div');
  el.className = 'state skeleton';
  el.innerHTML = '<span class="bar"></span><br>型態資料載入中…';
  el.id = 'loadingState';
  grid.appendChild(el);
}
fetch('data/data.json?v=16').then(r => {
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}).then(d => {
  DATA = d; FORMS = d.forms;
  assignSortKeys();
  const dd = document.getElementById('dataDate');
  if (dd && DATA.meta && DATA.meta.date) dd.textContent = `資料更新日：${DATA.meta.date}（榜單來源 PvPoke、盃賽榜 ${DATA.cupFetched || '—'} 撈取）`;
  $('#loadingState') && $('#loadingState').remove();
  // 屬性下拉（填充完補回存檔的篩選值：還原時序在載入前，選項卻在載入後才有）
  const types = [...new Set(FORMS.flatMap(f => f.t))].sort();
  $('#filterType').innerHTML = '<option value="">全部屬性</option>' + types.map(t => `<option value="${t}">${TYPE_ZH[t]}</option>`).join('');
  $('#filterType').value = filtr.type;
  // 招式名稱預組
  for (const f of FORMS) {
    f.fm = (d.movesFor && d.movesFor[f.id]?.fast || []).map(id => d.moves[id]?.n || id);
    f.cm = (d.movesFor && d.movesFor[f.id]?.charged || []).map(id => d.moves[id]?.n || id);
    f.cmr = (d.movesFor && d.movesFor[f.id]?.charged || []); // 特殊招式原始 id（極巨攻擊要靠它的屬性）
  }
  render();
}).catch(e => {
  console.error('data.json 載入失敗', e);
  $('#loadingState') && $('#loadingState').remove();
  grid.innerHTML = `<div class="state"><b>資料載入失敗</b>（${e.message}）<br>
    請用靜態伺服器開啟，例如 <code>python -m http.server 8600 --directory site</code>；<br>
    直接雙擊 index.html 是開不起來的（fetch 需要 http://）。修正後重新整理頁面即可。</div>`;
});
