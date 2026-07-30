# PoiBot

poi boop vak
poi hug foga

A Discord bot built on [discord.js v14](https://discord.js.org) and the
[Sapphire framework](https://sapphirejs.dev).

## Setup

1. `npm install`
2. `cp .env.example .env` and fill it in. Only `DISCORD_TOKEN` and `MONGO_URI` are
   required to boot; every other variable enables one feature and is documented
   inline in `.env.example`. Notably: `MAL_CLIENT_ID` for the waifu/gacha commands
   (get one from https://myanimelist.net/apiconfig), and `OPENROUTER_API_KEY` for the
   AI `/story`. Without it, `/story` falls back to a built-in canned story.
3. In the [Discord Developer Portal](https://discord.com/developers/applications),
   enable the **Message Content**, **Server Members**, and **Presence** privileged
   intents for the bot. Message Content is required for the `poi ` prefix commands
   and the message-based features (level XP, auto-reactions, snipe) to work.

## Features & command categories

- **Counter**: hug/pat/boop/kiss/punch/slap/bite/cuddle (with awards)
- **Reaction**: f, geh, smug
- **Anime**: cry, kudur, mofu, uwu, gift, neko (nekos.life; its three NSFW
  categories only work in age-restricted channels)
- **Fun**: `fun` (30+ meme subcommands, with autocomplete), marry, divorce, kill, rate, say
- **Economy**: balance, daily, pay, redeem, insurance, shop, vipcolor, change-balance
  (**silver** plus shop-bought **wish tokens**; see [Economy](#economy))
- **Games**: fish, mug, steal, paytoflip, blackjack (with double down), tycoon
  (idle points), story (once a day), wish (Genshin) / bawish (Blue Archive) gachas,
  collection (view your pulls)
- **Waifu**: MyAnimeList gacha: waifu (pull), waifus (view), sell, trade, upgrade, force-waifu
- **Music**: play, again, pause, resume, skip, stop, queue, nowplaying, volume, shuffle, loop,
  autoplay, lyrics, filter, speed, playrate, bassboost, equalizer (Lavalink; see below)
- **Info**: user, avatar, botinfo (stats + uptime + latency), mcinfo, help
- **Admin**: language (en-US / tr-TR), automod (Discord AutoMod rules), welcome,
  purge, send, giveaway, refresh-gacha (owner-only roster refresh)

Commands generally work as both `poi <cmd>` prefix messages and `/<cmd>` slash commands;
exceptions such as the prefix-only `poi say` command are noted in their command guidance.
Server language is configurable via `/language`; user-facing strings live in `languages/`.

The Genshin and Blue Archive rosters refresh from their public APIs at startup and every
14 days. API failures keep the bundled last-known-good data. The bot owner can force an
immediate fetch with `/refresh-gacha`; Genshin's live rate-up names remain a small manual
override because its roster API does not expose event-wish schedules.

## Using PoiBot as a user app

Most of the bot needs a server: silver, waifus, levels, counters and music are all keyed
by guild id, and music needs a voice channel. A subset needs none of that, so those
commands are registered for **both** installation types and work anywhere you go:
DMs, group DMs, and servers PoiBot isn't even in.

`/avatar` · `/botinfo` · `/help` · `/mcinfo` · `/rate` · `/neko`, every **counter**
command (`/hug` `/pat` `/boop` `/kiss` `/punch` `/slap` `/bite` `/cuddle`), plus the
Reaction command `/geh` and the Fun command `/kill`. `say` remains prefix-only (`poi say`).

Counters normally bucket their totals by guild id. Outside a server there isn't one, so
they fall into a single shared `DM_SCOPE` bucket (`@dm`) rather than being dropped, which
`src/lib/counter-command.ts` handles. This keys off the guild **id**, not the Guild object:
used as a user app inside a server the bot isn't a member of, the object is null but the
id is still there, so those counts stay per-server.

`/help` adapts to where it runs. If the invocation was authorised by the server's install
the bot is present and everything is listed; if it was only authorised by the user's own
install it lists just the commands above, because showing the rest would hand people
commands that cannot work.

Install it from the app's profile → **Add App** → *Add to my apps*.

### Declaring install contexts

`src/lib/util/install-context.ts` has two helpers, and **every** slash command must use
exactly one of them:

```ts
registry.registerChatInputCommand((b) => anywhere(b).setName('avatar')...)   // works everywhere
registry.registerChatInputCommand((b) => guildOnly(b).setName('shop')...)    // servers only
```

`guildOnly` is not optional boilerplate. A command that declares no `integration_types`
inherits the **application's**, and because this app has User Install enabled that
silently means "both". `/shop`, `/trade` and every other guild-keyed command became
user-installable on their own and would have thrown on `interaction.guild!.id` the first
time someone ran them in a DM. Verify the split against the API rather than trusting the
source:

```bash
curl -s -H "Authorization: Bot $DISCORD_TOKEN" \
  "https://discord.com/api/v10/applications/$APP_ID/commands" \
  | python3 -c "import sys,json;[print(c['name'], c.get('integration_types'), c.get('contexts')) for c in json.load(sys.stdin)]"
```

Only add a command to `anywhere` if it **replies and nothing else**. In a server the bot
isn't a member of, a user-app command cannot send channel messages, fetch history, add
reactions or edit anything but its own response. That rules out `/f` (it reacts and
posts a tally) and `/say` (channel send, and prefix-only anyway) even though neither
touches the database. The counter commands qualify because they only ever reply.

Prefix (`poi …`) commands are unaffected: they need the bot in the server either way.

## Running

One command runs both the Lavalink audio node and the bot:

- **Development** (auto-reload): `npm run dev`
- **Production**: `npm run build` then `npm start`

Both start Lavalink alongside the bot with colour-tagged output (`lavalink` / `bot`), and
Ctrl+C stops both. Startup order doesn't matter; see
[Why the node connection is managed by hand](#why-the-node-connection-is-managed-by-hand).

To run the pieces separately (e.g. Lavalink as its own service):

| Script | What it does |
| --- | --- |
| `npm run lavalink` | Only the Lavalink audio node |
| `npm run dev:bot` | Only the bot, with auto-reload |
| `npm run start:bot` | Only the bot, from `dist/` |
| `npm run build` | Wipe `dist/` and compile TypeScript |
| `npm run typecheck` | Type-check without emitting |

## Music: Lavalink

Audio runs on [Lavalink](https://lavalink.dev) (a standalone Java audio node) via the
[`shoukaku`](https://github.com/shipgirlproject/Shoukaku) client, the same stack FlaviBot uses.
All decoding/encoding happens in the JVM and is sent straight to Discord, instead of
piping through ffmpeg inside Node. Tracks are **streamed**, never downloaded.

- Node config: `lavalink/application.yml` (audio quality, plugins, sources)
- Startup: `lavalink/start.sh` pins JDK 21 and downloads the official Lavalink JAR
  on first run, since the runtime is not committed to the repository
- Plugins auto-download on first run: `youtube-plugin` (required, since v4 dropped built-in
  YouTube) and `LavaSrc` (Spotify/Apple/Deezer link resolution)
- Required Lavalink secret: set a deployment-specific `LAVALINK_PASSWORD`. Optional keys: `LAVALINK_URL`
  (default `localhost:2333`), and `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` if you
  enable Spotify in `application.yml`
- Keep port 2333 bound to loopback or a private network interface; do not expose the
  Lavalink REST/WebSocket endpoint directly to the public internet.

Audio **filters** (`/filter`, `/speed`, `/bassboost`, `/equalizer`) use Lavalink's native
filters and are applied **debounced**: rapid changes batch into a single update sent a
moment later, so playback never pauses or glitches while adjusting. They can also be set
while nothing is playing: the state is stored per guild and pushed to the player the
moment a track starts. It survives `/stop`; `/filter off` is what clears it. `/autoplay`
works the same way, backed by a per-guild preference rather than a field on the queue, so
it can be armed before you start anything.

### Why the node connection is managed by hand

`initLavalink()` builds Shoukaku with **no nodes** and registers the node itself from
`superviseNode()`, which waits for the client to be ready, polls the node's TCP port, and
only then calls `addNode()`. `reconnectTries` is pinned to **1**. This is not paranoia:

shoukaku 4.3.0's internal retry loop never clears `connectError` when a later attempt
succeeds, so a "fail once, then connect" sequence takes the failure branch anyway,
tearing down the socket that just connected, marking the node `DISCONNECTED` and emitting
`disconnect`. Shoukaku binds `node.once('disconnect', () => nodes.delete(name))`, so the
node is then **removed from the map entirely** and nothing can revive it short of a
restart. Losing the startup race against the JVM triggered this every time, which is why
starting the bot and Lavalink together used to leave music permanently offline with a
stream of `ECONNREFUSED` and `Websocket closed before a connection was established`.

Keeping `reconnectTries: 1` means shoukaku's loop can never run twice, so it can never hit
that path. The supervisor re-adds the node if it disappears, and probing the port first is
what keeps the log clean while the JVM boots.

### Now Playing panel

`/play` posts a live panel in the channel it was used in: progress bar, requester, voice
channel, queue size / volume / loop, plus **Pause · Skip · Stop · AutoPlay · Dashboard**
buttons. It refreshes every few seconds while playing and disappears 5 seconds after
playback ends. Controls are usable by anyone in the bot's voice channel.

**AutoPlay** (button or `/autoplay`) keeps music going when the queue empties by loading
YouTube's Mix radio for the last track and picking a related song that hasn't played yet.

### YouTube sign-in (optional, better audio)

`lavalink/application.yml` has `plugins.youtube.oauth.enabled: true`. On the first start
Lavalink prints a code and a link (`https://www.google.com/device`). Visit it once to
authorise. A signed-in **Premium** account gets higher-bitrate audio and far less
throttling. Afterwards, copy the refresh token Lavalink logs into `.env` as
`YOUTUBE_REFRESH_TOKEN` so it never asks again.

> ⚠️ The plugin authors warn **not to use your main Google account**. This is against
> YouTube's ToS and accounts have been terminated for it. Use a burner, or set
> `oauth.enabled: false` (playback still works anonymously, just lower quality).

### Spotify

Spotify audio is DRM-protected, so **Lavalink cannot stream it. Premium doesn't change
that**. What credentials buy you is *link resolution* (a Spotify URL is looked up
for its metadata, then the matching track plays from YouTube) and Spotify as a lyrics
source.

To enable it:

1. Go to https://developer.spotify.com/dashboard and log in.
2. **Create app** with any name and description. For *Redirect URI* put `http://localhost:8080`
   (unused, but the form requires one). Tick the **Web API** checkbox.
3. Open the app → **Settings** → copy the **Client ID**, then **View client secret**.
4. Put them in `.env`:
   ```
   SPOTIFY_CLIENT_ID=your-client-id
   SPOTIFY_CLIENT_SECRET=your-client-secret
   ```
5. In `lavalink/application.yml`, under `plugins.lavasrc`, flip these to `true`:
   ```yaml
   sources:
     spotify: true        # spotify links resolve
   lyricsSources:
     spotify: true        # spotify used for /lyrics
   ```
6. Restart Lavalink (`npm run lavalink`, or just restart `npm run dev`).

A free Spotify account is enough. This uses the Client-Credentials API, not your login.

### Audio effects: `/speed` vs `/playrate`

Two different things, and the difference matters:

| | what it does | sounds like |
| --- | --- | --- |
| `/speed 0.5` | **time-stretch**: tempo changes, pitch held | grainy/choppy when pushed far |
| `/playrate 0.5` | **resampling**: speed *and* pitch move together | perfectly smooth, deep and slow |

`/playrate` (alias `/pr`) is the one that reproduces the classic "audio file plays way too
slow" bug, which is a sample-rate mismatch: exactly resampling. `/filter instagram` is a
preset for it (`rate 0.55`). `nightcore`, `vaporwave` and `slowedreverb` are rate-based
too, so they stay artefact-free.

## Economy

The main currency is **silver**. The two character gachas spend **wish tokens**,
which are bought with silver from `/shop`. Every silver value lives in
[`src/lib/economy/prices.ts`](src/lib/economy/prices.ts); nothing else in the
codebase should contain a bare silver number. If you want to retune the game, edit
that file and nothing else.

**Balance target ("chill"):** a casual player who just runs `/daily` and fishes a
couple of times earns **~400 silver/day**; an active player working the tycoon,
fishing and selling waifus lands around **~1500/day**. `/daily` is the anchor every
other number is derived from.

| source | silver | notes |
| --- | --- | --- |
| `/daily` | 250 | once per 24h, the anchor |
| level-up | 100 | from chat XP |
| `/redeem-code` | 250 | one-time codes |
| `/fish` | length × 0.5 | rarity drives length, so rarity drives value |
| `/story` | 100–300 (+100–500 XP) | once per day |
| `/tycoon` | 40 / 220 / 950 / 2500 | per 1k / 5k / 20k / 50k idle points |
| award tiers | 25 / 150 / 400 / 1000 / 2500 | one-time, at 10/500/1k/5k/10k uses |

| sink | silver | notes |
| --- | --- | --- |
| `/steal` | 25/attempt | see below |
| `/insurance` | 500 | one-shot shield against the steal wipe |
| `/shop` VIP | 10,000 | unlocks premium gacha banners and `/vipcolor` |
| `/shop` wish token | 140 each | one token pays for one `/wish` or `/bawish` pull |
| `/paytoflip` | ±3× stake | even-money coin flip, EV zero |
| `/blackjack` | ≤ 500/hand | bet is clamped so it can't be used to grind |
| `/gift` | 20 | transfer, leaves the sender |
| waifu skip | 50 | paid to reroll a pulled character |
| waifu pull upgrade | 750 × 2^level | the long-term goal |
| waifu claim upgrade | 3000 × 2^level | the *real* long-term goal |
| tycoon speed | level × 15 + 75 | |
| tycoon multiply | level × 25 + 100 | |

| secondary currency | source | use |
| --- | --- | --- |
| wish token | `/shop`, 140 silver each (bulk, up to 100 per order) | one pull in `/wish` or `/bawish` |

**Spending silver is always conditional.** Use `spendSilver()`, a single
`findOneAndUpdate` guarded on `silver >= amount` that returns `null` when it
can't pay. Reading the balance and then deducting is two writes with a gap in
between, and every command that did it could be raced into a negative balance by
clicking twice. The only places that still `addSilver(..., -n)` are the two
deliberate wipes (`/steal`'s 1% roll and the `/redeem` prank).

**Design rules** (please keep these true when you add a command):

1. **Gambling is entertainment, not income.** `/steal`, `/blackjack` and `/mug` all
   have slightly negative expected value. `/steal` costs 25 and pays 200 on a
   1–10 roll, 19 on 11–29, nothing on 30–99. EV ≈ **−1.4 silver/attempt**.
2. **Waifu upgrades stay premium.** They are the thing players save toward; nothing
   else should cost more.
3. **Idle tycoon pays well.** It scales with the upgrades you buy, so investing in it
   is the main path from "casual" to "active" income.
4. **Fun costs nothing.** Music, memes and `/fun` subcommands never touch silver.
   `beleş` is a rickroll, not a payout.

### Character gachas: `/wish` and `/bawish`

Both gachas take a `standart`, `premium`, or `limited` banner and a pull count from
1–8. A batch is rejected before rolling unless the player owns enough wish tokens;
each successful pull consumes one token. Premium banners require VIP.

Characters are selected uniformly from the chosen banner. Genshin's `standart`
banner has a 50% rate-up replacement for Diona or Fischl, and its `premium` banner
has a 50% replacement for Keqing, Mona, Qiqi, or Jean. Its `limited` banner has no
rate-up. Blue Archive has no rate-up on any banner.

Collections are stored separately for Genshin and Blue Archive. A first copy starts
at constellation 0; each duplicate raises it by one through constellation 6. Further
copies stay at constellation 6 and award 10 silver instead. This cap-and-payout
behavior is deliberate. Do not replace the duplicate system with a simple list or
allow constellations above 6.

`/collection` browses what you've pulled, one game at a time, sorted by rarity then
constellation. C6 entries are called out because reaching one is what turns further
duplicates into silver.

### Steal insurance

Rolling exactly **100** on `/steal` (1%) wipes your entire balance. `/insurance`
(500 silver) buys a one-shot shield: the next wipe is absorbed and the policy is
consumed, so it has to be re-bought. Consumption is a conditional update
(`{ insured: true } → { insured: false }`), so two simultaneous wipes can't both be
covered by one policy.

Every wipe, saved or not, writes an audit line to the channel in
`STEAL_LOG_CHANNEL_ID` (carried over from the original bot, which hardcoded it).
Set the variable to empty to turn the log off. See `src/lib/util/audit.ts`.

## Project structure

```
src/
  index.ts              SapphireClient bootstrap + MongoDB connection + Lavalink init
  commands/<Cat>/       commands, grouped by category folder (the folder IS the category)
  listeners/            event handlers (ready, level XP, reactions, snipe, awards, welcome)
  interaction-handlers/ persistent button/select handlers, matched by customId prefix
  preconditions/        OwnerOnly
  lib/
    models/             mongoose schemas
    economy/prices.ts   EVERY silver value in the bot; the only place with numbers
    functions/          counters, economy, cooldowns, waifu, guild-language
    services/           MAL, media, awards, story (OpenRouter), Lavalink
    music/              queue, Now Playing panel, search, filters
    games/              tycoon panel UI
    waifu/              shared paginated collection picker
    state/              in-memory cross-listener state (snipe, razor)
    util/               v2 (Components V2), component-id codec, session-store, send helpers
    counter-command.ts  factory for hug/pat/boop/… commands
languages/<locale>/     i18n JSON, one file per namespace (common, counter, fun, games, …)
media/                  gif URL pools per command type
lavalink/               Lavalink node: application.yml + start.sh (jar/plugins are gitignored)
```

### How the pieces fit together

- **Commands** are Sapphire `Command` classes. Most implement both `messageRun`
  (prefix, `poi <cmd>`) and `chatInputRun` (slash) and share one private helper so
  the two paths can't drift.
- **Replies** go through `lib/util/v2.ts` (Components V2), never embeds. `v2()` builds
  a whole payload; `v2Container()` + `v2Payload()` when you need the container first;
  `v2Update()` for `interaction.update()` on an already-V2 message.
- **One piece per file.** Sapphire loads a single piece from each file, so a second
  exported handler class is silently dropped. That is what broke every `/shop` button
  until the modal handler moved to its own file.
- **Buttons/selects** encode state in the customId via `lib/util/component-id.ts`
  (`cmd:owner:action:arg`) and are handled by a matching file in
  `interaction-handlers/`, not by collectors, so panels survive restarts and never
  time out. Bulkier state (a pulled waifu, a trade offer) goes in `lib/util/session-store.ts`,
  keyed by message id.
- **Strings** are always `resolveKey(ctx, 'namespace:key', vars)`; the namespace is the
  filename under `languages/<locale>/`. Add a key to **every** locale. They follow the
  project's writing rules: no em dashes, no intensifiers, no hedging, and an error says
  what actually failed. "Something went wrong" tells nobody anything; "MyAnimeList didn't
  return a character" tells them whether to retry.
- **Silver amounts** always come from `lib/economy/prices.ts`. A literal number in a
  command file is a bug: it makes the economy impossible to retune.
- **Ephemeral replies** use `flags: MessageFlags.Ephemeral` (or `v2(text, { ephemeral: true })`,
  which sets that flag for you). The plain `ephemeral: true` reply option is deprecated
  in discord.js and warns at runtime.

> **Deleting a command?** `npm run build` wipes `dist/` first, and it has to: `tsc`
> leaves the old `.js` behind, Sapphire loads it from `dist/`, and the command you
> deleted keeps re-registering itself with Discord forever.

### Waifu gacha rules

Ported from the original bot; these are load-bearing, not decoration.

- **Hourly allowances.** 10 pulls and 2 claims per clock hour, both raised by
  `/upgrade`. Rolling costs a pull; claiming, *and quick-selling*, costs a claim.
  `checkCooldown` consumes atomically: every branch is one conditional write, with
  a retry when a concurrent caller wins the race. The old read-compare-mutate-save
  shape let a burst of clicks past the limit (measurably: 20 simultaneous claims
  against a limit of 2 granted 3).
- **Protection.** While the roller still has claims left, only they may claim the
  card. The moment their claims run out the card opens up and anyone else holding
  a claim can take it. Skip and quick-sell always stay with the roller.
- **Skip re-rolls.** Paying the skip fee blacklists that character and immediately
  offers a replacement, preferring the same anime. Skipped characters are stored
  in the collection with `blacklisted: true`, which is what keeps them out of
  future pulls, and every collection view filters them out.
- **No duplicates.** A roll excludes every character id you own *or* skipped; an
  anime whose cast you've exhausted is retried elsewhere and is **not** added to
  the failed-anime blacklist, because the anime itself is fine.
- **Multi-roll.** `/waifu count:1-20` posts one card per character plus a summary
  with a Claim All button, validated against your remaining pulls up front. The
  batch loop spends each pull *before* rolling and stops the moment one is refused,
  so a second `/waifu` running concurrently can't get characters no pull paid for.
- **`/force-waifu`** (owner only) offers cards from one anime rather than claiming
  them outright: a value summary plus Claim / Skip / Quick Sell per character, for
  the *recipient* to press. Forced cards consume no claim and have no protection
  window: they're a grant, not a pull. Their skips re-roll within that anime only.

Prices come from the anime's MAL mean score: `max(ceil(mean * 10 / 2), 10)`. Cards
claimed by the old bot have no stored price at all; that bot recomputed it on every
render. `resolveWaifuPrices` refetches those and backfills them once.

### Collection screens (waifus / sell / trade)

Every screen that walks a character collection shares
[`src/lib/waifu/picker.ts`](src/lib/waifu/picker.ts). A Discord select menu holds at most
**25 options**, which is why `/sell` could once only ever reach your first 25 cards.
The picker pages through the list instead, and selection values are **absolute indices**,
so a pick made on page 4 still refers to the right character.

- Prev/Next **wrap**: Previous on page 1 goes to the last page.
- The middle button opens a **jump-to-number modal**. Modal submits are their own
  interaction type, so they land in `interaction-handlers/waifu-jump.ts` rather than the
  button handler; the `cmd` in the customId says which screen to re-render.
- `/trade @user` with no card numbers runs a guided two-step picker (give → want →
  offer), driven by `stage` on the persisted session. Passing `yours:` and `theirs:`
  still skips straight to the offer.

### Adding a new interaction counter command

Most "action" commands (hug, pat, punch, …) are one config object thanks to the
counter factory. Five steps:

1. Add the value to `CommandType` in `src/lib/enums/command.enum.ts`.
2. Add a `media/<type>.json` gif pool (a plain JSON array of URLs). The filename must
   equal the `CommandType` string, since `MediaService` resolves it by name.
3. Add the counter field to `src/lib/models/command-counter-schema.ts`, then register it
   in the `META` table in `src/lib/functions/counters.ts` and export an `addNuzzle` /
   `getNuzzle` pair next to the others.
4. Add the strings to **every** locale under `languages/<locale>/counter.json`, at
   `actions.nuzzle`:
   ```json
   "nuzzle": { "title": "Nuzzle!", "verb": "nuzzled", "singular": "nuzzle", "plural": "nuzzles" }
   ```
   The factory reads `counter:actions.<name>.{title,verb,singular,plural}`. It takes
   *i18n keys*, never literal text.
5. Write the command:

```ts
// src/commands/Counter/nuzzle.ts
import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addNuzzle } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'nuzzle',                    // also the i18n key: counter:actions.nuzzle.*
    description: 'Nuzzle someone!',
    commandType: CommandType.Nuzzle,   // picks media/nuzzle.json
    add: addNuzzle,
})
```

Optional config keys: `titleKey` (override, or `null` for no heading; see `geh`),
`descriptionKey` (override the whole line), `allowSelf`, `selfResponse`, `aliases`,
and `cooldownMs`.

Awards are automatic: add rows to `AWARD_DEFINITIONS` in
`src/lib/services/award-system.service.ts` and the factory fires the `awardDeserved`
event when a total is hit.
