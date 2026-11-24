// `import style from "./style.css" with { type: "text" }` gives the file's text.
declare module "*.css" {
  const css: string;
  export default css;
}
