"use client";

import { useCallback, useId, useState } from "react";

export type PhotoCategory =
  | "Progress"
  | "Materials"
  | "Issue"
  | "Before"
  | "After"
  | "Inspection"
  | "Other";

export type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  category: PhotoCategory;
};

export type PendingDocument = {
  id: string;
  file: File;
};

const PHOTO_CATEGORIES: PhotoCategory[] = [
  "Progress",
  "Materials",
  "Issue",
  "Before",
  "After",
  "Inspection",
  "Other",
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type PhotoProps = {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
};

export function DailyLogPhotoSection({ photos, onChange }: PhotoProps) {
  const inputId = useId();
  const cameraId = useId();
  const [dragOver, setDragOver] = useState(false);
  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = [...list].filter((f) => f.type.startsWith("image/"));
      const next: PendingPhoto[] = [...photos];
      for (const file of arr) {
        const id = crypto.randomUUID();
        next.push({
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          caption: "",
          category: "Progress",
        });
      }
      onChange(next);
    },
    [photos, onChange],
  );

  const remove = (id: string) => {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.previewUrl);
    onChange(photos.filter((x) => x.id !== id));
  };

  const update = (id: string, patch: Partial<Omit<PendingPhoto, "id" | "file">>) => {
    onChange(
      photos.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  return (
    <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-lg font-semibold text-white">📸 Photos</h2>
      <p className="mt-1 text-xs text-white/45">
        Progress shots, materials, issues — attached when you save the log.
      </p>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.getElementById(inputId)?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={
          dragOver
            ? "mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E8C84A] bg-[#E8C84A]/10 px-4 py-8 text-center"
            : "mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/25 bg-white/[0.02] px-4 py-8 text-center hover:border-white/40"
        }
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-white/70">
          Drag photos here or click to browse
        </p>
        <button
          type="button"
          className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
          onClick={(e) => {
            e.stopPropagation();
            document.getElementById(cameraId)?.click();
          }}
        >
          📷 Camera
        </button>
      </div>

      {photos.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {photos.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt=""
                className="h-24 w-24 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  type="text"
                  className="app-input w-full text-sm"
                  placeholder="Caption"
                  value={p.caption}
                  onChange={(e) => update(p.id, { caption: e.target.value })}
                />
                <select
                  className="app-input w-full text-sm"
                  value={p.category}
                  onChange={(e) =>
                    update(p.id, { category: e.target.value as PhotoCategory })
                  }
                >
                  {PHOTO_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs font-medium text-red-300 hover:underline"
                  onClick={() => remove(p.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type DocProps = {
  documents: PendingDocument[];
  onChange: (docs: PendingDocument[]) => void;
};

export function DailyLogDocumentSection({ documents, onChange }: DocProps) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (list: FileList | File[]) => {
    const next = [...documents];
    for (const file of list) {
      next.push({ id: crypto.randomUUID(), file });
    }
    onChange(next);
  };

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-lg font-semibold text-white">📎 Documents</h2>
      <p className="mt-1 text-xs text-white/45">
        PDF receipts, delivery tickets, voice notes, other files.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById(inputId)?.click()}
        className={
          dragOver
            ? "mt-4 flex min-h-[100px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[#E8C84A] bg-[#E8C84A]/10 px-4 py-6 text-center text-sm text-white/70"
            : "mt-4 flex min-h-[100px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/25 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/70 hover:border-white/40"
        }
      >
        <input
          id={inputId}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        Drag files here or click to browse
      </div>
      {documents.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <span className="truncate text-white/90">{d.file.name}</span>
              <span className="text-xs text-white/45">
                {formatBytes(d.file.size)} · {d.file.type || "file"}
              </span>
              <button
                type="button"
                className="text-xs text-red-300 hover:underline"
                onClick={() =>
                  onChange(documents.filter((x) => x.id !== d.id))
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
