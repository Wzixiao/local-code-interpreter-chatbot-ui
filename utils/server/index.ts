import { Message, CodeExcuteResult } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';

import { GptFunction } from "@/types/functions"
import { AZURE_DEPLOYMENT_ID, OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION } from '../app/const';

import { GptAnswerJson } from "@/types/chat"

import {
  ParsedEvent,
  ReconnectInterval,
  createParser,
} from 'eventsource-parser';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}
// funcations， function_call
export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  temperature : number,
  key: string,
  messages: Message[],
  functions :GptFunction[] | undefined,
  function_call: "auto" | undefined | null,
) => {
  let url = `${OPENAI_API_HOST}/v1/chat/completions`;
  if (OPENAI_API_TYPE === 'azure') {
    url = `${OPENAI_API_HOST}/openai/deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`;
  }
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(OPENAI_API_TYPE === 'openai' && {
        Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`
      }),
      ...(OPENAI_API_TYPE === 'azure' && {
        'api-key': `${key ? key : process.env.OPENAI_API_KEY}`
      }),
      ...((OPENAI_API_TYPE === 'openai' && OPENAI_ORGANIZATION) && {
        'OpenAI-Organization': OPENAI_ORGANIZATION,
      }),
    },
    method: 'POST',
    body: JSON.stringify({
      ...(OPENAI_API_TYPE === 'openai' && {model: model.id}),
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      max_tokens: 1000,
      temperature: temperature,
      stream: true,
      functions,
      function_call
    }),
  });

  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }


  return res.body;
};


export const processSSEStream = async <T>(readableStream: ReadableStream<Uint8Array>, onMessage: (message:T) => void) => {
  const decoder = new TextDecoder(); // 用于将Uint8Array转换为字符串
  const reader = readableStream.getReader();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    const strValue = decoder.decode(value, { stream: true });

    if (strValue.indexOf("[DONE]") != -1){
      break
    }
    
    const jsonStrList = strValue.split("data: ")

    for (let chunk of jsonStrList){
      if (chunk){
        const chunkJson: T = JSON.parse(chunk)
        onMessage(chunkJson)
      }
    }
  }
}