import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";
import bcrypt from "bcryptjs";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "sanga@sangsangwoori.com" } });
  if (!existing) {
    const hash = await bcrypt.hash("sangsangwoori0618", 12);
    await prisma.user.create({
      data: {
        email: "sanga@sangsangwoori.com",
        name: "상상우리 관리자",
        passwordHash: hash,
        role: "super_admin",
        centerScope: "ALL",
        isActive: true,
      },
    });
    console.log("✓ 관리자 계정 생성: sanga@sangsangwoori.com");
  } else {
    console.log("관리자 계정이 이미 존재합니다.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
