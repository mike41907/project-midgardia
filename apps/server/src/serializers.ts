import type { Character } from "@prisma/client";
import type { CharacterSummary } from "@midgardia/shared";
import { directionOrSouth } from "./types";

export function serializeCharacter(character: Character): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    gender: character.gender,
    hair: character.hair,
    hairColor: character.hairColor,
    baseLevel: character.baseLevel,
    jobLevel: character.jobLevel,
    baseExp: character.baseExp,
    jobExp: character.jobExp,
    mapId: character.mapId,
    x: character.x,
    y: character.y,
    facing: directionOrSouth(character.facing),
    isSitting: character.isSitting,
  };
}
