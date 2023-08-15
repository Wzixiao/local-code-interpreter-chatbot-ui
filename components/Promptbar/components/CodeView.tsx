import {
    IconBulbFilled,
    IconCheck,
    IconTrash,
    IconX,
  } from '@tabler/icons-react';
  import {
    DragEvent,
    MouseEventHandler,
    useContext,
    useEffect,
    useState,
  } from 'react';
  
  import { Prompt } from '@/types/prompt';
  
  import SidebarActionButton from '@/components/Buttons/SidebarActionButton';
  import { codeGenerateMarkdownString } from "@/utils/app/message"
  import PromptbarContext from '../PromptBar.context';
  import { PromptModal } from './PromptModal';
  import { Message } from '@/types/chat';
  import { MemoizedReactMarkdown } from '@/components/Markdown/MemoizedReactMarkdown';
  import { Conversation } from '@/types/chat';
  import { CodeBlock } from '@/components/Markdown/CodeBlock';

  
  interface Props {
    index: number;
    selectedConversation: Conversation;
  }
  


  export const CodeComponent = ({ index, selectedConversation }: Props) => {
    
    const viewCode = codeGenerateMarkdownString(selectedConversation.messages, index)


    return (
      <MemoizedReactMarkdown
      className="prose dark:prose-invert flex-1"
      
      components={{
        code({ node, inline, className, children, ...props }) {
          if (children.length) {
            if (children[0] == '▍') {
              return <span className="animate-pulse cursor-default mt-1">▍</span>
            }

            children[0] = (children[0] as string).replace("`▍`", "▍")
          }

          const match = /language-(\w+)/.exec(className || '');


          return !inline ? (
            <CodeBlock
              key={Math.random()}
              language={(match && match[1]) || ''}
              value={String(children).replace(/\n$/, '')}
              {...props}
            />
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        table({ children }) {
          return (
            <table className="border-collapse border border-black px-3 py-1 dark:border-white">
              {children}
            </table>
          );
        },
        th({ children }) {
          return (
            <th className="break-words border border-black bg-gray-500 px-3 py-1 text-white dark:border-white">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="break-words border border-black px-3 py-1 dark:border-white">
              {children}
            </td>
          );
        },
      }}
    >
      {`${viewCode} `}
    </MemoizedReactMarkdown>
    );
  };
  