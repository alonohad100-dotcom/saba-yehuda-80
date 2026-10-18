# Show-night runbook (the laptop is the projector)

## The day before
1. Charge the laptop. Pack: HDMI cable, the adapter for this laptop, the clicker (optional), a USB stick with `show-backup.mp4` (see Backup below).
2. Windows: Settings → System → Power: plan *Best performance*, screen never turns off while plugged in. Settings → System → Notifications: turn on *Do not disturb*. Pause Windows Update for 7 days.
3. Open a terminal in the project folder and run the full chain once:
   ```
   npm run ingest
   npm run show
   ```
   `npm run show` builds the client, starts the server and opens Chrome in kiosk mode on `http://127.0.0.1:4000/show`.
4. Run the whole show once from the Start button to the black screen. Listen to one greeting and one music track through the TV.

## At the venue
1. Connect HDMI. Windows + P → **Extend** (or *Duplicate* if you want to see the show on the laptop too and do not need the presenter view). On the TV, set the resolution to the TV's native one, scaling 100 %.
2. Audio: Windows sound output → the TV / HDMI device. Test volume with the first greeting video.
3. Start:
   ```
   npm run show
   ```
   Drag the Chrome window to the TV if it did not open there. Press `F` for fullscreen if needed.
4. Optional presenter view on the laptop screen: open `http://127.0.0.1:4000/presenter` in a normal Chrome window. It shows the current and next slide, the clock, elapsed and remaining time, and your notes, and its buttons control the show.
5. Click **התחל את המצגת** (or press Space). The click unlocks audio and enters fullscreen.

## Controls (keyboard and any presentation clicker)
| Key | Action |
|---|---|
| Space, →, PageDown, Enter | next slide |
| ←, PageUp, Backspace | previous slide |
| P | pause / resume auto-advance |
| B | black screen (music mutes), B again to return |
| M | mute / unmute music |
| F | fullscreen on / off |
| Home / End | first / last slide |

Greeting videos auto-advance when they end. A slide set to *wait for click* shows "ממתין ללחיצה" in the HUD (move the mouse to see it).

## If something goes wrong
- **No sound:** press M (maybe muted). Check Windows output device. Reload the page and press Start again (audio is unlocked by that click).
- **A video does not play:** press → to skip it. Re-run `npm run ingest` later and check the warnings in the library dialog.
- **Chrome froze or the laptop restarted:** `npm run show` again, then on the start screen press Start and use Home/End or the presenter view's slide list to jump to where you were.
- **Everything failed:** play `show-backup.mp4` from the USB stick in VLC, full screen (F).

## Backup recording
On rehearsal day, record one full run with OBS Studio (Display Capture of the TV screen, Desktop Audio on) or Windows Game Bar (Win+G → Record). Save as `show-backup.mp4`, test it in VLC, copy it to the USB stick.

## Restoring an earlier version of the show
Editor → **גרסאות** lists every autosave (last 300) and every named version. Restore is itself saved as a new version, so nothing is ever lost. The files also live in `data/backups/`.
