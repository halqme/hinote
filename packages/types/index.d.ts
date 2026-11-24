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
