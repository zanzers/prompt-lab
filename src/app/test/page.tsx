"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const [log, setLog] = useState<string[]>([]);
  const add = (m: string) => setLog((l) => [...l, m]);

  async function runTest() {
    setLog(["⏳ Running..."]);
    try {
      const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
      if (authErr) return add("❌ Auth failed: " + authErr.message);
      add("✅ Signed in anonymously: " + auth.user?.id);

      const { error: insErr } = await supabase
        .from("prompts")
        .insert({ title: "Test prompt" });
      if (insErr) return add("❌ Insert failed: " + insErr.message);
      add("✅ Inserted a row");

      const { data, error: selErr } = await supabase.from("prompts").select("*");
      if (selErr) return add("❌ Read failed: " + selErr.message);
      add("✅ Read back " + data.length + " row(s)");
    } catch (e) {
      add("💥 Crashed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <main className="p-8">
      <button onClick={runTest} className="rounded bg-black px-4 py-2 text-white">
        Run Supabase test
      </button>
      <pre className="mt-4 text-sm">{log.join("\n")}</pre>
    </main>
  );
}