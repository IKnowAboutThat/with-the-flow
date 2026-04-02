#!/usr/bin/env python3
"""
Update meat ingredients in meal-plan.html to show both cooked and raw weights.
Macros stay the same (same piece of meat, just different measurement state).
"""
import re
import math

# Cooked-to-raw conversion factors (raw = cooked * factor)
# Based on standard USDA cooking yield data
MEAT_CONVERSIONS = {
    "shrimp": 1.25,          # 80% yield when cooking raw shrimp
    "chicken breast": 1.33,  # 75% yield
    "ground turkey": 1.30,   # 77% yield
    "turkey breast": 1.30,   # 77% yield (roasted whole)
    "salmon": 1.20,          # 83% yield
    # Canned tuna: no conversion (already processed)
    # Turkey breast, sliced (deli): no conversion (already cooked/processed)
}

def get_meat_type(ingredient_text):
    """Determine meat type from ingredient text."""
    text = ingredient_text.lower()
    if "canned tuna" in text:
        return None  # No conversion for canned
    if "turkey breast, sliced" in text or "turkey breast, deli" in text:
        return None  # Deli meat, no meaningful raw conversion
    if "shrimp" in text:
        return "shrimp"
    if "chicken breast" in text:
        return "chicken breast"
    if "ground turkey" in text:
        return "ground turkey"
    if "turkey breast" in text:
        return "turkey breast"
    if "salmon" in text:
        return "salmon"
    return None

def raw_weight(cooked_g, meat_type):
    factor = MEAT_CONVERSIONS.get(meat_type, 1.0)
    return round(cooked_g * factor)

def update_meal_plan():
    with open("meal-plan.html", "r") as f:
        html = f.read()

    # Pattern matches lines like:
    # <span>Shrimp, cooked — <span class="ingredient-amount">180g</span></span>
    # <span>Chicken breast — <span class="ingredient-amount">95g</span></span>
    pattern = re.compile(
        r'(<span>)((?:Shrimp|Chicken breast|Ground turkey|Turkey breast|Salmon fillet|Canned tuna)[^<]*)'
        r'( — <span class="ingredient-amount">)(\d+)(g</span></span>)'
    )

    def replace_meat(match):
        prefix = match.group(1)        # <span>
        name = match.group(2)          # e.g. "Shrimp, cooked"
        middle = match.group(3)        # — <span class="ingredient-amount">
        cooked_g = int(match.group(4)) # e.g. 180
        suffix = match.group(5)        # g</span></span>

        meat_type = get_meat_type(name)
        if meat_type is None:
            return match.group(0)  # No change for canned tuna, deli turkey

        raw_g = raw_weight(cooked_g, meat_type)

        # Clean up the name - remove ", cooked" since we're showing both
        clean_name = re.sub(r',?\s*cooked\s*', '', name).strip()
        if clean_name.endswith(','):
            clean_name = clean_name[:-1]

        # New format: "Chicken breast — 95g cooked / 127g raw"
        return f'{prefix}{clean_name}{middle}{cooked_g}g cooked / {raw_g}g raw</span></span>'

    updated = pattern.sub(replace_meat, html)

    # Count replacements
    original_matches = pattern.findall(html)
    meat_updates = sum(1 for m in original_matches if get_meat_type(m[1]) is not None)
    print(f"Updated {meat_updates} meat ingredient lines")
    print(f"Skipped {len(original_matches) - meat_updates} (canned tuna / deli turkey)")

    with open("meal-plan-v2.html", "w") as f:
        f.write(updated)

    print("Written to meal-plan-v2.html")

def update_grocery_list():
    with open("grocery-lists.html", "r") as f:
        html = f.read()

    # Grocery items look like:
    # <div class="grocery-item">Shrimp, peeled &amp; cooked (or raw) — ~1.75 lbs</div>
    # <div class="grocery-item">Chicken breast — ~1.5 lbs</div>
    # We need to convert these to raw weights

    # Map of grocery item patterns to conversion
    grocery_conversions = [
        # (pattern, meat_type, raw_label)
        (r'(Shrimp[^<]*?—\s*~?)(\d+\.?\d*)\s*(lbs?)', "shrimp", "raw"),
        (r'(Chicken breast[^<]*?—\s*~?)(\d+\.?\d*)\s*(lbs?)', "chicken breast", "raw"),
        (r'(Ground turkey[^<]*?—\s*~?)(\d+\.?\d*)\s*(lbs?)', "ground turkey", "raw"),
        (r'(Turkey breast(?:, deli-sliced)?[^<]*?—\s*~?)(\d+\.?\d*)\s*(lbs?)', None, None),
        (r'(Salmon fillet[^<]*?—\s*~?)(\d+\.?\d*)\s*(lbs?)', "salmon", "raw"),
    ]

    for pattern, meat_type, label in grocery_conversions:
        if meat_type is None:
            continue
        def make_replacer(mt):
            def replacer(m):
                prefix = m.group(1)
                weight = float(m.group(2))
                unit = m.group(3)
                factor = MEAT_CONVERSIONS[mt]
                raw = round(weight * factor, 2)
                return f'{prefix}{raw} {unit} raw'
            return replacer
        html = re.sub(pattern, make_replacer(meat_type), html)

    # Also handle "X cans" for tuna - leave as-is
    # Handle "X small (X oz)" for salmon
    salmon_oz_pattern = r'(Salmon fillet[^<]*?—\s*)(\d+)\s*(small\s*\([^)]+\))'
    def salmon_oz_replacer(m):
        prefix = m.group(1)
        count = m.group(2)
        desc = m.group(3)
        return f'{prefix}{count} {desc} — buy raw'
    html = re.sub(salmon_oz_pattern, salmon_oz_replacer, html)

    with open("grocery-lists-v2.html", "w") as f:
        f.write(html)

    print("Written to grocery-lists-v2.html")

if __name__ == "__main__":
    update_meal_plan()
    update_grocery_list()
