# 🏁 Ghost Rally

**Race your community. Steal the record. Become the ghost.**

Ghost Rally is a physics racing game built for Reddit with [Devvit Web](https://developers.reddit.com/docs) and [Phaser](https://phaser.io). Every track is a Reddit post, and every record is a real redditor's replay haunting the track — username floating overhead — until someone dethrones them.

**▶ Play it: [r/GhostRally](https://www.reddit.com/r/GhostRally/)** · [App listing](https://developers.reddit.com/apps/ghost-rally)

## The hook

1. **You never race alone.** Every run features the track's podium — the top-3 replays (👑🥈🥉) plus your own personal best — racing beside you as named ghosts. Beat the record and *your* replay becomes the ghost everyone hunts, and the app posts a comment announcing exactly who you dethroned.
2. **Daily Rally.** A new track every midnight UTC, generated deterministically from the date itself — everyone on Earth races the same one. It gets its own pinned post with a live countdown, a daily leaderboard, and a morning results post crowning the podium. Daily streaks multiply your Rally Points up to ×2.
3. **The community builds the game.** Players sculpt tracks in the built-in editor (drag terrain handles, drop boost pads), must prove them beatable with a test run — which becomes the track's first record — and publish. Each track becomes a new interactive post whose preview card shows the real elevation profile, the time to beat, and its run count. A nightly digest features every track built the day before.

## Social by design

All growth is player-driven and policy-compliant — every action is an explicit button:

- **Share** — challenge friends via Reddit's native share sheet ("Think you can beat 9.56s?")
- **Brag** — post your time as a comment, threaded under a pinned times thread
- **Join** — one-tap subscribe so you never miss a daily rally
- **Dethronement comments** — record steals are announced publicly on the track's post

## How to play

- **Gas** → / D (or right pedal) · **Brake/reverse** ← / A (or left pedal)
- **Lean forward** ↑ / W · **Lean back** ↓ / S — land your flips or wreck
- **Boost pads** fling you forward; the **checkered flag** stops the clock
- Beat the 👑 ghost to take the record; check **RANKS** for track/daily/weekly/all-time boards
- **Build:** menu → BUILD → sculpt, test drive, publish

## Scoring (Rally Points)

| Action | RP |
| --- | --- |
| Finish a community track | 15 |
| Finish the Daily Rally | 20 |
| New personal best | +10 |
| **Steal a track record** | **+50** |
| Publish a track | 25 |
| Daily streak multiplier | up to ×2 |

## Tech

- **Devvit Web** — Hono server on the Devvit serverless runtime; Redis sorted sets for leaderboards, podiums and replays; Reddit API for track posts, dethronement comments, scheduled daily posts (pinned countdown card, podium recap, fresh-tracks digest); `postData`-driven feed splash cards; Devvit Journeys analytics.
- **Phaser 4 + Matter.js** — rear-wheel-drive buggy with constraint suspension, terrain from Catmull-Rom splines rasterized into one deterministic code path (ghosts replay against the exact same ground), 30 fps ghost recording with interpolated playback, and **fixed 60 Hz physics stepping** so records are fair across 60/90/120 Hz devices.
- **Zero asset files** — every sprite is drawn procedurally at boot, and all audio (engine loop included) is synthesized live with WebAudio.

## Development

```bash
npm install
npm run dev      # playtest on your test subreddit
npm run deploy   # build + upload
npm run launch   # deploy + publish for review
```

Built for Reddit's [Games with a Hook](https://redditgameswithahook.devpost.com/) hackathon, 2026.
