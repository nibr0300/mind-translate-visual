import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (file: File) => void;
}

export default function DrivePicker({ open, onClose, onPicked }: Props) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "My Drive" },
  ]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = folderStack[folderStack.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (current.id) params.set("folderId", current.id);
      if (query.trim()) params.set("q", query.trim());
      const { data, error } = await supabase.functions.invoke(
        `drive-list?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      setFiles(data?.files ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Drive");
    } finally {
      setLoading(false);
    }
  }, [current.id, query]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const openItem = async (f: DriveFile) => {
    if (f.mimeType === "application/vnd.google-apps.folder") {
      setFolderStack((s) => [...s, { id: f.id, name: f.name }]);
      return;
    }
    setDownloading(f.id);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-download?fileId=${f.id}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Drive download ${r.status}: ${t}`);
      }
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get("X-File-Name") || f.name);
      const mime = r.headers.get("X-File-Mime") || blob.type || "application/octet-stream";
      const file = new File([blob], name, { type: mime });
      onPicked(file);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="font-mono text-[11px] tracking-widest uppercase text-primary">
              Google Drive · Admin
            </div>
            <button
              onClick={onClose}
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              ESC
            </button>
          </div>

          <div className="p-3 border-b border-border space-y-2">
            <div className="flex flex-wrap gap-1 font-mono text-[10px]">
              {folderStack.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFolderStack((s) => s.slice(0, i + 1))}
                  className="text-muted-foreground hover:text-primary"
                >
                  {f.name}
                  {i < folderStack.length - 1 && <span className="mx-1">/</span>}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Search filenames…"
              className="w-full bg-secondary/40 border border-border rounded px-2 py-1.5 font-mono text-[11px] focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading && (
              <div className="p-4 text-center font-mono text-[10px] text-muted-foreground">
                Loading…
              </div>
            )}
            {error && (
              <div className="p-3 m-2 bg-destructive/10 border border-destructive/40 rounded font-mono text-[10px] text-destructive">
                {error}
              </div>
            )}
            {!loading && !error && files.length === 0 && (
              <div className="p-4 text-center font-mono text-[10px] text-muted-foreground">
                No files
              </div>
            )}
            {files.map((f) => {
              const isFolder = f.mimeType === "application/vnd.google-apps.folder";
              const isDownloading = downloading === f.id;
              return (
                <button
                  key={f.id}
                  disabled={!!downloading}
                  onClick={() => openItem(f)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 text-left disabled:opacity-50"
                >
                  <span className="font-mono text-[10px] text-primary w-4">
                    {isFolder ? "▸" : "·"}
                  </span>
                  <span className="font-mono text-[11px] truncate flex-1">{f.name}</span>
                  {isDownloading && (
                    <span className="font-mono text-[9px] text-primary">…</span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
