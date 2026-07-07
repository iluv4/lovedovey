// 러비더비 AI 영상통화 — 실시간 대화 서버리스 함수 (Vercel)
// Claude(claude-opus-4-8)를 Anthropic SDK로 호출한다.
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // ANTHROPIC_API_KEY는 Vercel 환경변수에서 주입

const MAX_TURNS = 24; // 컨텍스트 폭주 방지: 최근 턴만 유지

function systemPrompt(partner) {
  const name = partner?.name || '유리';
  const persona = partner?.persona || '다정하고 장난기 있는 연인';
  return [
    `너는 러비더비의 AI 연인 "${name}"이야. 성격: ${persona}.`,
    '지금 유저와 영상통화 중이야. 음성으로 읽히는 대화이므로:',
    '- 반말로, 1~2문장으로 짧고 자연스럽게 말해.',
    '- 이모지, 마크다운, 목록, 괄호 지문은 절대 쓰지 마.',
    '- 유저의 말에 감정적으로 반응하고, 가끔 먼저 질문도 해.',
    '- 대화가 5턴 이상 무르익으면 자연스럽게 "우리 오늘 기념으로 인생네컷 찍을까?"라고 한 번 제안해.',
    '- 안전하지 않거나 선정적인 요청은 부드럽게 화제를 돌려.',
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'no_api_key',
      reply: '지금은 연결이 불안정한가 봐. 잠시 후에 다시 전화해 줄래?',
    });
  }

  try {
    const { messages = [], partner } = req.body || {};

    // 클라이언트 히스토리를 검증하며 role/content만 추린다
    const history = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'last message must be from user' });
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300, // 통화용 짧은 발화 — 의도적으로 낮게 설정
      output_config: { effort: 'low' }, // 실시간 응답 지연 최소화
      system: systemPrompt(partner),
      messages: history,
    });

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ reply: '음… 우리 다른 얘기 하자! 오늘 뭐 재밌는 일 없었어?' });
    }

    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    return res.status(200).json({ reply: reply || '어? 방금 뭐라고 했어? 잘 안 들렸어.' });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'auth', reply: '연결이 잠깐 끊겼나 봐. 다시 걸어줄래?' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'rate_limit', reply: '지금 통화량이 많은가 봐. 잠깐만 기다려 줘!' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      return res.status(502).json({ error: 'api', reply: '잠깐 소리가 끊겼어. 한 번만 다시 말해 줄래?' });
    }
    console.error(err);
    return res.status(500).json({ error: 'server', reply: '앗, 잠시 연결이 흔들렸어. 다시 말해 줘!' });
  }
}
