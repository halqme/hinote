# サンプル: 週末の焙煎をコードで回す

[English](README.md)

自宅のコーヒー焙煎を Raspberry Pi で自動化した、という架空の5分 LT です。実際の発表と同じ書き方で作りました。

リポジトリのルートで次を実行すると表示できます。

```bash
bun run dev
```

## 構成

```
examples/
├── deck.tsx                  デッキの設定と並び
├── style.css                 全部のスライドに効く CSS
├── slides/                   1枚1ファイル
├── components/               スライドで使う自作の部品
├── data/roasts.json          焙煎12回分の記録
└── images/setup.svg          構成図
```

## 見どころ

| ファイル                                               | 見どころ                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `deck.tsx`                                             | デッキの設定と、独自の値（`surface`）を足したテーマ。4〜5枚目を入れ子のデッキにまとめ、その部分だけ `transition: "slide"` にしている |
| `slides/title.tsx`                                     | `Center` で中央に置いたタイトル                                                                                                      |
| `slides/agenda.tsx`                                    | リストの中の `<Step as="li">`                                                                                                        |
| `style.css`                                            | `deck.tsx` で `css` として渡した、全部のスライドに効く CSS。`.card` と目次のリストの見た目                                           |
| `slides/problem.tsx`、`components/Card.tsx`            | 自作のコンポーネントを `data-hinote-step` で順に出す。2枚のカードが同時に出る                                                        |
| `slides/setup.tsx`                                     | デッキの隣に置いた画像                                                                                                               |
| `slides/code.tsx`                                      | `<Code>`                                                                                                                             |
| `slides/results.tsx`、`components/FirstCrackChart.tsx` | async コンポーネントが `data/roasts.json` を読み、標準偏差を計算して棒グラフを描く                                                   |
| `slides/thanks.tsx`                                    | その1枚だけのテーマ、transition、CSS                                                                                                 |

`FirstCrackChart.tsx` は、`new URL("../data/roasts.json", import.meta.url)` でデータを読みます。`hinote dev` でも `hinote build` でも、自分のファイルからの相対パスで読めます。
