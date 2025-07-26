# Windows 临时本地服务器部署指南

本文档为希望在自己电脑上临时搭建 `unhappycar` 游戏房间的玩家提供一个最简单、最快速的教程。

**适用场景**：默认服务器无法连接时，临时自己开一个房间和朋友玩，用完即关。

## 缺点🐵：
*   **好像直接截图发送更简单一点🐵🐵🐵**

**优点**：

*   **无需担心服务器宕机，一键配置一键启动**

---

### 步骤 1: 准备工作
0.  **确保你的网络环境可以流畅访问Github，推荐先开启加速器加速**
1.  **安装 Node.js**:
    *   打开一个 `cmd` 或 `PowerShell` 窗口 (推荐用**管理员身份**运行)。
    *   输入以下命令并按回车：
        ```cmd
        winget install --id OpenJS.NodeJS.LTS
        ```
    *   安装完成后，确保 `node` 和 `npm` 命令可用。

2.  **安装 Git**:
    *   在同一个终端窗口中，输入以下命令并按回车：
        ```cmd
        winget install --id Git.Git
        ```
    *   安装完成后，确保 `git` 命令可用。

3.  **安装 Cloudflare Tunnel 工具**:
    *   在同一个终端窗口中，输入以下命令并按回车：
        ```cmd
        winget install --id Cloudflare.cloudflared
        ```
    *   安装完成后，`cloudflared` 命令就可以在任何终端窗口中使用了。

4.  **下载代码并安装依赖**:
    *   在你喜欢的位置（例如桌面）打开一个新的 `cmd` 窗口。
    *   依次执行以下命令：
        ```cmd
        git clone https://github.com/kunkun11451/unhappycar-server.git
        cd unhappycar-server
        npm install
        ```

### 步骤 2: 启动服务

1.  **启动 Node.js 服务**:
    *   回到你之前为 `npm install` 打开的那个 `cmd` 窗口（确保当前路径在 `unhappycar-server` 文件夹内）。
    *   输入以下命令并按回车：
        ```cmd
        node server.js
        ```
    *   当看到类似 `服务器运行在端口 3000` 的字样时，说明服务已成功运行。**请不要关闭这个窗口**。

2.  **启动公网隧道**:
    *   **另外打开一个新的 `cmd` 窗口**。
    *   输入以下命令并按回车：
        ```cmd
        cloudflared tunnel --url localhost:3000
        ```
    *   稍等片刻，窗口中会显示一些日志，并最终出现一个以 `trycloudflare.com` 结尾的网址，**也请不要关闭这个窗口**。

---

### 连接与结束游戏

*   **连接游戏**:
    无论使用哪种方式部署，你最终都会得到一个以 `trycloudflare.com` 结尾的安全临时域名。将它用于连接游戏即可。
    *   **服务器地址**: `wss://random-word-1234.trycloudflare.com`
        *(请将域名替换为你自己终端上生成的那个)*

*   **结束游戏**:
    游戏结束后，只需**关闭所有由脚本或手动打开的命令窗口**，服务器和公网连接就会立刻关闭。
