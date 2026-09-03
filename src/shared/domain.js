export function minutesBetween(startedAt, finishedAt) {
  return Math.round((new Date(finishedAt) - new Date(startedAt)) / 60000);
}

export function assertTask(input) {
  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new Error('O título da tarefa é obrigatório.');
  }
}

export function assertSchedule(input) {
  const timePattern = /^\d{2}:\d{2}$/;
  const isValidWeekday = Number.isInteger(input.weekday) && input.weekday >= 0 && input.weekday <= 6;

  if (!isValidWeekday || !timePattern.test(input.startTime) || !timePattern.test(input.endTime) || input.endTime <= input.startTime) {
    throw new Error('O horário de término deve ser posterior ao horário de início.');
  }
}

export function dateForWeekday(weekStart, weekday) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const offsetFromMonday = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() + offsetFromMonday);
  return date.toISOString().slice(0, 10);
}
