const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 3600);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'https://chan.gling.co.kr'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 5000,
  pingInterval: 2000,
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'https://chan.gling.co.kr'],
}));

app.use(express.json());

const port = 3000;

// 데이터 저장소
const connectedUsers = new Map(); // socketId -> { username, mouseX, mouseY }
const sessions = new Map(); // username -> { token, socketId }
const seats = {
  1: { owner: null, solving: [] },
  2: { owner: null, solving: [] },
  3: { owner: null, solving: [] },
  4: { owner: null, solving: [] },
  5: { owner: null, solving: [] },
  6: { owner: null, solving: [] },
  7: { owner: null, solving: [] },
  8: { owner: null, solving: [] }
};

// 문제 데이터
const questions = {
  1: { question: "1 + 1 = ?", answer: "2" },
  2: { question: "대한민국의 수도는?", answer: "서울" },
  3: { question: "2 * 3 = ?", answer: "6" },
  4: { question: "React를 만든 회사는?", answer: "페이스북" },
  5: { question: "JavaScript에서 배열인지 확인하는 메서드는?", answer: "Array.isArray" },
  6: { question: "HTTP 성공 상태 코드는?", answer: "200" },
  7: { question: "Git에서 현재 브랜치 확인 명령어는?", answer: "git branch" },
  8: { question: "CSS에서 박스 모델의 가장 바깥 속성은?", answer: "margin" }
};

// 비밀 키 (프론트엔드와 동일)
const SECRET_HASH_VALUE = "2466fcafe0531db08547f61d39bd340224e92f3410d58837e04cb845d790b970";

// SHA-256 해시 함수
const hash = async (text) => {
  const hasher = crypto.createHash('sha256');
  hasher.update(text);
  return hasher.digest('hex');
};

// 토큰 생성(JWT, TTL 적용)
const generateToken = (username) => {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
};

// 공통 인증 미들웨어: 바디에서 token(필수), username(선택)을 받아 검증
function requireAuth(req, res, next) {
  try {
    const { token, username } = req.body || {};
    if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });
    const decoded = jwt.verify(token, JWT_SECRET); // exp 자동 검증
    if (username && decoded.username !== username) {
      return res.status(401).json({ error: '토큰의 사용자와 요청 사용자가 다릅니다' });
    }
    const sess = sessions.get(decoded.username);
    if (!sess || sess.token !== token) {
      return res.status(401).json({ error: '세션이 유효하지 않습니다' });
    }
    req.user = { username: decoded.username };
    return next();
  } catch (e) {
    return res.status(401).json({ error: '토큰이 유효하지 않습니다' });
  }
};

// test api
app.get('/', (req, res) => {
  res.send('안녕하세요!');
});

// 헬스 체크 api
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 인증 API
app.post('/api/auth/verify', async (req, res) => {
  const { username, key } = req.body;
  
  if (!username || !key) {
    return res.status(400).json({ error: '유저명과 키를 입력해주세요' });
  }
  
  const keyHash = await hash(key);
  if (keyHash !== SECRET_HASH_VALUE) {
    return res.status(401).json({ error: '키가 올바르지 않습니다' });
  }
  
  // 이미 연결된 유저인지 확인(만료된 세션은 정리)
  const existing = sessions.get(username);
  if (existing) {
    if (existing.exp && existing.exp > Date.now()) {
      return res.status(409).json({ error: '이미 접속 중인 유저입니다' });
    } else {
      sessions.delete(username);
    }
  }

  const token = generateToken(username);
  const decoded = jwt.decode(token);
  const expMs = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + TOKEN_TTL_SECONDS * 1000;
  sessions.set(username, { token, socketId: null, exp: expMs });
  
  res.json({ success: true, token, username, exp: expMs });
});

// 자리 목록 조회 API
app.get('/api/seats', (req, res) => {
  res.json({ seats });
});

// 문제 요청 API
app.post('/api/question', requireAuth, (req, res) => {
  const { seatNumber } = req.body;
  const username = req.user.username;
  
  if (!seatNumber) {
    return res.status(400).json({ error: '자리 번호를 입력해주세요' });
  }
  
  const seat = seats[seatNumber];
  if (!seat) {
    return res.status(404).json({ error: '존재하지 않는 자리입니다' });
  }
  
  if (seat.owner) {
    return res.status(409).json({ error: '이미 선점된 자리입니다', owner: seat.owner });
  }
  
  // 문제 풀이 중으로 표시(중복 허용: 배열에 추가)
  if (!Array.isArray(seat.solving)) seat.solving = [];
  if (!seat.solving.includes(username)) {
    seat.solving.push(username);
  }
  
  const question = questions[seatNumber];
  res.json({ 
    seatNumber,
    question: question.question
  });
  
  // 자리 상태 업데이트 브로드캐스트
  io.emit('seats:update', { seats });
});

// 정답 제출 API
app.post('/api/answer', requireAuth, (req, res) => {
  const { seatNumber, answer } = req.body;
  const username = req.user.username;
  
  if (!seatNumber || !answer) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다' });
  }
  
  const seat = seats[seatNumber];
  const question = questions[seatNumber];
  
  if (!seat || !question) {
    return res.status(404).json({ error: '잘못된 자리 번호입니다' });
  }
  
  // 정답 확인
  const isCorrect = answer.trim().toLowerCase() === question.answer.toLowerCase();
  
  if (isCorrect) {
    // 자리 소유자 설정(정답자 소유) 및 현재 풀이자 목록 초기화
    seat.owner = username;
    seat.solving = [];
    
    // 모든 유저에게 성공 알림
    io.emit('answer:correct', { username, seatNumber });
    io.emit('seats:update', { seats });
    
    res.json({ success: true, message: '정답입니다!' });
  } else {
    // 틀렸을 경우 해당 사용자만 풀이자 목록에서 제거
    if (Array.isArray(seat.solving)) {
      seat.solving = seat.solving.filter(u => u !== username);
    }
    io.emit('seats:update', { seats });
    
    res.status(400).json({ success: false, message: '틀렸습니다. 다시 시도해주세요.' });
  }
});

// 문제 풀이 중단(자발적 종료) API
app.post('/api/question/quit', requireAuth, (req, res) => {
  const { seatNumber } = req.body;
  const username = req.user.username;

  if (!seatNumber) {
    return res.status(400).json({ error: '자리 번호를 입력해주세요' });
  }

  const seat = seats[seatNumber];
  if (!seat) {
    return res.status(404).json({ error: '존재하지 않는 자리입니다' });
  }

  if (Array.isArray(seat.solving)) {
    const before = seat.solving.length;
    seat.solving = seat.solving.filter(u => u !== username);
    if (seat.solving.length !== before) {
      io.emit('seats:update', { seats });
    }
  }
  return res.json({ success: true });
});

// 웹소켓 연결 처리
io.on('connection', (socket) => {
  console.log('새 유저 연결:', socket.id);
  
  // 유저 인증 및 등록
  socket.on('user:auth', ({ username, token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.username !== username) throw new Error('username mismatch');
      const session = sessions.get(username);
      if (!session || session.token !== token || (session.exp && session.exp < Date.now())) {
        throw new Error('invalid session');
      }
    
      // 이미 다른 소켓이 연결되어 있으면 끊기
      if (session.socketId && session.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(session.socketId);
        if (oldSocket) {
          oldSocket.emit('auth:duplicate', { error: '다른 곳에서 접속했습니다' });
          oldSocket.disconnect();
        }
      }
      
      // 새 소켓 연결 등록
      session.socketId = socket.id;
      connectedUsers.set(socket.id, { username, mouseX: 0, mouseY: 0 });
      
      // 현재 연결된 모든 유저 정보 전송
      const allUsers = Array.from(connectedUsers.entries()).map(([id, data]) => ({
        socketId: id,
        ...data
      }));
      
      socket.emit('auth:success', { username });
      socket.emit('users:list', allUsers);
      socket.emit('seats:update', { seats });
      
      // 다른 유저들에게 새 유저 알림
      socket.broadcast.emit('user:connected', { 
        socketId: socket.id,
        username,
        mouseX: 0,
        mouseY: 0
      });
    } catch (e) {
      socket.emit('auth:failed', { error: '인증 실패' });
      socket.disconnect();
      return;
    }
  });
  
  // 마우스 위치 업데이트
  socket.on('mouse:move', ({ x, y }) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      user.mouseX = x;
      user.mouseY = y;
      
      // 다른 유저들에게 브로드캐스트
      socket.broadcast.emit('mouse:update', {
        socketId: socket.id,
        username: user.username,
        x,
        y
      });
    }
  });
  
  // 연결 종료 처리
  socket.on('disconnect', (reason) => {
    console.log('유저 연결 종료:', socket.id, '이유:', reason);
    const user = connectedUsers.get(socket.id);
    if (user) {
      // 세션에서 제거 (페이지 새로고침/종료 시 완전 제거)
      const session = sessions.get(user.username);
      if (session && session.socketId === socket.id) {
        // 브라우저 종료나 새로고침인 경우 세션도 삭제
        if (reason === 'transport close' || reason === 'client namespace disconnect') {
          sessions.delete(user.username);
        } else {
          session.socketId = null;
        }
      }
      
      // 풀이 중인 자리가 있으면 해당 사용자만 제거
      Object.values(seats).forEach(seat => {
        if (Array.isArray(seat.solving)) {
          seat.solving = seat.solving.filter(u => u !== user.username);
        }
      });
      
      connectedUsers.delete(socket.id);
      
      // 다른 유저들에게 알림
      socket.broadcast.emit('user:disconnected', { socketId: socket.id });
      io.emit('seats:update', { seats });
    }
  });
});

// 대문자로 바꿔주는 api (기존 유지)
app.post('/uppercase', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text 필드는 문자열이어야 합니다.' });
  }
  res.json({ original: text, uppercased: text.toUpperCase() });
});

// 랜덤 숫자 생성 api (기존 유지)
app.get('/random', (req, res) => {
  const qmin = Number(req.query.min);
  const qmax = Number(req.query.max);

  const hasMin = !Number.isNaN(qmin);
  const hasMax = !Number.isNaN(qmax);

  const min = hasMin ? qmin : 0;
  const max = hasMax ? qmax : 100;

  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return res.status(400).json({ error: '유효한 min, max 범위를 지정하세요. 예: /random?min=1&max=10' });
  }

  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  res.json({ min, max, value });
});

// 정적 파일 서빙 (/desk)
const DESK_STATIC_DIR = path.resolve(__dirname, './static'); 

// /desk 및 하위 정적 자원 제공 (index.html 자동 서빙)
app.use('/desk', express.static(DESK_STATIC_DIR, {
  index: 'index.html',
  maxAge: '30d',
  immutable: true,
}));

// SPA 라우팅 지원: /desk/* 경로는 항상 index.html 반환
// (path-to-regexp v6 호환: 정규식 사용)
app.get(/^\/desk(?:\/.*)?$/, (req, res) => {
  res.sendFile(path.join(DESK_STATIC_DIR, 'index.html'));
});

// 404 처리 미들웨어
app.use((req, res, next) => {
  res.status(404).json({
    error: '요청하신 경로를 찾을 수 없습니다.',
    path: req.originalUrl,
  });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: '서버 내부 오류가 발생했습니다.',
    message: err.message,
  });
});

// 만료된 세션 정리(1분 주기)
setInterval(() => {
  const now = Date.now();
  for (const [username, s] of sessions.entries()) {
    if (s.exp && s.exp < now) {
      if (s.socketId) {
        const sk = io.sockets.sockets.get(s.socketId);
        if (sk) sk.disconnect(true);
      }
      sessions.delete(username);
    }
  }
}, 60_000);

// HTTP 서버와 Socket.IO 함께 시작
httpServer.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다. 🚀`);
  console.log(`Socket.IO 서버도 함께 실행 중입니다. 🔌`);
});