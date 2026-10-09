# AI Agent 前端

AI Agent 服务的聊天前端，支持流式对话、工具调用状态展示、SQL 人工审批和来源溯源。

## 功能特性

- 流式对话：打字机效果，逐字渲染 AI 回复
- 工具调用状态：实时显示"思考中"、"正在调用工具"、"生成中"
- SQL 人工审批：弹窗展示 SQL，用户确认或驳回
- 来源溯源：回答下方显示来源文档，点击可查看原文
- 对话模式切换：聊天模式 / 数据查询模式
- 取消生成：生成过程中可随时取消
- Markdown 渲染：支持代码块、表格等格式
- 
## 技术栈

- Next.js + TypeScript
- Ant Design
- React Markdown

## 快速开始

```bash
npm install
npm run dev

项目结构

app/
├── page.tsx          # 聊天主页面
├── layout.tsx        # 布局
└── index.module.css  # 样式

核心交互
流式对话
前端用 fetch + ReadableStream 接收后端 SSE 流，逐字渲染 AI 回复。

工具调用状态
根据后端推送的事件，切换消息状态：

SQL 人工审批
后端通过 interrupt 事件推送 SQL，前端弹窗展示。用户点击"确认"调用 /agent/sql/approve，点击"取消"调用 /agent/sql/reject。



来源溯源
后端推送 sources 事件，前端在回答下方展示来源标签，点击可打开原始文档。


