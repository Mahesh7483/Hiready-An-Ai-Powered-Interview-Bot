const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

/**
 * Socket.io collaboration for coding interviews.
 *
 * Rooms are per coding session: "coding:<sessionId>".
 * Events (all namespaced coding:*):
 *   join            {sessionId, role}          → join a room (candidate/interviewer)
 *   state-request   —                          → ask peers to send current doc state
 *   state           {code, language, cursor}   → full doc sync (sent to requester)
 *   code            {code, file}               → code change, broadcast to peers
 *   cursor          {line, column, file}       → cursor move, broadcast to peers
 *   control-request —                          → interviewer asks to take control
 *   control-changed {controller}               → 'candidate' | 'interviewer'
 *
 * Auth: JWT in handshake.auth.token (same token as the REST API).
 */
function initCollab(httpServer) {
  const origins = (process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:8080,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: { origin: origins, methods: ['GET', 'POST'] },
  });

  // JWT auth on every handshake — unauthenticated sockets are rejected
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload || !payload.id) return next(new Error('Invalid token payload'));
      socket.data.userId = String(payload.id);
      socket.data.name = payload.name || payload.email || 'User';
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    let room = null;

    const safeSize = (v, max) => (typeof v === 'string' ? v.slice(0, max) : v);

    socket.on('coding:join', ({ sessionId, role }) => {
      if (typeof sessionId !== 'string' || !/^[\w-]{4,64}$/.test(sessionId)) {
        return socket.emit('coding:error', { error: 'Invalid session id' });
      }
      // Leave any previous room
      if (room) socket.leave(room);
      room = 'coding:' + sessionId;
      socket.data.role = role === 'interviewer' ? 'interviewer' : 'candidate';
      socket.join(room);
      socket.emit('coding:joined', { sessionId, role: socket.data.role });
      socket.to(room).emit('coding:peer-joined', {
        userId: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
      });
    });

    socket.on('coding:state-request', () => {
      if (room) socket.to(room).emit('coding:state-request', { from: socket.data.userId });
    });

    socket.on('coding:state', (payload) => {
      if (!room || !payload || typeof payload !== 'object') return;
      socket.to(room).emit('coding:state', {
        code: safeSize(payload.code, 100000) || '',
        language: safeSize(payload.language, 20) || 'python',
        cursor: payload.cursor && typeof payload.cursor === 'object' ? payload.cursor : null,
        userId: socket.data.userId,
      });
    });

    socket.on('coding:code', (payload) => {
      if (!room || !payload || typeof payload.code !== 'string') return;
      socket.to(room).emit('coding:code', {
        code: safeSize(payload.code, 100000),
        file: safeSize(payload.file, 100) || 'main',
        userId: socket.data.userId,
      });
    });

    socket.on('coding:cursor', (payload) => {
      if (!room || !payload || typeof payload !== 'object') return;
      socket.to(room).emit('coding:cursor', {
        line: Number(payload.line) || 1,
        column: Number(payload.column) || 1,
        file: safeSize(payload.file, 100) || 'main',
        userId: socket.data.userId,
        name: socket.data.name,
      });
    });

    socket.on('coding:control-request', () => {
      if (room) socket.to(room).emit('coding:control-request', { userId: socket.data.userId, name: socket.data.name });
    });

    socket.on('coding:control-grant', ({ controller }) => {
      if (room && (controller === 'interviewer' || controller === 'candidate')) {
        io.to(room).emit('coding:control-changed', { controller });
      }
    });

    socket.on('disconnecting', () => {
      if (room) {
        socket.to(room).emit('coding:peer-left', { userId: socket.data.userId, name: socket.data.name });
      }
    });
  });

  return io;
}

module.exports = { initCollab };