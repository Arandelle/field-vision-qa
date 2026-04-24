"use client";

import { useState, useRef } from "react";
import { renderAnswerContent } from "./lib/RenderText";

// ── Types ────────────────────────────────────────────────────────────────────
interface StepPart {
  type: "thought" | "code" | "result" | "image" | "answer";
  content: string;
  mimeType?: string;
}

// ── Step label config ────────────────────────────────────────────────────────
const STEP_META: Record<
  StepPart["type"],
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  thought: {
    label: "Think",
    icon: "💭",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  code: {
    label: "Act",
    icon: "⚙️",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  result: {
    label: "Observe",
    icon: "📋",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
  },
  image: {
    label: "Output",
    icon: "🖼️",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  answer: {
    label: "Answer",
    icon: "✅",
    color: "text-gray-800",
    bg: "bg-white",
    border: "border-gray-300",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function TimelineStep({
  step,
  index,
}: {
  step: StepPart;
  index: number;
}) {
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<StepPart[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPreviewFile(file);
    setSteps([]);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSteps([]);

    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Please select an image.");
    if (file.size > 5 * 1024 * 1024)
      return setError("Image must be under 5 MB.");
    if (!question.trim()) return setError("Please enter a question.");

    setLoading(true);
    const form = new FormData();
    form.append("image", file);
    form.append("question", question);

    try {
      const res = await fetch("/api/ask", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      setSteps(data.steps ?? []);
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

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Timeline */}
        {steps.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
              Reasoning Timeline
            </h2>
            <div>
              {steps.map((step, i) => (
                <TimelineStep
                  key={i}
                  step={step}
                  index={i}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
