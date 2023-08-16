import { Message } from '@/types/chat';

const markdownLanguageMap = {
    code: "python",
    command: "shell"
}

export function extractKeyValueAndContent(str: string) {
    const match = str.match(/"(command|code)"\s*:\s*"((?:[^"\\]|\\.)*?)"/);
    
    if (match && match[1] && match[2]) {
        return {
            key: match[1],
            content: match[2]
        };
    }

    return null;
}

function generateCodeStr(code: string, label: string | null = null): string {
    return `\`\`\`${label?label:""}\n${code}\n\`\`\``
}


function parseUser(message: Message): string {
    return message.content ? message.content : ""
}

function parseFunctionResult(message: Message): string {
    const content = message.content

    if (!content){
        return ""
    }
   
    
    if (content.length >= 500 || content.split("\n").length > 50){
        console.log(content.split("\n").length);
        return generateCodeStr(JSON.stringify(content), "Result")
    }
    
    return generateCodeStr(content, "Result")
}

function parseAssistant(message: Message): string {
    const content = message.content
    const functionArguments = message.function_call?.arguments
    
    let viewStr = ""
    viewStr += content ? content : ""

    if (functionArguments){
        const keyWithValue = extractKeyValueAndContent(functionArguments)
        viewStr += "\n"

        viewStr += generateCodeStr(
            keyWithValue && keyWithValue.content ? keyWithValue.content.replaceAll("\\n", "\n") : "",
            (keyWithValue && keyWithValue.key && keyWithValue?.key in markdownLanguageMap) ? markdownLanguageMap[keyWithValue?.key as keyof typeof markdownLanguageMap]
            : ""
        )
        
    }

    return viewStr
}


export const generateMarkdownString = (messages: Message[], index: number) => {
    const viewStrs: string[] = [];
    let userCount = 0;

    for (index; index < messages.length; index++) {
        const message = messages[index];

        switch (message.role) {
            case "user":
                userCount++;
                if (userCount >= 1) {
                    return viewStrs.join("\n");
                }
                viewStrs.push(parseUser(message));
                break;
            case "function":
                viewStrs.push(parseFunctionResult(message));
                break;
            case "assistant":
                viewStrs.push(parseAssistant(message));
                break;
            default:
                viewStrs.push(parseUser(message));
                break;
        }
    }

    return viewStrs.join("\n");
};
