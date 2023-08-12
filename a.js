const s = `{ "command": "ls ranWang/test_paper_textClassifier" }<execute_result>Command 'ls ranWang/test_paper_textClassifier' returned non-zero exit status 2.</execute_result>{ "command": "ls ranWang/test_paper_textClassifier" }<execute_result>Command 'ls ranWang/test_paper_textClassifier' returned non-zero exit status 2.</execute_result>{ "command": "ls /root/.cache/huggingface/datasets/ranWang/test_paper_textClassifier" }<execute_result>Command 'ls /root/.cache/huggingface/datasets/ranWang/test_paper_textClassifier' returned non-zero exit status 2.</execute_result>{ "command": "ls /root/.cache/huggingface/datasets/ranWang/test_paper_textClassifier" }<execute_result>Command 'ls /root/.cache/huggingface/datasets/ranWang/test_paper_textClassifier' returned non-zero exit status 2.</execute_result>{ "command": "ls /root/.cache/huggingface/datase`

// 用于分割的正则
const splitPattern = /(?={\s*"(command|code)":)/;

// 使用正则表达式分割字符串，但保留'{ "command":'或'{ "code":'作为每个部分的开始
const segments = s.split(splitPattern).filter(segment => segment.trim() !== "command" && segment.trim() !== "code");

const processSegment = (segment)=> {
    const jsonPattern = /{\s*"((?:command|code))"\s*:\s*"((?:[^"\\]|\\.)+)"\s*}/;
    const incompleteJsonPattern = /{\s*"((?:command|code))"\s*:\s*"([^"]+)$/;
    const executePattern = /<execute_result>([^<]+)<\/execute_result>/;

    let jsonKey, jsonValue;

    const jsonMatch = segment.match(jsonPattern);
    if(jsonMatch) {
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
        jsonKey: jsonKey,
        jsonValue: jsonValue,
        executeResult: executeResult,
        otherContent: otherContent ? otherContent : undefined
    };
}
// 使用该函数处理每个段落
segments.forEach(segment => {
    const result = processSegment(segment);
    console.log(result);
});
