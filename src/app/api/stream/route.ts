import { NextResponse } from "next/server";
import { GROQ_BASE } from "@/lib/groq";

export async function POST(req: Request) {
    const body = await req.json();

    const system = typeof body.system === "string" ? body.system.trim() : "";
    const prompt = body.prompt;
    const model = body.model ?? "openai/gpt-oss-20b";
    const temperature = body.temperature ?? 0.7;

    if (typeof prompt !== "string" || prompt.trim() === "") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 4000) {
        return NextResponse.json({ error: "prompt too long" }, { status: 400 });
    }
    if (system.length > 2000) {
        return NextResponse.json({ error: "system prompt too long" }, { status: 400 });
    }

    const start = performance.now();


    const upstream = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            temperature,
            max_tokens: 1500,
            stream: true,
            stream_options: { include_usage: true },
            messages: [
                ...(system ? [{ role: "system", content: system }] : []),
                { role: "user", content: prompt },
            ],
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        let message = `LLM request failed (status ${upstream.status})`;
        try {
            message = JSON.parse(text).error?.message ?? message;
        } catch {}
        return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) =>
                controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

            const reader = upstream.body!.getReader();
            let buffer = "";
            let ttftMs: number | null = null;
            let usage: any = null;
            let actualModel = model;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        if (!line.startsWith("data:")) continue;
                        const payload = line.slice(5).trim();
                        if (payload === "[DONE]") continue;

                        let chunk: any;
                        try {
                            chunk = JSON.parse(payload);
                        } catch {
                            continue;
                        }

                        actualModel = chunk.model ?? actualModel;

                        const text = chunk.choices?.[0]?.delta?.content;
                        if (text) {
                            if (ttftMs === null) {
                                ttftMs = Math.round(performance.now() - start);
                            }
                            send({ type: "token", text });
                        }

                        const u = chunk.usage ?? chunk.x_groq?.usage;
                        if (u) usage = u;
                    }
                }

                send({
                    type: "done",
                    model: actualModel,
                    ttftMs,
                    latencyMs: Math.round(performance.now() - start),
                    usage: {
                        inputTokens: usage?.prompt_tokens,
                        outputTokens: usage?.completion_tokens,
                    },
                });
            } catch (e) {
                send({ type: "error", error: e instanceof Error ? e.message : "stream failed" });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
        },
    });
}