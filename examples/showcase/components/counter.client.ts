/// <reference types="hinote/client" />

hinote.mount(".counter", (el) => {
  hinote.observe(el, ({ active, step }) => {
    el.textContent = active ? String(step * 100) : "0";
  });
});
