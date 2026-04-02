(function () {
  'use strict';

  // ===== State =====
  const STORAGE_KEY = 'wtf-app-state';
  let data = null;

  let state = {
    activeView: 'today',
    currentDay: 1,
    activeWeek: 1,
    expandedMeals: [],
    groceryChecked: {},
    scrollPositions: {},
  };

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {};
  function cacheDom() {
    els.header = $('#app-header');
    els.headerTitle = $('#header-title');
    els.headerSubtitle = $('#header-subtitle');
    els.viewToday = $('#view-today');
    els.viewAllDays = $('#view-all-days');
    els.viewGrocery = $('#view-grocery');
    els.viewInfo = $('#view-info');
    els.dayPicker = $('#day-picker');
    els.dayContent = $('#day-content');
    els.allDaysGrid = $('#all-days-grid');
    els.weekTabs = $('#week-tabs');
    els.groceryContent = $('#grocery-content');
    els.infoContent = $('#info-content');
    els.tabs = $$('.tab[data-view]');
  }

  // ===== Utilities =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* quota exceeded, ignore */ }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(state, parsed);
      }
    } catch (e) { /* corrupt data, ignore */ }
  }

  function getViewEl(viewName) {
    const map = {
      'today': els.viewToday,
      'all-days': els.viewAllDays,
      'grocery': els.viewGrocery,
      'info': els.viewInfo,
    };
    return map[viewName];
  }

  function getScrollContainer(viewName) {
    const viewEl = getViewEl(viewName);
    if (!viewEl) return null;
    return viewEl.querySelector('.view-content') || viewEl;
  }

  function isLuteal(dayNum) {
    return dayNum >= 21;
  }

  function getPhaseLabel(dayNum) {
    return isLuteal(dayNum) ? 'Luteal Phase' : 'Standard Phase';
  }

  function getPhaseSubtitle(dayNum) {
    return isLuteal(dayNum)
      ? 'Luteal Phase \u00b7 Days 21\u201330'
      : 'Standard Phase \u00b7 Days 1\u201320';
  }

  // ===== Tab Switching =====
  function bindTabs() {
    els.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var view = tab.getAttribute('data-view');
        switchView(view);
      });
    });
  }

  function switchView(viewName) {
    // Save scroll position of current view
    var currentScroll = getScrollContainer(state.activeView);
    if (currentScroll) {
      state.scrollPositions[state.activeView] = currentScroll.scrollTop;
    }

    state.activeView = viewName;

    // Hide all views, show selected
    [els.viewToday, els.viewAllDays, els.viewGrocery, els.viewInfo].forEach(function (v) {
      v.classList.remove('active');
    });
    var target = getViewEl(viewName);
    if (target) target.classList.add('active');

    // Update tab active state
    els.tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });

    // Update header
    updateHeader(viewName);

    // Restore scroll position
    var sc = getScrollContainer(viewName);
    if (sc && state.scrollPositions[viewName] != null) {
      sc.scrollTop = state.scrollPositions[viewName];
    }

    saveState();
  }

  function updateHeader(viewName) {
    switch (viewName) {
      case 'today':
        els.headerTitle.textContent = 'Day ' + state.currentDay;
        els.headerSubtitle.textContent = getPhaseSubtitle(state.currentDay);
        break;
      case 'all-days':
        els.headerTitle.textContent = 'All Days';
        els.headerSubtitle.textContent = '30-day overview';
        break;
      case 'grocery':
        els.headerTitle.textContent = 'Grocery Lists';
        els.headerSubtitle.textContent = 'Shop by week';
        break;
      case 'info':
        els.headerTitle.textContent = 'Guide';
        els.headerSubtitle.textContent = 'How it works';
        break;
    }
  }

  // ===== Day Picker =====
  function renderDayPicker() {
    var html = '';
    for (var i = 1; i <= 30; i++) {
      var classes = 'day-chip';
      if (isLuteal(i)) classes += ' luteal';
      if (i === state.currentDay) classes += ' active';
      html += '<button class="' + classes + '" data-day="' + i + '">'
        + '<small>D</small>'
        + '<span>' + i + '</span>'
        + '</button>';
    }
    els.dayPicker.innerHTML = html;

    els.dayPicker.querySelectorAll('.day-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        selectDay(parseInt(chip.getAttribute('data-day'), 10));
      });
    });

    scrollActiveChipIntoView();
  }

  function scrollActiveChipIntoView() {
    var active = els.dayPicker.querySelector('.day-chip.active');
    if (active) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  function selectDay(dayNum) {
    state.currentDay = dayNum;

    // Update chip active states
    els.dayPicker.querySelectorAll('.day-chip').forEach(function (chip) {
      var d = parseInt(chip.getAttribute('data-day'), 10);
      chip.classList.toggle('active', d === dayNum);
    });

    scrollActiveChipIntoView();
    renderDay();
    updateHeader('today');
    saveState();
  }

  // ===== Day View =====
  function renderDay() {
    var dayData = data.days[state.currentDay - 1];
    if (!dayData) return;

    var html = '';

    // Day macros summary bar
    html += '<div class="day-macros">';
    html += macroItem(dayData.totals.calories, 'Calories');
    html += macroItem(dayData.totals.protein + 'g', 'Protein');
    html += macroItem(dayData.totals.fiber + 'g', 'Fiber');
    html += '</div>';

    // Meal cards
    dayData.meals.forEach(function (meal, mealIdx) {
      var mealKey = state.currentDay + '-' + mealIdx;
      var isExpanded = state.expandedMeals.indexOf(mealKey) !== -1;
      var isSnack = meal.label.toLowerCase() === 'snack';
      var cardClass = 'meal-card' + (isSnack ? ' snack' : '');

      html += '<div class="' + cardClass + '">';
      html += '<div class="meal-tag">' + escapeHtml(meal.label) + '</div>';
      html += '<div class="meal-name">' + escapeHtml(meal.name) + '</div>';
      html += '<div class="macro-pills meal-macros">';
      html += '<span class="macro-pill">' + meal.macros.calories + ' cal</span>';
      html += '<span class="macro-pill">' + meal.macros.protein + 'g protein</span>';
      html += '<span class="macro-pill">' + meal.macros.fiber + 'g fiber</span>';
      html += '</div>';

      // Expand button
      html += '<button class="expand-btn' + (isExpanded ? ' open' : '') + '" data-meal-key="' + mealKey + '">';
      html += chevronSvg();
      html += '<span>' + (isExpanded ? 'Hide Recipe' : 'View Recipe') + '</span>';
      html += '</button>';

      // Recipe expanded
      html += '<div class="recipe-expanded' + (isExpanded ? ' open' : '') + '">';

      // Ingredients
      html += '<h4 class="recipe-section-label">Ingredients</h4>';
      meal.ingredients.forEach(function (ing) {
        html += '<div class="ingredient-row">';
        html += '<span class="ingredient-name">' + escapeHtml(ing.name) + '</span>';
        html += '<span class="ingredient-amount">' + escapeHtml(ing.amount) + '</span>';
        html += '</div>';
        if (ing.macros) {
          html += '<div class="ingredient-macros-text" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + escapeHtml(ing.macros) + '</div>';
        }
      });

      // Instructions
      html += '<div class="recipe-instructions">';
      html += '<h4 class="recipe-section-label">How to Make It</h4>';
      html += '<p class="instructions-text">' + escapeHtml(meal.instructions) + '</p>';
      html += '</div>';

      html += '</div>'; // .recipe-expanded
      html += '</div>'; // .meal-card
    });

    // Adrenal note
    if (dayData.adrenalNote) {
      html += '<div class="info-callout" style="margin-top:4px;margin-bottom:24px;">';
      html += '<p style="font-size:13px;text-align:center;">' + escapeHtml(dayData.adrenalNote) + '</p>';
      html += '</div>';
    }

    els.dayContent.innerHTML = html;

    // Bind expand buttons
    els.dayContent.querySelectorAll('.expand-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-meal-key');
        toggleMealExpand(key, btn);
      });
    });
  }

  function toggleMealExpand(key, btn) {
    var idx = state.expandedMeals.indexOf(key);
    var recipeDiv = btn.nextElementSibling;

    if (idx !== -1) {
      state.expandedMeals.splice(idx, 1);
      btn.classList.remove('open');
      btn.querySelector('span').textContent = 'View Recipe';
      if (recipeDiv) recipeDiv.classList.remove('open');
    } else {
      state.expandedMeals.push(key);
      btn.classList.add('open');
      btn.querySelector('span').textContent = 'Hide Recipe';
      if (recipeDiv) recipeDiv.classList.add('open');
    }
    saveState();
  }

  function macroItem(value, label) {
    return '<div class="macro-item">'
      + '<span class="macro-number">' + value + '</span>'
      + '<span class="macro-label">' + label + '</span>'
      + '</div>';
  }

  function chevronSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
      + '<polyline points="6 9 12 15 18 9"/>'
      + '</svg>';
  }

  // ===== All Days Grid =====
  function renderAllDays() {
    var html = '<div class="all-days-grid">';

    data.days.forEach(function (day) {
      // Insert phase divider before day 21
      if (day.day === 21) {
        html += '<div class="phase-divider"><span>Luteal Phase \u00b7 Days 21\u201330</span></div>';
      }

      var cardClass = 'all-day-card' + (isLuteal(day.day) ? ' luteal' : ' standard');
      html += '<div class="' + cardClass + '" data-day="' + day.day + '">';
      html += '<div class="day-number all-day-num">Day ' + day.day + '</div>';
      html += '<div class="phase-label all-day-phase">' + (isLuteal(day.day) ? 'Luteal' : 'Standard') + '</div>';
      html += '<div class="meal-preview all-day-meals"><ul>';
      day.meals.forEach(function (meal) {
        html += '<li style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(meal.name) + '</li>';
      });
      html += '</ul></div>';
      html += '</div>';
    });

    html += '</div>';
    els.allDaysGrid.innerHTML = html;

    // Bind click handlers
    els.allDaysGrid.querySelectorAll('.all-day-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var dayNum = parseInt(card.getAttribute('data-day'), 10);
        selectDay(dayNum);
        switchView('today');
      });
    });
  }

  // ===== Grocery View =====
  function renderGrocery() {
    renderWeekTabs();
    renderGroceryContent();
  }

  function renderWeekTabs() {
    var html = '';
    for (var w = 1; w <= 4; w++) {
      var cls = 'week-tab' + (w === state.activeWeek ? ' active' : '');
      html += '<button class="' + cls + '" data-week="' + w + '">Week ' + w + '</button>';
    }
    els.weekTabs.innerHTML = html;

    els.weekTabs.querySelectorAll('.week-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeWeek = parseInt(btn.getAttribute('data-week'), 10);
        renderWeekTabs();
        renderGroceryContent();
        saveState();
      });
    });
  }

  function renderGroceryContent() {
    var weekData = data.groceryLists[state.activeWeek - 1];
    if (!weekData) return;

    var html = '';
    weekData.categories.forEach(function (cat, catIdx) {
      html += '<div class="grocery-category">';
      html += '<h3>' + escapeHtml(cat.name) + '</h3>';

      cat.items.forEach(function (item, itemIdx) {
        var key = state.activeWeek + '-' + cat.name + '-' + itemIdx;
        var isChecked = !!state.groceryChecked[key];
        var itemClass = 'grocery-item' + (isChecked ? ' checked' : '');
        var checkClass = 'grocery-check' + (isChecked ? ' checked' : '');

        html += '<div class="' + itemClass + '" data-key="' + escapeHtml(key) + '">';
        html += '<button class="' + checkClass + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">'
          + '<polyline points="6 12 10 16 18 8"/>'
          + '</svg>';
        html += '</button>';
        html += '<span class="grocery-item-name">' + escapeHtml(item.text) + '</span>';
        html += '</div>';
      });

      html += '</div>';
    });

    els.groceryContent.innerHTML = html;

    // Bind check handlers
    els.groceryContent.querySelectorAll('.grocery-item').forEach(function (row) {
      row.addEventListener('click', function () {
        var key = row.getAttribute('data-key');
        toggleGroceryCheck(key, row);
      });
    });
  }

  function toggleGroceryCheck(key, row) {
    var isChecked = !state.groceryChecked[key];
    if (isChecked) {
      state.groceryChecked[key] = true;
    } else {
      delete state.groceryChecked[key];
    }

    var checkBtn = row.querySelector('.grocery-check');
    row.classList.toggle('checked', isChecked);
    checkBtn.classList.toggle('checked', isChecked);
    saveState();
  }

  // ===== Info View =====
  function renderInfo() {
    var info = data.info;
    var html = '';

    // How to Use
    html += renderHowToUse(info.howToUse);

    // Understanding Calories
    html += renderUnderstandingCalories(info.understandingCalories);

    // Why Protein + Fiber
    html += renderWhyProteinFiber(info.whyProteinFiber);

    // Adrenal Cocktail
    html += renderAdrenalCocktail(info.adrenalCocktail);

    els.infoContent.innerHTML = html;
  }

  function renderHowToUse(d) {
    var html = '<div class="info-section">';
    html += '<h2>' + escapeHtml(d.title) + '</h2>';
    html += '<p>' + escapeHtml(d.intro) + '</p>';

    if (d.startingInfo) {
      html += '<h3 style="font-family:var(--font-serif);font-size:16px;font-weight:600;margin:16px 0 6px;">Getting Started</h3>';
      html += '<p>' + escapeHtml(d.startingInfo) + '</p>';
    }

    // Phase blocks
    if (d.phases) {
      d.phases.forEach(function (phase, idx) {
        var blockClass = 'info-phase-block' + (idx === 1 ? ' luteal' : '');
        html += '<div class="' + blockClass + '" style="margin-top:12px;">';
        html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px;">' + escapeHtml(phase.label) + '</div>';
        html += '<h3>' + escapeHtml(phase.title) + '</h3>';
        html += '<p>' + escapeHtml(phase.description) + '</p>';
        html += '<div style="font-size:12px;font-weight:600;color:var(--terracotta);margin-top:8px;">' + escapeHtml(phase.mealsTag) + '</div>';
        html += '</div>';
      });
    }

    // Callout
    if (d.callout) {
      html += '<div class="info-callout">';
      html += '<p>' + escapeHtml(d.callout) + '</p>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderUnderstandingCalories(d) {
    var html = '<div class="info-section">';
    html += '<h2>' + escapeHtml(d.title) + '</h2>';
    html += '<p>' + escapeHtml(d.intro) + '</p>';

    if (d.sections) {
      d.sections.forEach(function (s) {
        html += '<h3 style="font-family:var(--font-serif);font-size:16px;font-weight:600;margin:16px 0 6px;">' + escapeHtml(s.heading) + '</h3>';
        html += '<p>' + escapeHtml(s.text) + '</p>';
      });
    }

    if (d.callout) {
      html += '<div class="info-callout">';
      html += '<p>' + escapeHtml(d.callout) + '</p>';
      html += '</div>';
    }

    if (d.bodyText) {
      html += '<p style="margin-top:12px;">' + escapeHtml(d.bodyText) + '</p>';
    }

    html += '</div>';
    return html;
  }

  function renderWhyProteinFiber(d) {
    var html = '<div class="info-section">';
    html += '<h2>' + escapeHtml(d.title) + '</h2>';
    html += '<p>' + escapeHtml(d.intro) + '</p>';

    // Protein section
    if (d.proteinBadge) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--terracotta);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">' + escapeHtml(d.proteinBadge) + '</div>';
    }
    if (d.proteinText) {
      d.proteinText.forEach(function (p) {
        html += '<p style="margin-bottom:8px;">' + escapeHtml(p) + '</p>';
      });
    }

    // Fiber section
    if (d.fiberBadge) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;">' + escapeHtml(d.fiberBadge) + '</div>';
    }
    if (d.fiberIntro) {
      html += '<p style="margin-bottom:8px;">' + escapeHtml(d.fiberIntro) + '</p>';
    }
    if (d.fiberReasons) {
      d.fiberReasons.forEach(function (r) {
        html += '<h3 style="font-family:var(--font-serif);font-size:16px;font-weight:600;margin:12px 0 4px;">' + escapeHtml(r.heading) + '</h3>';
        html += '<p>' + escapeHtml(r.text) + '</p>';
      });
    }

    html += '</div>';
    return html;
  }

  function renderAdrenalCocktail(d) {
    var html = '';

    // Sections (What Is It, Why It Matters, When to Drink)
    html += '<div class="info-section">';
    html += '<h2>' + escapeHtml(d.title) + '</h2>';
    html += '<p>' + escapeHtml(d.intro) + '</p>';

    if (d.sections) {
      d.sections.forEach(function (s) {
        html += '<h3 style="font-family:var(--font-serif);font-size:16px;font-weight:600;margin:16px 0 6px;">' + escapeHtml(s.heading) + '</h3>';
        html += '<p>' + escapeHtml(s.text) + '</p>';
      });
    }

    // Timing
    if (d.timing) {
      html += '<div style="margin-top:12px;">';
      d.timing.forEach(function (t) {
        html += '<p style="font-size:13px;font-weight:600;color:var(--terracotta);margin-bottom:4px;">' + escapeHtml(t) + '</p>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Recipe card
    if (d.recipe) {
      html += '<div class="info-recipe-card">';
      html += '<h3>' + escapeHtml(d.recipe.title) + '</h3>';
      if (d.recipe.label) {
        html += '<p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;opacity:0.8;">' + escapeHtml(d.recipe.label) + '</p>';
      }
      if (d.recipe.ingredients) {
        html += '<ul style="list-style:none;padding:0;margin:8px 0;">';
        d.recipe.ingredients.forEach(function (ing) {
          html += '<li style="padding:3px 0;font-size:14px;">\u2022 ' + escapeHtml(ing) + '</li>';
        });
        html += '</ul>';
      }
      if (d.recipe.macrosNote) {
        html += '<p style="font-size:12px;margin-top:8px;opacity:0.85;">' + escapeHtml(d.recipe.macrosNote) + '</p>';
      }
      html += '</div>';
    }

    return html;
  }

  // ===== Scroll Tracking =====
  var scrollTimer = null;
  function setupScrollTracking() {
    document.querySelectorAll('.view-content').forEach(function (el) {
      el.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
          var container = getScrollContainer(state.activeView);
          if (container) {
            state.scrollPositions[state.activeView] = container.scrollTop;
            saveState();
          }
        }, 300);
      });
    });
  }

  // ===== Init =====
  function init() {
    cacheDom();
    loadState();
    bindTabs();

    fetch('data.json')
      .then(function (res) { return res.json(); })
      .then(function (json) {
        data = json;

        // Render everything
        renderDayPicker();
        renderDay();
        renderAllDays();
        renderGrocery();
        renderInfo();

        // Apply saved view
        switchView(state.activeView);

        // Setup scroll tracking
        setupScrollTracking();
      })
      .catch(function (err) {
        console.error('Failed to load data.json:', err);
      });

    // Save state on beforeunload
    window.addEventListener('beforeunload', saveState);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
