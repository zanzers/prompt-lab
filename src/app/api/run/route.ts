import { listChatModels, modelUnavailableMessage } from "@/lib/groq";
import { NextResponse } from "next/server";


const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// {
//   "model": [
//     "allam-2-7b",
//     "openai/gpt-oss-120b",
//     "openai/gpt-oss-20b",
//     "qwen/qwen3.8-27b"
//   ]
// }



export async function POST(req: Request){

    const body = await req.json();
    console.log("BODY:", body);


    const prompt = body.prompt;
    const model = body.model ?? "openai/gpt-oss-120b";
    const temperature = body.temperature ?? 0.7;


    if(typeof prompt !== "string" || prompt.trim() === ""){
        return NextResponse.json({
            error: "prompt is required"
            }, {status: 400});
    }
    if(prompt.length > 4000){
        return NextResponse.json({
             error: "prompt too long" 
            }, { status: 400 });
    }

    const start = performance.now();

    const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            temperature,
            max_tokens: 500,
            messages: [{role: "user", content: prompt}],
        }),
    });

    const latencyMs = Math.round(performance.now() - start);

    const text = await res.text();
    let data: any;
    try{
        data = JSON.parse(text);
    } catch {
        return NextResponse.json(
            { error: `LLM provider returned a non-JSON response (status ${res.status})` },
            { status: 502 }
        );
    }


    if (!res.ok) {
        const message: string = data.error?.message ?? "LLM request failed";
        const modelProblem =
            data.error?.code === "model_not_found" ||
            res.status === 404 ||
            message.includes("does not exist");

    
        if (modelProblem) {
            const availableModels = await listChatModels();
            return NextResponse.json(
                {
                    error: modelUnavailableMessage(model, availableModels),
                    code: "model_unavailable",
                    requestedModel: model,
                    availableModels,
                },
                { status: 404 }
            );
        }

        return NextResponse.json({ error: message }, { status: res.status });
    }

    return NextResponse.json({
        output: data.choices[0].message.content,
        model: data.model,
        latencyMs,
        usage: {
            inputTokens: data.usage?.prompt_tokens,
            outputTokens: data.usage?.completion_tokens,
        },
    });

}


