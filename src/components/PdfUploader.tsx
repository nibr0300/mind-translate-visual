import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateFieldFromPDF } from "@/lib/pdfFieldGenerator";
import type { GeometricField } from "@/lib/fieldData";

interface PdfUploaderProps {
  onFieldGenerated: (field: GeometricField, fileName: string) => void;
}

export default function PdfUploader({ onFieldGenerated }: PdfUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ stage: "", value: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setError("Only PDF files are supported");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError("File too large (max 20MB)");
        return;
      }

      setError(null);
      setIsProcessing(true);
      setProgress({ stage: "Starting…", value: 0 });

      try {
        const field = await generateFieldFromPDF(file, (stage, value) => {
          setProgress({ stage, value });
        });
        onFieldGenerated(field, file.name);
      } catch (err: any) {
        setError(err.message || "Failed to process PDF");
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
        Upload PDF
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
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
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="font-mono text-[11px] text-muted-foreground">
                Drop PDF or <span className="text-primary underline">browse</span>
              </div>
              <div className="font-mono text-[9px] text-muted-foreground/50 mt-1">
                Client-side processing · no upload
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <p className="font-mono text-[10px] text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
