# Launch guide: from this repo to real players

About 30 minutes, once. You'll need a free Supabase account and a free itch.io account.

## 1. Database (Supabase, about 10 min)

1. Go to <https://supabase.com>, sign up, and click **New project**. Name it `shadow-isle` and pick
   the region closest to you. Save the database password somewhere safe; you won't need it here.
2. When the project is ready, open **SQL Editor → New query**, paste all of
   [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**. You should see "Success".
3. Open **Project Settings → API Keys** and copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **publishable** key (`sb_publishable_...`), or on older projects the legacy
     **anon public** key. Either works.
4. Put them in [`game/config.js`](../game/config.js):
   ```js
   SUPABASE_URL: "https://abcdefgh.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
   The anon key is designed to be public. The schema only lets it *insert* events, so nobody
   can read or delete your data with it.
5. From the same page, copy the **secret** key (`sb_secret_...`, or the legacy
   **service_role** key), but **never put it in the game or in git**. Keep it in a file named `.env` in the repo root (already git-ignored):
   ```
   SUPABASE_URL=https://abcdefgh.supabase.co
   SUPABASE_SERVICE_KEY=eyJhbGciOi...
   ```

**Check it works:** run `make dev`, open the link it prints *without* the `?collector=...`
part (`http://localhost:8787/index.html`), play one run, and close the tab. In Supabase,
**Table Editor → events** should show rows.

## 2. Exclude yourself (2 min)

Your own playtests shouldn't count. In each browser you play in, open the game, press
F12 → Console, type `localStorage.si_player`, and paste the id into
[`analytics/exclude_players.txt`](../analytics/exclude_players.txt), one per line.

## 3. Publish on itch.io (10 min)

1. `make package` builds `dist/shadow-isle-web.zip`.
2. On <https://itch.io>: **Upload new project**
   - Title: *Shadow Isle: Escape the Abyss*
   - Kind of project: **HTML**
   - Upload the zip and tick **This file will be played in the browser**
   - Viewport: **960 × 540**, and tick **Mobile friendly** and **Fullscreen button**
   - Cover image: [`art/poster.png`](../art/poster.png) (itch wants 630×500; crop around Cuetip)
   - Genre: Action · Tags: arcade, survival, pixel-art, short
3. Add this line to the description, so the data collection is disclosed:
   > *Shadow Isle collects anonymous gameplay stats (run length, score, how a run ended) for a
   > game-design study. No personal information is collected. Turn it off on the title
   > screen.*
4. Set visibility to **Public** and save. Your link: `https://<you>.itch.io/shadow-isle`

## 4. Get players

The experiment needs ~200 people who play at least one run. Everyone you send gets randomly
assigned, so you don't need to do anything special.

- Friends and classmates: a short personal message works best ("made a 2-minute game, how far
  can you get?")
- George Mason game-design / CS Discords and group chats
- Reddit: r/WebGames, r/playmygame, r/IndieGaming (read each sub's self-promo rules)
- itch.io: post a devlog on launch day; it puts the game on the "recently updated" feeds
- A short gameplay clip on TikTok / Instagram / X (record with the `?demo=1` mode)

**Don't** tell people which version they got or what's being tested. That would bias the
result.

## 5. Read the results

```bash
set -a; source .env; set +a      # loads the Supabase keys into this terminal
make live                        # pull -> dbt models + tests -> readout -> dashboard
open reports/live/dashboard.html
```

Check the sample-ratio line first. Then read the primary metric, as written in
[`analysis_plan.md`](analysis_plan.md). Don't change the plan after looking. If something
had to change, write it under "Deviations" with the date and the reason.

## Changing the game after launch

- Bug fixes and polish: fine, and bump `GAME_VERSION` in `config.js`.
- Anything that changes difficulty in the first minute affects the experiment. Wait until
  it ends, then start `exp2_...` with a new `EXPERIMENT_ID` (assignment reshuffles
  automatically).
