import { IconClearAll, IconSettings } from '@tabler/icons-react';
import {
  MutableRefObject,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { DEFAULT_FUNCTIONS } from "@/utils/app/functions"
import { useTranslation } from 'next-i18next';

import { getEndpoint } from '@/utils/app/api';
import {
  saveConversation,
  saveConversations,
  updateConversation,
} from '@/utils/app/conversation';
import { throttle } from '@/utils/data/throttle';


import { ChatBody, Conversation, Message, GptAnswerJson, CodeExcuteResult, } from '@/types/chat';
import { Plugin } from '@/types/plugin';
import { processSSEStream } from "@/utils/server/index"


import HomeContext from '@/pages/api/home/home.context';

import Spinner from '../Spinner';
import { ChatInput } from './ChatInput';
import { ChatLoader } from './ChatLoader';
import { ErrorMessageDiv } from './ErrorMessageDiv';
import { ModelSelect } from './ModelSelect';
import { SystemPrompt } from './SystemPrompt';
import { TemperatureSlider } from './Temperature';
import { MemoizedChatMessage } from './MemoizedChatMessage';
import { CodeInterpreterSelect } from "./CodeInterpreterSelect"


interface Props {
  stopConversationRef: MutableRefObject<boolean>;
}

const mergeMessage = (oldMessage: Message, newMessage: Message): Message => {
  if (oldMessage.content) {
    oldMessage.content += newMessage.content ? newMessage.content : ""
  } else {
    oldMessage.content = newMessage.content ? newMessage.content : null
  }

  if (oldMessage.function_call) {
    if (newMessage.function_call) {
      oldMessage.function_call.arguments += newMessage.function_call.arguments
      if (!oldMessage.function_call.name && newMessage.function_call.name) {
        oldMessage.function_call.name = newMessage.function_call.name
      }
    }
  } else {
    if (newMessage.function_call) {
      oldMessage.function_call = newMessage.function_call
    }
  }

  return oldMessage
}

export const Chat = memo(({ stopConversationRef }: Props) => {
  const { t } = useTranslation('chat');

  const {
    state: {
      selectedConversation,
      conversations,
      models,
      apiKey,
      pluginKeys,
      serverSideApiKeyIsSet,
      messageIsStreaming,
      modelError,
      loading,
      prompts,
      isCodeinterpreter
    },
    handleUpdateConversation,
    dispatch: homeDispatch,
  } = useContext(HomeContext);

  const [currentMessage, setCurrentMessage] = useState<Message>();
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showScrollDownButton, setShowScrollDownButton] =
    useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState("");

  const sendGptByConversation = async (conversation: Conversation, isCodeinterpreter: boolean = false): Promise<Response> => {
    const endpoint = getEndpoint(null);
    const controller = new AbortController();

    const chatBody: ChatBody = {
      model: conversation.model,
      messages: conversation.messages,
      key: apiKey,
      prompt: prompt,
      temperature: conversation.temperature
    };

    if (isCodeinterpreter) {
      chatBody.funcations = DEFAULT_FUNCTIONS
      chatBody.function_call = "auto"
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(chatBody),
    });

    return response
  }

  const sendCode = async (functionArguments: string, functionName: string): Promise<Response> => {
    const response = await fetch("http://localhost:5000/execute", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        functionName,
        sessionId: "aaa",
        arguments: JSON.parse(functionArguments)
      }),
    });

    return response
  }

  const saveConversationToLoacl = (updatedConversation: Conversation) => {

    saveConversation(updatedConversation);
    if (conversations.length != 0) {
      const updatedConversations: Conversation[] = conversations.map(
        (conversation) => {
          if (conversation.id === updatedConversation.id) {
            return updatedConversation;
          }
          return conversation;
        },
      );
      saveConversations(updatedConversations);
    } else {
      conversations.push(updatedConversation)
      saveConversations(conversations);
    }
  }

  const updateMessagesWithDeletion = (deleteCount: number) => {
    if (selectedConversation) {
      const updatedMessages = [...selectedConversation.messages];
      for (let i = 0; i < deleteCount; i++) {
        updatedMessages.pop();
      }
      return updatedMessages;
    } else {
      return []
    }

  };

  const dispatchLoadingAndStreaming = (loading: boolean, streaming: boolean) => {
    homeDispatch({ field: 'loading', value: loading });
    homeDispatch({ field: 'messageIsStreaming', value: streaming });
  };

  // 辅助函数：处理与GPT的响应
  const processGptResponse = async (updatedConversation: Conversation): Promise<Conversation | null> => {
    const response = await sendGptByConversation(updatedConversation, isCodeinterpreter);

    if (!response.ok || !response.body) {
      dispatchLoadingAndStreaming(false, false);
      toast.error(response.statusText);
      return null;
    }

    let assistantMessage: Message = {
      role: "assistant"
    };
    let isFirstTrturnResult = true;

    await processSSEStream<GptAnswerJson>(response.body, async (answer: GptAnswerJson) => {
      const delta = answer.choices[0].delta;
      assistantMessage = mergeMessage(assistantMessage, delta);

      if (isFirstTrturnResult) {
        updatedConversation.messages.push(assistantMessage);
        isFirstTrturnResult = false;
      } else {
        updatedConversation.messages[updatedConversation.messages.length - 1] = assistantMessage;
      }

      homeDispatch({
        field: 'selectedConversation',
        value: updatedConversation,
      });
    });

    return updatedConversation;
  };

  // 辅助函数：处理代码响应
  const processCodeResponse = async (updatedConversation: Conversation): Promise<Conversation | null> => {
    const assistantMessage = updatedConversation.messages[updatedConversation.messages.length - 1]
    if (!assistantMessage.function_call) return null;

    const { arguments: functionArguments, name: functionName } = assistantMessage.function_call;

    if (!functionName || !functionArguments) {
      dispatchLoadingAndStreaming(false, false);
      return null;
    }

    const response = await sendCode(functionArguments, functionName);

    if (!response.ok || !response.body) {
      dispatchLoadingAndStreaming(false, false);
      return null;
    }

    const codeMessage: Message = {
      role: "function",
      content: "",
      name: functionName
    };

    let codeResultIsFirst = true;

    await processSSEStream<CodeExcuteResult>(response.body, async (result: CodeExcuteResult) => {
      codeMessage.content += result.content;

      if (codeResultIsFirst) {
        updatedConversation.messages.push(codeMessage);
        codeResultIsFirst = false;
      } else {
        updatedConversation.messages[updatedConversation.messages.length - 1] = codeMessage;
      }

      homeDispatch({
        field: 'selectedConversation',
        value: updatedConversation,
      });
    });

    return updatedConversation;
  };

  const handleSend = useCallback(async (message: Message, deleteCount = 0, plugin: Plugin | null = null) => {
    if (!selectedConversation) return;

    let messages = deleteCount ? updateMessagesWithDeletion(deleteCount) : [...selectedConversation.messages];
    messages.push(message);

    let updatedConversation: Conversation = {
      ...selectedConversation,
      messages,
    };

    homeDispatch({ field: 'selectedConversation', value: updatedConversation });
    homeDispatch({ field: 'messageIsStreaming', value: true });

    while (true) {
      let newUpdatedConversation = await processGptResponse(updatedConversation);
      if (!newUpdatedConversation) break;
      updatedConversation = newUpdatedConversation

      saveConversationToLoacl(newUpdatedConversation);

      newUpdatedConversation = await processCodeResponse(newUpdatedConversation);
      if (!newUpdatedConversation) break;
      updatedConversation = newUpdatedConversation
      
      saveConversationToLoacl(newUpdatedConversation);
    }

    dispatchLoadingAndStreaming(false, false);
  },
    [apiKey, conversations, pluginKeys, selectedConversation, stopConversationRef, isCodeinterpreter]);


  const scrollToBottom = useCallback(() => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      textareaRef.current?.focus();
    }
  }, [autoScrollEnabled]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        chatContainerRef.current;
      const bottomTolerance = 30;

      if (scrollTop + clientHeight < scrollHeight - bottomTolerance) {
        setAutoScrollEnabled(false);
        setShowScrollDownButton(true);
      } else {
        setAutoScrollEnabled(true);
        setShowScrollDownButton(false);
      }
    }
  };

  const handleScrollDown = () => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  };

  const handleSettings = () => {
    setShowSettings(!showSettings);
  };

  const onClearAll = () => {
    if (
      confirm(t<string>('Are you sure you want to clear all messages?')) &&
      selectedConversation
    ) {
      handleUpdateConversation(selectedConversation, {
        key: 'messages',
        value: [],
      });
    }
  };

  const scrollDown = () => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView(true);
    }
  };
  const throttledScrollDown = throttle(scrollDown, 250);

  useEffect(() => {
    throttledScrollDown();
    selectedConversation &&
      setCurrentMessage(
        selectedConversation.messages[selectedConversation.messages.length - 2],
      );
  }, [selectedConversation, throttledScrollDown]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setAutoScrollEnabled(entry.isIntersecting);
        if (entry.isIntersecting) {
          textareaRef.current?.focus();
        }
      },
      {
        root: null,
        threshold: 0.5,
      },
    );
    const messagesEndElement = messagesEndRef.current;
    if (messagesEndElement) {
      observer.observe(messagesEndElement);
    }
    return () => {
      if (messagesEndElement) {
        observer.unobserve(messagesEndElement);
      }
    };
  }, [messagesEndRef]);


  return (
    <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#343541]">
      {!(apiKey || serverSideApiKeyIsSet) ? (
        <div className="mx-auto flex h-full w-[300px] flex-col justify-center space-y-6 sm:w-[600px]">
          <div className="text-center text-4xl font-bold text-black dark:text-white">
            Welcome to Chatbot UI
          </div>
          <div className="text-center text-lg text-black dark:text-white">
            <div className="mb-8">{`Chatbot UI is an open source clone of OpenAI's ChatGPT UI.`}</div>
            <div className="mb-2 font-bold">
              Important: Chatbot UI is 100% unaffiliated with OpenAI.
            </div>
          </div>
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="mb-2">
              Chatbot UI allows you to plug in your API key to use this UI with
              their API.
            </div>
            <div className="mb-2">
              It is <span className="italic">only</span> used to communicate
              with their API.
            </div>
            <div className="mb-2">
              {t(
                'Please set your OpenAI API key in the bottom left of the sidebar.',
              )}
            </div>
            <div>
              {t("If you don't have an OpenAI API key, you can get one here: ")}
              <a
                href="https://platform.openai.com/account/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-blue-500 hover:underline"
              >
                openai.com
              </a>
            </div>
          </div>
        </div>
      ) : modelError ? (
        <ErrorMessageDiv error={modelError} />
      ) : (
        <>
          <div
            className="max-h-full overflow-x-hidden"
            ref={chatContainerRef}
            onScroll={handleScroll}
          >
            {selectedConversation?.messages.length === 0 ? (
              <>
                <div className="mx-auto flex flex-col space-y-5 md:space-y-10 px-3 pt-5 md:pt-12 sm:max-w-[600px]">
                  <div className="text-center text-3xl font-semibold text-gray-800 dark:text-gray-100">
                    {models.length === 0 ? (
                      <div>
                        <Spinner size="16px" className="mx-auto" />
                      </div>
                    ) : (
                      'Chatbot UI'
                    )}
                  </div>

                  {models.length > 0 && (
                    <div className="flex h-full flex-col space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-600">
                      <ModelSelect />
                      <CodeInterpreterSelect
                        setPrompt={setPrompt}
                      />
                      <SystemPrompt
                        conversation={selectedConversation}
                        prompts={prompts}
                        prompt={prompt}
                        onChangePrompt={(prompt) =>
                          handleUpdateConversation(selectedConversation, {
                            key: 'prompt',
                            value: prompt,
                          })
                        }
                      />

                      <TemperatureSlider
                        label={t('Temperature')}
                        onChangeTemperature={(temperature) =>
                          handleUpdateConversation(selectedConversation, {
                            key: 'temperature',
                            value: temperature,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex justify-center border border-b-neutral-300 bg-neutral-100 py-2 text-sm text-neutral-500 dark:border-none dark:bg-[#444654] dark:text-neutral-200">
                  {t('Model')}: {selectedConversation?.model.name} | {t('Temp')}: {selectedConversation?.temperature} |
                  <button
                    className="ml-2 cursor-pointer hover:opacity-50"
                    onClick={handleSettings}
                  >
                    <IconSettings size={18} />
                  </button>
                  <button
                    className="ml-2 cursor-pointer hover:opacity-50"
                    onClick={onClearAll}
                  >
                    <IconClearAll size={18} />
                  </button>
                </div>
                {showSettings && (
                  <div className="flex flex-col space-y-10 md:mx-auto md:max-w-xl md:gap-6 md:py-3 md:pt-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
                    <div className="flex h-full flex-col space-y-4 border-b border-neutral-200 p-4 dark:border-neutral-600 md:rounded-lg md:border">
                      <ModelSelect />
                    </div>
                  </div>
                )}

                {selectedConversation?.messages.map((message, index) => (
                  <MemoizedChatMessage
                    key={index}
                    message={message}
                    messageIndex={index}
                    onEdit={(editedMessage) => {
                      setCurrentMessage(editedMessage);
                      // discard edited message and the ones that come after then resend
                      handleSend(
                        editedMessage,
                        selectedConversation?.messages.length - index,
                      );
                    }}
                  />
                ))}

                {loading && <ChatLoader />}

                <div
                  className="h-[162px] bg-white dark:bg-[#343541]"
                  ref={messagesEndRef}
                />
              </>
            )}
          </div>

          <ChatInput
            stopConversationRef={stopConversationRef}
            textareaRef={textareaRef}
            onSend={(message, plugin) => {
              setCurrentMessage(message);
              handleSend(message, 0, plugin);
            }}
            onScrollDownClick={handleScrollDown}
            onRegenerate={() => {
              if (currentMessage) {
                handleSend(currentMessage, 2, null);
              }
            }}
            showScrollDownButton={showScrollDownButton}
          />
        </>
      )}
    </div>
  );
});
Chat.displayName = 'Chat';
