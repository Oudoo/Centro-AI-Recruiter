// Server-side Hume helpers.
// We deliberately use a direct fetch to Hume's OAuth2 token endpoint here instead of the SDK
// for two reasons: (1) the token-issuance API is stable and version-independent, (2) it keeps
// the server bundle small. The Hume SDK is still pulled in via package.json for v1.1 use
// (fetching chat history + emotion timelines for post-call scoring).

const HUME_TOKEN_ENDPOINT = "https://api.hume.ai/oauth2-cc/token";

export const HUME_EVI_CONFIG_ID = process.env.HUME_EVI_CONFIG_ID ?? "";

export async function issueAccessToken(): Promise<string> {
  const apiKey = process.env.HUME_API_KEY ?? "";
  const secretKey = process.env.HUME_SECRET_KEY ?? "";
  if (!apiKey || !secretKey) {
    throw new Error("HUME_API_KEY and HUME_SECRET_KEY must be set in .env.local");
  }

  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const res = await fetch(HUME_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hume token issuance failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Hume token response missing access_token field");
  }
  return data.access_token;
}
