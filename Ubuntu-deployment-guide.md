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
    *   `443` (HTTPS/WSS, 服务运行的必要端口)
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

### 2. 在 Ubuntu 上部署

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

#### 步骤 2: 申请 SSL 证书 (DNS 验证方式)
> 💡 **Tips：**
> 出现紫色背景的配置界面保持默认勾选（什么都不用做，直接按 `Enter` ）

由于位于中国大陆的服务器，域名需要备案才能使用 80 端口进行常规的 HTTP 验证。为了绕过此限制，我们采用 **DNS 验证** 的方式来申请证书。此方法无需使用 80 端口，也无需安装 Nginx。

```bash
# 1. 安装 Certbot
sudo apt update
sudo apt install -y certbot

# 2. 使用 DNS 验证方式申请证书
# 将 your.domain.com 替换为你的真实域名
sudo certbot certonly --manual --preferred-challenges dns -d your.domain.com
```

**执行命令后，你需要根据提示完成以下操作：**

1.  Certbot 会在终端显示一串以 `_acme-challenge` 开头的记录名和一个随机字符串的记录值。
```bash
# 内容示例
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

Please deploy a DNS TXT record under the name:   # 请以以下记录名下部署 DNS TXT 记录：

_acme-challenge.your.domain.com.   # 记录名

with the following value:   # 具有以下记录值

xxxxxxxxxxxxxxxxxxxxxx   # 随机记录值

Before continuing, verify the record is deployed.   # 在继续之前，请验证记录是否已部署。

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Press Enter to Continue   # 按 Enter 继续（务必等几分钟让DNS记录生效再继续）
```
2.  **登录你的域名注册商**（例如：阿里云、腾讯云、GoDaddy 等）。
3.  进入该域名的 **DNS 解析管理** 界面。
4.  **添加一条新的 TXT 记录**：
    *   **主机记录 (Host/Name)**: 填入 Certbot 提供的记录名 (例如 `_acme-challenge`)。
    *   **记录类型 (Type)**: 选择 `TXT`。
    *   **记录值 (Value)**: 填入 Certbot 提供的那个随机字符串。
5.  保存记录，并**等待几分钟**让 DNS 记录生效。
6.  回到服务器终端，**按下回车键**继续。

Certbot 会通过查询 DNS 记录来验证你的域名所有权。成功后，你的证书文件就会被创建在 `/etc/letsencrypt/live/your.domain.com/` 目录下。

#### 步骤 3: 移动证书到项目目录

获取证书后，我们需要将其复制到项目文件夹中供 `server.js` 使用。

```bash
# 确保你当前在 unhappycar-server 项目的根目录中
# 将 your.domain.com 替换为你的真实域名

# 1. 创建 ssl 文件夹
mkdir ssl

# 2. 复制证书文件
sudo cp /etc/letsencrypt/live/your.domain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/your.domain.com/privkey.pem ./ssl/
sudo cp /etc/letsencrypt/live/your.domain.com/chain.pem ./ssl/

# 3. (可选但推荐) 更改文件所有权，以便非 root 用户也能操作
sudo chown $USER:$USER ./ssl/*
```

**注意**: 使用 `--manual` 方式获取的证书无法自动续订。你需要在证书到期前（约80天后）手动重复**步骤2**和**步骤3**来更新证书。如果想实现自动化，需要根据你的 DNS 服务商配置相应的 `certbot-dns` 插件。

#### 步骤 4: 使用 PM2 启动和管理服务

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

### 3. 验证服务

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

### 4. 日常维护

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
