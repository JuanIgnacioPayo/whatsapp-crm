import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Sembrando base de datos inicial...');

  // 1. Operadores por defecto
  const op1 = await prisma.user.upsert({
    where: { email: 'carlos@crm.com' },
    update: {},
    create: {
      name: 'Carlos Gómez (Ventas)',
      email: 'carlos@crm.com',
      role: 'OPERATOR',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
    }
  });

  const op2 = await prisma.user.upsert({
    where: { email: 'sofia@crm.com' },
    update: {},
    create: {
      name: 'Sofía Martínez (Soporte)',
      email: 'sofia@crm.com',
      role: 'OPERATOR',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100'
    }
  });

  // 2. Etiquetas por defecto
  const tagsData = [
    { name: 'Mayorista', color: '#10B981' },
    { name: 'Minorista', color: '#3B82F6' },
    { name: 'Soporte', color: '#F59E0B' },
    { name: 'VIP', color: '#8B5CF6' },
    { name: 'Urgente', color: '#EF4444' }
  ];

  for (const t of tagsData) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: {},
      create: t
    });
  }

  // 3. Catálogo de productos (Vacío para producción)
  const productsData: any[] = [];

  console.log('✅ Base de datos sembrada con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
