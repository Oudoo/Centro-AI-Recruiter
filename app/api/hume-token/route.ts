import { NextResponse } from "next/server";
import { issueAccessToken, HUME_EVI_CONFIG_ID } from "@/lib/hume";

export async function POST() {
  try {
    if (!HUME_EVI_CONFIG_ID) {
      return NextResponse.json(
        {
          error:
            "HUME_EVI_CONFIG_ID is not set. Create an EVI Config in Hume's dashboard and paste the ID into .env.local"
        },
        { status: 500 }
      );
    }

    const accessToken = await issueAccessToken();
    return NextResponse.json({ accessToken, configId: HUME_EVI_CONFIG_ID });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
