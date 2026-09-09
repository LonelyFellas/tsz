import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";

const voices: Record<string, string> = {
  "en-GB-Sonia": "Flo (English (UK))",
  "en-GB-Ryan": "Daniel",
  "en-US-Aria": "Samantha",
  "en-US-Guy": "Reed (English (US))"
};

/** 仅本机演示：用 macOS 系统语音替代云端 TTS，不调用外部服务。 */
export function localSpeechMock(enabled: boolean): Plugin {
  const cache = new Map<string, Buffer>();
  return {
    name: "local-speech-mock",
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/__mock/voice-preview" || req.method !== "POST")
          return next();
        let directory: string | undefined;
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 64_000) throw new Error("request too large");
            chunks.push(Buffer.from(chunk));
          }
          const input = JSON.parse(Buffer.concat(chunks).toString()) as {
            voiceId: string;
            ratePercent?: number;
            content: {
              text: string;
              annotations?: Array<{
                type: string;
                at?: number;
                duration_ms?: number;
              }>;
            };
          };
          const voice = voices[input.voiceId];
          if (
            !voice ||
            typeof input.content?.text !== "string" ||
            input.content.text.length > 5000
          )
            throw new Error("invalid speech input");
          const rate = input.ratePercent ?? 0;
          if (!Number.isFinite(rate) || rate < -50 || rate > 100)
            throw new Error("invalid speech rate");
          const key = JSON.stringify(input);
          let audio = cache.get(key);
          if (!audio) {
            if (process.platform !== "darwin")
              throw new Error("local speech demo requires macOS");
            const characters = Array.from(
              input.content.text.replace(/[\[\]]/g, "")
            );
            const pauses = (input.content.annotations ?? [])
              .filter(
                (annotation) =>
                  annotation.type === "pause" &&
                  Number.isInteger(annotation.at) &&
                  annotation.at! >= 0 &&
                  annotation.at! <= characters.length &&
                  Number.isInteger(annotation.duration_ms) &&
                  annotation.duration_ms! > 0 &&
                  annotation.duration_ms! <= 5000
              )
              .sort((a, b) => b.at! - a.at!);
            for (const pause of pauses)
              characters.splice(
                pause.at!,
                0,
                ` [[slnc ${pause.duration_ms}]] `
              );
            // 系统语音不解析 IPA；为当前 center 音标演示提供读词样本。
            const text = characters.join("").replace(/ˈsent[əɚ]r?/g, "center");
            directory = await mkdtemp(join(tmpdir(), "tsz-speech-demo-"));
            const output = join(directory, "preview.wav");
            await new Promise<void>((resolve, reject) => {
              const child = execFile(
                "/usr/bin/say",
                [
                  "-v",
                  voice,
                  "-r",
                  String(Math.round(175 * (1 + rate / 100))),
                  "-o",
                  output,
                  "--file-format=WAVE",
                  "--data-format=LEI16@22050",
                  "-f",
                  "-"
                ],
                { timeout: 30_000 },
                (error) => (error ? reject(error) : resolve())
              );
              child.stdin?.on("error", () => {});
              child.stdin?.end(text);
            });
            audio = await readFile(output);
            if (cache.size >= 32) cache.delete(cache.keys().next().value!);
            cache.set(key, audio);
          }
          res.setHeader("Content-Type", "audio/wav");
          res.end(audio);
        } catch {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message: "本机演示语音生成失败，请重试" }));
        } finally {
          if (directory) await rm(directory, { recursive: true, force: true });
        }
      });
    }
  };
}
