import {
    FC,
    useContext,
    useEffect,
    useState,
} from 'react';

import HomeContext from '@/pages/api/home/home.context';
import { DEFAULT_CODE_INTERPRETER_PROMPT, DEFAULT_SYSTEM_PROMPT } from "@/utils/app/const";


interface Props {
    setPrompt: (prompt: string) => void;
}

export const CodeInterpreterSelect: FC<Props> = ({ setPrompt }) => {

    const {
        dispatch: homeDispatch,
    } = useContext(HomeContext);

    const [selectedValue, setSelectedValue] = useState<string>("1");

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedValue(value);
        updatePrompt(value);
    };

    const updatePrompt = (value: string) => {
        homeDispatch({ field: 'isCodeinterpreter', value: value === "1" });
        setPrompt(value === "1" ? DEFAULT_CODE_INTERPRETER_PROMPT : DEFAULT_SYSTEM_PROMPT)
    }

    useEffect(() => {
        updatePrompt(selectedValue);
    }, []);  // 注意这里的空数组，表示这个 useEffect 仅在组件初次挂载时执行。

    return (
        <div className="flex flex-col">
            <label htmlFor="interpreterSelect" className="mb-2 text-left text-neutral-700 dark:text-neutral-400">
                是否启用 Code interpreter
            </label>
            <div className="w-full rounded-lg border border-neutral-200 bg-transparent pr-2 text-neutral-900 dark:border-neutral-600 dark:text-white">
                <select
                    id="interpreterSelect"
                    className="w-full bg-transparent p-2"
                    value={selectedValue}
                    onChange={handleChange}
                >
                    <option value="1" className="dark:bg-[#343541] dark:text-white">
                        Code interpreter
                    </option>
                    <option value="0" className="dark:bg-[#343541] dark:text-white">
                        None
                    </option>
                </select>
            </div>
        </div>
    );
};
