// Identifica a janela de coleta (T08/T20) no horário de São Paulo (UTC-03:00 fixo desde 2019).
import { ENDS_AT } from "./build.mjs";

const OFFSET_MS = 3 * 3600e3;

export function runSlot(now) {
  const brt = new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 19); // "YYYY-MM-DDTHH:MM:SS" em BRT
  const hour = Number(brt.slice(11, 13));
  const slot = hour < 14 ? "08" : "20";
  return {
    runId: `${brt.slice(0, 10)}T${slot}`,
    period: slot === "08" ? "manhã" : "noite",
    nowBrt: `${brt}-03:00`,
    expired: now > new Date(ENDS_AT),
  };
}
