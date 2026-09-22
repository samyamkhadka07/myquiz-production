import { NextResponse } from "next/server";

// Kept only to make retired scheduler requests explicit; no processing job can be dispatched.
export async function GET() { return NextResponse.json({ error: "DOCUMENT_PROCESSING_RETIRED" }, { status: 410 }); }
