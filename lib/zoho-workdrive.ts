// Zoho WorkDrive REST API wrapper for uploading session recordings.
// Reuses the Creator OAuth flow (shared refresh token, same Zoho One workspace).

import { getAccessToken, region, type ZohoRegion } from "./zoho-creator";

const workdriveApiHost: Record<ZohoRegion, string> = {
  us: "www.zohoapis.com",
  eu: "www.zohoapis.eu",
  in: "www.zohoapis.in",
  au: "www.zohoapis.com.au",
  jp: "www.zohoapis.jp",
  sa: "www.zohoapis.sa"
};

const workdriveWebHost: Record<ZohoRegion, string> = {
  us: "workdrive.zoho.com",
  eu: "workdrive.zoho.eu",
  in: "workdrive.zoho.in",
  au: "workdrive.zoho.com.au",
  jp: "workdrive.zoho.jp",
  sa: "workdrive.zoho.sa"
};

export type UploadResult = {
  fileId: string;
  permalink: string;
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
  raw: unknown;
};

/**
 * Upload a Blob to a WorkDrive folder. Uses multipart/form-data per the
 * `POST /workdrive/api/v1/upload` endpoint contract.
 */
export async function uploadToWorkDrive(args: {
  parentFolderId: string;
  filename: string;
  blob: Blob;
}): Promise<UploadResult> {
  const token = await getAccessToken();

  // WorkDrive upload uses multipart with `content` as the file field.
  // `parent_id` and `filename` are sent as form fields, not query params (some SDK
  // docs show query, but the production endpoint reliably accepts form fields).
  const formData = new FormData();
  formData.append("content", args.blob, args.filename);
  formData.append("parent_id", args.parentFolderId);
  formData.append("filename", args.filename);
  formData.append("override-name-exist", "true");

  const url = `https://${workdriveApiHost[region]}/workdrive/api/v1/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: formData
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(
      `WorkDrive upload failed (${res.status}): ${JSON.stringify(json)}`
    );
  }

  // WorkDrive response shape:
  // { data: [{ attributes: { "File INFO": "{...}", Permalink: "...", ... } }] }
  // The `File INFO` field is a JSON STRING (not object) — must double-parse.
  const data = (json as { data?: unknown[] }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`WorkDrive returned unexpected shape: ${JSON.stringify(json)}`);
  }
  const attrs = (data[0] as { attributes?: Record<string, unknown> }).attributes ?? {};
  let fileId = "";
  const rawFileInfo = attrs["File INFO"];
  if (typeof rawFileInfo === "string") {
    try {
      const parsed = JSON.parse(rawFileInfo) as { id?: string };
      fileId = parsed.id ?? "";
    } catch {
      // fall through to other paths
    }
  }
  if (!fileId && typeof attrs.resource_id === "string") fileId = attrs.resource_id;
  if (!fileId && typeof attrs.id === "string") fileId = attrs.id;

  const permalink =
    (typeof attrs.Permalink === "string" && attrs.Permalink) ||
    `https://${workdriveWebHost[region]}/file/${fileId}`;

  const downloadUrl = permalink;
  const filename =
    (typeof attrs.FileName === "string" && attrs.FileName) || args.filename;
  const sizeBytes =
    typeof attrs.size === "number"
      ? attrs.size
      : typeof attrs["StorageInfo"] === "object"
        ? Number((attrs["StorageInfo"] as { size?: number }).size ?? 0)
        : args.blob.size;

  return {
    fileId,
    permalink,
    downloadUrl,
    filename,
    sizeBytes,
    raw: json
  };
}
