/*
 * core.js — 核心計算與共用工具（Node ↔ 瀏覽器共用，唯一定義）
 * - CPM 表與 cpmOf、FC/PvP IV 排名（evalIv / ivRank）
 * - PvE 循環 DPS（能量以「每招一次」計算＋餘能滾存）
 * - 極巨攻擊（Max Attack）估算模型
 * - 複製遊戲搜尋字串生成（形態限定詞＋混形態風險偵測）
 * - HTML 文字跳脫
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CALC_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 正規半級 CPM 表（GO GameMaster cpMultiplier；與 PvPoke Pokemon.js 相同） ---------- */
  var CPM_TABLE = [
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
    var i = Math.round(level * 2) - 2;
    return CPM_TABLE[Math.max(0, Math.min(CPM_TABLE.length - 1, i))];
  }

  /* ---------- CP / 戰鬥體積 ---------- */
  // CP 不含暗影倍率（暗影 ×1.2 攻／×0.8333 防只影響戰鬥數值）
  function cpAt(form, ivs, level) {
    var c = cpmOf(level);
    var A = form.a + ivs[0];
    var D = form.d + ivs[1];
    var H = form.h + ivs[2];
    return Math.floor(A * Math.sqrt(D) * Math.sqrt(H) * c * c / 10);
  }
  // 給定 IV、聯盟上限 → 最佳等級、CP、戰鬥有效體質乘積（暗影攻×1.2／防×0.8333；HP 取整）
  function evalIv(form, ivs, cap, shadow) {
    var best = null;
    for (var l = 1; l <= 50; l += 0.5) {
      var c = cpmOf(l);
      var cp = cpAt(form, ivs, l);
      if (cp > cap) break;
      var A = (form.a + ivs[0]) * (shadow ? 1.2 : 1) * c;
      var D = (form.d + ivs[1]) * (shadow ? 0.8333333 : 1) * c;
      var H = Math.floor((form.h + ivs[2]) * c);
      var product = A * D * H;
      if (!best || product > best.product) best = { level: l, cp: cp, product: product };
    }
    return best;
  }
  // IV 排名：4096 組合全枚舉；名次＝戰鬥體積乘積嚴格比我高者數＋1（同分同名次＝competition rank）
  // total 固定 4096（聯盟上限內所有組合皆可達；半級不丟失）
  function ivRank(form, ivs, cap, shadow) {
    var mine = evalIv(form, ivs, cap, shadow);
    if (!mine) return null;
    var greater = 0, feasible = 0;
    var prods = [];
    for (var a = 0; a <= 15; a++) for (var d = 0; d <= 15; d++) for (var h = 0; h <= 15; h++) {
      var e = evalIv(form, [a, d, h], cap, shadow);
      if (!e) continue;
      feasible++;
      if (e.product > mine.product) greater++;
      prods.push(e.product);
    }
    return {
      level: mine.level, cp: mine.cp, product: mine.product,
      rank: greater + 1,
      total: 4096,
      feasible: feasible,
      pct: +((greater + 1) / 4096 * 100).toFixed(1)
    };
  }

  /* ---------- PvE 循環 DPS（能量修正模型） ---------- */
  // fast／charged：{power, durSec, energy}——PvE 能量「每一招一次」（fast 為正集能、charged 為負消耗）
  // 模型：蓄力招能量集滿即發，餘能滾存到下一輪；以長期（64 輪模擬）平均循環 DPS 表示，
  //       與 GO Hub／PvPoke 的 cycle-damage 方法一致，可手算驗證。
  // fStab／cStab：各招式的 STAB 倍率（1.2／1.0）
  function pveCycle(fast, charged, fStab, cStab) {
    var egu = fast.energy, cost = -charged.energy;
    if (!egu || egu <= 0 || !cost || cost <= 0) return null;
    var fP = fast.power * fStab, cP = charged.power * cStab;
    var totalN = 0, totalTime = 0, carry = 0;
    for (var i = 0; i < 64; i++) {
      var need = Math.max(0, cost - carry);
      var n = Math.ceil(need / egu);
      carry = carry + n * egu - cost;
      totalN += n;
      totalTime += n * fast.durSec + charged.durSec;
    }
    var dmg = totalN * fP + 64 * cP;
    return dmg / totalTime;
  }

  /* ---------- 極巨攻擊（Max Attack）估算 ---------- */
  // 機制（2026-11 來源：Niantic 官方說明 + Bulbapedia Max Move (GO) 表）：
  // - 一般極巨攻擊屬性＝快招屬性；G-Max 專屬招式固定屬性（每物種一招）
  // - 極巨招式威力隨等級：一般 L1/2/MAX!=250/300/350（Max+ 450）；G-Max 350/400/450（Max+ 550）
  // - 極巨條由快招／蓄力招命中累積（快招較有效率）；估算法：以「每次快招命中集能速度相同」為
  //   假設 → 每次滿條所需快招次數為共用常數 HITS_PER_METER，只有快招快慢影響集條時間。
  //   HITS_PER_METER 是相對尺度常數，不改變池內相對排名（所有物種同值）。
  var MAX_ATK_DUR_SEC = 2.5;   // 極巨攻擊施放時間（GM：VN_BM 模板 durationMs=2500）
  var HITS_PER_METER = 25;    // 假設常數：滿一條極巨條 ≈ 25 次快招命中
  function maxRate(input) {
    // input: { atkStat, power, multiplier (STAB×屬性倍率), fastDurSec }
    return input.power * (input.multiplier || 1) * input.atkStat / 70 /
      (HITS_PER_METER * input.fastDurSec + MAX_ATK_DUR_SEC);
  }

  /* ---------- 複製遊戲搜尋字串 ---------- */
  // rows：篩選出的型態 [{dex, shadow(bool), max(bool)}]（純資料，無 DOM）
  // 回傳 { text, qualified('shadow'|'dynamax'|null), mixedDexes:[], tooLong }
  // - 形態限定詞：全部暗影行 → 每段補 &shadow（只選中暗影個體）；全部可極巨行 → &dynamax
  // - mixedDexes：同圖鑑號在名單內含「形態不同」的行——遊戲搜尋會一次選中同號全部形態
  //   （暗影／極巨化／一般個體無法用編號區分），呼叫端必須對這些號碼提出「不可直接全選傳送」警告
  function searchPlan(rows) {
    var dexes = [];
    var seen = {};
    var allShadow = true, allMax = true;
    var groups = {}; // dex -> Set(class) class = 'shadow'|'max'|'normal'
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!seen[r.dex]) { seen[r.dex] = true; dexes.push(r.dex); }
      var cls = r.shadow ? 'shadow' : (r.max ? 'max' : 'normal');
      if (cls !== 'shadow') allShadow = false;
      if (cls !== 'max') allMax = false;
      (groups[r.dex] = groups[r.dex] || {})[cls] = true;
    }
    dexes.sort(function (a, b) { return a - b; });
    var parts = [];
    for (var j = 0; j < dexes.length;) {
      var k = j;
      while (k + 1 < dexes.length && dexes[k + 1] === dexes[k] + 1) k++;
      var seg = dexes[j] === dexes[k] ? String(dexes[j])
        : (dexes[j] + 1 === dexes[k] ? dexes[j] + ',' + dexes[k] : dexes[j] + '-' + dexes[k]);
      if (allShadow) seg += '&shadow';
      else if (allMax) seg += '&dynamax';
      parts.push(seg);
      j = k + 1;
    }
    var text = parts.join(',');
    var mixedDexes = [];
    for (var m = 0; m < dexes.length; m++) {
      var g = groups[dexes[m]];
      if (Object.keys(g).length > 1) mixedDexes.push(dexes[m]); // 名單內同號不同形態
    }
    return {
      text: text,
      qualified: allShadow ? 'shadow' : (allMax ? 'dynamax' : null),
      mixedDexes: mixedDexes,
      tooLong: text.length > 900,
    };
  }

  /* ---------- 文字跳脫（資料值一律跳脫後才進 innerHTML） ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    CPM_TABLE: CPM_TABLE, cpmOf: cpmOf, cpAt: cpAt, evalIv: evalIv, ivRank: ivRank,
    pveCycle: pveCycle, maxRate: maxRate, searchPlan: searchPlan, esc: esc,
    MAX_ATK_DUR_SEC: MAX_ATK_DUR_SEC, HITS_PER_METER: HITS_PER_METER,
  };
});
