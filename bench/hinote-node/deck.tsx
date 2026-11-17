import { Center, Code, Column, Step, createSlide } from "hinote";

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
        <Step as="li">手で焼くと、毎回ちがう</Step>
        <Step as="li">温度を測って、火力を決めさせる</Step>
        <Step as="li">12回焼いてみた結果</Step>
      </ul>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>火力の決め方</h2>
      <Code lang="ts">{`
        export function nextPower(now: Reading, profile: Profile): number {
          const error = profile.at(now.elapsed) - now.beanTemp;
          return Math.min(100, Math.max(0, profile.base + error * 0.8));
        }
      `}</Code>
    </Column>
  )),
  createSlide(() => (
    <Column gap={3}>
      <h2>結果</h2>
      <p>1ハゼまでの時間のばらつきは 46 秒から 6 秒になった。</p>
    </Column>
  )),
  createSlide(() => (
    <Center>
      <h1>ありがとうございました</h1>
    </Center>
  )),
]);
