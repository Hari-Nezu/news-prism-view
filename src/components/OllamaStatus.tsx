"use client";

import { useState, useEffect } from "react";

export default function OllamaStatus() {
  const [model, setModel]                 = useState<string | null>(null);
  const [classifyModel, setClassifyModel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setModel(d.model);
        setClassifyModel(d.classifyModel);
      })
      .catch(() => setModel(null));
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
      <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse flex-shrink-0" />
      <span className="hidden sm:inline">
        {model ?? "Ollama"}
        {classifyModel && classifyModel !== model && (
          <span className="text-gray-300"> / {classifyModel}</span>
        )}
      </span>
    </div>
  );
}
