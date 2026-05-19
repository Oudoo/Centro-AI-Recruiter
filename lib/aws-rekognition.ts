// AWS Rekognition wrapper for ID verification.
// CompareFaces takes a source image (ID document with face) and a target image
// (live selfie) and returns a similarity score 0-100. We treat ≥ threshold as verified.
//
// Region note: Rekognition is NOT available in me-south-1 (Bahrain). Frankfurt
// (eu-central-1) is the closest supported region for Egypt-based candidates.

import {
  RekognitionClient,
  CompareFacesCommand,
  DetectFacesCommand
} from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({
  region: process.env.AWS_REGION || "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
  }
});

export type FaceMatchResult = {
  verified: boolean;
  confidence: number; // 0-100 — similarity between ID face and selfie face
  threshold: number;
  hasFaceInId: boolean;
  hasFaceInSelfie: boolean;
  failureReason?: string;
};

export async function compareIdToSelfie(args: {
  idImage: Buffer;
  selfieImage: Buffer;
}): Promise<FaceMatchResult> {
  const threshold = parseFloat(
    process.env.AWS_REKOGNITION_MATCH_THRESHOLD ?? "85"
  );

  const command = new CompareFacesCommand({
    SourceImage: { Bytes: args.idImage },
    TargetImage: { Bytes: args.selfieImage },
    SimilarityThreshold: threshold,
    QualityFilter: "AUTO"
  });

  let response;
  try {
    response = await client.send(command);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Rekognition throws InvalidImageFormatException if the bytes aren't a recognised
    // image, InvalidParameterException if no face is detected on the SOURCE. Surface
    // these as structured failures rather than 500s so the candidate sees a clear
    // "couldn't see the face on your ID — try a clearer photo" message.
    if (/InvalidParameterException/i.test(msg)) {
      return {
        verified: false,
        confidence: 0,
        threshold,
        hasFaceInId: false,
        hasFaceInSelfie: false,
        failureReason:
          "Couldn't detect a face on the ID document. Make sure the ID is well-lit, in focus, and the photo on it is visible."
      };
    }
    throw err;
  }

  const sourceFace = response.SourceImageFace;
  const matches = response.FaceMatches ?? [];
  const unmatched = response.UnmatchedFaces ?? [];

  const hasFaceInId = !!sourceFace;
  const hasFaceInSelfie = matches.length + unmatched.length > 0;

  if (!hasFaceInId) {
    return {
      verified: false,
      confidence: 0,
      threshold,
      hasFaceInId: false,
      hasFaceInSelfie,
      failureReason:
        "Couldn't detect a face on the ID document. Try a clearer photo of the ID."
    };
  }

  if (!hasFaceInSelfie) {
    return {
      verified: false,
      confidence: 0,
      threshold,
      hasFaceInId: true,
      hasFaceInSelfie: false,
      failureReason:
        "Couldn't detect a face in the selfie. Make sure your face is centred, well-lit, and unobstructed."
    };
  }

  const bestMatch = matches[0];
  const confidence = bestMatch?.Similarity ?? 0;

  return {
    verified: confidence >= threshold,
    confidence,
    threshold,
    hasFaceInId: true,
    hasFaceInSelfie: true,
    failureReason:
      matches.length === 0
        ? "Face detected but doesn't match the ID. Could be a different person, poor photo quality, or the face on the ID is too small. Try a clearer selfie."
        : confidence < threshold
          ? `Face match confidence ${confidence.toFixed(1)}% is below the ${threshold}% threshold.`
          : undefined
  };
}

/**
 * Diagnostic helper — confirm a single image contains a face. Used in pre-flight
 * checks on the selfie before submitting the comparison.
 */
export async function detectFacesInImage(
  image: Buffer
): Promise<{ count: number; quality: "good" | "low" | "unknown" }> {
  try {
    const response = await client.send(
      new DetectFacesCommand({
        Image: { Bytes: image },
        Attributes: ["DEFAULT"]
      })
    );
    const faces = response.FaceDetails ?? [];
    if (faces.length === 0) return { count: 0, quality: "unknown" };
    const sharpness = faces[0]?.Quality?.Sharpness ?? 50;
    const brightness = faces[0]?.Quality?.Brightness ?? 50;
    const quality: "good" | "low" =
      sharpness > 50 && brightness > 30 && brightness < 95 ? "good" : "low";
    return { count: faces.length, quality };
  } catch {
    return { count: 0, quality: "unknown" };
  }
}
