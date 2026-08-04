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

  // 3. Catálogo de productos / Lista de Precios inicial
  const productsData = [
    {
      code: 'PROD-001',
      name: 'Notebook Pro 15"',
      category: 'Computación',
      description: 'Procesador i7, 16GB RAM, SSD 512GB',
      price: 899.99,
      stock: 25
    },
    {
      code: 'PROD-002',
      name: 'Smartphone X12 128GB',
      category: 'Celulares',
      description: 'Pantalla OLED 6.5", Cámara 50MP',
      price: 499.50,
      stock: 40
    },
    {
      code: 'PROD-003',
      name: 'Teclado Mecánico RGB',
      category: 'Accesorios',
      description: 'Switches Red, Conexión USB-C / Bluetooth',
      price: 65.00,
      stock: 100
    },
    {
      code: 'PROD-004',
      name: 'Monitor 4K 27" IPS',
      category: 'Monitores',
      description: 'Respuesta 1ms, HDR400, 144Hz',
      price: 320.00,
      stock: 15
    },
    {
      code: 'PROD-005',
      name: 'Auriculares Noise Cancelling',
      category: 'Audio',
      description: 'Cancelación activa de ruido, 30h de batería',
      price: 110.00,
      stock: 60
    }
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: p
    });
  }

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
