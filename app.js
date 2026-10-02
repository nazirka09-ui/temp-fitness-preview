const STORAGE_KEY = "temp-health-v1";
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      workouts: Array.isArray(saved?.workouts) ? saved.workouts : [],
      food: Array.isArray(saved?.food) ? saved.food : [],
    };
  } catch {
    return { workouts: [], food: [] };
  }
}

const data = loadData();
const number = value => Number(value) || 0;
const formatNumber = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const recordWord = count => count % 10 === 1 && count % 100 !== 11 ? "запись" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "записи" : "записей";
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function empty(target, message) {
  target.replaceChildren(element("p", "empty-state", message));
}

function renderWorkouts() {
  const list = document.querySelector("#workout-list");
  const recent = document.querySelector("#recent-workouts");
  const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const days = new Set(sorted.map(item => `${item.date}:${item.activity}`));
  document.querySelector("#stat-workouts").textContent = days.size;
  document.querySelector("#stat-sets").textContent = sorted.length;
  document.querySelector("#workout-count").textContent = `${sorted.length} ${recordWord(sorted.length)}`;
  if (!sorted.length) {
    empty(list, "Здесь появятся твои тренировки.");
    empty(recent, "Пока нет записей. Начни с первой тренировки.");
    renderProgress();
    return;
  }
  list.replaceChildren(...sorted.map(item => workoutRow(item, true)));
  recent.replaceChildren(...sorted.slice(0, 3).map(item => workoutRow(item, false)));
  renderProgress();
}

function renderProgress() {
  const target = document.querySelector("#progress-list");
  const byExercise = new Map();
  for (const item of [...data.workouts].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    if (!item.weight || item.activity === "Бег") continue;
    const key = item.exercise.trim().toLocaleLowerCase("ru-RU");
    if (!byExercise.has(key)) byExercise.set(key, []);
    byExercise.get(key).push(item);
  }
  const groups = [...byExercise.values()].filter(items => items.length >= 2);
  if (!groups.length) { empty(target, "Запиши упражнение с весом хотя бы дважды, чтобы увидеть изменение."); return; }
  target.replaceChildren(...groups.map(items => {
    const first = items[0], latest = items[items.length - 1];
    const delta = latest.weight - first.weight;
    const row = element("div", "progress-row");
    const info = element("div", "progress-info");
    info.append(element("strong", "", latest.exercise), element("span", "", `${formatNumber(first.weight)} кг → ${formatNumber(latest.weight)} кг`));
    row.append(info, element("b", delta > 0 ? "progress-positive" : "", `${delta > 0 ? "+" : ""}${formatNumber(delta)} кг`));
    return row;
  }));
}

function workoutRow(item, removable) {
  const row = element("div", "log-row");
  const icon = element("div", "row-icon", item.activity === "Бег" ? "◉" : "▥");
  const body = element("div", "row-body");
  body.append(element("strong", "", item.exercise), element("span", "", `${formatDate(item.date)} · ${item.activity}${item.note ? ` · ${item.note}` : ""}`));
  const metric = element("div", "row-metric", item.activity === "Бег" ? `${formatNumber(item.reps)} мин` : `${item.weight ? `${formatNumber(item.weight)} кг × ` : ""}${formatNumber(item.reps)} повт.`);
  row.append(icon, body, metric);
  if (removable) {
    const button = element("button", "delete-button", "×");
    button.type = "button";
    button.setAttribute("aria-label", `Удалить запись: ${item.exercise}`);
    button.addEventListener("click", () => {
      data.workouts = data.workouts.filter(record => record.id !== item.id);
      save(); render();
    });
    row.append(button);
  }
  return row;
}

function renderFood() {
  const selectedDate = document.querySelector("#food-view-date").value || today();
  const selectedFood = data.food.filter(item => item.date === selectedDate).sort((a, b) => b.createdAt - a.createdAt);
  const sumFood = items => items.reduce((total, item) => {
    for (const key of ["calories", "protein", "fat", "carbs"]) total[key] += number(item[key]);
    return total;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  const sums = sumFood(selectedFood);
  const todaySums = sumFood(data.food.filter(item => item.date === today()));
  for (const key of Object.keys(sums)) document.querySelector(`#total-${key}`).textContent = formatNumber(sums[key]);
  document.querySelectorAll(".macro-period").forEach(node => node.textContent = selectedDate === today() ? "сегодня" : `за ${formatDate(selectedDate)}`);
  document.querySelector("#food-list-date").textContent = selectedDate === today() ? "сегодня" : formatDate(selectedDate);
  document.querySelector("#stat-calories").replaceChildren(document.createTextNode(`${formatNumber(todaySums.calories)} `), element("i", "", "ккал"));
  document.querySelector("#stat-macros").textContent = `Б ${formatNumber(todaySums.protein)} · Ж ${formatNumber(todaySums.fat)} · У ${formatNumber(todaySums.carbs)} г`;
  const list = document.querySelector("#food-list");
  if (!selectedFood.length) { empty(list, "За эту дату записей пока нет."); return; }
  list.replaceChildren(...selectedFood.map(item => {
    const row = element("div", "log-row");
    const icon = element("div", "row-icon food-icon", "◉");
    const body = element("div", "row-body");
    body.append(element("strong", "", item.name), element("span", "", `Б ${formatNumber(item.protein)} · Ж ${formatNumber(item.fat)} · У ${formatNumber(item.carbs)} г`));
    const metric = element("div", "row-metric", `${formatNumber(item.calories)} ккал`);
    const button = element("button", "delete-button", "×");
    button.type = "button";
    button.setAttribute("aria-label", `Удалить запись: ${item.name}`);
    button.addEventListener("click", () => { data.food = data.food.filter(record => record.id !== item.id); save(); render(); });
    row.append(icon, body, metric, button);
    return row;
  }));
}

function render() { renderWorkouts(); renderFood(); }

function navigate() {
  const requested = location.hash.slice(1);
  const page = ["overview", "training", "nutrition", "learn"].includes(requested) ? requested : "overview";
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === page));
  document.querySelectorAll("[data-page]").forEach(node => {
    const active = node.dataset.page === page;
    node.classList.toggle("active", active);
    if (active) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current");
  });
  document.querySelector("#page-title").textContent = ({ overview: "Обзор", training: "Тренировки", nutrition: "Питание", learn: "База знаний" })[page];
  window.scrollTo(0, 0);
}

document.querySelector("#today-label").textContent = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
document.querySelector("#workout-date").value = today();
document.querySelector("#food-date").value = today();
document.querySelector("#food-view-date").value = today();
document.querySelector("#food-view-date").addEventListener("change", renderFood);

document.querySelector("#workout-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  data.workouts.push({ id: crypto.randomUUID(), createdAt: Date.now(), date: values.date, activity: values.activity, exercise: values.exercise.trim(), weight: number(values.weight), reps: number(values.reps), note: values.note.trim() });
  save(); form.reset(); document.querySelector("#workout-date").value = today(); render();
});

document.querySelector("#food-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  data.food.push({ id: crypto.randomUUID(), createdAt: Date.now(), date: values.date, name: values.name.trim(), calories: number(values.calories), protein: number(values.protein), fat: number(values.fat), carbs: number(values.carbs) });
  save(); form.reset(); document.querySelector("#food-date").value = today(); document.querySelector("#food-view-date").value = values.date; render();
});

window.addEventListener("hashchange", navigate);
render(); navigate();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
