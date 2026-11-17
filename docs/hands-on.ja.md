# hinote ハンズオン

[English](hands-on.md)

新しいプロジェクトを作り、スライドを足して見た目を整え、発表して配るところまでを順に試します。20分ほどで終わります。

用意するのは [Bun](https://bun.com) か [Node.js](https://nodejs.org) です。以下は Bun のコマンドで書いています。Node では `bunx` を `npx` に読み替えてください。

## 1. プロジェクトを作る

```bash
bunx hinote init my-talk
cd my-talk
```

`init` はファイルを書き出したあと、パッケージのインストールまで行います。`my-talk` に次のファイルができます。

- `deck.tsx`: スライドを書くファイルです。3枚入っています。
- `style.css`: 全部のスライドに効く CSS です。`deck.tsx` が import しています。
- `tsconfig.json`: JSX を `hono/jsx` で読む設定です。
- `package.json`: `hinote` と `hono` に依存しています（Node で作ったときは、CLI が使う `esbuild` と `@hono/node-server` も入ります）。

## 2. 表示する

```bash
bunx hinote dev
```

ブラウザで <http://127.0.0.1:4321> を開きます。`→` や Space で進み、`←` で戻ります。2枚目では、箇条書きが1つずつ出てから次のスライドへ進みます。

`Port 4321 is in use` と出たら、別の番号を渡してください。

```bash
bunx hinote dev --port 4322
```

## 3. 1枚目を書き換える

`deck.tsx` を開き、1枚目の `<h1>My talk</h1>` を好きなタイトルに変えて保存します。ブラウザが自動で読み直し、同じスライドのまま新しい文字が出ます。

`createSlide({ title, notes }, () => ...)` の `notes` は発表者用のメモです。あとで発表者画面に出ます。

## 4. スライドをファイルに分けて足す

スライドが増えてきたら、1枚ずつ別のファイルに分けられます。`slides/about.tsx` を作ります。

```tsx
import { Center, createSlide } from "hinote";

export default createSlide({ title: "About", notes: "自己紹介" }, () => (
  <Center gap={2}>
    <h2>自己紹介</h2>
    <p>ここに名前</p>
  </Center>
));
```

`deck.tsx` で import し、並びに入れます。配列の順番がスライドの順番です。

```tsx
import about from "./slides/about.tsx";

// ...

  [
    title,
    about,
    points,
    code,
  ],
```

## 5. 画像を置く

`images/` を作って画像を入れ、相対パスで参照します。

```tsx
<img src="./images/logo.png" alt="ロゴ" width="200" />
```

`dev` は、`deck.tsx` のあるディレクトリの中のファイルを配信します。発表者画面（`/presenter/2` など）でも、パスはデッキのルートから解決されます。

## 6. 一歩ずつ見せる

`<Step>` で囲んだものは、キーを押すたびに1つずつ出ます。2枚目がその例です。

```tsx
<ul>
  <Step as="li">一つ目</Step>
  <Step as="li">二つ目</Step>
  <Step as="li">三つ目</Step>
</ul>
```

- `as` は出力する要素です。既定は `div` です。リストの中なら `"li"` にします。
- `at={n}` を付けると、n 番目のステップで出ます。同じ番号を付けたものは同時に出ます。
- 戻るときは逆順に隠れ、前のスライドへは全部出た状態で戻ります。

## 7. コードを見せる

3枚目は `<Code>` の例です。周りの字下げは自動で取り除かれます。

```tsx
<Code lang="ts">{`
  const answer = 42;
`}</Code>
```

色のテーマは `hinote/code-themes` から選べます。

```tsx
import { githubLight } from "hinote/code-themes";

<Code lang="ts" theme={githubLight}>{`...`}</Code>;
```

## 8. 見た目を変える

デッキ全体の設定は、`deck.tsx` の最後の `createSlide` の第1引数に書きます。

```tsx
export default createSlide(
  {
    aspect: "4:3",
    transition: "slide",
    css: style,
    theme: {
      colors: {
        bg: "#fffaf0",
        fg: "#1f2937",
        accent: "#ea580c",
        brand: "#ea580c",
      },
      fonts: { base: "'Hiragino Sans', sans-serif" },
    },
  },
  [title, about, points, code],
);
```

- `aspect` はキャンバスの比率です。`"16:9"`（既定）、`"4:3"`、任意の `"W:H"` を選べます。
- `transition` はスライドが入ってくるときの動きです。`"none"`、`"fade"`、`"slide"` から選びます。
- `theme` の値は CSS 変数になります。`colors.brand` のように自分で名前を足すと `var(--hinote-color-brand)` として使えます。

- `css` は全部のスライドに効く CSS です。`deck.tsx` の先頭で、`style.css` を `import style from "./style.css" with { type: "text" }` と文字列として読み込んでいます。

`style.css` には普通の CSS を書けます。セレクタはスライドの中に効き、`&` はスライドそのものです。`theme` で足した値も使えます。

```css
h2 {
  color: var(--hinote-color-brand);
}

& {
  padding: 64px 96px;
}
```

1枚だけ変えたいときは、そのスライドの `createSlide` に `theme`、`transition`、`css` を書きます。スライドの `css` は、`style.css` より優先されます。

## 9. 発表する

<http://127.0.0.1:4321/presenter> を開きます。左が今のスライドで、右には次の画面のプレビュー、経過時間、時刻、ノートが出ます。

- 視聴画面（`/`）を別のウィンドウで開いてプロジェクタに映すと、発表者画面で送ったとおりに追従します。
- 発表者画面でスライドの上にマウスを置くと、視聴画面に赤いポインタが出ます。
- `O` で全スライドの一覧を開き、押したスライドへ移ります。
- 経過時間は押すと 0 に戻ります。
- スマートフォンなど別の端末から開くときは、`bunx hinote dev --host 0.0.0.0` で起動し、表示されたアドレスを開きます。

## 10. 配る

```bash
bunx hinote build
```

`dist/index.html` に、視聴画面だけの HTML が1つできます。使っている画像は `dist/` にコピーされるので、`dist/` をそのまま配ってください。発表者画面と同期は入りません。

発表者画面ごと Web に置きたいときは、`bunx hinote prerender` で静的サイトとして書き出せます。GitHub Pages などにそのまま置けます。

PDF にするときは、表示中のページを印刷して「PDF として保存」を選びます。スライド1枚が1ページになり、ステップはすべて出た状態です。

## 次に

- デッキは Hono アプリです。CLI を使わずに Bun・Node・Workers で配信したり、`deck.get("/api", ...)` のようにルートを足したりできます。やり方は README の [Hono アプリとして配信する](../README.ja.md#hono-アプリとして配信する) にあります。
- スライドやコンポーネントは `async` にできます。描画しながらファイルを読んだり API を呼んだりできます。
- 実際の発表に近い例は、リポジトリの [`examples/`](../examples/README.ja.md) にあります。架空の LT で、データを読んでグラフを描く async コンポーネントも入っています。
- 書き方の全体は [README](../README.ja.md) にあります。
