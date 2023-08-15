import { GptFunction } from "@/types/functions"

const DEFAULT_FUNCTIONS :GptFunction[]= [
    {
        name: "run_code",
        description: "Exexute python code. Note: This endpoint current supports a REPL-like environment for Python only. Args: request (CodeExecutionRequest): The request object containing the code to execute. Returns: CodeExecutionResponse: The result of the code execution.",
        parameters: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    example: "print('Hello, World!')"
                }
            },
            required: [
                "code"
            ]
        }
    },
    {
        name: "run_shell",
        description: "Run commands. Args: command_request (CommandExecutionRequest): The request object containing the command to execute. Returns: CommandExecutionResponse: The result of the command execution.",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    example: "ls -la"
                }
            },
            required: [
                "command"
            ]
        }
    }
]

export { DEFAULT_FUNCTIONS }