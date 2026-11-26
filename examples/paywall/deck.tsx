import { Center, createSlide, themes } from "hinote";

// One deck. Which of its slides a request reaches is the server's call:
// see server.ts.
export default createSlide(
  {
    document: { title: "Paywall", lang: "en", pageNumber: true },
    theme: themes.paper,
  },
  [
    createSlide({ title: "Each slide is a request" }, (slide) => (
      <Center gap={4}>
        <h2>{slide.title}</h2>
        <p>The next one goes through the server's middleware first.</p>
      </Center>
    )),
    createSlide({ title: "This slide was not in the free page" }, (slide) => (
      <Center gap={4}>
        <h2>{slide.title}</h2>
        <p>
          <a href="/lock">Clear the cookie</a>
        </p>
      </Center>
    )),
  ],
);
