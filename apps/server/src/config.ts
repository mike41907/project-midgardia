import "dotenv/config";

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
}

export const config = {
  port: numberFromEnv(process.env.PORT, 3000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? "midgardia-development-secret-change-me",
  publicRegistration: booleanFromEnv(process.env.PUBLIC_REGISTRATION, true),
  baseExpRate: numberFromEnv(process.env.BASE_EXP_RATE, 5),
  jobExpRate: numberFromEnv(process.env.JOB_EXP_RATE, 5),
  dropRate: numberFromEnv(process.env.DROP_RATE, 3),
  cardDropRate: numberFromEnv(process.env.CARD_DROP_RATE, 3),
};

if (config.jwtSecret === "midgardia-development-secret-change-me") {
  console.warn("[security] JWT_SECRET is using the development fallback; set a private secret before LAN/VPS use.");
}
