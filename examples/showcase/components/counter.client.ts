/// <reference types="hinote/client" />

for (const el of document.querySelectorAll<HTMLElement>(".counter"))
  hinote.observe(el, ({ active, step }) => {
    el.textContent = active ? String(step * 100) : "0";
  });
