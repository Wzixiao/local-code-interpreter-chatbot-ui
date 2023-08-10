import { OpenAIModel } from './openai';
import { GptFunction } from "@/types/functions"

export interface Message {
  role: Role;
  content: string;
  functionCall?: boolean;
  excuteResult?: string
}

export type Role = 'assistant' | 'user';

export interface ChatBody {
  model: OpenAIModel;
  messages: Message[];
  key: string;
  prompt: string;
  temperature: number;
  funcations?: GptFunction[];
  function_call?: "auto" | null
}

export interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  model: OpenAIModel;
  prompt: string;
  temperature: number;
  folderId: string | null;
  funcations: [];
  function_call: "auto" | null
}

interface Delta {
  role?: Role,
  content?: null | string,
  function_call?: {
      name?: string,
      arguments: string
  }
}


interface Choose {
    index: number,
    delta: Delta,
    finish_reason: "function_call" | "stop" | null
}

export interface GptAnswerJson {
    id: string,
    object: string,
    created: number,
    model: string,
    choices: Choose[]
}
export interface CodeExcuteResult{
  content: string,
  end: boolean,
  session_id: string
}
