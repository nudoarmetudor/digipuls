# DigiPuls — brand identity

DigiPuls belongs to the Digital Accelerator / Clasa Viitorului programme, and
this document defines how it looks and sounds within it. The palette is taken
directly from the Digital Accelerator logo (see §3). It is a working reference for
anyone touching the interface, not a style exercise: every rule here is
implemented in `public/css/style.css` and `public/img/`, and several of them
exist because of an accessibility or honesty constraint rather than a
visual preference.

---

## 1. What the product is

**DigiPuls** — *digital pulse*. A national platform where Moldovan schools
assess their own digital maturity against the MDSF instrument, produce a
two-year development plan, and where the Ministry, territorial authorities
and partners see the resulting picture.

**Positioning line:** *Moldova's digital school maturity platform.*
(`brand_tagline` in `src/i18n/index.js` — the translated versions are the
canonical ones for RO and RU; do not re-translate ad hoc.)

**What the name has to carry.** A pulse is a *repeated reading of a living
thing*, not a grade. That is exactly the product: a two-year cycle, taken
again and again, showing movement. The name is the argument against reading
DigiPuls as a ranking or an inspection — and the interface has to keep making
that argument (see §6).

---

## 2. Logo

### The mark

Four arcs forming a broken ring, with a pulse line running through it and out
both sides.

- **The four arcs are the four MDSF domains** (A leadership, B teaching,
  C human capacity, D infrastructure) and deliberately echo the maturity
  wheel that is the product's central visualisation. The mark and the data
  are the same shape.
- **The ring is broken, not closed.** Digital maturity is never finished;
  a closed ring would say the opposite.
- **The pulse crosses the gaps** at left and right, so the signal is shown
  passing *through* the structure rather than sitting inside it.

### Files

| File | Use |
|---|---|
| `public/img/digipuls-logo.svg` | Full lockup (mark + wordmark). Default for documents, presentations, external material. |
| `public/img/digipuls-mark.svg` | Mark alone. Square contexts: avatars, favicons at larger sizes, app tiles. |
| `public/img/digipuls-logo-mono.svg` | Single-colour lockup drawn in `currentColor`. Use on brand-coloured backgrounds, in print, and anywhere the full-colour version can't hold contrast. |
| `public/img/favicon.svg` | Browser tab. Ring dropped, pulse thickened — the ring is illegible at 16px, and a smudge is worse than a simplification. |
| `src/views/partials/brand.ejs` | The in-product masthead: the mark inlined so it inherits `currentColor`, beside the wordmark as real HTML text. |

### Rules

- **Clear space:** at least the height of the "D" on all sides.
- **Minimum size:** 24px for the mark, 120px wide for the lockup. Below that,
  use the favicon simplification.
- **The wordmark is `Digi` + `Puls`,** one word, two capitals, no space, no
  hyphen — the same two-tone split the Digital Accelerator logo uses for
  "Digital Accelerator". In colour contexts `Digi` is deep teal and `Puls` is
  purple; in the masthead `Puls` uses `--purple-300` so it holds against the
  dark bar, and the pulse line takes the logo's turquoise.
- **Don't** recolour the arcs individually, close the ring, remove the pulse,
  add a container shape, stretch, rotate, or set the wordmark in another face.
- The standalone SVGs set the wordmark in the brand type stack rather than as
  outlines, so they stay crisp and themeable in-product. **Convert text to
  outlines before sending any of these files to a printer.**

---

## 3. Colour

The palette comes from the **Digital Accelerator logo** on
[accelerator.clasaviitorului.md](https://accelerator.clasaviitorului.md).
DigiPuls is part of that programme, so it should look like it. The three
anchors were sampled from the logo artwork itself rather than read off the
site's stylesheet — the artwork is the source of truth, and it differs from
the site CSS by a few degrees of hue:

| Anchor | Hex | HSL | Where it comes from |
|---|---|---|---|
| **Teal** | `#266a82` | `196° 55% 33%` | the word **Digital** |
| **Purple** | `#5b1f6f` | `285° 56% 28%` | the word **Accelerator** |
| **Turquoise** | `#01cbbe` | `176° 99% 40%` | the **arrow** |

### 3.1 The ramps

| Teal | | Purple | |
|---|---|---|---|
| `--teal-50` | `#f1f7f9` | `--purple-50` | `#f7f0f9` |
| `--teal-100` | `#dceaef` | `--purple-100` | `#eddff1` |
| `--teal-200` | `#b7d2dc` | `--purple-200` | `#d7bedf` |
| `--teal-300` | `#87b4c4` | `--purple-300` | `#bb93c8` |
| `--teal-400` | `#4a8da5` | `--purple-400` | `#8e46a4` |
| **`--teal-500`** | **`#266a82`** — logo | **`--purple-500`** | **`#5b1f6f`** — logo |
| `--teal-600` | `#1e576c` | `--purple-600` | `#4c195d` |
| `--teal-700` | `#184759` | `--purple-700` | `#3f134e` |
| `--teal-800` | `#113340` | `--purple-800` | `#2f0e3a` |
| `--teal-900` | `#0c232c` | `--purple-900` | `#1f0826` |

Turquoise is a short ramp, because it is a short-range accent:
`--turquoise-100` `#d6f5f3`, `--turquoise-300` `#7de8e1`,
**`--turquoise-500` `#01cbbe`** (logo), `--turquoise-700` `#077e78`.

Plus a neutral ramp (`--neutral-0` … `--neutral-900`) for surfaces, borders
and body text.

### 3.2 Turquoise is for motion, not decoration

In the source logo the turquoise is the arrow — the thing that says *moving*.
DigiPuls uses it in exactly the two places that mean the same thing: the
**pulse in the mark**, and the **progress bar**. That is the whole licence.
It is not a general-purpose highlight, and it is not a text colour: at 4.0:1
on white it fails AA for body copy. `--turquoise-700` exists for the rare
case where it must carry text; `--signal` and `--signal-text` are the
semantic tokens.

Using it anywhere else turns a three-anchor identity into a soup.

### 3.3 Never use a raw shade in a component

Components reference **semantic tokens** — `--surface`, `--text`, `--border`,
`--primary`, `--accent`, `--signal`, `--topbar-bg`, `--ok-text`, `--bad-bg`,
and so on. The raw ramp exists only to define those tokens, and the dark and
high-contrast blocks reference the same ramps rather than carrying their own
literals — so re-anchoring the palette (as this pass did) moves every theme
at once instead of leaving three of them behind.

This is also what makes four viewer preferences possible at all. A component
that hardcodes `#266a82` opts out of dark mode and high contrast silently: it
will simply be wrong for those viewers and look fine to whoever wrote it.

### 3.4 The status colours

Grey / blue / red / green were established for the assessment step-navigator
before this identity work and are **kept**, because they encode a check state
with a conventional meaning that a brand palette cannot carry honestly:

| Token | Meaning |
|---|---|
| `--status-grey` | not started |
| `--status-blue` (= brand teal) | in progress |
| `--status-red` | needs attention — evidence missing |
| `--status-green` | complete |

These are the only colours outside the three logo hues, and they are only ever
used for state. **Colour never carries state on its own** — every status dot
is accompanied by text (visible or visually hidden), and every pass/fail badge
spells out `OK` / `GAP` / `COMPLIANT`.

### 3.5 Maturity levels

Levels 1–5 read as one progression across both brand hues: pale teal → teal →
deep teal → purple → deep purple. Level 0 uses the "bad" pair, because level 0
on D1/D2 means failing Order 675's mandatory minimum — a real failure, not
just a low score. The level number is always written out (`Level 3`), never
conveyed by the swatch alone.

### 3.6 The maturity wheel

The wheel's four sectors use `--wheel-a` … `--wheel-d`, which are re-pointed
per theme. Left at their light-theme values, the wheel becomes four dark
smudges on a dark background — the one place where a "just use the brand
colours" instinct produces something unreadable.

### 3.7 Contrast is checked, not assumed

Every pairing the stylesheet relies on is verified: AA (4.5:1) for text in the
light and dark themes, AAA (7:1) throughout high contrast, 3:1 for focus rings
and other non-text indicators. When the palette was re-anchored to the logo,
all 25 pairings were re-checked before the change shipped.

## 4. Typography

```
--font-ui:   Inter, "Segoe UI", system-ui, -apple-system, Roboto,
             "Helvetica Neue", Arial, sans-serif
--font-mono: "SF Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace
```

A system stack, deliberately: no webfont download, no layout shift, no CDN
dependency, and correct rendering of Romanian diacritics (ș ț ă î â) and
Cyrillic on every platform the platform's users actually have. Schools on slow
rural connections should not wait on a font.

**Every size is in `rem`.** The viewer text-size preference scales the root
font size (100 / 115 / 130 / 150%), so anything expressed in `px` refuses to
grow and quietly breaks the feature.

| Role | Size | Weight |
|---|---|---|
| h1 | 1.6rem | 700 |
| h2 | 1.25rem | 700 |
| h3 | 1.05rem | 600 |
| body | 1rem / 1.55 | 400 |
| small, captions | 0.85rem | 400 |
| stat number | 1.8rem | 700 |

---

## 5. Layout and components

- **Radius:** 8px cards, 6px controls, pill for badges and step markers.
- **Elevation:** one very light shadow, dropped entirely in high contrast
  where a shadow reads as blur rather than depth.
- **Target size:** every interactive control is at least 44px tall
  (`--tap`), per WCAG 2.5.8.
- **Focus:** a 3px `--focus` outline with 2px offset, on `:focus-visible`.
  The focus colour is purple on light and pale purple on dark, so it never
  merges into the cyan it sits on.
- **Wide tables** live inside `.table-scroll`, which scrolls the table rather
  than the page and becomes keyboard-focusable only when it actually
  overflows (see `public/js/a11y.js`).
- **Grids** use `repeat(auto-fit, minmax(min(Xrem, 100%), 1fr))` so they
  reflow with the viewport *and* with the text-size preference.

---

## 6. Voice

The product's job is to help a school see itself accurately and then act. The
voice follows from that.

**Plain, specific, unhedged.** "19 of 19 indicators rated" beats "assessment
progress". Name the thing that is missing.

**Never evaluative about the school.** DigiPuls reports what the data says;
it does not praise or scold. "Evidence missing" — not "incomplete work".

**Honest about the system's own limits, in the interface itself.** This is a
brand attribute here, not just an engineering habit. The Order 675 panel says
in plain words that it checks declared quantities and a network checklist and
*not* technical specifications or room-usage mandates. The strategic-partner
dashboard says on the page that its sort is one disclosed criterion and not a
matching engine. The footer says the SIME connection is a mock. Removing
these to make the product look more finished would be a brand violation, not
a copy improvement.

**No ranking language.** No "top", "best", "leaderboard", "score out of".
Schools have levels and bands; they are not placed against each other. The
public tier discloses a band, never a number.

**Three languages, equal standing.** English, Romanian and Russian. Romanian
is the state language; Russian is the working language of a substantial share
of schools. A translation that lags is a bug, and `tests/i18n.test.js` fails
the build when one does. Nothing in the interface may branch on language in a
way that leaves a third language falling back to English.

---

## 7. Accessibility commitments

These are part of the identity, not a compliance annex — a national platform
that school staff are *required* to use has no fallback audience.

- **Three languages**, including the full 19-indicator instrument.
- **Light, dark and system colour schemes**, plus a **high-contrast mode**
  built from the same two ramps at AAA-level pairings.
- **Four text sizes** (100–150%), applied by scaling the root font size so
  the whole interface reflows.
- **Reduced motion**, honouring `prefers-reduced-motion` and offering an
  explicit override.
- **Always-underline-links** for anyone who can't rely on colour.
- Semantic landmarks, a skip link, labelled form controls, `aria-current`
  on the current page and step, live regions for status changes, and
  keyboard access to every control — including the SIME search results,
  which are buttons rather than clickable divs.
- **Everything works without JavaScript.** The display panel, the role
  switcher and the feedback report form are all plain links and forms that
  scripting only upgrades. This is why the active role lives in the URL
  rather than in `sessionStorage`: the no-JS guarantee is a commitment, not
  a nice-to-have, and a role switcher that needed scripting would break it.
- **Preferences are stored per browser, in a cookie plus `localStorage` — never
  against the user account.** They are a display setting, not another field
  of personal data attached to a named school employee, and they must work
  before login, on the public pages, and with JavaScript switched off.
