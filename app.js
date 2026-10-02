import { GROUPS, exerciseKey, exerciseHistory, sessionVolume, groupOverview, suggestedGoal, recordChanges, sessionSummary, plateauDetected, estimatedMax, bestSet, dayDistance } from "./metrics.mjs";

const STORAGE_KEY = "temp-health-v1";
const TIMER_KEY = "temp-rest-timer-v1";
const REST_DURATION_KEY = "temp-rest-duration-v1";
const AUTO_REST_KEY = "temp-auto-rest-v1";
const TEMPLATES = [
  { id: "legs", title: "День ног", activity: "Силовая", exercises: ["Приседания со штангой", "Жим ногами", "Выпады с гантелями", "Сгибание ног", "Подъёмы на носки"] },
  { id: "back", title: "Спина и бицепс", activity: "Силовая", exercises: ["Тяга верхнего блока", "Тяга штанги в наклоне", "Горизонтальная тяга", "Подтягивания", "Сгибание рук с гантелями"] },
  { id: "chest", title: "Грудь и трицепс", activity: "Силовая", exercises: ["Жим лёжа", "Жим гантелей лёжа", "Разведение гантелей", "Отжимания", "Разгибание рук на блоке"] },
  { id: "shoulders", title: "Плечи", activity: "Силовая", exercises: ["Жим гантелей сидя", "Махи гантелями в стороны", "Обратная бабочка", "Тяга к подбородку"] },
  { id: "full", title: "Всё тело", activity: "Силовая", exercises: ["Приседания", "Жим лёжа", "Тяга верхнего блока", "Планка"] },
  { id: "run", title: "Пробежка", activity: "Бег", exercises: ["Лёгкий бег", "Интервальный бег", "Ходьба"] },
];
const CATALOG = [...new Set(TEMPLATES.flatMap(template => template.exercises))];
const GROUP_BY_EXERCISE = new Map([
  ...TEMPLATES[0].exercises.map(name => [exerciseKey(name), "Ноги"]),
  ...TEMPLATES[1].exercises.map(name => [exerciseKey(name), name.includes("Сгибание рук") ? "Руки" : "Спина"]),
  ...TEMPLATES[2].exercises.map(name => [exerciseKey(name), name.includes("Разгибание рук") ? "Руки" : "Грудь"]),
  ...TEMPLATES[3].exercises.map(name => [exerciseKey(name), "Плечи"]),
  [exerciseKey("Приседания"), "Ноги"], [exerciseKey("Планка"), "Кор"],
]);
const inferGroup = name => GROUP_BY_EXERCISE.get(exerciseKey(name)) || "Другое";
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const number = value => Number(value) || 0;
const formatNumber = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const recordWord = count => count % 10 === 1 && count % 100 !== 11 ? "тренировка" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "тренировки" : "тренировок";
const exerciseWord = count => count % 10 === 1 && count % 100 !== 11 ? "упражнение" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "упражнения" : "упражнений";
const recordPhrase = count => count % 10 === 1 && count % 100 !== 11 ? "новый рекорд" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "новых рекорда" : "новых рекордов";
const uid = () => crypto.randomUUID();

function migrateWorkouts(workouts) {
  const grouped = new Map();
  for (const item of workouts) {
    const key = `${item.date}:${item.activity}`;
    if (!grouped.has(key)) grouped.set(key, { id: uid(), date: item.date, title: item.activity === "Бег" ? "Пробежка" : `Тренировка · ${item.activity}`, activity: item.activity, status: "done", templateId: "", createdAt: item.createdAt || 0, exercises: [] });
    const session = grouped.get(key);
    let exercise = session.exercises.find(entry => entry.name === item.exercise);
    if (!exercise) { exercise = { id: uid(), name: item.exercise, group: inferGroup(item.exercise), sets: [] }; session.exercises.push(exercise); }
    exercise.sets.push({ id: item.id || uid(), weight: number(item.weight), reps: number(item.reps), note: item.note || "", createdAt: item.createdAt || 0 });
  }
  return [...grouped.values()];
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      sessions: (Array.isArray(saved?.sessions) ? saved.sessions : migrateWorkouts(Array.isArray(saved?.workouts) ? saved.workouts : [])).map(session => ({ ...session, exercises: session.exercises.map(exercise => ({ ...exercise, group: exercise.group || inferGroup(exercise.name) })) })),
      food: Array.isArray(saved?.food) ? saved.food : [],
    };
  } catch { return { sessions: [], food: [] }; }
}
const data = loadData();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let selectedTemplate = null;
let restSeconds = Number(localStorage.getItem(REST_DURATION_KEY)) || 120;
let timerEnd = Number(localStorage.getItem(TIMER_KEY)) || 0;
let autoRest = localStorage.getItem(AUTO_REST_KEY) !== "false";
let selectedExercise = "";
let finishedSessionId = null;

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
  renderExerciseHistory();
  renderOverview();
  renderFinishSummary();
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
  if (sessionVolume(session) > 0) body.append(element("p", "history-volume", `Объём: ${formatNumber(sessionVolume(session))} кг`));
  for (const exercise of session.exercises) {
    const group = element("div", "history-exercise");
    const exerciseLink = element("button", "history-exercise-link", exercise.name);
    exerciseLink.type = "button";
    exerciseLink.addEventListener("click", () => openExercise(exercise.name));
    group.append(exerciseLink);
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
  return bestSet(exerciseHistory(data.sessions, name, currentSession.id).at(-1)?.sets || []);
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
  finish.addEventListener("click", () => {
    session.status = "done";
    session.completedAt = Date.now();
    finishedSessionId = session.id;
    save(); render();
    document.querySelector("#finish-summary").scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
    button.addEventListener("click", () => addExercise(session, name, inferGroup(name)));
    chips.append(button);
  }
  if (!available.length) chips.append(element("p", "form-help", "Все упражнения шаблона добавлены. Можно вписать своё ниже."));
  chooser.append(chips);
  const form = element("form", "custom-exercise-form");
  form.innerHTML = '<label>Своё упражнение или поиск по названию <input name="name" type="text" maxlength="80" list="exercise-options" placeholder="Например, становая тяга" required /></label><datalist id="exercise-options"></datalist><label>Группа мышц <select name="group"></select></label><button class="small-button" type="submit">Добавить упражнение</button>';
  const datalist = form.querySelector("datalist");
  for (const name of CATALOG) { const option = element("option"); option.value = name; datalist.append(option); }
  const groupSelect = form.elements.group;
  for (const group of GROUPS) { const option = element("option", "", group); option.value = group; groupSelect.append(option); }
  form.elements.name.addEventListener("input", () => { groupSelect.value = inferGroup(form.elements.name.value); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (name) addExercise(session, name, groupSelect.value);
  });
  chooser.append(form);
  target.append(chooser);

  const exerciseList = element("div", "active-exercises");
  for (const exercise of session.exercises) exerciseList.append(exerciseCard(session, exercise));
  target.append(exerciseList);
}

function addExercise(session, name, group = "Другое") {
  if (session.exercises.some(exercise => exercise.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))) return;
  session.exercises.push({ id: uid(), name, group, sets: [] });
  save(); render();
  document.querySelector("#active-session").scrollIntoView({ behavior: "smooth", block: "start" });
}

function exerciseCard(session, exercise) {
  const card = element("div", "exercise-card");
  const top = element("div", "exercise-card-head");
  const title = element("div");
  title.append(element("h4", "", exercise.name), element("span", "exercise-group-tag", exercise.group || inferGroup(exercise.name)));
  top.append(title);
  const historyButton = element("button", "text-button", "История ↗");
  historyButton.type = "button";
  historyButton.addEventListener("click", () => openExercise(exercise.name));
  top.append(historyButton);
  const remove = element("button", "delete-button", "×");
  remove.type = "button";
  remove.setAttribute("aria-label", `Удалить упражнение: ${exercise.name}`);
  remove.addEventListener("click", () => { session.exercises = session.exercises.filter(item => item.id !== exercise.id); save(); render(); });
  top.append(remove);
  card.append(top);
  const history = exerciseHistory(data.sessions, exercise.name, session.id);
  const previous = history.at(-1);
  const prior = previousSet(exercise.name, session);
  const goal = isRun(session) ? null : suggestedGoal(history);
  if (previous) card.append(element("p", "previous-set", `В прошлый раз (${formatDate(previous.date)}): ${previous.sets.map(set => setText(set, isRun(session))).join(" · ")}`));
  if (goal) card.append(element("p", "goal-hint", `Ориентир: ${setText(goal, false)}. ${goal.reason}`));
  const sets = element("div", "set-list");
  exercise.sets.forEach((set, index) => {
    const row = element("div", "set-row");
    row.append(element("span", "set-number", `${index + 1}`), element("strong", "", setText(set, isRun(session))));
    if (set.note) row.append(element("span", "effort-tag", set.note));
    const del = element("button", "delete-button", "×");
    del.type = "button";
    del.setAttribute("aria-label", `Удалить подход ${index + 1}`);
    del.addEventListener("click", () => { exercise.sets = exercise.sets.filter(item => item.id !== set.id); save(); render(); });
    row.append(del); sets.append(row);
  });
  if (!exercise.sets.length) sets.append(element("p", "form-help", "Подходов пока нет."));
  card.append(sets);
  const last = exercise.sets[exercise.sets.length - 1] || goal || prior;
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
  if (!isRun(session)) {
    const effort = element("label", "effort-label", "Ощущение");
    const select = element("select");
    select.name = "note";
    for (const note of ["", "легко", "нормально", "тяжело", "до отказа"]) {
      const option = element("option", "", note || "Не отмечать"); option.value = note; select.append(option);
    }
    effort.append(select); form.append(effort);
  }
  const submit = element("button", "small-button", "+ Подход");
  submit.type = "submit"; form.append(submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    exercise.sets.push({ id: uid(), weight: isRun(session) ? 0 : number(values.weight), reps: number(values.reps), note: values.note || "", createdAt: Date.now() });
    save(); render();
    if (autoRest && !isRun(session)) startTimer(restSeconds);
  });
  card.append(form);
  return card;
}

function openExercise(name) {
  selectedExercise = name;
  location.hash = "#training";
  renderExerciseHistory();
  requestAnimationFrame(() => document.querySelector("#exercise-select").scrollIntoView({ behavior: "smooth", block: "center" }));
}

function renderExerciseHistory() {
  const select = document.querySelector("#exercise-select");
  const names = [...new Map(data.sessions.flatMap(session => session.exercises.filter(exercise => exercise.sets.length).map(exercise => [exerciseKey(exercise.name), exercise.name]))).values()].sort((a, b) => a.localeCompare(b, "ru-RU"));
  select.replaceChildren(element("option", "", "Выбери упражнение"));
  select.firstChild.value = "";
  for (const name of names) { const option = element("option", "", name); option.value = name; select.append(option); }
  if (!names.some(name => exerciseKey(name) === exerciseKey(selectedExercise))) selectedExercise = "";
  select.value = selectedExercise;
  const target = document.querySelector("#exercise-detail");
  if (!selectedExercise) { empty(target, "Выбери упражнение, чтобы увидеть все подходы, рекорды и график."); return; }
  const history = exerciseHistory(data.sessions, selectedExercise);
  const last = history.at(-1);
  const maxWeight = Math.max(...history.map(item => item.topWeight), 0);
  const maxReps = Math.max(...history.flatMap(item => item.sets.filter(set => Number(set.weight) === maxWeight).map(set => Number(set.reps) || 0)), 0);
  const maxVolume = Math.max(...history.map(item => item.volume), 0);
  const maxEstimate = Math.max(...history.map(item => item.bestEstimate), 0);
  target.replaceChildren();
  const stats = element("div", "exercise-stats");
  for (const [label, value] of [
    ["Тренировок", String(history.length)],
    ["Макс. вес", maxWeight ? `${formatNumber(maxWeight)} кг` : "—"],
    ["Повторений с макс. весом", maxWeight ? String(maxReps) : "—"],
    ["Макс. объём за занятие", maxVolume ? `${formatNumber(maxVolume)} кг` : "—"],
    ["Расчётная сила", maxEstimate ? `${formatNumber(maxEstimate)} кг` : "—"],
  ]) {
    const box = element("div", "exercise-stat");
    box.append(element("span", "", label), element("strong", "", value));
    stats.append(box);
  }
  target.append(stats);
  if (history.length >= 2 && maxWeight > 0) target.append(buildExerciseChart(history));
  if (plateauDetected(history)) {
    const plateau = element("div", "plateau-note");
    plateau.append(element("strong", "", "Похоже на плато: последние 5 занятий без заметного роста расчётной силы."), element("p", "", "Можно обсудить с тренером временное снижение рабочего веса, другой диапазон повторений, облегчённую неделю или замену упражнения. Смотри также на технику, усилие и самочувствие."));
    target.append(plateau);
  }
  const list = element("div", "exercise-history-list");
  [...history].reverse().forEach((entry, reverseIndex) => {
    const previous = history.slice(0, history.length - reverseIndex - 1);
    const card = element("div", "exercise-history-row");
    const heading = element("div", "exercise-history-head");
    heading.append(element("strong", "", formatDate(entry.date)), element("span", "", entry.volume ? `Объём ${formatNumber(entry.volume)} кг` : entry.activity));
    card.append(heading, element("p", "", entry.sets.map((set, index) => `${index + 1}. ${setText(set, entry.activity === "Бег")}${set.note ? ` · ${set.note}` : ""}`).join("   ·   ")));
    const changes = recordChanges(entry, previous);
    if (changes.length) card.append(element("small", "record-tags", changes.join(" · ")));
    list.append(card);
  });
  target.append(list);
  const note = element("p", "form-help", "Расчётная сила — приблизительная оценка 1 повторения: вес × (1 + повторения / 30), только для подходов до 12 повторений. Сравнивай одинаковое упражнение и похожее усилие; цифра не заменяет реальное измерение.");
  target.append(note);
  if (last?.group && last.group !== "Другое") target.append(element("p", "form-help", `Основная группа: ${last.group}. Для упражнений с несколькими группами учитывается одна выбранная группа.`));
}

function buildExerciseChart(history) {
  const wrap = element("div", "chart-wrap");
  const legend = element("div", "chart-legend");
  legend.append(element("span", "legend-weight", "● Рабочий вес"), element("span", "legend-estimate", "● Расчётная сила"));
  wrap.append(legend);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 230");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `График прогресса: ${selectedExercise}. По горизонтали даты, по вертикали килограммы.`);
  const make = (tag, attributes, textValue) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (textValue !== undefined) node.textContent = textValue;
    svg.append(node);
    return node;
  };
  const maxValue = Math.max(1, ...history.map(item => item.topWeight), ...history.map(item => item.bestEstimate));
  const top = Math.ceil(maxValue / 10) * 10;
  const times = history.map(item => Date.parse(`${item.date}T12:00:00Z`));
  const minTime = Math.min(...times), maxTime = Math.max(...times);
  const x = (item, index) => maxTime === minTime ? 42 + index * 555 / Math.max(1, history.length - 1) : 42 + (Date.parse(`${item.date}T12:00:00Z`) - minTime) / (maxTime - minTime) * 555;
  const y = value => 182 - value / top * 145;
  for (let step = 0; step <= 4; step++) {
    const lineY = 182 - step * 145 / 4;
    make("line", { x1: 42, x2: 597, y1: lineY, y2: lineY, class: "chart-grid-line" });
    make("text", { x: 36, y: lineY + 4, class: "chart-axis-label", "text-anchor": "end" }, formatNumber(top * step / 4));
  }
  for (const [key, cssClass] of [["topWeight", "chart-weight"], ["bestEstimate", "chart-estimate"]]) {
    const points = history.map((item, index) => ({ item, index })).filter(({ item }) => item[key] > 0);
    if (points.length >= 2) make("polyline", { points: points.map(({ item, index }) => `${x(item, index)},${y(item[key])}`).join(" "), class: cssClass, fill: "none" });
    for (const { item, index } of points) {
      const dot = make("circle", { cx: x(item, index), cy: y(item[key]), r: 4, class: cssClass });
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${formatDate(item.date)}: ${formatNumber(item[key])} кг`;
      dot.append(title);
    }
  }
  for (const index of [...new Set([0, Math.floor((history.length - 1) / 2), history.length - 1])]) {
    make("text", { x: x(history[index], index), y: 207, class: "chart-axis-label", "text-anchor": index === 0 ? "start" : index === history.length - 1 ? "end" : "middle" }, formatDate(history[index].date));
  }
  wrap.append(svg);
  return wrap;
}

function renderProgress() {
  const target = document.querySelector("#progress-list");
  const names = [...new Map(data.sessions.flatMap(session => session.exercises.filter(exercise => exercise.sets.length).map(exercise => [exerciseKey(exercise.name), exercise.name]))).values()].sort((a, b) => a.localeCompare(b, "ru-RU"));
  if (!names.length) empty(target, "После нескольких тренировок здесь появятся изменения по упражнениям.");
  else target.replaceChildren(...names.map(name => {
    const history = exerciseHistory(data.sessions, name);
    const latest = history.at(-1);
    const prior = history.at(-2);
    const row = element("button", "progress-row progress-button");
    row.type = "button";
    const info = element("span", "progress-info");
    info.append(element("strong", "", name), element("span", "", prior ? `${formatDate(prior.date)} → ${formatDate(latest.date)}` : "Первая запись"));
    const change = prior && latest.topWeight && prior.topWeight ? latest.topWeight === prior.topWeight && latest.repsAtTopWeight > prior.repsAtTopWeight ? `+${latest.repsAtTopWeight - prior.repsAtTopWeight} повт.` : `${latest.topWeight > prior.topWeight ? "+" : ""}${formatNumber(latest.topWeight - prior.topWeight)} кг` : `${history.length} зан.`;
    row.append(info, element("b", latest.topWeight > (prior?.topWeight || 0) && prior ? "progress-positive" : "", change), element("span", "", "↗"));
    row.addEventListener("click", () => openExercise(name));
    return row;
  }));
  const groups = document.querySelector("#group-list");
  const overview = groupOverview(data.sessions, today());
  groups.replaceChildren();
  if (!overview.length) return;
  groups.append(element("h4", "group-heading", "Группы мышц и частота"));
  for (const item of overview) {
    const row = element("div", "group-row");
    const left = element("div");
    left.append(element("strong", "", item.group), element("span", "", item.daysSince === 0 ? "Тренировались сегодня" : item.daysSince === 1 ? "Последняя тренировка вчера" : `${item.daysSince} дн. с последней тренировки`));
    row.append(left, element("b", "", item.trend === null ? `${formatNumber(item.lastVolume)} кг в прошлый раз` : `${item.trend > 0 ? "+" : ""}${item.trend}% объёма за 8 недель`));
    groups.append(row);
  }
}

function summaryContent(target, session) {
  const summary = sessionSummary(session, data.sessions);
  target.replaceChildren();
  const title = summary.highlights.length ? session.date === today() ? "Сегодня ты стал сильнее!" : "В этой тренировке был прогресс!" : summary.records ? "Есть новые рекорды!" : "Тренировка записана";
  target.append(element("div", "eyebrow", "ИТОГ ТРЕНИРОВКИ"), element("h3", "", title));
  if (summary.highlights.length) {
    const list = element("ul", "summary-highlights");
    for (const text of summary.highlights.slice(0, 4)) list.append(element("li", "", text));
    target.append(list);
  } else target.append(element("p", "", "Каждая запись помогает увидеть изменения со временем. Продолжай в своём темпе."));
  const facts = element("div", "summary-facts");
  facts.append(element("span", "", `${summary.records} ${recordPhrase(summary.records)}`), element("span", "", `Объём: ${formatNumber(summary.volume)} кг`));
  if (summary.volumeChange !== null) facts.append(element("span", "", `К прошлому такому занятию: ${summary.volumeChange > 0 ? "+" : ""}${summary.volumeChange}% объёма`));
  target.append(facts);
  if (summary.volumeChange !== null && summary.volumeChange < 0 && summary.highlights.length) target.append(element("p", "summary-context", "Общий объём может быть ниже, когда записано меньше подходов. При этом отдельные результаты уже улучшились."));
}

function renderFinishSummary() {
  const target = document.querySelector("#finish-summary");
  const session = data.sessions.find(item => item.id === finishedSessionId);
  target.hidden = !session;
  if (session) summaryContent(target, session);
  else target.replaceChildren();
}

function renderOverview() {
  const completed = data.sessions.filter(session => session.status !== "active" && session.exercises.some(exercise => exercise.sets.length)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const latestSummary = document.querySelector("#latest-summary");
  const latest = completed.at(-1);
  latestSummary.hidden = !latest;
  if (latest) summaryContent(latestSummary, latest);
  else latestSummary.replaceChildren();
  const target = document.querySelector("#today-plan");
  target.replaceChildren();
  const current = activeSession();
  if (current) {
    target.append(element("h3", "", `Сейчас идёт: ${current.title}`), element("p", "", `${current.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} подходов записано.`));
    const link = element("a", "button button-dark today-action", "Продолжить тренировку ↗"); link.href = "#training"; target.append(link);
    return;
  }
  const byTemplate = new Map();
  for (const session of completed) if (session.templateId) byTemplate.set(session.templateId, session);
  const candidate = [...byTemplate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)[0] || latest;
  if (!candidate) { target.append(element("p", "", "Запиши тренировку, и здесь появится подсказка по следующему занятию.")); return; }
  const distance = dayDistance(candidate.date, today());
  target.append(element("h3", "", distance <= 1 ? "Сегодня можно уделить время восстановлению" : `Можно сегодня: ${candidate.title}`));
  target.append(element("p", "", distance === 0 ? "Последнее такое занятие было сегодня." : `Последнее такое занятие — ${distance} дн. назад.`));
  const prior = sessionSummary(candidate, data.sessions);
  if (prior.records) target.append(element("p", "today-records", `В прошлый раз: ${prior.records} ${recordPhrase(prior.records)}.`));
  const withGoal = candidate.exercises.find(exercise => exercise.sets.length && suggestedGoal(exerciseHistory(data.sessions, exercise.name)));
  if (withGoal && distance > 1) {
    const goal = suggestedGoal(exerciseHistory(data.sessions, withGoal.name));
    target.append(element("p", "today-goal", `Ориентир для ${withGoal.name}: ${setText(goal, candidate.activity === "Бег")}.`));
  }
  const button = element("button", "button button-dark today-action", distance <= 1 ? "Посмотреть тренировки ↗" : "Выбрать тренировку ↗");
  button.type = "button";
  button.addEventListener("click", () => {
    const template = TEMPLATES.find(item => item.id === candidate.templateId);
    if (template) {
      selectedTemplate = template;
      const form = document.querySelector("#session-form"); form.elements.title.value = template.title; form.elements.activity.value = template.activity; renderTemplates();
    } else document.querySelector("#session-form").elements.title.value = candidate.title;
    location.hash = "#training";
  });
  target.append(button);
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
  document.querySelector("#auto-rest").checked = autoRest;
}
function startTimer(seconds) {
  restSeconds = seconds;
  timerEnd = Date.now() + seconds * 1000;
  localStorage.setItem(REST_DURATION_KEY, String(seconds));
  localStorage.setItem(TIMER_KEY, String(timerEnd));
  renderTimer();
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
document.querySelector("#exercise-select").addEventListener("change", event => { selectedExercise = event.currentTarget.value; renderExerciseHistory(); });
document.querySelector("#auto-rest").addEventListener("change", event => { autoRest = event.currentTarget.checked; localStorage.setItem(AUTO_REST_KEY, String(autoRest)); });
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
  startTimer(Number(button.dataset.timerStart));
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
