# hinote

[English](README.md)

Hono / Hono/JSX でスライドを書くツールです。編集中はローカルサーバーで表示し、配るときは画像以外を1つの HTML にまとめます。

## スライドを書く

`deck.tsx` の default export がスライドの並びです。`theme` を named export すると、全スライドの CSS 変数の初期値になります。

```tsx
import { Center, Column, Row, createSlide, type Theme } from "hinote";
import points from "./slides/points.tsx";

export const theme: Theme = {
  colors: { bg: "#0f1115", fg: "#f8fafc", accent: "#38bdf8" },
  fonts: { base: "system-ui, sans-serif" },
  typography: { h1: "4.5rem", body: "1.5rem" },
  shadows: { md: "0 12px 40px rgb(0 0 0 / 0.35)" },
};

export default createSlide([
  createSlide({ title: "hinote", notes: "話す内容" }, () => (
    <Center>
      <h1>hinote</h1>
    </Center>
  )),
  points,
]);
```

`createSlide` の書き方は3つです。

- `createSlide(render)` は1枚です。
- `createSlide({ notes, title, background, class, theme }, render)` は、ノートや背景を付けた1枚です。
- `createSlide([slide, deck])` は複数枚です。配列の中にあるデッキは、中のスライドを前から順に取り出して1列にします。

レイアウトは `Center`、`Column`、`Row` です。渡せる props は `gap`、`align`、`justify` です。`gap` に数値を渡すと、テーマの `spacing.unit` にその数を掛けた間隔になります。

テーマは `--hinote-bg` のような CSS 変数になります。スライドに `theme` を書くと、その1枚の変数だけを上書きします。表示中のスライドは、その変数で地と文字を塗ります。

## 表示する

このリポジトリでは Bun で動かします。

```bash
bun src/cli.ts dev examples/deck.tsx
bun src/cli.ts dev deck.tsx --port 4321
bun src/cli.ts build deck.tsx -o dist/index.html
bun src/cli.ts insert Next --at 2
```

`dev` は <http://127.0.0.1:4321> に視聴画面を出します。発表者画面は `/presenter` です。左に 16:9 のスライド、右にノートとページ番号が出ます。`dev` は、デッキのあるディレクトリの中のファイルも配信します。ディレクトリの外へ出るパスは拒否します。ファイルを保存しても読み直さないので、いったん止めて、もう一度 `dev` を実行してください。

スライドは、左右と上下の矢印、Page Up、Page Down、Space、Enter、Backspace、Home、End で送れます。

ポインタは発表者画面から視聴画面へ送られます。スライドは、どちらの画面で送っても、もう一方が同じ位置へ移ります。視聴画面を後から開くと、発表者画面の位置に合わせます。同期は `BroadcastChannel`（`hinote-sync`）で、同じ HTTP オリジンのページ同士だけで動きます。書き出した HTML を `file://` で開いても、ウィンドウ同士は同期しません。書き出した HTML の発表者画面は `?presenter` です。

`build` は画像の URL を書き換えません。画像は、その HTML から読める場所に置いてください。

`insert` は `slides/<Name>.tsx` を作り、`export default createSlide([...])` が1つだけのデッキに import を足します。`<Name>` は JavaScript の識別子にしてください。
