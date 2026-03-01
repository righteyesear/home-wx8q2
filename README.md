# 🌡️ 外気温モニター

リアルタイム外気温監視ダッシュボード & 週次・月次AI分析レポートを自動生成する気象観測システムです。

**🔗 https://righteyesear.github.io/home-wx8q2/**

---

## ✨ 主な機能

### 📊 リアルタイムダッシュボード（`index.html`）
- **現在の気温・湿度・体感温度**をリアルタイム表示
- **24時間気温推移グラフ**（Chart.js）
- **降水判定システム** — 上空気温・湿球温度・凍結高度から雪/みぞれ/雨を自動判別
- **🌙 月齢・月の位置**表示（月弧アニメーション付き）
- **🤖 AI一言コメント** — Gemini APIによる天気に応じたアドバイス
- **⚡ 気象庁警報**の自動取得・表示
- **🔔 プッシュ通知**対応（Cloudflare Workers経由）
- **ダーク/ライトモード**切り替え
- **PWA対応** — ホーム画面に追加可能

### 📈 分析レポート（`report.html`）
- **週次・月次レポート**の自動生成（3時間ごとデータ更新）
- **AI分析コメント** — Gemini APIによるサマリー・前年比較・気温推移の分析
- **前年比較チャート** — 平均/最高/最低気温の切り替え機能
- **過去平均との比較バー** — 偏差をビジュアルで表示
- **気温ヒートマップ**
- **特筆イベント・季節の進み具合**

---

## 📁 ディレクトリ構成

```
temperature-dashboard/
├── index.html                 # メインダッシュボード
├── report.html                # 分析レポートページ
├── css/
│   ├── main.css               # ダッシュボード用スタイル
│   └── report.css             # レポートページ用スタイル
├── js/
│   ├── config.js              # 設定・定数
│   ├── init.js                # アプリ初期化
│   ├── main.js                # メインロジック（従来の統合版）
│   ├── weather-api.js         # 気象データAPI呼び出し
│   ├── ui.js                  # UI更新処理
│   ├── charts.js              # Chart.jsグラフ描画
│   ├── comments.js            # 一言コメント生成
│   ├── moon.js                # 月齢・月位置計算
│   ├── precipitation.js       # 降水判定・降水量グラフ
│   ├── notifications.js       # プッシュ通知
│   ├── utils.js               # ユーティリティ関数
│   └── report.js              # レポートページ用JS
├── scripts/
│   ├── report_generator.py    # レポート生成（メイン）
│   ├── ai_advisor.py          # AI気象アドバイザー
│   ├── precipitation.py       # 降水データ取得
│   ├── moon_data.py           # 月齢データ取得
│   ├── data_analysis.py       # データ分析ユーティリティ
│   └── rebuild_index.py       # レポートインデックス再構築
├── reports/
│   ├── index.json             # レポート一覧
│   ├── weekly/                # 週次レポートJSON
│   └── monthly/               # 月次レポートJSON
├── .github/workflows/
│   ├── report_update.yml      # レポート自動更新
│   ├── ai_update.yml          # AI一言コメント更新
│   └── moon_update.yml        # 月齢データ更新
├── sw.js                      # Service Worker (PWA)
├── manifest.json              # PWA マニフェスト
├── ai_comment.json            # AI一言コメントデータ
├── precipitation.json         # 降水量データ
├── moon_data.json             # 月齢データ
├── requirements.txt           # Python依存関係
└── .env                       # APIキー（Git除外）
```

---

## ⚙️ 自動更新ワークフロー（GitHub Actions）

### 📊 Report Generator（`report_update.yml`）

| タイミング | 内容 | AI分析 |
|---|---|---|
| 3時間ごと | 週次・月次レポートをデータのみ更新 | ❌ |
| 毎週月曜 6:00 JST | 週次レポート生成 | ✅ |
| 毎月1日 9:00 JST | 月次レポート生成 | ✅ |

### 🤖 AI Weather Advisor（`ai_update.yml`）

昼間（7〜22時）は毎時、夜間は1時・4時に更新（計18回/日）

### 🌙 Moon Data（`moon_update.yml`）

30分ごとに月齢・輝面率データを更新

---

## 🚀 セットアップ

### 必要なもの
- Google Sheets（気温データソース）
- Gemini API キー
- GitHub リポジトリ

### 1. ローカル環境

```bash
# 依存関係のインストール
pip install -r requirements.txt

# .envファイルを作成
cp .env.example .env
# GEMINI_API_KEY と SPREADSHEET_ID を設定
```

### 2. GitHub Secrets（Settings → Secrets → Actions）

| Secret名 | 用途 |
|---|---|
| `GEMINI_API_KEY` | AI気象アドバイザー用 |
| `GEMINI_API_KEY_REPORT` | レポートAI分析用 |
| `SPREADSHEET_ID` | Google Sheets ID |

### 3. 手動レポート生成

```bash
# 週次レポート（AI分析付き）
python scripts/report_generator.py --type weekly

# 月次レポート（AIなし）
python scripts/report_generator.py --type monthly --no-ai

# 特定の日付を指定
python scripts/report_generator.py --type weekly --date 2026-03-01

# 全期間一括生成
python scripts/report_generator.py --backfill --no-ai
```

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---|---|
| フロントエンド | HTML5, CSS3, JavaScript (Vanilla) |
| グラフ | Chart.js |
| フォント | Noto Sans JP (Google Fonts) |
| AI分析 | Google Gemini API (`gemini-3-flash-preview`) |
| データソース | Google Sheets API (CSV公開) |
| 気象警報 | 気象庁 XML API |
| 降水判定 | Yahoo 天気 API + 独自スコアリング |
| PWA | Service Worker + Web App Manifest |
| プッシュ通知 | Cloudflare Workers + Web Push API |
| CI/CD | GitHub Actions |
| ホスティング | GitHub Pages |

---

## 📱 対応デバイス

- ✅ デスクトップ（Chrome, Firefox, Safari, Edge）
- ✅ タブレット（iPad等）
- ✅ スマートフォン（iOS Safari, Android Chrome）
- ✅ PWAホーム画面追加

---

## 🔒 セキュリティ

- APIキーは `.env` に格納し `.gitignore` で除外
- GitHub Secrets でCI/CDのキーを安全に管理
- `robots.txt` で検索エンジンのインデックスを制限

---

## 更新履歴

- **2026/03/02**: レポート自動更新を3時間ごと＋週月AI分析に分離
- **2026/03/01**: 分析レポートに前年比較の最高/最低気温切り替え機能を追加
- **2026/03/01**: 0.0℃異常データの自動修正機能を実装
- **2026/01/05**: index.htmlを外部ファイル化（CSS/JS分離）
