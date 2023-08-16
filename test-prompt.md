# 以下prompt用于测试GPT处理不同功能的情况

### 基础数学计算

**Prompt**: ```"计算 5×6+3"```

**期望的Python代码**:
```python
result = 5 * 6 + 3
print(result)
```

**期望的代码执行结果**:```33```

**期望的结果回复**:```"根据计算，5×6+3 的结果是 33。"```



## 函数定义和调用(存在bug: 返回function_name为python)

**Prompt**: "定义一个函数，计算两个数的乘积，并使用这个函数计算3和7的乘积"

## Pandas表格

**Prompt**: "请加载"./testPromptFile/data.csv"文件，并显示其前5行。"

**期望的Python代码**:
```python
import pandas as pd

data = pd.read_csv('./testPromptFile/data.csv')

data.head(5)
```

**期望的代码执行结果**:
```
      Name  Age  Salary
0    Alice   25   50000
1      Bob   30   55000
2  Charlie   35   60000
3    David   40   65000
4      Eve   45   70000
```

**期望的结果回复**:```"加载成功，以下是文件的前5行内容： ..."```


## 机器学习 (存在bug: 返回function_name为python)

**Prompt**: "使用"./testPromptFile/train_data.csv"训练一个线性回归模型，然后使用该模型预测"./testPromptFile/test_data.csv"中的目标值，并计算预测的准确率"


## 时间序列分析

**Prompt**: "请加载"./testPromptFile/timeseries_data.csv"，并预测未来10天的值。"

## 网络分析

**Prompt**: "从"./testPromptFile/network_data.csv"加载数据，创建一个网络图，并找出中心度最高的前5个节点。如果你暂时不知道csv的内容，优先查看一下结构再运行代码"