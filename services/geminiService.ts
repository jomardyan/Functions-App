import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API client
// NOTE: In a real production app, this key should be proxied through a backend.
// As per instructions, we assume process.env.API_KEY is available.
const apiKey = process.env.API_KEY || 'DEMO_KEY_PLACEHOLDER'; 
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Generates code based on a user prompt using Gemini.
 */
export const generateFunctionCode = async (prompt: string, runtime: string): Promise<string> => {
  try {
    const systemInstruction = `You are an expert cloud architect. 
    Write a serverless function in ${runtime}. 
    Return ONLY the code. Do not include markdown backticks or explanations. 
    Ensure the code handles errors gracefully.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // Low temperature for deterministic code
      },
    });

    return response.text || '// No code generated';
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return `// Error generating code: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * Analyzes error logs and suggests fixes.
 */
export const analyzeErrorLog = async (logMessage: string, codeContext: string): Promise<string> => {
  try {
    const prompt = `
    I am encountering the following error in my serverless function:
    "${logMessage}"

    Here is the source code:
    ${codeContext}

    Explain why this error is happening and provide a fixed version of the code snippet.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: "You are a senior site reliability engineer. Be concise and solution-oriented.",
      }
    });

    return response.text || 'Unable to analyze log.';
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error communicating with AI assistant.";
  }
};

/**
 * Streaming chat interface for the side panel
 */
export const streamChatResponse = async function* (history: { role: string; content: string }[], newMessage: string) {
  try {
    // Convert history to format expected by API if needed, 
    // but simpler generateContent call works for single turn or managed context
    // For this demo, we'll treat it as a single generateContentStream with context included in prompt
    // or use the chat API. Let's use the Chat API for best practices.
    
    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: "You are 'Nexus AI', a helpful assistant for a Serverless FaaS platform. Help users write code, debug, and configure resources.",
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }))
    });

    const result = await chat.sendMessageStream({ message: newMessage });

    for await (const chunk of result) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Stream Error:", error);
    yield "Sorry, I encountered an error processing your request.";
  }
};