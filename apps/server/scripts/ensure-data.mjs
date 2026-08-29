import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(scriptDirectory, "../data");
const databasePath = path.join(dataDirectory, "midgardia.db");

mkdirSync(dataDirectory, { recursive: true });
if (!existsSync(databasePath)) {
  closeSync(openSync(databasePath, "w"));
  console.log(`[midgardia] created SQLite data file at ${databasePath}`);
}
