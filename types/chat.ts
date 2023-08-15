import { OpenAIModel } from './openai';
import { GptFunction } from "@/types/functions"

export type FuncationName = "run_code" | "run_shell"

export interface FunctionCall{
  name?: FuncationName,
  arguments: string
}

export interface Message {
  role: Role,
  content?: null | string,
  function_call?: FunctionCall,
  name?: string
}

export type Role = 'assistant' | 'user' | 'function';

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


interface Choose {
    index: number,
    delta: Message,
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
