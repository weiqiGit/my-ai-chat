'use client';

import React, { useState } from 'react';
import {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    WechatOutlined,
    FileTextFilled,
    UserOutlined
} from '@ant-design/icons';
import { Button, Layout, Menu, theme, Avatar } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './index.module.css';

const { Header, Sider, Content } = Layout;

const menuItems = [
    {
        key: '/ask',
        label: '问答',
        icon: <WechatOutlined />,
    },
    {
        key: '/wiki',
        label: '知识库',
        icon: <FileTextFilled />,
    },
];

export default function AntdLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();

    const pathname = usePathname();
    const items = menuItems.map((item) => ({
        ...item,
        label: <Link href={item.key}>{item.label}</Link>,
    }));

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider trigger={null} collapsible collapsed={collapsed}>
                <div className="demo-logo-vertical" />
                <Menu
                    theme="dark"
                    mode="inline"
                    selectedKeys={[pathname]}
                    items={items}
                />
            </Sider>
            <Layout>
                <Header className={styles.header} style={{ background: colorBgContainer }}>
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{
                            fontSize: '16px',
                            width: 64,
                            height: 64,
                        }}
                    />
                    <Avatar size="large" icon={<UserOutlined />} />
                </Header>
                <Content
                    style={{
                        margin: '24px 16px',
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}