const STORAGE_KEY = "temp-health-v1";
const TIMER_KEY = "temp-rest-timer-v1";
const TEMPLATES = [
  { id: "legs", title: "День ног", activity: "Силовая", exercises: ["Приседания со штангой", "Жим ногами", "Выпады с гантелями", "Сгибание ног", "Подъёмы на носки"] },
  { id: "back", title: "Спина и бицепс", activity: "Силовая", exercises: ["Тяга верхнего блока", "Тяга штанги в наклоне", "Горизонтальная тяга", "Подтягивания", "Сгибание рук с гантелями"] },
  { id: "chest", title: "Грудь и трицепс", activity: "Силовая", exercises: ["Жим лёжа", "Жим гантелей лёжа", "Разведение гантелей", "Отжимания", "Разгибание рук на блоке"] },
  { id: "shoulders", title: "Плечи", activity: "Силовая", exercises: ["Жим гантелей сидя", "Махи гантелями в стороны", "Обратная бабочка", "Тяга к подбородку"] },
  { id: "full", title: "Всё тело", activity: "Силовая", exercises: ["Приседания", "Жим лёжа", "Тяга верхнего блока", "Планка"] },
  { id: "run", title: "Пробежка", activity: "Бег", exercises: ["Лёгкий бег", "Интервальный бег", "Ходьба"] },
];
const CATALOG = [...new Set(TEMPLATES.flatMap(template => template.exercises))];
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const number = value => Number(value) || 0;
const formatNumber = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const recordWord = count => count % 10 === 1 && count % 100 !== 11 ? "тренировка" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "тренировки" : "тренировок";
const exerciseWord = count => count % 10 === 1 && count % 100 !== 11 ? "упражнение" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "упражнения" : "упражнений";
const uid = () => crypto.randomUUID();

function migrateWorkouts(workouts) {
  const grouped = new Map();
  for (const item of workouts) {
    const key = `${item.date}:${item.activity}`;
    if (!grouped.has(key)) grouped.set(key, { id: uid(), date: item.date, title: item.activity === "Бег" ? "Пробежка" : `Тренировка · ${item.activity}`, activity: item.activity, status: "done", templateId: "", createdAt: item.createdAt || 0, exercises: [] });
    const session = grouped.get(key);
    let exercise = session.exercises.find(entry => entry.name === item.exercise);
    if (!exercise) { exercise = { id: uid(), name: item.exercise, sets: [] }; session.exercises.push(exercise); }
    exercise.sets.push({ id: item.id || uid(), weight: number(item.weight), reps: number(item.reps), note: item.note || "", createdAt: item.createdAt || 0 });
  }
  return [...grouped.values()];
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      sessions: Array.isArray(saved?.sessions) ? saved.sessions : migrateWorkouts(Array.isArray(saved?.workouts) ? saved.workouts : []),
      food: Array.isArray(saved?.food) ? saved.food : [],
    };
  } catch { return { sessions: [], food: [] }; }
}
const data = loadData();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let selectedTemplate = null;
let restSeconds = 120;
let timerEnd = Number(localStorage.getItem(TIMER_KEY)) || 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function empty(target, message) { target.replaceChildren(element("p", "empty-state", message)); }
function activeSession() { return data.sessions.find(session => session.status === "active"); }
function allSets() { return data.sessions.flatMap(session => session.exercises.flatMap(exercise => exercise.sets.map(set => ({ ...set, date: session.date, activity: session.activity, exercise: exercise.name })))); }
function isRun(session) { return session.activity === "Бег"; }
function setText(set, run) { return run ? `${formatNumber(set.reps)} мин` : `${formatNumber(set.weight)} кг × ${formatNumber(set.reps)}`; }

function renderTemplates() {
  const target = document.querySelector("#template-list");
  target.replaceChildren(...TEMPLATES.map(template => {
    const button = element("button", `template-card${selectedTemplate?.id === template.id ? " chosen" : ""}`);
    button.type = "button";
    button.append(element("strong", "", template.title), element("span", "", `${template.exercises.length} ${exerciseWord(template.exercises.length)} · ${template.activity}`));
    button.addEventListener("click", () => {
      selectedTemplate = template;
      const form = document.querySelector("#session-form");
      form.elements.title.value = template.title;
      form.elements.activity.value = template.activity;
      renderTemplates();
    });
    return button;
  }));
}

function renderWorkouts() {
  const sorted = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  document.querySelector("#stat-workouts").textContent = data.sessions.filter(session => session.exercises.some(exercise => exercise.sets.length)).length;
  document.querySelector("#stat-sets").textContent = allSets().length;
  document.querySelector("#workout-count").textContent = `${sorted.length} ${recordWord(sorted.length)}`;
  const list = document.querySelector("#workout-list");
  const recent = document.querySelector("#recent-workouts");
  if (!sorted.length) {
    empty(list, "Здесь появятся твои тренировки.");
    empty(recent, "Пока нет записей. Начни с первой тренировки.");
  } else {
    list.replaceChildren(...sorted.map(session => sessionRow(session, true)));
    recent.replaceChildren(...sorted.slice(0, 3).map(session => sessionRow(session, false)));
  }
  renderActiveSession();
  renderProgress();
}

function sessionRow(session, removable) {
  const details = element("details", "session-row");
  const summary = element("summary", "session-summary");
  const icon = element("span", "row-icon", isRun(session) ? "◉" : "▥");
  const title = element("span", "session-row-title");
  title.append(element("strong", "", session.title), element("small", "", `${formatDate(session.date)} · ${session.status === "active" ? "идёт сейчас" : session.activity}`));
  const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  summary.append(icon, title, element("b", "", `${setCount} подх.`));
  details.append(summary);
  const body = element("div", "session-row-details");
  if (!session.exercises.length) body.append(element("p", "form-help", "Упражнения пока не добавлены."));
  for (const exercise of session.exercises) {
    const group = element("div", "history-exercise");
    group.append(element("strong", "", exercise.name));
    group.append(element("span", "", exercise.sets.map((set, index) => `${index + 1}. ${setText(set, isRun(session))}${set.note ? ` · ${set.note}` : ""}`).join("  ·  ") || "Нет подходов"));
    body.append(group);
  }
  if (removable) {
    const button = element("button", "text-button danger", "Удалить тренировку");
    button.type = "button";
    button.addEventListener("click", () => {
      if (!confirm(`Удалить тренировку «${session.title}»?`)) return;
      data.sessions = data.sessions.filter(item => item.id !== session.id);
      save(); render();
    });
    body.append(button);
  }
  details.append(body);
  return details;
}

function previousSet(name, currentSession) {
  const sessions = [...data.sessions].filter(session => session.id !== currentSession.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  for (const session of sessions) {
    const exercise = session.exercises.find(item => item.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"));
    if (exercise?.sets.length) return exercise.sets[exercise.sets.length - 1];
  }
  return null;
}

function renderActiveSession() {
  const target = document.querySelector("#active-session");
  const session = activeSession();
  target.hidden = !session;
  const startButton = document.querySelector('#session-form button[type="submit"]');
  startButton.disabled = Boolean(session);
  document.querySelector("#session-form .form-help").textContent = session ? "Заверши текущую тренировку, чтобы начать следующую." : "Выбранный шаблон подскажет упражнения. Их можно менять и дополнять.";
  if (!session) { target.replaceChildren(); return; }
  target.replaceChildren();
  const header = element("div", "panel-head");
  const heading = element("div");
  heading.append(element("div", "eyebrow", "ТРЕНИРОВКА ИДЁТ"), element("h3", "", session.title));
  const finish = element("button", "small-button", "Завершить");
  finish.type = "button";
  finish.addEventListener("click", () => { session.status = "done"; save(); render(); });
  header.append(heading, finish);
  target.append(header, element("p", "active-hint", `${formatDate(session.date)} · ${session.activity}. Добавь упражнение, затем записывай каждый подход.`));

  const suggestions = session.templateId ? TEMPLATES.find(template => template.id === session.templateId)?.exercises || CATALOG : CATALOG;
  const available = suggestions.filter(name => !session.exercises.some(exercise => exercise.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU")));
  const chooser = element("div", "exercise-chooser");
  chooser.append(element("h4", "", "Предложенные упражнения"));
  const chips = element("div", "exercise-chips");
  for (const name of available) {
    const button = element("button", "exercise-chip", `+ ${name}`);
    button.type = "button";
    button.addEventListener("click", () => addExercise(session, name));
    chips.append(button);
  }
  if (!available.length) chips.append(element("p", "form-help", "Все упражнения шаблона добавлены. Можно вписать своё ниже."));
  chooser.append(chips);
  const form = element("form", "custom-exercise-form");
  form.innerHTML = '<label>Своё упражнение или поиск по названию <input name="name" type="text" maxlength="80" list="exercise-options" placeholder="Например, становая тяга" required /></label><datalist id="exercise-options"></datalist><button class="small-button" type="submit">Добавить упражнение</button>';
  const datalist = form.querySelector("datalist");
  for (const name of CATALOG) { const option = element("option"); option.value = name; datalist.append(option); }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (name) addExercise(session, name);
  });
  chooser.append(form);
  target.append(chooser);

  const exerciseList = element("div", "active-exercises");
  for (const exercise of session.exercises) exerciseList.append(exerciseCard(session, exercise));
  target.append(exerciseList);
}

function addExercise(session, name) {
  if (session.exercises.some(exercise => exercise.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))) return;
  session.exercises.push({ id: uid(), name, sets: [] });
  save(); render();
  document.querySelector("#active-session").scrollIntoView({ behavior: "smooth", block: "start" });
}

function exerciseCard(session, exercise) {
  const card = element("div", "exercise-card");
  const top = element("div", "exercise-card-head");
  top.append(element("h4", "", exercise.name));
  const remove = element("button", "delete-button", "×");
  remove.type = "button";
  remove.setAttribute("aria-label", `Удалить упражнение: ${exercise.name}`);
  remove.addEventListener("click", () => { session.exercises = session.exercises.filter(item => item.id !== exercise.id); save(); render(); });
  top.append(remove);
  card.append(top);
  const prior = previousSet(exercise.name, session);
  if (prior) card.append(element("p", "previous-set", `В прошлый раз: ${setText(prior, isRun(session))}`));
  const sets = element("div", "set-list");
  exercise.sets.forEach((set, index) => {
    const row = element("div", "set-row");
    row.append(element("span", "set-number", `${index + 1}`), element("strong", "", setText(set, isRun(session))));
    const del = element("button", "delete-button", "×");
    del.type = "button";
    del.setAttribute("aria-label", `Удалить подход ${index + 1}`);
    del.addEventListener("click", () => { exercise.sets = exercise.sets.filter(item => item.id !== set.id); save(); render(); });
    row.append(del); sets.append(row);
  });
  if (!exercise.sets.length) sets.append(element("p", "form-help", "Подходов пока нет."));
  card.append(sets);
  const last = exercise.sets[exercise.sets.length - 1] || prior;
  const form = element("form", "quick-set-form");
  if (!isRun(session)) {
    const weight = element("label", "", "Вес, кг");
    const input = element("input");
    input.name = "weight"; input.type = "number"; input.min = "0"; input.max = "1000"; input.step = "0.5"; input.value = last ? last.weight : 0;
    weight.append(input); form.append(weight);
  }
  const reps = element("label", "", isRun(session) ? "Минуты" : "Повторения");
  const input = element("input");
  input.name = "reps"; input.type = "number"; input.min = "1"; input.max = "10000"; input.step = "1"; input.required = true; input.value = last?.reps || "";
  reps.append(input); form.append(reps);
  const submit = element("button", "small-button", "+ Подход");
  submit.type = "submit"; form.append(submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    exercise.sets.push({ id: uid(), weight: isRun(session) ? 0 : number(values.weight), reps: number(values.reps), createdAt: Date.now() });
    save(); render();
  });
  card.append(form);
  return card;
}

function renderProgress() {
  const target = document.querySelector("#progress-list");
  const byExercise = new Map();
  for (const session of [...data.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    if (isRun(session)) continue;
    for (const exercise of session.exercises) {
      const weighted = exercise.sets.filter(set => set.weight > 0);
      if (!weighted.length) continue;
      const key = exercise.name.trim().toLocaleLowerCase("ru-RU");
      if (!byExercise.has(key)) byExercise.set(key, []);
      byExercise.get(key).push({ exercise: exercise.name, weight: Math.max(...weighted.map(set => set.weight)) });
    }
  }
  const groups = [...byExercise.values()].filter(items => items.length >= 2);
  if (!groups.length) { empty(target, "Повтори упражнение с весом в двух тренировках, чтобы увидеть изменение."); return; }
  target.replaceChildren(...groups.map(items => {
    const first = items[0], latest = items[items.length - 1], delta = latest.weight - first.weight;
    const row = element("div", "progress-row");
    const info = element("div", "progress-info");
    info.append(element("strong", "", latest.exercise), element("span", "", `${formatNumber(first.weight)} кг → ${formatNumber(latest.weight)} кг`));
    row.append(info, element("b", delta > 0 ? "progress-positive" : "", `${delta > 0 ? "+" : ""}${formatNumber(delta)} кг`));
    return row;
  }));
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

function renderTimer() {
  const remaining = timerEnd ? Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)) : restSeconds;
  const display = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  document.querySelectorAll("[data-timer-display]").forEach(node => node.textContent = display);
  document.querySelectorAll("[data-timer-status]").forEach(node => node.textContent = timerEnd ? remaining ? "Идёт отдых между подходами" : "Отдых завершён — можно продолжать" : "Выбери время и запусти таймер.");
  document.querySelectorAll("[data-timer-start]").forEach(button => button.classList.toggle("selected", Number(button.dataset.timerStart) === restSeconds));
}
function render() { renderTemplates(); renderWorkouts(); renderFood(); renderTimer(); }
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
document.querySelector("#session-form").addEventListener("submit", event => {
  event.preventDefault();
  if (activeSession()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  data.sessions.push({ id: uid(), date: values.date, title: values.title.trim(), activity: values.activity, status: "active", templateId: selectedTemplate?.id || "", createdAt: Date.now(), exercises: [] });
  save(); form.reset(); form.elements.date.value = today(); selectedTemplate = null; render();
  document.querySelector("#active-session").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelectorAll("[data-timer-start]").forEach(button => button.addEventListener("click", () => {
  restSeconds = Number(button.dataset.timerStart);
  timerEnd = Date.now() + restSeconds * 1000;
  localStorage.setItem(TIMER_KEY, String(timerEnd));
  renderTimer();
}));
document.querySelectorAll("[data-timer-stop]").forEach(button => button.addEventListener("click", () => {
  timerEnd = 0;
  localStorage.removeItem(TIMER_KEY);
  renderTimer();
}));
document.querySelector("#food-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  data.food.push({ id: uid(), createdAt: Date.now(), date: values.date, name: values.name.trim(), calories: number(values.calories), protein: number(values.protein), fat: number(values.fat), carbs: number(values.carbs) });
  save(); form.reset(); document.querySelector("#food-date").value = today(); document.querySelector("#food-view-date").value = values.date; render();
});
window.addEventListener("hashchange", navigate);
setInterval(renderTimer, 1000);
render(); navigate();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
