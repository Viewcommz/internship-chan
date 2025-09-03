// 공통 fetch 유틸
export async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text().catch(() => '');

  if (!res.ok) {
    // HTML 에러 페이지가 오더라도 사용자에게는 간단 안내만 노출
    let msg = `요청 실패 (HTTP ${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const j = JSON.parse(text);
        msg = j.error || j.message || msg;
      } catch {
        // JSON 파싱 실패 시 기본 메시지 유지
      }
    }
    throw new Error(msg);
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('서버 응답(JSON) 파싱에 실패했습니다.');
    }
  }

  throw new Error('서버가 JSON이 아닌 응답을 반환했습니다.');
}