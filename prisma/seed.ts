import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.auditLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.user.deleteMany();

  // Create demo users
  const patientUser = await prisma.user.create({
    data: {
      email: "patient@demo.com",
      name: "Demo Patient",
      role: "PATIENT",
      organization: "Trial Participant",
    },
  });

  const reviewerUser = await prisma.user.create({
    data: {
      email: "reviewer@demo.com",
      name: "Dr. Sarah Chen",
      role: "REVIEWER",
      organization: "PharmaCorp Trial Coordinator",
    },
  });

  console.log("Created users:");
  console.log(
    `  - ${patientUser.email} (${patientUser.role}, ${patientUser.organization})`
  );
  console.log(
    `  - ${reviewerUser.email} (${reviewerUser.role}, ${reviewerUser.organization})`
  );

  // Create a sample clinical trial enrollment application
  const sampleIntake = await prisma.intake.create({
    data: {
      clientName: "Jane Martinez",
      clientEmail: "jane.martinez@example.com",
      clientPhone: "555-987-6543",
      dateOfBirth: "1978-06-22",
      ssn: "987-65-4321",
      description:
        "Applying for Phase III cardiovascular clinical trial. History of hypertension, currently on beta blockers. Interested in participating to access new treatment options.",
      notes: "Referred by cardiologist Dr. Johnson. Patient meets initial age and diagnosis criteria.",
      status: "PENDING",
      submittedById: patientUser.id,
    },
  });

  // Create an audit log entry for the sample application
  await prisma.auditLog.create({
    data: {
      action: "CREATED",
      details: JSON.stringify({ status: "PENDING" }),
      userId: patientUser.id,
      intakeId: sampleIntake.id,
    },
  });

  console.log("Created sample enrollment application:");
  console.log(`  - Application ID: ${sampleIntake.id}`);
  console.log(`  - Status: ${sampleIntake.status}`);
  console.log(`  - Submitted by: ${patientUser.email}`);

  console.log("\nSeeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
