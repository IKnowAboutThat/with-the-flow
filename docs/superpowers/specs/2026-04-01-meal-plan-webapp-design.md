# With the Flow — Web App Design Spec

## Purpose

A personal mobile-first web app for navigating the 30-day meal plan. The PDF is the product for sale; this app is Whitney's own reference tool for daily cooking and grocery shopping. Hosted on GitHub Pages.

## Architecture

Static single-page app — pure HTML, CSS, and vanilla JavaScript. No framework, no build step.

**Files:**
- `index.html` — app shell with tab bar, header, view containers
- `app.css` — mobile-first CSS using the existing terracotta (#A0725C) / sage (#7A8B6F) palette
- `app.js` — view switching, day navigation, recipe expand/collapse, grocery checkboxes, session restore
- `data.json` — all 30 days of meals, ingredients, instructions, macros, grocery lists, and info content

The existing `meal-plan-v2.html`, `grocery-lists-v2.html`, PDF generation scripts, and `styles.css` (print version) remain untouched. The web app is a separate set of files in the same repo.

## Views & Navigation

### Bottom Tab Bar (fixed, always visible)
1. **Today** — the primary day view
2. **All Days** — grid of all 30 days for quick jumping
3. **Grocery** — weekly shopping lists with checkboxes
4. **Info** — intro content from the PDF

### Today (Day View)
- Horizontal scrollable day chips at top (days 1–30)
  - Terracotta for standard phase (days 1–20), sage for luteal phase (days 21–30)
  - Active chip is filled with the phase color
- Daily macro summary bar: calories, protein, fiber
- Meal cards showing:
  - Meal label (Meal 1, Meal 2, Snack)
  - Meal name
  - Macro pills (cal, protein, fiber)
  - "View Recipe" expand button
- Expanded recipe (inline, no page navigation):
  - Ingredient list with amounts
  - Cooking instructions
- Snack card has a sage left border to visually distinguish it
- Adrenal cocktail note at bottom of each day

### All Days View
- Grid of day cards showing day number, phase indicator, and meal names
- Tapping a card switches to that day in the Today view

### Grocery View
- Week 1/2/3/4 tabs across the top
- Items grouped by category (Protein, Produce, Grains & Legumes, etc.)
- Tap-to-check checkboxes
- Checkbox state persists via localStorage

### Info View
- How to Use This Guide (phase explanations)
- Understanding Your Calories (deficit/TDEE)
- Why High Protein + High Fiber
- Your Adrenal Cocktail (recipe)

## Session Restore

When the app is closed and reopened, it restores the full state:
- Which tab was active
- Which day was selected
- Scroll position within the current view
- Which recipes were expanded
- Grocery checkbox states

All stored in localStorage. On load, the app reads this state and restores the exact view the user left.

## Data

### data.json structure
```json
{
  "days": [
    {
      "day": 1,
      "phase": "standard",
      "totals": { "calories": 1495, "protein": 146, "fiber": 36 },
      "meals": [
        {
          "label": "Meal 1",
          "name": "Miso-Ginger Shrimp + Lentil Bowl",
          "macros": { "calories": 496, "protein": 62, "fiber": 16 },
          "ingredients": [
            { "name": "Shrimp", "amount": "180g cooked / 225g raw", "macros": "178 cal · 37.8g P · 0g Fi" }
          ],
          "instructions": "Whisk together miso paste..."
        }
      ],
      "adrenalNote": "Includes 2 adrenal cocktails (320 cal / 8g protein)"
    }
  ],
  "groceryLists": [
    {
      "week": 1,
      "categories": [
        {
          "name": "Protein",
          "items": [
            { "name": "Shrimp", "amount": "900g" }
          ]
        }
      ]
    }
  ],
  "info": {
    "howToUse": "...",
    "understandingCalories": "...",
    "whyHighProteinFiber": "...",
    "adrenalCocktail": "..."
  }
}
```

### Data extraction
A Node.js script (`extract-data.js`) parses `meal-plan-v2.html` and `grocery-lists-v2.html` to produce `data.json`. This allows regeneration if the meal plan content is updated.

## Design Tokens (from existing PDF design system)
- Background: #FAF7F2
- Terracotta: #A0725C (standard phase)
- Sage: #7A8B6F (luteal phase)
- Text body: #3A2F28
- Text secondary: #5a4d42
- Text muted: #b8a090
- Border: #ede4d8
- Card radius: 14px
- Font serif: Georgia
- Font sans: Helvetica Neue, Arial

## Hosting
- GitHub Pages from the repo's main branch (or a `/docs` folder or `gh-pages` branch, whichever is simplest)
- No backend, no build step — just static files
