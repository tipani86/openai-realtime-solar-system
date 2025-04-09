export async function GET() {
  try {
    const turnDomain = process.env.TURN_DOMAIN || "iluvvivid.metered.live";
    const apiKey = process.env.TURN_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing TURN_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://${turnDomain}/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch iceServers: ${response.statusText}`);
    }
    
    const iceServers = await response.json();
    
    return new Response(JSON.stringify(iceServers), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching TURN credentials:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 