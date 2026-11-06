# 開發說明（給想改資料／重跑建置的人）

本專案是一條「抓取原始資料 → 建置 → 稽核」的管線，產出純靜態網站（`site/`）。
這份文件記錄管線的所有細節；使用網站不需要看這裡（README 就夠了）。

## 本機執行網站

```powershell
# 靜態伺服器任選（fetch 要走 http://，直接雙擊 file:// 會叫不到資料）
python -m http.server 8600 --directory site
# 然後開 http://localhost:8600/
```

**改到 `app.js`／`style.css`／`data.json` 後，出版前跑 `node tools/bump.js`**——它把三個參數改成「檔案內容 SHA256 前 10 碼」（內容沒變 hash 不變、可重跑；內容變了自動失效瀏覽器快取）。
R01：hash 前先正規化（去 BOM＋CRLF→LF），checkout 換行符差異不再造成假 hash 變化。不再手動累加版本數字。

**提交訊息約定**（2026-11-04 起）：一次工作批次＝一個提交；訊息＝主旨在第一行＋逐項清單 `- `，讓人不用點開就知道改了什麼；不寫相互不可讀的批次代號版本（如「第五批 v=18」）。歷史不再逐小修堆疊。

```text
主題：這批做了什麼（一句話）
- 第一項變更（檔案／行為）
- 第二項變更
```

## 資料更新流程（遊戲改版後）

原始資料快取放在 `data/`（`npm run build` 讀的是這裡）。

```powershell
# 1. 重新下載原始資料（原始檔已在的話可跳過）
#    data/pvpoke_gamemaster.json、data/pvpoke_{500,1500,2500,10000}.json
#    來源見下方「資料夾檔案索引」與 README 的「資料與免責」
# 2. 抽取 GO GameMaster 的 PvE 招式數據＋進化方向＋極巨招式（VN_BM_*）屬性（遊戲改版後建議重跑）
node tools/fetch_go_gm.js
# 3. 重抓現行盃賽排行（限制盃 meta 會隨季輪替，建議每次重建都跑）
node tools/fetch_cup_rankings.js
# 4. 重抓／更新極巨化物種清單（parse 可重現流程）：
#    a. 用瀏覽器另存 https://pokemondb.net/go/dynamax-attackers 頁面為 data/_max_db.md（或 .html）
#    b. 另存的若是 HTML：先轉成 parse_max 吃的行格式
node tools/html_to_md_max.js <另存的.html> data/_max_db.md
#    c. 解析出 data/max.json（含 fetched 撈取日）
node tools/parse_max.js
# 5. 重建＋驗證
node tools/build_data.js
npm test
node tools/diff_tiers.js        # 對照相基準，人工複核「轉為可傳送」清單
# 6. （可選）重抓缺失的招式譯名
node tools/refetch_moves.js
node tools/build_data.js
# 7. 出版前新快取 hash
node tools/bump.js
```

`npm run build`＝重建；`npm test`＝核心單元測試（`tools/test_core.js`，24 項手算錨點）＋整合測試（`tools/test_integration.js`，39 項——
真資料交叉驗證＋反向稽核，R14，40 項）＋資料稽核（`tools/audit_data.js`）；
`node tools/diff_tiers.js [基準] [現行] [輸出檔名]`＝升降級報告（部署前必看，重點核對「轉為可傳送」清單）。
基準可用 `git:<revision>`（R13：預設 `git:97ed136`＝修正前最後一次提交，任何 checkout 都能重現；不再依賴 gitignored 的快照檔）。
`tools/parse_max.js`（R10）拆出純函式 `parseMaxEntries`／`buildIndex` 供整合測試直接呼叫；
`tools/audit_data.js` 支援 `argv[2]` 資料檔路徑，反向稽核即靠它注入假資料驗證攔截。
`cups` 由 R02 起也改為 fail-fast：缺檔影響「限制盃人選」評級 → 中止建置（不再降級為警告）。

```jsonc
// package.json
{ "scripts": { "build": "node tools/build_data.js", "test": "node tools/test_core.js && node tools/test_integration.js && node tools/audit_data.js", "test:core": "node tools/test_core.js", "test:integration": "node tools/test_integration.js", "audit": "node tools/audit_data.js" } }
```

核心計算（CPM／IV 排名／PvE 能量循環／極巨攻擊速率／搜尋字串／esc）統一放在 `site/js/core.js`：
**Node（建置、測試）與瀏覽器（前端）共用同一份定義**，改演算法只改這裡，`npm test` 直接驗證。
`build_data.js` 進場時對 13 個關鍵來源 fail-fast（缺檔即中止並指出補抓工具；`cup_rankings.json` 例外缺席 → 記入 `meta.incomplete`）。

### 下載失敗保護

- `fetch_cup_rankings.js`：下載失敗的盃賽沿用上次成功資料（連原撈取日一起保留，不會冒充今天）；
  全部失敗或盃賽數比上次少（疑似下架）→ 保留舊檔不覆寫，並以非零結束碼收場；
  寫檔用原子替換（先寫 `.tmp` 再改名），過程中斷不會留下半損檔。

### 資料夾檔案索引（`data/`）

| 檔 | 內容 | 產出者 |
|---|---|---|
| pvpoke_gamemaster.json | PvPoke GameMaster：型態、種族值、PvP 招式、標籤 | （原始下載） |
| pvpoke_{500,1500,2500,10000}.json | 三聯賽＋大師聯盟排行榜 | （原始下載） |
| cup_rankings.json | PvPoke 現行盃賽／特殊格式排名 | tools/fetch_cup_rankings.js |
| go_gm.json | GO GM 抽取：PvE 招式數據＋進化方向＋極巨招式（VN_BM_*）屬性（maxMoves） | tools/fetch_go_gm.js |
| max.json | 可極巨化／超極巨化物種清單（pokemondb 解析，含 fetched 撈取日） | tools/parse_max.js（ ← data/_max_db.md，html_to_md_max.js 轉檔） |
| uicons_filelist.json | uicons 圖示檔清單（圖示命中判定） | tools/fetch_uicons_filelist.js |
| go_names_zhtw.json | GO 遊戲內繁中譯名表 | tools/build_go_names.js |
| names_zh_hant.json | 主系列官方繁中譯名（基礎表） | （sindresorhus/pokemon） |
| cpm.json | CP 倍率表 | tools/archive/inspect_pokeminers.js 解析 |
| moves_zh.json | 招式官方繁中譯名（可選） | tools/fetch_moves_zh.js |
| wwm_*.json | WatWowMap masterfile／並用地圖資料 | （原始下載） |

## 判定規則細節

### 評級表

判定**主依據只看主力聯盟**（「PvP 名次」皆指超級／高級／大師聯盟；`bestStd()` 不含小小盃）。
小小盃（500 CP 活動賽制）**不作為主依據**：該盃規榜（`cupR` 的 `little_500`）前 50 名走一般分支的
「限制盃人選 → 建議保留」；tier1/2 另加次級註記「另為小小盃…一般聯盟對戰可忽略」。
卡面顯示時，`f.pvp[500]` 那格正名為「**500 格式總榜**」（PvPoke 500 CP 格式總排名，非現行小小盃盃規，
前端 `rankName()`），與現行盃規榜分開命名避免同頁兩份數字打架；`#501` 之後的尾段名次不上卡面。

| 條件                     | 評級           |
|--------------------------|----------------|
| 幻獸 / 超極巨化 / 超級進化 / 主力聯盟前 50 名 / PvE 估算前 3% / **PvE 屬性分榜前 3%** | 必留           |
| 傳說 / 已暗影且主力聯盟前 200 / 異獸 / 主力聯盟前 150 / PvE 前 10% / 現行盃規榜前 50 名（含小小盃，僅在盃賽榜 45 天內有效——R09） / 極巨戰攻手估算前 10% / **任一聯盟（含 500 格式榜）前 150 名的暗影** | 建議保留 |
| **PvE 屬性分榜前 10%（不得判可傳送）** / 區域限定 / 未完全進化 / 同進化線下游皆可送 / 主力聯盟前 350 | 看情況        |
| 其餘（附圖鑑例外說明）   | 可傳送         |
| （一致性修正）同進化線的進化後型態全部可傳送時，未進化型態一併降為可傳送——**只連走「未完全進化」理由判定**；**自身 bestRank（含 500 格式總榜）≤150、現行限制盃前 10 名、或過 R04 暗影保護不降**（如 carvanha_shadow 500 榜頂尖的暗影 NFE）；**區域限定／傳說／幻獸／異獸／Mega／GMax 不參與連坐** | — |
| （暗影保護，R04 統一口徑 `shadowValuable()`）任一聯盟（含 500）前 150／全物種 PvE 前 10%／任一屬性分榜**前 5%（pct≥95）**的暗影一律不判可傳送——火箭隊輪替、暗影再取得不易；judge 一般分支與 NFE 連坐兩處都套用同一函式，與 `audit_data.js` 反向稽核同規則 | — |
| （傳說／異獸讓路）PvE 保護判定分榜前 3% 優先於「至少保留一隻」模板 → tier0（避免暗影超夢等案例被收藏模板蓋掉戰力事實） | 必留 |
| 可極巨化個體地板為看情況；**有效體質（HP×DEF）前 5% 的物種為 Max Battle 核心坦克位 → 建議保留**（社群共識必練一隻體質好的、Max Spirit／Guard 投資優先，如幸福蛋極巨化；Power Spot 可重複遭遇，不宜 tier0） | 建議保留／看情況 |

### PvE 屬性分榜（tp）

全物種單榜的百分位吃不到「屬性優勢」，已由資料驅動的分榜取代 `PVE_TYPE_STARS` 例外清單：

- 每個蓄力招式屬性一張榜；池＝全部可估算型態（非拆分行）在「對該屬性弱點 boss」的有效 DPS
  （`pve.tpDps[X]`＝弱點盤面循環 DPS × 攻擊體質，含暗影攻 ×1.2；快招與蓄力同屬性時快招段同步 ×1.6——
  boss 對 X 弱點時同屬性快招的弱點加成不會被第二屬性吸收，其他快招取中性期望）。
- 模型兩個假設：boss 第二屬性未知 → 非同屬性快招取中性；弱點倍率用 PvE 對戰的 ×1.6。
- 榜前 3% → tier0「頂尖攻打手」；前 10% → tier2 保護（「缺該屬性打手時有意思，別直接送」）。
- 設計途中修掉的三個 bug（留做註記）：弱點盤面漏同屬性快招 ×1.6；tpDps 未乘攻擊體質（低攻高防壓過攻擊手）；
  拆分行淺層複製與母行共用 `pve` 參照、分榜迴圈互相覆寫（拆行改 `structuredClone` 深拷貝）。
- 校準案例：戰槌龍（岩石 96.6）→ tier2、鋼鎮梨花狀（97.0）→ tier0、暗影戰槌龍（99.7）→ tier0、
  黑眼獅草（93.6）→ tier2、花潔夫人（91.9）→ tier2、暗影椰蛋樹／暗影阿勃梭魯 → tier0。

### 進化方向的權威與保守原則

- 進化方向只認 GO GameMaster 的 `evolutionBranch`（不拿種族值推方向——
  Doublade 總和高於 Aegislash 盾牌形態是真實情況，種族值啟發式會把方向修反）。
- GO GM 的 `evolutionBranch` 一律記在基礎種上，形態種沒有自有記錄；
  探險效果進化（Stantler→Wyrdeer、Girafarig→Farigiraf）GM 根本不寫——
  「GO 沒記錄」不等於「PvPoke 放錯」，只要 PvPoke 的下游各型態都真實存在且已實裝，
  原線保留（per-target 保留，暗影線缺半段不整條陪葬）。
- 進化目標若 PvPoke 只建了 base 行，以 root 回退對上已實裝行
  （Tandemaus→Maushold、Sinistea→Polteageist 等形態家族）；
  PvPoke 家族方向寫反的（Poltchageist↔Sinistcha）以 GO 邊自動校正。

### 極巨化拆行規則（顯式清單制）

GO 的 Max Battle 個體是獨立個體（只有 Power Spot 抓到／孵出的才有），
所以一般型態拆出 `（極巨化）` 分行（如幸福蛋、顫弦蠑螈高音／低音兩形態——它們都有一般個體）；
但「形態／物種本身就是 Max Battle 本體、不存在一般個體」的行**不拆**，極巨化能力直接標在該行上。
判定依 GO 抓取機制的顯式清單（`build_data.js` 的 `MAX_BODY_FORMS`／`MAX_BODY_BASE`），
不拿圖示檔名當代理（武道熊師一擊流是 GO 預設形態、圖示為 `892.png`，圖示代理會誤拆）：

- `MAX_BODY_FORMS`：蒼響劍之王、藏瑪然特盾之王＋
  武道熊師一擊流／連擊流（Kubfu 是 GO 第一個「只發佈極巨化個體」的物種）＋
  **無極汰那**（2026-11 GO Pass 活動限定、單次取得，個體全部可極巨化，無「一般僅能傳送」個體）
- `MAX_BODY_BASE`：kubfu
- `MAX_EXTRA`：清單源（pokemondb）漏列但實際可極巨化的物種顯式補標——目前 `melmetal`
  （經 Max Battle 特殊調查取得，拆出 `melmetal_dmax` 分行）
- **R06（2026-11-06 核實：PokeMiners GM `max_behemoth_blade`／`max_behemoth_bash`）**：
  蒼響／藏瑪然特＝**真 Dynamax**（非超極巨化）＋Max 招式為**專屬鋼屬 Behemoth Blade／Bash**
  （威力級＝一般 D-Max 尺度 350，非 G-Max 的 450）；前端依 `dmx.mode='gmax'`（屬性固定）分流文案，
  詳細頁文案「蒼響／藏瑪然特的極巨攻擊＝專屬 Max 招式（鋼屬固定），布置快招不影響屬性」
- `MAX_SPECIAL`：**無極汰那**——不在 pokemondb 清單（做成 GO Pass 特例），補標極巨化並納入 MAX_BODY_FORMS；
  但 **R07 翻案**：其 Max 招式 **Dynamax Cannon 是一般蓄力招**（GM power 80/215、能量 −45）＋
  冒險效果「Max 招式全隊升 1 級 10 分鐘（5,000 星塵＋30 糖，排除蒼響／藏瑪然特）」，
  **不**走專屬招式估算路徑——極巨戰中的極巨攻擊仍是快招屬性的一般極巨攻擊；且「錯過無法再捕」不成立
  （Max Finale 2025-08 首發、Dynamax Trails 2026-11-16~23 回歸可再捕）→ 評級 tier1
  「傳說寶可夢：至少保留一隻」＋理由明示活動期間限定與冒險效果

### 極巨戰（Max Battle）攻擊估算

Max Battle 只有極巨化個體能出戰、輸出由「極巨攻擊」主導，一般 PvE 估算衡量的是快招×蓄力招循環，
兩者不可互相套用——所以有獨立的 `dmx` 欄位（僅 dm／dmg 行）。機制（2026-11-05 核實：Niantic 官方 Max Battle
說明 + Bulbapedia「Max Move (GO)」威力表 + PokeMiners GM `VN_BM_*` 模板）：

- **一般極巨攻擊的屬性＝快招屬性**（不是蓄力招！換快招就是換屬性）；超極巨化個體的攻擊槽是專屬超極巨招式、
  屬性固定（`tp` 來源：GM vfx 名，物種映射 `MAX_GMAX_MOVE` 為 build 唯一人工表——GM 內無該對照；
  映射失敗＝dmx 資料不正確 → R12 改為直接建置中止，不再只進 meta.incomplete）
- **R02：`dmx` 一律拆行後逐行重算**（`dmxCalc(p, dmg, fixedVfx)`）——`_gmax` 行＝450＋`MAX_GMAX_MOVE` 屬性、
  `_dmax` 行＝350＋快招屬性，不再發生 G-Max 物種的 `_dmax` 行繼承 450／專屬屬性的複本污染；
  每行 `dmx.mode` 揭露 `'gmax'`（專屬招式、屬性固定，含蒼響／藏瑪然特）或 `'dmax'`（快招屬性），
  前端依 mode 分流「極巨戰招式」區塊文案
- 極巨攻擊威力隨技能等級：一般 L1/2/3＝250/300/350、G-Max＝350/400/450；Max+ 再 +100（450/550）。
  兩者每階差距同為 +100 → 以 **L3 尺度（350／450）** 估算，等位間相對排序不變；Max+ 假設在詳細頁揭露
- 極巨條由招式命中累積（快招較有效率）、不隨時間自動回復；估算法＝「滿一條 ≈ 25 次快招命中＋極巨招施放
  2.5 秒」（`core.js` `HITS_PER_METER`／`MAX_ATK_DUR_SEC`；GM VN_BM 模板 duration 一律 2500ms）。
  是否為精算模擬？**不是**——是可解釋的相對指標：`maxRate()` ＝ 威力 × STAB/屬性倍率 × 攻擊體質 ÷
  (25×快招秒數＋2.5)，常數全池一致、不改變同池相對排名。
  **R08 敏感度分析**（2026-11-06）：N∈{15,20,25,30,35} 五組重算，`dmx.pct≥90` 成員 17 筆完全相同
  → 門檻判定不隨 N 變動，只需揭露假設（`core.js` 註記已加）
- `dmx.dps` 為相對指標；百分位 (`dmx.pct`) 的分布＝全部可極巨化／超極巨化行（攻手池）；
  前端另列極巨攻擊屬性與威力假設揭露

**評級升級規則**（tier2／tier3 的 dm 行適用，只升不降）：

- `dmx.pct >= 90` → tier1「Max Battle 強力攻手」（門檻 `DMX_ATTACKER_PCT`）。
  校準案例：龍頭地鼠極巨化（普通 PvP／PvE 都不突出，極巨戰是社群公認頂尖）估算前 8% 命中；
  top 名單（龐岩怪、巨金怪、胡地）符合社群共識。
- tier3 且有效體質前 5% → tier1 核心坦克／輔助位（Max Spirit／Guard 用法，如幸福蛋極巨化）
- 其餘 tier3 → tier2 地板「Max Battle 攻手池的一員」

### PvPoke 推薦帶法與 PvE 最佳組合

- `pvp[L].mv`：PvPoke ranking 的 `moveset`（[快招， 蓄力1， 蓄力2]，招式 id 大小寫與 `moves` 表一致），詳細頁「推薦帶法」直接對照繁中譯名
- `pve.f`／`pve.c`：PvE 估算勝出的 快招／蓄力招 id（無蓄力招式時 `pve.c` 免列）
- 推薦帶法統一附註（M06）：PvE 最佳組合按「中性 boss」估算；實戰打不同弱點的目標時，
  優先換同屬性蓄力招（屬性分榜資料見詳細頁「X 屬性分榜前 Y%」逐列），推薦帶法只是預設起手組合

### PvPoke released 落後白名單

PvPoke 的 `released` 標記有時落後 GO 實況。經 reactmap 查核 GO 端實裝事實後，
在 `build_data.js` 的 `RELEASED_OVERRIDE` 白名單放行（目前：Farigiraf、Spewpa、Toxtricity 兩形態）。
`GO_FORMLESS_BASE` 是反向情況：GO 端沒有「無形態本體」的物種（目前只有 toxtricity——遊戲內只存在高音／低音兩形態，沒有素體），
base 行是 PvPoke 模擬殘留，不建行。

### PvE 估算公式（版 2，2026-11 重寫）

用 GO GameMaster 的 PvE 數值（power／durationMs／energyDelta），枚舉全部 快招×蓄力招 組合。
**能量模型在 `site/js/core.js` 的 `pveCycle()`（Node↔瀏覽器唯一定義，npm test 直接驗證）**：

- 舊版把「每秒能量」當「每次能量」（`Math.ceil(cost / eps)`，H01）；新版按每次招式能量計：
  蓄力招能量集滿即發、餘能滾存、64 輪模擬取**長期平均循環 DPS**（不是單輪）。
  手算錨點（test_core）：快招 10 威力/1.0s/+6 能 × 蓄力 60/1.0s/-33 能 → 64 輪＝352 次快招，DPS＝17.6923。
- 每招各自套 STAB ×1.2；輸出分三層（H02/M07），命名與意義嚴格分開：
  1. `pve.dps`＝中性 boss 循環 DPS（**招式層**，不含攻擊種族值／等級）
  2. `pve.score`＝dps × 攻擊體質（暗影 ×1.2）÷ 70（**跨物種輸出層**）
  3. `pve.weight`＝score × √EHP；**暗影防禦 ×0.8333 納入 EHP**——
     這是**綜合評分層**，暗影的防 ↓ 與攻 ↑ 同時反映（不會再只看到攻加成）
- GO GM 缺的招式退回 PvPoke 數值近似；fallback 計數**每招式 id 只計一次**（6534→25 次），避免迴圈重複膨脹
- 屬性分榜 `pve.tpDps`（打該屬性弱點 boss 的循環 DPS × 攻擊體質）在建置中途轉成百分比 `pve.tp`（見 tp 段）

### 譯名

以 GO 遊戲內實際顯示為準（PokeMiners Latest APK 繁中字串解析出 1009 個名稱，
其中 81 個與主系列官方譯名不同，如 Tyrogue＝「無畏小子」）。重新產生譯名表：`node tools/build_go_names.js`。

### 招式命名與別名

極巨化拆分行沿用母種的可學招式（fast／charged），由 build_data.js 在輸出前做 movesFor 別名。
詳細頁極巨戰招式名稱照 GO 介面字串（攻擊／極巨防壁／極巨回復）。

## 資料稽核（npm test）

`node tools/audit_data.js` 檢查（9 節，任一項失敗回非零結束碼，`npm test` 會真的擋下問題）：

1. 結構完整性（1718 型態欄位、verdict、dex 範圍）
2. 圖示命中（uicons 未收錄 → 改用 PokeAPI 全國圖鑑圖，記為警告；有檔名但檔不存在 → 錯誤）
3. 排行資料範圍
4. 評級邏輯自洽（不可傳送類不得落入 tier3；tier0 有一致的正當事由白名單——tp≥97 等；無極汰那 R07 起為 tier1 傳說模板）
5. 暗影型態風險清點（火箭隊輪替，再取得不易）：**暗影高價值型態不得判可傳送的阻擋規則**
   （PvP 可得前 150／PvE 全榜前 10%／屬性分榜前 10% 暗影 → tier3 即 fail）
6. 關鍵物種抽查
7. 盃賽資料（覆蓋數下限＋撈取日 >420 天警告）
8. IV 計算與圖鑑一致性（rank1 參考值格式）
9. 進化圖譜健康：重複 id、evoNext 掛空／重複邊、nfe 一致、極巨化拆行母行標記／顯示、
   `_gmax`／`_dmax` 行 `pve.tp` 完整（拆行共用 `pve` 參照的老 bug 回歸防護）、`meta.incomplete` 與各來源撈取日陳列

## 前端細節

- 卡片啟用 `content-visibility: auto`（畫面外卡片跳過排版與繪製）、圖片掛 `loading="lazy" decoding="async"`、搜尋輸入 150ms 防抖；1718 張卡全量 rerender 約 25ms，圖檔只抓可視範圍。
- 卡片雙角位：**左上**＝形態徽章 `dmbadge`（極／G·巨／超，帶 hover title）、**右上**＝我的標記 `markchip`（保留／可送／已送）；標記即時反映（`render()` 重繪 grid）＋計數行統計。首頁有收合的「📖 新手指南」（四步動線、徽章說明、兩欄 `gloss` 名詞小抄、資料更新日）。
- 判定／榜單呈現的語意一致：前端 `bestRank()` 與 build 端 `bestStd()` 同調——卡面頭條優先主力聯盟；500 那格一律顯示「500 格式總榜」（`rankName()`）；PvPoke `rating`（數百級模擬值、聯盟尺度不同）只進 rankchip tooltip 不上卡面；`#501` 以後的尾段名次不上卡面（詳細頁仍有全榜）。
- 篩選／排序／搜尋以 `pogo_filtr` 持久化，屬性下拉在填充選項後補還原值；還原程式碼放在 `const $` 宣告之後（TDZ：放前面會整隻 ScriptError）。
- 圖鑑排序的同 dex tiebreak 用載入後算好的 `_sk`（`assignSortKeys`）：**地區主導**——關都本體線 → 起源等特殊形態（同本體區、依資料順序）→ 阿羅拉 → 伽勒爾 → 洗翠 → 帕底亞；每條線內部依「一般 → 暗影 → 極巨化 → 超極巨化」排（`_shadow`／`_dmax`／`_gmax` 後綴剝出 core 判線）。目的：騎拉帝納的改造形態線整條排完才接起源形態（不交錯）、椰蛋樹關都線排完才接阿羅拉線。世代篩選以全國圖鑑號區段判定（`GEN_RANGES`）。
- 詳細頁新區塊：暗影行顯示「淨化建議」（依評級分「先別急著淨化／可淨可留／淨化較划算」＋淨百規則：IV 每項 +2、上限 15，原始 IV 全 ≥13 可淨百；物種有超級進化時補「暗影不能超級進化」條款——淨化是 Mega 的前置門檻）；IV 計算機輸入暗影個體時連帶顯示淨化後 IV；招式區塊附「推薦帶法」（PvPoke 排行組合 `pvp[L].mv`＋PvE 估算最佳組合 `pve.f`／`pve.c`，招式以 `.moves` chip 樣式分段）；dm／dmg 行顯示「極巨戰（Max Battle）攻擊估算」（`dmx.dps`／`dmx.pct`）。
- 卡片小字為各衡量尺度並列（CP · PvP 名次 · `PvE 前 X%` · `Max 前 X%`，存在才顯示；pct 一律以「前 X%」格式——不是「適合哪邊」的意思）。
- 極巨戰估算的**次級說明**：tier2/3 被攻手規則升級的行，主理由已是「Max Battle 強力攻手」；
  tier0/1 的 dm 行只要 `dmx.pct >= DMX_ATTACKER_PCT`（且 why 尚無 Max Battle 字樣），追加一條
  「Max Battle 攻手：極巨攻擊估算前 X%（Max Battle 的攻擊衡量尺度，與上面所據不同）」——不覆寫主理由。
- IV 計算機：半級 CPM 用 GO GameMaster 真值表（非相鄰整數取平均）；
  CP 計算不含暗影倍率（與 GO、PvPoke 的 calculateCP 一致；×1.2／×0.8333 只影響戰鬥體質乘積）。
- 守道館指標：詳細頁「種族值＆上限」區提供有效體質百分位（前 5% 才顯示）。
  守館收益機制上吃虧，只當參考指標，不是評級主因。

## 待辦（押後，不阻擋可用性）

可用性迭代中成本較高、且不影響動線與判定正確性的加值項，留待後續批次：

- ~~**PvE 屬性分榜**~~ → **已完成**（本批 H08：資料驅動分榜取代 `PVE_TYPE_STARS` 例外清單，見「PvE 屬性分榜（tp）」段）
- **max 清單全集缺漏掃描**：`MAX_EXTRA` 目前只補了被回報的美錄梅塔；應對照 GO 現況系統性掃一次 pokemondb 來源清單的缺漏。
- **PvPoke statProduct 資料管線**：對戰玩家衡量「體質積分」用；現有 `rating`（數百級模擬值）僅收 tooltip，需另抓 statProduct 欄位並入 schema／audit。
- **逐隻名冊總覽**：標記目前只到型態粒度（一個形態一個標記）；「我手上有多隻不同個體」的名冊管理待做。
  （本批已先補「備份我的標記／匯入備份」JSON 匯出／匯入。）

## 已知限制

- 圖示：uicons 一般 `{dex}.png`、區域形態 `{dex}_f{formId}.png`、超進化 `{dex}_e{n}.png`、暗影加 `_a1`；
  少數未收錄（如 farigiraf）退回 PokeAPI 主系列圖。「GO 原圖 ↔ HOME 高清」切換鈕偏好存 localStorage；
  完整的高清 GO 圖源不存在（PokeMiners 256 版只涵蓋 0.3%），HOME 512 覆蓋基礎／暗影行 1450 張。
- 暗影型態用紫色光暈與徽章輔助識別（uicons 沒有獨立的暗影徽章）。
- 暗影個體 GO GM 只記錄基礎種進化線，站上以保守繼承規則補齊（見進化方向段）。
- 主題造型物種（皮卡丘聯名 8 隻等）不列入清單：屬個人收藏喜好，無法量化。
- PvE 強度為估算值：跨物種比較用 `pve`（中性 boss 假設）；同屬性內部高低另看 `pve.tp` 屬性分榜，
  但分榜的「非同屬性快招段取中性」是模型假設（boss 第二屬性未知），不是精算。
- 極巨戰估算是**可解釋的相對指標**（非精算模擬）：滿條 ≈ 25 次快招命中（`HITS_PER_METER`）、
  極巨攻擊威力取 L3 尺度（一般 350／超極巨 450，各階差距一致 +100）、Max+ 未建模（詳細頁揭露）。
- 少數 GO 專屬變體招式（如覺醒力量屬性變體）譯名為組合生成。
- 建議對戰 IV 參考值來自 PvPoke 的 defaultIVs，是各聯賽 rank1 的參考值（PvPoke 選檔預設、非本站計算）。
- 盃賽 meta 隨季度輪替；資料撈取日在榜單與 audit 輸出可見，玩特定盃賽時建議重抓（>420 天 audit 警告）。
- `meta.date` 為建置日（UTC 計算），本機午夜前後可能與本機日期差 1；各來源自己的撈取日在 `meta.fetched`。
- 標記只到型態粒度（一個形態一個標記）、存 localStorage；備份／匯入已做，逐隻名冊管理待後續。
- 手機實機瀏覽回歸與螢幕閱讀器全量實測未執行（桌面 smoke 與 aria 結構已驗證；mixWarn modal 符合 alertdialog 慣例）。

## 部署（GitHub Pages）

上線位置：`https://xiangwang2000.github.io/pokemon-go-keep-or-release/`，
由 `gh-pages` 分支服務（內容＝`site/` 資料夾）。資料更新後發佈：

```powershell
git subtree push --prefix site origin gh-pages
# 例外：若遇 non-fast-forward（主分支曾 amend／rebase 打斷 split 沿革），
# 改用 split＋強推：
#   $h = git subtree split --prefix site | Select-Object -Last 1
#   git push --force origin "${h}:refs/heads/gh-pages"
# gh-pages 是單向部署產物內容，強推不會帶走站上歷史（Pages 只讀最新 tree）。
# 清理（適量）：舊的部署物件與 Actions 紀錄可以逐筆刪掉，只留目前線上那版——
#   gh api repos/XiangWang2000/pokemon-go-keep-or-release/deployments   （列出 id，DELETE /deployments/<id>）
#   gh api -X DELETE repos/XiangWang2000/pokemon-go-keep-or-release/actions/runs/<run_id>
# 刪部署物件前需先 POST state=inactive；不影響線上服務（Pages 只認最新 gh-pages tree）。
```

部署卡障排查（2026-11-01 實戰）：GitHub Pages 已知會出現「前一部署永遠 in
progress」的佇列卡死，接連擋掉後續建置（Actions 的 pages-build-deployment
顯示 `due to in progress deployment. Please cancel <sha> first`）。解卡：

```powershell
# 找出卡住的部署 id（error 訊息的 sha 對應者）
gh api repos/XiangWang2000/pokemon-go-keep-or-release/deployments?environment=github-pages --jq ".[] | select(.sha | startswith(\"<卡住的sha前8碼>\")) | .id"
# 先標 inactive，再 DELETE 該部署物件，最後推一個提交重觸發建置
gh api -X POST repos/XiangWang2000/pokemon-go-keep-or-release/deployments/<id>/statuses -f state=inactive -f description="cancel stalled" -f environment=github-pages
gh api -X DELETE repos/XiangWang2000/pokemon-go-keep-or-release/deployments/<id>
$tree = git rev-parse "origin/gh-pages^{tree}"; $c = git -c user.name="XiangWang2000" -c user.email="XiangWang2000@users.noreply.github.com" commit-tree $tree -p origin/gh-pages -m "chore：重觸發 Pages 建置"; git push origin "${c}:refs/heads/gh-pages"
```

`site/.nojekyll` 避免 GitHub Pages 跑 Jekyll 處理。

## 整理歷史

`tools/archive/` 是研究階段的一次性探查腳本（inspect/probe/scan/PvPoke 前端碼研究副本），
留著做為「當年怎麼找出這些檔案」的紀錄，不參與建置管線。
