# Foresights — launch assets

Positioning, pitch, and LinkedIn copy for Foresights. Screenshots live in this
folder alongside this file — see "Screenshots" below for what to capture.

## 30-second elevator

The ecosystem your product depends on moves faster than anyone can track.
Renovate bumps your dependency versions; daily.dev floods you with everything
— but neither tells you what actually matters for *your* stack, or what to do
about it.

Foresights is a Cowork plugin that builds you a live news dashboard in about
fifteen minutes, filtered to the repos, releases and patterns that touch your
product. And when something is worth acting on, it writes a Claude Code prompt
grounded in your own codebase — closing the loop from "X just shipped" to
"here's the PR."

## LinkedIn — positioning blurb

> Reusable, second-person. Drop into a profile, a repo description, or a deck.

Want an easy way to keep up with the areas relevant to your product and its
development? Foresights gives you a live dashboard of just the news, releases
and patterns that affect *your* stack — with built-in Claude Code integration
to act on the recommendations. Not a dependency bot, not a firehose: a
filtered, editorial view of your ecosystem, with the loop closed all the way
to a pull request.

## LinkedIn — launch post

> First-person, ready to post. Pair with `screenshot-dashboard.png`.

I build developer tools for a living — and I kept hitting the same wall.

Staying on top of the ecosystem around a product is its own job. AWS CDK ships
constantly. The serverless toolchain moves every week. Renovate keeps my
dependencies current, but it can't tell me a new pattern is worth adopting.
daily.dev is a firehose. So for two of my own products I built custom news
dashboards by hand — live, filtered to exactly the repos and releases that
mattered, with a triage step that turned "this looks relevant" into a real
Claude Code prompt.

Then I noticed I had built the same dashboard twice.

So I turned it into Foresights — a Cowork plugin. You answer five questions
(your topic, the sources to track, the products you want flagged) and it
generates a live dashboard customised to your stack: GitHub releases and PRs,
RSS feeds, curated highlights, a rotating deep-dive spotlight. Every flagged
item gets a brief grounded in *your* codebase and a one-click Claude Code
prompt to implement it. It closes the loop from "X just shipped" to "here's
the PR."

It's open and live. If keeping up with your stack feels like a second job,
I would love for you to try it and tell me where it falls short.

Install from the Cowork marketplace → <MARKETPLACE_URL>
Or grab the latest .plugin from github.com/instancelabs/foresights/releases

Built by Instance Labs — instancelabs.dev

## Screenshots

Capture these from a **live dashboard in the Cowork sidebar**. A Foresights
dashboard only renders inside Cowork's artifact runtime — screenshotting the
raw HTML file won't work (it hits the `window.cowork` guard and won't boot). A
dashboard built *with products* — for example the CDK Insights / Last Command
build — shows the most: the product badges, brief panel and digest bar are the
real differentiators.

| File | What to capture |
|---|---|
| `screenshot-dashboard.png` | The hero shot — full dashboard: hero header, a live releases section carrying product badges, and the spotlight card. |
| `screenshot-brief.png` | A brief panel expanded — click a product badge so the "why relevant / how it could integrate" panel is open below the item. |
| `screenshot-digest.png` | The upgrade-digest panel — the 🟢 / 🟡 / 🔴 triaged items with their embedded Claude Code prompts. |

Optional: `screenshot-3d-printing.png` from the non-developer `3d-printing-news`
build, to show the wizard works for any topic — not just developer stacks.
