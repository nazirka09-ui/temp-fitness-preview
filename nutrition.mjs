import { FOODS, FOOD_SOURCE } from './food-catalog.mjs?v=1';
const MEALS = ['Завтрак', 'Обед', 'Ужин', 'Перекус'];
const KEYS = ['calories', 'protein', 'fat', 'carbs'];
const PREF_KEY = 'temp-food-preferences-v1';
const normalize = text => String(text || '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
const parse = value => Number(String(value).replace(',', '.'));
const fmt = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
export function foodTotals(per100, grams) { return Object.fromEntries(KEYS.map(key => [key, Math.round(Number(per100[key]) * grams / 100 * 100) / 100])); }
let context, prefs, selection = null, editingId = null, category = 'Все', tab = 'Все', portionMode = 'portion';
const catalog = () => [...FOODS, ...prefs.customs];
const foodById = id => catalog().find(food => food.id === id);
function persist() { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
function label(text, input) { const l = node('label', '', text); l.append(input); return l; }
function button(text, cls, action) { const b = node('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; }
function mealSelect() { const s = node('select'); s.name = 'meal'; for (const meal of MEALS) { const o = node('option', '', meal); o.value = meal; s.append(o); } return s; }
function setMeal(meal) { document.querySelector('#food-form [name="meal"]').value = meal; document.querySelectorAll('[data-food-meal]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.foodMeal === meal))); }
function renderSearch() {
  const query = normalize(document.querySelector('#food-search').value);
  let foods = catalog();
  if (tab === 'Избранное') foods = foods.filter(food => prefs.favorites.includes(food.id));
  if (tab === 'Недавние') {
    const ids = [...new Set([...prefs.recent, ...[...context.data.food].sort((a,b) => b.createdAt-a.createdAt).map(entry => entry.foodId).filter(Boolean)])];
    foods = ids.map(foodById).filter(Boolean).slice(0,20);
  }
  foods = foods.filter(food => (category === 'Все' || food.category === category) && (!query || normalize(`${food.name} ${food.description || ''} ${food.aliases || ''} ${food.category}`).includes(query)));
  const list = document.querySelector('#food-search-results'); list.replaceChildren();
  document.querySelector('#food-results-caption').textContent = `${foods.length} ${foods.length === 1 ? 'позиция' : 'позиций'} · значения на 100 г`;
  if (!foods.length) list.append(node('p', 'form-help', query ? 'Ничего не найдено. Попробуй другое название или добавь своё блюдо.' : tab === 'Избранное' ? 'Нажми звёздочку у блюда, чтобы сохранить его здесь.' : 'Здесь появятся блюда, которые ты записывал.'));
  for (const food of foods.slice(0,40)) {
    const row = node('div', 'food-result' + (selection?.id === food.id ? ' selected' : ''));
    const choose = button('', 'food-result-select', () => chooseFood(food));
    choose.append(node('strong', '', food.name), node('span', '', `${fmt(food.per100.calories)} ккал · Б ${fmt(food.per100.protein)} · Ж ${fmt(food.per100.fat)} · У ${fmt(food.per100.carbs)}`));
    const favorite = prefs.favorites.includes(food.id);
    const star = button('', 'food-favorite', () => { prefs.favorites = favorite ? prefs.favorites.filter(id => id !== food.id) : [...prefs.favorites, food.id]; persist(); renderSearch(); });
    star.setAttribute('aria-label', `${favorite ? 'Убрать из избранного' : 'В избранное'}: ${food.name}`); star.setAttribute('aria-pressed', String(favorite));
    star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg>';
    row.append(choose, star); list.append(row);
  }
  if (foods.length > 40) list.append(node('p', 'form-help', 'Показаны первые 40 позиций. Уточни поиск или выбери категорию.'));
  document.querySelectorAll('[data-food-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.foodTab === tab)));
  document.querySelectorAll('[data-food-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.foodCategory === category)));
}
function chooseFood(food, grams = null) {
  selection = food;
  document.querySelector('#food-own-fields').hidden = true; document.querySelector('#food-own-fields').disabled = true;
  document.querySelector('#food-entry').hidden = false;
  document.querySelector('#food-selected-name').textContent = food.name;
  const source = document.querySelector('#food-selected-source'); source.replaceChildren();
  if (food.fdcId) {
    const link = node('a', '', 'USDA · исходная запись'); link.href = `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`; link.target = '_blank'; link.rel = 'noopener noreferrer'; source.append(link);
  } else source.textContent = 'Моё блюдо · значения на 100 г';
  const amount = document.querySelector('#food-grams'); amount.disabled = false; amount.value = grams ?? food.portionGrams;
  amount.setCustomValidity(''); portionMode = grams == null ? 'portion' : 'custom';
  document.querySelector('[data-food-portion="portion"]').textContent = `Средняя порция ≈ ${fmt(food.portionGrams)} г`;
  document.querySelector('#food-portion-note').textContent = food.fdcId ? 'Справочная порция — ориентир. Уточни вес своего блюда; БЖУ зависят от рецепта.' : 'Укажи вес съеденной порции.';
  document.querySelector('#food-own-mode').hidden = false;
  updatePreview(); renderSearch();
  document.querySelector('#food-entry').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function ownMode() {
  editingId = null; selection = null;
  document.querySelector('#food-entry').hidden = false; document.querySelector('#food-own-fields').hidden = false; document.querySelector('#food-own-fields').disabled = false;
  document.querySelector('#food-selected-name').textContent = 'Своё блюдо'; document.querySelector('#food-selected-source').textContent = 'Введи БЖУ с упаковки или своего рецепта на 100 г.';
  document.querySelector('#food-own-mode').hidden = true; document.querySelector('#food-grams').disabled = false; document.querySelector('#food-grams').value = '100'; document.querySelector('#food-grams').setCustomValidity('');
  document.querySelector('[data-food-portion="portion"]').textContent = 'Порция 100 г';
  document.querySelector('#food-portion-note').textContent = 'Сохраним блюдо в категории «Мои блюда», чтобы не вводить его повторно.';
  portionMode = '100'; updatePreview(); document.querySelector('#food-own-name').focus();
}
function ownFood() {
  const per100 = Object.fromEntries(KEYS.map(key => [key, parse(document.querySelector(`#food-own-${key}`).value)]));
  return { id: 'custom-' + context.uid(), name: document.querySelector('#food-own-name').value.trim(), category: 'Мои блюда', per100, portionGrams: 100 };
}
function updatePreview() {
  const amount = document.querySelector('#food-grams'); const grams = parse(amount.value);
  const valid = /^\d+([.,]\d+)?$/.test(amount.value.trim()) && Number.isFinite(grams) && grams > 0 && grams <= 10000;
  amount.setCustomValidity(valid ? '' : 'Укажи вес от 0 до 10 000 г, больше нуля. Можно использовать точку или запятую.');
  const food = selection || (!document.querySelector('#food-own-fields').hidden ? ownFood() : null);
  const totals = valid && food ? foodTotals(food.per100, grams) : null;
  document.querySelector('#food-preview').textContent = totals ? `${fmt(totals.calories)} ккал · Б ${fmt(totals.protein)} · Ж ${fmt(totals.fat)} · У ${fmt(totals.carbs)} г` : 'Укажи вес порции';
  document.querySelectorAll('[data-food-portion]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.foodPortion === portionMode)));
  document.querySelector('#food-save').textContent = editingId ? 'Сохранить изменения' : 'Добавить в дневник';
}
export function initNutrition(ctx) {
  context = ctx;
  try { const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); prefs = { favorites: Array.isArray(saved.favorites) ? saved.favorites : [], recent: Array.isArray(saved.recent) ? saved.recent : [], customs: Array.isArray(saved.customs) ? saved.customs : [] }; } catch { prefs = { favorites: [], recent: [], customs: [] }; }
  const meals = document.querySelector('#food-meal-buttons');
  for (const meal of MEALS) { const b = button(meal, 'food-chip', () => setMeal(meal)); b.dataset.foodMeal = meal; meals.append(b); }
  setMeal('Завтрак');
  for (const name of ['Все','Недавние','Избранное']) { const b = button(name, 'food-chip', () => { tab = name; category = 'Все'; renderSearch(); }); b.dataset.foodTab = name; document.querySelector('#food-tabs').append(b); }
  for (const name of ['Все', ...new Set(FOODS.map(food => food.category)), 'Мои блюда']) { const b = button(name, 'food-chip', () => { category = name; tab = 'Все'; renderSearch(); }); b.dataset.foodCategory = name; document.querySelector('#food-categories').append(b); }
  document.querySelector('#food-search').addEventListener('input', renderSearch);
  document.querySelector('#food-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); renderSearch(); } });
  document.querySelector('#food-own-mode').addEventListener('click', ownMode);
  document.querySelector('#food-entry-close').addEventListener('click', () => { selection = null; editingId = null; document.querySelector('#food-entry').hidden = true; document.querySelector('#food-grams').disabled = true; document.querySelector('#food-own-fields').disabled = true; document.querySelector('#food-own-mode').hidden = false; renderSearch(); });
  for (const b of document.querySelectorAll('[data-food-portion]')) b.addEventListener('click', () => {
    portionMode = b.dataset.foodPortion;
    if (portionMode !== 'custom') document.querySelector('#food-grams').value = portionMode === '100' ? 100 : selection?.portionGrams || 100;
    updatePreview(); if (portionMode === 'custom') document.querySelector('#food-grams').focus();
  });
  document.querySelector('#food-grams').addEventListener('input', () => { portionMode = 'custom'; updatePreview(); });
  document.querySelector('#food-own-fields').addEventListener('input', updatePreview);
  document.querySelector('#food-form').addEventListener('submit', event => {
    event.preventDefault(); if (!selection && document.querySelector('#food-own-fields').hidden) return; const form = event.currentTarget; updatePreview();
    if (!form.reportValidity()) return;
    let food = selection;
    if (!food) {
      food = ownFood(); if (!food.name || KEYS.some(key => !Number.isFinite(food.per100[key]) || food.per100[key] < 0)) return;
      prefs.customs.push(food);
    }
    const grams = parse(document.querySelector('#food-grams').value), old = context.data.food.find(entry => entry.id === editingId);
    const entry = { id: old?.id || context.uid(), createdAt: old?.createdAt || Date.now(), date: form.elements.date.value, meal: form.elements.meal.value, name: food.name, foodId: food.id, grams, per100: { ...food.per100 }, ...foodTotals(food.per100, grams) };
    if (old) context.data.food[context.data.food.indexOf(old)] = entry; else context.data.food.push(entry);
    prefs.recent = [food.id, ...prefs.recent.filter(id => id !== food.id)].slice(0,20); persist(); context.save();
    document.querySelector('#food-view-date').value = entry.date; editingId = null; selection = null;
    document.querySelector('#food-entry').hidden = true; document.querySelector('#food-own-fields').disabled = true; document.querySelector('#food-grams').disabled = true; document.querySelector('#food-own-mode').hidden = false; document.querySelector('#food-search').value = ''; renderSearch(); context.render();
    document.querySelector('#food-list').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.querySelector('#food-view-date').addEventListener('change', () => { document.querySelector('#food-date').value = document.querySelector('#food-view-date').value; });
  document.querySelector('#food-date').addEventListener('change', () => { document.querySelector('#food-view-date').value = document.querySelector('#food-date').value; context.render(); });
  renderSearch();
}
export function renderNutritionDiary(entries) {
  const list = document.querySelector('#food-list'); if (!context) return;
  list.replaceChildren();
  for (const meal of [...MEALS, ...(entries.some(entry => !MEALS.includes(entry.meal)) ? ['Без приёма пищи'] : [])]) {
    const items = entries.filter(entry => (entry.meal || 'Без приёма пищи') === meal);
    const section = node('section','food-meal-section');
    const header = node('div','panel-head');
    header.append(node('h4','',meal), node('span','food-meal-energy', `${fmt(items.reduce((sum,item) => sum + Number(item.calories || 0),0))} ккал`));
    if (MEALS.includes(meal)) header.append(button('+ Добавить','text-button',() => { setMeal(meal); document.querySelector('#food-date').value = document.querySelector('#food-view-date').value; document.querySelector('#food-search').focus(); document.querySelector('#food-search').scrollIntoView({behavior:'smooth',block:'center'}); }));
    section.append(header);
    if (!items.length) section.append(node('p','form-help','Пока ничего не записано.'));
    for (const item of items) {
      const row = node('div','food-diary-row'); const body = node('div','food-diary-body');
      body.append(node('strong','',item.name),node('span','',`${item.grams ? fmt(item.grams)+' г · ' : ''}${fmt(item.calories)} ккал`),node('small','',`Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carbs)} г`));
      const actions = node('div','food-diary-actions');
      if (item.per100 && item.grams) actions.append(button('Изменить','text-button',() => { editingId = item.id; document.querySelector('#food-date').value = item.date; setMeal(item.meal); chooseFood({ ...(foodById(item.foodId) || { id:item.foodId, name:item.name, portionGrams:item.grams }), per100:item.per100 },item.grams); }));
      actions.append(button('Удалить','text-button danger',() => { context.data.food = context.data.food.filter(entry => entry.id !== item.id); context.save(); context.render(); }));
      row.append(body,actions);section.append(row);
    }
    list.append(section);
  }
}
