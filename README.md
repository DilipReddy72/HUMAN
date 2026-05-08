# AI Guide Prototype

AI Guide is a phone-first assistive navigation prototype for blind and low-vision users.
It combines:

- phone camera frames for AI scene description
- spoken output through the user's earphones
- GPS tracking for destination direction and distance
- navigation, reading, and object-finding modes

The prototype is intentionally cautious. It should support, not replace, a cane,
guide dog, mobility training, or human judgment.

## Run Locally

```bash
OPENAI_API_KEY=your_key_here node server.js
```

Then open:

```text
http://127.0.0.1:5173
```

Camera and GPS access on a real phone usually require HTTPS. For mobile testing,
deploy this app to an HTTPS host or use a secure tunnel.

## Next Steps

- Add address search and real turn-by-turn routing with a maps API.
- Add safer continuous camera checks with rate limits and battery controls.
- Add vibration patterns for urgent obstacles.
- Test with blind users and mobility experts before treating it as a safety tool.
