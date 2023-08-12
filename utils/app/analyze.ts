import { cleanTreminalColorText } from "./clean"

interface MarkdownLanguageMap {
    [key: string]: string;
}

  const markdownLanguageMap: MarkdownLanguageMap = {
    code: "python",
    command: "shell"
  }


const processSegment = (segment: string) => {
    const jsonPattern = /{\s*"((?:command|code))"\s*:\s*"((?:[^"\\]|\\.)+)"\s*}/;
    const incompleteJsonPattern = /{\s*"((?:command|code))"\s*:\s*"([^"]+)$/;
    const executePattern = /<execute_result>([^<]+)<\/execute_result>/;

    let jsonKey, jsonValue;

    const jsonMatch = segment.match(jsonPattern);
    if (jsonMatch) {
        jsonKey = jsonMatch[1];
        jsonValue = jsonMatch[2];
    } else {
        const incompleteJsonMatch = segment.match(incompleteJsonPattern);
        if (incompleteJsonMatch) {
            jsonKey = incompleteJsonMatch[1];
            jsonValue = incompleteJsonMatch[2];
        }
    }

    const executeMatch = segment.match(executePattern);
    const executeResult = executeMatch ? executeMatch[1] : undefined;

    // 剩余的内容
    let otherContent = segment;
    if (jsonValue) {
        otherContent = otherContent.replace(jsonPattern, '').replace(incompleteJsonPattern, '');
    }
    if (executeResult) {
        otherContent = otherContent.replace(executePattern, '');
    }
    otherContent = otherContent.trim();


    return {
        rawCodeJsonKey: jsonKey,
        codeLanguage: jsonKey ? markdownLanguageMap[jsonKey] || "" : "",
        code: jsonValue,
        executeResult: executeResult? cleanTreminalColorText(executeResult) : "",
        otherContent: otherContent ? otherContent : ""
    }
}

export const generateMarkdownString = (str: string): string => {
    // 用于分割的正则
    const splitPattern = /(?={\s*"(command|code)":)/;

    // 使用正则表达式分割字符串，但保留'{ "command":'或'{ "code":'作为每个部分的开始
    const segments = str.split(splitPattern).filter(segment => segment.trim() !== "command" && segment.trim() !== "code");

    let viewContent = ""
    for (const segment of segments) {
        const row = processSegment(segment)
        viewContent += row.code ? `\`\`\`${row.codeLanguage}\n${row.code}\n\`\`\`` : ""
                    + "\n"
                    + row.executeResult? `\`\`\`\n${row.executeResult}\n\`\`\`` : ""
                    + "\n"
                    + row.otherContent + "\n"
    }

    return viewContent.replaceAll("\\n", "\n")
}

export const generatePromptByMessageContent= (str: string): string => {
    // 用于分割的正则
    const splitPattern = /(?={\s*"(command|code)":)/;

    const segments = str.split(splitPattern).filter(segment => segment.trim() !== "command" && segment.trim() !== "code");

    let promot = ""
    for (const segment of segments) {
        const row = processSegment(segment)
        promot += `{${row.rawCodeJsonKey}: ${row.code}}`
               + "\n"
               + `<execute_result>${row.executeResult.length > 200 ? row.executeResult.slice(-200): row.executeResult}</execute_result>`
               + "\n"
               + row.otherContent + "\n"
    }

    return promot
}