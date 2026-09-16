// Portado verbatim de services/dateService.js do bot_padaria_v3.
const TIME_ZONE = 'America/Sao_Paulo';

function formatDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

/** "YYYY-MM-DD" de hoje no fuso do negócio — usado como ponto de partida do reprocesso. */
function hojeYMD() {
  return formatDateTime(new Date()).slice(0, 10);
}

/** "YYYY-MM-DD" de n dias antes de hoje, no fuso do negócio. */
function dataInicioReprocesso(diasReprocessar) {
  const hoje = new Date(`${hojeYMD()}T00:00:00-03:00`);
  hoje.setUTCDate(hoje.getUTCDate() - Math.max(0, diasReprocessar));
  return formatDateTime(hoje).slice(0, 10);
}

export { TIME_ZONE, formatDateTime, hojeYMD, dataInicioReprocesso };
