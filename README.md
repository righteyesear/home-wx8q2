# 外気温モニター - ファイル構成ドキュメント

## ディレクトリ構成

```
temperature-dashboard/
├── index.html          # メインHTML（約600行）
├── css/
│   └── main.css        # 全スタイル（約2400行）
├── js/
│   └── main.js         # 全ロジック（約6000行）
├── manifest.json       # PWA設定
├── sw.js               # Service Worker
├── ai_comment.json     # AI生成コメント
└── precipitation.json  # 降水データ
```

---

## 修正ガイド（どこを変更したいときにどこを見るか）

### スタイル (css/main.css)

| 変更したい内容 | セクション/キーワード |
|--------------|---------------------|
| ダークモードの色 | `:root { ... }` (行頭付近) |
| ライトモードの色 | `html.light-mode { ... }` |
| カードのデザイン | `.weather-hero`, `.stat-card`, `.chart-card` |
| グラフの見た目 | `.chart-container`, `.chart-card` |
| モバイル対応 | `@media (max-width: ...)` |
| アニメーション | `@keyframes ...` |

---

### JavaScript (js/main.js)

#### 設定・定数 (行240-330頃)
```
SPREADSHEET_ID, WEATHER_URL, UPDATE_INTERVAL
CACHE_CONFIG
```
**変更時**: APIエンドポイント、更新間隔、キャッシュ設定

---

#### 通知システム (行330-510頃)
```
toggleNotifications(), updateNotificationUI()
VAPID_PUBLIC_KEY, PUSH_SUBSCRIBE_URL
```
**変更時**: プッシュ通知の設定

---

#### テーマ・エフェクト (行510-690頃)
```
toggleTheme(), applyTheme()
updateWeatherEffects()
```
**変更時**: ダーク/ライトモード切替、天気エフェクト

---

#### API呼び出し (行690-870頃)
```
fetchAll() - メインデータ取得
loadAIComment() - AI一言コメント読込
parseSummaryCSV(), parseDailyCSV(), parseRecentCSV()
```
**変更時**: データ取得処理

---

#### ★ 降水判定システム (行870-1520頃) ★重要
```
getPrecipitationType() - 雪/みぞれ/雨のスコア判定
  → 上空気温、湿球温度、凍結高度、地上気温を総合評価
updateActualPrecipState() - Yahoo API降水状態
  → hasForecastPrecip, forecastPrecipType を設定
getWeatherOverride() - 天気表示上書き
loadPrecipitation() - 降水グラフ描画
```
**変更時**: 雪/みぞれ/雨の判定ロジック、降水グラフ

---

#### 月計算・表示 (行1520-2200頃)
```
loadMoonData() - 月データ読込・表示
calculateMoonPhase() - 月齢計算
calculateMoonPosition() - 月位置計算
updateMoonArcPosition() - 月弧表示更新
```
**変更時**: 月の表示や計算

---

#### UI更新 (行2200-2640頃)
```
updateDataAnalysis() - フッター統計
fetchAlerts() - 気象庁警報
updateUI() - メインUI更新
calculateFeelsLike() - 体感温度計算
```
**変更時**: UIの見た目や更新ロジック

---

#### ★ 一言コメント生成 (行2640-5260頃) ★最重要・最大
```
updateGreeting(temp, humidity) - メインコメント生成ロジック

優先度順:
  PRIORITY 1: 雷雨
  PRIORITY 2: 大雨
  PRIORITY 3: 雪/みぞれ
  PRIORITY 4: 強風
  PRIORITY 5: 霧
  PRIORITY 6: 警報発令中
  PRIORITY 7: 気温急変
  PRIORITY 8: 晴れ/曇り（通常時、温度帯別コメント）

温度帯:
  - 40°C以上: 危険な暑さ
  - 35-40°C: 猛暑
  - 30-35°C: 真夏日
  - 25-30°C: 夏日
  - 20-25°C: 快適
  - 15-20°C: やや涼しい
  - 10-15°C: 肌寒い
  - 5-10°C: 寒い
  - 0-5°C: 凍える
  - -5〜0°C: 氷点下
  - -10°C以下: 極寒

季節イベント対応:
  - 正月 (1/1-1/7)
  - クリスマス (12/24-25)
  - 夏祭り (7月-8月)
  - など

getWeatherConditionName() - 天気名変換
```
**変更時**: 一言コメントの内容や条件

---

#### グラフ描画 (行5260-5610頃)
```
updateCharts() - 全グラフ更新
updateChart24h() - 24時間グラフ
crosshairPlugin - クロスヘアプラグイン
```
**変更時**: グラフのスタイルやツールチップ

---

#### 初期化・イベント (行1-240 + 5610-6028)
```
init() - アプリ初期化
プルリフレッシュ処理
setupSpotlight() - スポットライト効果
initChartReordering() - グラフ並び替え
```
**変更時**: 起動処理やイベント処理

---

## バックアップファイル

| ファイル | 内容 |
|---------|------|
| `index_old.html` | 旧9400行版（分割前） |
| `index_backup_20260105_0027.html` | 作業前バックアップ |

---

## 更新履歴

- **2026/01/05**: index.htmlを外部ファイル化（CSS/JS分離）
