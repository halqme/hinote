// Kept as a reference so the published declarations carry the types of
// `with { type: "text" }` CSS imports to the app.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./css-module.d.ts" preserve="true" />
export type { Aspect, Deck, DeckOptions } from "./deck/deck.ts";
export type { CssInput, CssSource } from "./deck/css.ts";
export { Card, Center, Column, Flow, Grid, Row } from "./components/layout.tsx";
export type {
  Align,
  CardProps,
  FlowProps,
  Gap,
  GridProps,
  Justify,
  LayoutProps,
} from "./components/layout.tsx";
export { Link } from "./components/link.tsx";
export type { LinkProps } from "./components/link.tsx";
export { Table } from "./components/table.tsx";
export type { TableProps } from "./components/table.tsx";
export { createSlide } from "./deck/create.ts";
export type { SlideInput } from "./deck/create.ts";
export type { SlideContext, Theme } from "@hinote/types";
export type { Slide, SlideOptions, SlideRender } from "./deck/slide.ts";
export { Script } from "./components/script.tsx";
export type { ScriptProps } from "./components/script.tsx";
export { Morph } from "./components/morph.tsx";
export type { MorphProps } from "./components/morph.tsx";
export { Step, Steps } from "./components/step.tsx";
export type {
  StepEffect,
  StepProps,
  StepsProps,
  Tag,
} from "./components/step.tsx";
export { themes } from "./deck/theme.ts";
export type { Transition, TransitionName } from "./deck/transition.ts";
