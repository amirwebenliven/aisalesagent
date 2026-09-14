/**
 * Set (or reset) a user's password from the terminal.
 *
 *   bun scripts/set-password.ts huzefaraja53@gmail.com MyPassw0rd
 *
 * The seed creates users without a password because the seed has no business
 * inventing credentials. Use this to give a seeded account a way in, or to
 * recover an account before password reset exists.
 */
import { prisma } from "../lib/db";
import { hashPassword, normalizeEmail } from "../lib/auth";

const [, , rawEmail, password] = process.argv;

if (!rawEmail || !password) {
  console.error("Usage: bun scripts/set-password.ts <email> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const email = normalizeEmail(rawEmail);

const user = await prisma.user.findUnique({
  where: { email },
  include: { memberships: { include: { organization: true } } },
});

if (!user) {
  console.error(`No user with email "${email}".`);
  const all = await prisma.user.findMany({ select: { email: true } });
  if (all.length) console.error(`Known users: ${all.map((u) => u.email).join(", ")}`);
  else console.error("There are no users at all — run: bun prisma/seed.ts");
  process.exit(1);
}

await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash: await hashPassword(password) },
});

const orgs = user.memberships.map((m) => `${m.organization.name} (${m.role})`).join(", ");
console.log(`\nPassword set for ${email}`);
console.log(`Workspaces: ${orgs || "none — this account has no organization and cannot sign in"}`);
console.log(`\nSign in at http://localhost:3000/login\n`);

await prisma.$disconnect();
