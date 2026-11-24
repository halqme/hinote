// Types shared by hinote and the @hinote/* packages. Types only: there is no
// JavaScript, so import them with `import type`.

// Each group holds named tokens. The listed names are the ones hinote's own CSS
// reads; any other name is allowed and becomes a CSS variable the same way.
type Tokens<Known extends string> = { [K in Known]?: string } & {
  [name: string]: string | undefined;
};

export type Theme = {
  colors?: Tokens<"bg" | "fg" | "accent" | "muted" | "surface" | "border">;
  fonts?: Tokens<"base" | "heading" | "mono">;
  typography?: Tokens<"h1" | "h2" | "h3" | "body" | "small" | "code">;
  shadows?: Tokens<"sm" | "md" | "lg">;
  spacing?: Tokens<"unit" | "safe">;
  radius?: string;
};

// What a render function is told about its own slide, so a shared heading can
// read the title once instead of repeating it.
export type SlideContext = {
  title?: string;
  // The `section` of each deck around this slide, outermost first.
  sections: readonly string[];
};

// An error hinote reports as its own: the message, a stable `code` to match
// on, and a `hint` about what to do next, instead of a stack trace. Any Error
// whose `name` is "HinoteError" and that has a string `code` counts, so a
// package can throw one without importing hinote.
export interface HinoteErrorLike extends Error {
  name: "HinoteError";
  code: string;
  hint?: string;
  // 1 for a problem with the deck or files, 2 for a command used wrongly.
  // 1 when left out.
  exitCode?: number;
}
