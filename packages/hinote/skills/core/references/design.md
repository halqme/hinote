# Designing a deck that says something

A slide that renders without problems can still say nothing. Decks written by agents tend to fail in the same few ways: every slide weighs the same, a title names a topic and the body restates it, a number stands alone, one slide carries several messages, words are squeezed until they mean nothing, and decoration stands in for structure. Each principle below comes with what hinote gives you for it and how to check it.

## Principles

| Principle                                                                                 | In hinote                                                                                                                              | Check                                                                                                               |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| One message per slide                                                                     | Split the slide, or reveal its parts with `<Step>` instead of filling one canvas                                                       | Say each slide's message in one sentence. Two sentences means two slides                                            |
| The title is the claim, not the topic: "Size does not explain it", not "Relation to size" | `title` in the slide options; a render function receives it, so a shared heading shows it                                              | `hinote inspect --json` and read only the titles, in order. They should tell the whole story                        |
| Every word is one a first-time reader knows, and means one thing                          | Room for the plain phrase: split the slide or reveal it with `<Step>` instead of shortening the words                                  | Read each title and label as someone who has not heard the talk. Can any word be read two ways, or not at all?      |
| A number comes with what it is compared to: a range, a baseline, or the other items       | A table or a chart with the comparison in it (see `--ref recipes`)                                                                     | Every number on a slide answers "compared with what?"                                                               |
| Keep the reading load low                                                                 | `<Step>` spreads a dense slide over time; snapshot's `overflow` and `safe-area` are the density limit                                  | `hinote snapshot --json` reports no `problems`. Look at the PNGs: can the point be seen in three seconds?           |
| One emphasis per slide                                                                    | `colors.accent` for that one thing; `muted` for the rest                                                                               | At most one element per slide uses the accent or a larger size                                                      |
| Lay out with components and tokens, not numbers                                           | `Row`, `Column`, `Center`, `Grid`, and `Card`, with a numeric `gap` (multiples of `spacing.unit`). The slide padding is `spacing.safe` | No `px` in slide `css` or `style` for spacing. Titles and the body's left edge sit in the same place on every slide |
| Items of equal rank look equal, and only they do                                          | `Grid` and `Card` line up headings and bodies across cards                                                                             | Use cards for parallel items only, not as a frame for every slide                                                   |

## Words

A slide is right when someone reading it for the first time understands exactly what you meant, with no talk beside it. The slide's small space pushes the other way, toward fewer and shorter words, and that goes wrong in two ways:

- **Words that do not exist.** Nouns stacked into a new compound, a private abbreviation, a term coined for this talk. The reader has to guess, and guesses differently.
- **Short, broad words.** "Optimization", "impact", "efficiency", "improvement", "alignment". They fit the space because they fit almost any meaning, so they carry none.

| Squeezed                   | Says it                                               |
| -------------------------- | ----------------------------------------------------- |
| Latency optimization       | Pages load in 0.2 s instead of 0.8 s                  |
| Improved deploy efficiency | A release takes 10 minutes instead of a day           |
| CX impact                  | Fewer customers call support after an update          |
| 運用負荷の最適化           | 夜間の呼び出しが月 12 回から 3 回に減った             |
| 体験価値の最大化           | 初めて使う人が、説明を読まずに 1 分で登録を終えられる |

- Write the plain phrase, even when it is longer. When it does not fit, split the slide or reveal it in steps; do not shorten the words.
- Name the thing itself: who, what, how much, compared with what. A broad word usually hides one of these.
- An abbreviation or term the reader may not know is spelled out where it first appears, or not used.

## Layout in practice

- Headings and paragraphs have no margin; only `gap` separates elements. Give every `Column` a `gap` instead of adding margins.
- `gap` also takes any CSS length, such as `"13px"`. Prefer a number, so spacing stays on the scale.
- Group by space, not by borders: related elements sit close together, unrelated ones farther apart. The themes' `surface` and `border` are deliberately faint.
- To change the edge padding of every slide, set the theme's `spacing.safe` rather than `padding` in CSS, so snapshot's safe area moves with it.
- Pick one of `themes.ink`, `themes.paper`, or `themes.slate` and keep it for the whole deck. Their text colors reach 7:1 contrast against the background.

## Before you call it done

1. Read the titles from `hinote inspect --json` in order. Fix any slide whose title is a topic.
2. Read every title and label as a stranger to the talk. Replace each word that is coined, abbreviated without being spelled out, or broad enough to mean several things.
3. For each slide, write its message in one sentence. Split slides that need two.
4. Find each number and check that its comparison is on the same slide.
5. `hinote snapshot --json`: no `problems`, and look at every PNG.

## Sources

- Assertion-evidence titles: Alley and Garner at Penn State; a sentence headline with visual evidence beat topic headlines with bullets for understanding and recall. [Research list](https://writing.engr.psu.edu/research.html)
- Three seconds per slide: Duarte's [Glance Test](https://www.duarte.com/resources/guides-tools/the-glance-test/).
- Reading the titles alone: horizontal logic, [storytelling with data](https://www.storytellingwithdata.com/blog/2013/12/horizontal-logic).
- "Compared with what?": Tufte, [Analytical Design](https://ohiostate.pressbooks.pub/app/uploads/sites/274/2021/07/Tufte-Analytical-Design.pdf).
- Remove the extraneous, signal the structure, show it in segments: Mayer's multimedia principles (coherence d = 0.70, signaling d = 0.46). [Summary](https://ugc.futurelearn.com/uploads/files/7d/d6/7dd6188d-c343-4311-b064-ac98d2c95abc/Multimedia_Principles._R._E._Mayer__2020.pdf)
- One emphasis: the von Restorff (isolation) effect fades when overused. [Learning Loop](https://learningloop.io/plays/psychology/isolation-effect)
- Alignment and proximity: Williams, [The Non-Designer's Design Book, ch. 3](https://www.oreilly.com/library/view/the-non-designers-design/9780321563088/ch03.html); [NN/g on proximity](https://www.nngroup.com/articles/gestalt-proximity/).
- Spacing on a scale: [Atlassian spacing](https://atlassian.design/foundations/spacing).
