import path from "node:path";
import express, { type NextFunction, type Response } from "express";
import cors from "cors";
import type { PrismaClient } from "@prisma/client";
import { getMapDefinition, MAPS } from "@midgardia/game-data";
import { WORLD } from "@midgardia/shared";
import {
  hashPassword,
  isValidPassword,
  isValidUsername,
  issueToken,
  normalizeUsername,
  verifyPassword,
  verifyToken,
} from "./auth";
import { config } from "./config";
import { serializeCharacter } from "./serializers";
import type { AuthenticatedRequest } from "./types";

function bearerToken(request: AuthenticatedRequest): string | undefined {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  const token = bearerToken(request);
  if (!token) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }
  try {
    request.auth = verifyToken(token);
    next();
  } catch {
    response.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

function safeCharacterName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidCharacterName(name: string): boolean {
  return /^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff _-]{1,15}$/.test(name);
}

function sendServerError(response: Response, error: unknown): void {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "P2002") {
    response.status(409).json({ error: "That name is already in use." });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "The server could not complete that request." });
}

export function createApp(database: PrismaClient) {
  const app = express();
  const db = database;

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.clientOrigins.includes("*") || config.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      service: "midgardia-server",
      phase: 1,
      maps: Object.keys(MAPS).length,
      maxCharactersPerAccount: WORLD.maxCharactersPerAccount,
      time: Date.now(),
    });
  });

  app.post("/api/auth/register", async (request, response) => {
    if (!config.publicRegistration) {
      response.status(403).json({ error: "Public registration is disabled on this server." });
      return;
    }
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!isValidUsername(username)) {
      response.status(400).json({ error: "Username must be 3–24 lowercase letters, numbers, dots, dashes, or underscores." });
      return;
    }
    if (!isValidPassword(password)) {
      response.status(400).json({ error: "Password must be 8–128 characters." });
      return;
    }
    try {
      const account = await db.account.create({
        data: { username, passwordHash: await hashPassword(password) },
      });
      response.status(201).json({
        token: issueToken({ accountId: account.id, username: account.username }),
        account: { id: account.id, username: account.username },
      });
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      response.status(code === "P2002" ? 409 : 500).json({
        error: code === "P2002" ? "That username is already registered." : "Could not create the account.",
      });
    }
  });

  app.post("/api/auth/login", async (request, response) => {
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    try {
      const account = await db.account.findUnique({ where: { username } });
      if (!account || !(await verifyPassword(password, account.passwordHash))) {
        response.status(401).json({ error: "Username or password is incorrect." });
        return;
      }
      response.json({
        token: issueToken({ accountId: account.id, username: account.username }),
        account: { id: account.id, username: account.username },
      });
    } catch (error) {
      sendServerError(response, error);
    }
  });

  app.get("/api/characters", requireAuth, async (request: AuthenticatedRequest, response) => {
    try {
      const characters = await db.character.findMany({
        where: { accountId: request.auth!.accountId },
        orderBy: { createdAt: "asc" },
      });
      response.json({ characters: characters.map(serializeCharacter) });
    } catch (error) {
      sendServerError(response, error);
    }
  });

  app.post("/api/characters", requireAuth, async (request: AuthenticatedRequest, response) => {
    const name = safeCharacterName(request.body?.name);
    const gender = typeof request.body?.gender === "string" ? request.body.gender.slice(0, 24) : "androgynous";
    const hair = Number.isInteger(request.body?.hair) ? Math.max(1, Math.min(4, request.body.hair)) : 1;
    const hairColor = typeof request.body?.hairColor === "string" && /^#[0-9a-f]{6}$/i.test(request.body.hairColor)
      ? request.body.hairColor
      : "#e8bd77";
    if (!isValidCharacterName(name)) {
      response.status(400).json({ error: "Character names must be 2–16 letters, numbers, CJK characters, spaces, dashes, or underscores." });
      return;
    }
    try {
      const count = await db.character.count({ where: { accountId: request.auth!.accountId } });
      if (count >= WORLD.maxCharactersPerAccount) {
        response.status(409).json({ error: `Each account can have at most ${WORLD.maxCharactersPerAccount} characters.` });
        return;
      }
      const spawn = getMapDefinition("sunpetal-village").spawn;
      const character = await db.character.create({
        data: {
          name,
          gender,
          hair,
          hairColor,
          accountId: request.auth!.accountId,
          mapId: "sunpetal-village",
          x: spawn.x,
          y: spawn.y,
        },
      });
      response.status(201).json({ character: serializeCharacter(character) });
    } catch (error) {
      sendServerError(response, error);
    }
  });

  app.get("/api/world/maps", (_request, response) => {
    response.json({ maps: Object.values(MAPS) });
  });

  const clientDist = process.env.CLIENT_DIST ?? path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/", (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });

  return app;
}
