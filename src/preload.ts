// `preload = ["hinote/preload"]` in bunfig.toml: lets `bun deck.tsx` import .css as text.
import { plugin } from "bun";
import { cssAsText } from "./css-text.ts";

plugin(cssAsText);
