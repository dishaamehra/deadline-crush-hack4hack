import React, { useState } from "react";
import { api, date } from "./api";
export function UploadPanel({
  teamId,
  uploads,
  refresh,
  run,
  error,
  actionBusy,
}: {
  teamId: string;
  uploads: any[];
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>) => void;
  error: string;
  actionBusy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const hashFile = async (file: File) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  async function transfer(existing?: any) {
    if (!file) throw new Error("Select your ZIP file first");
    if (file.size > 100 * 1024 * 1024)
      throw new Error("Maximum file size is 100 MiB");
    setBusy(true);
    try {
      setProgress("Calculating file checksum…");
      const hash = await hashFile(file);
      if (existing && (hash !== existing.hash || file.size !== existing.size))
        throw new Error("Choose the original file to resume this upload");
      let upload = existing;
      if (!upload) {
        const result = await api("/teams/" + teamId + "/uploads", "POST", {
          filename: file.name,
          size: file.size,
          hash,
        });
        upload = result.upload;
      }
      const state = await api("/uploads/" + upload._id);
      const complete = new Set(state.parts.map((p: any) => p.part));
      const count = Math.ceil(file.size / state.partSize);
      for (let part = 1; part <= count; part++) {
        if (complete.has(part)) continue;
        setProgress("Uploading part " + part + " of " + count);
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { url } = await api(
            "/uploads/" + upload._id + "/sign",
            "POST",
            { part },
          );
          try {
            const response = await fetch(url, {
              method: "PUT",
              body: file.slice(
                (part - 1) * state.partSize,
                Math.min(part * state.partSize, file.size),
              ),
            });
            if (response.ok) {
              success = true;
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!success)
          throw new Error(
            "Upload paused. Select the same file and resume the missing parts.",
          );
      }
      await api("/uploads/" + upload._id + "/complete", "POST", {});
      setProgress(
        "File uploaded. Finalise below to receive your submission receipt.",
      );
      await refresh();
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  async function finalise(upload: any) {
    const keyName = "deadline-finalise-" + upload._id;
    let key = localStorage.getItem(keyName);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(keyName, key);
    }
    const result = await api("/uploads/" + upload._id + "/finalise", "POST", {
      key,
    });
    setDuplicate(!!result.submission.duplicate);
    setProgress("Receipt issued · version " + result.submission.version);
    await refresh();
  }
  return (
    <section className="box">
      <h2>Project archive</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>
        ZIP · maximum 100 MiB. Save project details before starting an upload.
        Each upload keeps that version of the details.
      </p>
      <label>
        Choose ZIP
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <button
        className="primary"
        disabled={busy || actionBusy || !file}
        onClick={() => run(() => transfer())}
      >
        {busy ? "Uploading…" : "Start upload"}
      </button>
      <p role="status">{progress}</p>
      {duplicate && (
        <p className="warning">
          This file matches an earlier version. Your new receipt is preserved.
        </p>
      )}
      {uploads.map((u) => (
        <div className="upload-row" key={u._id}>
          <div>
            <strong>{u.filename}</strong>
            <small>
              {u.status} · {(u.size / 1024 / 1024).toFixed(2)} MiB ·{" "}
              {date(u.createdAt)}
            </small>
          </div>
          {u.status === "Uploading" && (
            <button
              disabled={busy || actionBusy || !file}
              onClick={() => run(() => transfer(u))}
            >
              Resume missing parts
            </button>
          )}
          {u.status === "Complete" && (
            <button
              disabled={busy || actionBusy}
              onClick={() => run(() => finalise(u))}
            >
              {actionBusy ? "Finalising…" : "Finalise and get receipt"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
