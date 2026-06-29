import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateFieldFromFile } from "@/lib/fieldGenerator";
import type { GeometricField } from "@/lib/fieldData";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import DrivePicker from "./DrivePicker";

interface FileUploaderProps {
  onFieldGenerated: (field: GeometricField, fileName: string) => void;
}

const ACCEPT =
  ".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.htm,.tex," +
  ".js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.swift,.c,.cc,.cpp,.h,.hpp,.cs,.php,.sh,.sql,.r,.lua," +
  ".png,.jpg,.jpeg,.webp,.gif," +
  ".mp3,.wav,.m4a,.ogg,.flac,.webm," +
  ".zip";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB cap across types

export default function FileUploader({ onFieldGenerated }: FileUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ stage: "", value: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useIsAdmin();

  const processFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        setError(`File too large (max ${MAX_BYTES / 1024 / 1024}MB)`);
        return;
      }

      setError(null);
      setIsProcessing(true);
      setProgress({ stage: "Starting…", value: 0 });

      try {
        const field = await generateFieldFromFile(file, (stage, value) =>
          setProgress({ stage, value })
        );
        const badCoords = field.units.filter(
          (u) => !Number.isFinite(u.vector2d?.[0]) || !Number.isFinite(u.vector2d?.[1])
        ).length;
        console.info("[upload] field built", {
          file: file.name,
          units: field.units.length,
          clusters: field.clusters.length,
          badCoords,
          firstUnit: field.units[0],
          stats: field.stats,
        });
        if (field.units.length === 0) {
          setError("Field was built but contains 0 units — nothing to render. Check console.");
          return;
        }
        onFieldGenerated(field, file.name);
      } catch (err: any) {
        console.error("[upload] failed", err);
        setError(err.message || "Failed to process file");
      } finally {
        setIsProcessing(false);
      }
    },
    [onFieldGenerated]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="p-4 border-b border-border">
      <label className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-2">
        Upload Source
      </label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/30 hover:bg-secondary/30"
        }`}
      >
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="font-mono text-[11px] text-primary">{progress.stage}</div>
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${progress.value * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="font-mono text-[11px] text-muted-foreground">
                Drop file or <span className="text-primary underline">browse</span>
              </div>
              <div className="font-mono text-[9px] text-muted-foreground/50 mt-1">
                PDF · text · script · image · audio · zip
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isAdmin && !isProcessing && (
        <button
          onClick={() => setDrivePickerOpen(true)}
          className="mt-2 w-full font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/30 hover:bg-primary/10 rounded py-1.5 transition-colors"
        >
          + Google Drive
        </button>
      )}

      {error && <p className="font-mono text-[10px] text-destructive mt-2">{error}</p>}

      <DrivePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        onPicked={(f) => processFile(f)}
      />
    </div>
  );
}
