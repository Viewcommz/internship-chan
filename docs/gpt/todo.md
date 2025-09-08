아래 TODO대로 프론트만 정리하면 됩니다. 불필요한 변경 없이 “JWT 기반 바디 토큰 + solving 배열”만 맞춥니다.

프론트 수정 TODO

0) 전역 상태 추가
	•	authToken 유지 + tokenExp(만료 ms), reauthTimer(number | null) 추가.

1) 인증/연결 로직
	•	authenticateAndConnect(username, key):
	•	응답의 { token, exp }를 authToken, tokenExp에 저장.
	•	만료 60초 전 알림/로그아웃 예약:

if (reauthTimer) clearTimeout(reauthTimer);
reauthTimer = setTimeout(() => {
  showError('세션이 곧 만료됩니다. 다시 로그인해주세요.');
  resetToInit();
}, Math.max(0, exp - Date.now() - 60_000));


	•	resetToInit():
	•	reauthTimer 클리어.
	•	아래 4)에서 추가할 quitIfSolving() 호출 후 소켓 종료.

2) 소켓 인증
	•	기존 유지: socket.emit('user:auth', { username, token: authToken });
	•	실패/중복 시 resetToInit() 호출 그대로 유지.

3) 좌석 표시 로직 변경 (solving 배열 대응)
	•	updateSeatsDisplay()에서 조건 변경:
	•	기존: else if (seat.solving) { ... }
	•	변경: else if (Array.isArray(seat.solving) && seat.solving.length > 0) { ... }
	•	필요 시 표시 문구에 카운트 반영:

const count = Array.isArray(seat.solving) ? seat.solving.length : 0;
// '풀이중...' → `풀이중(${count})`



4) 문제 시작/종료 API 바디 수정
	•	question(seatNumber):
	•	요청 바디를 { token: authToken, seatNumber }로 변경. username 전송 제거.
	•	성공 시 currentQuestion = { seatNumber, question: data.question }.
	•	“문제 닫기” 처리 공통 함수 추가:

const quitIfSolving = async () => {
  if (!currentQuestion) return;
  try {
    await fetch(`${API_BASE}/api/question/quit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, seatNumber: currentQuestion.seatNumber })
    });
  } catch (_) { /* 무시 */ }
  currentQuestion = null;
};


	•	closeQuestionModal()에서 quitIfSolving() 호출 후 모달 닫기.
	•	resetToInit() 시작부에서도 await quitIfSolving() 호출.
	•	페이지 이탈 대응(최대한 보장):

window.addEventListener('beforeunload', () => {
  if (currentQuestion && authToken) {
    const payload = JSON.stringify({ token: authToken, seatNumber: currentQuestion.seatNumber });
    navigator.sendBeacon(`${API_BASE}/api/question/quit`, new Blob([payload], { type: 'application/json' }));
  }
});



5) 정답 제출 API 바디 수정
	•	submitAnswer():
	•	요청 바디를 { token: authToken, seatNumber: currentQuestion.seatNumber, answer }로 변경. username 전송 제거.
	•	response.ok면 모달 닫고 성공 토스트. 오답(400)이면 입력 유지 후 선택만(answerInput.select()).

6) 초기 좌석 동기화 + 실시간 반영
	•	진입 시 GET /api/seats로 currentSeats 초기화 후 updateSeatsDisplay().
	•	이후는 seats:update 이벤트로 동기화(현행 유지).

7) UI/UX 자잘한 처리
	•	문제 모달이 열린 상태에서 탭 이탈/ESC:
	•	closeQuestionModal() → 내부에서 quitIfSolving() 실행되므로 별도 처리 불필요.
	•	로그아웃 버튼(resetToInit)도 동일하게 quitIfSolving() 경유.

8) 테스트 시나리오 체크리스트
	1.	사용자 A 토큰 발급 → 좌석1 문제 시작 → 좌석1 카드 “풀이중(1)” 표기.
	2.	사용자 B 토큰 발급 → 좌석1 문제 시작 → “풀이중(2)”로 증가.
	3.	B가 모달 취소 → /api/question/quit 호출 → “풀이중(1)”로 감소.
	4.	A가 오답 제출 → A만 solving 배열에서 제거 → “풀이중(0)”이면 빈자리로 전환.
	5.	B가 정답 제출 → owner 세팅, solving=[] 초기화 → 잠금 표시.
	6.	브라우저 강제 종료(리로드) 시 sendBeacon으로 quit 전송 → solving 감소 확인.
	7.	JWT 만료 60초 전 알림 후 초기화 동작 확인.

9) 변경 포인트 요약(파일: index.html 스크립트)
	•	함수: authenticateAndConnect, connectSocket(변경 없음), updateSeatsDisplay, question, submitAnswer, closeQuestionModal, resetToInit.
	•	전역: let tokenExp = null; let reauthTimer = null; 추가.
	•	신규: quitIfSolving() 추가, beforeunload 핸들러 수정.
