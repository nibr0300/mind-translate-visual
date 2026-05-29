import JSZip from "jszip";
import type { RawTextUnit } from "../chunker";
import { extractFromText } from "./textAdapter";
import { extractFromScript } from "./scriptAdapter";
import { extractFromImage } from "./imageAdapter";

/**
 * Zip adapter with dynamic context exclusion.
 *
 * - maxDepth: recursion limit for zip-in-zip (default 3)
 * - cap: hard limit on processed files (default 500)
 * - exclusion list: common noise (node_modules, .git, lockfiles, binaries, .env)
 */
const DEFAULT_EXCLUDES = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.cache\//,
  /(^|\/)coverage\//,
  /(^|\/)__pycache__\//,
  /\.lock$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /bun\.lock(b)?$/i,
  /(^|\/)\.env(\..*)?$/i,
  /\.(png|jpg|jpeg|gif|webp|ico|svg|pdf|zip|tar|gz|bz2|7z|rar|exe|dll|so|dylib|bin|wasm|woff2?|ttf|otf|mp3|mp4|mov|avi|mkv|wav|m4a)$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
];

const TEXT_EXT = /\.(txt|md|markdown|rst|csv|tsv|json|yaml|yml|toml|xml|html|htm|tex)$/i;
const SCRIPT_EXT = /\.(js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|sql|r|lua|dart|scala|clj|ex|exs)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp|gif)$/i; // override binary exclusion for explicit image opt-in

export interface ZipOptions {
  maxDepth?: number;
  maxFiles?: number;
  includeImages?: boolean;
}

export async function extractFromZip(
  file: File | Blob,
  opts: ZipOptions = {},
  depth = 0,
  counter = { count: 0 }
): Promise<RawTextUnit[]> {
  const maxDepth = opts.maxDepth ?? 3;
  const maxFiles = opts.maxFiles ?? 500;
  const includeImages = opts.includeImages ?? false;

  if (depth > maxDepth) return [];

  const zip = await JSZip.loadAsync(file);
  const units: RawTextUnit[] = [];

  const entries = Object.values(zip.files).filter((e) => !e.dir);

  for (const entry of entries) {
    if (counter.count >= maxFiles) break;

    const path = entry.name;
    const isImage = IMAGE_EXT.test(path);
    if (DEFAULT_EXCLUDES.some((re) => re.test(path)) && !(includeImages && isImage)) continue;

    try {
      if (/\.zip$/i.test(path)) {
        const nestedBlob = await entry.async("blob");
        const nestedUnits = await extractFromZip(nestedBlob, opts, depth + 1, counter);
        for (const u of nestedUnits) {
          units.push({ ...u, source: `${file instanceof File ? file.name : "archive"}/${path}::${u.source ?? ""}` });
        }
        continue;
      }

      if (TEXT_EXT.test(path) || SCRIPT_EXT.test(path)) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: "text/plain" });
        const fn = SCRIPT_EXT.test(path) ? extractFromScript : extractFromText;
        const subUnits = await fn(sub);
        for (const u of subUnits) {
          units.push({ ...u, source: path });
        }
        counter.count++;
        continue;
      }

      if (includeImages && isImage) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: `image/${path.split(".").pop()}` });
        const subUnits = await extractFromImage(sub);
        for (const u of subUnits) units.push({ ...u, source: path });
        counter.count++;
      }
    } catch (err) {
      console.warn(`[zipAdapter] skipped ${path}:`, err);
    }
  }

  return units;
}
