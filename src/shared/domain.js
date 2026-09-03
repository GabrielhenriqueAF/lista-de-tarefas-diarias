export function minutesBetween(startedAt, finishedAt) {
  return Math.round((new Date(finishedAt) - new Date(startedAt)) / 60000);
}
