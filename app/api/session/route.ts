import { VOICE } from "@/lib/config";
import { MODEL } from "@/lib/constants";

// Get an ephemeral session token from our FastAPI backend
export async function GET() {
  try {
    const apiHost = process.env.API_HOST;
    
    if (!apiHost) {
      throw new Error("API_HOST environment variable is not set");
    }
    
    // Call our FastAPI backend to get the session token
    const r = await fetch(`${apiHost}/session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!r.ok) {
      const errorText = await r.text();
      throw new Error(`Failed to get session from backend: ${errorText}`);
    }

    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
