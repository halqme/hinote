# hinote

[English](README.md)

Hono / Hono/JSX でスライドを書くツールです。デッキそのものが Hono アプリなので、Hono を動かせる方法ならどれでも表示できます。配るときは、視聴画面を画像以外まとめて1つの HTML にします。

はじめての方は [ハンズオン](docs/hands-on.ja.md) からどうぞ。実際の発表に近い書き方は [`examples/`](examples/README.ja.md) に、Slidev・Marp とのインストールサイズや速さの比較は [比較](docs/comparison.ja.md) にあります。

## はじめる

hinote は Bun でも Node でも動きます。

```bash
# Bun
bunx hinote init my-talk
cd my-talk
bun install
bun run dev

# Node
npx hinote init my-talk
cd my-talk
npm install
npm run dev
```

`init` は `deck.tsx`、`style.css`、`tsconfig.json`（JSX は `hono/jsx`）、`hinote` と `hono` に依存する `package.json` を書き出します。Node で実行したときは、`esbuild` と `@hono/node-server` も足します。CLI は Node ではこの2つを、Bun のバンドラとサーバーの代わりに使います。既にあるファイルは上書きしません。`package.json` が既にあるときはそれに手を付けないので、パッケージは自分で追加してください（`bun add hinote hono`、または `npm install hinote hono` と `npm install -D esbuild @hono/node-server`）。

[ハンズオン](docs/hands-on.ja.md) では、ここから順に、スライド・画像・ステップ・コード・テーマを足し、発表して配るところまでを試せます。

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

スライドの render 関数と、その中のコンポーネントは `async` にできます。描画しながらファイルを読んだり API を呼んだりできます。デッキはサーバーの起動時（または読み直し時）に1回だけ描画され、`build` は全部のスライドを待ちます。

`transition` は、スライドが入ってくるときの動きです。`"none"`（既定）、`"fade"`、`"slide"` から選びます。デッキに書くと全部のスライドに、スライドに書くとその1枚に効きます。入れ子のデッキに書くと中のスライドに効きます。ステップを出すときには動かず、OS で視差効果を減らす設定にしているときも動きません。

`<Code lang="ts">{`...`}</Code>`（または `code={source}`）は、[`@pierre/highlights`](https://diffs.com/highlights) でコードに色を付けます。色はスライドを描画するときにインラインで付くので、ページでも書き出した HTML でもハイライト用の処理は動きません。周りの JSX の字下げは取り除きます。`theme` には `hinote/code-themes` のテーマ（`githubLight` など）を渡せます。既定は Pierre のダークテーマです。文字の大きさはテーマの `typography.code` です。

レイアウトは `Center`、`Column`、`Row` です。渡せる props は `gap`、`align`、`justify` です。`gap` に数値を渡すと、テーマの `spacing.unit` にその数を掛けた間隔になります。

テーマには `colors`、`fonts`、`typography`、`shadows`、`spacing` のグループと `radius` があります。グループの中の値はそれぞれ `--hinote-<グループ>-<名前>` という CSS 変数になります。グループの部分は `color`、`font`、`text`、`shadow`、`space` と書きます。たとえば `colors.bg` は `--hinote-color-bg`、`typography.h1` は `--hinote-text-h1`、`radius` は `--hinote-radius` です。

hinote 自身のスタイルが読むのは、`colors` の `bg`・`fg`・`accent`・`muted`、`fonts` の `base`・`heading`・`mono`、`typography` の `h1`・`h2`・`body`・`small`、それに `spacing.unit` です。それ以外の名前も同じように変数になります。`colors: { brand: "#f50" }` と書けば、スライドの中で `var(--hinote-color-brand)` を使えます。スライドに `theme` を書くと、その1枚で、書いた値だけを上書きします。

## CSS

デッキにもスライドにも `css` を渡せます。CSS の文字列（ふつうは `.css` ファイルをテキストとして import したもの）か、その配列です。

```tsx
import style from "./style.css" with { type: "text" };

export default createSlide({ css: style }, [
  title,
  createSlide({ css: "h2 { color: var(--hinote-color-accent); }" }, [a, b]),
  createSlide({ css: "& { padding: 0; }" }, () => <img src="./cover.png" />),
]);
```

- それぞれの CSS は、自分のスライドだけに効きます。デッキの CSS は全部のスライドに、入れ子のデッキの CSS はその中のスライドに、スライドの CSS はその1枚に効きます。発表者画面のパネルには効きません。
- 内側の CSS が勝ちます。スライドの CSS は入れ子のデッキの CSS に、入れ子のデッキの CSS は外のデッキの CSS に、セレクタの強さに関係なく勝ちます。hinote はそれぞれを [カスケードレイヤー](https://developer.mozilla.org/docs/Web/CSS/@layer) に入れ、自分の既定のスタイルを一番弱いレイヤーに置いています。そのため、渡した CSS は必ず既定のスタイルより優先されます。
- セレクタはスライドの中に対して効きます。スライドそのものは `& { ... }` と書きます。`:root`、`html`、`body` には効きません。`@keyframes` や `@font-face` などは、ファイルのどこに書いても使えます。`@import` は使えないので、ファイルごとに配列で渡してください。
- `with { type: "text" }` を付けると、ファイルを文字列（型は `string`）として import します。`hinote dev`・`hinote build`、`bun deck.tsx`、esbuild、Wrangler のどれもこの書き方を理解するので、デッキを自分で配信するときも CSS のための設定は要りません。付け忘れると import の結果がオブジェクトになり、hinote が書き方を示して知らせます。
- `new URL("./style.css", import.meta.url)` のようにファイルの URL を渡すこともできます。この場合はデッキを描画するときに読むので、ファイルを読めるランタイム（Bun、Node、Deno）が必要です。
- CSS の中の `url()` は、ページ、つまり `deck.tsx` のあるディレクトリから解決されます。

## ステップ

`<Step>` は、1枚のスライドの中身を、キーを押すたびに少しずつ見せるためのコンポーネントです。PowerPoint の「クリックで表示」アニメーションと同じ役割です。

```tsx
<ul>
  <Step as="li">一つ目</Step>
  <Step as="li">二つ目</Step>
  <Step as="li">三つ目</Step>
</ul>
```

スライドを開いた時点では、3つとも隠れています。`→` を押すたびに1つずつ出て、全部出たあとにもう一度押すと次のスライドへ進みます。`←` を押すと逆順に1つずつ隠れ、最初まで戻ったあとにもう一度押すと、前のスライドに全部出た状態で戻ります。

| prop    | 意味                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------- |
| `as`    | 出力する要素の種類です。既定は `div` です。リストの中なら `"li"`、文中なら `"span"` にします。 |
| `at`    | 何番目のステップで出すかを数字で指定します。省略すると、書いた順に 1, 2, 3… と振られます。     |
| `class` | 要素に付ける class です。                                                                      |

`at` で番号を揃えると、複数の要素を同時に出せます。

```tsx
<Step>図</Step>              {/* 1 */}
<Step at={1}>図の説明</Step>  {/* 図と同時に出る */}
<Step>まとめ</Step>           {/* 2 */}
```

- 描画すると `data-hinote-step="2"` のような属性が付いた要素になります。属性を手で書いた要素も同じように扱うので、`<img data-hinote-step="1">` のようにも書けます。
- 隠れている間は `opacity:0` と `visibility:hidden` で見えなくするだけなので、レイアウトは最初から確保されています。要素が出たときに周りの位置がずれることはありません。表示は 0.2 秒でフェードインします。
- async のコンポーネントの中に書いても、番号は書いた順に振られます。
- 発表者画面と視聴画面のあいだでは、ステップの位置まで同期します。URL に入るのはスライド番号だけなので、ページを読み直すと、そのスライドは何も出ていない状態から始まります。
- 発表者画面の「Next」には次のステップが出た状態が映ります。印刷するときは全ステップを出した状態になります。ステップを出すときには `transition` の動きは付きません。

## 表示する

```bash
hinote dev [deck.tsx] [--port 4321] [--host 127.0.0.1]
hinote build [deck.tsx] [-o dist/index.html]
```

CLI は Bun でも Node でも同じように動きます。Bun では Bun のバンドラとサーバーを使い、Node では `esbuild` と `@hono/node-server` を使います（Node で `init` すると追加されます）。Node でこの2つがないときは、Bun が入っていれば Bun に任せ、入っていなければ何を入れればよいかを知らせます。

`dev` は <http://127.0.0.1:4321> にデッキを、`/presenter` に発表者画面を出します。発表者画面には、今のスライド、次に送ったときの画面のプレビュー、経過時間、時刻、ノートが出ます。経過時間は押すと 0 に戻り、ページを読み直しても続きから数えます。`O` で全スライドの一覧を開き、押したスライドへ移ります。デッキのディレクトリの中のファイルが変わるとデッキを読み直し、開いているページも読み直します。読み込みに失敗したときはエラーを出し、前のデッキを出したままにします。`dev` は、デッキのあるディレクトリの中のファイル（画像など）も配信します。ディレクトリの外へ出るパスは拒否します。

`dev` は、このマシンからしか開けません。`--host 0.0.0.0` を付けると、同じネットワークのスマートフォンや別の PC からも開けるようになり、開くためのアドレスが表示されます。このとき、デッキのディレクトリの中のファイルはすべてネットワークから取得できるようになります。信頼できるネットワークで使ってください。

`/3` で3枚目を、`/presenter/3` でその発表者画面を開きます。パスはそれ以上入れ子にしません。ステップは URL に入らないので、読み直すとそのスライドは何も出ていない状態から始まります。

スライドは、左右と上下の矢印、Page Up、Page Down、Space、Enter、Backspace、Home、End で送れます。進めるときは、次のスライドへ移る前にステップを1つずつ出します。戻るときは、前のスライドへ全部出した状態で戻ります。

ポインタは発表者画面から視聴画面へ送られます。どちらの画面で送っても、もう一方が同じ位置へ移ります。後から開いた画面は、発表者画面の位置に合わせます。ページはデッキ自身を通して同期します（`/_hinote/events` の SSE と `/_hinote/sync` への POST）。そのため、サーバーに届く別の端末のページも追従します。

PDF にするときは、どのページでも印刷して「PDF として保存」を選んでください。スライド1枚が、キャンバスの大きさの1ページになります。ステップはすべて出した状態です。

`build` が書き出すのは視聴画面だけです。発表者画面、ポインタ、同期はありません。位置はハッシュ（`#3`）に入ります。スライドが相対パスで参照している画像などのファイル（`src`、`href`、`srcset`、CSS の `url()`）は、パスを保ったまま HTML の隣にコピーします。デッキのディレクトリの外にあるファイル、絶対パス、ほかのサイトの URL はそのままです。

## Hono アプリとして配信する

デッキは Hono アプリなので、CLI を使わずに配信することもできます。単独で動かすことも、別のアプリの中に `app.route("/talk", deck)` で置くことも、`deck.get(...)` で自分のルートを足すこともできます。`dev` を使わないときは、デッキの隣のファイルを配信するものがないので、画像を使うなら `serveStatic` を足してください。パッケージには JavaScript と型定義が入っているので、Hono が動くランタイムならどれでも配信できます。それ以上のものが要るのは `<Code>` だけです。ハイライトの処理は WebAssembly を使い、最初の `<Code>` を描画するときに読み込みます。そのため、コードを使わないデッキは、WebAssembly を使えない環境でも動きます。

### Bun

```bash
bun deck.tsx        # ポート 3000 で配信する
bun --hot deck.tsx  # 保存すると、開いているページも読み直す
```

### Node

```ts
import { serve } from "@hono/node-server";
import deck from "./deck.js";

serve({ fetch: deck.fetch, port: 4321 });
```

Node は TSX をそのまま動かせないので、先に `deck.tsx` をコンパイルします。esbuild なら次のとおりです。

```bash
esbuild deck.tsx --bundle --platform=node --format=esm --packages=external \
  --jsx=automatic --jsx-import-source=hono/jsx --outfile=deck.js
```

### Cloudflare Workers

デッキをそのまま Worker として export します。

```toml
# wrangler.toml
main = "src/deck.tsx"
compatibility_date = "2026-11-01"
```

本番の Worker は複数の isolate でリクエストを受けることがあり、同期は同じ isolate につながったページ同士にしか届きません。CSS をファイルの URL で渡す方法はファイルを読める環境が必要なので、import で渡してください。

デッキ、発表者画面、`<Code>`、CSS、同期が動くことは、3つすべてで確かめました。Bun、`@hono/node-server` を使った Node、`wrangler dev` を使った Workers です。Deno はまだ試していません。

もっと遠くから見せたいときは、普段使っているものを前に置いてください。デッキは Hono アプリなので、[Tailscale](https://tailscale.com/kb/1312/serve)、[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)、Hono が動くホスティングのどれでも配信できます。どれを使うかは hinote では決めません。同期できるのは同じプロセスに届いたページ同士だけです。

## hinote を開発する

このリポジトリでは、`bun run dev` で [`examples/`](examples/README.ja.md) のサンプルを表示できます。実際の発表と同じ書き方で作った、架空の5分 LT です。

`src/client.ts` はブラウザで動くコードです。ページには、ここから生成した `src/client.generated.ts` を埋め込みます。そのため、描画のたびにバンドラを動かすことはありません。クライアントを変えたら `bun run build:client` を実行してください。生成ファイルが古いままだと `bun test` が失敗します。

`bun run build:lib` は、ライブラリと CLI（パッケージの `bin` である `dist/cli.js`）の JavaScript と型定義を `dist/` に書き出します。パッケージにまとめる前に `prepack` が自動で実行します。Bun は `bun` の export 条件を通して `src/` を直接読みます。Node が入っている環境では、`bun test` が `dist/` をビルドして Node でも動かします。
