// `preload = ["hinote/preload"]` in bunfig.toml: lets `bun deck.tsx` import .css as text.
import { plugin, type BunPlugin } from "bun";
import { cssAsText } from "./css-text.ts";

plugin(cssAsText as unknown as BunPlugin);
