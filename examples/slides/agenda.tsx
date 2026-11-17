import { Center, Step, createSlide } from "hinote";

export default createSlide(
  { title: "今日の話", notes: "1つずつ出す。" },
  () => (
    <Center align="start" gap={4}>
      <h2>今日の話</h2>
      <ol style={{ margin: "0", fontSize: "3rem", lineHeight: "1.8" }}>
        <Step as="li">手で焼くと、毎回ちがう</Step>
        <Step as="li">温度を測って、火力を決めさせる</Step>
        <Step as="li">12回焼いてみた結果</Step>
      </ol>
    </Center>
  ),
);
