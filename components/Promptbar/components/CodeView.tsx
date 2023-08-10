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
  
  import PromptbarContext from '../PromptBar.context';
  import { PromptModal } from './PromptModal';
import { Message } from '@/types/chat';
  
  interface Props {
    message: Message;
  }
  
  export const CodeComponent = ({ message }: Props) => {
    return (
      <div></div>
    );
  };
  