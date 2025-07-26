# 部署 `unhappycar-server` 服务端详细指南 (Ubuntu)

本文档将指导你在 Ubuntu 服务器上成功部署、运行并维护 `unhappycar-server`。

## 目录
1.  [准备工作](#1-准备工作)
2.  [代码修改（重要）](#2-代码修改重要)
3.  [在 Ubuntu 上部署](#3-在-ubuntu-上部署)
4.  [验证服务](#4-验证服务)
5.  [日常维护](#5-日常维护)

---

### 1. 准备工作

在开始之前，请确保你已具备以下条件：

*   **一台 Ubuntu 服务器**: 推荐使用 Ubuntu 20.04 LTS 或更高版本。
*   **一个域名**: 例如 `your.domain.com`，并且已经将该域名的 A 记录解析到你服务器的 IP 地址。
*   **防火墙配置**: 确保服务器的防火墙已开放以下端口：
    *   `80` (HTTP, 用于 SSL 证书申请)
    *   `443` (HTTPS, 用于 SSL 证书申请和 WSS 连接)
    *   `22` (SSH, 用于远程登录)
    *   `3000` (或者你在 `server.js` 中指定的其他端口，虽然此项目最终通过 443 端口访问，但开放此端口便于调试)

*   **安装 Node.js 和 npm**: 如果你的服务器上还没有安装，请执行以下命令：
    ```bash
    sudo apt update
    sudo apt install -y nodejs npm
    # 验证安装
    node -v
    npm -v
    ```

### 2. 代码修改（重要）

`server.js` 文件中硬编码了 SSL 证书的路径，其中包含了域名 `unhappycar.tech`。你需要将其修改为你自己的域名。

**打开 `server.js` 文件，找到以下代码块：**

```javascript
// server.js Line 22
const isLocalTest = process.env.NODE_ENV === 'development' || !fs.existsSync('/etc/letsencrypt/live/unhappycar.tech/fullchain.pem');

// server.js Line 37
const sslOptions = {
  cert: fs.readFileSync("/etc/letsencrypt/live/unhappycar.tech/fullchain.pem"),
  key: fs.readFileSync("/etc/letsencrypt/live/unhappycar.tech/privkey.pem"),
  ca: fs.readFileSync("/etc/letsencrypt/live/unhappycar.tech/chain.pem"),
};
```

**将其中的 `unhappycar.tech` 修改为你的域名。** 例如，如果你的域名是 `game.example.com`，则修改后应如下所示：

```javascript
// server.js Line 22 (修改后)
const isLocalTest = process.env.NODE_ENV === 'development' || !fs.existsSync('/etc/letsencrypt/live/game.example.com/fullchain.pem');

// server.js Line 37 (修改后)
const sslOptions = {
  cert: fs.readFileSync("/etc/letsencrypt/live/game.example.com/fullchain.pem"),
  key: fs.readFileSync("/etc/letsencrypt/live/game.example.com/privkey.pem"),
  ca: fs.readFileSync("/etc/letsencrypt/live/game.example.com/chain.pem"),
};
```

**这是部署过程中最关键的一步，如果忘记修改，服务将无法在生产环境中启动，因为它找不到正确的证书文件。**

### 3. 在 Ubuntu 上部署

#### 步骤 1: 克隆代码并安装依赖

首先，通过 SSH 登录到你的 Ubuntu 服务器，然后执行以下操作。

```bash
# 克隆 GitHub 仓库
git clone https://github.com/kunkun11451/unhappycar-server.git

# 进入项目目录
cd unhappycar-server

# （可选）如果你在本地修改了代码，请将修改后的 server.js 文件上传到服务器的这个目录中
# 你可以使用 scp 命令或者 FTP 工具

# 安装项目依赖 (ws 和 uuid)
npm install
```

#### 步骤 2: 申请 SSL 证书

我们将使用 `Certbot` 和 `Nginx` 来申请免费的 Let's Encrypt SSL 证书。即使我们的 Node.js 服务自己处理 HTTPS，使用 Nginx 也是一个好习惯，它可以帮助我们更轻松地管理证书。

```bash
# 1. 安装 Nginx
sudo apt update
sudo apt install -y nginx

# 2. 安装 Certbot 的 Nginx 插件
sudo apt install -y certbot python3-certbot-nginx

# 3. 为你的域名申请证书
# 将 your.domain.com 替换为你的真实域名
sudo certbot --nginx -d your.domain.com
```

在运行 `certbot` 命令时，它会引导你完成一些设置：
*   输入你的邮箱地址（用于接收续订提醒）。
*   同意服务条款。
*   选择是否愿意分享你的邮箱。
*   它会自动修改 Nginx 配置以使用 SSL，并设置自动续订。

成功后，你的证书文件就会被创建在 `/etc/letsencrypt/live/your.domain.com/` 目录下，这正是我们在 `server.js` 中指定的路径。

#### 步骤 3: 使用 PM2 启动和管理服务

直接使用 `node server.js` 启动服务会在你关闭 SSH 连接后中断。我们应该使用进程管理器 `PM2` 来确保服务在后台持续运行，并且在服务器重启后能自动启动。

```bash
# 1. 全局安装 PM2
sudo npm install pm2 -g

# 2. 使用 PM2 启动你的服务
# --name 参数为你的服务起一个别名，方便管理
pm2 start server.js --name unhappycar-server

# 3. 设置开机自启动
# PM2 会生成一行命令，复制并执行它
pm2 startup

# 4. 保存当前的应用列表
pm2 save
```

现在，你的 `unhappycar-server` 服务已经在后台稳定运行了。

### 4. 验证服务

你可以通过以下方式来检查服务是否正常工作。

*   **查看 PM2 状态**:
    ```bash
    pm2 list
    # 或者
    pm2 status
    ```
    你应该能看到 `unhappycar-server` 的状态是 `online`。

*   **查看服务日志**:
    ```bash
    # 实时查看日志
    pm2 logs unhappycar-server
    ```
    你应该能看到 `[timestamp] 使用生产环境模式 (HTTPS)` 和 `[timestamp] 服务器运行在端口 3000` 的日志输出。

*   **测试 WebSocket 连接**:
    你可以使用任何 WebSocket 测试工具（如 Chrome 插件 `Simple WebSocket Client` 或在线工具）连接到你的服务地址 `wss://your.domain.com`。如果连接成功，说明服务已正确部署。

### 5. 日常维护

*   **重启服务**:
    ```bash
    pm2 restart unhappycar-server
    ```

*   **停止服务**:
    ```bash
    pm2 stop unhappycar-server
    ```

*   **删除服务**:
    ```bash
    pm2 delete unhappycar-server
    ```

*   **更新代码**:
    ```bash
    # 进入项目目录
    cd unhappycar-server

    # 从 Git 拉取最新代码
    git pull

    # 重新安装依赖（以防有变动）
    npm install

    # 重启服务以应用更新
    pm2 restart unhappycar-server
    ```

---
部署完成！现在你的 `unhappycar-server` 已经可以通过 `wss://your.domain.com` 安全地访问了。
