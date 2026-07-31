'use client';

import { useState, useRef } from 'react';
import styles from './index.module.css';


interface Step {
  tool: string;
}

export default function Ask() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>();
  // 保存取消控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user' as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    //创建一个空的 AI 消息占位
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    debugger
    try {
      // 创建 AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch('http://localhost:8000/rag/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input }),
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

      while (true) {

        const { done, value } = await reader.read();
        if (done) break;
        // 保留未完成的多字节字符，等待下一个数据块到达时再补全·
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');

        buffer = lines.pop() || '';
        // 每次的lines长度不同，是tcp的流协议，Nagle （内购）算法会把多个小包合并成大包再发送。

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);

            try {
              const data = JSON.parse(dataStr);
              debugger
              if (data.type === "tool_call") {
                setStep({
                  tool: data.tool,
                });
              }
              if (data?.content) {
                setStep(undefined)
                const content = data?.content;
                fullContent += content;
                // 逐字更新最后一条 AI 消息
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      ...newMessages[lastIndex],
                      content: fullContent,
                    };
                  }
                  return newMessages;
                });
              }
              //后端返回{error:"XXX"}
              if (data.error) {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      ...newMessages[lastIndex],
                      content: `❌ ${data.error}`,
                    };
                  }
                  return newMessages;
                });
              }
            } catch (e: any) {
              // 忽略非 JSON 数据
              console.warn('忽略非 JSON 数据:', dataStr, e.message);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // 用户主动取消，不显示错误信息
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex].role === 'assistant') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: '⏹️ 已取消生成',
            };
          }
          return newMessages;
        });

      } else {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex].role === 'assistant') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: '❌ 请求失败，请重试',
            };
          }
          return newMessages;
        });
      }
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
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>请问我吧</h1>
      <div
        style={{
          border: '1px solid #ddd',
          height: 450,
          overflowY: 'auto',
          padding: 16,
          marginBottom: 12,
          borderRadius: 8,
          backgroundColor: '#f9f9f9',
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
              <div
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  borderRadius: 16,
                  maxWidth: '80%',
                  backgroundColor: msg.role === 'user' ? '#007bff' : '#e9ecef',
                  color: msg.role === 'user' ? '#fff' : '#000',
                  wordBreak: 'break-word',
                }}
              >
                <strong>{msg.role === 'user' ? '我' : 'AI'}：</strong>
                {msg.content || (msg.role === 'assistant' && <><span style={{ opacity: 0.6 }}>⏳ 思考中...</span>
                  <span className={styles.step_icon}>🔧</span>
                  <span className={styles.step_tool}>{step?.tool}...</span>
                </>)}

              </div>
              {msg.role === 'assistant' && <button onClick={() => copyMessage(msg.content)}>复制 AI 回复</button>}
            </div>
          ))
        )}
        {loading && (
          <div style={{ color: '#999', fontSize: 14, marginTop: 8 }}>
            <span>AI 正在生成...</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
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
  );
}