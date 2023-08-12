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
import cloneDeep from 'lodash/cloneDeep'

import { cleanTreminalColorText } from "@/utils/app/clean"
import { ChatBody, Conversation, Message, GptAnswerJson, CodeExcuteResult } from '@/types/chat';
import { Plugin } from '@/types/plugin';
import { processSSEStream } from "@/utils/server/index"
import { generatePromptByMessageContent } from "@/utils/app/analyze"

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


  function updateConversationByMessageContent(conversation: Conversation, result: string) {
    const updatedMessages = [...conversation.messages];
    const lastMessage = updatedMessages[updatedMessages.length - 1];
    lastMessage.excuteResult = result;
    const updatedConversation = {
      ...conversation,
      messages: updatedMessages,
    };
    homeDispatch({
      field: 'selectedConversation',
      value: updatedConversation,
    });
  }


  const constructConversation = async (conversation: Conversation, isCodeinterpreter: boolean = false): Promise<Response> => {
    const endpoint = getEndpoint(null);
    const controller = new AbortController();
    const conversationCopy = cloneDeep(conversation)
    conversationCopy.messages = conversationCopy.messages.map((item: Message):Message=>{
      return {
        ...item,
        content: item.role === "assistant" ? generatePromptByMessageContent(item.content) : item.content
      }
    })

    if (conversationCopy.messages[conversation.messages.length - 1].role === "assistant"){
      conversationCopy.messages.push({
        role: "user",
        content: "continue"
      })
    }


    const chatBody: ChatBody = {
      model: conversationCopy.model,
      messages: conversationCopy.messages,
      key: apiKey,
      prompt: prompt,
      temperature: conversationCopy.temperature
    };

    console.log(" conversation.messages", conversationCopy.messages);
    
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


  const handleSend = useCallback(
    async (message: Message, deleteCount = 0) => {
      if (selectedConversation) {
        let updatedConversation: Conversation;
        let messages: Message[] = []

        if (deleteCount) {
          const updatedMessages = [...selectedConversation.messages];
          for (let i = 0; i < deleteCount; i++) {
            updatedMessages.pop();
          }
          messages = [...updatedMessages, message]
        } else {
          messages = [...selectedConversation.messages, message]
        }

        updatedConversation = {
          ...selectedConversation,
          messages,
        };

        homeDispatch({
          field: 'selectedConversation',
          value: updatedConversation,
        });

        homeDispatch({ field: 'loading', value: true });
        homeDispatch({ field: 'messageIsStreaming', value: true });

        // 自定义对话标题
        if (updatedConversation.messages.length === 1) {
          const { content } = message;
          const customName = content.length > 30 ? content.substring(0, 30) + '...' : content;
          updatedConversation = {
            ...updatedConversation,
            name: customName,
          };
        }


        
        const thisRoundMessage: Message = { role: 'assistant', content: "" }
        let nonstop = true
        let isFirst = true
        while (nonstop) {
          const response = await constructConversation(updatedConversation, isCodeinterpreter)

          if (!response.ok) {
            homeDispatch({ field: 'loading', value: false });
            homeDispatch({ field: 'messageIsStreaming', value: false });
            toast.error(response.statusText);
            return;
          }
  
          const data = response.body;
  
          if (!data) {
            homeDispatch({ field: 'loading', value: false });
            homeDispatch({ field: 'messageIsStreaming', value: false });
            return;
          }

          let isFunctionCall = false
          let functionName: undefined|string = undefined
          let codeParams = ""
          let roundFirst = true
          await processSSEStream<GptAnswerJson>(data, async (message: GptAnswerJson) => {
            const delta = message.choices[0].delta
            const chunkChatContent = message.choices[0].finish_reason ? "" : "function_call" in delta ? delta.function_call?.arguments : delta.content

            if ("function_call" in delta){
              codeParams += delta.function_call?.arguments 
            }

            thisRoundMessage.content += chunkChatContent

            let updatedMessages;

            if (isFirst) {
              updatedMessages = [
                ...updatedConversation.messages,
                thisRoundMessage,
              ];
              isFirst = false
              roundFirst = false
              functionName = delta.function_call?.name
           
              isFunctionCall = "function_call" in delta
            } else {
              if (roundFirst){
                roundFirst = false
                functionName = delta.function_call?.name
                isFunctionCall = "function_call" in delta
              }

              if (!isFunctionCall){
                isFunctionCall =  "function_call" in delta
                functionName = delta.function_call?.name
              }
              updatedMessages = updatedConversation.messages.map((message, index) => {
                if (index === updatedConversation.messages.length - 1) return thisRoundMessage
                return message;
              });
            }
            console.log("functionName",functionName);
            
            updatedConversation = {
              ...updatedConversation,
              messages: updatedMessages,
            };

            homeDispatch({
              field: 'selectedConversation',
              value: updatedConversation,
            });

          })

          if (isFunctionCall) {
            console.log("codeParams",codeParams);
            
            const response = await fetch("http://localhost:5000/execute", {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                functionName,
                sessionId: "aaa",
                arguments: JSON.parse(codeParams) // Must be a standard json structure
              })
            })
            
            if (!response.body) {
              homeDispatch({ field: 'loading', value: false });
              homeDispatch({ field: 'messageIsStreaming', value: false });
              return;
            }

            let isFirstExecuteCodeResult = true
            await processSSEStream<CodeExcuteResult>(response.body, async (message: CodeExcuteResult) => {

              if(isFirstExecuteCodeResult){
                thisRoundMessage.content += "<execute_result>" + message.content
                isFirstExecuteCodeResult = false
              }else{
                thisRoundMessage.content += message.content
              }

              const updatedMessages = updatedConversation.messages.map((message, index) => {
                if (index === updatedConversation.messages.length - 1) return thisRoundMessage
                return message;
              });

              updatedConversation = {
                ...updatedConversation,
                messages: updatedMessages,
              };

              homeDispatch({
                field: 'selectedConversation',
                value: updatedConversation,
              });

            })

            thisRoundMessage.content += "</execute_result>"

            const updatedMessages = updatedConversation.messages.map((message, index) => {
              if (index === updatedConversation.messages.length - 1) return thisRoundMessage
              return message;
            });

            updatedConversation = {
              ...updatedConversation,
              messages: updatedMessages,
            };

            homeDispatch({
              field: 'selectedConversation',
              value: updatedConversation,
            });

            nonstop = true
          } else {
            nonstop = false
          }

        }

        const updatedConversations: Conversation[] = conversations.map(
          (conversation) => {
            if (conversation.id === selectedConversation.id) {
              return updatedConversation;
            }
            return conversation;
          },
        );
        saveConversations(updatedConversations);
        saveConversation(updatedConversation);
        homeDispatch({ field: 'messageIsStreaming', value: false });
        homeDispatch({ field: 'loading', value: false });

      }
    },
    [
      apiKey,
      conversations,
      pluginKeys,
      selectedConversation,
      stopConversationRef,
      isCodeinterpreter,
    ],
  );

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

                {selectedConversation?.messages.map((message, index) => {

                  return (
                    <MemoizedChatMessage
                      key={index}
                      message={message}
                      messageIndex={index}
                      onEdit={(editedMessage) => {
                        setCurrentMessage(editedMessage);
                        // discard edited message and the ones that come after then resend
                        handleSend(
                          editedMessage,
                          selectedConversation?.messages.length - index
                        );
                      }}
                    />
                  );
                })}

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
              handleSend(message, 0);
            }}
            onScrollDownClick={handleScrollDown}
            onRegenerate={() => {
              if (currentMessage) {
                handleSend(currentMessage, 2);
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
