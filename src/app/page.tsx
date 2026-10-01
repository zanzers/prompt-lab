"use client";
import { useEffect, useState } from "react";

type Stats = {
  model: string;
  ttftMs: number | null;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number };
};

type Panel = {
  prompt: string;
  temperature: number;
  output: string;
  stats: Stats | null;
  error: string;
  running: boolean;
};

const emptyPanel: Panel = {
  prompt: "",
  temperature: 0.3,
  output: "",
  stats: null,
  error: "",
  running: false,
};

export default function Home() {
  const [system, setSystem] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [a, setA] = useState<Panel>(emptyPanel);
  const [b, setB] = useState<Panel>(emptyPanel);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.models?.length) {
          setModels(d.models);
          setModel((m) => (d.models.includes(m) ? m : d.models[0]));
        }
      })
      .catch(() => {});
  }, []);

  async function runOne(
    prompt: string,
    temperature: number,
    setPanel: React.Dispatch<React.SetStateAction<Panel>>
  ) {
    setPanel((p) => ({ ...p, output: "", stats: null, error: "", running: true }));

    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system, model, temperature }),
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        setPanel((p) => ({ ...p, error: d?.error ?? `Request failed (${res.status})` }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);

          if (msg.type === "token") setPanel((p) => ({ ...p, output: p.output + msg.text }));
          else if (msg.type === "done") setPanel((p) => ({ ...p, stats: msg }));
          else if (msg.type === "error") setPanel((p) => ({ ...p, error: msg.error }));
        }
      }
    } catch (e) {
      setPanel((p) => ({ ...p, error: e instanceof Error ? e.message : "Something went wrong" }));
    } finally {
      setPanel((p) => ({ ...p, running: false }));
    }
  }

  async function runBoth() {
    await Promise.all([
      runOne(a.prompt, a.temperature, setA),
      runOne(b.prompt, b.temperature, setB),
    ]);
  }

  function loadExample() {
    setA((p) => ({ ...emptyPanel, temperature: p.temperature, prompt: "Tell me about Python." }));
    setB((p) => ({
      ...emptyPanel,
      temperature: p.temperature,
      prompt:
        "Explain Python to someone who has never programmed. Use exactly three short examples and keep it under 150 words.",
    }));
  }

  const busy = a.running || b.running;
  const canRun = !busy && a.prompt.trim() !== "" && b.prompt.trim() !== "";

  return (
    <div className="min-h-screen bg-black text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <h1 className="font-mono text-sm tracking-widest text-white">PROMPT LAB</h1>
        <button
          onClick={loadExample}
          className="rounded-md border border-neutral-800 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-white"
        >
          Load example
        </button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Shared settings */}
        <section className="space-y-3">
          <Label>System prompt (optional, shared by A and B)</Label>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="e.g. You are a helpful assistant."
            className="h-20 w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 p-3 font-mono text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-500"
          />

          <div className="flex flex-wrap items-center gap-4">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-950 p-2 text-sm text-white outline-none focus:border-neutral-500"
            >
              {(models.length ? models : [model]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              onClick={runBoth}
              disabled={!canRun}
              className="rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Running..." : "Run both"}
            </button>
          </div>
        </section>

        {/* A vs B */}
        <div className="grid gap-6 md:grid-cols-2">
          <PromptColumn title="Prompt A" panel={a} setPanel={setA} />
          <PromptColumn title="Prompt B" panel={b} setPanel={setB} />
        </div>
      </main>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500">{children}</h2>
  );
}

function PromptColumn({
  title,
  panel,
  setPanel,
}: {
  title: string;
  panel: Panel;
  setPanel: React.Dispatch<React.SetStateAction<Panel>>;
}) {
  const s = panel.stats;
  return (
    <section className="space-y-3">
      <Label>{title}</Label>

      <textarea
        value={panel.prompt}
        onChange={(e) => setPanel((p) => ({ ...p, prompt: e.target.value }))}
        placeholder="Write a prompt..."
        className="h-40 w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 p-3 font-mono text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-500"
      />

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        Temperature
        <span className="w-8 font-mono text-white">{panel.temperature.toFixed(1)}</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={panel.temperature}
          onChange={(e) =>
            setPanel((p) => ({ ...p, temperature: Number(e.target.value) }))
          }
          className="accent-white"
        />
      </label>

      {panel.error && (
        <p className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-300">
          {panel.error}
        </p>
      )}

      <pre className="min-h-48 whitespace-pre-wrap rounded-md border border-neutral-800 bg-neutral-950 p-3 font-mono text-sm text-neutral-100">
        {panel.output}
      </pre>

      {s && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm">
          <dt className="text-neutral-500">Time to first token</dt>
          <dd className="font-mono text-white">{s.ttftMs ?? "-"} ms</dd>
          <dt className="text-neutral-500">Total latency</dt>
          <dd className="font-mono text-white">{s.latencyMs} ms</dd>
          <dt className="text-neutral-500">Input tokens</dt>
          <dd className="font-mono text-white">{s.usage.inputTokens ?? "-"}</dd>
          <dt className="text-neutral-500">Output tokens</dt>
          <dd className="font-mono text-white">{s.usage.outputTokens ?? "-"}</dd>
        </dl>
      )}
    </section>
  );
}