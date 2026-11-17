import { Center, Code, Column, Row, Step, createSlide } from "hinote";
import { Math } from "./math.tsx";

export default createSlide([
  createSlide(() => (
    <Center>
      <h1>週末の焙煎をコードで回す</h1>
    </Center>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>今日の話</h2>
      <ul>
        <Step as="li">焙煎の温度曲線</Step>
        <Step as="li">火力の制御</Step>
        <Step as="li">味の記録</Step>
      </ul>
    </Column>
  )),
  // Slidev: LaTeX. KaTeX renders MathML on the server; the browser draws it.
  createSlide(() => (
    <Column gap={3}>
      <h2>Slidev の得意なこと: LaTeX</h2>
      <Math tex="\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}" />
    </Column>
  )),
  // Marp: ![bg left:40%](photo). A grid with the image as the left column.
  createSlide(
    {
      css: "& { padding: 0; display: grid; grid-template-columns: 40% 1fr; } .text { padding: 48px; }",
    },
    () => (
      <>
        <div style="background: url(./photo.svg) center / cover" />
        <div class="text">
          <h2>Marp の得意なこと: 背景画像</h2>
          <p>左の 40% に写真、右に本文。</p>
        </div>
      </>
    ),
  ),
  // hono-decks: layout: two-cols. Two columns with Row.
  createSlide(() => (
    <Row gap={6}>
      <Column gap={2}>
        <h2>hono-decks の得意なこと: 2段組</h2>
        <p>左の段の本文。</p>
      </Column>
      <Column gap={2}>
        <h2>右の段</h2>
        <p>右の段の本文。</p>
      </Column>
    </Row>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>焙煎の温度曲線（1）</h2>
      <ul>
        <li>焙煎の温度曲線の要点その1</li>
        <li>焙煎の温度曲線の要点その2</li>
        <li>焙煎の温度曲線の要点その3</li>
      </ul>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>豆の産地のコード</h2>
      <Code lang="ts">
        {
          "export function part2(input: number): number {\n  const doubled = input * 2;\n  return doubled + 2;\n}"
        }
      </Code>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>火力の制御の比較</h2>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>前</th>
            <th>後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>時間</td>
            <td>30 分</td>
            <td>21 分</td>
          </tr>
          <tr>
            <td>回数</td>
            <td>3</td>
            <td>6</td>
          </tr>
        </tbody>
      </table>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>センサーの配線について</h2>
      <blockquote>
        「センサーの配線は、やってみると思っていたより奥が深い。」
      </blockquote>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>ログの取り方（5）</h2>
      <ul>
        <li>ログの取り方の要点その1</li>
        <li>ログの取り方の要点その2</li>
        <li>ログの取り方の要点その3</li>
      </ul>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>失敗した回のコード</h2>
      <Code lang="ts">
        {
          "export function part6(input: number): number {\n  const doubled = input * 2;\n  return doubled + 6;\n}"
        }
      </Code>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>味の記録の比較</h2>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>前</th>
            <th>後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>時間</td>
            <td>70 分</td>
            <td>49 分</td>
          </tr>
          <tr>
            <td>回数</td>
            <td>7</td>
            <td>14</td>
          </tr>
        </tbody>
      </table>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>道具の値段について</h2>
      <blockquote>
        「道具の値段は、やってみると思っていたより奥が深い。」
      </blockquote>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>焙煎の温度曲線（9）</h2>
      <ul>
        <li>焙煎の温度曲線の要点その1</li>
        <li>焙煎の温度曲線の要点その2</li>
        <li>焙煎の温度曲線の要点その3</li>
      </ul>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>豆の産地のコード</h2>
      <Code lang="ts">
        {
          "export function part10(input: number): number {\n  const doubled = input * 2;\n  return doubled + 10;\n}"
        }
      </Code>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>火力の制御の比較</h2>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>前</th>
            <th>後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>時間</td>
            <td>110 分</td>
            <td>77 分</td>
          </tr>
          <tr>
            <td>回数</td>
            <td>11</td>
            <td>22</td>
          </tr>
        </tbody>
      </table>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>センサーの配線について</h2>
      <blockquote>
        「センサーの配線は、やってみると思っていたより奥が深い。」
      </blockquote>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>ログの取り方（13）</h2>
      <ul>
        <li>ログの取り方の要点その1</li>
        <li>ログの取り方の要点その2</li>
        <li>ログの取り方の要点その3</li>
      </ul>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>失敗した回のコード</h2>
      <Code lang="ts">
        {
          "export function part14(input: number): number {\n  const doubled = input * 2;\n  return doubled + 14;\n}"
        }
      </Code>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>味の記録の比較</h2>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>前</th>
            <th>後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>時間</td>
            <td>150 分</td>
            <td>105 分</td>
          </tr>
          <tr>
            <td>回数</td>
            <td>15</td>
            <td>30</td>
          </tr>
        </tbody>
      </table>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>道具の値段について</h2>
      <blockquote>
        「道具の値段は、やってみると思っていたより奥が深い。」
      </blockquote>
    </Column>
  )),
  createSlide(() => (
    <Center>
      <h1>ありがとうございました</h1>
    </Center>
  )),
]);
