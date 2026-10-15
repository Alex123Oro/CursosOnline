import { prisma } from '../../config/prisma.js';

export const participantTypeService = {
  async list() {
    const types = await prisma.participantType.findMany({
      orderBy: { id: 'asc' }
    });

    // Older installations may not have run the complete participant seed.
    if (!types.some(type => /^externos?$/i.test(type.name.trim()))) {
      const external = await prisma.participantType.upsert({
        where: { name: 'Externo' }, update: {}, create: { name: 'Externo' }
      });
      types.push(external);
    }

    return types.map(type => ({
      id: String(type.id),
      name: type.name
    }));
  }
};
