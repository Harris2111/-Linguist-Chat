import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => {
  const userKey = localStorage.getItem('linguist_user_api_key');
  const apiKey = userKey || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export interface TranslationResult {
  translatedText: string;
  detectedLanguage?: string;
  pronunciation?: string;
  explanation?: string;
  grammarPoints?: string[];
  culturalNuance?: string;
  alternatives?: { text: string; context: string }[];
}

export const translateText = async (
  text: string,
  targetLang: string,
  sourceLang: string = "auto",
  tone: string = "neutral"
): Promise<TranslationResult> => {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  const prompt = `Translate the following text to ${targetLang} with a ${tone} tone. 
  Source language is ${sourceLang === "auto" ? "detected automatically" : sourceLang}.
  
  Provide a comprehensive response including:
  1. The primary translation.
  2. Phonetic pronunciation.
  3. 2-3 alternative translations for different contexts.
  4. A brief grammatical breakdown of the key phrase.
  5. Any specific cultural nuances or etiquette related to this phrase in the target language.
  
  Text: "${text}"`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translatedText: { type: Type.STRING },
          detectedLanguage: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
          explanation: { type: Type.STRING },
          grammarPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          culturalNuance: { type: Type.STRING },
          alternatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                context: { type: Type.STRING }
              }
            }
          }
        },
        required: ["translatedText"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};

export const translateImage = async (
  base64Image: string,
  targetLang: string
): Promise<TranslationResult> => {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  const prompt = `Extract all text from this image and translate it to ${targetLang}. 
  Provide the original text, the translation, and a brief explanation of what the text is (e.g., a menu, a sign, a document).`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { inlineData: { data: base64Image.split(",")[1], mimeType: "image/jpeg" } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          originalText: { type: Type.STRING },
          translatedText: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["translatedText"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};

export const generateSpeech = async (text: string, voice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr' = 'Kore'): Promise<string | undefined> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Error:", error);
    return undefined;
  }
};
