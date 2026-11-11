# manSys — notes for Claude

Front end of Nick Garner's Life Management System (LMS). Static HTML pages served by
GitHub Pages at https://garnernick.github.io/manSys/. Data lives in Supabase; automation
runs in n8n.

## Rules (read first)

1. **Never merge to `main`.** `main` is the live site. Push to a `claude/<topic>` branch
   and open a pull request; Nick reviews and merges. "Push it" means push the branch and
   open the PR, not merge.
2. **This repo is public.** Never commit secrets (API keys, tokens, service keys,
   passwords) or private data. Anything committed here can be read by anyone.
3. **Try before saying something can't be done.** Access pre-checks have been wrong
   before; attempt the action and report what actually happened.
4. **Label claims** in replies: checked directly, sourced, Nick's decision, inference,
   or unverified. Never present an estimate as fact.
5. **Do the work** with the tools available rather than handing steps back to Nick; ask
   only for decisions that are his.

## Git workflow

- `gh pr create` fails in Claude sessions (GraphQL is blocked). Open PRs with the REST API:
  `gh api -X POST repos/garnernick/manSys/pulls --input pr.json`.
- n8n commits straight to `main` several times a day (see below). Fetch `origin/main`
  before branching or pushing.
- Commit and PR titles name the page or area first, e.g. `Updates tab: swipe to delete`,
  `Job Review page: …`, `Service worker: …`, `Dashboard: …`.

## Files

| File | Status |
| --- | --- |
| `dashboard-mobile-push.html` | **The live dashboard** (named in Supabase `app_config.dashboard_page`). Edit this one. |
| `sw.js` | Service worker for web push and the app badge. Bump `SW_VERSION` (`'sw-N …'`) on every change. Every push must end in a visible notification (Apple rule, see the file header). |
| `briefing.html`, `tomorrow.html`, `archive/` | **Written by n8n** (commits titled "Daily briefing", "Tomorrow briefing", "Archive briefing"). Do not edit by hand. |
| `jobreview.html`, `contextreview.html`, `respond.html`, `me*.html`, `calendar-mobile.html` | Other pages; check whether and how they are linked before changing them. |
| `dashboard*.html`, `dashboard-ipad*.html`, `dashboard-mobile*.html` (other than `-push`) | Older copies, not live. Leave alone unless Nick asks. |

## How the pages work

- Single-file pages: HTML, CSS and JavaScript inline.
- They call Supabase REST directly with the public anon key, behind a browser-side
  `ACCESS_TOKEN` check. That check does not protect the database.
- For anything new, read and write through security-definer functions (`rpc/...`) or edge
  functions, not direct table access. The Updates, Job Review and Context Review pages
  already follow this pattern. New Supabase tables are created with RLS on.

## Testing a page change

- Extract the inline scripts and run `node --check` on them.
- Test changed logic in isolation with Node and stub data.
- A rendered check needs a browser; say so if it was not done.

## Related

- Supabase project: "Mansys".
- n8n workflows are numbered (`01 — Morning Briefing`, `08 — Publish Morning Briefing Page`, …).
- Plaud recordings pipeline: see the briefing doc "Plaud Recordings Pipeline — Briefing
  for the Life Management System" in Nick's Life Management System project.
