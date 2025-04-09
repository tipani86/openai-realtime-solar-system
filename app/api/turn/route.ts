// Endpoint to fetch TURN server iceServers from Metered

export async function GET() {
  try {
    const turnDomain = process.env.TURN_DOMAIN;
    const turnApiKey = process.env.TURN_API_KEY;

    if (!turnDomain || !turnApiKey) {
      return new Response(
        JSON.stringify({ error: "TURN server configuration missing" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Fetch iceServers from Metered
    const url = `https://${turnDomain}/api/v1/turn/credentials?apiKey=${turnApiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TURN credentials: ${response.statusText}`);
    }

    const iceServers = await response.json();

    // Return iceServers array to the client
    return new Response(JSON.stringify(iceServers), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error fetching TURN credentials:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
} 