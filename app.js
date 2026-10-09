import { initProgression, renderProgression } from "./progression.mjs?v=1";
import { initNutrition, renderNutritionDiary } from "./nutrition.mjs?v=1";
import { GROUPS, exerciseKey, exerciseHistory, sessionVolume, groupOverview, suggestedGoal, recordChanges, sessionSummary, plateauDetected, estimatedMax, bestSet, dayDistance, repeatWorkoutCandidate } from "./metrics.mjs?v=5";

const STORAGE_KEY = "temp-health-v1";
const TIMER_KEY = "temp-rest-timer-v1";
const REST_DURATION_KEY = "temp-rest-duration-v1";
const AUTO_REST_KEY = "temp-auto-rest-v1";
const TEMPLATES = [
  { id: "legs", title: "День ног", activity: "Силовая", exercises: ["Жим ногами", "Разгибание ног", "Сгибание ног", "Румынская тяга", "Икры"] },
  { id: "back", title: "Спина и бицепс", activity: "Силовая", exercises: ["Тяга верхнего блока", "Тяга штанги в наклоне", "Горизонтальная тяга", "Подтягивания", "Сгибание рук с гантелями"] },
  { id: "chest", title: "Грудь и трицепс", activity: "Силовая", exercises: ["Жим лёжа", "Жим гантелей лёжа", "Разведение гантелей", "Отжимания", "Разгибание рук на блоке"] },
  { id: "shoulders", title: "Плечи", activity: "Силовая", exercises: ["Жим гантелей сидя", "Махи гантелями в стороны", "Обратная бабочка", "Тяга к подбородку"] },
  { id: "full", title: "Всё тело", activity: "Силовая", exercises: ["Приседания", "Жим лёжа", "Тяга верхнего блока", "Планка"] },
  { id: "run", title: "Пробежка", activity: "Бег", exercises: ["Лёгкий бег", "Интервальный бег", "Ходьба"] },
];
// The knowledge library is the single source for guided exercise choices.
const LIBRARY_GROUPS = { legs: "Ноги", glutes: "Ягодицы", back: "Спина", chest: "Грудь", shoulders: "Плечи", arms: "Руки", core: "Кор" };
const EXERCISE_LIBRARY = Object.entries(LIBRARY_GROUPS).flatMap(([id, group]) =>
  [...document.querySelectorAll("#muscle-" + id + " .exercise-guide h4")].map(node => ({ name: node.textContent.trim(), group, muscles: node.parentElement.querySelector("p")?.textContent || "" }))
);
const CUSTOM_EXERCISES_KEY = "temp-custom-exercises-v1";
const customExercises = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_EXERCISES_KEY) || "[]");
    const seen = new Set(EXERCISE_LIBRARY.map(entry => exerciseKey(entry.name)));
    return (Array.isArray(saved) ? saved : []).filter(entry => {
      if (!entry || typeof entry.name !== "string" || !entry.name.trim() || !Object.values(LIBRARY_GROUPS).includes(entry.group)) return false;
      const key = exerciseKey(entry.name); if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(entry => ({ ...entry, name: entry.name.trim().slice(0, 80), description: String(entry.description || "").slice(0, 2000) }));
  } catch { return []; }
})();
EXERCISE_LIBRARY.push(...customExercises);
const CATALOG = [...new Set([...EXERCISE_LIBRARY.map(exercise => exercise.name), ...TEMPLATES.flatMap(template => template.exercises), "Приседания со штангой", "Выпады с гантелями", "Подъёмы на носки", "Молотковые сгибания", "Французский жим", "Становая тяга"])];
const FLOW_GROUPS = ["Грудь", "Спина", "Ноги", "Ягодицы", "Плечи", "Руки", "Кор", "Всё тело", "Своя тренировка"];
const FLOW_DEFAULTS = {
  "Грудь": ["Жим лёжа", "Жим гантелей лёжа", "Разведение гантелей", "Отжимания"],
  "Спина": ["Тяга верхнего блока", "Тяга штанги в наклоне", "Горизонтальная тяга", "Подтягивания"],
  "Ноги": ["Жим ногами", "Разгибание ног", "Сгибание ног", "Румынская тяга", "Икры"],
  "Плечи": ["Жим гантелей сидя", "Махи гантелями в стороны", "Обратная бабочка"],
  "Руки": ["Сгибание рук с гантелями", "Разгибание рук на блоке", "Молотковые сгибания", "Французский жим"],
  "Всё тело": ["Приседания", "Жим лёжа", "Тяга верхнего блока", "Планка"],
  "Своя тренировка": [],
};
FLOW_DEFAULTS["Ягодицы"] = EXERCISE_LIBRARY.filter(entry => entry.group === "Ягодицы").map(entry => entry.name);
FLOW_DEFAULTS["Кор"] = EXERCISE_LIBRARY.filter(entry => entry.group === "Кор").map(entry => entry.name);
const GROUP_BY_EXERCISE = new Map([
  ...TEMPLATES[0].exercises.map(name => [exerciseKey(name), "Ноги"]),
  ...TEMPLATES[1].exercises.map(name => [exerciseKey(name), name.includes("Сгибание рук") ? "Руки" : "Спина"]),
  ...TEMPLATES[2].exercises.map(name => [exerciseKey(name), name.includes("Разгибание рук") ? "Руки" : "Грудь"]),
  ...TEMPLATES[3].exercises.map(name => [exerciseKey(name), "Плечи"]),
  [exerciseKey("Приседания"), "Ноги"], [exerciseKey("Планка"), "Кор"],
  [exerciseKey("Приседания со штангой"), "Ноги"], [exerciseKey("Выпады с гантелями"), "Ноги"],
  [exerciseKey("Подъёмы на носки"), "Ноги"], [exerciseKey("Молотковые сгибания"), "Руки"],
  [exerciseKey("Французский жим"), "Руки"], [exerciseKey("Становая тяга"), "Спина"],
]);
for (const exercise of EXERCISE_LIBRARY) GROUP_BY_EXERCISE.set(exerciseKey(exercise.name), exercise.group);
const inferGroup = name => GROUP_BY_EXERCISE.get(exerciseKey(name)) || "Другое";
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const number = value => Number(String(value ?? "").trim().replace(",", ".")) || 0;
const formatNumber = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const recordWord = count => count % 10 === 1 && count % 100 !== 11 ? "тренировка" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "тренировки" : "тренировок";
const exerciseWord = count => count % 10 === 1 && count % 100 !== 11 ? "упражнение" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "упражнения" : "упражнений";
const setWord = count => count % 10 === 1 && count % 100 !== 11 ? "подход" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "подхода" : "подходов";
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
      plans: Array.isArray(saved?.plans) ? saved.plans : [],
    };
  } catch { return { sessions: [], food: [], plans: [] }; }
}
const data = loadData();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let workoutEdit = null;
let recordWizard = null;
let calendarDate = today();
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let selectedTemplate = null;
let restSeconds = Number(localStorage.getItem(REST_DURATION_KEY)) || 120;
let timerEnd = Number(localStorage.getItem(TIMER_KEY)) || 0;
let autoRest = localStorage.getItem(AUTO_REST_KEY) !== "false";
let selectedExercise = "";
let finishedSessionId = null;
let flowDraft = { step: 1, group: null, title: "", activity: "Силовая", exercises: [], replacingIndex: null };
let resultSessionId = null;
let liveRestSeconds = Number(localStorage.getItem("temp-live-rest-seconds-v1")) || 90;
let liveRest = (() => { try { return JSON.parse(localStorage.getItem("temp-live-rest-v1")); } catch { return null; } })();

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
function setText(set, run) { return run ? `${formatNumber(set.reps)} мин` : `${set.weight == null ? "вес не указан" : formatNumber(set.weight) + " кг"} × ${set.reps == null ? "повторы не указаны" : formatNumber(set.reps)}`; }

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
  const title = element("span", "session-row-title");
  title.append(element("strong", "", session.title), element("small", "", `${formatDate(session.date)} · ${session.status === "active" ? "идёт сейчас" : session.activity}`));
  const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  summary.append(title, element("b", "", `${setCount} подх.`));
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
    if (exercise.comment) group.append(element("p", "workout-comment", `К упражнению: ${exercise.comment}`));
    exercise.sets.forEach((set, index) => {
      if (set.comment) group.append(element("p", "workout-comment", `Подход ${index + 1}: ${set.comment}`));
    });
    group.append(element("span", "", exercise.sets.map((set, index) => `${index + 1}. ${setText(set, isRun(session))}${set.note ? ` · ${set.note}` : ""}`).join("  ·  ") || "Нет подходов"));
    body.append(group);
  }
  const edit = element("button", "small-button history-edit", "Изменить тренировку");
  edit.type = "button"; edit.addEventListener("click", () => openWorkoutEditor("session", session, session.date, location.hash));
  body.append(edit);
  if (removable) {
    const button = element("button", "text-button danger", "Удалить тренировку");
    button.type = "button";
    button.addEventListener("click", () => deleteWorkout(session));
    body.append(button);
  }
  details.append(body);
  return removable ? swipeWorkoutRow(details, session) : details;
}

function deleteWorkout(session) {
  if (!confirm(`Удалить тренировку «${session.title}» со всеми подходами?`)) return;
  if (session.status === "active") {
    clearLiveRest();
    timerEnd = 0; localStorage.removeItem(TIMER_KEY);
    document.querySelector("#live-confirm").hidden = true;
  }
  if (resultSessionId === session.id) resultSessionId = null;
  if (finishedSessionId === session.id) finishedSessionId = null;
  data.sessions = data.sessions.filter(item => item.id !== session.id);
  save(); render();
}
function swipeWorkoutRow(details, session) {
  const row = element("div", "workout-swipe-row");
  const remove = element("button", "workout-swipe-delete", "Удалить");
  remove.type = "button";
  remove.setAttribute("aria-label", `Удалить тренировку «${session.title}»`);
  remove.disabled = true; remove.tabIndex = -1;
  remove.addEventListener("click", () => deleteWorkout(session));
  row.append(remove, details);
  const width = 96;
  let opened = false, pointer = null, startX = 0, startY = 0, startOffset = 0;
  let offset = 0, horizontal = false, suppressClick = false;
  function position(value, animate = false) {
    offset = Math.max(-width, Math.min(0, value));
    details.style.transition = animate ? "" : "none";
    details.style.transform = `translateX(${offset}px)`;
  }
  function reveal(value) {
    opened = value;
    row.classList.toggle("swipe-open", value);
    position(value ? -width : 0, true);
    remove.disabled = !value; remove.tabIndex = value ? 0 : -1;
  }
  row.addEventListener("close-workout-swipe", () => reveal(false));
  details.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" || !event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId; startX = event.clientX; startY = event.clientY;
    startOffset = opened ? -width : 0; horizontal = false; suppressClick = false;
  });
  details.addEventListener("pointermove", event => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (!horizontal) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { pointer = null; return; }
      if (Math.abs(dx) < 10) return;
      horizontal = true;
      details.setPointerCapture(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    suppressClick = true;
    position(startOffset + dx);
  });
  details.addEventListener("pointerup", event => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (!horizontal) return;
    const show = offset < -width * 0.4;
    if (show) document.querySelectorAll(".workout-swipe-row").forEach(other => {
      if (other !== row) other.dispatchEvent(new Event("close-workout-swipe"));
    });
    reveal(show);
  });
  details.addEventListener("pointercancel", () => { pointer = null; reveal(opened); });
  details.addEventListener("click", event => {
    if (suppressClick || opened) {
      event.preventDefault(); event.stopPropagation();
      if (!suppressClick) reveal(false);
      suppressClick = false;
    }
  }, true);
  row.addEventListener("keydown", event => {
    if (event.key === "Escape") { reveal(false); details.querySelector("summary").focus(); }
  });
  return row;
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
  const historyButton = element("button", "text-button", "История");
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
    configureWeightInput(input); weight.append(input); form.append(weight);
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
    exercise.completed = false;
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
    if (entry.comment) card.append(element("p", "workout-comment", `К упражнению: ${entry.comment}`));
    entry.sets.forEach((set, index) => {
      if (set.comment) card.append(element("p", "workout-comment", `Подход ${index + 1}: ${set.comment}`));
    });
    const changes = recordChanges(entry, previous);
    if (changes.length) card.append(element("small", "record-tags", changes.join(" · ")));
    const edit = element("button", "small-button", "Изменить тренировку"); edit.type = "button";
    edit.addEventListener("click", () => {
      const session = data.sessions.find(item => item.id === entry.sessionId);
      if (session) openWorkoutEditor("session", session, session.date, "#training");
    });
    card.append(edit); list.append(card);
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
    row.append(info, element("b", latest.topWeight > (prior?.topWeight || 0) && prior ? "progress-positive" : "", change));
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
    const count = current.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    target.append(element("h3", "", `Сейчас идёт: ${current.title}`), element("p", "", `Записано ${count} ${setWord(count)}.`));
    const link = element("a", "button button-dark today-action", "Продолжить тренировку"); link.href = "#workout-live"; target.append(link);
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
  const button = element("button", "button button-dark today-action", distance <= 1 ? "Посмотреть тренировки" : "Выбрать тренировку");
  button.type = "button";
  button.addEventListener("click", () => distance <= 1 ? location.hash = "#training" : openFlow(focusGroup(candidate)));
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
  renderNutritionDiary(selectedFood);
}

function completedSessions() {
  return data.sessions.filter(session => session.status !== "active" && session.exercises.some(exercise => exercise.sets.length)).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}
function focusGroup(session) {
  if (session.focusGroup) return session.focusGroup;
  const byTemplate = { legs: "Ноги", back: "Спина", chest: "Грудь", shoulders: "Плечи", full: "Всё тело" };
  if (byTemplate[session.templateId]) return byTemplate[session.templateId];
  const title = exerciseKey(session.title);
  if (title.includes("ног")) return "Ноги";
  if (title.includes("груд") || title.includes("трицепс")) return "Грудь";
  if (title.includes("спин") || title.includes("бицепс")) return "Спина";
  if (title.includes("плеч")) return "Плечи";
  if (title.includes("рук")) return "Руки";
  if (title.includes("тело")) return "Всё тело";
  const counts = new Map();
  for (const exercise of session.exercises) {
    const group = exercise.group || inferGroup(exercise.name);
    if (group !== "Другое") counts.set(group, (counts.get(group) || 0) + 1);
  }
  const most = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return FLOW_GROUPS.includes(most) ? most : "Своя тренировка";
}
function lastGroupWorkout(group) { return completedSessions().filter(session => focusGroup(session) === group).at(-1) || null; }
function repeatCandidate() { return repeatWorkoutCandidate(data.sessions, focusGroup); }
function lastExerciseEntry(name) { return exerciseHistory(data.sessions, name).at(-1) || null; }
function previousResult(name) {
  const entry = lastExerciseEntry(name);
  return entry ? bestSet(entry.sets) : null;
}
function goalLabel(goal) {
  if (!goal) return "";
  if (goal.reason?.startsWith("Повтори результат")) return `${formatNumber(goal.weight)} кг × ${formatNumber(goal.reps)}`;
  const end = goal.reps + (goal.reps >= 13 ? 2 : 1);
  return `${formatNumber(goal.weight)} кг × ${formatNumber(goal.reps)}–${formatNumber(end)}`;
}
function daysAgo(date) {
  const days = dayDistance(date, today());
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${days % 10 === 1 && days % 100 !== 11 ? "день" : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? "дня" : "дней"} назад`;
}
function renderHero() {
  const button = document.querySelector("#hero-start");
  const secondary = document.querySelector("#hero-new");
  const current = activeSession();
  const repeat = current ? null : repeatCandidate();
  const genitive = { "Грудь": "груди", "Спина": "спины", "Ноги": "ног", "Плечи": "плеч", "Руки": "рук", "Всё тело": "всего тела", "Своя тренировка": "свою тренировку" };
  const label = current ? "Продолжить тренировку" : repeat ? focusGroup(repeat) === "Своя тренировка" ? "Повторить последнюю тренировку" : `Повторить последнюю тренировку ${genitive[focusGroup(repeat)]}` : "Начать тренировку";
  const icon = document.querySelector(".overview-focus-icon svg").cloneNode(true);
  const title = element("span", "", label);
  button.replaceChildren(icon, title, element("span", "start-arrow", "→"));
  const completed = data.sessions.filter(session => session.status === "done" && session.exercises.some(exercise => exercise.sets.length)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const scheduled = data.plans.find(plan => plan.date === today());
  const candidate = current || scheduled || repeat || completed.at(-1);
  const group = candidate ? focusGroup(candidate) : null;
  document.querySelector("#overview-focus-name").textContent = scheduled && !current ? scheduled.title : group && group !== "Своя тренировка" ? group : candidate?.title || "Твой старт";
  document.querySelector("#overview-focus-caption").textContent = current ? "ТРЕНИРОВКА ИДЁТ" : scheduled ? "ПЛАН НА СЕГОДНЯ" : "СЕГОДНЯ";
  const previous = completed.filter(session => focusGroup(session) === group).at(-1);
  document.querySelector("#overview-focus-last").textContent = previous ? `Последняя: ${daysAgo(previous.date)}` : current ? "Продолжай в своём темпе" : scheduled ? "Упражнения можно уточнить перед стартом" : "Начни с первой тренировки";
  button.href = current ? "#workout-live" : repeat ? "#workout-live" : "#workout-flow";
  secondary.hidden = !repeat;
  const trainingButton = document.querySelector("#training-start");
  trainingButton.replaceChildren(document.createTextNode(current ? "Продолжить тренировку " : "Начать тренировку "));
}
function openFlow(group = null) {
  if (activeSession()) { location.hash = "#workout-live"; return; }
  flowDraft = { step: 1, group: null, title: "", activity: "Силовая", exercises: [], replacingIndex: null };
  if (group) chooseFlowGroup(group);
  renderFlow();
  location.hash = "#workout-flow";
}
function chooseFlowGroup(group) {
  const previous = lastGroupWorkout(group);
  flowDraft.group = group;
  flowDraft.title = group;
  flowDraft.activity = previous?.activity || "Силовая";
  flowDraft.replacingIndex = null;
  flowDraft.exercises = previous ? previous.exercises.map(exercise => ({ name: exercise.name, group: exercise.group || inferGroup(exercise.name), plannedSets: exercise.sets.length || exercise.plannedSets || 3, plannedTargets: workoutTargets(exercise) })) : (FLOW_DEFAULTS[group] || []).map(name => ({ name, group: inferGroup(name) === "Другое" ? group : inferGroup(name), plannedSets: 3 }));
}
function createExerciseDatalist() {
  const list = element("datalist"); list.id = "flow-exercise-options";
  for (const name of CATALOG) { const option = element("option"); option.value = name; list.append(option); }
  return list;
}
function groupSelect(selected) {
  const select = element("select"); select.name = "group";
  for (const group of [...GROUPS, "Ягодицы"].filter((value, index, all) => all.indexOf(value) === index)) {
    const option = element("option", "", group === "Кор" ? "Пресс и корпус" : group);
    option.value = group; select.append(option);
  }
  select.value = [...GROUPS, "Ягодицы"].includes(selected) ? selected : "Другое";
  return select;
}
function exercisePicker(selectedGroup, current = null, nameField = "name", excluded = []) {
  const nameLabel = element("label", "exercise-picker-label", "Упражнение");
  const select = element("select"); select.name = "exerciseChoice"; select.required = true;
  const name = element("input"); name.name = nameField; name.maxLength = 80;
  name.placeholder = "Название своего упражнения";
  name.setAttribute("aria-label", "Название своего упражнения");
  const groupLabel = element("label", "", "Группа мышц");
  const group = groupSelect(current?.group || selectedGroup); groupLabel.append(group);
  function sync() {
    const custom = select.value === "__custom";
    name.hidden = !custom; name.required = custom;
    if (!custom) name.value = select.value;
    name.setCustomValidity("");
  }
  function options(initial = null) {
    select.replaceChildren();
    const placeholder = element("option", "", "Выбери упражнение"); placeholder.value = "";
    select.append(placeholder);
    const entries = EXERCISE_LIBRARY.filter(entry => entry.group === group.value);
    for (const entry of entries) {
      const option = element("option", "", entry.name); option.value = entry.name;
      option.disabled = excluded.some(value => exerciseKey(value) === exerciseKey(entry.name));
      select.append(option);
    }
    const custom = element("option", "", "Другое — своё упражнение"); custom.value = "__custom"; select.append(custom);
    select.value = initial && entries.some(entry => entry.name === initial) ? initial : initial ? "__custom" : "";
    sync();
    if (select.value === "__custom") name.value = initial || "";
  }
  group.addEventListener("change", () => options());
  select.addEventListener("focus", () => {
    const selected = select.value, customName = name.value;
    options(selected === "__custom" ? customName || null : selected || null);
    if (selected === "__custom") { select.value = "__custom"; sync(); name.value = customName; }
  });
  select.addEventListener("change", () => { name.value = ""; sync(); if (select.value === "__custom") name.focus(); });
  name.addEventListener("input", () => name.setCustomValidity(name.value.trim() ? "" : "Укажи название упражнения."));
  nameLabel.append(select, name);
  options(current?.name);
  return { nameLabel, groupLabel, name, group, select };
}
function exerciseEditorForm(current = null, onSave) {
  const form = element("form", "flow-exercise-form");
  const picker = exercisePicker(flowDraft.group, current, "name",
    flowDraft.exercises.filter((entry, index) => index !== flowDraft.replacingIndex).map(entry => entry.name));
  const submit = element("button", "small-button", current ? "Заменить" : "Добавить"); submit.type = "submit";
  form.append(picker.nameLabel, picker.groupLabel, submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const value = picker.name.value.trim();
    if (!value || flowDraft.exercises.some((exercise, index) => exerciseKey(exercise.name) === exerciseKey(value) && index !== flowDraft.replacingIndex)) {
      picker.name.setCustomValidity("Это упражнение уже есть в тренировке."); picker.name.hidden = false; picker.name.reportValidity(); return;
    }
    onSave({ name: value, group: picker.group.value, plannedSets: current?.plannedSets || 3, plannedTargets: current?.plannedTargets });
    renderFlow();
  });
  return form;
}
function workoutTargets(exercise) {
  return (exercise.sets?.length ? exercise.sets : exercise.plannedTargets || []).map(set => ({ weight: set.weight ?? "", reps: set.reps || "" }));
}
function compactSetEditor(getSets, replaceSets, running = false) {
  const box = element("div", "compact-set-editor");
  const quick = element("div", "compact-set-fields");
  const inputs = {};
  for (const [key, caption] of [["count", running ? "Отрезки" : "Подходы"], ["weight", "Вес, кг"], ["reps", running ? "Минуты" : "Повторы"]]) {
    const label = element("label", "", caption);
    const input = element("input"); input.type = "number"; input.className = `quick-${key}`;
    input.min = key === "weight" ? "0" : "1"; input.max = key === "count" ? "100" : key === "weight" ? "1000" : "10000";
    input.step = key === "weight" || running && key === "reps" ? "any" : "1";
    if (key === "weight") configureWeightInput(input);
    input.placeholder = key === "count" ? "3" : "—";
    label.append(input); quick.append(label); inputs[key] = input;
    if (running && key === "weight") label.hidden = true;
    input.addEventListener("input", () => {
      if (key === "count" && !input.value || !input.checkValidity()) return;
      let sets = getSets();
      if (key === "count") {
        const count = Number(input.value);
        sets = Array.from({ length: count }, (_, i) => sets[i] || { ...sets.at(-1), id: undefined, comment: "", note: "" });
      } else sets = sets.map(set => ({ ...set, [key]: input.value }));
      replaceSets(sets); sync(key);
    });
  }
  const detail = element("details", "compact-set-details");
  detail.append(element("summary", "", "По подходам"));
  function sync(skip = null) {
    const sets = getSets();
    if (skip !== "count") inputs.count.value = sets.length;
    for (const key of ["weight", "reps"]) if (skip !== key) {
      const same = sets.every(set => String(set[key] ?? "") === String(sets[0]?.[key] ?? ""));
      inputs[key].value = same ? sets[0]?.[key] ?? "" : "";
      inputs[key].placeholder = same ? "—" : "Разные";
    }
    detail.querySelector("summary").textContent = running ? "По отрезкам" : "По подходам";
  }
  box.addEventListener("invalid", () => { detail.open = true; }, true);
  box.append(quick, detail); box.sync = sync; box.inputs = inputs; sync();
  return box;
}
function flowSetEditor(exercise) {
  if (!exercise.plannedTargets?.length) exercise.plannedTargets = Array.from({ length: exercise.plannedSets || 3 }, () => ({ weight: "", reps: "" }));
  let editor;
  const draw = () => {
    const body = editor.querySelector(".compact-set-details");
    body.querySelectorAll(".compact-target-row").forEach(row => row.remove());
    exercise.plannedTargets.forEach((set, index) => {
      const row = element("div", "compact-target-row"); row.append(element("span", "", `${index + 1}`));
      for (const key of flowDraft.activity === "Бег" ? ["reps"] : ["weight", "reps"]) {
        const input = element("input"); input.type = "number"; input.className = `target-${key}`;
        input.setAttribute("aria-label", `${key === "weight" ? "Вес" : "Повторения"}, подход ${index + 1}`);
        input.min = key === "weight" ? "0" : "1"; input.max = key === "weight" ? "1000" : "10000"; input.step = key === "weight" ? "any" : "1";
        if (key === "weight") configureWeightInput(input);
        input.value = set[key]; input.placeholder = key === "weight" ? "кг" : "повт.";
        input.addEventListener("input", () => { set[key] = input.value; editor.sync(); }); row.append(input);
      }
      body.append(row);
    });
  };
  editor = compactSetEditor(() => exercise.plannedTargets, sets => { exercise.plannedTargets = sets; exercise.plannedSets = sets.length; draw(); }, flowDraft.activity === "Бег");
  draw(); return editor;
}
function renderFlow() {
  const target = document.querySelector("#flow-content");
  const next = document.querySelector("#flow-next");
  document.querySelector("#flow-counter").textContent = `Шаг ${flowDraft.step} из 3`;
  document.querySelector("#flow-progress-fill").style.width = `${flowDraft.step / 3 * 100}%`;
  document.querySelector("#flow-back").textContent = flowDraft.step === 1 ? "К обзору" : "Назад";
  next.replaceChildren(document.createTextNode(flowDraft.step === 3 ? "Начать тренировку " : "Далее "));
  next.disabled = flowDraft.step === 1 ? !flowDraft.group : flowDraft.exercises.length === 0 || !flowDraft.title.trim();
  target.replaceChildren();
  if (flowDraft.step === 1) {
    target.append(element("div", "eyebrow", "ШАГ 1 / 3"), element("h2", "flow-title", "Что тренируем сегодня?"), element("p", "flow-subtitle", "Выбери направление. Следующий экран уже вспомнит твою последнюю тренировку."));
    const grid = element("div", "flow-group-grid");
    for (const group of FLOW_GROUPS) {
      const button = element("button", `flow-group-card${flowDraft.group === group ? " selected" : ""}`);
      button.type = "button";
      button.append(element("strong", "", group));
      const previous = lastGroupWorkout(group);
      if (previous) button.append(element("span", "", `Последняя тренировка ${daysAgo(previous.date)}`));
      else button.append(element("span", "", group === "Своя тренировка" ? "Собери свой вариант" : "Готовый набор упражнений"));
      button.addEventListener("click", () => { chooseFlowGroup(group); renderFlow(); });
      grid.append(button);
    }
    target.append(grid);
    return;
  }
  if (flowDraft.step === 2) {
    target.append(element("div", "eyebrow", "ШАГ 2 / 3"), element("h2", "flow-title", "Упражнения на сегодня"), element("p", "flow-subtitle", `Выбрано: ${flowDraft.group}. Порядок и состав можно поменять перед стартом.`));
    if (flowDraft.group === "Своя тренировка") {
      const label = element("label", "flow-name-label", "Название тренировки");
      const input = element("input"); input.type = "text"; input.maxLength = 80; input.value = flowDraft.title; input.addEventListener("input", () => { flowDraft.title = input.value; next.disabled = !flowDraft.exercises.length || !flowDraft.title.trim(); });
      label.append(input); target.append(label);
      const activityLabel = element("label", "flow-name-label", "Вид активности");
      const activity = element("select");
      for (const value of ["Силовая", "Кроссфит", "Бег", "Другая"]) { const option = element("option", "", value); option.value = value; activity.append(option); }
      activity.value = flowDraft.activity;
      activity.addEventListener("change", () => { flowDraft.activity = activity.value; renderFlow(); });
      activityLabel.append(activity); target.append(activityLabel);
    }
    const list = element("div", "flow-exercise-list");
    flowDraft.exercises.forEach((exercise, index) => {
      const card = element("div", "flow-exercise-row");
      const numberTag = element("span", "flow-exercise-number", `${index + 1}`);
      const textBox = element("div", "flow-exercise-text");
      textBox.append(element("strong", "", exercise.name));
      const previous = previousResult(exercise.name);
      textBox.append(element("span", "", previous ? `Прошлый результат: ${setText(previous, flowDraft.activity === "Бег")}` : "Первое занятие"));
      const controls = element("div", "flow-exercise-controls");
      const up = element("button", "icon-button", "↑"); up.type = "button"; up.disabled = index === 0; up.setAttribute("aria-label", `Поднять ${exercise.name}`); up.addEventListener("click", () => { [flowDraft.exercises[index - 1], flowDraft.exercises[index]] = [flowDraft.exercises[index], flowDraft.exercises[index - 1]]; renderFlow(); });
      const down = element("button", "icon-button", "↓"); down.type = "button"; down.disabled = index === flowDraft.exercises.length - 1; down.setAttribute("aria-label", `Опустить ${exercise.name}`); down.addEventListener("click", () => { [flowDraft.exercises[index + 1], flowDraft.exercises[index]] = [flowDraft.exercises[index], flowDraft.exercises[index + 1]]; renderFlow(); });
      const replace = element("button", "text-button", "Заменить"); replace.type = "button"; replace.addEventListener("click", () => { flowDraft.replacingIndex = flowDraft.replacingIndex === index ? null : index; renderFlow(); });
      const remove = element("button", "text-button danger", "Удалить"); remove.type = "button"; remove.addEventListener("click", () => { flowDraft.exercises.splice(index, 1); flowDraft.replacingIndex = null; renderFlow(); });
      const menu = element("details", "exercise-actions-menu");
      const menuTitle = element("summary", "", "⋯"); menuTitle.setAttribute("aria-label", `Действия: ${exercise.name}`);
      controls.append(up, down, replace, remove); menu.append(menuTitle, controls);
      card.append(numberTag, textBox, menu, flowSetEditor(exercise));
      if (flowDraft.replacingIndex === index) card.append(exerciseEditorForm(exercise, value => { flowDraft.exercises[index] = value; flowDraft.replacingIndex = null; }));
      list.append(card);
    });
    if (!flowDraft.exercises.length) list.append(element("p", "flow-empty", "Добавь хотя бы одно упражнение. Можно выбрать готовое название или вписать своё."));
    target.append(list, createExerciseDatalist(), exerciseEditorForm(null, value => flowDraft.exercises.push(value)));
    return;
  }
  target.append(element("div", "eyebrow", "ШАГ 3 / 3"), element("h2", "flow-title", "План на сегодня"), element("p", "flow-subtitle", `${flowDraft.title} · ${flowDraft.exercises.length} ${exerciseWord(flowDraft.exercises.length)}. Ориентиры можно изменить прямо во время тренировки.`));
  const plan = element("div", "flow-plan-list");
  for (const exercise of flowDraft.exercises) {
    const card = element("div", "flow-plan-card");
    card.append(element("strong", "", exercise.name), element("small", "", `${exercise.plannedSets} подхода · план`));
    const targets = workoutTargets(exercise);
    if (targets.some(set => set.weight !== "" || set.reps !== "")) card.append(element("p", "", targets.map((set, i) => `${i + 1}: ${set.weight !== "" ? set.weight + " кг" : "вес не указан"}${set.reps ? " × " + set.reps : ""}`).join(" · ")));
    const previous = previousResult(exercise.name);
    if (previous) card.append(element("p", "", `Прошлый раз: ${setText(previous, flowDraft.activity === "Бег")}`));
    const goal = suggestedGoal(exerciseHistory(data.sessions, exercise.name));
    if (goal && previous?.weight > 0 && flowDraft.activity !== "Бег") card.append(element("p", "flow-goal", `Сегодня можно попробовать: ${goalLabel(goal)}`));
    plan.append(card);
  }
  target.append(plan);
}
function flowNext() {
  if (flowDraft.step === 1 && flowDraft.group) { flowDraft.step = 2; renderFlow(); window.scrollTo(0, 0); }
  else if (flowDraft.step === 2 && flowDraft.exercises.length && flowDraft.title.trim()) { if ([...document.querySelectorAll("#flow-content input")].some(input => !input.reportValidity())) return; flowDraft.step = 3; renderFlow(); window.scrollTo(0, 0); }
  else if (flowDraft.step === 3) startFlowSession();
}
function startFlowSession(source = null) {
  if (activeSession()) { location.hash = "#workout-live"; return; }
  const group = source ? focusGroup(source) : flowDraft.group;
  const exercises = source ? source.exercises.map(exercise => ({ name: exercise.name, group: exercise.group || inferGroup(exercise.name), plannedSets: exercise.sets.length || exercise.plannedSets || 3, plannedTargets: workoutTargets(exercise) })) : flowDraft.exercises;
  if (!exercises.length) return;
  const startedAt = Date.now();
  const session = { id: uid(), date: today(), title: source ? source.title : flowDraft.title.trim(), activity: source?.activity || flowDraft.activity, focusGroup: group, templateId: source?.templateId || ({ "Грудь": "chest", "Спина": "back", "Ноги": "legs", "Плечи": "shoulders", "Руки": "arms", "Всё тело": "full" })[group] || "", status: "active", createdAt: startedAt, startedAt, exercises: exercises.map(exercise => ({ id: uid(), name: exercise.name, group: exercise.group, plannedSets: exercise.plannedSets || 3, plannedTargets: workoutTargets(exercise), sets: [] })) };
  session.currentExerciseId = session.exercises[0].id;
  data.sessions.push(session);
  clearLiveRest();
  save(); render(); location.hash = "#workout-live";
}
function liveSession() { return activeSession(); }
function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateLiveDuration() {
  const session = liveSession();
  const label = document.querySelector("#live-duration");
  if (session) label.textContent = formatDuration(Date.now() - (session.startedAt || session.createdAt || Date.now()));
}
function persistLiveRest() {
  if (liveRest) localStorage.setItem("temp-live-rest-v1", JSON.stringify(liveRest));
  else localStorage.removeItem("temp-live-rest-v1");
}
function clearLiveRest() { liveRest = null; persistLiveRest(); }
function startLiveRest(session) {
  liveRest = { sessionId: session.id, endAt: Date.now() + liveRestSeconds * 1000, remaining: liveRestSeconds, total: liveRestSeconds, paused: false };
  persistLiveRest();
  startTimer(liveRestSeconds);
  renderLiveRest();
}
function liveRestRemaining() {
  if (!liveRest || liveRest.sessionId !== liveSession()?.id) return 0;
  return liveRest.paused ? liveRest.remaining : Math.max(0, Math.ceil((liveRest.endAt - Date.now()) / 1000));
}
function renderLiveRest() {
  const rest = document.querySelector("#live-rest");
  const form = document.querySelector("#live-set-form");
  if (!rest || !form) return;
  const seconds = liveRestRemaining();
  if (liveRest && !liveRest.paused && seconds === 0) clearLiveRest();
  const active = Boolean(liveRest && liveRest.sessionId === liveSession()?.id);
  rest.hidden = !active;
  form.hidden = active;
  if (!active) return;
  rest.querySelector("[data-rest-time]").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const total = Math.max(seconds, liveRest.total || liveRestSeconds);
  rest.querySelector(".rest-progress").style.strokeDashoffset = 100 * (1 - seconds / total);
  rest.querySelector("[data-rest-total]").textContent = `из ${String(Math.floor(total / 60)).padStart(1, "0")}:${String(total % 60).padStart(2, "0")}`;
  const pause = rest.querySelector("[data-rest-pause]");
  pause.querySelector(".rest-control-label").textContent = liveRest.paused ? "Продолжить" : "Пауза";
  pause.querySelector(".rest-control-icon").innerHTML = liveRest.paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7Z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
}
function pauseLiveRest() {
  if (!liveRest) return;
  if (liveRest.paused) { liveRest.endAt = Date.now() + liveRest.remaining * 1000; liveRest.paused = false; startTimer(liveRest.remaining); }
  else { liveRest.remaining = liveRestRemaining(); liveRest.paused = true; timerEnd = 0; localStorage.removeItem(TIMER_KEY); renderTimer(); }
  persistLiveRest(); renderLiveRest();
}
function skipLiveRest() { clearLiveRest(); timerEnd = 0; localStorage.removeItem(TIMER_KEY); renderTimer(); renderLiveRest(); }
function addLiveRestTime() {
  if (!liveRest) return;
  const total = Math.max(liveRestRemaining(), liveRest.total || liveRestSeconds);
  if (liveRest.paused) liveRest.remaining += 30;
  else liveRest.endAt += 30000;
  liveRest.total = total + 30;
  persistLiveRest(); renderLiveRest();
}
function liveAddExerciseForm(session) {
  const form = element("form", "flow-exercise-form");
  const picker = exercisePicker(focusGroup(session), null, "name", session.exercises.map(entry => entry.name));
  const submit = element("button", "small-button", "Добавить"); submit.type = "submit";
  form.append(picker.nameLabel, picker.groupLabel, submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = picker.name.value.trim();
    if (!name || session.exercises.some(entry => exerciseKey(entry.name) === exerciseKey(name))) {
      picker.name.setCustomValidity("Это упражнение уже есть в тренировке."); picker.name.hidden = false; picker.name.reportValidity(); return;
    }
    const entry = { id: uid(), name, group: picker.group.value, plannedSets: 3, sets: [] };
    if (liveRest) skipLiveRest();
    session.exercises.push(entry); session.currentExerciseId = entry.id;
    save(); render();
  });
  return form;
}
function removeLiveExercise(session, exercise) {
  if (exercise.sets.length && !confirm(`Убрать «${exercise.name}» и записанные для него подходы из этой тренировки?`)) return;
  const index = session.exercises.indexOf(exercise);
  session.exercises = session.exercises.filter(entry => entry.id !== exercise.id);
  if (session.currentExerciseId === exercise.id) {
    if (liveRest) skipLiveRest();
    session.currentExerciseId = session.exercises[Math.min(index, session.exercises.length - 1)]?.id;
  }
  save(); renderLive();
}

function addRecordedSet(card, source = null) {
  const rows = card.querySelector(".record-sets");
  const row = element("div", "record-set-row");
  row.sourceSet = source?.id ? source : null;
  const label = element("span", "record-set-number");
  const weightLabel = element("label", "", "Вес, кг");
  const weight = element("input"); weight.type = "number"; weight.name = "weight";
  weight.min = "0"; weight.max = "1000"; weight.step = "0.5"; weight.required = false;
  configureWeightInput(weight); weight.value = source?.weight ?? ""; weightLabel.append(weight);
  const repsLabel = element("label", "record-reps-label");
  const caption = element("span", "record-reps-caption", "Повторения");
  const reps = element("input"); reps.type = "number"; reps.name = "reps";
  reps.min = "1"; reps.max = "10000"; reps.step = "1"; reps.required = true;
  reps.value = source?.reps || ""; repsLabel.append(caption, reps);
  const effortLabel = element("label", "record-effort", "Усилие");
  const effort = element("select"); effort.name = "note";
  for (const note of ["", "легко", "нормально", "тяжело", "до отказа"]) {
    const option = element("option", "", note || "Не отмечать"); option.value = note; effort.append(option);
  }
  effort.value = source?.note || "";
  effortLabel.append(effort);
  const remove = element("button", "text-button danger record-remove-set", "Удалить");
  remove.type = "button";
  remove.addEventListener("click", () => { row.remove(); updateRecordedFields(); });
  row.append(label, weightLabel, repsLabel, effortLabel, remove);
  rows.append(row);
  updateRecordedFields();
}
function updateRecordedFields() {
  const running = document.querySelector("#record-workout-form").elements.activity.value === "Бег";
  document.querySelectorAll(".record-exercise").forEach((card, index) => {
    card.querySelector(".record-exercise-heading").textContent = recordWizard && recordCardName(card) ? recordCardName(card) : `Упражнение ${index + 1}`;
    const rows = card.querySelectorAll(".record-set-row");
    rows.forEach((row, setIndex) => {
      row.querySelector(".record-set-number").textContent = running ? `Отрезок ${setIndex + 1}` : `Подход ${setIndex + 1}`;
      const weight = row.querySelector('[name="weight"]');
      weight.disabled = running; weight.parentElement.hidden = running;
      row.querySelector(".record-reps-caption").textContent = running ? "Минуты" : "Повторения";
      row.querySelector('[name="reps"]').step = running ? "0.1" : "1";
      row.querySelector(".record-effort").hidden = running;
      row.querySelector(".record-remove-set").disabled = false;
      row.querySelector('[name="reps"]').required = running && workoutEdit?.kind !== "plan";
    });
    if (card.setEditor) {
      card.setEditor.inputs.weight.parentElement.hidden = running;
      card.setEditor.inputs.count.parentElement.firstChild.textContent = running ? "Отрезки" : "Подходы";
      card.setEditor.inputs.reps.parentElement.firstChild.textContent = running ? "Минуты" : "Повторы";
      card.setEditor.inputs.reps.step = running ? "any" : "1";
      card.setEditor.sync();
    }
    card.querySelector(".record-add-set").textContent = running ? "Добавить отрезок" : "Добавить подход";
  });
}
function addRecordedExercise(source = null) {
  const card = element("section", "panel record-exercise");
  card.sourceExercise = source;
  const header = element("div", "panel-head");
  const heading = element("h3", "record-exercise-heading");
  const remove = element("button", "text-button danger", "Удалить упражнение"); remove.type = "button";
  remove.addEventListener("click", () => { card.remove(); updateRecordedFields(); });
  header.append(heading, remove);
  const details = element("div", "form-row");
  const picker = exercisePicker(source?.group || "Ноги", source, "exerciseName");
  details.append(picker.nameLabel, picker.groupLabel);
  let pickerContainer = details;
  if (recordWizard && source?.name) {
    pickerContainer = element("details", "compact-set-details record-picker-details");
    pickerContainer.append(element("summary", "", "Заменить упражнение"), details);
  }
  details.addEventListener("change", updateRecordedFields);
  const rows = element("div", "record-sets");
  const add = element("button", "small-button record-add-set", "Добавить подход"); add.type = "button";
  add.addEventListener("click", () => {
    const last = rows.lastElementChild;
    addRecordedSet(card, last ? { weight: last.querySelector('[name="weight"]').value, reps: last.querySelector('[name="reps"]').value } : null);
  });
  card.append(header, pickerContainer, rows, add);
  document.querySelector("#record-exercises").append(card);
  if (source) source.sets.forEach(set => addRecordedSet(card, set));
  else for (let i = 0; i < 3; i++) addRecordedSet(card);
  const editor = compactSetEditor(
    () => [...rows.children].map(row => ({ ...row.sourceSet, weight: row.querySelector('[name="weight"]').value, reps: row.querySelector('[name="reps"]').value, note: row.querySelector('[name="note"]').value })),
    sets => { rows.replaceChildren(); sets.forEach(set => addRecordedSet(card, set)); },
    document.querySelector("#record-workout-form").elements.activity.value === "Бег"
  );
  editor.querySelector("details").append(rows, add);
  card.append(editor); card.setEditor = editor;
  rows.addEventListener("input", () => editor.sync());
  rows.addEventListener("change", () => editor.sync());
  card.addEventListener("invalid", () => { editor.querySelector("details").open = true; if (pickerContainer.tagName === "DETAILS") pickerContainer.open = true; }, true);
  updateRecordedFields();
  return card;
}
function recordGroupMatches(entry, group) {
  if (!["Бицепс", "Трицепс"].includes(group)) return (entry.group || inferGroup(entry.name)) === group;
  if ((entry.group || inferGroup(entry.name)) !== "Руки") return false;
  const library = EXERCISE_LIBRARY.find(item => exerciseKey(item.name) === exerciseKey(entry.name));
  const text = `${entry.name} ${library?.muscles || ""}`.toLocaleLowerCase("ru-RU");
  const triceps = /трицепс|разгибани|француз/.test(text);
  const biceps = /бицепс|сгибани|молот/.test(text) && !triceps;
  return group === "Трицепс" ? triceps || !biceps : biceps || !triceps;
}
function recordCardEntry(card) { return { name: recordCardName(card), group: card.querySelector('[name="group"]').value }; }
function recordCards() { return [...document.querySelectorAll(".record-exercise")]; }
function recordCardName(card) { return card.querySelector('[name="exerciseName"]').value; }
function recordSelection(entry, checked, targets = null) {
  const card = recordCards().find(card => exerciseKey(recordCardName(card)) === exerciseKey(entry.name));
  if (!checked) { card?.remove(); updateRecordedFields(); return; }
  if (card) return;
  addRecordedExercise({ name: entry.name, group: entry.group, sets: targets?.length ? targets.map(set => ({ weight: set.weight ?? "", reps: set.reps || "" })) : Array.from({ length: 3 }, () => ({ weight: "", reps: "" })) });
}
function renderRecordWizard() {
  const target = document.querySelector("#record-wizard");
  const form = document.querySelector("#record-workout-form");
  target.replaceChildren(); target.hidden = !recordWizard;
  const final = !recordWizard || recordWizard.step === 3;
  for (const node of [form.querySelector(".record-details"), document.querySelector("#record-exercises"), document.querySelector("#record-add-exercise"), document.querySelector(".record-save")]) node.hidden = !final;
  document.querySelector("#record-extra-details").open = !recordWizard;
  if (!recordWizard) return;
  const step = recordWizard.step;
  target.append(element("div", "eyebrow record-step", `ШАГ ${step} / 3`));
  document.querySelector("#workout-record .flow-title").textContent = step === 1 ? "Что тренировали?" : step === 2 ? "Какие упражнения выполняли?" : "Сколько сделали?";
  document.querySelector("#workout-record .flow-subtitle").textContent = step === 1 ? "Выбери одну или несколько групп мышц." : step === 2 ? "Отметь упражнения. На следующем шаге укажи выполненные подходы." : "Это выполненная тренировка. Достаточно числа подходов; вес и повторы можно уточнить позже.";
  if (step > 1) {
    const back = element("button", "text-button record-wizard-back", "← Назад"); back.type = "button";
    back.addEventListener("click", () => { recordWizard.step--; renderRecordWizard(); window.scrollTo(0, 0); }); target.append(back);
  }
  if (step === 1) {
    const grid = element("div", "flow-group-grid record-muscle-groups");
    for (const group of [...Object.values(LIBRARY_GROUPS).flatMap(group => group === "Руки" ? ["Бицепс", "Трицепс"] : [group]), "Другое"]) {
      const label = element("label", "record-muscle-choice"); label.dataset.group = group;
      const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.checked = recordWizard.groups.includes(group);
      checkbox.addEventListener("change", () => {
        recordWizard.groups = checkbox.checked ? [...recordWizard.groups, group] : recordWizard.groups.filter(value => value !== group);
        updateRecordWizardNext();
      });
      label.append(checkbox, element("span", "", group)); grid.append(label);
    }
    target.append(grid);
  }
  if (step === 2) {
    for (const group of recordWizard.groups) {
      const section = element("section", "record-choice-group"); section.append(element("h3", "", group));
      const previous = data.sessions.filter(session => session.status === "done" && session.exercises.some(exercise => recordGroupMatches(exercise, group) && exercise.sets.length)).sort((a,b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).at(-1);
      if (previous) {
        const repeat = element("button", "small-button record-take-previous", "Взять упражнения из прошлой"); repeat.type = "button";
        repeat.addEventListener("click", () => { previous.exercises.filter(exercise => recordGroupMatches(exercise, group) && exercise.sets.length).forEach(exercise => recordSelection(exercise, true, exercise.sets)); renderRecordWizard(); });
        section.append(repeat, element("p", "form-help", `Последняя: ${daysAgo(previous.date)}. Проверь веса и повторы перед сохранением.`));
      }
      const entries = new Map(EXERCISE_LIBRARY.filter(entry => recordGroupMatches(entry, group)).map(entry => [exerciseKey(entry.name), entry]));
      if (previous) previous.exercises.filter(entry => recordGroupMatches(entry, group)).forEach(entry => entries.set(exerciseKey(entry.name), entry));
      recordCards().filter(card => recordGroupMatches(recordCardEntry(card), group)).forEach(card => { const name = recordCardName(card); if (name) entries.set(exerciseKey(name), recordCardEntry(card)); });
      const list = element("div", "record-exercise-choices");
      for (const entry of entries.values()) {
        const label = element("label", "record-exercise-choice");
        const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.value = entry.name;
        checkbox.checked = recordCards().some(card => exerciseKey(recordCardName(card)) === exerciseKey(entry.name));
        checkbox.addEventListener("change", () => { recordSelection(entry, checkbox.checked); updateRecordWizardNext(); });
        label.append(checkbox, element("span", "", entry.name)); list.append(label);
      }
      if (!entries.size) list.append(element("p", "form-help", "Добавь своё упражнение на следующем шаге."));
      section.append(list); target.append(section);
    }
    const custom = element("button", "small-button record-custom-choice", "Другое — своё упражнение"); custom.type = "button";
    custom.addEventListener("click", () => { const card = addRecordedExercise(); const group = card.querySelector('[name="group"]'); group.value = ["Бицепс", "Трицепс"].includes(recordWizard.groups[0]) ? "Руки" : recordWizard.groups[0] || "Другое"; group.dispatchEvent(new Event("change")); const select = card.querySelector('[name="exerciseChoice"]'); select.value = "__custom"; select.dispatchEvent(new Event("change")); recordWizard.step = 3; renderRecordWizard(); card.querySelector('[name="exerciseName"]').focus(); });
    target.append(custom);
  }
  if (step === 3) target.append(element("p", "record-auto-title", form.elements.title.value));
  if (step < 3) {
    const next = element("button", "button button-dark record-wizard-next", "Далее"); next.type = "button";
    next.addEventListener("click", () => {
      if (step === 1) {
        const newTitle = recordWizard.groups.map((group, index) => index ? group.toLocaleLowerCase("ru-RU") : group).join(" и ");
        if (!form.elements.title.value || form.elements.title.value === recordWizard.autoTitle) form.elements.title.value = newTitle;
        recordWizard.autoTitle = newTitle;
        recordCards().filter(card => !recordWizard.groups.some(group => recordGroupMatches(recordCardEntry(card), group))).forEach(card => card.remove());
      }
      recordWizard.step++; renderRecordWizard(); window.scrollTo(0, 0);
    }); target.append(next); updateRecordWizardNext();
  }
}
function updateRecordWizardNext() {
  const next = document.querySelector(".record-wizard-next");
  if (next && recordWizard) next.disabled = recordWizard.step === 1 ? !recordWizard.groups.length : !recordCards().length;
}
function initRecordedWorkout() {
  const form = document.querySelector("#record-workout-form");
  form.addEventListener("invalid", event => {
    if (event.target.closest("#record-extra-details")) document.querySelector("#record-extra-details").open = true;
  }, true);
  form.elements.date.value = today(); form.elements.date.removeAttribute("max");
  const options = document.querySelector("#record-exercise-options");
  for (const name of [...new Set([...CATALOG, ...data.sessions.flatMap(session => session.exercises.map(exercise => exercise.name))])]) {
    const option = element("option"); option.value = name; options.append(option);
  }
  addRecordedExercise();
  form.elements.activity.addEventListener("change", updateRecordedFields);
  form.elements.title.addEventListener("input", () => form.elements.title.setCustomValidity(form.elements.title.value.trim() ? "" : "Укажи название тренировки."));
  document.querySelector("#record-add-exercise").addEventListener("click", () => {
    const card = addRecordedExercise(); card.querySelector('[name="exerciseChoice"]').focus();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (recordWizard && recordWizard.step !== 3) return;
    const cards = [...document.querySelectorAll(".record-exercise")];
    const kind = workoutEdit?.kind || "session";
    if (!cards.length && kind !== "plan") { addRecordedExercise().querySelector('[name="exerciseChoice"]').focus(); return; }
    form.elements.title.setCustomValidity(form.elements.title.value.trim() ? "" : "Укажи название тренировки.");
    if (!form.reportValidity()) return;
    const running = form.elements.activity.value === "Бег";
    const createdAt = Date.now();
    const original = workoutEdit?.original;
    const exercises = cards.map(card => ({
      ...card.sourceExercise,
      id: card.sourceExercise?.id || uid(), name: card.querySelector('[name="exerciseName"]').value.trim(),
      group: card.querySelector('[name="group"]').value,
      completed: original?.status === "active" ? Boolean(card.sourceExercise?.completed) : kind !== "plan",
      sets: [...card.querySelectorAll(".record-set-row")].map(row => ({
        ...row.sourceSet,
        id: row.sourceSet?.id || uid(), weight: running ? 0 : row.querySelector('[name="weight"]').value.trim() ? number(row.querySelector('[name="weight"]').value) : null,
        reps: row.querySelector('[name="reps"]').value ? number(row.querySelector('[name="reps"]').value) : null,
        note: running ? "" : row.querySelector('[name="note"]').value, createdAt: row.sourceSet?.createdAt || createdAt,
      })),
    }));
    const session = {
      ...original, id: original?.id || uid(), title: form.elements.title.value.trim(), date: form.elements.date.value,
      activity: form.elements.activity.value, status: kind === "plan" ? "planned" : original?.status || "done",
      createdAt: original?.createdAt || createdAt, exercises,
    };
    session.focusGroup = focusGroup({ exercises, title: session.title });
    const duration = number(form.elements.duration.value);
    if (session.status !== "active") {
      if (duration) {
        session.startedAt = new Date(`${session.date}T00:00:00`).getTime();
        session.completedAt = session.startedAt + duration * 60000;
      } else { delete session.startedAt; delete session.completedAt; }
    }
    if (session.status === "active" && !exercises.some(entry => entry.id === session.currentExerciseId)) {
      session.currentExerciseId = exercises[0]?.id; if (liveRest) skipLiveRest();
    }
    const collection = kind === "plan" ? data.plans : data.sessions;
    const index = collection.findIndex(entry => entry.id === session.id);
    if (index >= 0) collection[index] = session; else collection.push(session);
    save();
    calendarDate = session.date; const date = new Date(session.date + "T12:00:00");
    calendarMonth = date.getMonth(); calendarYear = date.getFullYear();
    const destination = workoutEdit?.returnTo || (kind === "plan" ? "#calendar" : "#workout-result");
    if (kind !== "plan") resultSessionId = session.id;
    workoutEdit = null; recordWizard = null; renderRecordWizard();
    form.reset(); form.elements.date.value = today();
    document.querySelector("#record-exercises").replaceChildren(); addRecordedExercise();
    render(); location.hash = destination;
  });
}



function configureWeightInput(input) {
  input.type = "text"; input.inputMode = "decimal";
  input.removeAttribute("min"); input.removeAttribute("max"); input.removeAttribute("step");
  input.pattern = "[0-9]+([.,][0-9]+)?|[.,][0-9]+";
  function validate() {
    const value = input.value.trim();
    const parsed = Number(value.replace(",", "."));
    input.setCustomValidity(value && (!/^(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)$/.test(value) || !Number.isFinite(parsed) || parsed < 0 || parsed > 1000)
      ? "Введи вес от 0 до 1000 кг. Дробную часть можно указать через точку или запятую." : "");
  }
  input.addEventListener("input", validate); validate();
}
function liveSetActions(session, exercise, set, row) {
  const menu = element("details", "live-set-menu");
  const summary = element("summary", "live-set-menu-toggle");
  summary.setAttribute("aria-label", "Действия с подходом");
  summary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
  const actions = element("div", "live-set-menu-actions");
  const edit = element("button", "", "Изменить"); edit.type = "button";
  const remove = element("button", "danger", "Удалить"); remove.type = "button";
  menu.append(summary, actions); actions.append(edit, remove);
  menu.addEventListener("toggle", () => {
    if (menu.open) document.querySelectorAll(".live-set-menu[open]").forEach(other => { if (other !== menu) other.open = false; });
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); menu.open = false; summary.focus(); }
  });
  edit.addEventListener("click", () => {
    menu.open = false;
    if (row.querySelector(".live-set-edit")) { row.querySelector(".live-set-edit input").focus(); return; }
    const form = element("form", "live-set-edit");
    const fields = element("div", "live-set-fields");
    let weight;
    if (!isRun(session)) {
      const label = element("label", "", "Вес, кг");
      weight = element("input"); weight.name = "weight"; weight.required = false; weight.value = set.weight;
      configureWeightInput(weight); label.append(weight); fields.append(label);
    }
    const label = element("label", "", isRun(session) ? "Минуты" : "Повторения");
    const reps = element("input"); reps.name = "reps"; reps.type = "number";
    reps.required = true; reps.min = "1"; reps.max = "10000"; reps.step = isRun(session) ? "0.1" : "1";
    reps.value = set.reps; label.append(reps); fields.append(label);
    const buttons = element("div", "live-set-edit-actions");
    const submit = element("button", "small-button", "Сохранить"); submit.type = "submit";
    const cancel = element("button", "text-button", "Отмена"); cancel.type = "button";
    cancel.addEventListener("click", () => { form.remove(); summary.focus(); });
    buttons.append(submit, cancel); form.append(fields, buttons); row.append(form);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      set.weight = weight ? number(weight.value) : 0; set.reps = number(reps.value);
      save(); render();
    });
    (weight || reps).focus();
  });
  remove.addEventListener("click", () => {
    menu.open = false;
    if (!confirm("Удалить этот подход?")) return;
    exercise.sets = exercise.sets.filter(item => item.id !== set.id);
    if (!exercise.sets.length) exercise.completed = false;
    save(); render();
  });
  return menu;
}

function liveCommentControl(exercise, set = null, preview = null) {
  const control = element("div", "live-comment-control");
  const button = element("button", "live-comment-button", "Комментарий"); button.type = "button";
  const panel = element("div", "live-comment-panel"); panel.hidden = true; panel.id = "comment-" + uid();
  button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", panel.id);
  const label = element("label", "", "К чему добавить");
  const scope = element("select"); scope.name = "commentScope";
  for (const [value, text] of [["set", set ? "К этому подходу" : "К новому подходу"], ["exercise", "К упражнению целиком"]]) {
    if (set && value === "exercise") continue;
    const option = element("option", "", text); option.value = value; scope.append(option);
  }
  label.append(scope);
  const textLabel = element("label", "", "Текст комментария");
  const text = element("textarea"); text.maxLength = 1000; text.rows = 3;
  text.placeholder = "Например, изменил положение стоп"; textLabel.append(text);
  const done = element("button", "small-button", "Готово"); done.type = "button";
  function value() { return scope.value === "exercise" ? exercise.comment || "" : set ? set.comment || "" : exercise.pendingSetComment || ""; }
  function refresh() {
    button.classList.toggle("has-comment", Boolean(set ? set.comment : exercise.pendingSetComment || exercise.comment));
  }
  function close() { panel.hidden = true; button.setAttribute("aria-expanded", "false"); button.focus(); }
  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) { text.value = value(); text.focus(); }
  });
  scope.addEventListener("change", () => { text.value = value(); text.focus(); });
  text.addEventListener("input", () => {
    const comment = text.value.trim();
    if (scope.value === "exercise") exercise.comment = comment;
    else if (set) set.comment = comment;
    else exercise.pendingSetComment = comment;
    save(); refresh();
    if (preview && set) { preview.textContent = comment; preview.hidden = !comment; }
    const exercisePreview = document.querySelector("#live-exercise-comment");
    if (exercisePreview) { exercisePreview.textContent = exercise.comment || ""; exercisePreview.hidden = !exercise.comment; }
  });
  done.addEventListener("click", close);
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  });
  panel.append(label, textLabel, done);
  control.append(button, panel); refresh();
  return control;
}

function initLiveExerciseReordering() {
  const nav = document.querySelector("#live-exercise-nav");
  let gesture = null, suppressUntil = 0;
  function moveHeldTab() {
    if (!gesture?.dragging) return;
    const x = gesture.x, bounds = nav.getBoundingClientRect();
    if (x < bounds.left + 35) nav.scrollLeft -= 12;
    if (x > bounds.right - 35) nav.scrollLeft += 12;
    const tabs = [...nav.querySelectorAll(".live-exercise-tab")].filter(tab => tab !== gesture.tab);
    const before = tabs.find(tab => x < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2);
    nav.insertBefore(gesture.tab, before || null);
  }
  nav.addEventListener("click", event => { if (Date.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  nav.addEventListener("pointerdown", event => {
    const tab = event.target.closest(".live-exercise-tab");
    if (!tab || event.button !== 0) return;
    const session = liveSession(); if (!session) return;
    gesture = { tab, session, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: nav.scrollLeft, x: event.clientX, dragging: false, panning: false };
    gesture.timer = setTimeout(() => { if (!gesture || gesture.panning) return; gesture.dragging = true; nav.setPointerCapture(gesture.pointerId); tab.classList.add("reordering"); nav.classList.add("reordering"); gesture.edgeTimer = setInterval(moveHeldTab, 50); }, 450);
  });
  nav.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(gesture.timer); gesture.panning = true; nav.setPointerCapture(gesture.pointerId); suppressUntil = Date.now() + 600; }
      if (gesture.panning) { nav.scrollLeft = gesture.scrollLeft - dx; if (Math.abs(dy) > Math.abs(dx)) window.scrollBy(0, -dy / 8); }
      return;
    }
    event.preventDefault(); suppressUntil = Date.now() + 600;
    gesture.x = event.clientX; moveHeldTab();
  });
  function end(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    clearTimeout(gesture.timer); clearInterval(gesture.edgeTimer);
    const current = gesture; gesture = null;
    current.tab.classList.remove("reordering"); nav.classList.remove("reordering");
    if (!current.dragging) return;
    suppressUntil = Date.now() + 600;
    const scroll = nav.scrollLeft;
    if (!cancelled) {
      const entries = new Map(current.session.exercises.map(exercise => [exercise.id, exercise]));
      current.session.exercises = [...nav.children].map(tab => entries.get(tab.dataset.exerciseId)).filter(Boolean);
      save();
    }
    renderLive(); nav.scrollLeft = scroll;
  }
  nav.addEventListener("pointerup", event => end(event));
  nav.addEventListener("pointercancel", event => end(event, true));
  nav.addEventListener("keydown", event => {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const tab = event.target.closest(".live-exercise-tab"), session = liveSession(); if (!tab || !session) return;
    const index = session.exercises.findIndex(exercise => exercise.id === tab.dataset.exerciseId);
    const destination = index + (event.key === "ArrowLeft" ? -1 : 1);
    if (destination < 0 || destination >= session.exercises.length) return;
    event.preventDefault(); [session.exercises[index], session.exercises[destination]] = [session.exercises[destination], session.exercises[index]];
    save(); renderLive(); nav.querySelector(`[data-exercise-id="${tab.dataset.exerciseId}"]`)?.focus();
  });
}
function renderLive() {
  const session = liveSession();
  const target = document.querySelector("#live-content");
  const nav = document.querySelector("#live-exercise-nav");
  target.replaceChildren(); nav.replaceChildren();
  document.querySelector("#live-finish").hidden = !session;
  if (!session) { target.append(element("p", "empty-state", "Активной тренировки нет.")); return; }
  document.querySelector("#live-title").textContent = session.title;
  updateLiveDuration();
  if (!session.exercises.some(exercise => exercise.id === session.currentExerciseId)) session.currentExerciseId = session.exercises[0]?.id;
  for (const [index, exercise] of session.exercises.entries()) {
    const button = element("button", `live-exercise-tab${session.currentExerciseId === exercise.id ? " active" : ""}`, `${index + 1}. ${exercise.name}`);
    button.type = "button"; button.dataset.exerciseId = exercise.id;
    button.title = "Удерживай и перетаскивай для изменения порядка. С клавиатуры: Alt + стрелка влево/вправо.";
    button.append(element("small", "", exercise.completed ? "Завершено" : `${exercise.sets.length}/${exercise.plannedSets || 3}`));
    button.addEventListener("click", () => { if (liveRest) skipLiveRest(); session.currentExerciseId = exercise.id; save(); renderLive(); });
    nav.append(button);
  }
  const editor = element("details", "live-exercise-editor");
  const editorTitle = element("summary", "", "Добавить упражнение");
  editor.append(editorTitle, liveAddExerciseForm(session));
  target.append(editor);
  const exercise = session.exercises.find(item => item.id === session.currentExerciseId);
  if (!exercise) {
    target.append(element("p", "empty-state", "Добавь первое упражнение, чтобы начать запись подходов."));
    editor.open = true;
    return;
  }
  const currentIndex = session.exercises.indexOf(exercise);
  target.append(element("div", "eyebrow", `УПРАЖНЕНИЕ ${currentIndex + 1} ИЗ ${session.exercises.length}`), element("h3", "live-exercise-title", exercise.name));
  const remove = element("button", "text-button danger live-remove-exercise", "Убрать упражнение");
  remove.type = "button"; remove.addEventListener("click", () => removeLiveExercise(session, exercise));
  target.append(remove);
  const exerciseComment = element("p", "workout-comment live-exercise-comment", exercise.comment || "");
  exerciseComment.id = "live-exercise-comment"; exerciseComment.hidden = !exercise.comment;
  target.append(exerciseComment);
  const history = exerciseHistory(data.sessions, exercise.name, session.id);
  const previous = history.at(-1);
  const prior = previous ? bestSet(previous.sets) : null;
  const goal = suggestedGoal(history);
  if (prior) target.append(element("p", "live-previous", `Прошлый раз: ${setText(prior, isRun(session))}`));
  if (goal && prior?.weight > 0 && !isRun(session)) target.append(element("p", "live-goal", `Ориентир сегодня: ${goalLabel(goal)}. Можно изменить.`));
  const completed = element("div", "live-completed");
  exercise.sets.forEach((set, index) => {
    const row = element("div", "live-set-done");
    row.append(liveSetActions(session, exercise, set, row), element("div", "live-set-result", `${index + 1}. ${setText(set, isRun(session))}${set.note ? ` · ${set.note}` : ""}`));
    const preview = element("p", "workout-comment live-set-comment", set.comment || ""); preview.hidden = !set.comment;
    row.append(preview, liveCommentControl(exercise, set, preview));
    completed.append(row);
  });
  target.append(completed);
  const rest = element("div", "live-rest"); rest.id = "live-rest";
  const count = exercise.sets.length;
  const totalSets = Math.max(exercise.plannedSets || 3, count);
  const nextExercise = count >= totalSets ? session.exercises[session.exercises.indexOf(exercise) + 1] : null;
  rest.innerHTML = `<div class="rest-dial"><svg class="rest-ring" viewBox="0 0 320 320" aria-hidden="true"><circle class="rest-outer" cx="160" cy="160" r="151"/><circle class="rest-track" cx="160" cy="160" r="137"/><circle class="rest-progress" cx="160" cy="160" r="137" pathLength="100"/><circle class="rest-inner" cx="160" cy="160" r="120"/></svg><div class="rest-dial-content"><div class="eyebrow">ОТДЫХ</div><div class="rest-set-caption">ПОСЛЕ ПОДХОДА ${count}</div><div class="live-rest-time" data-rest-time role="timer">01:30</div><div class="rest-total" data-rest-total>из 2:00</div></div></div><div class="rest-next"><span class="rest-next-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7v10M17 7v10M3 10v4M21 10v4M7 12h10"/></svg></span><div><span class="eyebrow">${nextExercise ? "СЛЕДУЮЩЕЕ УПРАЖНЕНИЕ" : count >= totalSets ? "ПОСЛЕ ОТДЫХА" : "СЛЕДУЮЩИЙ ПОДХОД"}</span><strong data-rest-next></strong></div></div><div class="live-rest-actions"><button type="button" data-rest-skip><span class="rest-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 9 7-9 7Zm10 0 9 7-9 7Z"/></svg></span><span class="rest-control-label">Пропустить</span></button><button type="button" data-rest-pause><span class="rest-control-icon"></span><span class="rest-control-label">Пауза</span></button><button type="button" data-rest-add><span class="rest-control-icon rest-plus">+30</span><span class="rest-control-label">+30 сек</span></button></div><div class="rest-sets"><div><span class="eyebrow">ПОДХОДЫ</span><div class="rest-set-chips"></div></div><div class="rest-set-summary"><strong>${count} / ${totalSets}</strong><span>ЗАВЕРШЕНО</span></div></div>`;
  rest.querySelector("[data-rest-next]").textContent = nextExercise?.name || (count >= totalSets ? "Завершить упражнение" : exercise.name);
  for (let i = 0; i < totalSets; i++) rest.querySelector(".rest-set-chips").append(element("span", i < count ? "done" : i === count ? "next" : "", i < count ? "✓" : String(i + 1)));
  rest.querySelector("[data-rest-pause]").addEventListener("click", pauseLiveRest);
  rest.querySelector("[data-rest-skip]").addEventListener("click", skipLiveRest);
  rest.querySelector("[data-rest-add]").addEventListener("click", addLiveRestTime);
  target.append(rest);
  const form = element("form", "live-set-form"); form.id = "live-set-form";
  const setHeading = element("h4", "", `Подход ${exercise.sets.length + 1}`);
  form.append(setHeading);
  const fields = element("div", "live-set-fields");
  const targetSet = exercise.plannedTargets?.[exercise.sets.length];
  const prefill = targetSet ? { ...(exercise.sets.at(-1) || goal || prior), ...Object.fromEntries(Object.entries(targetSet).filter(([, value]) => value !== "" && value != null)) } : exercise.sets.at(-1) || goal || prior;
  if (!isRun(session)) {
    const weightLabel = element("label", "", "Вес, кг");
    const weight = element("input"); weight.type = "number"; weight.name = "weight"; weight.min = "0"; weight.max = "1000"; weight.step = "0.5"; configureWeightInput(weight); weight.value = prefill?.weight ?? 0; weightLabel.append(weight); fields.append(weightLabel);
  }
  const repsLabel = element("label", "", isRun(session) ? "Минуты" : "Повторения");
  const reps = element("input"); reps.type = "number"; reps.name = "reps"; reps.min = "1"; reps.max = "10000"; reps.required = true; reps.value = prefill?.reps || ""; repsLabel.append(reps); fields.append(repsLabel);
  form.append(fields);
  const feedback = element("div", "live-feedback-row");
  if (!isRun(session)) {
    const effort = element("label", "live-effort", "Как ощущался подход?");
    const select = element("select"); select.name = "note";
    for (const note of ["", "легко", "нормально", "тяжело", "до отказа"]) { const option = element("option", "", note || "Не отмечать"); option.value = note; select.append(option); }
    effort.append(select); feedback.append(effort);
  }
  feedback.append(liveCommentControl(exercise)); form.append(feedback);
  const restChoice = element("label", "live-rest-choice", "Отдых после подхода");
  const select = element("select"); select.name = "restSeconds";
  for (const [seconds, textValue] of [[60, "1 мин"], [90, "1,5 мин"], [120, "2 мин"], [180, "3 мин"]]) { const option = element("option", "", textValue); option.value = seconds; select.append(option); }
  select.value = String(liveRestSeconds);
  select.addEventListener("change", () => { liveRestSeconds = Number(select.value); localStorage.setItem("temp-live-rest-seconds-v1", String(liveRestSeconds)); });
  restChoice.append(select); form.append(restChoice);
  const saveButton = element("button", "button button-dark live-save", "Сохранить подход"); saveButton.type = "submit"; form.append(saveButton);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    exercise.completed = false;
    exercise.sets.push({ id: uid(), weight: isRun(session) ? 0 : number(values.weight), reps: number(values.reps), note: values.note || "", comment: exercise.pendingSetComment || "", createdAt: Date.now() });
    delete exercise.pendingSetComment;
    save(); render(); startLiveRest(session);
  });
  target.append(form);
  const next = session.exercises.slice(currentIndex + 1).find(item => !item.completed)
    || session.exercises.find(item => item.id !== exercise.id && !item.completed);
  const actions = element("div", "live-exercise-actions");
  actions.append(element("p", "live-previous", next
    ? `Все подходы сделаны? Дальше: ${next.name}.`
    : "Заверши упражнение. Можно добавить ещё одно или отдельно закончить тренировку."));
  const button = element("button", "live-next", exercise.completed ? "Упражнение завершено" : "Завершить упражнение");
  button.disabled = Boolean(exercise.completed);
  button.type = "button";
  button.addEventListener("click", () => {
    exercise.completed = true;
    if (liveRest) skipLiveRest();
    if (next) session.currentExerciseId = next.id;
    save(); renderLive();
    window.scrollTo(0, 0);
  });
  actions.append(button);
  target.insertBefore(actions, rest);
  renderLiveRest();
}
function finishLiveWorkout() {
  const session = liveSession();
  if (!session) return;
  document.querySelector("#live-confirm").hidden = true;
  session.exercises.forEach(exercise => { exercise.completed = true; });
  session.status = "done";
  session.completedAt = Date.now();
  resultSessionId = session.id;
  clearLiveRest(); timerEnd = 0; localStorage.removeItem(TIMER_KEY);
  save(); render(); location.hash = "#workout-result";
}
function renderResult() {
  const target = document.querySelector("#result-content");
  const session = data.sessions.find(item => item.id === resultSessionId) || completedSessions().at(-1);
  target.replaceChildren();
  if (!session) { target.append(element("h2", "", "Пока нет завершённой тренировки.")); return; }
  const summary = sessionSummary(session, data.sessions);
  const used = session.exercises.filter(exercise => exercise.sets.length);
  const setCount = used.reduce((total, exercise) => total + exercise.sets.length, 0);
  const duration = session.completedAt && (session.startedAt || session.createdAt) ? formatDuration(session.completedAt - (session.startedAt || session.createdAt)) : "—";
  const ending = { "Грудь": "Грудь завершена", "Спина": "Спина завершена", "Ноги": "Ноги завершены", "Плечи": "Плечи завершены", "Руки": "Руки завершены", "Всё тело": "Всё тело завершено", "Своя тренировка": "Своя тренировка завершена" };
  target.append(element("div", "eyebrow", "ТРЕНИРОВКА ЗАВЕРШЕНА"), element("h2", "", ending[session.title] || `Тренировка «${session.title}» завершена`));
  const stats = element("div", "result-stats");
  for (const [label, value] of [["Время", duration], ["Упражнений", String(used.length)], ["Подходов", String(setCount)], [isRun(session) ? "Активность" : "Объём", isRun(session) ? `${formatNumber(used.reduce((sum, exercise) => sum + exercise.sets.reduce((total, set) => total + number(set.reps), 0), 0))} мин` : `${formatNumber(summary.volume)} кг`]]) {
    const card = element("div", "result-stat"); card.append(element("span", "", label), element("strong", "", value)); stats.append(card);
  }
  target.append(stats);
  const gains = element("div", "result-gains");
  gains.append(element("h3", "", summary.highlights.length ? "Новые результаты" : "Новая точка в истории"));
  if (summary.highlights.length) {
    for (const exercise of used) {
      const prior = exerciseHistory(data.sessions.filter(item => item.id !== session.id && (item.date < session.date || item.date === session.date && (item.createdAt || 0) < (session.createdAt || 0))), exercise.name).at(-1);
      if (!prior) continue;
      const oldSet = bestSet(prior.sets), newSet = bestSet(exercise.sets);
      if (!oldSet || !newSet) continue;
      const improved = Number(newSet.weight) > Number(oldSet.weight) || Number(newSet.weight) === Number(oldSet.weight) && Number(newSet.reps) > Number(oldSet.reps);
      if (improved) { const item = element("div", "result-gain"); item.append(element("strong", "", exercise.name), element("span", "", `${setText(oldSet, isRun(session))} → ${setText(newSet, isRun(session))}`)); gains.append(item); }
    }
  }
  if (!gains.querySelector(".result-gain")) gains.append(element("p", "", "Результат сохранён. Следующие занятия помогут увидеть изменения."));
  target.append(gains);
  if (summary.records) target.append(element("p", "result-records", `${summary.records} ${recordPhrase(summary.records)}`));
  if (summary.volumeChange > 0) target.append(element("p", "result-volume", `Общий объём тренировки: +${summary.volumeChange}% к прошлому такому занятию.`));
  const actions = element("div", "result-actions");
  const overview = element("a", "button button-dark", "К обзору"); overview.href = "#overview";
  const history = element("a", "small-button", "История тренировок"); history.href = "#training";
  actions.append(overview, history); target.append(actions);
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
function render() { renderTemplates(); renderWorkouts(); renderFood(); renderTimer(); renderHero(); renderFlow(); renderLive(); renderResult(); renderCalendar(); renderProgression(); }

function openWorkoutEditor(kind = "session", original = null, date = today(), returnTo = null) {
  workoutEdit = { kind, original: original ? structuredClone(original) : null, returnTo };
  recordWizard = kind === "session" && !original ? { step: 1, groups: [], autoTitle: "" } : null;
  const form = document.querySelector("#record-workout-form");
  form.reset(); form.elements.title.setCustomValidity("");
  form.elements.date.removeAttribute("max");
  form.elements.title.value = original?.title || "";
  form.elements.date.value = original?.date || date;
  form.elements.activity.value = original?.activity || "Силовая";
  form.elements.duration.value = original?.completedAt && original?.startedAt ? Math.max(1, Math.round((original.completedAt - original.startedAt) / 60000)) : "";
  form.elements.duration.parentElement.hidden = original?.status === "active";
  document.querySelector("#workout-record .flow-title").textContent = original ? "Изменить тренировку" : kind === "plan" ? "Запланировать тренировку" : "Записать тренировку";
  document.querySelector("#workout-record .flow-subtitle").textContent = kind === "plan"
    ? "Достаточно названия и даты. Упражнения, веса и подходы можно добавить позже."
    : "Измени дату, название, упражнения и подходы. Результаты в истории и статистике обновятся.";
  document.querySelector(".record-save").textContent = original ? "Сохранить изменения" : kind === "plan" ? "Сохранить план" : "Сохранить тренировку";
  document.querySelector(".record-back").href = returnTo || (kind === "plan" ? "#calendar" : "#overview");
  document.querySelector("#record-exercises").replaceChildren();
  if (original?.exercises.length) original.exercises.forEach(exercise => addRecordedExercise(exercise));
  else if (kind !== "plan" && !recordWizard) addRecordedExercise();
  renderRecordWizard();
  updateRecordedFields();
  location.hash = "#workout-record";
}
function availablePlans() { return data.plans.filter(plan => !data.sessions.some(session => session.planId === plan.id)); }
function startCalendarPlan(plan) {
  if (activeSession()) { location.hash = "#workout-live"; return; }
  const startedAt = Date.now();
  const session = {
    id: uid(), planId: plan.id, title: plan.title, date: today(), activity: plan.activity,
    focusGroup: focusGroup(plan), status: "active", createdAt: startedAt, startedAt,
    exercises: plan.exercises.map(exercise => ({
      id: uid(), name: exercise.name, group: exercise.group, comment: exercise.comment || "",
      plannedSets: exercise.sets.length || 3, plannedTargets: exercise.sets.map(set => ({ weight: set.weight, reps: set.reps })), sets: [],
    })),
  };
  session.currentExerciseId = session.exercises[0]?.id;
  data.sessions.push(session); data.plans = data.plans.filter(entry => entry.id !== plan.id);
  save(); render(); location.hash = "#workout-live";
}
function renderCalendar() {
  const grid = document.querySelector("#calendar-grid"); if (!grid) return;
  const month = new Date(calendarYear, calendarMonth, 1);
  document.querySelector("#calendar-month").textContent = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  grid.replaceChildren();
  const offset = (month.getDay() + 6) % 7;
  for (let index = 0; index < offset; index++) grid.append(element("span", "calendar-blank"));
  const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const plans = availablePlans();
  for (let day = 1; day <= days; day++) {
    const date = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const done = data.sessions.some(session => session.date === date && session.status !== "active");
    const planned = plans.some(plan => plan.date === date);
    const button = element("button", "calendar-date" + (done ? " has-workout" : "") + (planned ? " has-plan" : "") + (date === calendarDate ? " selected" : "") + (date === today() ? " is-today" : ""), String(day));
    button.type = "button"; button.dataset.date = date;
    button.setAttribute("aria-label", new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) + (done ? ", тренировка завершена" : "") + (planned ? ", есть план" : ""));
    button.setAttribute("aria-pressed", String(date === calendarDate));
    button.addEventListener("click", () => {
      calendarDate = date;
      renderCalendar();
      openCalendarWorkoutChoice(date);
    });
    grid.append(button);
  }
  document.querySelector("#calendar-day-title").textContent = new Date(calendarDate + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const list = document.querySelector("#calendar-day-list"); list.replaceChildren();
  const sessions = data.sessions.filter(session => session.date === calendarDate);
  const dailyPlans = plans.filter(plan => plan.date === calendarDate);
  sessions.forEach(session => {
    list.append(sessionRow(session, true));
    if (session.status === "active") { const resume = element("a", "small-button", "Продолжить тренировку"); resume.href = "#workout-live"; list.append(resume); }
  });
  dailyPlans.forEach(plan => {
    const card = element("article", "calendar-plan");
    card.append(element("small", "", "ЗАПЛАНИРОВАНО"), element("h4", "", plan.title));
    card.append(element("p", "", plan.exercises.map(exercise => exercise.name).join(" · ") || "Упражнения можно добавить позже"));
    const actions = element("div", "calendar-plan-actions");
    const edit = element("button", "small-button", "Изменить"); edit.type = "button";
    edit.addEventListener("click", () => openWorkoutEditor("plan", plan, plan.date, "#calendar"));
    const start = element("button", "small-button", "Начать"); start.type = "button"; start.addEventListener("click", () => startCalendarPlan(plan));
    const remove = element("button", "text-button danger", "Удалить"); remove.type = "button";
    remove.addEventListener("click", () => { if (!confirm("Удалить план тренировки?")) return; data.plans = data.plans.filter(entry => entry.id !== plan.id); save(); renderCalendar(); });
    actions.append(edit, start, remove); card.append(actions); list.append(card);
  });
  if (!sessions.length && !dailyPlans.length) empty(list, "На эту дату тренировок пока нет. Нажми дату или плюс, чтобы записать тренировку или составить план.");
}
function openCalendarWorkoutChoice(date) {
  let dialog = document.querySelector("#calendar-workout-choice");
  if (!dialog) {
    dialog = element("dialog", "calendar-workout-choice"); dialog.id = "calendar-workout-choice";
    document.body.append(dialog);
  }
  dialog.replaceChildren();
  const header = element("div", "panel-head");
  header.append(element("h3", "", "Добавить тренировку"));
  const close = element("button", "icon-button", "×"); close.type = "button"; close.setAttribute("aria-label", "Закрыть");
  close.addEventListener("click", () => dialog.close()); header.append(close);
  const caption = element("p", "calendar-choice-date", new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }));
  caption.id = "calendar-choice-date"; dialog.setAttribute("aria-labelledby", caption.id);
  dialog.append(header, caption);
  for (const [kind, title, description] of [["session", "Записать выполненную", "Уже тренировался — добавить подходы и результаты."], ["plan", "Запланировать тренировку", "Записать план. Он не попадёт в статистику выполненных."]]) {
    const button = element("button", "calendar-choice-option"); button.type = "button"; button.dataset.kind = kind;
    button.append(element("strong", "", title), element("span", "", description));
    button.addEventListener("click", () => { dialog.close(); openWorkoutEditor(kind, null, date, "#calendar"); });
    dialog.append(button);
  }
  dialog.showModal();
}
function initCalendar() {
  document.querySelector("#calendar-add").addEventListener("click", () => openCalendarWorkoutChoice(calendarDate));
  for (const [id, direction] of [["calendar-prev", -1], ["calendar-next", 1]]) {
    document.querySelector("#" + id).addEventListener("click", () => {
      const date = new Date(calendarYear, calendarMonth + direction, 1);
      calendarYear = date.getFullYear(); calendarMonth = date.getMonth();
      calendarDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-01`; renderCalendar();
    });
  }
  document.querySelector("#calendar-today").addEventListener("click", () => {
    calendarDate = today(); calendarYear = new Date().getFullYear(); calendarMonth = new Date().getMonth(); renderCalendar();
  });
  document.querySelector("#hero-record").addEventListener("click", event => { event.preventDefault(); openWorkoutEditor(); });
}

function navigate() {
  const requested = location.hash.slice(1);
  const page = ["overview", "training", "nutrition", "learn", "workout-flow", "workout-live", "workout-result", "workout-record", "calendar", "progression"].includes(requested) ? requested : "overview";
  if (page === "workout-record" && !workoutEdit) openWorkoutEditor();
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === page));
  document.body.classList.toggle("immersive", ["workout-flow", "workout-live", "workout-result", "workout-record"].includes(page));
  document.body.classList.toggle("workout-navigation", page === "workout-live");
  document.querySelectorAll("[data-page]").forEach(node => {
    const active = node.dataset.page === (["workout-live", "calendar", "progression"].includes(page) ? "training" : page);
    node.classList.toggle("active", active);
    if (active) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current");
  });
  document.querySelector("#page-title").textContent = ({ overview: "Обзор", training: "Тренировки", nutrition: "Питание", learn: "База знаний", "workout-flow": "Новая тренировка", "workout-live": "Тренировка", "workout-result": "Результат", "workout-record": "Записать тренировку", calendar: "Календарь", progression: "Прогрессия" })[page];
  window.scrollTo(0, 0);
}


function initTheme() {
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-theme-choice]");
  function apply(theme) {
    root.dataset.theme = theme;
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme)));
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#101714" : "#f5f5f0";
  }
  apply(root.dataset.theme === "dark" ? "dark" : "light");
  buttons.forEach(button => button.addEventListener("click", () => {
    apply(button.dataset.themeChoice);
    try { localStorage.setItem("temp-theme-v1", button.dataset.themeChoice); } catch {}
  }));
}


function customExerciseCard(entry) {
  const card = element("details", "exercise-guide custom-exercise-guide");
  const heading = element("summary");
  const title = element("div");
  title.append(element("h4", "", entry.name), element("p", "", "Моё упражнение"));
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m6 9 6 6 6-6"); icon.append(path); heading.append(title, icon);
  const body = element("div", "exercise-guide-body");
  body.append(element("h5", "", "Как выполнять"), element("p", "custom-exercise-description", entry.description || "Описание пока не добавлено."));
  card.append(heading, body); return card;
}
function updateLibraryCounts() {
  for (const [id, group] of Object.entries(LIBRARY_GROUPS)) {
    const count = EXERCISE_LIBRARY.filter(entry => recordGroupMatches(entry, group)).length;
    document.querySelector('[data-muscle="' + id + '"] span').textContent = count;
    document.querySelector("#muscle-" + id + " .section-heading p").textContent = count + " упражнений";
  }
}
function initCustomExercises() {
  for (const entry of customExercises) {
    const id = Object.keys(LIBRARY_GROUPS).find(key => LIBRARY_GROUPS[key] === entry.group);
    document.querySelector("#muscle-" + id + " .exercise-library-list").append(customExerciseCard(entry));
  }
  updateLibraryCounts();
  const section = element("div", "library-add");
  const toggle = element("button", "button button-dark library-add-toggle", "Добавить упражнение");
  toggle.type = "button"; toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", "library-add-form");
  const form = element("form", "panel library-add-form"); form.id = "library-add-form"; form.hidden = true;
  form.append(element("h3", "", "Своё упражнение"));
  const nameLabel = element("label", "", "Название упражнения");
  const name = element("input"); name.name = "name"; name.required = true; name.maxLength = 80; name.placeholder = "Например, тяга в любимом тренажёре"; nameLabel.append(name);
  const groupLabel = element("label", "", "Группа мышц");
  const group = element("select"); group.name = "group";
  for (const [id, value] of Object.entries(LIBRARY_GROUPS)) {
    const option = element("option", "", value === "Кор" ? "Пресс и корпус" : value); option.value = value; group.append(option);
  }
  groupLabel.append(group);
  const textLabel = element("label", "", "Как выполнять — необязательно");
  const description = element("textarea"); description.name = "description"; description.rows = 4; description.maxLength = 2000;
  description.placeholder = "Исходное положение, движение и детали техники"; textLabel.append(description);
  const actions = element("div", "library-add-actions");
  const submit = element("button", "small-button", "Сохранить упражнение"); submit.type = "submit";
  const cancel = element("button", "text-button", "Отмена"); cancel.type = "button"; actions.append(submit, cancel);
  const status = element("p", "form-help library-add-status"); status.setAttribute("role", "status");
  function close() { form.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden; toggle.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) {
      const selected = document.querySelector('[data-muscle][aria-pressed="true"]');
      group.value = LIBRARY_GROUPS[selected?.dataset.muscle] || "Ноги";
      name.focus();
    }
  });
  cancel.addEventListener("click", close);
  name.addEventListener("input", () => name.setCustomValidity(""));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const value = name.value.trim();
    if (!value || EXERCISE_LIBRARY.some(entry => exerciseKey(entry.name) === exerciseKey(value))) {
      name.setCustomValidity(value ? "Упражнение с таким названием уже есть." : "Укажи название упражнения.");
      name.reportValidity(); return;
    }
    const entry = { id: uid(), name: value, group: group.value, description: description.value.trim() };
    const updated = [...customExercises, entry];
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(updated));
    customExercises.push(entry); EXERCISE_LIBRARY.push(entry); CATALOG.push(entry.name);
    GROUP_BY_EXERCISE.set(exerciseKey(entry.name), entry.group);
    const id = Object.keys(LIBRARY_GROUPS).find(key => LIBRARY_GROUPS[key] === entry.group);
    document.querySelector("#muscle-" + id + " .exercise-library-list").append(customExerciseCard(entry));
    updateLibraryCounts();
    document.querySelector('[data-muscle="' + id + '"]').click();
    form.reset(); close(); status.textContent = "Упражнение сохранено и доступно при выборе тренировки.";
  });
  form.append(nameLabel, groupLabel, textLabel, actions);
  section.append(toggle, form, status);
  document.querySelector("#knowledge-exercises").insertBefore(section, document.querySelector(".library-note"));
}

function initKnowledgeLibrary() {
  const tabs = [...document.querySelectorAll(".knowledge-tabs [role=tab]")];
  function selectTab(tab) {
    tabs.forEach(button => {
      const selected = button === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault(); selectTab(tabs[next]); tabs[next].focus();
    });
  });
  const filters = document.querySelectorAll("[data-muscle]");
  filters.forEach(button => button.addEventListener("click", () => {
    filters.forEach(filter => {
      const selected = filter === button;
      filter.setAttribute("aria-pressed", String(selected));
      document.getElementById(filter.getAttribute("aria-controls")).hidden = !selected;
    });
  }));
}

initKnowledgeLibrary();
initCustomExercises();
initTheme();
document.querySelector("#today-label").textContent = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
document.querySelector("#workout-date").value = today();
document.querySelector("#food-date").value = today();
document.querySelector("#food-view-date").value = today();
document.querySelector("#food-view-date").addEventListener("change", renderFood);
document.querySelector("#exercise-select").addEventListener("change", event => { selectedExercise = event.currentTarget.value; renderExerciseHistory(); });
document.querySelector("#auto-rest").addEventListener("change", event => { autoRest = event.currentTarget.checked; localStorage.setItem(AUTO_REST_KEY, String(autoRest)); });
document.querySelector("#hero-start").addEventListener("click", event => {
  event.preventDefault();
  if (activeSession()) location.hash = "#workout-live";
  else if (repeatCandidate()) startFlowSession(repeatCandidate());
  else openFlow();
});
document.querySelector("#hero-new").addEventListener("click", () => openFlow());
document.querySelector("#training-start").addEventListener("click", () => openFlow());
document.querySelector("#flow-next").addEventListener("click", flowNext);
document.querySelector("#flow-back").addEventListener("click", () => { if (flowDraft.step === 1) location.hash = "#overview"; else { flowDraft.step--; renderFlow(); window.scrollTo(0, 0); } });
document.querySelector("#flow-close").addEventListener("click", () => location.hash = "#overview");
initLiveExerciseReordering();
document.querySelector("#live-finish").addEventListener("click", () => { document.querySelector("#live-confirm").hidden = false; document.querySelector("#live-confirm-cancel").focus(); });
document.querySelector("#live-confirm-cancel").addEventListener("click", () => document.querySelector("#live-confirm").hidden = true);
document.querySelector("#live-confirm-yes").addEventListener("click", finishLiveWorkout);
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
initNutrition({ data, save, render, today, uid });
initProgression({ data, today });
window.addEventListener("hashchange", navigate);
setInterval(() => { renderTimer(); updateLiveDuration(); renderLiveRest(); }, 1000);
initRecordedWorkout();
initCalendar();
render(); navigate();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
