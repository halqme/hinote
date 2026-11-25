import { createSlide } from "hinote";
import { Brand } from "../parts.tsx";

export default createSlide(
  {
    title: "Start with hinote init, present with hinote dev",
    class: "cover",
    transition: "wipe",
  },
  () => (
    <div class="cover-body">
      <p class="dateline">Thank you · Questions welcome</p>
      <Brand />
      <div class="shell">
        <code>bunx hinote init my-talk</code>
        <code>cd my-talk &amp;&amp; bunx hinote dev</code>
      </div>
    </div>
  ),
);
