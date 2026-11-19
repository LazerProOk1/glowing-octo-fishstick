# Visual acceptance checklist (map, UI)

Code review does not judge looks. A task that changes the picture is closed only after a browser
check against this list; if the author is available, show before/after screenshots and wait for "yes".

- Check 3 zooms (overview, mid, max) on at least 2 seeds, side by side with "before" shots in `docs/screenshots/`.
- Ask "would a real map / HoI4 look like this?", not "is it better than before?".
- Hover land and water at the coast, a lake; toggle provinces mode (M).
- Clean reload before reading the console (stale HMR errors persist).

Reject if any of:
- the same effect around every object (halo, glow, outline around each island);
- blotches/"clouds" from small-scale noise where it should be even (open sea, plains);
- stairs or pixels at any zoom (coast, borders, hover, fill);
- sharp straight lines nature doesn't make (biome edges along latitude or grid);
- dark bands or seams between neighbouring areas;
- acid/neon colours or excess contrast — everything muted, "paper" HoI4 palette;
- rivers ending on land, hover/fill not reaching the coastline.

Past mistakes: "AI-looking UI" (stage 1), glowing halo around islands in the sea (stage 1.5).
