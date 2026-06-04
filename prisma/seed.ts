import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo_tenant" },
    update: {},
    create: {
      id: "demo_tenant",
      name: "Demo Ecommerce Tenant",
      shops: {
        create: {
          id: "demo_shop",
          name: "Demo Fashion Store",
        },
      },
    },
  });

  console.log(`Seeded tenant ${tenant.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
