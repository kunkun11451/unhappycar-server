const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, "server.log");

// 保存原始的 console 方法
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// 日志记录函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // 输出到控制台（使用原始方法）
  originalConsoleLog(message);
  
  // 写入日志文件
  try {
    fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
  } catch (error) {
    originalConsoleError('写入日志文件失败:', error);
  }
}

// 错误日志记录
function logError(error) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ERROR: ${error.message || error}\n`;
  
  // 输出到控制台（使用原始方法）
  originalConsoleError(error);
  
  // 写入日志文件
  try {
    fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
  } catch (error) {
    originalConsoleError('写入错误日志失败:', error);
  }
}

// 替换 console 方法
console.log = log;
console.error = logError;

// 加载 SSL 证书
const sslOptions = {
  cert: fs.readFileSync("/etc/letsencrypt/live/socket.unhappycar.games/fullchain.pem"),
  key: fs.readFileSync("/etc/letsencrypt/live/socket.unhappycar.games/privkey.pem"),
  ca: fs.readFileSync("/etc/letsencrypt/live/socket.unhappycar.games/chain.pem"),
};

const rooms = {}; // 存储房间信息

// 创建 HTTPS 服务器
const server = https.createServer(sslOptions, (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // 记录所有 HTTP 请求
  console.log(`HTTP ${req.method} ${req.url} - ${req.headers['user-agent'] || 'Unknown'} - IP: ${req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown'}`);
  
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (parsedUrl.pathname === '/log') {
    handleLogRequest(req, res);
  } else if (parsedUrl.pathname === '/') {
    // 添加根路径处理
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UnhappyCar Server</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1a1a1a; color: #fff; }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: #4CAF50; margin-bottom: 30px; }
        .status { background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .links { margin: 30px 0; }
        .links a { display: inline-block; margin: 10px; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
        .links a:hover { background: #45a049; }
        .info { color: #aaa; font-size: 14px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚗 UnhappyCar Server</h1>
        
        <div class="status">
            <h3>✅ 服务器正常运行</h3>
            <p>WebSocket 连接和 HTTP 服务都已就绪</p>
        </div>
        
        <div class="links">
            <a href="/log">📊 查看服务器日志</a>
        </div>
        
        <div class="info">
            <p>🌐 WebSocket 地址: wss://socket.unhappycar.games</p>
            <p>📝 服务器启动时间: ${new Date().toLocaleString('zh-CN')}</p>
            <p>🔧 当前活跃房间数: ${Object.keys(rooms).length}</p>
        </div>
    </div>
</body>
</html>
    `);
  } else {
    // 默认响应
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Page not found');
  }
});

// 处理日志请求
function handleLogRequest(req, res) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const action = parsedUrl.query.action;
    
    // 处理 POST 请求（清空日志）
    if (req.method === 'POST' && action === 'clear') {
      try {
        fs.writeFileSync(LOG_FILE, '', 'utf8');
        console.log('日志文件已被清空');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '日志已清空' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '清空日志失败: ' + error.message }));
      }
      return;
    }
    
    // 处理下载请求
    if (action === 'download') {
      try {
        if (fs.existsSync(LOG_FILE)) {
          const logContent = fs.readFileSync(LOG_FILE, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="unhappycar-server-${new Date().toISOString().slice(0,10)}.log"`
          });
          res.end(logContent);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('日志文件不存在');
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('下载日志失败: ' + error.message);
      }
      return;
    }
    
    // 默认显示日志页面
    res.writeHead(200, { 
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    // 读取日志文件
    let logContent = '';
    if (fs.existsSync(LOG_FILE)) {
      logContent = fs.readFileSync(LOG_FILE, 'utf8');
    } else {
      logContent = '日志文件不存在或为空';
    }
    
    // 创建 HTML 页面
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UnhappyCar Server 日志</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            margin: 0;
            padding: 20px;
            background-color: #1e1e1e;
            color: #d4d4d4;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #569cd6;
            text-align: center;
            margin-bottom: 30px;
        }
        .log-controls {
            margin-bottom: 20px;
            text-align: center;
        }
        button {
            background-color: #007acc;
            color: white;
            border: none;
            padding: 10px 20px;
            margin: 0 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background-color: #005a9e;
        }
        .log-container {
            background-color: #2d2d30;
            border: 1px solid #3e3e42;
            border-radius: 4px;
            padding: 20px;
            height: 600px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 14px;
            line-height: 1.4;
        }
        .log-line {
            margin-bottom: 2px;
        }
        .log-line.error {
            color: #f48771;
        }
        .log-line.warning {
            color: #dcdcaa;
        }
        .timestamp {
            color: #808080;
        }
        .stats {
            margin-top: 20px;
            padding: 15px;
            background-color: #2d2d30;
            border-radius: 4px;
            text-align: center;
        }
        .auto-refresh {
            margin-left: 20px;
        }
        input[type="checkbox"] {
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚗 UnhappyCar Server 日志监控</h1>
        
        <div class="log-controls">
            <button onclick="refreshLog()">刷新日志</button>
            <button onclick="clearLog()">清空日志</button>
            <button onclick="downloadLog()">下载日志</button>
            <span class="auto-refresh">
                <input type="checkbox" id="autoRefresh" onchange="toggleAutoRefresh()">
                <label for="autoRefresh">自动刷新 (5秒)</label>
            </span>
        </div>
        
        <div class="log-container" id="logContainer">${formatLogContent(logContent)}</div>
        
        <div class="stats">
            <strong>日志统计:</strong> 
            总行数: <span id="totalLines">${logContent.split('\n').length - 1}</span> | 
            文件大小: <span id="fileSize">${getFileSize()}</span> | 
            最后更新: <span id="lastUpdate">${new Date().toLocaleString('zh-CN')}</span>
        </div>
    </div>

    <script>
        let autoRefreshInterval = null;
        
        function refreshLog() {
            location.reload();
        }
        
        function clearLog() {
            if (confirm('确定要清空服务器日志吗？')) {
                fetch('/log?action=clear', { method: 'POST' })
                .then(() => {
                    location.reload();
                })
                .catch(err => {
                    alert('清空日志失败: ' + err.message);
                });
            }
        }
        
        function downloadLog() {
            const link = document.createElement('a');
            link.href = '/log?action=download';
            link.download = 'unhappycar-server-' + new Date().toISOString().slice(0,10) + '.log';
            link.click();
        }
        
        function toggleAutoRefresh() {
            const checkbox = document.getElementById('autoRefresh');
            if (checkbox.checked) {
                autoRefreshInterval = setInterval(refreshLog, 5000);
            } else {
                if (autoRefreshInterval) {
                    clearInterval(autoRefreshInterval);
                    autoRefreshInterval = null;
                }
            }
        }
        
        // 滚动到底部
        const container = document.getElementById('logContainer');
        container.scrollTop = container.scrollHeight;
    </script>
</body>
</html>`;

    res.end(html);
    
  } catch (error) {
    console.error('处理日志请求时发生错误:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('服务器内部错误: ' + error.message);
  }
}

// 格式化日志内容
function formatLogContent(content) {
  if (!content) return '暂无日志内容';
  
  return content
    .split('\n')
    .map(line => {
      if (!line.trim()) return '';
      
      let className = 'log-line';
      if (line.includes('ERROR')) {
        className += ' error';
      } else if (line.includes('WARNING') || line.includes('警告')) {
        className += ' warning';
      }
      
      // 高亮时间戳
      const timestampRegex = /(\[[\d-T:.Z]+\])/;
      const formattedLine = line.replace(timestampRegex, '<span class="timestamp">$1</span>');
      
      return `<div class="${className}">${formattedLine}</div>`;
    })
    .join('');
}

// 获取文件大小
function getFileSize() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      const bytes = stats.size;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return '0 B';
  } catch (error) {
    return 'Unknown';
  }
}
const wss = new WebSocket.Server({ server });

// 投票系统状态管理
class VotingManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.isActive = false;
    this.missions = []; // 当前投票的困难事件列表
    this.votes = {}; // {playerId: missionIndex}
    this.voteResults = {}; // {missionIndex: voteCount}
    this.playerRoles = {}; // {playerId: 'host' | 'player'}
    this.expectedPlayers = 0;
    this.result = null; // 投票结果
    this.isNewRound = false; // 标识是否是新轮投票开始
  }

  // 开始新的投票
  startVoting(missions, expectedPlayers) {
    console.log(`房间 ${this.roomId} 开始新投票:`, missions);
    this.isActive = true;
    this.missions = missions;
    this.votes = {};
    this.voteResults = { 0: 0, 1: 0, 2: 0 };
    this.expectedPlayers = expectedPlayers;
    this.result = null;
    this.isNewRound = true; // 标记为新轮开始
    return this.getVotingState();
  }

  // 设置玩家角色
  setPlayerRole(playerId, role) {
    this.playerRoles[playerId] = role;
    console.log(`设置玩家 ${playerId} 角色为: ${role}`);
  }
  // 玩家投票
  vote(playerId, missionIndex) {
    if (!this.isActive) {
      throw new Error('当前不在投票阶段');
    }

    if (missionIndex < 0 || missionIndex >= this.missions.length) {
      throw new Error('无效的投票选项');
    }

    console.log(`玩家 ${playerId} 投票选择事件 ${missionIndex}`);

    // 取消之前的投票
    if (this.votes[playerId] !== undefined) {
      const prevIndex = this.votes[playerId];
      const prevWeight = this.getVoteWeight(playerId);
      this.voteResults[prevIndex] -= prevWeight;
      console.log(`取消玩家 ${playerId} 之前的投票: 事件${prevIndex}, 权重${prevWeight}`);
    }

    // 添加新投票
    this.votes[playerId] = missionIndex;
    const voteWeight = this.getVoteWeight(playerId);
    this.voteResults[missionIndex] += voteWeight;

    console.log(`玩家 ${playerId} 新投票: 事件${missionIndex}, 权重${voteWeight}, 总票数${this.voteResults[missionIndex]}`);

    // 在投票过程中，已经不是新轮开始了
    this.isNewRound = false;

    // 检查是否投票完成
    const completedVotes = Object.keys(this.votes).length;
    console.log(`当前投票进度: ${completedVotes}/${this.expectedPlayers}`);

    if (completedVotes >= this.expectedPlayers) {
      this.finishVoting();
    }

    return this.getVotingState();
  }

  // 获取投票权重（主持人2票，普通玩家1票）
  getVoteWeight(playerId) {
    return this.playerRoles[playerId] === 'host' ? 2 : 1;
  }

  // 完成投票
  finishVoting() {
    console.log(`房间 ${this.roomId} 投票完成，结果:`, this.voteResults);
    
    this.isActive = false;
    
    // 计算获胜事件
    const validVotes = Object.values(this.voteResults).filter(v => v > 0);
    if (validVotes.length === 0) {
      console.error('没有有效投票');
      return;
    }

    const maxVotes = Math.max(...validVotes);
    const winners = Object.keys(this.voteResults)
      .filter(index => this.voteResults[index] === maxVotes)
      .map(index => parseInt(index));

    let selectedIndex;
    if (winners.length === 1) {
      selectedIndex = winners[0];
    } else {
      // 平票时随机选择
      selectedIndex = winners[Math.floor(Math.random() * winners.length)];
      console.log(`平票情况，随机选择: ${selectedIndex}`);
    }

    this.result = {
      selectedIndex,
      maxVotes,
      wasTie: winners.length > 1,
      selectedMission: this.missions[selectedIndex]
    };

    console.log(`投票结果:`, this.result);
  }
  // 强制结算投票（主持人手动结算）
  forceFinishVoting() {
    if (!this.isActive) {
      throw new Error('当前没有进行中的投票');
    }
    
    console.log(`房间 ${this.roomId} 强制结算投票，当前投票结果:`, this.voteResults);
    
    // 检查是否有任何投票
    const validVotes = Object.values(this.voteResults).filter(v => v > 0);
    if (validVotes.length === 0) {
      throw new Error('还没有任何投票，无法结算');
    }
    
    // 直接调用finishVoting进行结算
    this.finishVoting();
    
    console.log(`房间 ${this.roomId} 强制结算完成，结果:`, this.result);
    return this.getVotingState();  }

  // 移除玩家投票（当玩家离开房间时调用）
  removePlayerVote(playerId) {
    if (this.votes[playerId] !== undefined) {
      const missionIndex = this.votes[playerId];
      const voteWeight = this.getVoteWeight(playerId);
      
      // 从投票结果中减去该玩家的票数
      this.voteResults[missionIndex] -= voteWeight;
      
      // 从投票记录中移除该玩家
      delete this.votes[playerId];
      
      // 从角色记录中移除该玩家
      delete this.playerRoles[playerId];
      
      console.log(`移除玩家 ${playerId} 的投票: 事件${missionIndex}, 权重${voteWeight}`);
      console.log(`当前投票状态:`, { votes: this.votes, voteResults: this.voteResults });
    }
  }
  // 更新期望玩家数量（当玩家加入或离开时调用）
  updateExpectedPlayers(newCount, room = null) {
    if (this.isActive) {
      const oldCount = this.expectedPlayers;
      this.expectedPlayers = newCount;
      console.log(`房间 ${this.roomId} 投票期间玩家数量变化: ${oldCount} -> ${newCount}`);
      
      // 检查是否已经达到新的投票完成条件
      const completedVotes = Object.keys(this.votes).length;
      console.log(`当前投票进度: ${completedVotes}/${this.expectedPlayers}`);
      
      // 广播投票状态更新（无论是否完成）
      if (room) {
        const syncMessage = {
          type: "votingStateSync",
          votingState: this.getVotingState()
        };
        
        // 发送给主持人
        try {
          room.host.send(JSON.stringify(syncMessage));
        } catch (error) {
          console.error('发送投票状态给主持人失败:', error);
        }
        
        // 发送给所有玩家
        room.players.forEach((player) => {
          try {
            player.ws.send(JSON.stringify(syncMessage));
          } catch (error) {
            console.error(`发送投票状态给玩家 ${player.playerId} 失败:`, error);
          }
        });
        
        console.log('投票状态已广播');
      }
      
      if (completedVotes >= this.expectedPlayers && completedVotes > 0) {
        console.log('玩家数量变化导致投票自动完成');
        this.finishVoting();
        
        // 再次广播投票完成状态
        if (room) {
          const finalSyncMessage = {
            type: "votingStateSync",
            votingState: this.getVotingState()
          };
          
          // 发送给主持人
          try {
            room.host.send(JSON.stringify(finalSyncMessage));
          } catch (error) {
            console.error('发送投票完成状态给主持人失败:', error);
          }
          
          // 发送给所有玩家
          room.players.forEach((player) => {
            try {
              player.ws.send(JSON.stringify(finalSyncMessage));
            } catch (error) {
              console.error(`发送投票完成状态给玩家 ${player.playerId} 失败:`, error);
            }
          });
          
          console.log('投票完成状态已广播');
        }
      }
    }
  }

  // 获取当前投票状态
  getVotingState() {
    return {
      isActive: this.isActive,
      missions: this.missions,
      votes: this.votes,
      voteResults: this.voteResults,
      playerRoles: this.playerRoles,
      expectedPlayers: this.expectedPlayers,
      result: this.result,
      isNewRound: this.isNewRound // 添加新轮标识
    };
  }
  // 重置投票状态
  reset() {
    this.isActive = false;
    this.missions = [];
    this.votes = {};
    this.voteResults = {};
    this.result = null;
    this.isNewRound = false;
    console.log(`房间 ${this.roomId} 投票状态已重置`);
  }
}

wss.on("connection", (ws) => {
  console.log("客户端已连接");

  ws.on("message", (message) => {
    console.log("收到消息:", message.toString());
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case "createRoom":
          const roomId = uuidv4().substring(0, 6).toUpperCase();
          rooms[roomId] = {
            host: ws,
            players: [],
            state: {},
            history: [],
            votingManager: new VotingManager(roomId)
          };
          
          // 设置主持人角色
          if (data.hostId) {
            rooms[roomId].votingManager.setPlayerRole(data.hostId, 'host');
          }
          
          ws.send(JSON.stringify({
            type: "roomCreated",
            roomId: roomId
          }));
          
          console.log(`房间创建成功: ${roomId}`);
          break;

        case "joinRoom":
          const room = rooms[data.roomId];
          if (room && room.players.length < 6) {
            // 生成唯一的玩家ID
            const playerId = data.playerId || 'player_' + Math.random().toString(36).substr(2, 9);
            room.players.push({ ws, playerId });
            
            // 设置普通玩家角色
            room.votingManager.setPlayerRole(playerId, 'player');
            
            ws.send(JSON.stringify({
              type: "roomJoined",
              roomId: data.roomId,
              playerId: playerId
            }));
            
            // 如果房间有游戏状态，立即发送给新加入的玩家
            if (room.state && Object.keys(room.state).length > 0) {
              console.log('发送当前游戏状态给新加入的玩家');
              ws.send(JSON.stringify({ 
                type: "stateUpdated", 
                state: room.state,
                history: room.history || []
              }));
            }
            
            // 如果有进行中的投票，发送当前状态
            const votingState = room.votingManager.getVotingState();
            if (votingState.isActive || votingState.result) {
              ws.send(JSON.stringify({
                type: "votingStateSync",
                votingState: votingState
              }));
            }            // 广播当前房间人数
            const currentPlayerCount = room.players.length + 1; // 包括主持人
            const playerCountMessage = {
              type: "playerCount",
              count: currentPlayerCount,
            };
            room.host.send(JSON.stringify(playerCountMessage));
            room.players.forEach((player) => {
              player.ws.send(JSON.stringify(playerCountMessage));            });
            
            // 更新投票系统的期望玩家数量
            room.votingManager.updateExpectedPlayers(currentPlayerCount, room);
            
            console.log(`玩家 ${playerId} 加入房间 ${data.roomId}`);
          } else {
            ws.send(JSON.stringify({
              type: "error",
              message: room ? "房间已满，无法加入" : "房间不存在"
            }));
          }
          break;

        case "startVoting":
          console.log(`开始投票请求，房间ID: ${data.roomId}`);
          const votingRoom = rooms[data.roomId];
          if (votingRoom && votingRoom.host === ws) {
            try {
              // 计算期望玩家数（主持人 + 玩家）
              const expectedPlayers = 1 + votingRoom.players.length;
              
              // 设置主持人角色
              if (data.hostId) {
                votingRoom.votingManager.setPlayerRole(data.hostId, 'host');
              }
              
              // 开始投票
              const votingState = votingRoom.votingManager.startVoting(
                data.missions, 
                expectedPlayers
              );
              
              // 广播投票开始状态给所有玩家
              const startMessage = {
                type: "votingStateSync",
                votingState: votingState
              };
              
              // 发送给主持人
              try {
                votingRoom.host.send(JSON.stringify(startMessage));
              } catch (error) {
                console.error('发送投票状态给主持人失败:', error);
              }
              
              // 发送给所有玩家
              votingRoom.players.forEach((player) => {
                try {
                  player.ws.send(JSON.stringify(startMessage));
                } catch (error) {
                  console.error(`发送投票状态给玩家 ${player.playerId} 失败:`, error);
                }
              });
              
              console.log('投票状态已广播给所有玩家');
              
            } catch (error) {
              console.error('开始投票失败:', error);
              ws.send(JSON.stringify({
                type: "error", 
                message: error.message
              }));
            }
          } else {
            ws.send(JSON.stringify({
              type: "error",
              message: "房间不存在或您不是主持人"
            }));
          }
          break;

        case "submitVote":
          console.log(`收到投票，房间ID: ${data.roomId}, 玩家: ${data.playerId}, 选择: ${data.missionIndex}`);
          const voteRoom = rooms[data.roomId];
          if (voteRoom) {
            try {
              // 处理投票
              const votingState = voteRoom.votingManager.vote(data.playerId, data.missionIndex);
              
              // 实时广播投票状态给所有玩家
              const syncMessage = {
                type: "votingStateSync",
                votingState: votingState
              };
              
              // 发送给主持人
              try {
                voteRoom.host.send(JSON.stringify(syncMessage));
              } catch (error) {
                console.error('同步投票状态给主持人失败:', error);
              }
              
              // 发送给所有玩家
              voteRoom.players.forEach((player) => {
                try {
                  player.ws.send(JSON.stringify(syncMessage));
                } catch (error) {
                  console.error(`同步投票状态给玩家 ${player.playerId} 失败:`, error);
                }
              });
              
              console.log('投票状态已实时同步给所有玩家');
              
            } catch (error) {
              console.error('处理投票失败:', error);
              ws.send(JSON.stringify({
                type: "error",
                message: error.message
              }));
            }
          } else {
            ws.send(JSON.stringify({
              type: "error",
              message: "房间不存在"
            }));
          }
          break;

        case "updateState":
          console.log(`更新状态请求，房间ID: ${data.roomId}`);
          const updateRoom = rooms[data.roomId];
          if (updateRoom && updateRoom.host === ws) {
            updateRoom.state = data.state;
            updateRoom.history = data.history || [];

            // 广播最新状态，包括历史记录
            console.log(`广播最新状态，房间ID: ${data.roomId}`);
            updateRoom.players.forEach((player) => {
              player.ws.send(
                JSON.stringify({
                  type: "stateUpdated",
                  state: data.state,
                  history: data.history,
                })
              );
            });
          } else {
            console.log("更新状态失败：房间不存在或请求者不是主持人");
          }
          break;

        case "syncVote":
          console.log(`同步投票状态，房间ID: ${data.roomId}`);
          const syncVoteRoom = rooms[data.roomId];
          if (syncVoteRoom) {
            // 保存投票状态到房间
            if (!syncVoteRoom.votingState) {
              syncVoteRoom.votingState = {};
            }
            syncVoteRoom.votingState = data.voteData;

            // 广播投票状态给房间内所有玩家（包括主持人和发送者）
            const voteMessage = {
              type: "syncVote",
              voteData: data.voteData,
              senderId: data.senderId
            };

            console.log('广播投票状态:', voteMessage);

            // 给主持人发送投票状态
            try {
              syncVoteRoom.host.send(JSON.stringify(voteMessage));
            } catch (error) {
              console.error('发送投票状态给主持人失败:', error);
            }

            // 给所有玩家发送投票状态
            syncVoteRoom.players.forEach((player) => {
              try {
                player.ws.send(JSON.stringify(voteMessage));
              } catch (error) {
                console.error('发送投票状态给玩家失败:', error);
              }
            });
          } else {
            console.log('投票状态同步失败：房间不存在');
          }
          break;

        case "syncVotingResult":
          console.log(`同步投票结果，房间ID: ${data.roomId}`);
          const resultRoom = rooms[data.roomId];
          if (resultRoom) {
            // 清理投票状态，为下一轮投票做准备
            resultRoom.votingState = null;

            // 广播投票结果给房间内所有玩家（包括主持人）
            const resultMessage = {
              type: "syncVotingResult",
              resultData: data.resultData
            };

            console.log('广播投票结果:', resultMessage);

            try {
              resultRoom.host.send(JSON.stringify(resultMessage));
            } catch (error) {
              console.error('发送投票结果给主持人失败:', error);
            }

            resultRoom.players.forEach((player) => {
              try {
                player.ws.send(JSON.stringify(resultMessage));
              } catch (error) {
                console.error('发送投票结果给玩家失败:', error);
              }
            });
          } else {
            console.log('投票结果同步失败：房间不存在');
          }          break;

        case "heartbeat":
          // 处理心跳包，简单返回确认消息
          console.log(`收到心跳包 - 玩家ID: ${data.playerId}, 房间ID: ${data.roomId}, 时间: ${new Date(data.timestamp).toLocaleTimeString()}`);
          
          // 可选：返回心跳确认（通常心跳包不需要确认，只要连接正常即可）
          try {
            ws.send(JSON.stringify({
              type: "heartbeatAck",
              timestamp: Date.now(),
              originalTimestamp: data.timestamp
            }));
          } catch (error) {
            console.error('发送心跳确认失败:', error);
          }
          break;

        case "manualSettleVoting":
          console.log(`主持人手动结算投票请求，房间ID: ${data.roomId}`);
          const manualSettleRoom = rooms[data.roomId];
          if (manualSettleRoom && manualSettleRoom.host === ws) {
            try {
              // 执行强制结算
              const votingState = manualSettleRoom.votingManager.forceFinishVoting();
              
              // 广播最终投票状态给所有玩家
              const finalMessage = {
                type: "votingStateSync",
                votingState: votingState
              };
              
              console.log('广播手动结算结果:', finalMessage);
              
              // 发送给主持人
              try {
                manualSettleRoom.host.send(JSON.stringify(finalMessage));
              } catch (error) {
                console.error('发送手动结算结果给主持人失败:', error);
              }
              
              // 发送给所有玩家
              manualSettleRoom.players.forEach((player) => {
                try {
                  player.ws.send(JSON.stringify(finalMessage));
                } catch (error) {
                  console.error(`发送手动结算结果给玩家 ${player.playerId} 失败:`, error);
                }
              });
              
              console.log('手动结算投票完成');
              
            } catch (error) {
              console.error('手动结算投票失败:', error);
              ws.send(JSON.stringify({
                type: "error",
                message: error.message
              }));
            }
          } else {
            ws.send(JSON.stringify({
              type: "error",
              message: "房间不存在或您不是主持人"
            }));
          }
          break;

        default:
          console.log("未知消息类型:", data.type);
      }
    } catch (error) {
      console.error("处理消息时发生错误:", error);
      ws.send(JSON.stringify({
        type: "error",
        message: "服务器处理消息时发生错误"
      }));
    }
  });

  ws.on("close", () => {
    console.log("客户端断开连接");
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.host === ws) {
        room.players.forEach((player) => {
          player.ws.send(JSON.stringify({ type: "roomClosed" }));
        });
        delete rooms[roomId];      } else {
        // 找到离开的玩家ID，用于清理投票记录
        const leavingPlayer = room.players.find((player) => player.ws === ws);
        if (leavingPlayer) {
          // 从投票系统中移除该玩家的投票
          room.votingManager.removePlayerVote(leavingPlayer.playerId);
        }
        
        room.players = room.players.filter((player) => player.ws !== ws);

        const currentPlayerCount = room.players.length + 1; // 包括主持人
        const playerCountMessage = {
          type: "playerCount",
          count: currentPlayerCount,
        };
        room.host.send(JSON.stringify(playerCountMessage));
        room.players.forEach((player) => {
          player.ws.send(JSON.stringify(playerCountMessage));
        });
        
        // 更新投票系统的期望玩家数量
        room.votingManager.updateExpectedPlayers(currentPlayerCount, room);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket 错误:", error);
  });
});

// 启动 HTTP 服务器
server.listen(PORT, () => {
  console.log(`🚗 UnhappyCar 服务器已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`HTTPS WebSocket 服务: wss://socket.unhappycar.games`);
  console.log(`日志查看页面: https://unhappycar.games/log`);
  console.log(`启动时间: ${new Date().toLocaleString('zh-CN')}`);
});
