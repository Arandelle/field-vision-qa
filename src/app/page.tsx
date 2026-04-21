"use client";

import { useState, useRef } from "react";

export default function Page() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAnswer("");

    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Please select an image.");
    if (file.size > 5 * 1024 * 1024) return setError("Image must be under 5 MB.");

    setLoading(true);
    const form = new FormData();
    form.append("image", file);
    form.append("question", question);

    try {
      const res = await fetch("/api/ask", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      setAnswer(data.answer);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Image Q&A</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input ref={fileRef} type="file" accept="image/*" className="block w-full" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the image..."
          className="w-full border rounded p-2"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
      {answer && (
        <div className="border rounded p-4 bg-gray-50">
          <p className="font-medium mb-1">Answer</p>
          <p>{answer}</p>
        </div>
      )}
    </main>
  );
}