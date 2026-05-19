import { NextRequest, NextResponse } from "next/server";
import { compareIdToSelfie } from "@/lib/aws-rekognition";

export const maxDuration = 30;

const MAX_IMAGE_BYTES = 5_000_000; // Rekognition direct-bytes limit is 5MB per image

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const idImage = formData.get("idImage");
    const selfieImage = formData.get("selfieImage");

    if (!(idImage instanceof Blob) || !(selfieImage instanceof Blob)) {
      return NextResponse.json(
        { error: "Both 'idImage' and 'selfieImage' fields are required." },
        { status: 400 }
      );
    }

    if (
      idImage.size > MAX_IMAGE_BYTES ||
      selfieImage.size > MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          error: `Each image must be under ${MAX_IMAGE_BYTES / 1_000_000}MB. Compress and try again.`
        },
        { status: 400 }
      );
    }

    const idBuffer = Buffer.from(await idImage.arrayBuffer());
    const selfieBuffer = Buffer.from(await selfieImage.arrayBuffer());

    const result = await compareIdToSelfie({
      idImage: idBuffer,
      selfieImage: selfieBuffer
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/verify-identity error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
