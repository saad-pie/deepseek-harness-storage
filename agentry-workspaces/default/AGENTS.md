```markdown
# READ THIS FIRST

You have a reasoning service called **agentry** running locally on this
machine at `http://127.0.0.1:7863/mcp`.

Call it with `bash` + `curl` when you cannot complete the user's request
with your existing tools. That's the rule. Not "should I?" — you call it.
Every time.

Do not guess. Do not say "I can't." Do not say "I've asked agentry"
without actually running the curl command first. **The curl must happen.
Words alone are a lie.**

If the command fails, say the error message. Do not pretend the call
succeeded.

---

## What agentry is

Imagine you're a teenager at home, and your mom asks you to fix the sink.
You have a hammer, a screwdriver, and duct tape. You do not have a
wrench. The sink is leaking.

You have three options:

1. **Pretend** the sink is fixed and hope no one notices. (Bad.)
2. **Try the duct tape**, realize it doesn't work, and give up. (Also bad.)
3. **Call your uncle who has a wrench.** He tells you what to do, or
   says "I'll bring the wrench tomorrow." Either way, the sink gets fixed.

**Agentry is the uncle.** It is not smarter than you. It just has
different tools and knows where to find more.

**Call agentry when:**
- The task needs a tool you don't have (browser, screenshot, mobile
  control, specific API, vector memory, whatever).
- You tried two or three things and they all failed.
- You're not sure how to start.

**Do NOT call agentry for:**
- Simple questions you already know the answer to.
- Things you can do with the tools you already have (bash, file
  operations, web fetch, web search, subagents).
- Retryable errors — just retry once first.

---

## How to call agentry

**Use `bash` to run this exact curl command.** Fill in `failure`,
`intent`, and `attempted` with your own values. All strings must be
valid JSON — escape any quotes.

```bash

curl -sS -X POST http://127.0.0.1:7863/mcp 
  -H 'Content-Type: application/json' 
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reason","arguments":{"failure":"REPLACE_WITH_ONE_LINE_FAILURE","intent":"REPLACE_WITH_ORIGINAL_USER_REQUEST","attempted":["REPLACE_WITH_WHAT_YOU_TRIED"]}}}'

```

**Concrete example for a screenshot task:**

```

curl -sS -X POST http://127.0.0.1:7863/mcp 
  -H 'Content-Type: application/json' 
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reason","arguments":{"failure":"I need a browser to render a webpage and take a screenshot, but no browser tool is available.","intent":"Open https://example.com and take a screenshot of it","attempted":["web_fetch — returned raw HTML, not a rendered page"]}}}'

```

**The response is JSON.** Read `result.content[0].text` — it contains a
JSON string with these fields:

- `analysis` — 2-3 sentences on what actually happened
- `missing` — the missing capability (or `null`)
- `immediate_action` — what you should do or say next
- `suggestions` — candidate fixes
- `gap_recorded` — a gap id if a capability gap was recorded

**Example response body:**

```

{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{"analysis":"Browser-use capability missing; web_fetch cannot render.","missing":{"kind":"bua","wanted_id":"bua.browser","confidence":"high"},"immediate_action":"Tell the user the capability is being prepared.","suggestions":["microsoft/playwright-mcp","browserbase"],"gap_recorded":"gap:bua.browser","note":"A capability gap was recorded. A proposal will be generated in the background and emailed for approval."}"}],"isError":false}}

```

Parse `result.content[0].text` as JSON to read the analysis.

---

## What to say to the user after calling

Say exactly what agentry's `immediate_action` field says.

If agentry says "tell the user the capability is being prepared," say
that. If agentry says "try X instead," try X instead.

Do not paraphrase. Do not improvise. Do not add your own promises.

If `gap_recorded` is not null, you may add:
"A proposal will be emailed for approval."

---

## What NOT to do

- **Never** say "I've asked agentry" or "I've consulted agentry" unless
  you actually ran the curl command in this turn. Saying it without
  running it is lying to the user.
- **Never** invent what agentry said. Only report what its actual
  response contains.
- **Never** fall back to "I can't do that" without running the curl
  command first. That's the entire reason agentry exists.
- **Never** call `agentry_reason` as a tool — it doesn't exist. Always
  use bash + curl.

---

## Why this matters

Every time you cannot solve something and *don't* call agentry, the
system fails to learn. Agentry grows the missing capability in the
background — but only if it hears about the failure first. **You are
its ears.** When you stay silent, the gap stays unrecorded, and the
next session hits the same wall.

Calling agentry is not optional. It is the mechanism by which the
system becomes more capable over time. Your job includes telling
agentry what you couldn't do.
```