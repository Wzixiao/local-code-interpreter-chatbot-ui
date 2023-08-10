export interface GptFunction {
    name: string;
    description: string;
    parameters: {
        type: "object" | "int";
        properties: {
            [key: string]: {
                type: string;
                example: string;
            }
        },
        required: string[];
    }
}