/* 寶可夢GO 去留指南 — 主程式（純靜態，無依賴） */
const TYPE_ZH = { normal: '一般', fire: '火', water: '水', electric: '電', grass: '草', ice: '冰', fighting: '格鬥', poison: '毒', ground: '地面', flying: '飛行', psychic: '超能力', bug: '蟲', rock: '岩石', ghost: '幽靈', dragon: '龍', dark: '惡', steel: '鋼', fairy: '妖精' };
const TYPE_BG = { normal: '#928b7e', fire: '#e8743a', water: '#4c8ad1', electric: '#e4c22e', grass: '#5cae57', ice: '#7ecdd6', fighting: '#c24a44', poison: '#9a5b9f', ground: '#c9af5f', flying: '#8aa6de', psychic: '#e0659f', bug: '#96ac39', rock: '#a08c4a', ghost: '#6560a8', dragon: '#4f60c8', dark: '#564f42', steel: '#7a97ab', fairy: '#d98caf' };
const LEAGUE_NAME = { 500: '小小盃', 1500: '超級聯盟', 2500: '高級聯盟', 10000: '大師聯盟' };
const TIER_NAME = ['必留', '建議保留', '看情況', '可傳送'];

let DATA = null, FORMS = [], filtr = { search: '', tier: '', type: '', extra: '', gen: '', sort: 'dex' };
let lastList = []; // render() 留下的「目前篩出型態」——複製名單編號用

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
// 併入 site/js/core.js：Node 建置測試與前端共用同一份 CPM 表／IV 排名實作（唯一定義）。
// ivRank：4096 組合全枚舉、total 固定 4096、半級保留、同分同名次（competition rank）。
const CORE = window.CALC_CORE;
if (!CORE) {
  grid.innerHTML = '<div class="state"><b>核心計算模組載入失敗</b>：js/core.js 引入順序有問題（app.js 前必須先載入 core.js）。</div>';
  throw new Error('CALC_CORE missing');
}
function ivRank(f, ivs, cap) {
  return CORE.ivRank(f, ivs, cap, /_shadow$/.test(f.id));
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
    (f.dmx && (f.dm || f.dmg)) ? 'Max 前 ' + fmt(f.dmx.pct) + '%' : '',
  ].filter(Boolean).join(' · ');
  const isSh = f.id.endsWith('_shadow');
  return `<div class="card" data-id="${CORE.esc(f.id)}" tabindex="0" role="button" aria-label="${CORE.esc(f.zh)}，${CORE.esc(f.verdict.tierName)}">
    <img loading="lazy" decoding="async" src="${spriteOf(f)}" alt="" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f.dex}.png'"${isSh ? ' class="shadowicon"' : ''}>${f.dmg ? '<span class="dmbadge gmax" title="可參加超極巨化戰（Gigantamax）">G·巨</span>' : (f.dm && f.dmx && f.dmx.mode === 'special') ? '<span class="dmbadge" title="Max 特殊參戰者：可參加 Max Battle，但不能 Dynamax（使用專屬 Max 招式）">特</span>' : f.dm ? '<span class="dmbadge" title="可參加極巨戰（Max Battle）">極</span>' : f.megas ? '<span class="dmbadge megab" title="這個物種有超級進化形態">超</span>' : ''}${marks[f.id] ? `<span class="markchip m-${({ '保留': 'keep', '可送': 'maybe', '已送': 'sent' })[marks[f.id]]}" title="我的標記：${CORE.esc(marks[f.id])}">${CORE.esc(marks[f.id])}</span>` : ''}
    <div class="zh">${CORE.esc(f.zh)}</div>
    <div class="en">${CORE.esc(f.en)}</div>
    <div class="row">${f.t.map(typeBadge).join('')}</div>
    <div class="vchip t${f.verdict.tier}">${CORE.esc(f.verdict.tierName)}</div>
    <div class="mini">${mini}</div></div>`;
}

function passFilter(f) {
  const s = filtr.search.toLowerCase();
  if (s) {
    const megaTerm = ['超級進化', '原始回歸', '超級', 'mega'].some(t => filtr.search === t || filtr.search.includes(t)) || /mega|primal/.test(s);
    if (!(f.zh.toLowerCase().includes(s) || f.en.toLowerCase().includes(s) || String(f.dex) === s || f.id.includes(s)
      || (megaTerm && f.megas))) return false;
  }
  if (filtr.tier !== '' && f.verdict.tier !== +filtr.tier) return false;
  if (filtr.type && !f.t.includes(filtr.type)) return false;
  const tags = f.tags || [];
  if (filtr.extra) {
    if (filtr.extra === 'legend' && !(tags.includes('legendary') || tags.includes('mythical') || tags.includes('ultrabeast'))) return false;
    if (filtr.extra === 'mega' && !(f.megas || tags.includes('mega') || tags.includes('supermega'))) return false;
    if (filtr.extra === 'dmax' && !(f.dm && (!f.dmx || f.dmx.mode !== 'special'))) return false; // R16：特殊參戰者不能 Dynamax，不算「可極巨化」
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
  const copyBtn = document.getElementById('copyList');
  if (copyBtn) {
    // 「複製名單編號」只在有篩選時出現（沒篩選＝全量列表，對遊戲搜尋沒意義）
    lastList = list;
    const anyFilter = !!(filtr.tier || filtr.type || filtr.extra || filtr.gen || filtr.search);
    copyBtn.hidden = !(anyFilter && list.length);
  }
  $('#resultCount').textContent = cntLine;
}

/* ---------- 詳細面板 ---------- */
function openDetail(f) {
  current = f;
  const b = bestRank(f);
  const tags = f.tags || [];
  const tagNames = { legendary: '傳說', wildlegendary: '野外傳說', mythical: '幻獸', ultrabeast: '異獸', regional: '區域限定', mega: '超級進化', supermega: '超級進化(X/Y)', shadow: '已暗影', shadoweligible: '物種有暗影版（火箭隊獲取，一般個體不可轉換）', alolan: '阿羅拉', galarian: '伽勒爾', hisuian: '洗翠', paldean: '帕底亞', starter: '御三家', duplicate: '重複型態' };
  if (f.dmg) tagNames.dmg = '超極巨化';
  else if (f.dm) tagNames.dm = (f.dmx && f.dmx.mode === 'special') ? 'Max 特殊參戰（不能 Dynamax）' : '極巨化';
  const rankChips = [500, 1500, 2500, 10000].map(L => f.pvp[L] ? `<span class="rankchip" title="${L === 500 ? 'PvPoke 500 CP 格式總榜（非現行小小盃盃規）；現行小小盃榜見「限制盃／特殊盃賽排名」' : 'PvPoke 評分（模擬值，不同聯盟尺度不同）：' + (f.pvp[L].rating ?? '—')}">${rankName(L)} <b>#${f.pvp[L].r}</b></span>` : '').join('');
  const cupChips = (f.cupR || []).map(c => {
    const cd = (DATA.cups || [])[c[0]];
    return cd ? `<span class="rankchip cupchip" title="${CORE.esc(cd.zh)}（CP 上限 ${cd.cp}，榜單共 ${cd.total} 型態）／資料 ${DATA.cupFetched} 撈取">${CORE.esc(cd.zh)} <b>#${c[1]}</b></span>` : '';
  }).join('');
  const ivRefs = Object.keys(f.iv || {}).map(L => `<div class="ivbox">${LEAGUE_NAME[+L] || ''}<br><b style="font-variant-numeric:tabular-nums">${f.iv[L].slice(1).join('/')}</b><br><span style="font-size:10px">Lv${f.iv[L][0]}</span></div>`).join('') || '<span class="ivref">無資料</span>';
  const fast = (f.fm || []).map(m => `<span class="fast">${CORE.esc(m)}</span>`).join('');
  const charged = (f.cm || []).map(m => `<span class="charged">${CORE.esc(m)}</span>`).join('');
  // Max Battle 槽位（GO 介面名稱：攻擊／極巨防壁／極巨回復）：
  // H03 機制修正：一般極巨攻擊的屬性＝快招屬性（不是蓄力招！用快招招不同快招就打不同
  //   屬性的極巨攻擊）；超極巨化個體的攻擊槽是專屬超極巨招式，屬性固定（dmx.tp 來源：GM VN_BM）
  // R16：Max 參戰能力分類 dmx.mode——'dmax'（一般 D-Max，快招屬性）／'gmax'（超極巨專屬招式）／
  //   'special'（特殊參戰者：蒼響(劍之王)／藏瑪然特(盾之王)／無極汰那——可參戰 Max Battle
  //   但不能 Dynamax，攻擊槽是 Max Battle 專屬招式：Behemoth Blade／Bash（鋼）或 Dynamax Cannon（龍））
  let maxBlock = '';
  if (f.dmx && (f.dm || f.dmg)) {
    const mode = f.dmx.mode; // 'dmax' | 'gmax' | 'special'
    const fixedRow = mode !== 'dmax';
    const gmaxRow = !!f.dmg;
    const specName = f.id === 'eternatus' ? 'Dynamax Cannon' : 'Behemoth Blade／Bash';
    const fixedDesc = gmaxRow ? '專屬超極巨招式（G-Max Move，屬性固定）' : `Max Battle 專屬招式（${specName}，屬性固定）`;
    const atks = fixedRow
      ? `<span class="charged">極巨攻擊〈${TYPE_ZH[f.dmx.tp] || f.dmx.tp || '—'}〉<small>${fixedDesc}</small></span>`
      : (f.fmr || []).map(id => {
          const m = (DATA.moves || {})[id];
          return m && m.t ? `<span class="charged">極巨攻擊〈${TYPE_ZH[m.t] || m.t}〉<small>${CORE.esc(m.n)}（用同屬性快招集能即為此攻擊）</small></span>` : '';
        }).join('');
    const fixedNote = gmaxRow
      ? '超極巨化個體的極巨攻擊＝專屬超極巨招式，屬性固定不隨快招變化；一般極巨化個體才隨快招屬性變化'
      : `Max 特殊參戰者（不能 Dynamax）的極巨攻擊＝Max Battle 專屬招式（${specName}），布置快招不影響屬性`;
    maxBlock = `<div class="maxmoves"><b>極巨戰招式（Max Battle 用）</b>
      <div class="moves">${atks}<span class="charged">極巨防壁<small>替全隊減傷</small></span><span class="charged">極巨回復<small>回復自己與同伴 HP</small></span></div>
      <p class="muted" style="font-size:11px">${fixedRow
        ? fixedNote
        : '一般極巨攻擊的屬性＝<b>快招</b>屬性（配錯快招就打不出想要的屬性，快招可用快招學習器改）'}；快招累積 Max 條後，於極巨階段放招。</p></div>`;
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
          '· <b>只是囤著／背包爆了</b> → 不必急著花費淨化：先比一比「淨化後的普通形態」在你實際用途上是否真的比暗影好用（可用同物種普通形態那張卡的評級幫你比）、以及是否有更好的替代個體；都沒有比較優勢時，這隻<b>也可以直接送</b>，不必花資源淨化。<br>' +
          '· 淨化有實際收益在：個體值各 +2（上限 15）、強化省星塵、招式變成「報恩」且可隨時用招式學習器換掉（暗影招式「遷怒」只能在限定活動期間更換）。淨化是<b>單向</b>的，要花糖果與星塵。</p>'
        : '<p style="margin:0 0 8px"><b>結論：淨化或直接送都可以，別為淨化而淨化</b><br>' +
          '· 這隻以暗影身分出戰的名次本來就低，×1.2 的加成也救不回來——<b>沒有「非留暗影不可」的理由</b>；若是同一個目的（打圖鑑以外的戰力／淨百收藏），直接送掉也合理，不必花糖果星塵去淨化。<br>' +
          '· 真要留著用的（缺進化素材想練普通形態、或差 13/13/13 撞淨百）：淨化才算資源花對——個體值 +2／+2／+2、強化省星塵、招式改「報恩」之後可用招式學習器隨時更換。<br>' +
          '· 淨化是<b>單向</b>的，送走前想清楚。</p>';
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
      '暗影來源固定：只能跟火箭隊的寶可夢戰鬥並捕捉取得，無法由一般個體轉換。<br>' +
      '淨化是<b>單向</b>的；要花糖果與星塵（一般物種約 1 糖＋1000 星塵，實際以遊戲內顯示為準）。' +
      '<br><b>淨百規則：</b>淨化把個體值每項 +2（最高到 15）；原始攻／防／血都 13 以上的個體，淨化後即 15/15/15（淨百）。' +
      '可用下方「IV 排名計算機」輸入暗影個體值，預覽淨化後數值。</div>';
    purifyHtml = `<div class="ivref">${body}${megaLine}${footer}</div>`;
  }

  // 推薦帶法（PvPoke 排行組合＋PvE 估算最佳組合）；chips 包進 .moves 才有分段樣式
  let recHtml = '';
  {
    const nm = id => CORE.esc(((DATA.moves || {})[id] || {}).n || id);
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
    if (lines.length) recHtml = `<div class="ivref" style="margin-top:6px"><b>推薦帶法</b>（PvPoke 排行組合＋PvE 估算最佳組合；實帶以你自己的配置為準）${lines.map(l => `<div style="margin-top:3px">${l}</div>`).join('')}
      <br><span style="font-size:11px;color:var(--muted)">PvE 最佳組合按「中性相性 boss」估——打不同弱點的目標請優先用同屬性蓄力招（見「道館／團體戰輸出估算」的屬性分榜列），別把中性解當唯一最優。</span></div>`;
  }

  // 極巨戰估算（dm/dmg 行）：與普通 PvE 分開衡量
  let dmxHtml = '';
  if (f.dmx && (f.dm || f.dmg)) {
    const atkPct = Math.max(0.1, 100 - f.dmx.pct).toFixed(1).replace(/\.0$/, '');
    dmxHtml = `<details class="fold"><summary>極巨戰（Max Battle）攻擊估算<span class="fdnote">攻手前 ${atkPct}%</span></summary><div class="foldbody"><table class="stats">
      <tr><td>極巨攻擊屬性</td><td>${TYPE_ZH[f.dmx.tp] ? typeBadge(f.dmx.tp) : (f.dmx.tp || '—')}${f.dmg ? '（專屬超極巨招式，固定不變）' : (f.dmx.mode === 'special' ? `（Max Battle 專屬招式 ${f.id === 'eternatus' ? 'Dynamax Cannon' : 'Behemoth Blade／Bash'}，固定不變）` : (f.dmx.mode === 'gmax' ? '（專屬 Max 招式，固定不變）' : '（＝快招屬性，換快招即換屬性）'))}</td></tr>
      <tr><td>極巨攻擊循環 DPS 估算</td><td>${f.dmx.dps}</td></tr>
      <tr><td>攻手池百分位</td><td>排行前 <b>${atkPct}%</b>（可極巨化型態內）</td></tr></table>
      <div class="ivref" style="margin-top:6px">Max Battle 只有極巨化／超極巨化個體能出戰，輸出以極巨攻擊為主。估算假設（揭露式的相對指標，不是實測模擬）：<br>
      · 極巨攻擊威力隨技能等級：一般 L1/2/3＝250/300/350、超極巨招式＝350/400/450（Max+ 再 +100）——本估算取 L3（350/450）為尺度；<br>
      · Max 條以快招命中累積（快招較有效率），模型假設「滿條 ≈ 25 次快招命中＋極巨招施放 2.5 秒」（GO GM 極巨招式模板 duration 一律 2500ms）；<br>
      · 這個排名同池比較「攻擊體質 × 屬性 STAB × 快招集條速度」；要撐完整場也參考有效體質。<br>
      ${f.dmg ? '· 超極巨化個體攻擊槽是專屬招式，威力天生比一般極巨攻擊高一階（同技能等級下）。目標相性由專屬屬性決定，不隨快招。' : ''}</div></div></details>`;
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
    <h2>${CORE.esc(f.zh)}</h2><div class="en">${CORE.esc(f.en)} · #${f.dex}</div>
    <img class="sprite${f.id.endsWith('_shadow') ? ' shadowicon' : ''}" src="${spriteOf(f)}" alt="${CORE.esc(f.zh)} 的遊戲內圖示" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f.dex}.png'">
    <div class="vchip t${f.verdict.tier}" style="width:100%;display:block">${CORE.esc(f.verdict.tierName)}</div>

    ${fold(true, '判定理由', null, `<ul class="why">${f.verdict.why.map(w => `<li>${CORE.esc(w)}</li>`).join('')}</ul>`)}

    ${fold(true, '接下來該做什麼', null, nextHtml)}

    ${tags.includes('shadow') ? fold(true, '淨化建議', null, purifyHtml) : ''}

    ${f.megas ? fold(false, '超級進化／原始回歸型態', f.megas.length + ' 種', `<div class="megalist">${f.megas.map(m => `
      <div class="megabox"><img class="megasprite" src="${UICONS}${m.icon}" alt="${CORE.esc(m.zlabel)}" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f.dex}.png'">
        <div><b>${CORE.esc(m.zlabel)}</b>・建議 IV／糖果需求比照一般進化<br>
        種族值 ${m.a}/${m.d}/${m.h} · ${m.t.map(typeBadge).join('')}<br>
        ${m.pve ? `PvE 估算：循環 DPS ${m.pve.dps}／強度前 ${(100 - m.pve.pct).toFixed(1)}%` : '無招式估算'}
        <br><span style="color:var(--muted);font-size:11px">超級進化型態無法參加聯盟對戰</span></div></div>`).join('')}</div>`) : ''}

    ${fold(false, '對戰排名（PvPoke）', b ? (b.r <= 500 ? rankName(b.L) + ' #' + b.r : '聯盟榜後段') : '無名次', `<div class="chips">${rankChips || '未進入各聯賽排名'}</div>`)}

    ${fold(false, '限制盃／特殊盃賽排名', (f.cupR && f.cupR.length) ? f.cupR.length + ' 項上榜' : '未上榜', `<div class="ivref" style="margin-bottom:8px">剛入坑可先<b>忽略這區</b>——這些是限定的活動賽制，看上面的普通聯盟名次就夠了。</div><div class="chips">${cupChips || '<span class="ivref">未進入任何現行盃賽榜單</span>'}</div>
      <p class="muted" style="font-size:11px;margin:6px 0 0">榜單隨季度輪替，抓取日 ${DATA.cupFetched || '—'}</p>`)}

    ${fold(false, '道館／團體戰輸出估算（PvE）', f.pve ? '強度前 ' + (100 - f.pve.pct).toFixed(1).replace(/\.0$/, '') + '%' : null,
      (f.pve ? `<table class="stats">
        <tr><td>循環 DPS 估算</td><td>${f.pve.dps}${f.pve.c ? '＝' + CORE.esc(((DATA.moves || {})[f.pve.f] || {}).n || f.pve.f) + '＋' + CORE.esc(((DATA.moves || {})[f.pve.c] || {}).n || f.pve.c) : '（純快招）'}</td></tr>
        <tr><td>強度百分位</td><td>前 ${(100 - f.pve.pct).toFixed(1)}%（全物種單榜，不分屬性）</td></tr>
        ${Object.entries(f.pve.tp || {}).slice(0, 10).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, p]) =>
          `<tr><td>${TYPE_ZH[t] || t}類蓄力招對應版</td><td>該屬性分榜前 ${Math.max(0.1, 100 - p).toFixed(1).replace(/\.0$/, '')}%——${p >= 97 ? '<b>單屬性頂尖</b>' : '缺該屬性打手時有用'}</td></tr>`).join('')}
      </table>
      <div class="ivref" style="margin-top:6px">怎麼讀這區？<br>
        · 全物種單榜按「打得動一般 boss（中性相性）」比較；你實際對上的 boss 弱點不同，直上<b>屬性分榜</b>列（有就顯示）——單屬性絕活打手在全榜常被低估。<br>
        · 組合與 DPS 是<b>中性相性、長期循環</b>的估算（每次招式能量集滿即發、餘能滾存）；實戰會因 boss 屬性、招式施放時機而變。<br>
        · <b>糖果便宜的物種</b>：隨便挑一隻等級高的練上去就好——一般相性下每點攻 IV 只有 ±0.4% 左右的 DPS，不用為了挑 IV 傷腦筋。<br>
        · <b>糖果昂貴的物種（傳說、稀有的區域限定）</b>：先留「等級最高／星數最多」那隻，起點高最省糖；<b>等級相同</b>才用 IV 挑。<br>
        · IV 取捨要看斷點：攻 IV 滿不滿多半不影響 DPS 名次，但<b>個別對局會有傷害斷點</b>（多一下打斷線）；防／血 IV 影響「能挨幾下」——在會改變挨打次數的對局裡（坦克位、高等級 boss 戰），14/15/15 這類高品質個體值得留，別一律挑攻防血滿以外的送。<br>
        · <b>瓶蓋訓練（2025-06 起）</b>：銀色瓶蓋可練單一項 IV、金色瓶蓋練全部——要 Good Buddy 等級以上、暗影得先淨化、365 天內完成任務。成本不低，別拿來補「反正影響座位不大的同一階個體」。</div>` : '無招式資料'))}

    ${dmxHtml ? dmxHtml : ''}

    ${fold(false, '建議對戰個體值（rank 1 參考）', null, `<div class="ivref" style="margin-bottom:8px"><b>為什麼排名 1 的 IV 常是「攻低」？</b>對戰有 CP 上限：攻擊愈低，同一隻能升到的等級愈高、愈耐打——<b>3/14/12 不是差，是這隻在該聯盟裡最耐打的黃金組合</b>。<br>
      遊戲內看 IV：打開寶可夢 →「查看／評價」→ 三條評價條（滑桿樣式）＋上方星級，對應攻／防／血。</div><div class="ivlines">${ivRefs}</div>
      <div class="ivref" style="margin-top:6px">格式＝攻/防/血，例如 15/15/15。輸入你的個體值就能算排名 ↓</div>`)}

    ${fold(false, 'IV 排名計算機', null,
      `<div class="ivref" style="margin-bottom:8px">IV＝個體值（每項 0–15、天生固定；只有淨化 +2 或瓶蓋訓練可補）。遊戲內怎麼看：見上一區的說明。</div>
      <div class="ivfields">
        <label class="ivfield"><span>攻擊</span><input id="ivA" type="number" min="0" max="15" value="15" aria-label="攻擊個體值 0 到 15"></label>
        <label class="ivfield"><span>防禦</span><input id="ivD" type="number" min="0" max="15" value="15" aria-label="防禦個體值 0 到 15"></label>
        <label class="ivfield"><span>血量（耐力）</span><input id="ivH" type="number" min="0" max="15" value="15" aria-label="耐力（血量）個體值 0 到 15"></label>
        <label class="ivfield ivleague"><span>聯盟上限</span><select id="ivLeague" aria-label="聯盟上限">${[500, 1500, 2500, 10000].map(L => `<option value="${L}" ${L == 1500 ? 'selected' : ''}>${L === 500 ? 'CP500 格式總榜' : LEAGUE_NAME[L]}</option>`).join('')}${[...new Set(((DATA && DATA.cups) || []).map(c => c.cp))].filter(cp => ![500, 1500, 2500, 10000].includes(cp)).sort((x, y) => x - y).map(cp => `<option value="${cp}">${capName(cp)}（特殊盃）</option>`).join('')}</select></label>
      </div>
      <div class="ivref" style="margin-bottom:8px"><b>注意</b>：選「CP500」算的是 500 CP <b>格式總榜</b>（PvPoke 模擬的格式排名），<b>不是</b>現行小小盃盃規；現行小小盃的熱門人選請看「限制盃／特殊盃賽排名」。另外：這臺計算機衡量「<b>你手上這隻個體</b>」的相對體質，本站四級評級衡量的是「<b>這個物種／型態是否值得留</b>」——兩者是不同層級的問題，物種不值得留的話個體再漂亮也不用糾結。</div>
      <button id="ivGo">計算排名</button>
      <div id="ivResult"></div>`)}

    ${fold(false, '種族值＆上限', null, `<table class="stats">
      <tr><td>種族值（天生固定，非個體值）攻/防/血</td><td>${f.a} / ${f.d} / ${f.h}</td></tr>
      <tr><td>最高 CP（Lv50 滿個體）</td><td>${f.cp50}</td></tr>
      ${(f.bulkPct >= 85) ? `<tr><td>守館體質</td><td>有效體質（HP×DEF）排行前 <b>${(100 - f.bulkPct).toFixed(1).replace(/\.0$/, '')}%</b>——能占守道館較久；但守館收益本來就低（金幣有上限／被淘汰就結束），只當參考指標</td></tr>` : ''}
      <tr><td>標籤</td><td>${CORE.esc(tags.map(t => tagNames[t] || t).concat(f.dmg ? ['超極巨化'] : f.dm ? [(f.dmx && f.dmx.mode === 'special') ? 'Max 特殊參戰（不能 Dynamax）' : '極巨化'] : []).join('、')) || '一般'}</td></tr>
      ${f.li ? '<tr><td></td><td>⚠ 超級聯盟禁入（PvPoke 列此形態在超級聯盟對戰不可使用，因此榜單不會有它的超級聯盟名次；其他聯盟不受影響）</td></tr>' : ''}
    </table>`)}

    ${fold(true, '招式與推薦帶法', null, `<div class="moves">${fast}${charged}</div>${recHtml}${maxBlock}`)}

    <section><h3>我的收藏</h3>
      <button class="markBtn" id="markBtn">${marks[f.id] ? '✓ 已標記：' + marks[f.id] + '（再點一次取消）' : '標記這隻（點擊循環：保留 → 可送 → 已送）'}</button>
      <p class="muted" style="font-size:11px;margin:6px 0 0">標記只到<b>型態</b>粒度（同型態的多隻不同個體無法分開記），且只存你自己的瀏覽器（localStorage）——換裝置或清除瀏覽資料前先用下方按鈕備份。</p>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="marksExport">備份我的標記</button>
        <button id="marksImportBtn">匯入備份</button>
        <input id="marksImport" type="file" accept="application/json,.json" hidden aria-label="選擇標記備份檔匯入">
      </div>
    </section>`;
  $('#detail').classList.remove('hidden');
  // 焦點管理：進面板把焦點交給關閉鈕（preventScroll 避免页面跳動）；關掉時焦點歸位原卡片
  lastFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card') ? document.activeElement : null;
  const cd = $('#closeDetail');
  cd.onclick = closeDetail;
  cd.focus({ preventScroll: true });
  $('#ivGo').onclick = runIvCalc;
  $('#marksExport').onclick = () => {
    const blob = new Blob([JSON.stringify(marks, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pogo_marks_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已下載標記備份——存好這個檔案就能在別的瀏覽器匯入');
  };
  $('#marksImportBtn').onclick = () => $('#marksImport').click();
  $('#marksImport').onchange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const v = JSON.parse(String(reader.result));
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('格式錯誤');
        let n = 0, skip = 0;
        const valid = { '保留': 1, '可送': 1, '已送': 1 };
        for (const [k, w] of Object.entries(v)) {
          if (!valid[w]) { skip++; continue; }               // 只收合法標記值
          if (!FORMS.some(g => g.id === k)) { skip++; continue; } // 只收名單內的型態 id
          marks[k] = w; n++;
        }
        saveMarks(); render();
        toast('匯入完成：' + n + ' 筆標記' + (skip ? '（略過 ' + skip + ' 筆不明／無效項）' : ''));
      } catch (err) { toast('匯入失敗：檔案不是有效的標記備份（' + err.message + '）'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  $('#markBtn').onclick = () => {
    const cur = marks[f.id];
    if (!cur) marks[f.id] = '保留';
    else if (cur === '保留') marks[f.id] = '可送';
    else if (cur === '可送') marks[f.id] = '已送';
    else delete marks[f.id];
    saveMarks();
    // 保全面板狀態：標記重建面板時，IV 計算機輸入與折疊開合不歸零
    const $id = id => document.getElementById(id);
    const keep = { a: $id('ivA') && $id('ivA').value, d: $id('ivD') && $id('ivD').value,
      h: $id('ivH') && $id('ivH').value, lg: $id('ivLeague') && $id('ivLeague').value,
      folds: [...document.querySelectorAll('#detail details.fold')].map(d => d.open) };
    render(); openDetail(f); // render 讓卡片角章與統計行即時更新
    if (keep.a !== null && $id('ivA')) {
      $id('ivA').value = keep.a; $id('ivD').value = keep.d; $id('ivH').value = keep.h;
      if (keep.lg) $id('ivLeague').value = keep.lg;
      [...document.querySelectorAll('#detail details.fold')].forEach((d, i) => { if (i < keep.folds.length) d.open = keep.folds[i]; });
      runIvCalc(); // 回填後重跑，結果與輸入一致
    }
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
      ? `物種在${cap === 500 ? '500 格式總榜' : capName(cap)}排行第 <b>${spRank}</b> 名（IV 排名是 #${r.rank}/${r.total}）`
      : `物種未進入${cap === 500 ? '500 格式總榜' : capName(cap)}排行榜＋IV 排名是 #${r.rank}/${r.total}`;
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

/* ---------- 回到最上方 ---------- */
const toTop = document.getElementById('toTop');
window.addEventListener('scroll', () => {
  if (!toTop) return;
  const show = window.scrollY > 600;
  toTop.hidden = false; // CSS 以 opacity 過場；hidden 只在初始佔位前隱藏
  toTop.classList.toggle('show', show);
}, { passive: true });
if (toTop) {
  toTop.addEventListener('click', () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  });
}

/* ---------- Toast ＋ 複製名單編號 ---------- */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
// 複製目前篩出的型態 → 遊戲收藏搜尋字串（core.js searchPlan 同一實作）：
// 純數字＝圖鑑編號、連續編號壓成 a-b、逗號＝OR；全部同類（暗影／極巨化）時補形態限定詞
// &shadow／&dynamax；同編號混有不同形態時強制跳出警告（遊戲搜尋會一次選中同編號全部形態，
// H07：不得直接全選傳送）
$('#copyList').addEventListener('click', () => {
  // R03：搜尋字串的形態風險檢查要對照「整個資料庫」，不能只看目前篩出的名單——
  // 同編號名單外的保留個體（暗影／極巨化／一般形態）也會被編號搜尋一起選中
  // R18：Max 參戰能力分類 mx（'dmax'|'gmax'|'special'）——dynamax 只查 D-Max、
  // gigantamax 只查 G-Max、特殊參戰者兩個關鍵字都不適用 → 由 searchPlan 決定限定詞與警告
  const mxOf = f => f.dmg ? 'gmax' : f.dm ? ((f.dmx && f.dmx.mode === 'special') ? 'special' : 'dmax') : null;
  const dbRows = FORMS.map(f => ({
    dex: f.dex, id: f.id, keep: f.verdict.tier < 3,
    shadow: /_shadow$/.test(f.id), mx: mxOf(f),
  }));
  const plan = CORE.searchPlan(lastList.map(f => ({ dex: f.dex, id: f.id, shadow: /_shadow$/.test(f.id), mx: mxOf(f) })), dbRows);
  const s = plan.text;
  const copyText = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(s)
    : new Promise((res, rej) => {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(new Error('execCommand')); } catch (e) { rej(e); }
      ta.remove();
    });
  copyText.then(() => {
    const n = [...new Set(lastList.map(f => f.dex))].length;
    let msg = `已複製 ${n} 個編號——貼進遊戲收藏的搜尋列即可一次篩出`;
    if (plan.qualified === 'shadow') msg += '（已補 &shadow：只選中暗影個體）';
    else if (plan.qualified === 'dynamax') msg += '（已補 &dynamax：只選中一般可極巨化個體；超極巨化要用 &gigantamax）';
    else if (plan.qualified === 'gigantamax') msg += '（已補 &gigantamax：只選中超極巨化個體）';
    if (plan.warning) msg += '\n⚠ ' + plan.warning;
    toast(msg);
    // H07：名單內同一個編號混有不同形態 → 遊戲搜尋無法用編號區分暗影／極巨化／一般，
    // 直接全選傳送會把要留的那隻一起送掉 → 必須強擋警告
    showMixWarn(plan);
  })
    .catch(() => toast('複製失敗：瀏覽器不允許存取剪貼簿'));
});
// 混形態警告視窗
let lastMixFocus = null;
function showMixWarn(plan) {
  const modal = document.getElementById('mixWarn');
  if (!modal) return;
  const body = document.getElementById('mixWarnBody');
  const mixed = plan.mixedDexes || [];
  if (!mixed.length && !plan.warning) { modal.classList.add('hidden'); return; } // R18：純警告也可顯示
  const warningHtml = plan.warning ? `<p style="margin-top:8px">⚠ ${CORE.esc(plan.warning)}</p>` : '';
  if (!mixed.length) {
    body.innerHTML = `<p>這份名單<b>無法用單一搜尋字串可靠表示</b>——遊戲的 <code>dynamax</code> 只查 D-Max、<code>gigantamax</code> 只查 G-Max，特殊 Max 參戰者兩者都不適用。</p>${warningHtml}<p style="margin-top:8px"><b>請逐隻挑選後再操作。</b></p>`;
    modal.classList.remove('hidden');
    lastMixFocus = (document.activeElement && !modal.contains(document.activeElement)) ? document.activeElement : lastMixFocus;
    const closeBtn = document.getElementById('mixWarnClose');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    return;
  }
  // 名單內的 zh 名稱（問題編號列出的是名單內形態）
  const byDex = {};
  lastList.forEach(f => { (byDex[f.dex] ||= []).push(f); });
  // R03：名單外的保留個體（會被編號搜尋一起選中的）——從 FORMS 補形態名稱
  const hiddenKeep = {};
  for (const d of mixed) {
    const listed = new Set((byDex[d] || []).map(f => f.id));
    const others = FORMS.filter(f => f.dex === d && !listed.has(f.id) && f.verdict.tier < 3);
    hiddenKeep[d] = others.map(f => f.zh).filter(Boolean); // zh 已含形態字樣（如「暗影」「極巨化」）
  }
  const anyHidden = Object.values(hiddenKeep).some(a => a.length);
  const rows = mixed.map(d => {
    const inList = [...new Set((byDex[d] || []).map(f => f.zh))];
    const keep = (hiddenKeep[d] || []).filter(z => !inList.includes(z));
    const keepHtml = keep.length ? `<br><small>名單外的保留個體（也會被一起選中）：${keep.map(CORE.esc).join('、')}</small>` : '';
    return `<tr><td>#${d}</td><td>${inList.map(CORE.esc).join('、')}${keepHtml}</td></tr>`;
  }).join('');
  body.innerHTML = `<p><b>這份名單裡有 ${mixed.length} 個圖鑑編號混合了不同形態</b>——遊戲的搜尋會一次選中該編號的<b>全部符合限定詞的形態</b>（暗影／極巨化／一般個體無法用編號區分），直接全選傳送<b>會把要留的也送掉</b>。</p>
    <table class="stats" style="width:100%">${rows}</table>
    <p style="margin-top:8px">正確做法：在遊戲收藏搜尋列<b>先加限定詞</b>（暗影加 <code>&amp;shadow</code>、一般可極巨化個體加 <code>&amp;dynamax</code>、超極巨化個體加 <code>&amp;gigantamax</code>——<code>dynamax</code> 只查 D-Max、<code>gigantamax</code> 只查 G-Max），或逐隻挑選後再傳送。<b>不要只用編號全選。</b></p>${warningHtml}`;
  modal.classList.remove('hidden');
  // R11：先存還原目標、再移動焦點（先 focus 會把 activeElement 變成 closeBtn、還原目標就丟了）
  lastMixFocus = (document.activeElement && !modal.contains(document.activeElement)) ? document.activeElement : lastMixFocus;
  const closeBtn = document.getElementById('mixWarnClose');
  if (closeBtn) closeBtn.focus({ preventScroll: true });
}
{
  const modal = document.getElementById('mixWarn');
  if (modal) {
    const close = () => { modal.classList.add('hidden'); if (lastMixFocus) { lastMixFocus.focus({ preventScroll: true }); lastMixFocus = null; } };
    document.getElementById('mixWarnClose').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    // R11：Esc 在 modal 開啟時只關 modal——攔截傳播，避免同時觸發底層詳情面板的關閉
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) { e.stopImmediatePropagation(); close(); } });
  }
}
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
  if (!card) {
    // 點格子的空白處＝關詳細面板（空白要「點旁邊就關」，不是無反應）
    if (!$('#detail').classList.contains('hidden')) closeDetail();
    return;
  }
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
fetch('data/data.json?v=22b9822333').then(r => {
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
    f.cmr = (d.movesFor && d.movesFor[f.id]?.charged || []); // 特殊招式原始 id
    f.fmr = (d.movesFor && d.movesFor[f.id]?.fast || []);    // 快招原始 id（H03：極巨攻擊屬性要看快招）
  }
  render();
}).catch(e => {
  console.error('data.json 載入失敗', e);
  $('#loadingState') && $('#loadingState').remove();
  grid.innerHTML = `<div class="state"><b>資料載入失敗</b>（${e.message}）<br>
    請用靜態伺服器開啟，例如 <code>python -m http.server 8600 --directory site</code>；<br>
    直接雙擊 index.html 是開不起來的（fetch 需要 http://）。修正後重新整理頁面即可。</div>`;
});
