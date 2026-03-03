import { NextRequest, NextResponse } from "next/server";
import { searchVault } from "@/lib/vault/vaultIndex";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const type = searchParams.get("type") || undefined;
    const limit = parseInt(searchParams.get("limit") || "10");

    const results = await searchVault({
      query: q,
      visualType: type,
      limit,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Vault search failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
