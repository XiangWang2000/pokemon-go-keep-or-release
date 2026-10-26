# 開發說明（給想改資料／重跑建置的人）

本專案是一條「抓取原始資料 → 建置 → 稽核」的管線，產出純靜態網站（`site/`）。
這份文件記錄管線的所有細節；使用網站不需要看這裡（README 就夠了）。

## 本機執行網站

```powershell
# 靜態伺服器任選（fetch 要走 http://，直接雙擊 file:// 會叫不到資料）
python -m http.server 8600 --directory site
# 然後開 http://localhost:8600/
```

**改到 `app.js`／`style.css`／`data.json` 後務必 bump `?v=` 版本參數**（`site/index.html` 的 script tag 與 `app.js` 的 `fetch('data/data.json?v=N')`），不然瀏覽器快取會讓使用者看到舊版。

## 資料更新流程（遊戲改版後）

原始資料快取放在 `data/`（`npm run build` 讀的是這裡）。

```powershell
# 1. 重新下載原始資料（原始檔已在的話可跳過）
#    data/pvpoke_gamemaster.json、data/pvpoke_{500,1500,2500,10000}.json
#    來源見下方「資料夾檔案索引」與 README 的「資料與免責」
# 2. 抽取 GO GameMaster 的 PvE 招式數據＋進化方向（遊戲改版後建議重跑）
node tools/fetch_go_gm.js
# 3. 重抓現行盃賽排行（限制盃 meta 會隨季輪替，建議每次重建都跑）
node tools/fetch_cup_rankings.js
# 4. 重建
node tools/build_data.js
# 5. （可選）重抓缺失的招式譯名
node tools/refetch_moves.js
node tools/build_data.js
```

`npm run build`＝重建；`npm run audit`＝資料稽核（`npm test` 同）。

```jsonc
// package.json
{ "scripts": { "build": "node tools/build_data.js", "audit": "node tools/audit_data.js", "test": "node tools/audit_data.js" } }
```

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
| go_gm.json | GO GM 抽取：PvE 招式數據＋進化方向 | tools/fetch_go_gm.js |
| max.json | 可極巨化／超極巨化物種清單（pokemondb 解析） | tools/parse_max.js |
| uicons_filelist.json | uicons 圖示檔清單（圖示命中判定） | tools/fetch_uicons_filelist.js |
| go_names_zhtw.json | GO 遊戲內繁中譯名表 | tools/build_go_names.js |
| names_zh_hant.json | 主系列官方繁中譯名（基礎表） | （sindresorhus/pokemon） |
| cpm.json | CP 倍率表 | tools/archive/inspect_pokeminers.js 解析 |
| moves_zh.json | 招式官方繁中譯名（可選） | tools/fetch_moves_zh.js |
| wwm_*.json | WatWowMap masterfile／並用地圖資料 | （原始下載） |

## 判定規則細節

### 評級表

| 條件                     | 評級           |
|--------------------------|----------------|
| 幻獸 / 超極巨化 / 超級進化 / 各聯賽前 50 名 / PvE 估算前 3% | 必留           |
| 已暗影且排名前 200 / 傳說 / 異獸 / PvP 前 150 / PvE 前 10% / 現行限制盃前 50 名 / 極巨戰攻手估算前 10% | 建議保留 |
| 區域限定 / 未完全進化 / PvP 前 350 | 看情況        |
| 其餘（附圖鑑例外說明）   | 可傳送         |
| （一致性修正）同進化線的進化後型態全部可傳送時，未進化型態一併降為可傳送；**但自身聯賽前 60 名或現行限制盃前 10 名的未進化型態不降**（進化前型態自己就是戰力，如過動猿超級聯盟 #22）；**區域限定／傳說／幻獸／異獸／Mega／GMax 不參與連坐**——評級理由非進化線（如 mr_mime 歐洲限定） | — |
| 可極巨化個體地板為看情況；**有效體質（HP×DEF）前 5% 的物種為 Max Battle 核心坦克位 → 建議保留**（社群共識必練一隻體質好的、Max Spirit／Guard 投資優先，如幸福蛋極巨化——唯一命中的地板個體；Power Spot 可重複遭遇，不宜 tier0） | 建議保留／看情況 |

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

- `MAX_BODY_FORMS`：蒼響劍之王、藏瑪然特盾之王（能量形態轉換，劍之王不巨大化但可參戰）＋
  武道熊師一擊流／連擊流（Kubfu 是 GO 第一個「只發佈極巨化個體」的物種）
- `MAX_BODY_BASE`：kubfu

### 極巨戰（Max Battle）攻擊估算

Max Battle 只有極巨化個體能出戰、輸出由「極巨攻擊」主導，一般 PvE 估算衡量的是快招×蓄力招循環，
兩者不可互相套用——所以有獨立的 `dmx` 欄位（僅 dm／dmg 行）。模型與常數（`build_data.js` 的 `MAX_BP`／`MAX_METER`／`MAX_ATK_DUR`）：

- GO 極巨攻擊基礎威力固定 250（超極巨專屬招式威力略異，一併以 250 近似）
- 暫存條以快招集能填滿：滿條成本尺度 100 為共用常數、極巨攻擊動畫 2 秒亦同——
  常數只影響絕對值，同池百分位比較不受影響
- 每次極巨攻擊傷害 ∝ 250 × STAB ×1.2 ×（攻擊體質），枚舉「快招（集能）×特殊招式（決定屬性）」取最快循環
- `dmx.dps` 為估算值；百分位 (`dmx.pct`) 的分布＝全部可極巨化／超極巨化行（攻手池）

**評級升級規則**（tier2／tier3 的 dm 行適用，只升不降）：

- `dmx.pct >= 90` → tier1「Max Battle 強力攻手」（門檻 `DMX_ATTACKER_PCT`）。
  校準案例：龍頭地鼠極巨化（普通 PvP／PvE 都不突出，極巨戰是社群公認頂尖）估算前 8% 命中；
  top 名單（龐岩怪、巨金怪、胡地）符合社群共識。
- tier3 且有效體質前 5% → tier1 核心坦克／輔助位（Max Spirit／Guard 用法，如幸福蛋極巨化）
- 其餘 tier3 → tier2 地板「Max Battle 攻手池的一員」

### PvPoke 推薦帶法與 PvE 最佳組合

- `pvp[L].mv`：PvPoke ranking 的 `moveset`（[快招， 蓄力1， 蓄力2]，招式 id 大小寫與 `moves` 表一致），詳細頁「推薦帶法」直接對照繁中譯名
- `pve.f`／`pve.c`：PvE 估算勝出的 快招／蓄力招 id（無蓄力招式時 `pve.c` 免列）

### PvPoke released 落後白名單

PvPoke 的 `released` 標記有時落後 GO 實況。經 reactmap 查核 GO 端實裝事實後，
在 `build_data.js` 的 `RELEASED_OVERRIDE` 白名單放行（目前：Farigiraf、Spewpa、Toxtricity 兩形態）。
`GO_FORMLESS_BASE` 是反向情況：GO 端沒有「無形態本體」的物種（目前只有 toxtricity——遊戲內只存在高音／低音兩形態，沒有素體），
base 行是 PvPoke 模擬殘留，不建行。

### PvE 估算公式

用 GO GameMaster 的 PvE 數值（power／durationMs／energyDelta），
枚舉全部 快招×蓄力招 組合取最大循環 DPS；每招各自套 STAB ×1.2，暗影個體攻擊 ×1.2。
GO GM 缺的招式退回 PvPoke 數值近似並計數輸出。手算校驗案例：
蜥蜴王暗影（子彈種子 4 發集滿 50 能量＋瘋狂植物，循環 DPS 23.63；全組合最大 30.22 ≥ 手算值）。

### 譯名

以 GO 遊戲內實際顯示為準（PokeMiners Latest APK 繁中字串解析出 1009 個名稱，
其中 81 個與主系列官方譯名不同，如 Tyrogue＝「無畏小子」）。重新產生譯名表：`node tools/build_go_names.js`。

### 招式命名與別名

極巨化拆分行沿用母種的可學招式（fast／charged），由 build_data.js 在輸出前做 movesFor 別名。
詳細頁極巨戰招式名稱照 GO 介面字串（攻擊／極巨防壁／極巨回復）。

## 資料稽核（npm test）

`node tools/audit_data.js` 檢查：

1. 結構完整性（欄位、dex 範圍）
2. 圖示命中（uicons 未收錄 → 改用 PokeAPI 全國圖鑑圖，記為警告；有檔名但檔不存在 → 錯誤）
3. 排行資料範圍
4. 評級自洽（區域・傳說等不得落入可傳送）
5. 進化方向健全（種族值倒退偵測）
6. IV 格式
7. 盃賽覆蓋數下限
8. 進化圖譜健康：重複 id、evoNext 掛空／重複邊、nfe 與 evoNext 一致、極巨化拆行母行標記

任一項失敗回非零結束碼，`npm test` 會真的擋下問題。

## 前端細節

- 卡片啟用 `content-visibility: auto`（畫面外卡片跳過排版與繪製）、圖片掛 `loading="lazy" decoding="async"`、搜尋輸入 150ms 防抖；1717 張卡全量 rerender 約 25ms，圖檔只抓可視範圍。
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

## 已知限制

- 圖示：uicons 一般 `{dex}.png`、區域形態 `{dex}_f{formId}.png`、超進化 `{dex}_e{n}.png`、暗影加 `_a1`；
  少數未收錄（如 farigiraf）退回 PokeAPI 主系列圖。「GO 原圖 ↔ HOME 高清」切換鈕偏好存 localStorage；
  完整的高清 GO 圖源不存在（PokeMiners 256 版只涵蓋 0.3%），HOME 512 覆蓋基礎／暗影行 1450 張。
- 暗影型態用紫色光暈與徽章輔助識別（uicons 沒有獨立的暗影徽章）。
- 暗影個體 GO GM 只記錄基礎種進化線，站上以保守繼承規則補齊（見進化方向段）。
- 主題造型物種（皮卡丘聯名 8 隻等）不列入清單：屬個人收藏喜好，無法量化。
- PvE 強度為估算值；全物種百分位是簡化政策（非同屬性排名），分榜屬後續改進方向。
- 少數 GO 專屬變體招式（如覺醒力量屬性變體）譯名為組合生成。
- 建議對戰 IV 參考值來自 PvPoke 的 defaultIVs，是各聯賽 rank1 的參考。
- 盃賽 meta 隨季度輪替；資料撈取日在榜單與 audit 輸出可見，玩特定盃賽時建議重抓。

## 部署（GitHub Pages）

上線位置：`https://xiangwang2000.github.io/pokemon-go-keep-or-release/`，
由 `gh-pages` 分支服務（內容＝`site/` 資料夾）。資料更新後發佈：

```powershell
git subtree push --prefix site origin gh-pages
```

`site/.nojekyll` 避免 GitHub Pages 跑 Jekyll 處理。

## 整理歷史

`tools/archive/` 是研究階段的一次性探查腳本（inspect/probe/scan/PvPoke 前端碼研究副本），
留著做為「當年怎麼找出這些檔案」的紀錄，不參與建置管線。
