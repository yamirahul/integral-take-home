import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This endpoint is implemented for you as a working reference for the
// Prisma + route handler pattern. The remaining endpoints are yours to fill in.
export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}
