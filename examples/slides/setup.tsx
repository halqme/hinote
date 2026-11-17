import { Center, createSlide } from "hinote";

export default createSlide(
  { title: "構成", notes: "部品は3つだけ。図は images/setup.svg。" },
  () => (
    <Center gap={4}>
      <h2>温度を測って、火力を決めさせる</h2>
      <img
        src="./images/setup.svg"
        alt="熱電対から Raspberry Pi、ヒーターへの流れ"
        width="1400"
      />
    </Center>
  ),
);
