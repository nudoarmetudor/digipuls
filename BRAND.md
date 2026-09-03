# DigiPuls — brand identity

DigiPuls belongs to the DigiProf / Clasa Viitorului family, and this document
defines how it looks and sounds within it. It is a working reference for
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
  hyphen. In colour contexts `Digi` is deep cyan and `Puls` is purple; in the
  masthead `Puls` uses `--purple-300` so it holds against the dark bar.
- **Don't** recolour the arcs individually, close the ring, remove the pulse,
  add a container shape, stretch, rotate, or set the wordmark in another face.
- The standalone SVGs set the wordmark in the brand type stack rather than as
  outlines, so they stay crisp and themeable in-product. **Convert text to
  outlines before sending any of these files to a printer.**

---

## 3. Colour

Two hues. Cyan is the product; purple is the accent and the emphasis. Nothing
else is introduced anywhere — with one deliberate exception, §3.3.

### 3.1 The ramps

| Cyan | | Purple | |
|---|---|---|---|
| `--cyan-50` | `#f0f7f9` | `--purple-50` | `#f6f1f9` |
| `--cyan-100` | `#dbe9ec` | `--purple-100` | `#ece1f2` |
| `--cyan-200` | `#b8d4da` | `--purple-200` | `#d8c2e3` |
| `--cyan-300` | `#8dbac3` | `--purple-300` | `#c9a6db` |
| `--cyan-400` | `#5b9daa` | `--purple-400` | `#9457b4` |
| **`--cyan-500`** | **`#307e8c`** — brand primary | **`--purple-500`** | **`#622582`** — brand accent |
| `--cyan-600` | `#286872` | `--purple-600` | `#55206f` |
| `--cyan-700` | `#1f4b53` | `--purple-700` | `#4a1c63` |
| `--cyan-800` | `#16363c` | `--purple-800` | `#35134a` |
| `--cyan-900` | `#0d2125` | `--purple-900` | `#210b2f` |

Plus a neutral ramp (`--neutral-0` … `--neutral-900`) for surfaces, borders
and body text.

### 3.2 Never use a raw shade in a component

Components reference **semantic tokens** — `--surface`, `--text`, `--border`,
`--primary`, `--accent`, `--topbar-bg`, `--ok-text`, `--bad-bg`, and so on.
The raw ramp exists only to define those tokens.

This is what makes four viewer preferences possible at all: light/dark, normal/
high contrast, four text sizes and reduced motion are implemented by
re-pointing tokens in one place. A component that hardcodes `#307e8c` opts out
of dark mode and high contrast silently — it will simply be wrong for those
viewers and look fine to whoever wrote it.

### 3.3 The status colours

Grey / blue / red / green were established for the assessment step-navigator
before this identity work and are **kept**, because they encode a check state
with a conventional meaning that a two-hue palette cannot carry honestly:

| Token | Meaning |
|---|---|
| `--status-grey` | not started |
| `--status-blue` (= brand cyan) | in progress |
| `--status-red` | needs attention — evidence missing |
| `--status-green` | complete |

These are the only colours outside the two brand hues, and they are only ever
used for state. **Colour never carries state on its own** — every status dot
is accompanied by text (visible or, for the dot itself, visually hidden), and
every pass/fail badge spells out `OK` / `GAP` / `COMPLIANT`.

### 3.4 Maturity levels

Levels 1–5 read as one progression through both ramps: pale cyan → cyan →
deep cyan → purple → deep purple. Level 0 uses the "bad" pair, because level 0
on D1/D2 means failing Order 675's mandatory minimum — a real failure, not
just a low score. The level number is always written out (`Level 3`), never
conveyed by the swatch alone.

### 3.5 The maturity wheel

The wheel's four sectors use `--wheel-a` … `--wheel-d`, which are re-pointed
per theme. Left at their light-theme values, the wheel becomes four dark
smudges on a dark background — the one place where a "just use the brand
colours" instinct produces something unreadable.

---

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
- **Preferences are stored per browser, in a cookie plus `localStorage` — never
  against the user account.** They are a display setting, not another field
  of personal data attached to a named school employee, and they must work
  before login, on the public pages, and with JavaScript switched off.
