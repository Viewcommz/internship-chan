const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto'); // crypto 모듈 추가

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://chan.gling.co.kr', 'http://localhost:3001'], // 프론트엔드 주소 추가
}));

app.use(express.json());

const port = 3001; // 포트 변경 (프론트와 겹치지 않게)

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
    // TODO: 인증 성공 시 토큰 발급 로직 추가 예정
    res.json({ success: true, message: '인증에 성공했습니다.' });
  } else {
    res.status(401).json({ success: false, message: '키가 올바르지 않습니다.' });
  }
});
/*--- API 라우트 ---*/

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

// 웹소켓 연결 처리
wss.on('connection', (ws) => {
  console.log('클라이언트가 연결되었습니다.');

  ws.on('message', (message) => {
    console.log('받은 메시지:', message);
    // 모든 클라이언트에게 메시지 브로드캐스트
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('클라이언트 연결이 끊겼습니다.');
  });

  ws.send('웹소켓 서버에 오신 것을 환영합니다!');
});


server.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다. 🚀`);
});