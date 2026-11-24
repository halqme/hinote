// Kept as a reference so the published declarations carry the types of
// `with { type: "text" }` CSS imports to the app.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./css-module.d.ts" preserve="true" />
export type { Aspect, Deck, DeckOptions } from "./deck/deck.ts";
export { Code } from "./components/code.tsx";
export type { CssInput, CssSource } from "./deck/css.ts";
export type { CodeProps } from "./components/code.tsx";
export { Card, Center, Column, Flow, Grid, Row } from "./components/layout.tsx";
export type {
  CardProps,
  FlowProps,
  GridProps,
  LayoutProps,
} from "./components/layout.tsx";
export { Link } from "./components/link.tsx";
export type { LinkProps } from "./components/link.tsx";
export { Table } from "./components/table.tsx";
export type { TableProps } from "./components/table.tsx";
export { createSlide } from "./deck/create.ts";
export type { SlideInput } from "./deck/create.ts";
export type {
  Slide,
  SlideContext,
  SlideOptions,
  SlideRender,
} from "./deck/slide.ts";
export { Script } from "./components/script.tsx";
export type { ScriptProps } from "./components/script.tsx";
export { Step } from "./components/step.tsx";
export type { StepProps } from "./components/step.tsx";
export type { Theme } from "./deck/theme.ts";
export { themes } from "./deck/theme.ts";
export type { Transition } from "./deck/transition.ts";
