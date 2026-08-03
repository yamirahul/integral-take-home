import { NextResponse } from "next/server";

// TODO: Implement intake API endpoints
// Import the Prisma client when you start querying:
//   import { prisma } from "@/lib/prisma";
// See src/app/api/users/route.ts for a working example.

export async function GET() {
  // TODO: Implement fetching intakes

  return NextResponse.json({ message: "TODO: Implement GET /api/intakes" });
}

// TODO: add a `request: Request` parameter once you need to read the request body
export async function POST() {
  // TODO: Implement creating intakes

  return NextResponse.json({ message: "TODO: Implement POST /api/intakes" }, { status: 501 });
}
