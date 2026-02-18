import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const INTAKES_FILE = path.join(DATA_DIR, "intakes.json");

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // already exists
  }
}

async function getIntakes(): Promise<Record<string, unknown>[]> {
  try {
    const data = await fs.readFile(INTAKES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, email, chargeType } = body;

    if (!firstName || !email || !chargeType) {
      return NextResponse.json(
        { error: "Required fields missing" },
        { status: 400 }
      );
    }

    await ensureDataDir();
    const intakes = await getIntakes();

    intakes.push({
      ...body,
      timestamp: new Date().toISOString(),
    });

    await fs.writeFile(INTAKES_FILE, JSON.stringify(intakes, null, 2));

    return NextResponse.json({ message: "Intake received" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
