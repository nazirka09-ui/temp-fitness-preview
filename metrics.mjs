export const GROUPS = ["Ноги", "Грудь", "Спина", "Плечи", "Руки", "Кор", "Ягодицы", "Другое"];
export const exerciseKey = name => String(name || "").trim().toLocaleLowerCase("ru-RU");
export const setVolume = set => Math.max(0, Number(set.weight) || 0) * Math.max(0, Number(set.reps) || 0);
export const volumeOfSets = sets => sets.reduce((total, set) => total + setVolume(set), 0);
export const estimatedMax = set => {
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  return weight > 0 && reps >= 1 && reps <= 12 ? reps === 1 ? weight : weight * (1 + reps / 30) : null;
};
export const dayDistance = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

export function repeatWorkoutCandidate(sessions, groupForSession) {
  const completed = sessions.filter(session => session.status !== "active" && session.exercises.some(exercise => exercise.sets.length))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const last = completed.at(-1);
  if (!last?.exercises.length) return null;
  const signature = session => `${groupForSession(session)}:${session.exercises.map(exercise => exerciseKey(exercise.name)).join("|")}`;
  return completed.filter(session => signature(session) === signature(last)).length >= 5 ? last : null;
}

export function exerciseHistory(sessions, name, omitSessionId = null) {
  const key = exerciseKey(name);
  return sessions.filter(session => session.id !== omitSessionId).flatMap(session =>
    session.exercises.filter(exercise => exerciseKey(exercise.name) === key && exercise.sets.length).map(exercise => {
      const weighted = exercise.sets.filter(set => Number(set.weight) > 0);
      const topWeight = weighted.length ? Math.max(...weighted.map(set => Number(set.weight))) : 0;
      return {
        sessionId: session.id, date: session.date, createdAt: session.createdAt || 0, name: exercise.name,
        group: exercise.group || "Другое", activity: session.activity, sets: exercise.sets, comment: exercise.comment || "",
        topWeight, repsAtTopWeight: Math.max(0, ...weighted.filter(set => Number(set.weight) === topWeight).map(set => Number(set.reps) || 0)),
        bestEstimate: Math.max(0, ...exercise.sets.map(set => estimatedMax(set) || 0)),
        volume: volumeOfSets(exercise.sets),
      };
    })
  ).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

export function sessionVolume(session) {
  return session.exercises.reduce((total, exercise) => total + volumeOfSets(exercise.sets), 0);
}
export function groupVolume(session, group) {
  return session.exercises.filter(exercise => (exercise.group || "Другое") === group).reduce((total, exercise) => total + volumeOfSets(exercise.sets), 0);
}
export function bestSet(sets) {
  return [...sets].sort((a, b) => (estimatedMax(b) || 0) - (estimatedMax(a) || 0) || Number(b.weight) - Number(a.weight) || Number(b.reps) - Number(a.reps))[0] || null;
}

export function suggestedGoal(history) {
  const last = history.at(-1);
  if (!last) return null;
  const source = bestSet(last.sets);
  if (!source) return null;
  const weight = Number(source.weight) || 0;
  const reps = Number(source.reps) || 0;
  if (!weight) return { weight, reps: reps + 1, reason: "Попробуй ещё одно повторение, если движение остаётся уверенным." };
  if (source.note === "до отказа" || source.note === "тяжело") return { weight, reps, reason: "Повтори результат с хорошей техникой; повышать нагрузку необязательно." };
  const sameWeight = last.sets.filter(set => Number(set.weight) === weight);
  const steady = sameWeight.length >= 3 && sameWeight.every(set => Number(set.reps) >= 10 && !["тяжело", "до отказа"].includes(set.note));
  const comfortable = sameWeight.length >= 2 && sameWeight.every(set => Number(set.reps) >= 8 && ["легко", "нормально"].includes(set.note));
  if (reps >= 8 && (steady || comfortable)) {
    return { weight: weight + (weight < 20 ? 1 : 2.5), reps, reason: "Небольшая прибавка, если техника и самочувствие позволяют." };
  }
  return { weight, reps: reps + 1, reason: "Попробуй одно дополнительное повторение с тем же весом." };
}

export function recordChanges(entry, previous) {
  if (!previous.length) return [];
  const changes = [];
  const maxWeight = Math.max(...previous.map(item => item.topWeight));
  if (entry.topWeight > maxWeight) changes.push("Новый максимальный вес");
  const priorBestAtSameWeight = new Map();
  for (const item of previous) for (const set of item.sets) {
    const weight = Number(set.weight) || 0;
    if (weight > 0) priorBestAtSameWeight.set(weight, Math.max(priorBestAtSameWeight.get(weight) || 0, Number(set.reps) || 0));
  }
  if (entry.sets.some(set => Number(set.weight) > 0 && priorBestAtSameWeight.has(Number(set.weight)) && Number(set.reps) > priorBestAtSameWeight.get(Number(set.weight)))) changes.push("Больше повторений с тем же весом");
  if (entry.bestEstimate > Math.max(...previous.map(item => item.bestEstimate), 0)) changes.push("Новая расчётная сила");
  if (entry.volume > Math.max(...previous.map(item => item.volume), 0)) changes.push("Наибольший объём упражнения");
  return changes;
}

export function sessionSummary(session, sessions) {
  const priorSessions = sessions.filter(item => item.id !== session.id && (item.date < session.date || item.date === session.date && (item.createdAt || 0) < (session.createdAt || 0)));
  const highlights = [];
  let records = 0;
  for (const exercise of session.exercises.filter(item => item.sets.length)) {
    const history = exerciseHistory(priorSessions, exercise.name);
    if (!history.length) continue;
    const current = exerciseHistory([session], exercise.name)[0];
    if (!current) continue;
    if (recordChanges(current, history).length) records += 1;
    const previous = history.at(-1);
    if (current.topWeight > previous.topWeight) highlights.push(`${exercise.name}: ${previous.topWeight} → ${current.topWeight} кг`);
    else if (current.repsAtTopWeight > previous.repsAtTopWeight && current.topWeight === previous.topWeight) highlights.push(`${exercise.name}: +${current.repsAtTopWeight - previous.repsAtTopWeight} повт. при ${current.topWeight} кг`);
    else if (previous.volume > 0 && current.volume > previous.volume) highlights.push(`${exercise.name}: объём +${Math.round((current.volume / previous.volume - 1) * 100)}%`);
  }
  const priorComparable = priorSessions.filter(item => session.templateId ? item.templateId === session.templateId : exerciseKey(item.title) === exerciseKey(session.title)).filter(item => sessionVolume(item) > 0).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).at(-1);
  const volume = sessionVolume(session);
  const previousVolume = priorComparable ? sessionVolume(priorComparable) : 0;
  const volumeChange = previousVolume > 0 && volume > 0 ? Math.round((volume / previousVolume - 1) * 100) : null;
  return { highlights, records, volume, previousVolume, volumeChange };
}

export function groupOverview(sessions, currentDate) {
  return GROUPS.filter(group => group !== "Другое").map(group => {
    const entries = sessions.filter(session => session.status !== "active" && groupVolume(session, group) > 0 && session.date <= currentDate).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const last = entries.at(-1);
    const recent = entries.filter(session => dayDistance(session.date, currentDate) >= 0 && dayDistance(session.date, currentDate) < 28);
    const older = entries.filter(session => dayDistance(session.date, currentDate) >= 28 && dayDistance(session.date, currentDate) < 56);
    const average = groupSessions => groupSessions.reduce((sum, session) => sum + groupVolume(session, group), 0) / groupSessions.length;
    const trend = recent.length && older.length && average(older) > 0 ? Math.round((average(recent) / average(older) - 1) * 100) : null;
    return { group, count: entries.length, daysSince: last ? dayDistance(last.date, currentDate) : null, trend, lastVolume: last ? groupVolume(last, group) : 0 };
  }).filter(item => item.count);
}

export function plateauDetected(history) {
  const values = history.slice(-5).map(item => item.bestEstimate);
  if (values.length < 5 || values.some(value => value <= 0)) return false;
  const first = values[0];
  return (Math.max(...values) - Math.min(...values)) / first <= 0.02 && values.at(-1) <= first * 1.02;
}
