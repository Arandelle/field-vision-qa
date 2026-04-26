"use client";

import { useState, useRef, useEffect } from "react";
import { renderAnswerContent } from "./lib/RenderText";
import { STEP_META, StepPart } from "./types/steps";

// ── Sub-components ────────────────────────────────────────────────────────────
function TimelineStep({ step, index }: { step: StepPart; index: number }) {
  const [expanded, setExpanded] = useState(step.type !== "thought");
  const meta = STEP_META[step.type];

  return (
    <div className="flex gap-3">
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${meta.border} ${meta.bg} shrink-0`}
        >
          {meta.icon}
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1" />
      </div>

      {/* Card */}
      <div
        className={`flex-1 mb-4 border rounded-lg overflow-hidden ${meta.border}`}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-2 ${meta.bg} text-left`}
        >
          <span
            className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}
          >
            {meta.label}
          </span>
          <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="p-4 bg-white">
            {step.type === "image" ? (
              // Annotated image from code execution
              <img
                src={`data:${step.mimeType ?? "image/png"};base64,${step.content}`}
                alt={`Agentic output image ${index}`}
                className="max-w-full rounded border border-gray-200"
              />
            ) : step.type === "code" ? (
              // Python code block
              <pre className="text-xs bg-gray-950 text-green-300 rounded p-4 overflow-x-auto whitespace-pre-wrap">
                <code>{step.content}</code>
              </pre>
            ) : step.type === "result" ? (
              // stdout / execution result
              <pre className="text-xs bg-gray-100 text-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {step.content || "(no output)"}
              </pre>
            ) : step.type === "answer" ? (
              // Answer: detect and render JSON or plain text nicely
              <div>{renderAnswerContent(step.content)}</div>
            ) : (
              // thought / answer — plain text, preserve newlines
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {step.content}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const src = URL.createObjectURL(file);
  return (
    <div className="mt-2">
      <img
        src={src}
        alt="Uploaded preview"
        className="max-h-48 rounded-lg border border-gray-200 object-contain"
      />
    </div>
  );
}

// Replace your current `steps` state with this:
interface Turn {
  question: string;
  steps: StepPart[];
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([]);

  const [requestId, setRequestId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    { role: string; parts: { text: string }[] }[]
  >([]);
  const [imageFile, setImageFile] = useState<File | null>(null); // persist across turns

  // Preset prompts matching field operations use cases
  const PRESETS = [
    {
      label: "Count items",
      prompt: "How many items are in this image? Annotate each one.",
    },
    {
      label: "Read serial number",
      prompt:
        "What is the serial number or text on the nameplate or label? Crop and zoom in to read it clearly.",
    },
    {
      label: "Safety check",
      prompt:
        "Is the person in this photo wearing required safety equipment (hard hat, vest, gloves)? Highlight each item.",
    },
    {
      label: "Count fingers",
      prompt:
        "How many fingers are being held up? Draw a bounding box around each finger to count accurately.",
    },
  ];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPreviewFile(file);
    setTurns([]);
    setHistory([]);
    setFileUri(null);
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      setFileUri(data.fileUri);
      setFileMime(data.mimeType);
    } catch {
      setError("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTurns((prev) => [...prev, { question, steps: [] }]);

    const file = history.length === 0 ? imageFile : imageFile; // always need the file
   if (!fileUri) return setError("Please wait for image to finish uploading.");

    if (!question.trim()) return setError("Please enter a question.");

    const rid = crypto.randomUUID();
    setRequestId(rid);
    setLoading(true);

    const form = new FormData();
    form.append("question", question);
    form.append("history", JSON.stringify(history)); // send full history
    form.append("fileUri", fileUri!);
    form.append("fileMime", fileMime!);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "x-request-id": rid },
        body: form,
      });

      if (!res.ok || !res.body) {
        const data = await res.json();
        return setError(data.error ?? "Something went wrong.");
      }

      // ── SSE reader ──────────────────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantTurn = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "meta") {
              setRequestId(event.requestId); // use server's requestId
            } else if (event.type === "step") {
              setTurns((prev) => {
                if (prev.length === 0) return prev; // guard: no turns yet
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (!last) return prev; // guard: last turn undefined
                updated[updated.length - 1] = {
                  ...last,
                  steps: [...(last.steps ?? []), event.step],
                };
                return updated;
              });
            } else if (event.type === "done") {
              assistantTurn = event.assistantTurn;
            } else if (event.type === "error") {
              setError(event.message);
            }
          } catch {
            // malformed chunk, skip
          }
        }
      }

      // Append this turn to history for multi-turn
      if (assistantTurn) {
        const userTurn = { role: "user", parts: [{ text: question }] };
        setHistory((prev) => [...prev, userTurn, assistantTurn]);
      }

      setQuestion(""); // clear input for follow-up
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Visual Field Inspector
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload an image, ask a question. The AI will reason step by step and
            annotate what it finds.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Image
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-700 cursor-pointer"
              />
              {previewFile && <ImagePreview file={previewFile} />}
            </div>

            {/* Preset prompt buttons */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Quick Prompts
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setQuestion(p.prompt)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-300 hover:border-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {history.length > 0 && (
              <p className="text-xs text-blue-600 font-medium mb-1">
                ↩ Following up on same image ({history.length / 2} previous turn
                {history.length / 2 > 1 ? "s" : ""})
              </p>
            )}

            {/* Question input */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Question
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a precise question about the image..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Analyzing…
                </span>
              ) : (
                "Analyze Image"
              )}
            </button>
          </form>
        </div>

        {requestId && (
          <p className="text-xs text-gray-400 font-mono mb-3">
            request ID: <span className="text-gray-600">{requestId}</span>
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Timeline */}
        {turns.length > 0 && (
          <div className="space-y-6">
            {turns.map((turn, i) => (
              <div key={i}>
                {/* User bubble */}
                <div className="flex justify-end mb-4">
                  <div className="max-w-[80%] bg-gray-900 text-white px-4 py-2 rounded-2xl rounded-br-sm text-sm">
                    {turn.question}
                  </div>
                </div>

                {/* Gemini reasoning timeline */}
                {turn.steps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 ml-1">
                      Gemini
                    </p>
                    {turn.steps.map((step, j) => (
                      <TimelineStep key={j} step={step} index={j} />
                    ))}
                  </div>
                )}

                {/* Still loading this turn */}
                {loading &&
                  i === turns.length - 1 &&
                  turn.steps.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 ml-1">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Thinking…
                    </div>
                  )}

                {/* Divider between turns */}
                {i < turns.length - 1 && (
                  <div className="border-t border-gray-100 mt-6" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
