import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8_000_000) {
      throw new Error("Image is too large. Try again with a smaller frame.");
    }
  }
  return JSON.parse(body || "{}");
}

async function describeScene(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, {
      error: "Set OPENAI_API_KEY before starting the server.",
    });
    return;
  }

  try {
    const { image, mode = "navigate", question = "", navigation = null } = await readBody(req);
    if (!image?.startsWith("data:image/")) {
      sendJson(res, 400, { error: "Missing camera image." });
      return;
    }

    const prompt = [
      "You are an assistive vision guide for a blind person using a phone camera and earphones.",
      "Speak in short, calm, useful sentences.",
      "Prioritize immediate safety: obstacles, steps, vehicles, people, doors, crossings, signs, and readable text.",
      "Do not claim certainty about hazards you cannot see. If unsure, say what to verify.",
      mode === "read"
        ? "Mode: read text. Extract visible text and summarize what it means."
        : mode === "find"
          ? `Mode: find. Help the user locate this: ${question || "the requested object"}.`
          : "Mode: navigate. Describe what matters for moving safely.",
      navigation
        ? `Navigation context: ${navigation.summary}. The destination bearing is ${navigation.bearingText}. The user is about ${navigation.distanceText} from the destination.`
        : "No GPS destination context is available.",
      "For navigation mode, combine GPS direction with the camera view. Say whether the visible path ahead appears clear, blocked, has a curb, stairs, vehicle, person, doorway, crosswalk, or sign.",
      "Keep the answer under 45 words unless reading text requires more.",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: data.error?.message || "AI request failed.",
      });
      return;
    }

    sendJson(res, 200, {
      text: data.output_text || "I could not describe this frame.",
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, "public", safePath);

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/describe") {
    await describeScene(req, res);
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`AI Guide prototype running at http://${host}:${port}`);
});
