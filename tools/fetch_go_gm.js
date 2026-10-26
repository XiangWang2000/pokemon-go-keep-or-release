/*
 * fetch_go_gm.js — 下載 PokéMiners latest GAME_MASTER，抽出兩份小資料：
 *   1. PvE 招式數據（Vxxxx_MOVE_X.moveSettings：power/durationMs/energyDelta）
 *   2. 進化方向（pokemonSettings.evolutionBranch：物種 → 下游進化清單）
 * 輸出 data/go_gm.json（小檔），原始 19MB 大檔不保存。
 * 用法：node tools/fetch_go_gm.js
 */
const fs = require('fs');

(async () => {
  console.log('下載 PokéMiners latest.json …');
  const res = await fetch('https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json');
  if (!res.ok) { console.error('下載失敗 HTTP', res.status); process.exit(1); }
  const raw = JSON.parse(await res.text());
  console.log('GM entries:', raw.length);

  // ---- 1. PvE 招式 ----
  const moves = {};
  for (const e of raw) {
    const tId = e.templateId;
    if (!/^V\d+_MOVE_[A-Z]/.test(tId || '')) continue;
    const s = e.data && e.data.moveSettings;
    if (!s || !s.movementId) continue;
    // movementId 清洗：GO 的快招模板帶 _FAST 後綴（BULLET_SEED_FAST），PvPoke id 無後綴 → 統一去掉
    const moveKey = String(s.movementId).replace(/_FAST$/, '');
    const prev = moves[moveKey];
    // 同 movementId 可能有多個 template（歷史數值不同）→ 保留 trainerLevelMax 較新的
    if (prev && (prev.lvlMax || 0) > (s.trainerLevelMax || 0)) continue;
    moves[moveKey] = {
      type: (s.pokemonType || '').replace('POKEMON_TYPE_', '').toLowerCase(),
      power: s.power || 0,
      durationMs: s.durationMs,
      energyDelta: s.energyDelta,
      lvlMax: s.trainerLevelMax || 0,
    };
  }
  // 移除內部輔助欄位
  for (const k of Object.keys(moves)) delete moves[k].lvlMax;
  // ---- 2. 進化方向（PvE 模板同族的 Vxxxx_POKEMON_X） ----
  // GO GM 的 evolutionBranch 分支型目標記在 `form` 欄位（如 evolution=RATICATE, form=RATICATE_ALOLA），
  // 且 form 模板的 key 自帶形態（V0052_POKEMON_MEOWTH_GALARIAN）——兩層都要接住，
  // 否則區域形態的進化線會被「過度合併進基礎種」或整條丟失（曾導致 41 行進化資訊誤刪）。
  // GO→PvPoke 後綴命名差異：GO 是 ALOLA，PvPoke 是 alolan。
  const GO_FORM_MAP = { ALOLA: 'alolan', GALARIAN: 'galarian', HISUIAN: 'hisuian', PALDEA: 'paldean', PALDEAN: 'paldean' };
  const evo = {};
  for (const e of raw) {
    const m = (e.templateId || '').match(/^V\d+_POKEMON_([A-Z_]+)/);
    if (!m) continue;
    const s = e.data && e.data.pokemonSettings;
    if (!s || !s.evolutionBranch) continue;
    const base = (s.pokemonId || m[1]).toLowerCase();
    // self key：基礎種＝base 名；形態種＝base + 後綴（MEOWTH_GALARIAN → meowth_galarian）
    let f = String(s.form || m[1]).toUpperCase();
    if (f.startsWith(base.toUpperCase() + '_')) f = f.slice(base.length + 1);
    if (f.toLowerCase() === base) f = ''; // 無 pokemonId 的形態模板安全網：視為基礎種
    if (f === 'NORMAL') f = '';           // GO 的 baseline 模板自帶 form=NORMAL → 就是基礎種
    const selfSuffix = GO_FORM_MAP[f] || f.toLowerCase();
    const self = base + (selfSuffix && f ? '_' + selfSuffix : '');
    // 目標：evolution(+form)；枝的 form 可能自帶 evolution 名前綴（RATICATE_ALOLA）
    const evolutions = s.evolutionBranch.map(b => {
      const ev = String(b.evolution || '').toUpperCase();
      if (!ev) return '';
      let bf = String(b.form || '').toUpperCase();
      if (bf.startsWith(ev + '_')) bf = bf.slice(ev.length + 1);
      if (bf === 'NORMAL') bf = '';       // 基礎形態進化不加後綴
      const tSuffix = bf ? (GO_FORM_MAP[bf] || bf.toLowerCase()) : '';
      return ev.toLowerCase() + (tSuffix ? '_' + tSuffix : '');
    }).filter(Boolean);
    if (evolutions.length) {
      // 同物種多個 form template（costume 等）合併去重
      evo[self] = [...new Set((evo[self] || []).concat(evolutions))];
    }
  }

  const out = { moves, evo };
  fs.writeFileSync('data/go_gm.json', JSON.stringify(out));
  const hasFrenzy = moves.FRENZY_PLANT;
  console.log('PvE 招式:', Object.keys(moves).length,
    'FRENZY_PLANT:', JSON.stringify(hasFrenzy));
  console.log('進化關係:', Object.keys(evo).length, '物種');
  console.log('少量抽樣:', Object.entries(evo).filter(([k]) => ['honedge', 'doublade', 'poltchageist', 'shellos'].includes(k)).map(([k, v]) => k + '→' + v).join(' | '));
})().catch(e => { console.error(e.message); process.exit(1); });
