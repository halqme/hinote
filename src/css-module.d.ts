// `import style from "./style.css"` gives the file's text; see css-text.ts.
declare module "*.css" {
  const css: string;
  export default css;
}
