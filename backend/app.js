const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const url = require('url');

const app = express();

app.use(cors({
  origin: ['http://localhost:5500', 'https://chan.gling.co.kr', 'http://localhost:3001'],
}));

app.use(express.json());

const port = 3000;

/*--- 데이터 저장소 (In-Memory) ---*/
const desks = {
  '1': { owner: null, question: "가장 높은 산의 이름은?", answer: "에베레스트" },
  '2': { owner: null, question: "세상에서 가장 큰 바다는?", answer: "태평양" },
  '3': { owner: null, question: "자바스크립트의 'null'과 'undefined'의 차이점은?", answer: "타입" },
  '4': { owner: null, question: "1, 2, 3, 5, 8, 13, ... 다음 숫자는?", answer: "21" },
  '5': { owner: null, question: "React에서 컴포넌트의 상태를 관리하는 Hook의 이름은?", answer: "useState" },
  '6': { owner: null, question: "HTTP 상태 코드 404가 의미하는 것은?", answer: "Not Found" },
  '7': { owner: null, question: "'git commit'과 'git push'의 차이점은?", answer: "로컬/원격" },
  '8': { owner: null, question: "물의 화학식은?", answer: "H2O" },
};

const clients = new Map(); // 연결된 클라이언트 관리

/*--- 인증 로직 ---*/
const SECRET_HASH_VALUE = "2466fcafe0531db08547f61d39bd340224e92f3410d58837e04cb845d790b970";

const hash = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
}

app.post('/api/verify-key', (req, res) => {
  const { key, user } = req.body;

  if (!key || !user) {
    return res.status(400).json({ error: 'user와 key를 모두 제공해야 합니다.' });
  }

  const keyHash = hash(key);
  if (keyHash === SECRET_HASH_VALUE) {
    res.json({ success: true, message: '인증에 성공했습니다.' });
  } else {
    res.status(401).json({ success: false, message: '키가 올바르지 않습니다.' });
  }
});

/*--- API 라우트 ---*/
// 자리 목록 조회 API
app.get('/api/desks', (req, res) => {
  const deskOwners = Object.entries(desks).reduce((acc, [id, { owner }]) => {
    acc[id] = { owner };
    return acc;
  }, {});
  res.json(deskOwners);
});

// 특정 자리의 질문 조회 API
app.get('/api/desks/:id/question', (req, res) => {
  const { id } = req.params;
  const desk = desks[id];

  if (!desk) {
    return res.status(404).json({ error: '존재하지 않는 자리입니다.' });
  }

  if (desk.owner) {
    return res.status(409).json({ error: `이미 ${desk.owner}님이 차지한 자리입니다.` });
  }

  res.json({ question: desk.question });
});

// 정답 제출 API
app.post('/api/desks/:id/answer', (req, res) => {
  const { id } = req.params;
  const { answer, user } = req.body;
  const desk = desks[id];

  if (!desk) {
    return res.status(404).json({ error: '존재하지 않는 자리입니다.' });
  }

  if (desk.owner) {
    return res.status(409).json({ error: `이미 ${desk.owner}님이 차지한 자리입니다.` });
  }

  if (!answer || !user) {
    return res.status(400).json({ error: '정답과 사용자 이름을 모두 입력해야 합니다.' });
  }

  const isCorrect = desk.answer.trim().toLowerCase() === answer.trim().toLowerCase();

  if (isCorrect) {
    desk.owner = user; // 자리 주인 변경
    broadcast({ type: 'desk_claimed', payload: { deskId: id, user } });
    res.json({ success: true, message: '정답입니다! 자리를 차지했습니다.' });
  } else {
    res.status(400).json({ success: false, message: '틀렸습니다. 다시 시도해보세요.' });
  }
});

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

// 대문자로 바꿔주는 api
app.post('/uppercase', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text 필드는 문자열이어야 합니다.' });
  }
  res.json({ original: text, uppercased: text.toUpperCase() });
});

// 랜덤 숫자 생성 api
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

// HTTP 서버 생성
const server = http.createServer(app);

// 웹소켓 서버 생성
const wss = new WebSocket.Server({ server });

// 모든 클라이언트에게 메시지 브로드캐스트하는 함수
const broadcast = (message) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws, req) => {
  const parameters = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const username = parameters.get('username');

  if (!username || clients.has(username)) {
    ws.terminate();
    return;
  }

  const clientInfo = { ws, username, x: 0, y: 0 };
  clients.set(username, clientInfo);
  console.log(`클라이언트 연결: ${username}`);

  // 새 접속자에게 기존 사용자들의 커서 위치 전송
  const allCursors = {};
  for (const [name, info] of clients.entries()) {
    if (name !== username) {
      allCursors[name] = { x: info.x, y: info.y };
    }
  }
  ws.send(JSON.stringify({ type: 'all_cursors', payload: allCursors }));

  // 기존 사용자들에게 새 접속자 알림
  broadcast({ type: 'new_user_connected', payload: { username, x: 0, y: 0 } });

  ws.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage);
      if (message.type === 'mouse_move') {
        clientInfo.x = message.payload.x;
        clientInfo.y = message.payload.y;
        broadcast({ 
          type: 'cursor_update', 
          payload: { username, x: clientInfo.x, y: clientInfo.y }
        });
      }
    } catch (error) {
      console.error('잘못된 메시지 형식:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(username);
    broadcast({ type: 'user_disconnect', payload: { username } });
    console.log(`클라이언트 연결 끊김: ${username}`);
  });
});

server.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다. 🚀`);
});