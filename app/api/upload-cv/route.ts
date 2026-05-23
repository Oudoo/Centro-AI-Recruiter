import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile, parseCV } from "@/lib/cv-parser";
import { getNameSimilarity } from "@/lib/fuzzy";

export const maxDuration = 120; // CV parsing + Claude extraction can take a while

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const idNameEnglish = (formData.get("idNameEnglish") as string) ?? "";
    const sessionId = (formData.get("sessionId") as string) ?? "";

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded. Please select a PDF or DOCX file." },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    if (!allowedTypes.some((t) => file.type.includes(t)) && !file.name.match(/\.(pdf|docx?)$/i)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX file." },
        { status: 400 }
      );
    }

    // Validate file size (10MB max for CVs)
    if (file.size > 10_000_000) {
      return NextResponse.json(
        { error: "File is too large (max 10MB). Please use a smaller file." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from the document
    const rawText = await extractTextFromFile(buffer, file.type);

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not extract text from the file. The document may be image-based or empty. Please upload a text-based PDF or DOCX." },
        { status: 400 }
      );
    }

    // Parse structured fields from the CV text
    const parsed = await parseCV(rawText);

    // Fuzzy name matching if we have an ID name to compare against
    let discrepancyFlag = false;
    let nameSimilarity = 100;
    if (idNameEnglish && parsed.fullName) {
      nameSimilarity = getNameSimilarity(parsed.fullName, idNameEnglish);
      if (nameSimilarity < 75) {
        discrepancyFlag = true;
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      parsed,
      nameSimilarity,
      discrepancyFlag,
      idNameEnglish,
      cvName: parsed.fullName,
      rawTextLength: rawText.length
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/upload-cv error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
