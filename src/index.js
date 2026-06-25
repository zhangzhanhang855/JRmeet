// Worker 入口，负责接收请求并将 WebSocket 升级请求路由到 Durable Object
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 只处理 /room 路径下的请求
    if (url.pathname.startsWith('/room')) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      // 提取房间号，例如 /room/123 -> "123"
      const roomName = url.pathname.split('/')[2] || 'default';
      
      // 获取 Durable Object 实例
      const id = env.SIGNALING_ROOM.idFromName(roomName);
      const roomObject = env.SIGNALING_ROOM.get(id);

      // 将请求转发给 Durable Object 处理
      return roomObject.fetch(request);
    }

    return new Response('JRmeet Signaling Server is running.', { status: 200 });
  }
};

// Durable Object 类，负责维持 WebSocket 连接和广播消息
export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = []; // 存储当前房间内的所有 WebSocket 连接
  }

  async fetch(request) {
    // 创建一对 WebSocket 实例
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // 接受服务器端的 WebSocket
    server.accept();
    this.sessions.push(server);

    // 监听传入的消息，并将其广播给房间内的其他人
    server.addEventListener('message', event => {
      this.sessions.forEach(session => {
        // 不把消息发回给发送者自己
        if (session !== server) {
          session.send(event.data);
        }
      });
    });

    // 处理连接关闭
    const closeOrErrorHandler = () => {
      this.sessions = this.sessions.filter(s => s !== server);
    };
    server.addEventListener('close', closeOrErrorHandler);
    server.addEventListener('error', closeOrErrorHandler);

    // 返回客户端部分的 WebSocket 给用户
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
