import { expect, test } from "bun:test";
import { referencedPaths, remoteUrls } from "../src/build/assets.ts";

test("finds the relative files a page loads, and nothing else", () => {
  const html = `
    <style>.a{background:url("img/bg.png")}.b{background:url(https://x.test/y.png)}</style>
    <img src="./images/a.svg" srcset="images/a@2x.png 2x, images/a@3x.png 3x">
    <video poster="media/poster.jpg"></video>
    <a href="#top">top</a><a href="https://example.com">x</a><img src="/root.png">
    <img src="data:image/png;base64,AAAA"><img src="photo.png?v=2#x">
    <div style="background:url(&quot;img/inline.png&quot;)"></div>
    <pre><span>background: url(code.png)</span><span>&lt;img src=&quot;code.png&quot;&gt;</span></pre>
    <script>el.src = "script.png"; x = 'src="script2.png"'</script>
  `;
  expect(referencedPaths(html).sort()).toEqual(
    [
      "img/bg.png",
      "./images/a.svg",
      "images/a@2x.png",
      "images/a@3x.png",
      "media/poster.jpg",
      "photo.png",
      "img/inline.png",
    ].sort(),
  );
});

// What a page shows only while online. A link is somewhere to go, not a file.
test("finds the files a page loads from the network, and not its links", () => {
  const html = `
    <style>.b{background:url(https://x.test/y.png)}</style>
    <img src="https://x.test/a.png" srcset="//cdn.test/a@2x.png 2x">
    <a href="https://example.com">x</a><img src="./local.png">
    <script type="module" src="https://x.test/app.js"></script>
    <pre>&lt;img src=&quot;https://x.test/code.png&quot;&gt;</pre>
  `;
  expect(remoteUrls(html).sort()).toEqual(
    [
      "https://x.test/y.png",
      "https://x.test/a.png",
      "//cdn.test/a@2x.png",
      "https://x.test/app.js",
    ].sort(),
  );
});
