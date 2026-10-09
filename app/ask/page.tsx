'use client';

import { useState, useRef } from 'react';
import styles from './index.module.css';
import { Spin, Modal, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Step {
  tool: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  status?: 'thinking' | 'tool_calling' | 'generating' | 'done' | 'error';
  toolName?: string;
  sources?: string[]
}

export default function Ask() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{
    open: boolean;
    sql: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [mode, setMode] = useState<'chat' | 'query'>('chat');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  // 保存取消控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user' as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', status: 'thinking' },  // ← 改成这样
    ]);
    try {
      // 创建 AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch('http://localhost:8000/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: mode === 'query' ? `query:${input}` : input }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('请求失败');

      //流式读取，response.body是可读流
      const reader = response.body?.getReader();
      //将二进制数据解码成字符串
      const decoder = new TextDecoder();

      if (!reader) throw new Error('无法读取响应流');

      let buffer = '';
      let fullContent = '';
      let thread_id = ''
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimLine = line.trim();
          if (!trimLine.startsWith("data: ")) continue;
          const dataStr = trimLine.slice(6);
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'thread_id') {
              thread_id = data.thread_id;  // 保存下来
              continue
            }
            // 1. 工具调用（普通工具 / SQL申请）
            if (data.type === "tool_call") {

              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg?.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    status: "tool_calling",
                    toolName: data.tool,
                  };
                }
                return newMessages;
              });
              continue;
            }

            // 2. 审批通知消息（审批通过/驳回文字提示）
            if (data.type === "notify") {
              console.log("通知消息：", data.text);
              // 可选：你可以追加一条轻量提示，或者UI弹窗toast
              continue;
            }

            // 3. 数据源 sources
            if (data.type === "sources") {
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg?.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    sources: data.sources,
                  };
                }
                return newMessages;
              });
              continue;
            }

            // 4. 审批中断弹窗（重点修复层级问题）
            if (data.type === "interrupt") {
              const interruptInfo = data.data;
              setDialog({
                open: true,
                sql: interruptInfo.args.sql,
                message: interruptInfo.message,
                onConfirm: async () => {
                  setDialog(null);
                  const resp = await fetch('http://localhost:8000/chat/agent/sql/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: thread_id }),
                  });

                  const reader = resp.body!.getReader();
                  const decoder = new TextDecoder();
                  let bufferItem = '';

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    bufferItem += decoder.decode(value, { stream: true });
                    const lines = bufferItem.split('\n\n');
                    bufferItem = lines.pop() || '';

                    for (const line of lines) {

                      if (line.startsWith('data: ')) {

                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'token') {
                          fullContent += data.content;
                          // 追加到回答文本

                          setMessages((prev) => {
                            const newMessages = [...prev];
                            const lastIdx = newMessages.length - 1;
                            const lastMsg = newMessages[lastIdx];
                            newMessages[lastIdx] = {
                              ...lastMsg,
                              status: 'tool_calling',
                              content: fullContent,
                            };
                            return newMessages;
                          });
                        } else if (data.done) {
                          // 结束
                          setMessages((prev) => {
                            const newMessages = [...prev];
                            const lastIdx = newMessages.length - 1;
                            const lastMsg = newMessages[lastIdx];
                            newMessages[lastIdx] = {
                              ...lastMsg,
                              status: 'done',
                            };
                            return newMessages;
                          });
                        }
                      }
                    }
                  }
                },
                onCancel: async () => {
                  setDialog(null);
                  const resp = await fetch('http://localhost:8000/chat/agent/sql/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: thread_id }),
                  });
                  const data = await resp.json();
                  fullContent += data.answer;
                  // 追加到回答文本

                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastIdx = newMessages.length - 1;
                    const lastMsg = newMessages[lastIdx];
                    newMessages[lastIdx] = {
                      ...lastMsg,
                      status: 'done',
                      content: fullContent,
                    };
                    return newMessages;
                  });
                },
              });
              break;
            }

            // 5. LLM文本流式内容
            if (data.content) {
              fullContent += data.content;
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg?.role === "assistant") {
                  let nextStatus = lastMsg.status;
                  if (nextStatus === "thinking" || nextStatus === "tool_calling") {
                    nextStatus = "generating";
                  }
                  console.log(fullContent)
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    status: nextStatus,
                    content: fullContent,
                  };
                }
                return newMessages;
              });
            }

            // 6. 消息结束标记
            if (data.done) {
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg?.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    status: "done",
                  };
                }
                return newMessages;
              });
            }

            // 7. 错误信息
            if (data.error) {
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg?.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    status: "error",
                    content: `❌ ${data.error}`,
                  };
                }
                return newMessages;
              });
            }
          } catch (e) {
            console.warn("解析JSON失败", dataStr, e);
          }
        }
      }
    } catch (err) {
      console.error("流式连接异常断开", err);
      // 网络异常，把最后一条消息置为error状态
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIdx = newMessages.length - 1;
        const lastMsg = newMessages[lastIdx];
        if (lastMsg?.role === "assistant") {
          newMessages[lastIdx] = {
            ...lastMsg,
            status: "error",
            content: "连接中断，请重试",
          };
        }
        return newMessages;
      });

    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // ✅ 新增：取消生成
  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // 回车发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = async (msg: string) => {
    try {
      await navigator.clipboard.writeText(msg);
      alert('已复制到剪贴板！');
    } catch (err) {
      console.error('复制失败:', err);
      alert('复制失败，请手动选择文字复制。');
    }
  }
  const renderStatus = (msg: Message) => {

    if (msg.status === 'thinking') return <><Spin size="small" /> 思考中...</>;
    if (msg.status === 'tool_calling') return `🔧 正在调用：${msg.toolName}...`;
    if (msg.status === 'done') return <><SearchOutlined />已完成</>;
    if (msg.status === 'error') return <>'❌ 请求失败'</>;
    // generating 或已有内容：显示内容
    // if (msg.content) return msg.content;
    return '✍️ 生成中...';
  };

  const toDoc = (src: string) => {
    window.open(`http://localhost:8000/uploads/${src}`)
  }
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      {/* <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>请问我吧</h1> */}
      <div
        style={{
          height: 450,
          overflowY: 'auto',
          padding: 16,
          marginBottom: 12,
          borderRadius: 8,
          width: '100%',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', paddingTop: 40 }}>
            输入问题开始对话
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                textAlign: msg.role === 'user' ? 'right' : 'left',
                marginBottom: 12,
              }}
            >
              {msg.role === 'user' ? <div
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  borderRadius: 16,
                  maxWidth: '80%',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  wordBreak: 'break-word',
                }}
              >
                {msg.status === 'done' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>  // 完整后，渲染 Markdown
                ) : (
                  <span>{msg.content}</span>  // 流式中，直接显示

                )}
              </div>
                :
                <div className={styles.assistantBox}>
                  <span className={styles.assistantStatus}>{renderStatus(msg)}{msg.status === 'done' && (
                    <button onClick={() => copyMessage(msg.content)} style={{ color: '#1981eb', borderBottom: 'solid 1px #1981eb', marginLeft: '10px' }}>复制</button>
                  )}</span>
                  <div
                    style={{
                      display: 'inline-block',
                      borderRadius: 16,
                      color: '#000',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.status === 'done' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>  // 完整后，渲染 Markdown
                    ) : (
                      <span>{msg.content}</span>  // 流式中，直接显示

                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, color: '#666', }}>
                        📎 来源：
                        {msg.sources.map((src, i) => (
                          <span key={i} onClick={() => toDoc(src)} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, marginRight: 6, 'cursor': 'pointer' }}>
                            {src}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>}
            </div>
          ))
        )}

      </div>
      <div>
        <div style={{ display: 'flex', gap: 8, }}>
          <Select
            defaultValue="chat"
            style={{ width: 80 }}
            onChange={(value: "chat" | "query") => setMode(value)}
            options={[
              { value: 'chat', label: '聊天' },
              { value: 'query', label: '数据' },

            ]}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题..."
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              border: '1px solid #ccc',
              fontSize: 16,
            }}
            disabled={loading}
          />
          {loading ? (
            // ✅ 新增：取消按钮
            <button
              onClick={cancelGeneration}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#dc3545',
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#007bff',
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              发送
            </button>
          )}
        </div>
      </div>
      <Modal
        title="请确认"
        closable={{ 'aria-label': 'Custom Close Button' }}
        open={dialog?.open}
        onOk={dialog?.onConfirm}
        onCancel={dialog?.onCancel}
      >
        <p>{dialog?.message}</p>
        <div className="sql-block">
          <pre>{dialog?.sql}</pre>
        </div>
      </Modal>
    </div >
  );
}