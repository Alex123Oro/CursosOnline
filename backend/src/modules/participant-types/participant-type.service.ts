import { prisma } from '../../config/prisma.js';

export const participantTypeService = {
  async list() {
    const types = await prisma.participantType.findMany({
      orderBy: { id: 'asc' }
    });

    return types.map(type => ({
      id: String(type.id),
      name: type.name
    }));
  }
};
