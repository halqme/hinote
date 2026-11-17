// Kept as a reference so the published declarations carry the types of
// `with { type: "text" }` CSS imports to the app.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./css-module.d.ts" preserve="true" />
export type { Aspect, Deck, DeckOptions } from "./deck.ts";
export type { HinoteClient } from "./client-api.ts";
export { Code } from "./code.tsx";
export type { CssInput, CssSource } from "./css.ts";
export type { CodeProps } from "./code.tsx";
export { Center, Column, Row } from "./layout.tsx";
export type { LayoutProps } from "./layout.tsx";
export { createSlide } from "./create.ts";
export type { SlideInput } from "./create.ts";
export type { Slide, SlideOptions, SlideRender } from "./slide.ts";
export { Script } from "./script.tsx";
export type { ScriptProps } from "./script.tsx";
export { Step } from "./step.tsx";
export type { StepProps } from "./step.tsx";
export type { Theme } from "./theme.ts";
export type { Transition } from "./transition.ts";
