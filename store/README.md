# Store page material

Everything the web portals ask for besides the game itself (phase 4 of the portals plan).

| File | What | Where it goes |
| --- | --- | --- |
| `listing.md` | title, descriptions, controls, tags | CrazyGames Developer Portal, itch.io page |
| `cover-landscape.png` | 1920 × 1080 | CrazyGames (landscape), itch.io banner |
| `cover-portrait.png` | 800 × 1200 | CrazyGames (portrait) |
| `cover-square.png` | 800 × 800 | CrazyGames (square) |
| `shots/*-play.png` | in-game views, 1920 × 1080 | itch.io screenshots, cover sources |
| `release/worldbreach-web.zip` | the web build (`npm run package`, not in git) | itch.io upload, CrazyGames build |

## The covers

`covers.html` lays out the three `shots/*-play.png` in slices with the title. Open it in a browser
at `covers.html?w=1920&h=1080` (or `w=800&h=1200`, `w=800&h=800`) with the window at that exact
size, and capture the page. CrazyGames rules: only the title as text, no border, no logo, no
"Play now".

## The video (to record by hand)

CrazyGames wants two clips of 15 to 20 s, no sound, landscape 1920 × 1080 and portrait 2:3
(1080 × 1620), opening on the static cover, with no black bars, no mouse cursor and no fast-forward.

1. Record a fight in each world with OBS (no HUD is fine; the cursor is hidden by the pointer lock).
2. Cut about 6 s per world, start on `cover-landscape.png` for half a second.
3. Export the landscape clip, then crop a 2:3 version centred on the action (HandBrake or any editor),
   both without audio, under 50 MB.

## itch.io

1. Create the project: Kind of project "HTML", upload `release/worldbreach-web.zip`, tick
   "This file will be played in the browser".
2. Embed options: 1280 × 720 viewport, "Fullscreen button" on, "Mobile friendly" off.
3. Paste the description and controls from `listing.md`, add the landscape cover and the shots.
4. Keep the page restricted or unlisted while the first players test it, then share the link.
