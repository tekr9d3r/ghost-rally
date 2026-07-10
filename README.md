# 🏁 Ghost Rally

**Race your community. Steal the record. Become the ghost.**

Ghost Rally is a physics racing game built for Reddit with [Devvit Web](https://developers.reddit.com/docs) and [Phaser](https://phaser.io). Every track is a Reddit post, every record holder haunts the track as a live ghost replay — with their username floating over it — until someone dethrones them.

## The hook

1. **You never race alone.** Every run, the track record holder's ghost races beside you (plus your own PB ghost). Beating the record makes *your* replay the ghost everyone else races — and posts a comment announcing who you dethroned. The dethroned player has a very personal reason to come back.
2. **Daily Rally.** A new procedurally-generated track every day (same for everyone), with its own leaderboard and record ghost. Daily streaks multiply your Rally Points up to ×2.
3. **The community builds the game.** Players sculpt tracks in the built-in editor (drag terrain handles, drop boost pads), must prove them completable with a test run, and publish them — each track becomes a new interactive post in the subreddit, with the creator's test run as the first record to beat.

## How to play

- **Drive:** hold the right side / →/W to accelerate, left side / ←/S to brake & reverse. In the air, gas/brake tilts the buggy — land clean or wreck.
- **Boost pads** fling you forward. **Checkered flag** stops the clock.
- **Beat the ghost** 👑 to take the track record and earn RP.
- **Build:** hub post → BUILD A TRACK → sculpt, test, publish.

## Scoring (Rally Points)

| Action | RP |
| --- | --- |
| Finish a community track | 15 |
| Finish the Daily Rally | 20 |
| New personal best | +10 |
| **Steal a track record** | **+50** |
| Publish a track | 25 |
| Daily streak multiplier | up to ×2 |

Weekly and all-time leaderboards; daily boards rank by fastest time.

## Tech

- **Devvit Web** — Hono server on the Devvit serverless runtime, Redis for tracks/ghosts/leaderboards/streaks, Reddit API for post creation and record-steal comments, `postData` for instant feed splash cards.
- **Phaser 4 + Matter.js** — soft-suspension buggy rig, terrain built from Catmull-Rom splines, ghost replays recorded at 30 fps and interpolated on playback.
- **Zero assets** — every sprite is generated procedurally at boot (Graphics/Canvas), and all sound is synthesized live with WebAudio (engine loop included).

## Development

```bash
npm install
npm run dev      # playtest on your test subreddit
npm run deploy   # build + upload
npm run launch   # deploy + publish for review
```
