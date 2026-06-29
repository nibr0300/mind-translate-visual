import JSZip from "jszip";
import type { RawTextUnit } from "../chunker";
import { extractFromText } from "./textAdapter";
import { extractFromScript } from "./scriptAdapter";
import { extractFromImage } from "./imageAdapter";
import { extractFromNotebook } from "./notebookAdapter";
import { extractFromPdf } from "./pdfAdapter";
import { extractFromAudio } from "./audioAdapter";


/**
 * Zip adapter with dynamic context exclusion + per-file timeout so a single
 * hanging file (e.g. broken image during OCR) can never freeze the entire job.
 *
 * - maxDepth: recursion limit for zip-in-zip (default 3)
 * - cap:      hard limit on processed files (default 300)
 * - exclusion list: build/git/cache noise, lockfiles, env, true binaries
 * - PDF, scripts, text, notebooks, and (opt-in) images are extracted
 * - Unsupported but common formats (.docx/.xlsx/.pptx/.doc) emit a marker
 *   unit so the user sees in the field that they were skipped, with reason.
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
  /(^|\/)__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /\.lock$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /bun\.lock(b)?$/i,
  /(^|\/)\.env(\..*)?$/i,
  // True binaries we cannot parse client-side
  /\.(zip|tar|gz|bz2|7z|rar|exe|dll|so|dylib|bin|wasm|woff2?|ttf|otf|mp4|mov|avi|mkv|ico|svg)$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
];

const TEXT_EXT = /\.(txt|md|markdown|rst|csv|tsv|json|yaml|yml|toml|xml|html|htm|tex)$/i;
const SCRIPT_EXT = /\.(js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|sql|r|lua|dart|scala|clj|ex|exs)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp|gif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|flac|ogg|aac|opus|webm)$/i;
const PDF_EXT = /\.pdf$/i;
const UNSUPPORTED_DOC_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|odp|pages|numbers|key|rtf|epub)$/i;

const PER_FILE_TIMEOUT_MS = 45_000;
const PER_AUDIO_TIMEOUT_MS = 240_000;


export interface ZipOptions {
  maxDepth?: number;
  maxFiles?: number;
  includeImages?: boolean;
  onProgress?: (msg: string, value: number) => void;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function extractFromZip(
  file: File | Blob,
  opts: ZipOptions = {},
  depth = 0,
  counter = { count: 0, skipped: [] as string[] },
): Promise<RawTextUnit[]> {
  const maxDepth = opts.maxDepth ?? 3;
  const maxFiles = opts.maxFiles ?? 300;
  const includeImages = opts.includeImages ?? false;
  const onProgress = opts.onProgress;

  if (depth > maxDepth) return [];

  const zip = await JSZip.loadAsync(file);
  const units: RawTextUnit[] = [];
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const total = entries.length;

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    if (counter.count >= maxFiles) {
      counter.skipped.push(`(cap reached, ${entries.length - idx} more files ignored)`);
      break;
    }

    const path = entry.name;
    if (depth === 0 && onProgress) {
      onProgress(`Reading ${path.split("/").pop()} (${idx + 1}/${total})`, 0.05 + 0.15 * (idx / total));
    }

    const isImage = IMAGE_EXT.test(path);
    if (DEFAULT_EXCLUDES.some((re) => re.test(path)) && !(includeImages && isImage)) continue;

    // Surface unsupported document formats so the user understands what's missing
    if (UNSUPPORTED_DOC_EXT.test(path)) {
      counter.skipped.push(path);
      units.push({
        text: `[SKIPPED: ${path}] Format not supported client-side (extract text and re-upload as .txt/.md/.pdf).`,
        source: path,
        position: counter.count,
      });
      counter.count++;
      continue;
    }

    try {
      if (/\.zip$/i.test(path)) {
        const nestedBlob = await entry.async("blob");
        const nestedUnits = await extractFromZip(nestedBlob, opts, depth + 1, counter);
        for (const u of nestedUnits) {
          units.push({ ...u, source: `${file instanceof File ? file.name : "archive"}/${path}::${u.source ?? ""}` });
        }
        continue;
      }

      if (PDF_EXT.test(path)) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: "application/pdf" });
        const subUnits = await withTimeout(extractFromPdf(sub), PER_FILE_TIMEOUT_MS, path);
        for (const u of subUnits) units.push({ ...u, source: path });
        counter.count++;
        continue;
      }

      if (/\.ipynb$/i.test(path)) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: "application/json" });
        const subUnits = await withTimeout(extractFromNotebook(sub), PER_FILE_TIMEOUT_MS, path);
        for (const u of subUnits) units.push({ ...u, source: path });
        counter.count++;
        continue;
      }

      if (TEXT_EXT.test(path) || SCRIPT_EXT.test(path)) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: "text/plain" });
        const fn = SCRIPT_EXT.test(path) ? extractFromScript : extractFromText;
        const subUnits = await withTimeout(fn(sub), PER_FILE_TIMEOUT_MS, path);
        for (const u of subUnits) units.push({ ...u, source: path });
        counter.count++;
        continue;
      }

      if (includeImages && isImage) {
        const blob = await entry.async("blob");
        const sub = new File([blob], path, { type: `image/${path.split(".").pop()}` });
        const subUnits = await withTimeout(extractFromImage(sub), PER_FILE_TIMEOUT_MS, path);
        for (const u of subUnits) units.push({ ...u, source: path });
        counter.count++;
        continue;
      }

      // Unknown extension — record but don't crash
      counter.skipped.push(path);
    } catch (err) {
      console.warn(`[zipAdapter] skipped ${path}:`, err);
      counter.skipped.push(`${path} (${(err as Error).message})`);
    }
  }

  if (depth === 0 && counter.skipped.length) {
    console.info(`[zipAdapter] ${counter.count} files processed, ${counter.skipped.length} skipped:`, counter.skipped.slice(0, 20));
  }

  return units;
}
