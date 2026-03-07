# 온다 어드민 방막기/방열기 자동화

GAS 메일 파싱 → Render 웹훅 → 온다 어드민 자동 처리

## 아키텍처
```
예약/취소 메일
    ↓
GAS (파싱 + 슬랙 알림)
    ↓ webhook
Render (Node.js)
  - Puppeteer로 로그인 → JWT 토큰 획득
  - GraphQL API로 방막기/방열기
    ↓
슬랙 완료 알림
```

## API 엔드포인트

### POST /close - 방막기
```json
{
  "room": "Lodge Loft A",
  "dates": ["2026-03-10", "2026-03-11"],
  "memo": "예약#12345"
}
```

### POST /open - 방열기
```json
{
  "room": "Lodge Loft A",
  "dates": ["2026-03-10", "2026-03-11"],
  "memo": "취소#12345"
}
```

### GET /rooms - 객실 목록 조회

## 객실명 목록
- Lodge Loft A / B
- Lodge Twin A / B
- Lodge Suite A / B / Family
- Airstream 17ft / 27ft / 31ft / 31ft +
- Cabin A / B

## Render 배포

1. GitHub에 이 코드 push
2. Render에서 새 Web Service 생성
3. 환경변수 설정 (.env.example 참고):
   - `ONDA_EMAIL`: 온다 로그인 이메일
   - `ONDA_PASSWORD`: 온다 로그인 비밀번호
   - `SLACK_WEBHOOK_URL`: 슬랙 웹훅 URL
   - `WEBHOOK_SECRET`: 보안 시크릿 (랜덤 문자열)

## GAS 연동

`gas-webhook-example.js` 참고해서 기존 GAS 코드에 `closeRoom()` / `openRoom()` 호출 추가
