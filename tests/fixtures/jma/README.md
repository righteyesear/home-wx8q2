# JMA warning fixtures

- `raw/`: 気象庁の現行エンドポイントおよび公式過去事例ビューアから保存した未加工JSON
- `derived/`: 葛飾区 `1312200` の単体テスト向け最小JSON
- `official-samples/`: 気象庁公式の大雨レベル推移サンプルXML

`derived/level5-katsushika.json` は、葛飾区で実際に発表された記録ではありません。気象庁公式サンプルXMLの `VPWW55 / code 33 / status 発表` を、現行JSONと同じ形にしたテスト専用フィクスチャです。
