const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  // Seed admin user
  const adminHash = await bcrypt.hash('admin123', 12)
  await prisma.admin.upsert({
    where: { email: 'admin@annam.com' },
    update: {},
    create: {
      email: 'admin@annam.com',
      password: adminHash,
      name: 'Admin User',
    },
  })
  console.log('✅ Admin seeded: admin@annam.com / admin123')

  // Seed demo candidate
  const userHash = await bcrypt.hash('candidate123', 12)
  await prisma.user.upsert({
    where: { email: 'candidate@example.com' },
    update: {},
    create: {
      email: 'candidate@example.com',
      name: 'Demo Candidate',
      password: userHash,
    },
  })
  console.log('✅ Demo candidate seeded: candidate@example.com / candidate123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
