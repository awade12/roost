import { UpstreamError } from "../upstream/openrouter.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";

export type SpeakRequest = {
  apiKey: string;
  model: string;
  input: string;
  voice: string;
  format: "mp3" | "pcm";
  /** Sent only when given; models that don't support it ignore it. */
  instructions?: string;
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
};

export type SpeakResult = { audio: ArrayBuffer; contentType: string };

/** What a format is called on the wire when OpenRouter doesn't say (or says something odd). */
const FALLBACK_TYPE = { mp3: "audio/mpeg", pcm: "audio/pcm" } as const;

/** mp3 is always audio/mpeg; pcm keeps OpenRouter's type, since it may carry the sample rate. */
export function speechContentType(format: SpeakRequest["format"], upstream: string | null): string {
  if (format === "mp3") return FALLBACK_TYPE.mp3;
  return upstream?.startsWith("audio/") ? upstream : FALLBACK_TYPE.pcm;
}

/**
 * One call to OpenRouter's text-to-speech endpoint (OpenAI-compatible). The answer is raw audio,
 * not JSON, and carries no usage or cost; errors come back as JSON with a non-200 status.
 */
export async function speak(req: SpeakRequest): Promise<SpeakResult> {
  let res: Response;
  try {
    res = await (req.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${req.apiKey}`, "content-type": "application/json", "x-title": "Roost" },
      body: JSON.stringify({ model: req.model, input: req.input, voice: req.voice, response_format: req.format, ...(req.instructions ? { instructions: req.instructions } : {}) }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
    });
  } catch (err) {
    throw new UpstreamError(err instanceof Error && err.name === "TimeoutError" ? "OpenRouter timed out" : "OpenRouter unreachable");
  }
  if (!res.ok) throw new UpstreamError(`OpenRouter returned HTTP ${res.status}`);
  const type = res.headers.get("content-type");
  // A JSON body on a 200 is an error the provider didn't flag, never audio a game can play.
  if (type?.includes("json")) throw new UpstreamError("OpenRouter returned an unexpected speech response");
  const audio = await res.arrayBuffer().catch(() => {
    throw new UpstreamError("OpenRouter dropped the audio stream");
  });
  if (audio.byteLength === 0) throw new UpstreamError("OpenRouter returned no audio");
  return { audio, contentType: speechContentType(req.format, type) };
}
