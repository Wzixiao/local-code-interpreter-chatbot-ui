const mergeMessage = (oldMessage, newMessage) => {
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

const oldMessage = {
    role: 'assistant',
    content: null,
    function_call: { 
        name: 'run_shell', 
        arguments: '' 
    }  
}

const newMessage = {
    "role": "assistant",
    "function_call": {
        "name": "run_shell",
        "arguments": ""
    }
}

console.log(mergeMessage(oldMessage, newMessage));