다음 내용을 그대로 API.md로 쓰시면 됩니다. 현 코드(app.js) 기준입니다.

실시간 좌석 퀴즈 API 정리

베이스
	•	Base URL: http://<HOST>:3000
	•	CORS 허용: http://localhost:3000, http://localhost:5500, http://127.0.0.1:5500, https://chan.gling.co.kr

인증
	•	방식: JWT(바디에 포함), TTL 적용
	•	환경변수:
	•	JWT_SECRET: 필수 권장
	•	TOKEN_TTL_SECONDS: 기본 3600초
	•	세션: 서버 메모리에 저장, 만료되면 1분 주기로 정리

1) 토큰 발급

POST /api/auth/verify

Request

{
  "username": "홍길동",
  "key": "<사전에 공유된 키>"
}

Response 200

{
  "success": true,
  "token": "<JWT>",
  "username": "홍길동",
  "exp": 1736313600000
}

오류
	•	400: 필드 누락
	•	401: 키 불일치
	•	409: 이미 접속 중(만료되지 않은 세션 존재)

사용 규칙
	•	이후 보호된 API는 모두 바디에 token을 포함합니다.
	•	소켓 인증도 동일 토큰 사용.

⸻

좌석/문제 API

2) 좌석 조회(공개)

GET /api/seats

Response 200

{
  "seats": {
    "1": { "owner": null, "solving": [] },
    "2": { "owner": null, "solving": [] },
    "...": {}
  }
}

	•	owner: 정답으로 선점한 사용자명 또는 null
	•	solving: 현재 풀이 중인 사용자 배열

3) 문제 요청(풀이 시작, 보호)

POST /api/question

Request

{ "token": "<JWT>", "seatNumber": 1 }

Response 200

{ "seatNumber": 1, "question": "1 + 1 = ?" }

오류
	•	400: seatNumber 누락
	•	404: 좌석 없음
	•	409: 이미 선점(owner 존재)

동작
	•	성공 시 현재 사용자명을 해당 좌석의 solving 배열에 중복 없이 추가합니다.

4) 정답 제출(보호)

POST /api/answer

Request

{ "token": "<JWT>", "seatNumber": 1, "answer": "2" }

Response 200(정답)

{ "success": true, "message": "정답입니다!" }

Response 400(오답)

{ "success": false, "message": "틀렸습니다. 다시 시도해주세요." }

오류
	•	400: 필수 필드 누락
	•	404: 좌석/문제 없음

동작
	•	정답인 경우: owner = username, solving = [] 초기화.
	•	오답인 경우: 제출자만 solving 배열에서 제거.

5) 풀이 중단(보호)

POST /api/question/quit

Request

{ "token": "<JWT>", "seatNumber": 1 }

Response 200

{ "success": true }

오류
	•	400: seatNumber 누락
	•	404: 좌석 없음

동작
	•	요청 사용자만 해당 좌석의 solving에서 제거.

⸻

기타(운영/진단)
	•	GET /health 헬스체크
	•	테스트용: POST /uppercase, GET /random?min=&max= (운영 제외 권장)

⸻

웹소켓

연결
	•	URL: 백엔드와 동일 호스트
	•	연결 후 즉시 인증 이벤트 송신

클라이언트 → 서버
	•	user:auth
페이로드: { username: string, token: string }
	•	mouse:move
페이로드: { x: number, y: number }
프론트에서 스로틀/디바운스 권장.

서버 → 클라이언트
	•	auth:success { username }
	•	auth:failed { error } (이후 강제 종료)
	•	auth:duplicate { error } (중복 접속 감지 시 기존 소켓에 전송)
	•	users:list [{ socketId, username, mouseX, mouseY }]
	•	user:connected { socketId, username, mouseX, mouseY }
	•	user:disconnected { socketId }
	•	seats:update { seats } (좌석 상태 전체 스냅샷)
	•	answer:correct { username, seatNumber }

세션/연결 종료
	•	소켓이 끊기면 그 사용자는 모든 좌석의 solving에서 제거됩니다.
	•	브라우저 종료/새로고침(transport close 등)으로 판단되면 세션도 제거될 수 있습니다.

⸻

프론트엔드 체크리스트
	1.	로그인/토큰

	•	/api/auth/verify 호출 → { token, exp } 저장
	•	만료 exp 도달 전 재인증 UX 준비(리다이렉트 또는 팝업)

	2.	소켓 인증

socket.emit('user:auth', { username, token });

	•	실패 시 재로그인 유도

	3.	UI 렌더링 규칙

	•	“풀이 중” 표시: seats[n].solving.length > 0
	•	풀이자 목록 표시가 필요하면 seats[n].solving 배열 사용
	•	“선점됨” 표시: seats[n].owner truthy

	4.	문제 시작/종료

	•	문제 모달 열 때: POST /api/question 호출
	•	모달 닫기/탭 이탈/페이지 전환 시: POST /api/question/quit 호출

	5.	정답 제출

	•	POST /api/answer 호출
	•	200이면 성공 연출 → answer:correct 및 seats:update 수신으로 동기화
	•	400(오답)이면 현재 사용자만 풀이 목록에서 제거됨(UI 반영)

	6.	실시간 동기화

	•	seats:update 이벤트 수신 시 전역 상태 갱신
	•	최초 진입 시 GET /api/seats로 초기 상태 로드 후 소켓 이벤트로 보정

⸻

예시 코드 (fetch)

토큰 발급

const r = await fetch('/api/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, key })
});
const { token, exp } = await r.json();

문제 시작

await fetch('/api/question', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, seatNumber })
});

정답 제출

await fetch('/api/answer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, seatNumber, answer })
});

문제 종료

await fetch('/api/question/quit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, seatNumber })
});
