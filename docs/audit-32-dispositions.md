# 審查報告 32 項逐項處置表

原文：`pokemon-go-keep-or-release-audit-issue.md`（基準 `main` @ `97ed136`）。
分支：`audit-fix-32`。驗證通用證據：`npm test`（core 24 項＋audit 全綠）、`node tools/build_data.js` 重建（1718 型態 284/341/801/292）、`docs/tier-diff-2026-11-05.md`（轉為「可傳送」＝0 筆)、瀏覽器 smoke test（console 零錯誤）。
狀態標記：**confirmed**（屬實並已修）／**design decision**（屬實但採取保守設計決定）／**already fixed**（現行碼已無此狀況）／**not reproduced**（核實後不存在）。

## P0：核心戰力與誤放生風險

### H01 PvE 能量單位 — **confirmed**
舊 `pveCalc()` 把「每秒能量」當「每次能量」（`Math.ceil(cost / fc.eps)`）。重寫為：每次招式能量、集滿即發、餘能滾存、64 輪模擬取長期平均循環 DPS（`site/js/core.js` 的 `pveCycle()`，Node↔瀏覽器唯一定義）。
證據：`tools/test_core.js` 手算錨點「快招 10 威力/1.0s/+6能 × 蓄力 60/1.0s/-33能 → 64 輪＝352 次快招，DPS＝7360/416＝17.6923」及 STAB 分項測試，全綠。

### H02 PvE DPS 名稱與實際意義 — **confirmed**
修正後明確分層：`pve.dps`＝中性 boss 長期循環 DPS（招式層）；`pve.score`＝dps×攻擊體質（含暗影×1.2）／70（跨物種輸出層）；`pve.weight`＝score×√EHP（含暗影防×0.8333，M07）＝綜合評分層。UI 以「循環 DPS 估算」命名並在 PvE 折疊區揭露假設與尺度差異。
證據：`build_data.js` `pveCalc()` 三層輸出；`site/index.html` 名詞解；前端「道館／團體戰輸出估算」區塊文案。

### H03 一般 Max Attack 屬性看錯來源 — **confirmed（並發現兩處前端錯誤）**
極巨攻擊屬性＝**快招**屬性（非蓄力招）；G-Max 專屬招式固定屬性（GM `VN_BM_*` vfx 名）。修正：`dmxCalc()` 逐一快招取最佳並回傳 `tp`；前端 maxBlock 改用 `f.fmr`（快招 id，本次新增欄位）逐快招列出「極巨攻擊〈屬性〉」，拆分行只列專屬招式。
證據：瀏覽器 smoke——`噴火龍（極巨化）`詳細頁列出「極巨攻擊〈飛行〉空氣斬／〈火〉火花、〈火〉火焰旋渦」＋註明「一般極巨攻擊的屬性＝快招屬性…」；`噴火龍（超極巨化）`列「專屬超極巨招式（屬性固定）」。

### H04 D-Max／G-Max 威力差異 — **confirmed**
舊 `MAX_BP=250` 一律近似。改為：一般 L1/2/3＝250/300/350、G-Max＝350/400/450、Max+ 再 +100（450/550）；估算取 L3 尺度（350/450），差異同階一致不改變同池相對排名，前端詳細頁完整揭露威力表與 Max+ 假設。
證據：外部核實（2026-11-05，Bulbapedia「Max Move (GO)」＋Niantic 官方 Max Battle 說明）；前端 smoke 見威力表文字；`tools/test_core.js` `maxRate` 手算錨點（power 350×1.2×150/70÷(25×0.5+2.5)＝60）。

### H05 Max Meter 估算不符實機制 — **confirmed（重設計為可解釋相對指標）**
Max 條實機制：快招／蓄力招命中累積、不隨時間自動回復、極巨階段攻擊 2.5 秒（GM VN_BM 模板 durationMs 一律 2500）。設計決定：以「滿條 ≈ 25 次快招命中（`HITS_PER_METER`，僅與快招速度有關）＋施放 2.5 秒」建立**可解釋的相對指標**（`core.js maxRate`），不是精算模擬；假設常數全池一致、不改變相對排名，詳細頁揭露之。
證據：`tools/test_core.js` maxRate 手算＝60／G÷D 比值＝威力比；前端「估算假設」區塊。

### H06 NFE 連坐降級誤傷自身優勢型態 — **confirmed**
修正雙層：① post-pass 只連坐 judge 因「未完全進化」分支（理由開頭字樣為準）判 tier2 的行；② judge NFE 分支自身保護「主力聯盟前 60 或現行盃前 10」型態；③ 連坐門檻放寬為「自身 bestRank（含 500 格式總榜）≤150 或現行盃 top10 不連坐」（暗影初心者型態常只有 500 榜名次，如 carvanha_shadow／psyduck_shadow）。
證據：修正前 audit 報 `psyduck_shadow（500 榜 #117）／carvanha_shadow` 誤降 tier3；修正後重跑 audit「無暗影高價值型態落入可傳送」。

### H07 複製搜尋字串混淆形態 — **confirmed**
重寫為 `core.js searchPlan()`：連續編號壓縮不變；**全部暗影 → 每段補 `&shadow`、全部可極巨化 → `&dynamax`**（2026-11-05 核實 GO 支援此二限定詞）＝第二層「形態不同」判定（同 dex 內含不同形態）→ 強制彈出混形態警告 modal（列出問題編號＋形態清單＋正確做法指引，`role="alertdialog"`、Esc／點外面／按鈕關閉、焦點管理）。
證據：`tools/test_core.js` searchPlan 7 項（限定詞／壓縮／混形態／超長）；瀏覽器 smoke——模擬含 charizard 4 形態名單 → modal 顯示「#6 噴火龍、暗影、極巨化、超極巨化」＋Esc 關閉。

### H08 PvE 分屬性榜缺失 — **confirmed（含一次資料流修正與兩次口徑修正）**
移除 `PVE_TYPE_STARS` 硬編碼，建立資料驅動的屬性分榜：每個蓄力招式屬性一榜，池＝全部可估算型態在該屬性弱點 boss 的有效 DPS（`tpDps`＝弱點循環 DPS×攻擊體質含暗影）。`tp≥97 → tier0「頂尖攻打手」；tp≥90 → 一律不得判「可傳送」`。實作途中修掉三個 bug：弱點盤面漏了同屬性快招×1.6（雙屬性絕活被低估）、tpDps 未乘攻擊體質（低攻高防壓過攻擊手）、拆分行淺層複製共用 `pve` 參照互相覆寫（hatterene tp 被 `hatterene_dmax` 洗成空）。
證據：重建後 rock 榜 top＝戰槌龍暗影 99.7／巨金怪暗影 99／暴暴牙龍暗影 98.7；審查名片戰槌龍 96.6→tier2、鋼鎮梨花 97→tier0、黑眼獅花 93.6→tier2、花潔夫人 91.9→tier2（全部脫離「可傳送」）。audit「必留但無正當事由」白名單同步 tp 檢查。

### H09 PvE 排名母體重複 — **confirmed**
百分位母體＝`非 _dmax/_gmax 拆分行`（拆分行是同型態複本）；D-Max 攻手池本身已是獨立欄位。percentile 語意統一為「池內嚴格小於我的比例」（competition rank）。
證據：`build_data.js` 百分位段註解＋`audit_data.js` 第 9 節拆分行稽核「極巨化拆分行母行標記、顯示」全綠。

### H10 無極汰那特例 — **confirmed（MAX_SPECIAL 專案）**
外部核實（2026-11-05）：無極汰那由 2026-11 GO Pass 活動**單次取得**（錯過無法再捕）、擁有專屬 Max 招式 **Dynamax Cannon**（龍屬、G-Max 威力級 450；GM vfx `max_dynamax_cannon`）。處置：`MAX_SPECIAL` 補標並沿用「本體即極巨化，不拆行」規則（`MAX_BODY_FORMS`）；`judge` 專案 tier0 必留＋理由明示 GO Pass 限定；dmx 估算走專屬招式路徑。
證據：`data.json` `id: eternatus` `tier0`＋`dmx: { tp: 'dragon' }`；audit 抽查通過。

## P1：IV、去留與來源資料

### M01 defaultIVs 並非 Rank 1／半級被 round — **confirmed**
UI 更名為「**PvPoke 各聯賽建議參考 IV**」；半級是真實等級，建置不再 `Math.round`（`ivRef` 直接量化）。
證據：`build_data.js` ivRef 段註解＋前端顯示 `Lv14.5`；瀏覽器 smoke IV 計算機輸出「最佳等級 Lv13.5」。

### M02 IV 排名定義 — **confirmed**
`core.js ivRank()` 重寫：4096 組合全枚舉、`total` 固定 4096、**同分同名次**（competition rank：`rank`＝product 嚴格大於我的組合數＋1）；驗證同分案例。
證據：`tools/test_core.js`「ivRank total 固定 4096」「同分同名次 rank=245＝245」；瀏覽器 smoke「IV 排名是 #3539/4096」。

### M03 500 CP 格式總榜與小小盃混用 — **already fixed（基準版已分流，本批補強）**
IV 計算器 500 選項正名「**CP500 格式總榜**」＋注意文案（格式總榜≠現行小小盃）；「物種是否值得留」（四級評級）與「我這隻個體怎麼樣」（計算機）分層文案明示（並見 M10）。
證據：`site/js/app.js` IV 計算機區塊；README「名詞槽位」節。

### M04 IV 無法更改觀念過時 — **confirmed**
外部核實（2026-11-05）：瓶蓋訓練（2025-06 起）銀＝單一項、金＝全部；門檻＝夥伴 Good Buddy 等級、暗影須先淨化、365 天內完成。全站文案更新（gloss、IV 計算機、PvE 折疊區）。
證據：`site/index.html` gloss 瓶蓋句；瀏覽器 smoke `瓶蓋訓練` 出現；PvE 區段文案「別拿來補『反正影響座位不大的同一階個體』」。

### M05 PvE IV 文案過度絕對 — **confirmed**
重寫：不同檔次不同對待（不硬性 15 攻）；防／血 IV 在「會改變挨打次數的對局」（坦克位、高等級 boss）確實有耐久斷點價值，14/15/15 級個體明示保護。
證據：`site/js/app.js` PvE 折疊區第四條。

### M06 PvE 最佳招式忽略對手 — **confirmed**
「推薦帶法」加註記：PvE 最佳組合按中性 boss 估，打不同弱點優先用同屬性蓄力招（詳見屬性分榜列）；詳細頁 PvE 區改列「X 屬性分榜前 Y%」逐屬性資料。
證據：`site/js/app.js` recHtml 註記；smoke 戰槌龍詳細頁「岩石屬性」相關列。

### M07 暗影 PvE 耐久代價 — **confirmed**
`pveCalc()` 暗影個體防禦 ×0.8333 納入 EHP／weight（純輸出層沿用攻 ×1.2）——評分同時反映更高承傷。
證據：`build_data.js` pveCalc 頭 `defStat * (isShadow ? 0.8333333 : 1)`；shadow 與 base 行 weight 可比對（如洛奇亞/洛奇亞暗影 99.8% 兩行皆入 top5）。

### M08 舊／非現行盃賽影響評級 — **design decision（保留現行盃清單＋加時效揭露）**
固定盃清單維持（特殊盃長期有效），但：① `cup_rankings.json` 保留原撈取日、失敗不冒充今天（already fixed 機制）；② build 把撈取日寫進 `meta.fetched.cups`；③ audit 新增「盃賽榜 >420 天未重抓 → 警告」；④ 全部榜單 tooltip／下方顯示撈取日。
證據：`data/cup_rankings.json` fetched=2026-10-25；audit 輸出「盃賽清單 12 杯；11 天前（未逾 420 天）」。

### M09 淨化建議過度依賴暗影 tier — **confirmed**
三段文案重寫：tier0/1「先保留暗影」；tier2「照用途挑——**不需要戰力的可以完全不淨化，暗影身分仍有備份價值**」；tier3「淨化或直接送都可以，別為淨化而淨化（花費換 IV+2／報恩）」——「必須淨化」的暗示已移除；淨化不可逆警告保留。
證據：`site/js/app.js` 淨化區；smoke 開暗影卡可見三段文案。

### M10 物種價值與個體去留未分層 — **confirmed**
IV 計算機上方加明示：「這臺計算機衡量『你手上這隻個體』的相對體質，本站四級評級衡量『這個物種／型態是否值得留』——兩者是不同層級，物種不值得留的話個體再漂亮也不用糾結」。
證據：`site/js/app.js` IV 計算機注意段。

### M11 資料來源缺失時靜默退化 — **confirmed**
`build_data.js` 進場 fail-fast：13 個關鍵來源缺檔 `<5KB` 直接 `exit(1)` 附清單（列出補抓工具）；`cup_rankings.json` 例外允許缺席但記入 `meta.incomplete`；`go_gm.maxMoves` 缺失記 incomplete；G-Max 映射失敗記 incomplete。
證據：build 註解＋audit `meta.incomplete` 檢查（現況＝無缺口）。

### M12 建置日不等於來源更新日 — **confirmed**
輸出 `meta.fetched = { go_gm, cups, max_list }`（來源內含者採用；缺記錄的進 `meta.incomplete`）；UI/文件引用撈取日；`date` 語意為建置日。
證據：`data.json` `meta.fetched { go_gm: 2026-10-24, cups: 2026-10-25, max_list: 2026-11-04 }`；已知小限制：`date` 以 UTC 計算，本機午夜前後可能與本機日差 1（列入最終報告）。

## P2：工具、測試、前端與發布

### L01 Max parser 無法重現 — **confirmed**
`parse_max.js` 改預設讀 `data/_max_db.md`（缺檔時列出取得說明並 `exit(1)`，不再有私人絕對路徑）；新增 `tools/html_to_md_max.js`（另存 HTML → markdown 行轉換，slug 化圖示 URL 避免括號破壞正則）；`parse_max` 輸出帶 `fetched` 撈取日；`data/_max_db.md` 入 `.gitignore`。
證據：今日 pokemondb 現頁 → 轉檔 → parse → `153 筆／18 G-Max`，與基準 `git show 97ed136:data/max.json` 全欄位 **零 drift**。

### L02 Max parser 形態錯配 — **already fixed（本批以零 drift 比對確認）**
`matchMaster()` 本就先取型態完全一致、雙向 includes 回退仍比 base 行優先；處置＝以全量 153 筆 dm/dmg 欄位逐筆對比基準（含 chronically 易混的 Toxtricity 兩形態、Darmanitan 標準模式、批判性雙向 includes 邊界），零漂移即為證據；同名未來新增行由 `takenIds` 去重防呆（already implemented）。
證據：`node -e` 比對腳本輸出 `drift: 0`。

### L03 核心單元測試不足 — **confirmed**
新增 `tools/test_core.js`：pveCycle 能量模型（3 案）、maxRate（2 案）、ivRank（6 案含同分同名次／半級／暗影）、searchPlan（7 案）、esc（3 案）、cpmOf 官方值（3 案）＝**24 項全綠**，手算錨點（17.6923／60／rank=245）在案。
證據：`npm test` 輸出；`package.json` `test` 腳本擴為 test_core＋audit。

### L04 Audit 漏掉高風險資料 — **confirmed**
`audit_data.js` 新增：暗影高價值誤判**阻擋**（PvP≤150／PvE≥90／屬性分榜≥95 不得 tier3，含 join 顯示 bug 修正）；`_gmax`/`_dmax` 行 tp 覆蓋檢查；tier0 正當事由白名單擴充（tp≥97／eternatus）；`meta.incomplete` 與撈取日陳列；盃賽撈取日過期警告。
證據：曾實際抓到 `staraptor_shadow` 誤判 tier3（flying 分榜 95）→ judge 修正後回歸綠；audit exit 0。

### L05 CI／部署驗收缺口 — **confirmed**
新增 `.github/workflows/ci.yml`：`npm test` → build 重跑零 diff（可重現）→ bump 重跑零 diff（快取 hash 冪等）→ 全部 JS `node --check`。CI 只檢驗，不做任何部署（gh-pages 仍人工）。
證據：workflow 檔案內容；本機等價指令（build/bump 重跑零 diff）已操作通過。

### L06 收藏只是形態標記 — **confirmed（部分）；逐隻名冊列後續**
標註升級：詳情頁加「標記只到型態粒度、只存本機 localStorage」明示＋「備份我的標記／匯入備份」按鈕（JSON 下載／上傳，帶格式與型態 id 驗證、無效項略過數量回報）。逐隻（多隻不同個體）名冊管理列入後續待辦。
證據：`site/js/app.js` marksExport／marksImport handlers＋modal 文案；smoke UI 元件存在（匯入流程的互動驗證屬瀏覽器檔案 API，元件渲染已確認）。

### L07 HTML 插值防護 — **confirmed**
`core.js esc()`（全跳脫 `<>&"'`）；`app.js` 所有資料值插值點改經 `CORE.esc`（卡面、詳細頁標題/理由/招式/tooltip/modal/圖 alt）；數值／固定 id 白名單插值不變。
證據：`tools/test_core.js` esc 3 案（含串接攻擊 payload 字串直接變文字）；DOM 載入 1718 卡零 console 錯誤。

### L08 外部圖示 fallback — **confirmed（本批落實）**
卡面與詳細頁 `onerror` 即時退回 PokeAPI 全國圖鑑圖（`this.onerror=null` 防迴圈）；uicons 未收錄（farigiraf）由 audit 警告清點。
證據：瀏覽器 smoke 1718 卡載入零 console 錯誤（含 fallback 行為不打爆）。

### L09 前端無障礙與手機回歸 — **design decision（關鍵項已做，全量手機實測列入限制）**
本批完成：mixWarn modal `role="alertdialog"`＋`aria-modal`＋Esc 關閉＋焦點管理（打開聚焦關閉鈕、關閉還原焦點）；卡片 `tabindex/role/aria-label`（基準已有）；`esc` 後文字可直接被螢幕閱讀器讀出。桌面 smoke（1718 卡渲染／搜尋／篩選／詳細頁/modal/IV/複製）完成，console 零錯誤；**手機實機瀏覽回歸**與完整螢幕閱讀器逐項實測未做，列入「已知限制」。
證據：smoke evaluate 輸出（aria attributes 皆真）；L09 部分項目留待後續。

### L10 缺少 before/after 異動報告 — **confirmed**
新增 `tools/diff_tiers.js` 對照基準 `data/_baseline_v25.json`（1718 型態 243/363/733/379）→ 修正後（284/341/801/292）：**141 筆評級變化；「轉為可傳送」＝0 筆；防護升級 87 筆**（→必留 2：暗影椰蛋樹、暗影阿勃梭魯；→建議保留 12；→看情況 73），其餘 54 筆為保全/保護類升級或 _dmax/_gmax 相關新型態理由插入。完整報告 `docs/tier-diff-2026-11-05.md` 逐筆附修正後理由。代表性案例（戰槌龍、暗影超夢、暗影巨金怪、極巨龍頭地鼠、超極巨噴火龍、極巨幸福蛋、過動猿、無極汰那）逐一抽查，全數合理且方向與社群共識一致。
證據：報告文件＋抽查輸出（本表 H8/H10 與對話記錄）。

## 全量回歸與測試證據（共通）

- `npm test`：core 24 項＋audit 9 節全綠（exit 0）
- `node tools/build_data.js`：1718 型態 284/341/801/292；已知非新警告：PvE 招式 fallback 25 次、uicons 缺 farigiraf、進化方向覆寫差異 11 處明細；`警告`全為已揭露事
- `node tools/bump.js`：hash `css=ec67425da6 core=dc201f81ea js=245023b4c8 data=58f80964b1`；重跑零 diff
- `node tools/diff_tiers.js`：141 筆變化、**0 筆轉可傳送**
- 瀏覽器 smoke（桌面、8600 dev server）：console 零錯誤；mixWarn／IV／D-Max 快招屬性／G-Max 專屬／瓶蓋訓練／淨化文案／篩選搜尋全走通

## 未解限制（誠實揭露）

1. **模型常數**：`HITS_PER_METER=25`、極巨攻擊取 L3 威力尺度（350/450）為揭露的相對指標，非精算模擬；Max+ 威力級（+100）不影響同池相對排序。
2. **屬性分榜第二屬性期望中性**：弱點盤面以「boss 對 X 屬性蓄力漏洞」為名目建模，快招僅在同屬性時 ×1.6（弱點定性不消失），蓄力段一律 ×1.6；實戰含 boss 防禦立場／天氣／輸入時機。
3. **盃賽清單固定**：特殊盃清單為寫死清單（長期有效格），撈取日過期 audit 警告但沒有自動刪除機制。
4. **L06 逐隻名冊**：備份／匯入已做，逐隻（多個體）名簿管理待後續。
5. **L09 手機實機與全量 a11y 實測**未執行（桌面 smoke 與 aria 結構已驗證）。
6. `meta.date` 為 UTC 日，本機午夜前後可能較本機日早 1 天。
7. 極巨攻擊屬性資料的物種↔G-Max 招式映射（`MAX_GMAX_MOVE`）是 build 唯一人工表（GM 內無該對照），18 筆已與 pokemondb 現頁核對；未來新 G-Max 物種要人工補表（build 有映射失敗 fail-loud）。

---

# 第二輪審查（issue #2，R01–R14）逐項處置表

原文：GitHub issue #2（二輪審查）。同在 `audit-fix-32` / Draft PR #1 追加修正。
驗證通用證據：`npm test`（core 0 失敗＋整合測試 40 項全過＋audit「全部檢查通過」）、
`node tools/build_data.js` 重建（1718 型態 280/341/796/301）、雙基準報告
`docs/tier-diff-2026-11-06.md`（vs 修正前 v25）與 `docs/tier-diff-2026-11-06-vs-prev.md`（vs 修正前提交 HEAD）、
瀏覽器 smoke（console 零錯誤＋四項重點檢查，詳見下）。

### R01 bump hash 對 checkout 換行符敏感 — **confirmed**
`tools/bump.js` 改為 hash 前正規化（去 BOM＋CRLF→LF），checkout 行尾差異不再造成假 hash 變化。
證據：連跑兩次輸出相同 `css=d8b0b104fb core=0bfa76a007 js=483188647e data=2046f86856`；CI 期望的 css hash 一致。

### R02 G-Max 物種的 `_dmax` 行繼承專屬招式／450 威力 — **confirmed**
`dmxCalc(p, dmg, fixedVfx)` 一律拆行後逐行重算：`_gmax`＝450＋`MAX_GMAX_MOVE`、
蒼響／藏瑪然特＝R06 專屬鋼屬 350、其餘 D-Max＝350＋快招屬性；每行 `dmx.mode` 揭露 `'gmax'/'dmax'`。
證據：整合測試 R02 區塊（charizard／venusaur／blastoise 三組拆行 dmx 各自獨立、`_dmax` dps < `_gmax` dps）；修正前此測試必失敗。

### R03 搜尋字串只比對篩選名單 — **confirmed**
`core.js searchPlan(rows, dbRows)` 吃整個資料庫 `{dex,id,keep,shadow,max}`；名單外的同編號「保留個體」
（會被編號搜尋一起選中）也記入 `mixedDexes` 強制警告。呼叫端（app.js copyList）現對照全型態。
證據：整合測試 R03 區塊以真實案例 #45（vileplume 可送＋vileplume_shadow 保留）驗證 `mixedDexes=['45']`；瀏覽器 smoke 名單外警告列出「霸王花（暗影）」。

### R04 audit 數值比較會誤／暗影保護不足 — **confirmed（反向稽核抓出真誤判）**
`audit_data.js` 比較處補 `Number.isFinite` 過濾；tpTop `Math.min`→`Math.max`（「任一屬性很強」取最大值）；
新增 `shadowValuable()`（build_data.js）：任一聯盟（含 500）前 150／PvE 前 10%／屬性分榜前 5%（pct≥95）的暗影
不得判可傳送——judge 一般分支與 NFE 連坐兩處套用，與 audit 同規則。audit 支援 `argv[2]` 路徑供反向測試。
**反向稽核真實成果**：`wailmer_shadow`（500 榜 #33）與 `tirtouga_shadow`（#89）原被 NFE 連坐誤判可傳送——
`bestRank` 有 1500 名次時不看 500 榜，與 audit 暗影規則不一致；統一後兩筆獲保護（「未完全進化」保留）。
證據：修正後 audit「全部檢查通過」；整合測試注入假高價值暗影 exit≠0、無風險假資料不誤報（反向測試）。

### R05 普通屬性蓄力招混入弱點分榜 — **confirmed**
`tpDps` 分榜跳過 `cType==='normal'`（普通屬性沒有 ×1.6 弱點對象，分榜不成立）。
證據：整合測試「全部型態的 tp 皆無 normal 鍵」；porygon 系／雷吉奇卡斯等不再被假分榜灌級。

### R06 蒼響／藏瑪然特被當成超極巨化 — **confirmed**
2026-11-06 核實（PokeMiners GM `max_behemoth_blade`／`max_behemoth_bash`）：兩者是**真 Dynamax**（D-Max 級 350），
Max 招式為專屬鋼屬；前端依 `dmx.mode` 分流詳細頁文案。
證據：整合測試 R06 區塊（tp='steel'、mode='gmax'、fixed）；瀏覽器 smoke 詳細頁三種文案分流正確。

### R07 無極汰那 tier0「錯過無法再捕」不成立 — **confirmed（推翻第一輪 H10 處置）**
翻案依據：Dynamax Cannon 是**一般蓄力招**（GM power 80/−45 能量；PvE 215）＋冒險效果
（Max 招式全隊升 1 級 10 分鐘，5,000 星塵＋30 糖——排除蒼響／藏瑪然特）；
Max Finale 2025-08 首發、Dynamax Trails 2026-11-16~23 回歸可再捕 → 改評 tier1
「傳說寶可夢：至少保留一隻」＋理由明示活動期間限定與冒險效果；極巨攻擊＝快招屬性的一般極巨攻擊。
證據：整合測試 R07 區塊（dmx.mode='dmax'、非 tier0、理由含回歸資訊）；vs-prev 報告 t0→t1 列名。

### R08 HITS_PER_METER=25 未驗證敏感度 — **design decision（揭露＋已驗證不敏感）**
敏感度分析：N∈{15,20,25,30,35} 五組重算，`dmx.pct≥90` 成員 17 筆完全一致 → 門檻判定不隨 N 變動；
`HITS_PER_METER` 維持 25 並在 `core.js` 註記分析結果。
證據：五組成員集合逐一交集＝17/17。

### R09 過期盃賽榜影響評級 — **confirmed**
`CUP_FRESH_DAYS=45`：盃賽榜超過 45 天未重抓 → 停用「限制盃人選」評級升級與 NFE cupTop10 保護，
記入 `meta.incomplete` 揭露。
證據：整合測試 R09/R12 區塊（過期必有揭露）；build 輸出含盃賽撈取日。

### R10 parse_max 合併語意依賴行序 — **confirmed（含真 bug 修復）**
真 bug：dedupe key 未含型態（`m[2]`）——真頁面上同 species 的 Dynamax／Gigantamax 行名稱 cell 完全相同，
key 不含 m[2] 時第二行永遠被略過，G-Max 標記帶不帶起來全看行序。修復後 key 加 `m[2].toLowerCase()`＋
first-seen 改為合併語意；並抽出純函式 `parseMaxEntries`／`buildIndex` 供測試。
證據：CLI 重跑 153 筆／18 G-Max 與舊結果完全一致（舊資料靠 G-Max 行在前倖存）；整合測試「先 G 後 D / 先 D 後 G 不變」（修正前必失敗）。

### R11 mixWarn modal 焦點／Esc 行為 — **confirmed**
先存還原目標再移動焦點（先 focus 會把還原目標弄丟）；Esc 在 modal 開啟時只關 modal、攔截傳播
避免同時觸發底層詳情面板的關閉。
證據：`app.js` R11 段註解；瀏覽器 smoke 開關 modal 正常。

### R12 來源缺漏靜靜吞掉 — **confirmed**
缺 `cup_rankings.json`（直接影響「限制盃人選」評級）、極巨招式缺失（VN_BM_*）、G-Max 物種映射失敗——
三者皆直接中止建置（fail-loud），不再降級為警告。
證據：`build_data.js` 三處 `process.exit(1)`；現行建置 exit 0（無缺漏）。

### R13 diff_tiers 基準檔依賴 gitignored 快照＋from=0 誤過濾 — **confirmed（修了兩處）**
① 基準支援 `git:<revision>`，預設 `git:97ed136`（已驗證與 `_baseline_v25.json` 逐位元組相同）＋可自訂輸出檔名；
② `r.from=0`（falsy）使 t0→t1 升降級被誤吞進拆行註記 → 改以 `'note' in r` 區分，4 筆 t0→t1 重回升降級表。
證據：vs-prev 報告其餘升降級 9 筆含 eternatus／regigigas／regigigas_shadow／porygon_z_shadow。

### R14 缺整合／反向測試 — **confirmed**
新增 `tools/test_integration.js`（40 項：具體物種×實際規則交叉驗證＋反向測試——修正前必失敗、修正後通過；
反向稽核用 subprocess 注入假資料驗 returncode）；package.json 增 `test:core`／`test:integration`。
證據：`npm test` 全綠。

## 第二輪升降級雙基準複核

- vs v25：36 筆變化——**12 筆轉可傳送、81 筆防護升級**（其中晉升必留 2 筆：exeggutor_shadow／absol_shadow，
  依據 tp≥97 真屬性分榜；`docs/tier-diff-2026-11-06.md` 逐筆附理由）。逐筆複核通過：
  exeggutor／absol／gigalith_shadow 有真 tp≥97 分榜依據、porygon_z（1500 榜 #1133、PvE 75.2%）→t3 合理。
- vs HEAD：22 筆——11 筆轉可傳送（每筆皆附理由複核）、2 筆防護升級、9 筆其餘升降級
  （含 salamence_shadow t1→t0＝PvE 前 3% 實力提升；eternatus／regigigas 等 t0→t1＝R07/R06 翻案；
  wailmer／tirtouga_shadow 獲 R04 保護）。完整理由見 `docs/tier-diff-2026-11-06-vs-prev.md`。

## 第二輪瀏覽器 smoke

dev server（`python -m http.server 8601 --directory site`）：① console 0 error；
② R06 三種「極巨戰招式」分流文案（_gmax 專屬超極巨招式／_dmax 快招屬性／蒼響專屬 Max 招式鋼屬固定）；
③ R03 名單外保留個體警告（#45 名單外列出「霸王花（暗影）」）；④ modal 手機可用（.modalbox max-height 80vh＋可捲動）、
頁面無水平溢位、`@media` 斷點存在。
