# Assistant: OpenUI answers ("answers with receipts")

The site assistant on the homepage (Contact section) can now draw an answer as a small card: a short answer with numbered citations, links to the case studies it used, and three follow-up questions. The page side is done. Nothing changes for visitors until the Worker (`tokim-assistant`, source not in this repo) starts sending OpenUI answers. Until then the page behaves as before, plus the accessibility fixes, starter questions and the job-description toggle.

This doc is the checklist for the Worker change.

## 1. The contract

Request, `POST https://tokim-assistant.tokim25.workers.dev/api/ask`:

```json
{ "question": "string", "history": [{ "q": "string", "a": "string" }], "mode": "fit" }
```

- `question` and `history` are unchanged from today. `history` holds the last 6 turns. For OpenUI turns, `a` is the plain `text` (below), not OpenUI Lang.
- `mode` is new. It's only sent when the visitor picked "Paste a job description" (value `"fit"`). When it's missing, treat the request as a normal question. Today's Worker ignores it.
- In fit mode `question` can be up to 6000 characters, where a normal question is capped at 500. If the Worker caps length, raise the cap for `mode: "fit"`.

Response, `200`:

```json
{ "answer": "string", "format": "openui", "text": "string" }
```

- No `format`: `answer` is plain text, shown exactly as today. This is what the Worker sends now.
- `format: "openui"`: `answer` is an OpenUI Lang program with `root = Card(...)`. `text` is a plain-text version of the same answer, 1-3 sentences, no markup. The page uses `text` for history, for the screen-reader announcement, and as the fallback if the card can't be drawn. **Always send `text` with an OpenUI answer.** If it's missing, the fallback says "I couldn't display this answer here."
- Errors: non-2xx with `{ "error": "..." }`, same as today. The page shows its own error copy.

`format` and `mode` are the whole contract. Nothing else on the page depends on the Worker.

## 2. What the page does with an OpenUI answer

- Loads `@openuidev/browser-bundle@0.1.4` from jsDelivr (JS + CSS, pinned, with SRI hashes) on the first OpenUI answer only. Text answers never load it. It's about 990 KB gzipped JS and 34 KB CSS, so it must stay lazy.
- Renders with `Renderer` + `openuiChatLibrary` from `window.__OpenUI` (the bundle exposes only `React`, `createRoot`, `Renderer`, `openuiChatLibrary`, so there are no custom components).
- Before rendering, it removes every URL that isn't one of the site's own pages (list in section 4). It blanks `@OpenUrl` targets and source `url`s, unwraps off-site markdown links, and after rendering it unwraps any remaining off-site `<a>`. Clicking an `@OpenUrl` only navigates when the target is on the list.
- `FollowUpItem` and `@ToAssistant` clicks send their text as the next question (always as a normal question, without `mode`).
- If the bundle fails to load (15 s timeout) or the program doesn't produce a `root`, it shows `text` as a normal bubble plus a "Browse case studies" link to `#case-studies`.

## 3. System prompt: generate it, don't hand-write it

Version pairing matters. Bundle 0.1.4 contains react-lang 0.3 / react-ui 0.16, which render **OpenUI Lang 0.x** (actions are written `Action([@OpenUrl("...")])`). Generate the prompt with the matching packages: `@openuidev/react-lang@0.3.0`, `@openuidev/react-ui@0.16.1`, `@openuidev/lang-core@0.3.0`. If the page ever moves to bundle 0.2.x (OpenUI Lang 1.0), regenerate the prompt with the 1.x packages at the same time. A 1.0 prompt teaches bare action steps that a 0.x renderer won't run.

Trimmed component list (11): `Card`, `CardHeader`, `TextContent`, `Callout`, `ListBlock`, `ListItem`, `Table`, `Col`, `Tag`, `FollowUpBlock`, `FollowUpItem`.

Run this once at build time (Node, not inside the Worker) and commit the two output files to the Worker repo:

```js
// scripts/gen-openui-prompt.mjs
import fs from "node:fs";
import { createLibrary } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";

const KEEP = ["Card", "CardHeader", "TextContent", "Callout", "ListBlock", "ListItem",
  "Table", "Col", "Tag", "FollowUpBlock", "FollowUpItem"];
const lib = createLibrary({
  root: "Card",
  components: KEEP.map((n) => openuiChatLibrary.components[n]),
  componentGroups: [{ name: "Answer", components: KEEP }],
});
fs.writeFileSync("src/openui-prompt.txt", lib.prompt({ examples: [] }));
fs.writeFileSync("src/openui-schema.json", JSON.stringify(lib.toJSONSchema()));
```

Tested in a scratch folder with those exact versions (plus react 19, zod 4, zustand 4): it produces a 5.8 KB prompt and a 283 KB schema. One quirk: the `Card` signature in the prompt still lists every chat component as a possible child, because the trimmed list doesn't change Card's own schema. Rule 1 below covers it.

The Worker's system prompt is: the existing grounding instructions + the corpus, then `openui-prompt.txt`, then these rules:

1. Use only the components listed under Component Signatures. Output only OpenUI Lang, starting with `root = Card(...)`.
2. Keep the answer to 2-3 sentences in one `TextContent`. Cite with `[1]`, `[2]` matching `Card` sources.
3. `sources` and `@OpenUrl` may only use URLs from the allow-list below, written exactly as listed. Never link anywhere else, including mailto.
4. Quote metrics exactly as they appear in the allow-list. Don't round, combine or estimate. If a number isn't on the list, don't give one.
5. If the resume and case studies don't show something, say so in plain words ("My resume and case studies don't cover that"), and don't guess. For anything about availability, use the Q&A answer verbatim.
6. End with a `FollowUpBlock` of 3 short questions the corpus can answer.
7. Also return a plain-text version of the answer (no markup, no citations) for the `text` field. The simplest way is to ask for the OpenUI Lang and the plain text as two labeled parts, then split them in the Worker.

## 4. Allow-lists

**URLs** (the page enforces the same list):

- `/case-studies/workprint.html`
- `/case-studies/intuit-analytics-ai.html`
- `/case-studies/experiences-services.html`
- `/case-studies/5-star-hosting.html`
- `/case-studies/pricing.html`
- `/case-studies/workday-learning-needs-survey.html`
- `/case-studies/pandora-onboarding.html`
- `/resume.html`
- `/`, `/#career`, `/#case-studies`, `/#contact`, `/#top`

Use relative URLs. The page also accepts `https://tonykim.io/...` and rewrites it, but relative URLs keep the library from asking Google's favicon service for an icon.

**Metrics**, verbatim from the case studies:

| Case study | Metric | Wording on the page |
| --- | --- | --- |
| Pricing Your Place | 29% | of the addressable host population reached (5.5M+ hosts, 9M+ listings) |
| Pricing Your Place | 31% | conversion into the intended pricing behavior |
| Pricing Your Place | $24M+ | gross booking value generated |
| Workday Learning Needs Survey | 900+ | respondents |
| Workday Learning Needs Survey | 45+ | job families |
| Workday Learning Needs Survey | over 10% | of every organization in scope responded |
| Workday Learning Needs Survey | 57% | of respondents named time as the main learning barrier |
| Pandora Onboarding | 300+ | client services hires, US and Australia |

Workprint, Intuit Analytics AI, Airbnb Experiences and 5-Star Hosting have no numeric results on their pages, so the model shouldn't give any for them.

**Known mismatch, not fixed here:** the homepage Workday card says "930+ respondent survey" while the Workday case study says "900+" (in its meta description, hero and body). Pick one and update the other. Until then, use the case study's "900+".

## 5. Fit mode (`mode: "fit"`)

When `mode` is `"fit"`, `question` is a pasted job description. Add these instructions:

- Pull 4-8 concrete requirements from the posting. Ignore boilerplate (benefits, EEO text).
- Answer with `CardHeader` (role title from the posting, plus a line like "6 requirements · 5 with direct evidence"), then a `Table` with three `Col`s: requirement, evidence (with `[n]` citation), and a `Tag` of "Strong", "Some" or "Gap".
- Any requirement without evidence in the corpus gets `Tag("Gap", ...)` and evidence text "Not shown in my resume or case studies." Don't stretch weak evidence into a match. An inflated fit check does more damage than none.
- Always add a `Callout` with the availability answer from `assistant/qa.md`, word for word.
- If the paste has no recognizable requirements, return one neutral `Callout` asking for the responsibilities and qualifications section.
- Same URL and metric rules as above.

## 6. Validate before sending, fall back to text

In the Worker, check every OpenUI answer before returning it. Use `@openuidev/lang-core@0.3.0` (no React needed) with the generated schema:

```js
import { createParser } from "@openuidev/lang-core";
import schema from "./openui-schema.json";
const parser = createParser(schema, "Card");

const result = parser.parse(program);
const ok = result.root && result.meta.errors.length === 0 && plainText.trim();
```

- Drop or blank any URL that isn't on the allow-list (string literals, `@OpenUrl(...)`, source `url`, markdown links). The page does this too, but don't rely on that.
- If `ok` is false, return `{ "answer": plainText }` with no `format`, or, if there's no usable plain text either, regenerate once as plain text. The visitor then sees today's text bubble.
- Tested: with the generated schema, a valid program parses with no errors, prose returns `root: null`, and an unlisted component (`Carousel`) is reported as `unknown-component`.

## 7. Checklist

- [ ] Add the prompt generator and commit `openui-prompt.txt` / `openui-schema.json`.
- [ ] System prompt = grounding + generated prompt + rules in section 3.
- [ ] URL allow-list filter + metric list in the Worker.
- [ ] Fit-mode instructions when `mode === "fit"`; raise the length cap for that mode.
- [ ] Validate with `createParser`; fall back to plain text.
- [ ] Return `{ answer, format: "openui", text }`.
- [ ] Keep the bundle version on the page and the prompt package versions paired.

*Built by Tony Kim with Claude Code.*
