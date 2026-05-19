import { NextRequest, NextResponse } from "next/server";
import { uploadToWorkDrive } from "@/lib/zoho-workdrive";
import { updateRecord } from "@/lib/zoho-creator";

// Vercel: allow longer for uploads of ~30 MB recordings
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const folderId = process.env.ZOHO_WORKDRIVE_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { error: "ZOHO_WORKDRIVE_FOLDER_ID not set in .env.local" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const sessionId = formData.get("sessionId");
    const creatorRecordId = formData.get("creatorRecordId");
    const candidateName = formData.get("candidateName");

    if (!(file instanceof Blob) || !sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: file + sessionId" },
        { status: 400 }
      );
    }

    const safeName =
      typeof candidateName === "string"
        ? candidateName.replace(/[^a-z0-9-_]+/gi, "_")
        : "candidate";
    const ext = file.type.includes("mp4") ? "mp4" : "webm";
    const filename = `centro-screening-${safeName}-${sessionId.slice(0, 8)}.${ext}`;

    console.log(
      `upload-recording: uploading ${filename} (${file.size} bytes) to WorkDrive folder ${folderId}`
    );

    const upload = await uploadToWorkDrive({
      parentFolderId: folderId,
      filename,
      blob: file
    });

    // Patch the Screening_Session record in Creator with the WorkDrive URL
    let creatorPatchError: string | null = null;
    if (typeof creatorRecordId === "string" && creatorRecordId.length > 0) {
      try {
        await updateRecord("All_Screening_Sessions", creatorRecordId, {
          Recording_URL: upload.permalink
        });
      } catch (err) {
        creatorPatchError = err instanceof Error ? err.message : String(err);
        console.error("upload-recording: Creator patch failed", err);
      }
    } else {
      creatorPatchError = "creatorRecordId not provided";
    }

    return NextResponse.json({
      ok: true,
      workdriveFileId: upload.fileId,
      workdrivePermalink: upload.permalink,
      filename: upload.filename,
      sizeBytes: upload.sizeBytes,
      creatorPatchError
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("upload-recording: route error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
