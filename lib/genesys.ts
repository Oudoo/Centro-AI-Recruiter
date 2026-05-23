// Genesys Cloud API client.
// Implements client_credentials OAuth authentication and agentless outbound WhatsApp invites.
// Plug-and-play ready for production API keys once set in .env.local.
// Falls back to mock logging for seamless, zero-config local demos.

export type SendWhatsAppInviteResult = {
  success: boolean;
  mode: "mock" | "production";
  messageId?: string;
  error?: string;
};

export async function sendWhatsAppInvite(args: {
  candidateName: string;
  candidatePhone: string;
  url: string;
  pin: string;
  targetPosition?: string;
}): Promise<SendWhatsAppInviteResult> {
  const env = process.env.GENESYS_ENVIRONMENT || "mypurecloud.com";
  const clientId = process.env.GENESYS_CLIENT_ID;
  const clientSecret = process.env.GENESYS_CLIENT_SECRET;
  const fromAddress = process.env.GENESYS_WHATSAPP_FROM_ADDRESS; // e.g. +1234567890
  const templateId = process.env.GENESYS_WHATSAPP_TEMPLATE_ID; // optional template ID
  
  const isProduction = !!(clientId && clientSecret && fromAddress);

  if (!isProduction) {
    // ─── HIGH-FIDELITY MOCK MODE ──────────────────────────────────────
    const mockMsgId = `genesys-mock-msg-${Math.floor(100000 + Math.random() * 900000)}`;
    console.log("====================================================");
    console.log(`[GENESYS OUTBOUND WHATSAPP - MOCK SENDER]`);
    console.log(`To: ${args.candidatePhone}`);
    console.log(`Candidate: ${args.candidateName}`);
    console.log(`Position: ${args.targetPosition || "Not specified"}`);
    console.log(`URL: ${args.url}`);
    console.log(`PIN: ${args.pin}`);
    console.log(`Message Body:`);
    console.log(
      `  Hi ${args.candidateName}! You have been invited to perform a Centro AI screening for the position of ${args.targetPosition || "Customer Service Agent"}. \n` +
      `  Please complete it before the slot time. \n` +
      `  Click here: ${args.url} \n` +
      `  Use PIN: ${args.pin} to log in.`
    );
    console.log(`Mock Message ID generated: ${mockMsgId}`);
    console.log("====================================================");
    
    // Simulate slight network delay for demo fidelity
    await new Promise((resolve) => setTimeout(resolve, 800));

    return {
      success: true,
      mode: "mock",
      messageId: mockMsgId
    };
  }

  // ─── PRODUCTION GENESYS CLIENT ────────────────────────────────────
  try {
    console.log(`[GENESYS] Exchanging Client Credentials for OAuth token via: login.${env}`);
    
    // 1. Authenticate with Client Credentials
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenUrl = `https://login.${env}/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        grant_type: "client_credentials"
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Auth failed (${tokenRes.status}): ${text}`);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    const accessToken = tokenJson.access_token;
    
    // 2. Call Agentless Messaging Endpoint
    const messageUrl = `https://api.${env}/api/v2/conversations/messages/agentless`;
    
    // Construct request body for Genesys Agentless Messaging.
    // If a template is configured, use it, otherwise fall back to raw message body.
    const requestBody: Record<string, any> = {
      fromAddress: fromAddress,
      toAddress: args.candidatePhone,
      toAddressMessengerType: "whatsapp"
    };

    if (templateId) {
      requestBody.useTriggeredSend = true;
      requestBody.template = {
        id: templateId,
        language: "en",
        parameters: [
          { name: "candidate_name", value: args.candidateName },
          { name: "screening_url", value: args.url },
          { name: "pin_code", value: args.pin }
        ]
      };
    } else {
      requestBody.messageBody = 
        `Hi ${args.candidateName}! You have been invited to perform a Centro AI screening for the position of ${args.targetPosition || "Customer Service Agent"}. ` +
        `Click here: ${args.url} and enter PIN: ${args.pin} to log in.`;
    }

    console.log(`[GENESYS] Sending agentless WhatsApp to ${args.candidatePhone} using fromAddress: ${fromAddress}`);
    const messageRes = await fetch(messageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody)
    });

    const messageJson = await messageRes.json();

    if (!messageRes.ok) {
      throw new Error(`Message dispatch failed (${messageRes.status}): ${JSON.stringify(messageJson)}`);
    }

    console.log(`[GENESYS] WhatsApp outbound successfully sent. Message ID: ${messageJson.id}`);
    
    return {
      success: true,
      mode: "production",
      messageId: messageJson.id
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GENESYS ERROR] Outbound WhatsApp failed:", error);
    return {
      success: false,
      mode: "production",
      error: errorMsg
    };
  }
}
