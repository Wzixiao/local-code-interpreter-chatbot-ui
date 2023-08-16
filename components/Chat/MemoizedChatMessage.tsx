import { FC, memo } from "react";
import { ChatMessage, Props } from "./ChatMessage";
import { generateMarkdownString } from "@/utils/app/message"


export const MemoizedChatMessage: FC<Props> = memo(
    ChatMessage,
    (prevProps, nextProps) => (
        generateMarkdownString(prevProps.messages, prevProps.messageIndex)
        === 
        generateMarkdownString(nextProps.messages, nextProps.messageIndex)
    )
);
