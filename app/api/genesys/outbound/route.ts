import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candidateName, candidatePhone, position } = body as {
      candidateName?: string;
      candidatePhone?: string;
      position?: string;
    };

    if (!candidatePhone) {
      return NextResponse.json(
        { error: "candidatePhone is required" },
        { status: 400 }
      );
    }

    const mockCallId = `genesys-call-${Math.floor(100000 + Math.random() * 900000)}`;

    console.log("====================================================");
    console.log(`[GENESYS OUTBOUND DIALER - AGENTLESS CALL MOCK]`);
    console.log(`Call ID: ${mockCallId}`);
    console.log(`Target Phone: ${candidatePhone}`);
    console.log(`Candidate Name: ${candidateName ?? "Unknown Candidate"}`);
    console.log(`Position Context: ${position ?? "Customer Success Representative"}`);
    console.log(`Status: Connecting...`);
    console.log(`Message Body:`);
    console.log(
      `  "Hello ${candidateName ?? "there"}, this is the Centro AI Autonomous Recruiter. We are calling you regarding your application for the ${position ?? "Customer Success Representative"} position. An invitation link has been dispatched to your number via WhatsApp. Please book your screening slot to continue."`
    );
    console.log(`[GENESYS MOCK] Dispatch successful!`);
    console.log("====================================================");

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return NextResponse.json({
      ok: true,
      success: true,
      mode: "mock",
      callId: mockCallId,
      message: `Mock agentless outbound call successfully dispatched to ${candidatePhone}`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/genesys/outbound POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
