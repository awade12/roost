import type { AiSpeak } from "../wire/index.ts";
import type { RoostOptions } from "../types.ts";
import { post } from "./call.ts";

export type SpeakOptions = {
  /** One of the speech template's voices. */
  voice: string;
  /** Delivery guidance for this line (tone, pacing), up to 300 characters. Replaces the template's default. */
  instructions?: string;
};

export type SpeakResult = {
  /** The audio: mp3, or raw pcm, as the template says. */
  audio: ArrayBuffer;
  /** e.g. "audio/mpeg" or "audio/pcm". */
  contentType: string;
  /** The model that spoke. */
  model: string;
};

export async function runSpeech(opts: RoostOptions, template: string, text: string, o: SpeakOptions): Promise<SpeakResult> {
  const body: AiSpeak = { template, text, voice: o.voice, playerId: opts.playerId, ...(o.instructions ? { instructions: o.instructions } : {}) };
  const res = await post(opts, JSON.stringify(body), "/v1/ai/speak");
  return { audio: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream", model: res.headers.get("x-roost-model") ?? "" };
}
