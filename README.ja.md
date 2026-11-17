# hinote

[English](README.md)

Hono / Hono/JSX でスライドを書くツールです。デッキそのものが Hono アプリなので、Hono を動かせる方法ならどれでも表示できます。配るときは画像以外を1つの HTML にまとめます。

## スライドを書く

`deck.tsx` の default export がデッキです。

```tsx
import { Center, Step, createSlide } from "hinote";
import points from "./slides/points.tsx";

export default createSlide(
  {
    aspect: "16:9",
    theme: {
      colors: { bg: "#0f1115", fg: "#f8fafc", accent: "#38bdf8" },
      typography: { h1: "7rem", body: "2.25rem" },
    },
  },
  [
    createSlide({ title: "hinote", notes: "話す内容" }, () => (
      <Center>
        <h1>hinote</h1>
        <ul>
          <Step as="li">1ステップ目で出る</Step>
          <Step as="li">2ステップ目で出る</Step>
        </ul>
      </Center>
    )),
    points,
  ],
);
```

`createSlide` の書き方は4つです。

- `createSlide(render)` は1枚です。
- `createSlide({ notes, title, background, class, theme }, render)` は、ノートや背景を付けた1枚です。
- `createSlide([slide, deck])` はデッキです。配列の中にあるデッキは、中のスライドを前から順に取り出して1列にします。
- `createSlide({ title, theme, aspect }, [...])` は設定付きのデッキです。`title` は文書のタイトルです。`aspect` はキャンバスの比率で、`"16:9"`（既定）、`"4:3"`、任意の `"W:H"` を渡せます。`title` と `aspect` は一番外のデッキだけに書けます。入れ子のデッキの `theme` は中のスライドに効き、スライド自身の `theme` がそれより優先します。

スライドは、高さ 1080px でデッキの比率のキャンバスに描かれ、キャンバスごとウィンドウに合わせて拡大縮小されます。

`<Step>` は、中身を1ステップずつ出します。番号は書いた順に増えます。`at={n}` を付けると n 番目のステップで出し、`as="li"` で要素の種類を選べます。`data-hinote-step="n"` を付けた要素も同じように扱います。

レイアウトは `Center`、`Column`、`Row` です。渡せる props は `gap`、`align`、`justify` です。`gap` に数値を渡すと、テーマの `spacing.unit` にその数を掛けた間隔になります。

テーマは `--hinote-bg` のような CSS 変数になります。スライドに `theme` を書くと、その1枚の変数だけを上書きします。

## 表示する

このリポジトリでは Bun で動かします。

```bash
bun src/cli.ts dev examples/deck.tsx
bun src/cli.ts dev deck.tsx --port 4321
bun src/cli.ts build deck.tsx -o dist/index.html
bun src/cli.ts insert Next --at 2
bun examples/deck.tsx
```

`dev` は <http://127.0.0.1:4321> にデッキを、`/presenter` に発表者画面を出します。デッキのディレクトリの中のファイルが変わるとデッキを読み直し、開いているページも読み直します。読み込みに失敗したときはエラーを出し、前のデッキを出したままにします。`dev` は、デッキのあるディレクトリの中のファイル（画像など）も配信します。ディレクトリの外へ出るパスは拒否します。

デッキは Hono アプリなので、`bun deck.tsx` でも（ポート 3000 で）表示できます。別のアプリの中で `app.route("/talk", deck)` としても動きます。`deck.get(...)` で自分のルートも足せます。`dev` を使わないときは、読み直しもファイル配信もしません。画像が要るなら `serveStatic` を自分で足してください。

`/3` で3枚目を、`/presenter/3` でその発表者画面を開きます。パスはそれ以上入れ子にしません。ステップは URL に入らないので、読み直すとそのスライドは何も出ていない状態から始まります。

スライドは、左右と上下の矢印、Page Up、Page Down、Space、Enter、Backspace、Home、End で送れます。進めるときは、次のスライドへ移る前にステップを1つずつ出します。戻るときは、前のスライドへ全部出した状態で戻ります。

ポインタは発表者画面から視聴画面へ送られます。どちらの画面で送っても、もう一方が同じ位置へ移ります。後から開いた画面は、発表者画面の位置に合わせます。サーバーで表示しているページは、デッキ自身を通して同期します（`/_hinote/events` の SSE と `/_hinote/sync` への POST）。そのため、サーバーに届く別の端末のページも追従します。書き出した HTML は、同じオリジンのウィンドウ同士で `BroadcastChannel`（`hinote-sync`）を使って同期します。`file://` で開いた2つのコピーは同期しません。書き出した HTML では、位置はハッシュ（`#3`）に入り、発表者画面は `?presenter` です。

`build` は画像の URL を書き換えません。画像は、その HTML から読める場所に置いてください。

`insert` は `slides/<Name>.tsx` を作り、default export が設定なしの `createSlide([...])` 1つだけのデッキに import を足します。`<Name>` は JavaScript の識別子にしてください。

## hinote を開発する

`src/client.ts` はブラウザで動くコードです。ページには、ここから生成した `src/client.generated.ts` を埋め込みます。そのため、描画のたびにバンドラを動かすことはありません。クライアントを変えたら `bun run build:client` を実行してください。生成ファイルが古いままだと `bun test` が失敗します。
