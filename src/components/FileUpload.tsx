"use client";

import { useState, useCallback } from "react";

interface UploadedFile {
  name: string;
  size: number;
  url: string;
}

interface FileUploadProps {
  caseId: string;
  onUploadComplete?: (files: UploadedFile[]) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ caseId, onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      setError(null);
      setUploading(true);

      const newFiles: UploadedFile[] = [];

      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_SIZE) {
          setError(`${file.name} exceeds 50MB limit`);
          continue;
        }

        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`${file.name} — unsupported file type`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("caseId", caseId);

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Failed to upload ${file.name}`);
            continue;
          }

          const data = await res.json();
          newFiles.push({
            name: file.name,
            size: file.size,
            url: data.url,
          });
        } catch {
          setError(`Failed to upload ${file.name}`);
        }
      }

      setFiles((prev) => {
        const updated = [...prev, ...newFiles];
        onUploadComplete?.(updated);
        return updated;
      });
      setUploading(false);
    },
    [caseId, onUploadComplete]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-amber-500 bg-amber-500/5"
            : "border-zinc-700 bg-zinc-900/50"
        }`}
      >
        <p className="text-sm text-zinc-400">
          {uploading
            ? "Uploading..."
            : "Drag and drop your discovery documents here"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          PDF, DOCX, images, audio, video — max 50MB per file
        </p>
        <label className="mt-4 inline-block cursor-pointer rounded-lg border border-zinc-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:border-zinc-500">
          Browse Files
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff,.mp3,.wav,.mp4"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadFiles(e.target.files);
              }
            }}
          />
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-zinc-300">
            Uploaded ({files.length})
          </p>
          {files.map((f) => (
            <div
              key={f.url}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2"
            >
              <span className="text-sm text-white">{f.name}</span>
              <span className="text-xs text-zinc-500">
                {formatSize(f.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
