// ── Types ────────────────────────────────────────────────────────────────────
export interface StepPart {
  type: "thought" | "code" | "result" | "image" | "answer";
  content: string;
  mimeType?: string;
}

// ── Step label config ────────────────────────────────────────────────────────
export const STEP_META: Record<
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