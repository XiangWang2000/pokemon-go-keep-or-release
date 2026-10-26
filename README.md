# 寶可夢 GO 去留指南（Keep or Transfer）

純靜態網站：收錄《Pokémon GO》所有已實裝的物種與型態（區域形態、超級進化、暗影⋯），
自動判斷**哪些值得留下、哪些可以直接傳送**，也能輸入自己那隻的 IV 算出對戰排名。

## 使用方式

```powershell
# 靜態伺服器任選（fetch 要走 http://，直接雙擊 file:// 會叫不到資料）
python -m http.server 8600 --directory site
# 然後開 http://localhost:8600/
```

也可部署到 GitHub Pages：把 `site/` 目錄當網站根目錄即可。上線位置：

```
https://xiangwang2000.github.io/pokemon-go-keep-or-release/
```

資料更新後要發佈到線上，只要這一行（把 `site/` 的內容推到 `gh-pages` 分支）：

```powershell
git subtree push --prefix site origin gh-pages
```

## 功能

- **1717 個實裝型態**：繁中名＋型態後綴（阿羅拉的樣子、超級進化、暗影⋯）
- **去留評級**：必留／建議保留／看情況／可傳送，每隻都附判定理由
- **搜尋與篩選**：中英文名、屬性、傳說／超級進化／暗影／區域限定／未完全進化／我的收藏
- **排序**：圖鑑、最高 CP、最佳 PvP 排名、PvE 強度、評級
- **IV 排名計算機**：輸入攻／防／血，算在小小盃、超級聯盟、高級聯盟、大師聯盟的
  體質乘積排名，並對照 PvPoke 提供的 rank1 參考 IV。
  CP 計算**不含暗影倍率**（跟 GO、PvPoke 的 calculateCP 一致；×1.2／×0.8333 只影響戰鬥體質乘積）；
  半級 CPM 用的是 GO GameMaster 真值表，不是相鄰整數級取平均
- **我的收藏**：每隻可標「保留／可送／已送」，存在瀏覽器 localStorage

## 更新資料（遊戲改版後）

```powershell
# 1. 重新下載原始資料（原始檔已在的話可跳過）
#    data_pvpoke_gamemaster.json / data_pvpoke_{500,1500,2500,10000}.json
#    來源見下方「資料來源」
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

### 下載失敗保護

- `fetch_cup_rankings.js`：下載失敗的盃賽沿用上次成功資料（連原撈取日一起保留，不會冒充今天）；
  全部失敗或盃賽數比上次少（疑似下架）→ 保留舊檔不覆寫，並以非零結束碼收場；
  寫檔用原子替換（先寫 `.tmp` 再改名），過程中斷不會留下半損檔。

```jsonc
// package.json
{ "scripts": { "build": "node tools/build_data.js", "audit": "node tools/audit_data.js", "test": "node tools/audit_data.js" } }
```

## 資料來源（感謝這些開源專案）

- [PvPoke](https://pvpoke.com)：GameMaster（型態、種族值、PvP 招式、標籤）與三個聯賽排行榜；
  現行限制盃榜單由 `tools/fetch_cup_rankings.js` 抓取
- [PokeMiners game_masters](https://github.com/PokeMiners/game_masters)：CP 倍率表；latest.json 另抽出兩份小資料（`node tools/fetch_go_gm.js` → `data_go_gm.json`）：
  **PvE 招式數據**（power／durationMs／energyDelta，快招模板 id 的 `_FAST` 後綴會正規化去除）與**進化方向**（`pokemonSettings.evolutionBranch`）
- [sindresorhus/pokemon](https://github.com/sindresorhus/pokemon)：主系列官方繁中譯名（基礎表）
- [PokeMiners pogo_assets](https://github.com/PokeMiners/pogo_assets)：**GO 遊戲內繁中字串**（譯名以 GO 為準）、CP 倍率表
- [PokeAPI](https://pokeapi.co)：招式官方繁中譯名；精靈圖示 fallback
- [WatWowMap Masterfile-Generator](https://github.com/WatWowMap/Masterfile-Generator)：GO 數字 formId 對照
- [WatWowMap wwm-uicons](https://github.com/WatWowMap/wwm-uicons)：GO 實際型態圖示庫
- [pokemondb.net](https://pokemondb.net/go/dynamax-attackers)：極巨化／超極巨化物種清單

## 判定規則摘要（綜合標準）

| 條件                     | 評級           |
|--------------------------|----------------|
| 幻獸 / 超極巨化 / 超級進化 / 各聯賽前 50 名 / PvE 估算前 3% | 必留           |
| 已暗影且排名前 200 / 傳說 / 異獸 / PvP 前 150 / PvE 前 10% / 現行限制盃前 50 名 | 建議保留 |
| 區域限定 / 未完全進化 / PvP 前 350 | 看情況        |
| 其餘（附圖鑑例外說明）   | 可傳送         |
| （一致性修正）同進化線的進化後型態全部可傳送時，未進化型態一併降為可傳送；**但自身聯賽前 60 名或現行限制盃前 10 名的未進化型態不降**（進化前型態自己就是戰力，如過動猿超級聯盟 #22）；**區域限定／傳說／幻獸／異獸／Mega／GMax 不參與連坐**——評級理由非進化線（如 mr_mime 歐洲限定） | — |
| 可極巨化個體地板為看情況；**有效體質（HP×DEF）前 5% 的物種為 Max Battle 核心坦克位 → 建議保留**（社群共識必練一隻體質好的、Max Spirit／Guard 投資優先，如幸福蛋極巨化——唯一命中的地板個體；Power Spot 可重複遭遇，不宜 tier0） | 建議保留／看情況 |

**判定資料的權威優先序**：進化方向只認 GO GameMaster 的 `evolutionBranch`（不拿種族值推方向——
Doublade 總和高於 Aegislash 盾牌形態是真實情況，種族值啟發式會把方向修反）；
GO 對某物種有記錄但沒寫下游時，PvPoke 的矛盾進化邊會被主動清掉；
兩邊資料不一致時詳細列出，供人工核對。

**PvE 估算公式**：用 GO GameMaster 的 PvE 數值（power／durationMs／energyDelta），
枚舉全部 快招×蓄力招 組合取最大循環 DPS；每招各自套 STAB ×1.2，暗影個體攻擊 ×1.2。
GO GM 缺的招式退回 PvPoke 數值近似並計數輸出。手算校驗案例：
蜥蜴王暗影（子彈種子 4 發集滿 50 能量＋瘋狂植物，循環 DPS 23.63；全組合最大 30.22 ≥ 手算值）。

**譯名**：以 GO 遊戲內實際顯示為準（PokeMiners Latest APK 繁中字串解析出 1009 個名稱，其中 81 個與主系列官方譯名不同，如 Tyrogue＝「無畏小子」）。重新產生譯名表：`node tools/build_go_names.js`。

**前端效能**：卡片啟用 `content-visibility: auto`（畫面外卡片跳過排版與繪製）、圖片掛 `loading="lazy" decoding="async"`、搜尋輸入 150ms 防抖；1717 張卡全量 rerender 約 25ms，圖檔只抓可視範圍。

**守道館指標**：詳細頁「種族值＆上限」區提供**有效體質（HP×DEF）百分位**（排行前 5% 才顯示行）。守館收益機制上吃虧（金幣上限太快、被淘汰就結束），所以只當參考指標——影響的是 Max Battle 坦克位標示與收藏判斷，不是評級主因。

**極巨戰招式**：可極巨化／超極巨化型態的詳細頁有「極巨戰招式」區塊（名稱照 GO 介面字串：攻擊／極巨防壁／極巨回復）——攻擊槽的極巨招式屬性隨特殊招式變化（如幸福蛋的念力→超能力系極巨攻擊），超極巨化個體的攻擊槽為專屬超極巨招式。極巨化拆分行沿用母種的可學招式（fast／charged），由 build_data.js 在輸出前做 movesFor 別名。

**資料稽核**：`node tools/audit_data.js` 檢查結構完整／圖示命中（uicons 未收錄則改用 PokeAPI 全國圖鑑圖，記為警告）／名次範圍／評級自洽（區域・傳說等不得落入可傳送）／進化方向健全／IV 格式／**盃賽覆蓋數下限**／**進化圖譜健康**（重複 id、evoNext 掛空、重複邊、nfe 與 evoNext 一致、極巨化拆行母行標記）；
有任一項失敗就回非零結束碼（`npm test` 會真的擋下問題）。**PvPoke 的 `released` 標記落後時**，經 reactmap 查核 GO 端實裝事實後，在 build_data.js 的 `RELEASED_OVERRIDE` 白名單放行（目前：Farigiraf、Spewpa、Toxtricity 兩形態）。

**限制盃資料**：整合 PvPoke 現行公開的 12 個盃賽／特殊格式榜單（小小盃、幻境盃、LAIC 2027、Battle Frontier 系列、Catch Cup、超進化聯盟等）。詳情頁「限制盃排名」區塊可查；IV 計算機的物種天花板檢查也會附上盃賽名次。⚠️ 限制盃 meta 隨季度輪替，標示資料撈取日期，玩特定盃賽時建議重抓。

## 已知限制

- 精靈圖示已在 2026-10 改用 **WatWowMap uicons（GO 實際型態圖）**：
  一般 `{dex}.png`、區域形態 `{dex}_f{formId}.png`、超級進化／原始回歸 `{dex}_e{n}.png`、
  暗影加 `_a1`；少數未收錄者退回 PokeAPI 主系列圖。
  另有**「圖示：GO 原圖 ↔ HOME 高清」切換鈕**（頁頭，偏好存在 localStorage）：
  預設 GO 原圖；完整的高清 GO 圖源目前不存在（PokeMiners 256 版只涵蓋 0.3%），
  想要清晰可切到 Pokémon HOME 512（基礎／暗影行 1450 張命中，區域形態／超進化／極巨化維持 GO 圖）
- 暗影型態另用紫色光暈與徽章輔助識別（uicons 沒有獨立的暗影徽章）
- 極巨化／超極巨化清單解析自 pokemondb 的 Max Battle 攻手頁（153 隻可極巨化、18 隻超極巨化）。
  **拆行規則（顯式清單制）**：GO 的 Max Battle 個體是獨立個體（只有 Power Spot 抓到／孵出的才有），
  所以一般型態會拆出 `（極巨化）` 分行（如幸福蛋、顫弦蠑螈高音／低音兩形態——它們都有一般個體）；
  但**「形態／物種本身就是 Max Battle 本體、不存在一般個體」的行不拆**，極巨化能力直接標在該行上——
  判定依 GO 抓取機制的顯式清單（build_data.js 的 `MAX_BODY_FORMS`／`MAX_BODY_BASE`），
  不再拿圖示檔名當代理（武道熊師一擊流是 GO 預設形態、圖示為 `892.png`，圖示代理會誤拆）：
  蒼響劍之王、藏瑪然特盾之王（能量形態轉換，劍之王不巨大化但可參戰）＋
  武道熊師一擊流／連擊流（Kubfu 是 GO 第一個「只發佈極巨化個體」的物種）
- **進化方向權威與保守原則**：GO GM 的 `evolutionBranch` 一律記在基礎種上，形態種沒有自有記錄；
  探險效果進化（Stantler→Wyrdeer、Girafarig→Farigiraf）GM 根本不寫——「GO 沒記錄」不等於「PvPoke 放錯」，
  只要 PvPoke 的下游各型態都真實存在且已實裝，原線保留（per-target 保留，暗影線缺半段不整條陪葬）。
  進化目標若 PvPoke 只建了 base 行，會以 root 回退對上已實裝行
  （Tandemaus→Maushold、Sinistea→Polteageist 等形態家族）；PvPoke 家族方向寫反的
  （Poltchageist↔Sinistcha）以 GO 邊自動校正。
- 主題造型物種（皮卡丘聯名 8 隻等）不列入清單：屬個人收藏喜好，無法量化
- PvE 強度是**估算值**（GO PvE 數值＋全組合枚舉的循環 DPS 近似，不是官方模擬精算；拿來比相對強度可以，別當精算）。
  **全物種百分位**是簡化政策：比較範圍是全部實裝型態，不是同屬性內排名——
  某屬性的最佳人選可能被其他屬性的強者擠壓百分位；各攻擊屬性分榜屬後續改進方向
- 少數 GO 專屬變體招式（如覺醒力量屬性變體）譯名為組合生成
- 建議對戰 IV 參考值來自 PvPoke 的 defaultIVs，是各聯賽 rank1 的參考
