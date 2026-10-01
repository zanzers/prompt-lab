import { listChatModels } from "@/lib/groq";
import { NextResponse } from "next/server";

export async function GET(){
    const model = await listChatModels();
    if(model.length === 0){
        return NextResponse.json({
            error: "Could not load models"
        }, {status: 502});
    }
    return NextResponse.json({model});
}

