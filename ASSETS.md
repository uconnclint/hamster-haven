# 🎨 Hamster Haven — Art Asset Generation Guide

This document specifies **every image asset** needed to replace the placeholder emoji in
Hamster Haven with custom art. Each entry has a **filename**, **size**, **where it's used**,
and a **ready-to-paste prompt** for an image generator (Midjourney, DALL·E 3, Ideogram,
Stable Diffusion, Firefly, etc.).

Save all generated files into **`public/assets/`** using the exact filenames below.
Once they exist, the game will reference them (see *Wiring* at the bottom).

---

## 0. How to use this file

1. Read the **Global Style Guide** below — it defines one consistent look so every icon
   feels like the same game.
2. For each asset, prepend the **Master Style Prefix** to that asset's prompt.
3. Generate at the listed size, **1:1 square** unless noted, on a **transparent background**
   (or a flat solid background you can key out — see *Backgrounds*).
4. Name the file exactly as listed and drop it in `public/assets/`.

### Backgrounds
- If your tool supports transparency (Midjourney `--style raw` + background removal,
  Ideogram, Firefly, SDXL with alpha), request a **transparent background**.
- If not, add `on a plain flat mint-cream background, no shadows touching the edges` to the
  prompt and remove the background afterward (e.g. remove.bg, Photoshop, `rembg`).

---

## 1. Global Style Guide

**Art direction:** flat-shaded **low-poly 3D**, like a cozy handheld game
(Animal Crossing × Monument Valley × Unpacking). Chunky faceted geometry, matte clay-like
surfaces, soft ambient occlusion, one gentle key light from the upper-left, tiny soft
contact shadow. Rounded, friendly, toy-like. **No text, no letters, no words** anywhere in
the art (the UI adds its own text). One subject, centered, with even padding.

**Camera:** three-quarter view from slightly above (≈30° down, ≈35° to the side) for objects
and parts; straight-on for faces and flat symbols. Keep the **same camera and scale** across
all part icons so the build bar looks uniform.

**Finish:** matte, no glossy specular blowouts, no photorealism, no outlines/black strokes,
no gradients-as-background. Cohesive warm pastel palette below.

### Palette (use these hexes)

| Role | Hex |
|---|---|
| Cream / parchment | `#f2e3c6` `#ead7b5` |
| Warm amber (primary accent) | `#f6c453` `#e0902f` |
| Ink brown (darkest) | `#4a3626` |
| Hamster fur (golden) / belly | `#e8a552` / `#f7e3c2` |
| Leaf green | `#8fbf6b` `#7fb069` |
| Sky blue | `#6ec6e6` |
| Berry red / coral | `#ef767a` `#e86a5e` |
| Grape purple | `#b28dd9` |
| Wood tan | `#c8965a` `#d9a066` |
| Sunflower-seed brown / stripe | `#8a5a2b` / `#d9b98a` |

### Master Style Prefix
> *Prepend this to every prompt below.*

```
Flat-shaded low-poly 3D render, cozy handheld-game style, chunky faceted geometry, matte
clay-like surface, soft ambient occlusion, single soft key light from upper-left, small soft
contact shadow, no outlines, no text or letters, warm pastel palette, centered single subject
with even padding, transparent background, app-icon quality —
```

---

## 2. Brand & Mascot

### `mascot.png` — 1024×1024
**Used:** title screen wordmark hamster, toasts, general branding.
> a plump adorable golden hamster (`#e8a552` fur, `#f7e3c2` cream belly and cheeks), sitting
> upright, big round cheeks stuffed, tiny pink paws holding a single striped sunflower seed,
> round black bead eyes, small rounded ears with pink inner, three-quarter front view, joyful
> expression

### `favicon.png` — 128×128
**Used:** browser tab icon (replaces the emoji favicon).
> a golden hamster head only (`#e8a552`), front view, big cheeks, round black eyes, tiny pink
> nose, simple bold readable-at-tiny-size shape, minimal detail

---

## 3. Buttons (custom plates)

These are **plate backgrounds**; the UI overlays the button label text in code, so **leave the
center clear** and put no letters in the art. Wide format. If your tool supports it, generate
as a **9-slice-safe** plate (uniform rounded border, flat center).

### `button-primary.png` — 1024×384
**Used:** the **Create World** button.
> a horizontal rounded-rectangle wooden-and-amber button plaque, warm honey-amber top face
> (`#f6c453`) with a slightly darker rounded bevel edge (`#e0902f`), soft top highlight,
> gently puffy 3D candy-button look, empty flat center, friendly and inviting

### `button-secondary.png` — 1024×384
**Used:** the **Join** button.
> a horizontal rounded-rectangle button plaque in soft leaf green (`#8fbf6b` face, `#7fb069`
> bevel), same puffy 3D candy-button style as the amber one, soft top highlight, empty flat
> center

### `button-round.png` — 256×256
**Used:** small circular chips (music toggle, copy) — a blank round plate the icons sit on.
> a small round puffy 3D button plate, cream face (`#f2e3c6`) with a soft raised bevel and
> gentle top highlight, empty center, matte

---

## 4. HUD Icons — 512×512 each

### `icon-seed.png` — replaces 🌻
**Used:** the seed counter, floating title decoration.
> a single plump striped sunflower seed, teardrop shape, warm brown shell (`#8a5a2b`) with a
> pale cream stripe pattern (`#d9b98a`), slightly glossy tip, three-quarter view

### `icon-trophy.png` — replaces 🏆
**Used:** the "Havenmates" leaderboard header.
> a chubby low-poly trophy cup, warm gold (`#f6c453`) with a small cream base, two little
> handles, rounded and cute, three-quarter view

### `icon-copy.png` — replaces 📋
**Used:** the room-code copy chip.
> a small rounded clipboard with a paper sheet, cream paper (`#f2e3c6`) on a warm wood-tan
> board (`#c8965a`), a tiny clip on top, simple and clean, front view

### `icon-music-on.png` — replaces 🎵
**Used:** music toggle (on state).
> a plump rounded musical note in warm amber (`#f6c453`), single note with a soft rounded
> head and stem, cheerful, front view

### `icon-music-off.png` — replaces 🔇
**Used:** music toggle (off/muted state).
> a plump rounded musical note in muted grey-tan (`#b9a892`), dimmed, with a small soft slash
> across it, front view

---

## 5. Build Part Icons — 512×512 each

**Keep the exact same camera, scale, and lighting for all nine** so the build bar reads as a
matched set. Each should look like a tiny 3D model of the in-game part.

### `part-tube.png` — replaces 🟡
> a short open-ended glossy plastic tube segment, sunflower-yellow (`#f6c453`), hollow, with a
> clean white ring rim at each opening, lying horizontally, three-quarter view

### `part-corner.png` — replaces 🔄
> a 90-degree elbow tube (curved bend), sunflower-yellow plastic (`#f6c453`), hollow, a white
> ring rim at each of its two openings, three-quarter view

### `part-climb.png` — replaces 🪜
> a tall vertical translucent plastic climbing tube standing upright, soft sky-blue (`#6ec6e6`),
> with three white rings stacked up its height, three-quarter view

### `part-ramp.png` — replaces 📐
> a small wedge ramp rising left-to-right, warm wood-tan surface (`#d9a066`) with bright yellow
> side rails (`#f6c453`), three-quarter view

### `part-platform.png` — replaces 🟩
> a thick square floating platform slab, leaf-green top (`#8fbf6b`) with a darker green trim
> edge (`#7fb069`), four tiny stubby legs, three-quarter view

### `part-wheel.png` — replaces ☸️
> a hamster exercise wheel, coral-red drum (`#ef767a`) with white running rungs around the
> inside, mounted on a small grey stand and base, three-quarter side view

### `part-house.png` — replaces 🏠
> a tiny cozy hamster house, warm orange walls (`#f4a261`) with a small arched doorway, a red
> pyramid roof (`#ef767a`) and a little chimney, three-quarter view

### `part-hay.png` — replaces 🌾
> a soft rounded mound of golden straw/hay (`#e9d38a`), a few loose straws poking out, cozy and
> fluffy, three-quarter view

### `part-fence.png` — replaces 🚧
> a short wooden picket fence section, two posts and two rails, warm tan wood (`#c9905a`),
> simple and cute, three-quarter view

---

## 6. Emote Icons — 512×512 each

**Used:** the emote pills (keys 1–4) and the floating speech bubble above a hamster.
Bold, readable at small size, centered.

### `emote-love.png` — replaces ❤️
> a plump puffy 3D heart, soft coral-red (`#ef767a`), glossy-soft, front view

### `emote-happy.png` — replaces 😊
> a happy golden hamster face (`#e8a552`), closed upturned smiling eyes, rosy cheeks, tiny pink
> nose, front view, joyful

### `emote-sleep.png` — replaces 💤
> a plump crescent moon in soft periwinkle (`#b3c7e6`) with a tiny sparkle star beside it,
> peaceful sleepy mood, front view, no letters

### `emote-alert.png` — replaces ❗
> a bold chunky 3D exclamation mark (a rounded vertical bar above a round dot), bright warm red
> (`#ef767a`), front view

---

## 7. Title-Screen Decorations — 256×256 each

**Used:** the gently floating decorations on the menu backdrop.

### `deco-seed.png`
> a single small striped sunflower seed, warm brown (`#8a5a2b`) with cream stripes, cute,
> three-quarter view *(may reuse `icon-seed.png`)*

### `deco-paw.png` — replaces 🐾
> a small soft hamster paw print, four toe beans and a pad, warm tan-pink (`#e8b89a`), flat
> top-down view

### `deco-acorn.png` — replaces 🌰
> a small plump acorn, warm brown nut (`#8a5a2b`) with a textured tan cap (`#c8965a`), cute,
> three-quarter view

---

## 8. Asset Manifest (checklist)

| File | Size | Replaces | Used in |
|---|---|---|---|
| `mascot.png` | 1024² | 🐹 | title, toasts |
| `favicon.png` | 128² | 🐹 | browser tab |
| `button-primary.png` | 1024×384 | (Create World plate) | menu |
| `button-secondary.png` | 1024×384 | (Join plate) | menu |
| `button-round.png` | 256² | (chip plate) | HUD chips |
| `icon-seed.png` | 512² | 🌻 | seed counter |
| `icon-trophy.png` | 512² | 🏆 | leaderboard |
| `icon-copy.png` | 512² | 📋 | room-code chip |
| `icon-music-on.png` | 512² | 🎵 | music toggle |
| `icon-music-off.png` | 512² | 🔇 | music toggle |
| `part-tube.png` | 512² | 🟡 | build bar |
| `part-corner.png` | 512² | 🔄 | build bar |
| `part-climb.png` | 512² | 🪜 | build bar |
| `part-ramp.png` | 512² | 📐 | build bar |
| `part-platform.png` | 512² | 🟩 | build bar |
| `part-wheel.png` | 512² | ☸️ | build bar |
| `part-house.png` | 512² | 🏠 | build bar |
| `part-hay.png` | 512² | 🌾 | build bar |
| `part-fence.png` | 512² | 🚧 | build bar |
| `emote-love.png` | 512² | ❤️ | emotes |
| `emote-happy.png` | 512² | 😊 | emotes |
| `emote-sleep.png` | 512² | 💤 | emotes |
| `emote-alert.png` | 512² | ❗ | emotes |
| `deco-paw.png` | 256² | 🐾 | title backdrop |
| `deco-acorn.png` | 256² | 🌰 | title backdrop |

**25 images total.**

---

## 9. Wiring (done ✓)

All 25 assets live in `public/assets/` and are wired into the game:

- **Part icons** — `CATALOG` in `public/js/parts.js` now points each `icon:` at
  `assets/part-*.png`; the build bar in `public/js/ui.js` renders an `<img>` when the icon is a
  path (falls back to an emoji glyph otherwise, so new/renamed parts still work).
- **UI icons, buttons, emotes, decorations** — `public/js/ui.js` uses an `img()` helper for the
  mascot, seed/trophy/copy/music icons, decorations, and emote pills; the Create/Join buttons
  use the plate art as CSS backgrounds (`public/style.css`).
- **In-world emote bubbles** — `public/js/hamster.js` draws the speech bubble on a canvas and
  composites the emote PNG on top.
- **Favicon** — `public/index.html` → `/assets/favicon.png`.

To swap any asset, just overwrite the PNG in `public/assets/` with the same filename.
