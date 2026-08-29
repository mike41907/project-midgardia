import type { Request } from "express";
import type { Direction8 } from "@midgardia/shared";

export interface AuthenticatedRequest extends Request {
  auth?: {
    accountId: string;
    username: string;
  };
}

export function directionOrSouth(value: string): Direction8 {
  const directions: Direction8[] = [
    "south",
    "southEast",
    "east",
    "northEast",
    "north",
    "northWest",
    "west",
    "southWest",
  ];
  return directions.includes(value as Direction8) ? (value as Direction8) : "south";
}
