const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const MEAL_PLAN_HTML = path.join(ROOT, 'meal-plan-v2.html');
const GROCERY_HTML = path.join(ROOT, 'grocery-lists-v2.html');
const OUTPUT = path.join(ROOT, 'webapp', 'data.json');

// ── Helpers ──

function parseNumber(str) {
  const m = str.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseMacroString(str) {
  // e.g. "1495 cal · 146g protein · 36g fiber"
  const cal = parseNumber(str.match(/([\d.]+)\s*cal/)?.[0] || '0');
  const protein = parseNumber(str.match(/([\d.]+)g\s*protein/)?.[0] || '0');
  const fiber = parseNumber(str.match(/([\d.]+)g\s*fiber/)?.[0] || '0');
  return { calories: cal, protein, fiber };
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// ── Extract Days ──

function extractDays($) {
  const days = [];

  $('.day-overview').each((_, el) => {
    const $el = $(el);
    const dayNum = parseInt($el.find('.day-number').text().replace('Day', '').trim(), 10);
    const totalsText = cleanText($el.find('.day-totals').text());
    const totals = parseMacroString(totalsText);
    const phaseText = cleanText($el.find('.day-phase').text());
    const phase = phaseText.toLowerCase().includes('luteal') ? 'luteal' : 'standard';
    const adrenalNote = cleanText($el.find('.day-adrenal-note').text());

    days.push({ day: dayNum, phase, totals, meals: [], adrenalNote });
  });

  return days;
}

// ── Extract Meals ──

function extractMeals($, days) {
  const dayMap = {};
  for (const d of days) dayMap[d.day] = d;

  $('.meal-card').each((_, el) => {
    const $el = $(el);
    const labelText = cleanText($el.find('.meal-label').text());
    // "Day 1 · Meal 1" or "Day 1 · Snack"
    const labelMatch = labelText.match(/Day\s+(\d+)\s*[·]\s*(.*)/);
    if (!labelMatch) return;

    const dayNum = parseInt(labelMatch[1], 10);
    const mealLabel = labelMatch[2].trim(); // "Meal 1", "Meal 2", "Snack"
    const mealName = cleanText($el.find('.meal-name').text());

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

    // Ingredients
    const ingredients = [];
    $el.find('.ingredient').each((_, ing) => {
      const $ing = $(ing);
      // The ingredient span contains: "Name — <span class='ingredient-amount'>amount</span>"
      const spanEl = $ing.children('span').first();
      const fullText = cleanText(spanEl.text());
      const amountText = cleanText($ing.find('.ingredient-amount').text());
      const macrosText = cleanText($ing.find('.ingredient-macros').text());

      // Parse name: everything before the em dash
      let name = fullText;
      const dashIdx = fullText.indexOf('—');
      if (dashIdx !== -1) {
        name = fullText.substring(0, dashIdx).trim();
      }
      // Remove trailing dash or whitespace
      name = name.replace(/[\s—]+$/, '').trim();

      ingredients.push({
        name,
        amount: amountText,
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
    const $week = $el.find('.grocery-week');
    const title = cleanText($week.find('h2').text());
    if (!title) return;

    const weekMatch = title.match(/Week\s+(\d+)/);
    const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : lists.length + 1;
    const subtitle = cleanText($week.find('.grocery-week-subtitle').text());

    const categories = [];
    $el.find('.grocery-section').each((_, sec) => {
      const $sec = $(sec);
      const catName = cleanText($sec.find('.grocery-category').text());
      const items = [];
      $sec.find('.grocery-item').each((_, item) => {
        items.push({ text: cleanText($(item).text()) });
      });
      if (catName && items.length > 0) {
        categories.push({ name: catName, items });
      }
    });

    lists.push({ week: weekNum, title, subtitle, categories });
  });

  return lists;
}

// ── Extract Info Pages ──

function extractInfoPages($) {
  const info = {};

  // How to Use
  const $howToUse = $('#how-to-use');
  if ($howToUse.length) {
    info.howToUse = {
      eyebrow: cleanText($howToUse.find('.page-eyebrow').text()),
      title: cleanText($howToUse.find('h2').text()),
      intro: cleanText($howToUse.find('.intro-page-header p').text()),
      startingInfo: cleanText($howToUse.find('h3').first().next('p').text()),
      phases: [],
      callout: cleanText($howToUse.find('.callout-box p').text()),
    };
    $howToUse.find('.phase-block').each((_, pb) => {
      const $pb = $(pb);
      info.howToUse.phases.push({
        label: cleanText($pb.find('.phase-label').text()),
        title: cleanText($pb.find('.phase-title').text()),
        description: cleanText($pb.find('p').map((_, p) => $(p).text()).get().join(' ')),
        mealsTag: cleanText($pb.find('.phase-meals-tag').text()),
      });
    });
  }

  // Understanding Calories
  const $cal = $('#understanding-calories');
  if ($cal.length) {
    info.understandingCalories = {
      eyebrow: cleanText($cal.find('.page-eyebrow').text()),
      title: cleanText($cal.find('h2').text()),
      intro: cleanText($cal.find('.intro-page-header p').text()),
      sections: [],
      callout: cleanText($cal.find('.callout-box p').text()),
    };
    $cal.find('.info-row').each((_, row) => {
      const $row = $(row);
      info.understandingCalories.sections.push({
        heading: cleanText($row.find('h4').text()),
        text: cleanText($row.find('p').text()),
      });
    });
    // Add the TDEE paragraph content
    const tdeeParas = [];
    $cal.find('h3').each((_, h3) => {
      const $h3 = $(h3);
      tdeeParas.push(cleanText($h3.text()));
      $h3.nextUntil('div, h3').filter('p').each((_, p) => {
        tdeeParas.push(cleanText($(p).text()));
      });
    });
    info.understandingCalories.bodyText = tdeeParas.join('\n\n');
  }

  // Why Protein + Fiber
  const $pf = $('#why-protein-fiber');
  if ($pf.length) {
    info.whyProteinFiber = {
      eyebrow: cleanText($pf.find('.page-eyebrow').text()),
      title: cleanText($pf.find('h2').text()),
      intro: cleanText($pf.find('.intro-page-header p').text()),
      proteinBadge: cleanText($pf.find('.nutrient-badge--protein').text()),
      fiberBadge: cleanText($pf.find('.nutrient-badge--fiber').text()),
      proteinText: [],
      fiberReasons: [],
    };
    // Protein paragraphs (between protein badge and hr)
    $pf.find('.nutrient-header').first().nextUntil('hr').filter('p').each((_, p) => {
      info.whyProteinFiber.proteinText.push(cleanText($(p).text()));
    });
    // Fiber reasons
    $pf.find('.fiber-list li').each((_, li) => {
      const $li = $(li);
      info.whyProteinFiber.fiberReasons.push({
        heading: cleanText($li.find('h4').text()),
        text: cleanText($li.find('p').text()),
      });
    });
    // General fiber intro paragraph
    const fiberIntro = $pf.find('hr').nextAll('p').first();
    if (fiberIntro.length) {
      info.whyProteinFiber.fiberIntro = cleanText(fiberIntro.text());
    }
  }

  // Adrenal Cocktail
  const $ac = $('#adrenal-cocktail');
  if ($ac.length) {
    info.adrenalCocktail = {
      eyebrow: cleanText($ac.find('.page-eyebrow').text()),
      title: cleanText($ac.find('h2').text()),
      intro: cleanText($ac.find('.intro-page-header p').text()),
      sections: [],
      recipe: {
        label: cleanText($ac.find('.recipe-card-label').text()),
        title: cleanText($ac.find('.recipe-title').text()),
        ingredients: [],
        macrosNote: cleanText($ac.find('.recipe-macros-note').text()),
      },
      timing: [],
    };
    // Sections (What Is It, Why It Matters, When to Drink)
    $ac.find('h3').each((_, h3) => {
      const $h3 = $(h3);
      const heading = cleanText($h3.text());
      const paras = [];
      $h3.nextUntil('h3, div').filter('p').each((_, p) => {
        paras.push(cleanText($(p).text()));
      });
      info.adrenalCocktail.sections.push({ heading, text: paras.join(' ') });
    });
    // Recipe ingredients
    $ac.find('.recipe-ingredients li').each((_, li) => {
      info.adrenalCocktail.recipe.ingredients.push(cleanText($(li).text()));
    });
    // Timing pills
    $ac.find('.timing-pill').each((_, pill) => {
      info.adrenalCocktail.timing.push(cleanText($(pill).text()));
    });
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

    // Macro sum check: meal macros + 320 cal / 8g protein for adrenal cocktails should match day totals
    const mealCalSum = day.meals.reduce((s, m) => s + m.macros.calories, 0);
    const mealProteinSum = day.meals.reduce((s, m) => s + m.macros.protein, 0);
    const mealFiberSum = day.meals.reduce((s, m) => s + m.macros.fiber, 0);

    const expectedCal = mealCalSum + 320;
    const expectedProtein = mealProteinSum + 8;
    const expectedFiber = mealFiberSum; // adrenal cocktails have 0 fiber

    // Allow small rounding tolerance
    const tolerance = 2;
    if (Math.abs(expectedCal - day.totals.calories) > tolerance) {
      errors.push(`Day ${day.day}: cal mismatch — meals(${mealCalSum}) + 320 = ${expectedCal}, expected ${day.totals.calories}`);
    }
    if (Math.abs(expectedProtein - day.totals.protein) > tolerance) {
      errors.push(`Day ${day.day}: protein mismatch — meals(${mealProteinSum}) + 8 = ${expectedProtein}, expected ${day.totals.protein}`);
    }
    if (Math.abs(expectedFiber - day.totals.fiber) > tolerance) {
      errors.push(`Day ${day.day}: fiber mismatch — meals(${mealFiberSum}) = ${expectedFiber}, expected ${day.totals.fiber}`);
    }

    // Adrenal note should exist
    if (!day.adrenalNote) {
      errors.push(`Day ${day.day}: missing adrenal note`);
    }
  }

  // 4 grocery weeks
  if (data.groceryLists.length !== 4) {
    errors.push(`Expected 4 grocery weeks, got ${data.groceryLists.length}`);
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
  if (!data.info.understandingCalories) errors.push('Missing info: understandingCalories');
  if (!data.info.whyProteinFiber) errors.push('Missing info: whyProteinFiber');
  if (!data.info.adrenalCocktail) errors.push('Missing info: adrenalCocktail');

  return errors;
}

// ── Main ──

function main() {
  console.log('Loading HTML files...');
  const mealPlanHtml = fs.readFileSync(MEAL_PLAN_HTML, 'utf-8');
  const groceryHtml = fs.readFileSync(GROCERY_HTML, 'utf-8');

  console.log('Parsing meal plan...');
  const $mp = cheerio.load(mealPlanHtml);

  console.log('Extracting days...');
  const days = extractDays($mp);
  console.log(`  Found ${days.length} days`);

  console.log('Extracting meals...');
  extractMeals($mp, days);
  for (const d of days) {
    console.log(`  Day ${d.day} (${d.phase}): ${d.meals.length} meals`);
  }

  console.log('Extracting grocery lists from meal plan HTML...');
  const groceryFromMealPlan = extractGroceryLists($mp);
  console.log(`  Found ${groceryFromMealPlan.length} weeks from meal plan`);

  console.log('Parsing grocery HTML...');
  const $gr = cheerio.load(groceryHtml);
  const groceryFromGroceryFile = extractGroceryLists($gr);
  console.log(`  Found ${groceryFromGroceryFile.length} weeks from grocery file`);

  // Use the grocery file as primary source (it's the dedicated file)
  const groceryLists = groceryFromGroceryFile.length >= 4
    ? groceryFromGroceryFile
    : groceryFromMealPlan;
  console.log(`  Using ${groceryLists === groceryFromGroceryFile ? 'grocery file' : 'meal plan'} as source`);

  console.log('Extracting info pages...');
  const info = extractInfoPages($mp);
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

  console.log(`\nWriting ${OUTPUT}...`);
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Done!');

  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Days: ${data.days.length}`);
  console.log(`Total meals: ${data.days.reduce((s, d) => s + d.meals.length, 0)}`);
  console.log(`Grocery weeks: ${data.groceryLists.length}`);
  console.log(`Info sections: ${Object.keys(data.info).length}`);
  console.log(`Validation errors: ${errors.length}`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
