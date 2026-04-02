const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_HTML = '/Users/whitneyhaskin/Documents/1500 Calorie Meal Plan/plans/30-day-meal-plan-with-breakfasts/with-the-flow-breakfast-guide.html';
const OUTPUT = path.join(ROOT, 'docs', 'data.json');

// ── Helpers ──

function parseNumber(str) {
  const m = str.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseMacroString(str) {
  // e.g. "1495 cal · 134g protein · 30g fiber"
  const cal = parseNumber(str.match(/([\d.]+)\s*cal/)?.[0] || '0');
  const protein = parseNumber(str.match(/([\d.]+)g\s*prot/i)?.[0] || str.match(/([\d.]+)g\s*P/)?.[0] || '0');
  const fiber = parseNumber(str.match(/([\d.]+)g\s*fib/i)?.[0] || str.match(/([\d.]+)g\s*Fi/)?.[0] || '0');
  return { calories: cal, protein, fiber };
}

function parseMealListMacros(str) {
  // e.g. "560 cal · 40g P · 11g Fi"
  const cal = parseNumber(str.match(/([\d.]+)\s*cal/)?.[0] || '0');
  const protein = parseNumber(str.match(/([\d.]+)g\s*P\b/)?.[0] || '0');
  const fiber = parseNumber(str.match(/([\d.]+)g\s*Fi/)?.[0] || '0');
  return { calories: cal, protein, fiber };
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// ── Extract Days ──

function extractDays($) {
  const days = [];

  $('.day-summary').each((_, el) => {
    const $el = $(el);
    const dayNum = parseInt($el.find('.day-number').text().replace('Day', '').trim(), 10);
    const totalsText = cleanText($el.find('.day-macros').text());
    const totals = parseMacroString(totalsText);
    const phaseText = cleanText($el.find('.day-phase').text());
    const phase = phaseText.toLowerCase().includes('luteal') ? 'luteal' : 'standard';
    const adrenalNote = cleanText($el.find('.fixed-note').text());

    days.push({ day: dayNum, phase, totals, meals: [], adrenalNote });
  });

  return days;
}

// ── Extract Meals ──

function extractMeals($, days) {
  const dayMap = {};
  for (const d of days) dayMap[d.day] = d;

  $('.recipe-card').each((_, el) => {
    const $el = $(el);
    const labelText = cleanText($el.find('.recipe-label').text());
    // "DAY 1 · BREAKFAST"
    const labelMatch = labelText.match(/DAY\s+(\d+)\s*[·]\s*(.*)/i);
    if (!labelMatch) return;

    const dayNum = parseInt(labelMatch[1], 10);
    const mealLabel = labelMatch[2].trim(); // "BREAKFAST", "DINNER", "TREAT", "LUNCH"
    const mealName = cleanText($el.find('.recipe-title').text());

    // Macros from pills
    const pillTexts = [];
    $el.find('.macro-pill').each((_, p) => pillTexts.push(cleanText($(p).text())));
    const macros = {
      calories: 0,
      protein: 0,
      fiber: 0,
    };
    for (const pt of pillTexts) {
      if (pt.includes('cal')) macros.calories = parseNumber(pt);
      else if (pt.includes('protein')) macros.protein = parseNumber(pt);
      else if (pt.includes('fiber')) macros.fiber = parseNumber(pt);
    }

    // Ingredients — skip .ingredient.total rows
    const ingredients = [];
    $el.find('.ingredient').each((_, ing) => {
      const $ing = $(ing);
      if ($ing.hasClass('total')) return; // skip the sum row

      const ingMainText = cleanText($ing.find('.ing-main').text());
      const ingMainHtml = $ing.find('.ing-main').html() || '';
      const macrosText = cleanText($ing.find('.ing-macros').text());

      // Parse name and amount from ing-main
      // Format: "GF oats (certified) — 40g" where amount is in <strong>
      let name = ingMainText;
      let amount = '';

      // Extract amount from <strong> tag
      const $strong = $ing.find('.ing-main strong');
      if ($strong.length) {
        amount = cleanText($strong.text());
      }

      // Name is everything before " — "
      const dashIdx = ingMainText.indexOf('—');
      if (dashIdx !== -1) {
        name = ingMainText.substring(0, dashIdx).trim();
      } else {
        // If no dash, remove the amount from the name
        name = ingMainText.replace(amount, '').trim();
      }
      // Clean trailing whitespace/dashes
      name = name.replace(/[\s—]+$/, '').trim();

      ingredients.push({
        name,
        amount,
        macros: macrosText,
      });
    });

    // Instructions
    const instructions = cleanText($el.find('.instructions-text').text());

    const meal = {
      label: mealLabel,
      name: mealName,
      macros,
      ingredients,
      instructions,
    };

    if (dayMap[dayNum]) {
      dayMap[dayNum].meals.push(meal);
    }
  });
}

// ── Extract Grocery Lists ──

function extractGroceryLists($) {
  const lists = [];

  $('.grocery-page').each((_, el) => {
    const $el = $(el);
    const $headerBar = $el.find('.grocery-header-bar');
    const title = cleanText($headerBar.find('h2').text());
    if (!title) return;

    const weekMatch = title.match(/Week\s+(\d+)/);
    const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : lists.length + 1;
    const subtitle = cleanText($headerBar.find('p').text());

    // Skip the supply-estimates page (it has a table, not grocery items)
    if ($el.hasClass('supply-estimates-page')) {
      // Store supply estimates separately if needed, but skip as grocery list
      return;
    }

    const categories = [];

    // Daily note (fixed items note at the top)
    const dailyNote = cleanText($el.find('.daily-note').text());

    // Walk direct children to build categories.
    // h3.section-label may be followed by:
    //   (a) a .grocery-grid directly (simple category)
    //   (b) h4.sub-label + .grocery-grid pairs (pantry subcategories)
    //   (c) .store-block elements (specialty stores)
    // We track a "pending h3 name" so that if the next sibling is NOT a
    // grocery-grid, the sub-labels/store-blocks inherit the parent name.
    const children = $el.children().toArray();

    let currentCategory = null;
    let pendingH3 = null; // h3 name waiting for a grid or sub-items

    for (const child of children) {
      const $child = $(child);
      const tagName = child.tagName?.toLowerCase();

      if ($child.hasClass('section-label') && tagName === 'h3') {
        // New top-level category heading
        const catName = cleanText($child.text());
        pendingH3 = catName;
        currentCategory = null; // reset until we see items
      } else if ($child.hasClass('grocery-grid')) {
        // Items — attach to currentCategory (sub-label) or create from pendingH3
        if (!currentCategory && pendingH3) {
          currentCategory = { name: pendingH3, items: [] };
          categories.push(currentCategory);
          pendingH3 = null;
        }
        if (currentCategory) {
          $child.find('.grocery-item').each((_, item) => {
            const text = cleanText($(item).find('span').text());
            if (text) currentCategory.items.push({ text });
          });
        }
      } else if ($child.hasClass('sub-label') && tagName === 'h4') {
        // Subcategory under a parent h3 (e.g. "Baking & Breakfast" under "Pantry Staples")
        const subName = cleanText($child.text());
        currentCategory = { name: subName, items: [] };
        categories.push(currentCategory);
        pendingH3 = null; // consumed by sub-labels
      } else if ($child.hasClass('store-block')) {
        // Specialty store section
        const storeName = cleanText($child.find('.store-heading').text());
        const storeCategory = { name: storeName, items: [] };
        $child.find('.grocery-item').each((_, item) => {
          const text = cleanText($(item).find('span').text());
          if (text) storeCategory.items.push({ text });
        });
        if (storeCategory.items.length > 0) {
          categories.push(storeCategory);
        }
        pendingH3 = null; // consumed by store-blocks
      } else if ($child.hasClass('restock-note')) {
        // Restock note — add as a special category
        const restockText = cleanText($child.text());
        if (restockText) {
          categories.push({ name: 'Restock', items: [{ text: restockText }] });
        }
      }
    }

    const entry = { week: weekNum, title, subtitle, categories };
    if (dailyNote) entry.dailyNote = dailyNote;
    lists.push(entry);
  });

  return lists;
}

// ── Extract Info Pages ──

function extractInfoPages($) {
  const info = {};

  // How to Use Guide
  const $howTo = $('#how-to-guide');
  if ($howTo.length) {
    const phases = [];
    $howTo.find('.phase-info-card').each((_, card) => {
      const $card = $(card);
      phases.push({
        label: cleanText($card.find('.phase-info-label').text()),
        title: cleanText($card.find('h3').text()),
        description: $card.find('p').not('.phase-info-label, .phase-meta').map((_, p) => cleanText($(p).text())).get().join(' '),
        meta: cleanText($card.find('.phase-meta').text()),
      });
    });

    info.howToUse = {
      eyebrow: cleanText($howTo.find('.section-label').first().text()),
      title: cleanText($howTo.find('h1').text()),
      intro: cleanText($howTo.children('p').first().text()),
      startingInfo: cleanText($howTo.find('h2').first().text()),
      startingDescription: cleanText($howTo.find('h2').first().next('p').text()),
      phases,
      callout: cleanText($howTo.find('.callout-box p').text()),
    };
  }

  // Adrenal Cocktail info page
  const $ac = $('#adrenal-cocktail');
  if ($ac.length) {
    const sections = [];
    $ac.find('h2').each((_, h2) => {
      const $h2 = $(h2);
      const heading = cleanText($h2.text());
      const nextP = $h2.next('p');
      const text = nextP.length ? cleanText(nextP.text()) : '';
      sections.push({ heading, text });
    });

    const timing = [];
    $ac.find('.timing-pill').each((_, pill) => {
      timing.push(cleanText($(pill).text()));
    });

    info.adrenalCocktail = {
      eyebrow: cleanText($ac.find('.section-label').first().text()),
      title: cleanText($ac.find('h1').text()),
      intro: cleanText($ac.children('p').first().text()),
      sections,
      timing,
    };
  }

  // Adrenal Cocktail Recipe (separate page)
  const $acRecipe = $('.adrenal-recipe-page');
  if ($acRecipe.length) {
    const ingredients = [];
    $acRecipe.find('.ref-ingredient').each((_, ing) => {
      ingredients.push(cleanText($(ing).text()));
    });

    info.adrenalCocktailRecipe = {
      eyebrow: cleanText($acRecipe.find('.section-label').first().text()),
      title: cleanText($acRecipe.find('h1').text()),
      recipeTitle: cleanText($acRecipe.find('.ref-recipe-header h2').text()),
      recipeSubtitle: cleanText($acRecipe.find('.ref-recipe-header .section-label').text()),
      ingredients,
      totals: cleanText($acRecipe.find('.ref-total-main').text()),
      note: cleanText($acRecipe.find('.ref-total-note').text()),
    };
  }

  // Supply Estimates
  const $supplies = $('.supply-estimates-page');
  if ($supplies.length) {
    const items = [];
    $supplies.find('.estimates-table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 4) {
        items.push({
          item: cleanText($(cells[0]).text()),
          weeklyUse: cleanText($(cells[1]).text()),
          thirtyDayTotal: cleanText($(cells[2]).text()),
          buy: cleanText($(cells[3]).text()),
        });
      }
    });
    info.supplyEstimates = {
      title: cleanText($supplies.find('.grocery-header-bar h2').text()),
      subtitle: cleanText($supplies.find('.grocery-header-bar p').text()),
      items,
    };
  }

  // Phase Dividers
  const phaseDividers = [];
  $('.phase-divider').each((_, el) => {
    const $el = $(el);
    phaseDividers.push({
      label: cleanText($el.find('.phase-label-small').text()),
      title: cleanText($el.find('h1').text()),
      description: cleanText($el.find('.phase-divider-inner > p').first().text()),
      detail: cleanText($el.find('.phase-detail').text()),
    });
  });
  if (phaseDividers.length > 0) {
    info.phaseDividers = phaseDividers;
  }

  // What's Next page
  const $next = $('#whats-next');
  if ($next.length) {
    const options = [];
    $next.find('.next-step-card').each((_, card) => {
      const $card = $(card);
      options.push({
        title: cleanText($card.find('.next-step-card-title').text()),
        description: cleanText($card.find('p').not('.next-step-card-title').text()),
      });
    });

    info.whatsNext = {
      eyebrow: cleanText($next.find('.section-label').first().text()),
      title: cleanText($next.find('h1').text()),
      intro: cleanText($next.find('.intro-text').text()),
      kicker: cleanText($next.find('.next-steps-kicker').text()),
      options,
      closingNote: cleanText($next.find('.closing-note').text()),
    };
  }

  return info;
}

// ── Validation ──

function validate(data) {
  const errors = [];

  // 30 days
  if (data.days.length !== 30) {
    errors.push(`Expected 30 days, got ${data.days.length}`);
  }

  for (const day of data.days) {
    const expectedMeals = day.phase === 'standard' ? 3 : 4;
    if (day.meals.length !== expectedMeals) {
      errors.push(`Day ${day.day}: expected ${expectedMeals} meals (${day.phase}), got ${day.meals.length}`);
    }

    // Check every meal has ingredients and instructions
    for (const meal of day.meals) {
      if (meal.ingredients.length === 0) {
        errors.push(`Day ${day.day} ${meal.label}: no ingredients`);
      }
      if (!meal.instructions) {
        errors.push(`Day ${day.day} ${meal.label}: no instructions`);
      }
    }

    // Macro sum check: meal macros + 248 cal / 28g protein for adrenal cocktails + bone broth
    const mealCalSum = day.meals.reduce((s, m) => s + m.macros.calories, 0);
    const mealProteinSum = day.meals.reduce((s, m) => s + m.macros.protein, 0);
    const mealFiberSum = day.meals.reduce((s, m) => s + m.macros.fiber, 0);

    const expectedCal = mealCalSum + 248;
    const expectedProtein = mealProteinSum + 28;
    const expectedFiber = mealFiberSum; // adrenal cocktails + bone broth have ~0 fiber

    // Allow ±10 rounding tolerance (source HTML has rounding in day totals)
    const tolerance = 10;
    if (Math.abs(expectedCal - day.totals.calories) > tolerance) {
      errors.push(`Day ${day.day}: cal mismatch — meals(${mealCalSum}) + 248 = ${expectedCal}, expected ${day.totals.calories}`);
    }
    if (Math.abs(expectedProtein - day.totals.protein) > tolerance) {
      errors.push(`Day ${day.day}: protein mismatch — meals(${mealProteinSum}) + 28 = ${expectedProtein}, expected ${day.totals.protein}`);
    }
    if (Math.abs(expectedFiber - day.totals.fiber) > tolerance) {
      errors.push(`Day ${day.day}: fiber mismatch — meals(${mealFiberSum}) = ${expectedFiber}, expected ${day.totals.fiber}`);
    }

    // Adrenal note should exist
    if (!day.adrenalNote) {
      errors.push(`Day ${day.day}: missing adrenal note`);
    }
  }

  // Grocery lists — expect at least 4 weekly lists (may have 5 if week 5 exists)
  if (data.groceryLists.length < 4) {
    errors.push(`Expected at least 4 grocery weeks, got ${data.groceryLists.length}`);
  }
  for (const gl of data.groceryLists) {
    if (gl.categories.length === 0) {
      errors.push(`Grocery week ${gl.week}: no categories`);
    }
    for (const cat of gl.categories) {
      if (cat.items.length === 0) {
        errors.push(`Grocery week ${gl.week}, category "${cat.name}": no items`);
      }
    }
  }

  // Info pages
  if (!data.info.howToUse) errors.push('Missing info: howToUse');
  if (!data.info.adrenalCocktail) errors.push('Missing info: adrenalCocktail');
  if (!data.info.adrenalCocktailRecipe) errors.push('Missing info: adrenalCocktailRecipe');
  if (!data.info.whatsNext) errors.push('Missing info: whatsNext');

  return errors;
}

// ── Main ──

function main() {
  console.log('Loading HTML file...');
  const html = fs.readFileSync(SOURCE_HTML, 'utf-8');

  console.log('Parsing HTML...');
  const $ = cheerio.load(html);

  console.log('Extracting days...');
  const days = extractDays($);
  console.log(`  Found ${days.length} days`);

  console.log('Extracting meals...');
  extractMeals($, days);
  for (const d of days) {
    console.log(`  Day ${d.day} (${d.phase}): ${d.meals.length} meals`);
  }

  console.log('Extracting grocery lists...');
  const groceryLists = extractGroceryLists($);
  console.log(`  Found ${groceryLists.length} grocery lists`);

  console.log('Extracting info pages...');
  const info = extractInfoPages($);
  console.log(`  Found ${Object.keys(info).length} info sections`);

  const data = { days, groceryLists, info };

  console.log('\nValidating...');
  const errors = validate(data);
  if (errors.length > 0) {
    console.log(`\n${errors.length} VALIDATION ERROR(S):`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  } else {
    console.log('  All validations passed!');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`\nWriting ${OUTPUT}...`);
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Done!');

  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Days: ${data.days.length}`);
  console.log(`Total meals: ${data.days.reduce((s, d) => s + d.meals.length, 0)}`);
  console.log(`Grocery lists: ${data.groceryLists.length}`);
  console.log(`Info sections: ${Object.keys(data.info).length}`);
  console.log(`Validation errors: ${errors.length}`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
