const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

function initCollab(httpServer) {
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:8080,http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean);

  const io = new Server(httpServer, { cors: { origin: origins, methods: ['GET', 'POST'] } });

  // Simple per-socket rate limiting
  const buckets = new Map(); // socket.id -> { count, resetAt }
  const activeControllers = new Map(); // room -> 'candidate' | 'interviewer'
  function checkRate(socket, max = 20) {
    const now = Date.now();
    let b = buckets.get(socket.id);
    if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + 1000 }; buckets.set(socket.id, b); }
    b.count++;
    return b.count <= max;
  }

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

    socket.on('coding:join', async ({ sessionId } = {}) => {
      if (typeof sessionId !== 'string' || !/^[\w-]{4,64}$/.test(sessionId)) {
        return socket.emit('coding:error', { error: 'Invalid session id' });
      }

      const uid = socket.data.userId;
      let assignedRole = 'candidate';

      try {
        if (mongoose.connection.readyState === 1) {
          const User = mongoose.model('User');
          const userDoc = await User.findById(uid).select('role').lean().catch(() => null);
          const isAdmin = Boolean(userDoc && userDoc.role === 'admin');

          let isAuthorized = isAdmin;

          const InterviewSession = mongoose.model('InterviewSession');
          const sess = await InterviewSession.findOne({
            $or: [
              { sessionId },
              ...(mongoose.Types.ObjectId.isValid(sessionId) ? [{ _id: sessionId }] : [])
            ]
          }).select('user sessionId').lean().catch(() => null);

          if (sess) {
            const isOwner = String(sess.user) === uid;
            if (isOwner) {
              isAuthorized = true;
              assignedRole = isAdmin ? 'interviewer' : 'candidate';
            } else if (isAdmin) {
              isAuthorized = true;
              assignedRole = 'interviewer';
            } else {
              isAuthorized = false;
            }
          } else if (isAdmin) {
            assignedRole = 'interviewer';
            isAuthorized = true;
          } else {
            // New or custom practice session: owner is candidate
            isAuthorized = true;
            assignedRole = 'candidate';
          }

          if (!isAuthorized) {
            console.warn(`Collab join DENIED: user ${uid} not authorized for session ${sessionId}`);
            return socket.emit('coding:error', { error: 'You are not authorized to join this interview session' });
          }
        }
      } catch (err) {
        console.warn('Session verification fallback:', err.message);
      }

      if (room) socket.leave(room);
      room = 'coding:' + sessionId;
      socket.data.role = assignedRole;
      socket.data.sessionId = sessionId;
      if (!activeControllers.has(room)) {
        activeControllers.set(room, 'candidate');
      }
      socket.join(room);
      socket.emit('coding:joined', { sessionId, role: socket.data.role, currentController: activeControllers.get(room) });
      socket.to(room).emit('coding:peer-joined', { userId: socket.data.userId, name: socket.data.name, role: socket.data.role });
    });

    socket.on('coding:state-request', () => {
      if (!room || !checkRate(socket, 5)) return;
      socket.to(room).emit('coding:state-request', { from: socket.data.userId });
    });

    socket.on('coding:state', (payload) => {
      if (!room || !payload || typeof payload !== 'object' || !checkRate(socket, 10)) return;
      socket.to(room).emit('coding:state', {
        code: safeSize(payload.code, 100000) || '',
        language: safeSize(payload.language, 20) || 'python',
        cursor: payload.cursor && typeof payload.cursor === 'object' ? { line: Math.max(1, Math.min(10000, parseInt(payload.cursor.line, 10) || 1)), column: Math.max(1, Math.min(10000, parseInt(payload.cursor.column, 10) || 1)) } : null,
        userId: socket.data.userId,
      });
    });

    socket.on('coding:code', (payload) => {
      if (!room || !payload || typeof payload.code !== 'string' || !checkRate(socket, 20)) return;
      const currentController = activeControllers.get(room) || 'candidate';
      if (socket.data.role !== currentController && socket.data.role !== 'interviewer') return;
      socket.to(room).emit('coding:code', { code: safeSize(payload.code, 100000), file: safeSize(payload.file, 100) || 'main', userId: socket.data.userId });
    });

    socket.on('coding:cursor', (payload) => {
      if (!room || !payload || typeof payload !== 'object' || !checkRate(socket, 30)) return;
      socket.to(room).emit('coding:cursor', {
        line: Math.max(1, Math.min(10000, parseInt(payload.line, 10) || 1)),
        column: Math.max(1, Math.min(10000, parseInt(payload.column, 10) || 1)),
        file: safeSize(payload.file, 100) || 'main',
        userId: socket.data.userId,
        name: socket.data.name,
      });
    });

    socket.on('coding:control-request', () => {
      if (room && checkRate(socket, 5)) socket.to(room).emit('coding:control-request', { userId: socket.data.userId, name: socket.data.name });
    });

    socket.on('coding:control-grant', ({ controller } = {}) => {
      if (!room || (controller !== 'interviewer' && controller !== 'candidate')) return;
      // Only interviewer may grant/control
      if (socket.data.role !== 'interviewer') {
        return socket.emit('coding:error', { error: 'Only interviewer can change control' });
      }
      if (!checkRate(socket, 5)) return;
      activeControllers.set(room, controller);
      io.to(room).emit('coding:control-changed', { controller });
    });

    socket.on('disconnecting', () => {
      if (room) socket.to(room).emit('coding:peer-left', { userId: socket.data.userId, name: socket.data.name });
      buckets.delete(socket.id);
    });
    socket.on('disconnect', () => { buckets.delete(socket.id); });
  });

  return io;
}

module.exports = { initCollab };
