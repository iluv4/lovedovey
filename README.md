# 러비더비 랩 — AI 영상통화 & 인생네컷 PoC 💕

내 AI 연인과 **실시간 음성으로 영상통화**하고, 그 순간을 **인생네컷**으로 남기는 모바일 웹앱.

> Tain AI 과제 PoC · 기획 문서는 [docs/SUBMISSION.md](docs/SUBMISSION.md)

## 구조

```
index.html / styles.css / app.js   # 프론트엔드 (정적)
api/chat.js                        # Vercel 서버리스 — Claude API 실시간 대화
docs/SUBMISSION.md                 # 과제 제출 문서 (유저/기획/PoC/판단)
```

- **AI 영상통화**: 브라우저 STT(ko-KR) → `/api/chat` → Claude(`claude-opus-4-8`) → TTS. 대화는 매 턴 LLM이 실시간 생성.
- **AI 인생네컷**: 셀피 + AI 연인 이미지를 Canvas로 온디바이스 합성 (4컷, 컨셉 4종, 저장/공유).
- **AI 연인 캐릭터**: Higgsfield Soul v2로 생성한 실사풍 이미지 4종.
- **Vercel Analytics**: `/_vercel/insights/script.js` 연동.

## 배포 (Vercel)

1. Vercel 대시보드 → **Add New Project** → GitHub `iluv4/lovedovey` 연결 (Framework: Other, 빌드 명령 없음)
   - 또는 기존 `tain-loveydovey-prototype` 프로젝트의 Git 연결을 이 레포로 교체
2. 환경변수 설정: `ANTHROPIC_API_KEY`
3. 프로젝트 → **Analytics** 탭에서 **Enable** (스크립트는 이미 코드에 포함됨)

키가 없으면 통화는 "연결 불안정" 폴백 멘트로 동작하고, 인생네컷은 키 없이도 완전히 동작합니다.

## 로컬 실행

```bash
npm i -g vercel
ANTHROPIC_API_KEY=sk-... vercel dev
```
