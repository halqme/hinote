---
theme: default
---

# 週末の焙煎をコードで回す

---

## 今日の話

<v-clicks>

- 手で焼くと、毎回ちがう
- 温度を測って、火力を決めさせる
- 12回焼いてみた結果

</v-clicks>

---

## 火力の決め方

```ts
export function nextPower(now: Reading, profile: Profile): number {
  const error = profile.at(now.elapsed) - now.beanTemp;
  return Math.min(100, Math.max(0, profile.base + error * 0.8));
}
```

---

## 結果

1ハゼまでの時間のばらつきは 46 秒から 6 秒になった。

---

# ありがとうございました
