import { PrismaClient } from "@prisma/client";
import { MAPS } from "@midgardia/game-data";

const prisma = new PrismaClient();

async function main() {
  for (const map of Object.values(MAPS)) {
    await prisma.map.upsert({
      where: { id: map.id },
      update: {
        name: map.name,
        width: map.width,
        height: map.height,
        tileSize: map.tileSize,
        blockedJson: JSON.stringify(map.blocked),
        portalsJson: JSON.stringify(map.portals),
      },
      create: {
        id: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        tileSize: map.tileSize,
        blockedJson: JSON.stringify(map.blocked),
        portalsJson: JSON.stringify(map.portals),
      },
    });

    for (const npc of map.npcs) {
      await prisma.npc.upsert({
        where: { id: npc.id },
        update: {
          mapId: map.id,
          name: npc.name,
          role: npc.role,
          x: npc.x,
          y: npc.y,
          dialogJson: JSON.stringify(npc.pages),
        },
        create: {
          id: npc.id,
          mapId: map.id,
          name: npc.name,
          role: npc.role,
          x: npc.x,
          y: npc.y,
          dialogJson: JSON.stringify(npc.pages),
        },
      });
    }
  }
  console.log(`Seeded ${Object.keys(MAPS).length} maps and ${Object.values(MAPS).reduce((total, map) => total + map.npcs.length, 0)} NPCs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
