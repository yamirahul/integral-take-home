import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

// GET /api/auth/me — "who am I?" for the logged-in user. Pages/components use this to
// render the right thing for a Patient vs a Reviewer without re-deriving auth logic.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  return NextResponse.json(user);
}
