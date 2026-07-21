'use client';

import { useState, useEffect } from 'react'; //
import { Flex, Space, Table, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { TableProps, UploadProps } from 'antd';

interface DataType {
    key: string;
    name: string;
    age: number;
    address: string;
    tags: string[];
}

export default function Wiki() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false)
    const handleDelete = async (fileName: string) => {
        try {
            const res = await fetch(`http://localhost:8000/rag/deleteFile?file_name=${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
            });
            const result = await res.json();
            if (result.code === 0) {
                message.success(`已删除 ${fileName}`);
                await fetchFiles(); // 刷新列表
            } else {
                message.error(result.message || '删除失败');
            }
        } catch (error) {
            message.error('删除失败');
        }
    };

    const columns: TableProps<DataType>['columns'] = [
        {
            title: '文件名',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <a href={`http://localhost:8000/uploads/${text}`} target='_blank'> {text}</a >,
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Space size="medium">
                    <a onClick={() => handleDelete(record.name)}>Delete</a>
                </Space>
            ),
        },
    ];

    // 获取文件列表
    const fetchFiles = async () => {
        try {
            const res = await fetch('http://localhost:8000/rag/files');
            const result = await res.json();
            if (result.code === 0) {
                const files = result.data?.map((item: any, index: number) => ({
                    key: String(index),
                    name: item.name,
                }));
                setData(files);
            }
        } catch (error) {
            console.error('获取文件列表失败', error);
        }
    };

    const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file as File);

        try {
            const res = await fetch('http://localhost:8000/rag/upload', {
                method: 'POST',
                body: formData,
            });
            const result = await res.json();
            if (result.code === 0) {
                onSuccess?.(result, file as File);
                message.success(`上传成功`);
                // 刷新文件列表
                await fetchFiles();
            } else {
                onError?.(new Error(result.message || '上传失败'));
            }
        } catch (error) {
            onError?.(error as Error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles()
    }, [])
    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
            <Upload style={{ float: 'right', marginBottom: '10px' }} accept=".pdf,.txt" customRequest={customRequest} showUploadList={false}>
                <Button icon={<UploadOutlined />} loading={loading}>上传文件</Button>
            </Upload>
            <Table<DataType> columns={columns} dataSource={data} />
        </div>
    );
}